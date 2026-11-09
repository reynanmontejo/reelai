# Free API access: APIShort and DramaBos

Checked November 9, 2026. Free allowances and account availability can change.
This guide explains how to obtain a key and fetch catalog metadata with the
adapters currently implemented in ReelAI.

## Current availability

| Service | Advertised free allowance | Access | ReelAI implementation |
| --- | --- | --- | --- |
| APIShort | 100 requests/day | Personal Gmail login, `X-API-Key` | ShortMax catalog, cached catalog search, detail, episodes and dynamic HLS |
| DramaBos | 1,000 requests/month | Bearer key; free signup route inconsistent | Search, detail and episode parsers based on documented examples; live authenticated verification pending |

Sources: [APIShort pricing](https://apishort.com/pricing),
[developer guide](https://apishort.com/guide),
[terms](https://apishort.com/terms),
[DramaBos pricing](https://dramabos.live/pricing/),
[authentication documentation](https://github.com/dramabosapi/dramabos-api/blob/main/docs/authentication.md).

Neither service's catalog is necessarily AI-generated. Imported records do not
receive ReelAI's AI-original label automatically.

## 1. Obtain a free APIShort key

1. Open <https://apishort.com/login>.
2. Sign in yourself using a personal `@gmail.com` account. The site says Google
   Workspace/organization accounts are not accepted.
3. Open <https://apishort.com/dashboard> and copy your API key.
4. Check that the dashboard shows the free plan and your daily allowance.
   No paid subscription is needed for the advertised free plan.
5. Add the key to the project's ignored `.env.local` file:

```dotenv
APISHORT_API_KEY=your_personal_key
REELAI_EXTERNAL_PROVIDERS=apishort-metadata
```

If adapters are already enabled, append `apishort-metadata` to that single
comma-separated setting, for example:

```dotenv
REELAI_EXTERNAL_PROVIDERS=apify-netshort-metadata,apishort-metadata
```

Do not use `NEXT_PUBLIC_` for provider keys or commit `.env.local`.

### Fetch with ReelAI

From the repository directory in PowerShell:

```powershell
npm run provider:catalog -- apishort-metadata
npm run provider:catalog -- apishort-metadata family
```

The command outputs titles, genres, and external IDs. APIShort IDs use the
ShortMax `code`, such as `shortmax:847788`, not its separate `id` field.
Search filters the one cached popular catalog page; it is not a complete
platform-wide search. The live page returned 221 records during verification.

Preview a selected title without database writes:

```powershell
npm run provider:import -- apishort-metadata shortmax:847788 --dry-run
```

Choose an ID from the current catalog output; the example may disappear later.
An authenticated dry run for `shortmax:847788` returned **47 episodes**.
Detail and `alleps` calls now work with a configured key. Episode identity and
numbering come from actual episode records, not the popular catalog's reported
count (which was stale). Catalog normalization discards temporary video/expiry
fields. Playback uses a separate resolver and private in-memory cache.

The client caches normalized catalog/detail/episode metadata for 15 minutes per process and deduplicates
simultaneous requests. Separate CLI invocations start separate processes, so
each invocation can consume another request. An import uses two requests
(detail plus episodes); a catalog listing uses one. There are no automatic retries.
The implementation requests only the first catalog page.

Live verification on November 9, 2026 succeeded through ReelAI's Node client:
catalog search returned 207 unique titles, and the authenticated importer dry
run for `shortmax:847788` succeeded with 47 episodes and no database writes. The
upstream catalog contained repeated codes across sections; normalization now
deduplicates those ranking entries. Subsequent hosted Supabase verification
imported and published one title with 47 episodes and 48 provider references.
A repeated import created no duplicates and preserved its internal UUID.
Guest reads of the published series/episodes succeeded; private provider
references, source definitions and import jobs rejected guest reads.
Explore search, the poster, episode list and local My List persistence were
verified in the browser. A subsequent import added 47 dynamic source definitions
with purpose `both` and no static URLs. HLS play/pause, seeking, saved-position
resume after reload, the episode-2 countdown/navigation, and muted feed playback
were verified in Chrome.

The current hosted catalog is short-drama only: 39 published series and 1,847
episodes, verified with guest/RLS queries on November 9, 2026. The three earlier
film/motion-study collections were unpublished, and their providers were disabled
in local configuration. Their records were retained rather than deleted.
APIShort does not provide verified AI-generation labels, so imported dramas keep
the Short Drama label.

### Import more short dramas within the free allowance

Apply `supabase/migrations/20261109090000_scope_import_source_retirement.sql`
before further batch imports. It fixes an older importer bug that retired
sources from other series of the same provider. The hosted function passed a
two-series isolation check after the fix; 1,823 affected published-episode source
definitions were restored, giving 1,847 active ShortMax sources. IDs and user
state were preserved. The updated empty-project bootstrap includes this fix.

Check your remaining daily requests in the APIShort dashboard first. Imports and
playback share the same allowance; leave a reserve for watching. To import a
bounded batch through the existing adapter and atomic importer:

```powershell
npm run provider:import-shortmax -- --max-requests 40 --max-pages 3 --publish
```

Omit `--publish` to import unpublished records. The importer skips existing
provider references, requests pages sequentially, deduplicates discovered titles,
and stops on an empty/repeated page, the page/request budget, authentication or
quota rejection, a database failure, or three consecutive upstream outages.
It waits at least one second between requests and never retries automatically.
Do not rerun with a budget larger than your remaining allowance minus the playback
reserve. There is no automatic daily job or paid-plan upgrade.

Validated catalog metadata supplies series fields. Each new title uses one
`alleps` call; every supplied episode must have a valid, unexpired HLS source and
the series must include episode 1. Failed titles are skipped. Temporary playback
URLs are checked in memory and discarded; the database stores dynamic source
definitions. Existing IDs, favorites and history are preserved.

The verified batch discovered 289 unique titles across three pages, imported
32 series / 1,670 episodes, skipped seven existing titles and five unavailable or
expired-source titles, and stopped after 40 API requests. Remaining discovered
titles were not attempted. This is not a complete provider-wide import and does
not establish CDN availability for every episode; browser playback was sampled
separately. Search/Explore currently return at most 50 results per request, so add
pagination before growing beyond that visible result limit.

Playback errors now preserve provider quota/timeout/expiry failures instead of
always reporting a missing source. Use Try again on the watch page or a failed
feed reel to reload source resolution without resetting saved progress. Provider
cooldown checks do not extend the cooldown when no upstream request was attempted.

### Dynamic playback

The existing adapter ID `apishort-metadata` is retained so stored mappings stay
valid. Re-import the title with `--publish` to add its dynamic source definitions.
The browser requests playback by internal ReelAI episode UUID. The server fetches
the documented ShortMax `alleps` response with `X-API-Key`, validates the series
code and upstream episode ID, then returns ordered 1080/720/480 HLS candidates.
Only HTTPS `.m3u8` URLs on `akamai-static.shorttv.live` are accepted.

Renditions must have an explicit future expiry. In-memory playback responses
are cached for at most five minutes and never beyond a 60-second expiry safety
margin. Concurrent requests are deduplicated per series, sharing one API call
across its episode list. Resolver HTTP responses use `private, no-store`.
The browser connects directly to the supplied CDN URLs; ReelAI does not proxy
manifests/segments or forward API keys to the media host. If future sources deny
browser access, the player reports the failure rather than bypassing restrictions.

Playback links are temporary. Reloading/reopening an episode resolves current
links, and local history restores its saved position. Automatic renewal during
an uninterrupted tab session beyond the link lifetime is not yet implemented.

### Fetch directly with PowerShell

Set the key for the current PowerShell session using hidden input:

```powershell
$apiShortKey = Read-Host 'APIShort API key' -MaskInput
$apiShortHeaders = @{ 'X-API-Key' = $apiShortKey }
$catalog = Invoke-RestMethod -Uri 'https://apishort.com/v1/shortmax/api/v1/popular?lang=en&page=1' -Headers $apiShortHeaders
$catalog.data | Select-Object code, name, episodes
```

These variables do not update `.env.local`. Commands above use PowerShell 7.
Use the server client for application requests; do not put keys in browser code
or URL query parameters.

The public catalog returned HTTP 200 without a key in a limited live test.
The adapter permits that public request if `APISHORT_API_KEY` is empty, but the
guide requires keys generally. No-key access may stop at any time. If it returns
401/403, obtain the free key; the client does not try alternate hosts or bypasses.
APIShort terms state daily reset is midnight UTC (08:00 in the Philippines).

## 2. Obtain a DramaBos free key, if offered to your account

DramaBos's pricing page currently advertises 1,000 free requests/month. However:

- Its **Start Free** button links to APIShort.
- Its pricing FAQ directs users to its Telegram bot, linked from that page.
- Its GitHub documentation describes registration at
  <https://dramabos.live/register> and a key at <https://dramabos.live/dashboard>.

Those are inconsistent onboarding paths. Try the official signup/dashboard;
if no free option exists, use the contact route linked from its pricing page to
ask whether the advertised free key is actually available. Do not purchase a
plan just to follow this guide. Free DramaBos key issuance has **not** been
verified. An APIShort key must not be assumed to authenticate DramaBos.

If DramaBos issues you a key, add:

```dotenv
DRAMABOS_API_KEY=your_dramabos_key
DRAMABOS_SEARCH_PROVIDER=dramabox
REELAI_EXTERNAL_PROVIDERS=dramabos-metadata,apishort-metadata
```

Find a record, then preview its import using an ID returned by search:

```powershell
npm run provider:catalog -- dramabos-metadata love
npm run provider:import -- dramabos-metadata dramabox:REPLACE_WITH_RESULT_ID --dry-run
```

For a direct authenticated request:

```powershell
$dramaBosKey = Read-Host 'DramaBos API key' -MaskInput
$dramaBosHeaders = @{ Authorization = "Bearer $dramaBosKey" }
Invoke-RestMethod -Uri 'https://dramabos.live/dramabox/api/v1/search?keyword=love' -Headers $dramaBosHeaders
```

DramaBos responses are validated against its published examples. If the live
service has changed its schema or image hosts, the adapter stops with an error.
It creates metadata records and no playback sources. No live authenticated
DramaBos test is possible without a valid key.

## 3. Import into Supabase and view in ReelAI

Catalog CLI and dry runs do not require Supabase. Actual imports do:

1. Start Docker and run `npm run supabase:start`.
2. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
   using your local stack values. Keep the privileged key on the server.
3. Run the selected import without `--dry-run` to create an unpublished draft:

```powershell
npm run provider:import -- apishort-metadata shortmax:847788
```

4. After reviewing the record and its permitted use, add `--publish` to expose
   that title in the public catalog. Imported poster references remain third-party
   artwork; the adapters do not copy it into ReelAI's owned assets.
5. Configure the UI to read the Supabase catalog:

```dotenv
NEXT_PUBLIC_REELAI_CONTENT_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_local_public_key
```

6. Restart `npm run dev`. Published records should appear through the existing
   Supabase provider in Explore/search/series pages. Imports do not change the
   mock catalog; mock mode will keep showing demo titles.

Internal ReelAI UUIDs remain authoritative. These integrations currently do not
serve different playback capabilities. APIShort resolves temporary HLS sources
through the server; DramaBos remains metadata-only. Existing demo playback
remains available in mock mode. Provider API access does not classify titles as
AI-generated or transfer ownership of their media.

## Troubleshooting

| Result | Action |
| --- | --- |
| Provider not enabled | Add its adapter ID to `REELAI_EXTERNAL_PROVIDERS` and restart |
| 401/403 | Check the correct service's key, dashboard plan and header |
| 429 | Wait for the allowance reset; avoid repeatedly invoking the CLI |
| 502/504 or timeout | Upstream unavailable; retry manually later |
| Malformed response | Save no raw tokens/media URLs; report which adapter and endpoint failed |
| Title not found | Select a current `shortmax:<code>` from the catalog command |
| Imported title missing in UI | Check publication and Supabase backend selection |

No account creation, subscription, bulk import, or database reset is performed
automatically by this setup.

# Adding an authorized external provider

ReelAI external adapters are server-only integrations. They do not replace `MockContentProvider` or `SupabaseContentProvider`, and they must never be imported by React Client Components.

## Required approval and integration information

Record all of the following before writing a real adapter:

- Provider name and official website
- Official integration documentation
- Written authorization or applicable license
- Catalog and playback rights
- Whether anonymous guest playback is permitted
- Permitted territories and geographic restrictions
- Official API, feed, SDK, embed, MP4, or HLS endpoints
- Authentication method and credential-rotation process
- Rate limits and retry guidance
- Stable series and episode identifier formats
- Stream-resolution and URL-renewal behavior
- Signed URL lifetime and caching restrictions
- Feed-specific rendition availability
- Poster/banner copying and hotlinking policy
- Attribution requirements
- Authorized upstream, redirect, and embed hostnames
- Known provider limitations and takedown process

If access requires DRM, paywall/login bypass, stolen sessions, CAPTCHA or anti-bot bypass, signature forging, protected-stream decryption, unauthorized private APIs, hotlink bypass, or proxying intended to evade restrictions, mark the provider **unsupported**.

## Architecture

```text
ExternalProviderAdapter
  ├─ catalog metadata → CatalogImporter → atomic Supabase RPC
  └─ stable source definition → server resolver → temporary playback candidates
```

The application continues to use internal ReelAI UUIDs. Provider identifiers live only in provider mappings and private source definitions. Catalog synchronization never depends on a successful playback resolution.

## Adapter checklist

1. Add an adapter under `src/server/providers/external/`.
2. Import `server-only` at the top of every integration module.
3. Declare accurate capabilities and exact upstream/iframe hostname allowlists.
4. Use server-only environment variables for credentials. Never use `NEXT_PUBLIC_`.
5. Use `safeProviderFetch` for authorized upstream HTTP requests so redirects, protocols, DNS targets, cancellation, and timeouts are checked.
6. Normalize series, episodes, assets, capabilities, and source definitions into ReelAI types.
7. Keep external episode identity separate from source/rendition identity.
8. Never put credentials, authorization headers, signed URLs, or full provider responses in source definitions, errors, or logs.
9. Map provider errors to typed operational errors.
10. Register the adapter explicitly and enable it with `REELAI_EXTERNAL_PROVIDERS` only in environments where it is authorized.
11. Add unit tests using mocked upstream responses. Tests must not call a live third-party provider.
12. Run a dry import before publication and verify attribution, imagery, stream purpose, and territory restrictions.

## Import behavior

```powershell
npm run provider:import -- <provider-id> <external-series-id> --dry-run
npm run provider:import -- <provider-id> <external-series-id>
npm run provider:import -- <provider-id> <external-series-id> --publish
```

Imports default to unpublished. Provider I/O completes before the atomic database RPC starts. A provider/external ID advisory lock serializes concurrent imports. Provider IDs are the matching identity; titles and episode numbers are never used to overwrite unrelated records.

Provider-supplied title, alternate title, release year, status, episode title/number, duration, and release date are synchronized. Descriptions, artwork, genres, tags, badges, and editorial ranking are set on initial creation and then preserved for future editorial overrides. Missing provider episodes are unpublished and their definitions are disabled rather than deleted.

## Resolver and caching

The browser sends only an internal episode UUID and `watch` or `feed`. The resolver loads private definitions, checks purpose and priority, obtains a registered adapter, and returns normalized ordered candidates. Temporary URLs are never stored as episode identity.

Dynamic responses use private/no-store caching when expiration is present. Static candidate responses have only a short private cache. A playback candidate must not outlive its expiration safety margin.

The current rate limiter and circuit breaker are single-process MVP implementations. They are suitable for local verification, not a multi-instance production deployment. Select a trusted proxy strategy and a distributed limiter before production deployment.

## Owned demo adapter

`reelai-demo` exercises the same catalog, import, provider-reference, watch/feed, MP4/HLS/embed, and resolution path as a future provider. It is disabled unless explicitly included in:

```text
REELAI_EXTERNAL_PROVIDERS=reelai-demo
```

For local fallback verification, each resolved demo source is followed by an
ordered bundled MP4 mirror. The mirror uses ReelAI's local demo assets and does
not fetch or proxy third-party media.

Set `REELAI_DEMO_FAIL_PRIMARY=1` only during local verification to return a
deliberately missing primary URL and confirm that the player advances to the
bundled mirror. This switch applies only to `reelai-demo`.

Do not use the demo adapter as a silent fallback for a failing production provider.

## Wikimedia Commons AI video adapter

`wikimedia-commons-ai` is an opt-in public-data adapter for a deliberately small
curated collection of three public-domain AI-generated videos. It uses the
documented Wikimedia Commons `videoinfo` API, identifies itself with a descriptive
user agent, rate-limits upstream requests, deduplicates concurrent requests, and
caches metadata in memory for ten minutes. It never crawls Commons or resolves
hidden media endpoints.

The adapter preserves Wikimedia attribution and license provenance in imported
asset metadata. Playback uses normal public WebM derivatives from the exact
`upload.wikimedia.org` allowlist. WebM is modeled as its own native stream type;
it is not mislabeled as MP4. Enable it explicitly with:

```text
REELAI_EXTERNAL_PROVIDERS=wikimedia-commons-ai
```

The collection is an experimental set of independent AI motion studies, not a
licensed serialized drama catalog. Production use should keep monitoring the
source records and license metadata.

## Hugging Face DeepAction adapter

`huggingface-deepaction` exposes one deliberately curated five-episode
collection from `faridlab/deepaction_v1`. The selected RunwayML clips all use
prompt 37 (a person taking a selfie). Before catalog import or playback, the
server verifies through Hugging Face that the dataset remains public, ungated,
enabled, and that its dataset card still states the AI-generated folders are
released under CC BY 4.0.

The adapter permits only the exact `RunwayML/37/[a-e].mp4` paths. It does not
enumerate or mirror the six-gigabyte research dataset. Playback uses stable
Hugging Face resolve URLs, while ReelAI supplies owned collection artwork and
stores dataset attribution alongside imported asset metadata. Enable it with:

```text
REELAI_EXTERNAL_PROVIDERS=huggingface-deepaction
```

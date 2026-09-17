# ReelAI content backends

ReelAI selects one content provider through `NEXT_PUBLIC_REELAI_CONTENT_BACKEND`:

- `mock` uses the bundled deterministic catalog.
- `supabase` uses the public Supabase client and the catalog permitted by RLS.

Supabase mode also requires `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Selecting Supabase without valid
configuration fails closed and renders the application's error state. It never
falls back to mock content.

The publishable key is the only Supabase credential permitted in browser code.
Database passwords, secret keys, and service-role keys must remain server-only
and are not required by the catalog.

## Temporary catalog ordering

Until dedicated editorial fields are introduced:

- Featured is the published series with the lowest positive `trending_rank`,
  with newest `created_at` used as the tie-breaker.
- Trending is ordered by `trending_rank`, then newest `created_at`.
- New releases are ordered by `release_year`, then newest `created_at`, then
  `trending_rank` as a deterministic final tie-breaker.

Genres remain stored in the verified `series.genres` array. The provider reads
only that column to build the filter list, and the catalog search function
filters genres case-insensitively in PostgreSQL.

Guest favorites, likes, watch history, resume positions, and autoplay remain in
local browser storage regardless of the selected catalog backend.

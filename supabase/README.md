# ReelAI Supabase foundation

This directory contains the reproducible Phase 5 database foundation.

## Local setup

1. Install the Supabase CLI and start Docker Desktop.
2. Run `supabase start` from the project root.
3. Run `supabase db reset` to apply migrations and `seed.sql`.
4. Copy `.env.example` to `.env.local` and use the local API URL and publishable key printed by `supabase status`.
5. Set `NEXT_PUBLIC_REELAI_CONTENT_BACKEND=supabase` when you want catalog reads to use Supabase.

The application defaults to `local`, so it remains fully functional when Supabase is unavailable.

## Security model

- Published catalog rows are publicly readable and not publicly writable.
- Only active sources explicitly marked `is_public` are exposed through the Data API.
- Provider references are not exposed to browser roles.
- Favorites, likes, watch history, and preferences require an authenticated user and are restricted to that user's `auth.uid()` by RLS.
- Never put service-role keys or private provider credentials in `NEXT_PUBLIC_*` variables or public stream rows.

The Supabase user-state repository adapters are present but intentionally not selected in the composition root until authentication and local-to-cloud migration are implemented.

## Remote development project

After creating and linking a non-production project:

```text
supabase db push --dry-run
supabase db push
```

Use `--include-seed` only for disposable development or staging projects. Do not seed production.

After linking, generate authoritative database types with:

```text
supabase gen types typescript --linked > src/types/database.generated.ts
```

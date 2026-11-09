# ReelAI

ReelAI is a responsive short-form streaming prototype built with Next.js, React, TypeScript, and Supabase. It supports conventional watch pages and a vertically swipeable reel feed while keeping catalog providers, playback sources, and guest state behind clean service boundaries.

## Features

- Responsive home, explore, search, series, watch, history, and My List experiences
- Universal MP4, WebM, HLS, and authorized-embed player
- Play, pause, seek, volume, playback-speed, fullscreen, and PiP controls where supported
- Local guest persistence for likes, favorites, autoplay, history, and resume position
- Vertical scroll-snap feed with active-reel playback and limited media mounting
- Supabase-backed catalog with a deterministic mock backend for local development
- Internal ReelAI UUIDs separated from external provider identifiers
- Server-only external-provider adapters with hostname allowlists and SSRF protection
- Reproducible Supabase migrations, seed data, RLS policies, and pgTAP coverage

## Architecture

```text
UI
  |
  v
hooks and services
  |
  v
repositories and content providers
  |
  v
mock data, Supabase, or approved external providers
```

React components do not query Supabase or access provider-specific schemas directly. Playback sources are normalized before reaching the shared video player.

## Requirements

- Node.js 20 or newer
- npm
- Docker Desktop and the Supabase CLI for local Supabase mode

## Quick start

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The default `mock` backend works without Supabase. On macOS or Linux, replace the `copy` command with `cp`.

## Content backends

Select the catalog backend in `.env.local`:

```env
NEXT_PUBLIC_REELAI_CONTENT_BACKEND=mock
```

For Supabase mode:

```env
NEXT_PUBLIC_REELAI_CONTENT_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-local-publishable-key
```

Supabase mode fails closed if its configuration or database is unavailable; it never silently falls back to mock content. Guest likes, favorites, history, resume positions, and autoplay remain in browser storage in both modes.

## Local Supabase setup

Start Docker Desktop, then run:

```bash
npm run supabase:start
npm run supabase:reset
```

Use the URL and publishable key shown by `supabase status` in `.env.local`, then start ReelAI normally:

```bash
npm run dev
```

The database includes public catalog access and row-level security for private user state. Authentication and cloud synchronization are intentionally not required for guest browsing and playback.

## External providers

External integrations are server-only and opt-in:

```env
REELAI_EXTERNAL_PROVIDERS=wikimedia-commons-ai,huggingface-deepaction,youtube-embed
```

Included adapters demonstrate the provider architecture with curated public-domain or licensed media. The experimental DramaFren adapter remains disabled by default and is not recommended for production playback until its end-to-end embed behavior is verified. When explicitly enabled, ReelAI adds only its exact approved frame host to the application CSP.

Never place service-role keys, provider credentials, or private API secrets in `NEXT_PUBLIC_*` variables. See [Adding an authorized provider](docs/ADDING_PROVIDER.md) for the integration and security requirements.

The optional `apify-netshort-metadata` adapter can import normalized NetShort
series and episode metadata through a server-only Apify token. It deliberately
creates no playback sources and does not treat the catalog as verified AI
content. Actor calls consume Apify usage credit; see the provider guide before
enabling it.

The optional `dramabos-metadata` adapter uses DramaBos's documented bearer-key
API to normalize search, series, and episode metadata from providers that use
its standard API route shape. It is server-only and deliberately creates no
playback sources: DramaBos states that third-party content belongs to its
respective copyright owners, so playback stays disabled until rights for a
specific catalog are independently verified.

## Provider imports

See [Free API setup](docs/FREE_API_SETUP.md) for APIShort and DramaBos key
instructions, current free-plan limitations, and PowerShell fetch examples.
`apishort-metadata` supports the verified ShortMax popular catalog with cached
search, series detail, episode imports, and dynamic HLS playback. The provider
ID retains its original name for compatibility. Signed rendition URLs are
resolved server-side and never stored in the catalog database.

List selectable external IDs before importing:

```bash
npm run provider:catalog -- apishort-metadata family
npm run provider:catalog -- dramabos-metadata love
```

Preview an import before writing to Supabase:

```bash
npm run provider:import -- <provider-id> <external-series-id> --dry-run
```

Publish an approved import:

```bash
npm run provider:import -- <provider-id> <external-series-id> --publish
```

Preview the curated YouTube AI embed POC without writing to the database:

```bash
npm run provider:import -- youtube-embed youtube:curated-ai-shorts-poc --dry-run
```

## Verification

```bash
npm run lint
npm test
npm run build
npm audit --omit=dev
npm run test:secrets
npm run supabase:lint
npm run supabase:test
```

End-to-end playback tests are available with:

```bash
npm run test:e2e
```

## Project structure

```text
src/
|-- app/           Next.js routes and API handlers
|-- components/    UI and reusable player components
|-- hooks/         Application-facing React hooks
|-- providers/     Mock and Supabase content providers
|-- repositories/  Persistence and data-access boundaries
|-- server/        Imports, external adapters, security, and stream resolution
|-- services/      Application use cases and recommendation logic
`-- types/         Provider-independent domain models

supabase/
|-- migrations/    Reproducible schema and policy changes
|-- tests/         pgTAP database and RLS tests
`-- seed.sql       Deterministic local catalog
```

Additional backend details are documented in [Content backends](docs/content-backends.md) and [Supabase setup](supabase/README.md).

## Current scope

ReelAI is a development prototype. Authentication UI, production deployment, payments, comments, creator uploads, and unrestricted third-party scraping are outside the current scope. Only media that ReelAI owns, is licensed to use, or is available through an explicitly authorized integration should be published.

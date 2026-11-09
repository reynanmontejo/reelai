# Add Supabase keys to ReelAI manually

You need three values from the same Supabase project: the Project URL, a
publishable key, and a server secret key. You do not need Docker for hosted
Supabase, and you do not need to share these values in chat.

## 1. Open the correct project

Use Chrome's Monteo profile and open:

<https://supabase.com/dashboard/project/jxrtjhdkhtlwosfshhja>

Wait until the project overview loads and confirm it is your intended ReelAI
project. If you see "You do not have access to this project", switch Supabase
accounts or use the correct project reference before copying any keys.

## 2. Copy the Project URL

Click **Connect** near the top of the project dashboard. Select an application
framework if prompted and find the **Project URL**. Copy the HTTPS URL,
not a PostgreSQL connection string or dashboard URL.

For the reference above it normally looks like:

```text
https://jxrtjhdkhtlwosfshhja.supabase.co
```

Confirm the actual value shown by your project.

## 3. Copy the publishable key

Open **Project Settings → API Keys → Publishable and secret API keys**.

Copy the existing publishable key, usually beginning with `sb_publishable_`.
The Connect dialog may also show it. If the project only has legacy keys,
follow the dashboard option to create the new API keys first.

## 4. Copy the server secret key

In the same API Keys screen, copy the existing secret key, usually beginning
with `sb_secret_`. Reveal it only when needed and paste it directly into the
local file below. If your role cannot view the key, use a project owner account
or ask the project owner to configure the local file.

Keep the secret key private. It gives privileged database access and bypasses
Row Level Security. Do not paste it into chat, a screenshot, GitHub, or a
`NEXT_PUBLIC_` variable.

## 5. Edit .env.local

Open this file in your editor:

```text
D:\reynan-projects\ai reels web\.env.local
```

Add or update these four entries, replacing the placeholders:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://jxrtjhdkhtlwosfshhja.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=PASTE_PUBLISHABLE_KEY_HERE
SUPABASE_URL=https://jxrtjhdkhtlwosfshhja.supabase.co
SUPABASE_SERVICE_ROLE_KEY=PASTE_SERVER_SECRET_KEY_HERE
```

The same Project URL appears twice. ReelAI currently calls its backend
credential setting `SUPABASE_SERVICE_ROLE_KEY`; use that exact variable name
even when the credential you copied is a modern `sb_secret_` key. It is passed
to Supabase's JavaScript client only on the server. A legacy `service_role`
credential can also be used if your existing project still provides one.

Preserve `APISHORT_API_KEY`, `REELAI_EXTERNAL_PROVIDERS`, and other existing
settings. Update existing entries rather than creating duplicates. Do not put
spaces around `=`. Save the file with Ctrl+S. `.env.local` is already ignored
by Git.

Keep this setting for now:

```dotenv
NEXT_PUBLIC_REELAI_CONTENT_BACKEND=mock
```

Adding credentials does not create database tables. We will switch this to
`supabase` after inspecting the database, applying the required migrations, and
importing the test title. This keeps the current demo usable during setup.

## 6. Continue verification

Tell Codex: **"Supabase values saved in .env.local; verify and continue."**

Codex can check that values are present without displaying them, test project
access, and continue the import. Hosted schema migrations may also need a
working Supabase MCP connection or an authenticated CLI/database connection;
API keys alone are not SQL migration credentials. Restart the development
server after configuration changes to use the updated environment.

Official reference, checked November 9, 2026:
[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

# Database — Supabase setup

Cloud accounts, meta-progression sync, and leaderboards run on
[Supabase](https://supabase.com) (Postgres + auth). The game is fully playable
without any of this — when the env vars below are absent, the app silently
stays in local-only mode (localStorage), exactly as before Phase 5.

## One-time setup

1. **Create a Supabase project** (free tier is plenty): supabase.com → New
   project. Note the project's **URL** and **anon (publishable) key** from
   Settings → API.

2. **Apply the schema**: open the SQL Editor in the Supabase dashboard, paste
   the contents of [`schema.sql`](./schema.sql), and run it. It is idempotent —
   re-run it any time it changes.

3. **Enable Google sign-in** (the only sign-in method):
   1. In [Google Cloud Console](https://console.cloud.google.com), create a
      project → APIs & Services → Credentials → Create OAuth client ID
      (type: Web application).
   2. Add your Supabase callback URL to **Authorized redirect URIs**:
      `https://<project-ref>.supabase.co/auth/v1/callback`
   3. In Supabase: Authentication → Providers → Google → enable, paste the
      Google client ID and secret.
   4. In Supabase: Authentication → URL Configuration → add your site URLs to
      **Redirect URLs**: `http://localhost:5173/**` for dev and
      `https://<user>.github.io/<repo>/**` for the deployed site.

4. **Give the web app the keys** via Vite env vars:
   - Local dev: copy `apps/web/.env.example` to `apps/web/.env.local` and fill
     in the values.
   - Deploys: add repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`
     (Settings → Secrets and variables → Actions). The deploy workflow passes
     them into the build.

The anon key is public by design — safety comes from the row-level-security
policies in `schema.sql` (users can only write their own rows; reads of
leaderboard data are public).

## What the client does

- **Signed out**: nothing. No network calls, localStorage only.
- **On sign-in**: fetches cloud `meta_progress`, merges it with local progress
  (`mergeMetaProgress`: max of counters, union of badges), and writes the
  merged result to both sides — so progress earned as a guest is never lost.
- **On run finish (signed in)**: inserts a row into `runs` (seed, ascension,
  wins/losses, dataset version — enough to re-verify the run later) and
  upserts `meta_progress`.
- **Leaderboard**: reads the `leaderboard` view (top runs by wins, then
  ascension).

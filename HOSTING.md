# Hosting VidShare without Replit

This app is a Node.js server (`server.js`) plus static HTML. Show pages, uploads, watch links, folders, and magic-code login all run from that one process. You do not need Replit or Netlify to host it.

Your other sites (including [jonmobley.com](https://github.com/jonmobley/jonmobley)) sit on Cloudflare. Use Cloudflare in front of this app the same way: either DNS/SSL in front of Docker, or Cloudflare Containers.

## What to copy off Replit

1. Postgres: set `DATABASE_URL` to your existing Supabase (or other Postgres) connection string. The server creates/upgrades its own tables on boot.
2. Resend: create an API key at [resend.com](https://resend.com) and set `RESEND_API_KEY` plus `RESEND_FROM_EMAIL`. Magic-code login no longer reads Replit connectors.
3. Tokens and origins: `ADMIN_TOKEN`, `ALLOWED_ORIGIN`, `PUBLIC_ORIGIN`.
4. Optional Supabase extras: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Copy `env.example` to `.env` and fill these in. Never commit `.env`.

## Run it

```bash
cp env.example .env
# edit .env
npm install
npm start
```

The server listens on `PORT` (default `5000`). `GET /health` returns `{"ok":true}`.

Session cookies are `Secure` when `NODE_ENV=production`. For local HTTP, leave `NODE_ENV` unset or set `COOKIE_SECURE=false`.

## Docker

```bash
cp env.example .env
docker compose up --build
```

Point a hostname at the host and put Cloudflare in front (orange-cloud proxy, SSL/TLS Full or Full strict).

Production today is [vidsharepro.netlify.app](https://vidsharepro.netlify.app): show pages and `/.netlify/functions/*` already work there. Uploads, watch streaming, folders, and magic-code login are Express routes (`/api/*`, `/health`) and 404 on Netlify until this Node origin is live. Do not wire those upload URLs to Netlify Blobs — finalize never writes `vs_uploads`, so watch links would lie.

For a laptop/VPS trial with bundled Postgres:

```bash
docker compose --profile local-db up --build
```

Then open `http://localhost:5000`. Session cookies stay non-Secure on HTTP; behind Cloudflare they pick up `req.secure`. For production, omit the profile and set `DATABASE_URL` in `.env` to your existing Supabase/Postgres URL.

Set:

```
PUBLIC_ORIGIN=https://your.domain
ALLOWED_ORIGIN=https://your.domain
COOKIE_SECURE=true
NODE_ENV=production
```

## Cloudflare Containers

This repo includes `wrangler.jsonc`, `workers/origin.js`, and the Dockerfile so the same image can run as a [Cloudflare Container](https://developers.cloudflare.com/containers/) behind a Worker — the Node equivalent of shipping a site on Cloudflare Pages.

The container defaults to the `basic` instance type (1 GiB). Native uploads live in Postgres, not container disk.

```bash
npm install
npx wrangler login
npx wrangler deploy
# required:
npx wrangler secret put DATABASE_URL
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put ALLOWED_ORIGIN
npx wrangler secret put PUBLIC_ORIGIN
# recommended:
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL
# optional:
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Or copy `env.example` into GitHub Actions secrets (names below) and let CI run `node scripts/push-worker-secrets.js` after deploy.

Then attach a custom domain on the Worker. Keep `PUBLIC_ORIGIN` and `ALLOWED_ORIGIN` on that HTTPS origin.

Do **not** import this repository as a Cloudflare Pages project with publish directory `.`. That would upload source files (`server.js`, `lib/`, SQL). Pages also cannot run the upload/watch API.

## GitHub Actions

Pushing to `main` runs Jest and builds the Docker image. If `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set as repo secrets, the workflow also runs `wrangler deploy` and then pushes Worker secrets from matching GitHub secrets.

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Required |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Yes (Workers + Containers edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Yes |
| `DATABASE_URL` | Yes (deploy writes the Worker secret) |
| `ADMIN_TOKEN` | Yes |
| `ALLOWED_ORIGIN` | Yes (your HTTPS origin, no trailing slash) |
| `PUBLIC_ORIGIN` | Yes (same origin) |
| `RESEND_API_KEY` | For magic-code email |
| `RESEND_FROM_EMAIL` | For magic-code email |
| `SESSION_SECRET` | Optional |
| `JWT_SECRET` | Optional |
| `SUPABASE_URL` | Optional |
| `SUPABASE_ANON_KEY` | Optional |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional |
| `ALLOW_ANONYMOUS_UPLOADS` | Optional |
| `WISTIA_API_PASSWORD` | Optional |

After the secrets exist, either push to `main` or run **Actions → CI → Run workflow**. Empty optional secrets are skipped; missing required Worker secrets fail that step.

Until Cloudflare credentials are present, push CI stays green and prints a notice that deploy was skipped. **Run workflow** fails instead, so a manual cutover attempt is obvious.

## Netlify

`netlify.toml` and `netlify/functions` still work if you want to keep that path. The Node server already mounts the show-page functions at `/.netlify/functions/*`, so a single `npm start` origin is enough for oz/seussical/disc/vertical editors.

## Required environment variables

| Name | Used for |
| --- | --- |
| `DATABASE_URL` | Postgres (uploads, accounts, show-page CMS) |
| `RESEND_API_KEY` | Magic-code emails |
| `RESEND_FROM_EMAIL` | From address (must be a verified Resend domain) |
| `ADMIN_TOKEN` | `/admin` API |
| `ALLOWED_ORIGIN` | CORS for editor writes |
| `PUBLIC_ORIGIN` | Page-editor setup links |
| `COOKIE_SECURE` | Override Secure cookie flag (`true`/`false`) |

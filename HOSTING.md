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

For a laptop/VPS trial with bundled Postgres:

```bash
docker compose --profile local-db up --build
```

Then open `http://localhost:5000`. Session cookies stay non-Secure on HTTP; behind Cloudflare they pick up `req.secure`. For production, omit the profile and set `DATABASE_URL` in `.env` to your existing Supabase/Postgres URL.

Set:

```
PUBLIC_ORIGIN=https://vidshare.link
ALLOWED_ORIGIN=https://vidshare.link
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
npx wrangler secret put SEUSSICAL_EDITOR_TOKEN
# optional:
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Or copy `env.example` into GitHub Actions secrets (names below). CI writes them into the Worker with `wrangler deploy --secrets-file` so the container boots with `DATABASE_URL` already set.

The first deploy attaches Custom Domains `vidshare.link` and `www.vidshare.link` (www redirects to the apex). Keep GitHub secrets `PUBLIC_ORIGIN` and `ALLOWED_ORIGIN` at `https://vidshare.link`.

Do **not** import this repository as a Cloudflare Pages project with publish directory `.`. That would upload source files (`server.js`, `lib/`, SQL). Pages also cannot run the upload/watch API.

## GitHub Actions

Pushing to `main` runs Jest and builds the Docker image. If `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set as repo secrets, the workflow deploys the Worker and uploads matching GitHub secrets in the same `wrangler deploy` so new containers start with them.

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Required |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Yes (Workers + Containers edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Yes |
| `DATABASE_URL` | Yes (deploy writes the Worker secret) |
| `ADMIN_TOKEN` | Yes |
| `ALLOWED_ORIGIN` | Yes (`https://vidshare.link`, no trailing slash) |
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
| `SEUSSICAL_EDITOR_TOKEN` | Seussical footer Login password |
| `BUNNY_STREAM_LIBRARY_ID` | Show-page video uploads (Bunny Stream library id) |
| `BUNNY_STREAM_API_KEY` | Show-page video uploads (that library's Stream API key) |
| `BUNNY_STREAM_CDN_HOSTNAME` | Bunny pull zone for thumbnails, e.g. `vz-abc123-def.b-cdn.net` |

After the secrets exist, either push to `main` or run **Actions → CI → Run workflow**. Empty optional secrets are skipped; missing required Worker secrets fail that step.

Until Cloudflare credentials are present, push CI stays green and prints a notice that deploy was skipped. **Run workflow** fails instead, so a manual cutover attempt is obvious.

## Leave Netlify

This repo no longer includes a Netlify site. After the Cloudflare Worker hostname is live (`GET /health` returns `{"ok":true}`):

1. Confirm `GET https://vidshare.link/health` is `{"ok":true}`.
2. Keep `PUBLIC_ORIGIN` and `ALLOWED_ORIGIN` at `https://vidshare.link` and re-run CI if you had to change them.
3. Re-upload Coming Soon / share images in the page editor (old Netlify Blob URLs will 404).
4. Delete the `vidsharepro` site in Netlify so it cannot keep serving a stale copy.

## Required environment variables

| Name | Used for |
| --- | --- |
| `DATABASE_URL` | Postgres (uploads, accounts, show-page CMS) |
| `RESEND_API_KEY` | Magic-code emails |
| `RESEND_FROM_EMAIL` | From address (must be a verified Resend domain) |
| `ADMIN_TOKEN` | `/admin` API |
| `SEUSSICAL_EDITOR_TOKEN` | Seussical footer Login |
| `ALLOWED_ORIGIN` | CORS for editor writes |
| `PUBLIC_ORIGIN` | Page-editor setup links |
| `COOKIE_SECURE` | Override Secure cookie flag (`true`/`false`) |
| `BUNNY_STREAM_LIBRARY_ID` | Bunny Stream library that show-page uploads land in |
| `BUNNY_STREAM_API_KEY` | Stream API key for that library (signs browser uploads; never sent to clients) |
| `BUNNY_STREAM_CDN_HOSTNAME` | Pull zone hostname for thumbnails / previews |

## Bunny Stream (show-page videos)

Show pages (`/seussical`, `/oz`, `/show/<slug>`) no longer take Wistia links. In edit mode, **Add Video** picks a file and streams it straight from the browser to Bunny Stream over TUS; the server only creates the video object and signs the upload, then stores the Bunny video id, embed URL, thumbnail URL and clip length on save. Videos removed from a page are deleted from the Bunny library when the page is saved.

Setup in the Bunny dashboard: Stream → your video library → **API** gives the library id and API key; **Embed**/**Player** shows the pull zone hostname (`vz-….b-cdn.net`). Existing rows that still hold Wistia ids keep playing through Wistia until they are replaced.

# Hosting VidShare

This app is a Node.js server (`server.js`) plus static HTML. Show pages, uploads, watch links, folders, and magic-code login all run from that one process.

Production is **[https://vidshare.co](https://vidshare.co)** on Cloudflare Containers. `www.vidshare.co` 301s to the apex. Do not host this as Cloudflare Pages or Netlify — those cannot run the upload/watch API.

## Production domain

`wrangler.jsonc` binds the Worker to `vidshare.co` and `www.vidshare.co`. Cloudflare Custom Domains only work on a zone whose nameservers Cloudflare manages.

Today the domain still uses Netlify DNS (`dns*.p09.nsone.net`). Cut over once, in this order:

1. In the Cloudflare dashboard, **Add a site** for `vidshare.co` on the same account as [jonmobley.com](https://github.com/jonmobley/jonmobley).
2. At the registrar, replace Netlify/NS1 nameservers with the two Cloudflare nameservers shown for that zone. Do not change records inside Netlify — the registrar is the source of truth.
3. Put GitHub Actions secrets in place (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL`, `ADMIN_TOKEN`, plus Resend if you use magic-code login).
4. Merge to `main` (or **Actions → CI → Run workflow**). Wrangler attaches the custom domains and deploys the container.
5. Confirm `GET https://vidshare.co/health` returns `{"ok":true}` and that `/oz`, `/upload`, and `/watch` load.
6. Delete the `vidsharepro` Netlify site so it cannot keep serving a stale copy.

`PUBLIC_ORIGIN` and `ALLOWED_ORIGIN` are Worker vars set to `https://vidshare.co`. You do not need GitHub secrets for those unless you want to override them.

Until Cloudflare credentials exist, push CI stays green and prints a notice that deploy was skipped. **Run workflow** fails instead, so a manual cutover attempt is obvious.

If deploy errors with a missing zone or existing CNAME, the nameserver move in steps 1–2 is not finished yet.

## What to copy off Replit

1. Postgres: set `DATABASE_URL` to your existing Supabase (or other Postgres) connection string. The server creates/upgrades its own tables on boot.
2. Resend: create an API key at [resend.com](https://resend.com) and set `RESEND_API_KEY` plus `RESEND_FROM_EMAIL`. Verify `vidshare.co` in Resend for magic-code mail.
3. Token: `ADMIN_TOKEN`.
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

For a laptop/VPS trial with bundled Postgres:

```bash
docker compose --profile local-db up --build
```

Then open `http://localhost:5000`. Session cookies stay non-Secure on HTTP; behind Cloudflare they pick up `req.secure`. For production, omit the profile and set `DATABASE_URL` in `.env` to your existing Supabase/Postgres URL.

```
PUBLIC_ORIGIN=https://vidshare.co
ALLOWED_ORIGIN=https://vidshare.co
COOKIE_SECURE=true
NODE_ENV=production
```

## Cloudflare Containers

This repo includes `wrangler.jsonc`, `workers/origin.js`, and the Dockerfile so the same image can run as a [Cloudflare Container](https://developers.cloudflare.com/containers/) behind a Worker.

The container defaults to the `basic` instance type (1 GiB). Native uploads live in Postgres, not container disk.

```bash
npm install
npx wrangler login
npx wrangler deploy
npx wrangler secret put DATABASE_URL
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL
```

Or copy `env.example` into GitHub Actions secrets (names below). CI writes them into the Worker with `wrangler deploy --secrets-file` so the container boots with `DATABASE_URL` already set.

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
| `RESEND_API_KEY` | For magic-code email |
| `RESEND_FROM_EMAIL` | For magic-code email (`VidShare <login@vidshare.co>`) |
| `PUBLIC_ORIGIN` | Optional override (defaults to `https://vidshare.co`) |
| `ALLOWED_ORIGIN` | Optional override (defaults to `https://vidshare.co`) |
| `SESSION_SECRET` | Optional |
| `JWT_SECRET` | Optional |
| `SUPABASE_URL` | Optional |
| `SUPABASE_ANON_KEY` | Optional |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional |
| `ALLOW_ANONYMOUS_UPLOADS` | Optional |
| `WISTIA_API_PASSWORD` | Optional |

After the secrets exist, either push to `main` or run **Actions → CI → Run workflow**. Empty optional secrets are skipped; missing required Worker secrets fail that step.

After the first Cloudflare deploy, re-upload Coming Soon / share images in the page editor (old Netlify Blob URLs will 404).

## Required environment variables

| Name | Used for |
| --- | --- |
| `DATABASE_URL` | Postgres (uploads, accounts, show-page CMS) |
| `RESEND_API_KEY` | Magic-code emails |
| `RESEND_FROM_EMAIL` | From address (must be a verified Resend domain) |
| `ADMIN_TOKEN` | `/admin` API |
| `ALLOWED_ORIGIN` | CORS for editor writes (defaults to `https://vidshare.co` on the Worker) |
| `PUBLIC_ORIGIN` | Page-editor setup links (defaults to `https://vidshare.co` on the Worker) |
| `COOKIE_SECURE` | Override Secure cookie flag (`true`/`false`) |

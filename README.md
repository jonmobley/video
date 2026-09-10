# VidShare Dance Hub

Mobile-first video sharing for theater groups: show pages backed by Bunny Stream uploads, plus native uploads, watch links, and folders.

## Run locally

```bash
cp env.example .env
# fill DATABASE_URL, RESEND_API_KEY, RESEND_FROM_EMAIL, ADMIN_TOKEN, PUBLIC_ORIGIN
npm install
npm start
```

Open `http://localhost:5000`. Production is [https://vidshare.link](https://vidshare.link). See [HOSTING.md](HOSTING.md) to deploy on Cloudflare Containers. Cloudflare CI deploy needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL`, `ADMIN_TOKEN`, `PUBLIC_ORIGIN`, and `ALLOWED_ORIGIN` as GitHub Actions secrets (`PUBLIC_ORIGIN` / `ALLOWED_ORIGIN` must be `https://vidshare.link`).

## Features

- Mobile-optimized show pages with landscape fullscreen
- Dance-focused categories (Ballet, Jazz, Contemporary, Tap, etc.)
- Show-page editors upload videos straight to your Bunny Stream library (set `BUNNY_STREAM_*`; see [HOSTING.md](HOSTING.md))
- YouTube, Vimeo, and native uploaded video for watch links; legacy Wistia rows still play
- Page editors per production (oz, seussical, disc, vertical)
- Chunked uploads, watch pages, folders, magic-code accounts

## Security

Admin and page-editor writes require tokens. See [SECURITY.md](SECURITY.md) for:

- Page-editor and admin authentication
- XSS prevention
- Environment variable configuration

Apply `lock-page-config-secrets.sql` on production Postgres if you have not already.

## Layout

```
server.js                 # Express app (static files + APIs)
lib/                      # Postgres helpers, Resend, page-editor auth
js/, styles/, assets/     # Browser UI
oz.html / disc.html / …   # Show pages
handlers/                 # Show-page CMS (mounted on Express at /api/*)
workers/origin.js         # Cloudflare Worker that fronts the container
Dockerfile                # Production image
```

## Tests

```bash
npm test
```

# VidShare Dance Hub

Mobile-first video sharing for theater groups: Wistia/YouTube/Vimeo show pages plus native uploads, watch links, and folders.

## Run locally

```bash
cp env.example .env
# fill DATABASE_URL, RESEND_API_KEY, RESEND_FROM_EMAIL, ADMIN_TOKEN, PUBLIC_ORIGIN
npm install
npm start
```

Open `http://localhost:5000`. See [HOSTING.md](HOSTING.md) to deploy on Docker or Cloudflare (this app is no longer tied to Replit). Cloudflare CI deploy needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL`, `ADMIN_TOKEN`, `PUBLIC_ORIGIN`, and `ALLOWED_ORIGIN` as GitHub Actions secrets.

## Features

- Mobile-optimized show pages with landscape fullscreen
- Dance-focused categories (Ballet, Jazz, Contemporary, Tap, etc.)
- Wistia, YouTube, Vimeo, and native uploaded video
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

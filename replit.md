# Ops notes

This app is hosted as a Node server, not on Replit. See [HOSTING.md](HOSTING.md).

## Environment

- `DATABASE_URL` — PostgreSQL (Supabase or any Postgres)
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_TOKEN` — `/admin` API
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — magic-code email
- `SESSION_SECRET` — optional; otherwise stored in `vs_meta`
- `ALLOW_ANONYMOUS_UPLOADS` — defaults to off
- `ALLOWED_ORIGIN` / `PUBLIC_ORIGIN`

## Stack

- Frontend: static HTML, CSS, JavaScript
- Backend: Express (`server.js`). Show-page CMS handlers in `handlers/` are mounted at `/api/*`
- Database: PostgreSQL via `pg`

## Product

Show pages, native uploads, watch links, folders, and page editors. Route and schema details live in `server.js` and `complete-supabase-schema.sql`.

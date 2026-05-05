# VidShare Dance Hub

VidShare Dance Hub is a mobile-first video sharing platform for theater groups to distribute dance instruction and training videos to cast members.

## Run & Operate

**Environment Variables:**
- `DATABASE_URL`: Connection string for PostgreSQL (Supabase or Replit).
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_ANON_KEY`: Supabase public anon key.
- `JWT_SECRET`: Secret for signing JWTs.
- `ADMIN_TOKEN`: Token for administrative API access.
- `WISTIA_API_PASSWORD`: Wistia API password for integrations.
- `NETLIFY_BLOBS_TOKEN`: Token for Netlify Blobs storage.
- `RESEND_API_KEY`: API key for Resend email service.
- `SESSION_SECRET`: Secret for signing HttpOnly session cookies.
- `ALLOW_ANONYMOUS_UPLOADS`: Set to `true` to enable anonymous video uploads (defaults to `false`).

## Stack

- **Frontend:** Static HTML, CSS, JavaScript (mobile-first, responsive design).
- **Backend:** Node.js, Netlify Functions (serverless), Express.js (for video upload/serving).
- **Database:** PostgreSQL (Supabase or Replit PostgreSQL).
- **ORM:** `pg` module for PostgreSQL interaction.
- **Validation:** Custom server-side validation and sanitization (`js/sanitize.js`).
- **Build Tool:** _Populate as you build_

## Where things live

- **Frontend Pages:** `index.html`, `oz.html`, `disc.html`, `vertical.html`, `dropbox.html`, `upload.html`, `watch.html`, `login.html`, `account.html`, `admin.html`.
- **Global Styles:** `styles/common.css`, `styles/gallery-mobile.css`.
- **Page-specific Styles:** `styles/*.css` (e.g., `styles/login.css`).
- **Client-side Logic:** `js/*.js` (e.g., `js/oz-app.js`, `js/shared-url-utils.js`).
- **Serverless Functions:** `netlify/functions/*.js`.
- **API Endpoints:** `api/*.js` (e.g., `api/auth.js`, `api/my-videos.js`).
- **DB Schema:** Handled implicitly by Supabase/Replit PostgreSQL tables (`vs_uploads`, `vs_upload_chunks`, `vs_users`, `vs_meta`, `vs_auth_codes`, `vs_rate_limits`).

## Architecture decisions

- **Decoupled Frontend/Backend:** Static frontend for performance and scalability, serverless backend for dynamic content and APIs.
- **Multi-platform Video Support:** Designed to integrate Wistia, YouTube, Vimeo, Dailymotion, Loom, and native uploads, providing flexibility in video sourcing.
- **Passwordless Authentication:** Uses emailed magic codes for user login, enhancing user experience and security.
- **Database-backed Rate Limiting:** Implements robust brute-force and rate-limiting protection on critical endpoints using PostgreSQL, ensuring system stability.
- **Strict Content Security Policy (CSP):** Employs a comprehensive CSP with `report-to` and `report-uri` to mitigate XSS and other content injection attacks.

## Product

- **Video Pages:** Themed, production-specific video content with Wistia integration and multi-platform embed support.
- **Content Management:** Admin tools for managing videos, categories (songs), and tags (audiences).
- **User Accounts:** Optional user registration for managing personal uploads, including a paid tier for non-expiring videos.
- **Video Upload & Sharing:** Dedicated `/upload` page with chunked uploads, progress tracking, share links, QR code generation, and optional password protection.
- **Watch Page:** Displays video, title, expiry countdown, view count, mobile share sheet, and dynamic server-side OG meta tags for rich link previews.
- **Admin Page (`/admin`):** Provides statistics, video, and user management (including tier changes) with tabbed navigation, URL-persisted filter state, server-side pagination, search, and filtering capabilities.

## User preferences

## Collections (multi-video shared pages)
Signed-in users can upload 2+ videos at once and share them as a single page at `/c/:slug` (12-char hex slug). Backed by `vs_collections (slug PK, user_id FK CASCADE, title, created_at)` plus `vs_uploads.collection_id` (FK SET NULL) + `collection_order INTEGER` columns in Replit Postgres. Endpoints (Express, see `server.js`):
- `POST /api/collections` (auth) — create empty collection, returns `{slug,title}`
- `GET /api/collections/:slug` — public read incl. `isOwner`, video list (excludes expired)
- `PATCH /api/collections/:slug` (auth, owner) — rename
- `DELETE /api/collections/:slug` (auth, owner) — delete page (videos preserved via SET NULL)
- `POST /api/collections/:slug/videos` (auth, owner of both) — attach existing video
- `DELETE /api/collections/:slug/videos/:videoId` (auth, owner) — detach
- `GET /api/my-collections` (auth) — list user's collections w/ video counts
- `GET /api/video/:id/download` — single-video download with Content-Disposition attachment (rejects non-`upload` platforms; respects expiry/password via `?pt=`)
- `GET /api/collections/:slug/download` — streams a zip via `archiver` (store-only, level 0); skips password-protected/expired/non-upload videos; hard caps at 10 videos / 2 GB

The page route `GET /c/:slug` is registered in `server.js` BEFORE the static middleware and injects OG meta tags into `collection.html` mirroring the `/watch` pattern. Frontend: `collection.html` + `js/collection-app.js` + `styles/collection.css` (gallery grid, owner-only Rename/Delete/Remove, "Download all (zip)" button). The upload widget (`js/upload-widget.js`) auto-switches to "collection mode" when 2+ files are selected — relabels the title field to "Collection title", lists files inline, requires sign-in, sequentially uploads each file via the existing chunked endpoints, then attaches them to a freshly-created collection. The watch page (`js/watch-app.js`) shows a Download button when `platform === 'upload'`. New npm dep: `archiver`.

## User Preferences
None documented yet - this is a fresh import.

## Gotchas

- **Wistia Inline Styles:** The CSP's `style-src` retains `'unsafe-inline'` due to Wistia's third-party embed script programmatically injecting inline styles.
- **Anonymous Uploads:** Video upload endpoints require authentication by default. Set `ALLOW_ANONYMOUS_UPLOADS=true` to re-enable anonymous uploads.
- **Supabase/PostgreSQL Dependency:** Many dynamic features, especially video uploads and user management, depend on a configured Supabase or Replit PostgreSQL database. Hardcoded videos are a fallback only.
- **Rate Limiting:** Critical API endpoints are rate-limited. Exceeding limits will result in a 429 response with a `Retry-After` header.

## Pointers

- **Wistia API Documentation:** [https://wistia.com/support/developers](https://wistia.com/support/developers)
- **Netlify Functions Documentation:** [https://docs.netlify.com/functions/overview/](https://docs.netlify.com/functions/overview/)
- **Supabase Documentation:** [https://supabase.com/docs](https://supabase.com/docs)
- **Node.js `pg` module:** [https://node-postgres.com/](https://node-postgres.com/)
- **Resend API Documentation:** [https://resend.com/docs](https://resend.com/docs)
- **Express.js Documentation:** [https://expressjs.com/](https://expressjs.com/)
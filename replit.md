# VidShare Dance Hub - Replit Project

## Overview

VidShare Dance Hub is a mobile-first video sharing platform designed for theater groups to share dance instruction and training videos with cast members. It offers dedicated video pages for different productions (e.g., Wizard of Oz, DISC Heroes), integrates with Wistia for professional video hosting, and is optimized for mobile viewing with automatic landscape fullscreen. The platform is built with a static frontend (HTML/CSS/JavaScript) and a serverless Node.js backend utilizing Netlify Functions, with optional Supabase integration for dynamic content. It includes robust security features like token-based authentication and XSS prevention, making it production-ready for deployment.

The project aims to simplify video distribution for theater companies, providing a secure and accessible way for cast members to access training materials on any device.

## User Preferences

None documented yet - this is a fresh import.

## System Architecture

The application's architecture separates frontend and backend concerns.

### Frontend
- **Pages**: Static HTML files (`index.html`, `oz.html`, `disc.html`, `vertical.html`, `dropbox.html`, `upload.html`, `watch.html`, `login.html`, `account.html`, `admin.html`) form the core user interface.
- **Styling**: Global CSS is managed in `/styles/common.css` (provides CSS reset, base typography, body background/color, focus-visible outlines, @keyframes spin, button/form defaults, source badges, and responsive helpers), supplemented by inline styles for page-specific components.
- **Interactivity**: JavaScript files in the `/js/` directory handle client-side logic, including Wistia API integration for video playback. Shared utility modules imported by oz.html, vertical.html, and test.html include:
    - `js/shared-errors.js` — friendly error display for video grids
    - `js/shared-color-utils.js` — `darkenColor`, `hexToRgba`, `applyAccentColor` for dynamic accent theming
    - `js/shared-platform-config.js` — `PLATFORM_CONFIG` (platform key/label/color map), `platformInfo(v)` (resolves a video's platform with fallback to 'upload'), `injectPlatformBadgeStyles(badgeClass)` (dynamically injects CSS for platform badge colors), `sourceBadge(platform, badgeClass)` (generates badge HTML). Used by account.html (badge class `vc-badge`) and admin.html (badge class `source-badge`)
    - `js/shared-page-config.js` — `loadPageConfig(pageName, options)` fetches page config from server, applies accent color & page title; supports `defaultAccentColor`, `onTitleLoaded`, `onTitleMissing`, `fetchFn`, and `debug` options
    - `js/shared-url-utils.js` — `updateBrowserUrl`, `clearBrowserUrl`, `buildVideoUrlMappings`, `checkForDirectVideoLink` for direct video linking via URL hash; also declares the global `videoUrlMappings` object
    - `js/shared-cache-utils.js` — `getCachedMetadata`, `setCachedMetadata`, `getOptimizedThumbnailUrl`, `METADATA_CACHE_DURATION`, and a pre-built `defaultCacheOptions` object for localStorage-based video metadata caching. Used by oz.html, vertical.html, and test.html. Each page creates its own named cache options object (`defaultCacheOptions`, `verticalCacheOptions`, `testCacheOptions`) referencing the shared functions.
    - `js/shared-thumbnail-utils.js` — `setThumbnailFallback`, `loadWistiaThumbnail`, `loadVideoDuration`, `fixOrphanedWords` for video grid thumbnails and durations. `loadWistiaThumbnail` and `loadVideoDuration` accept an optional `options` parameter with `getCached`/`setCached`/`transformUrl` callbacks for caching support. All three video pages (oz.html, vertical.html, test.html) pass their named cache options objects to enable localStorage caching.
    - `js/shared-video-detect.js` — `detectVideoPlatform`, `extractVideoId`, `getThumbnailUrl` for multi-platform video support (used by vertical.html and test.html only; oz.html is Wistia-only)
- **UI/UX**: The design emphasizes mobile-first responsiveness with features like automatic landscape fullscreen. New pages (`/upload`, `/watch`, `/login`, `/account`) incorporate a clean, user-centric design with clear calls to action and responsive layouts. The watch page specifically features a redesigned, minimalist header and footer, centering the video with comfortable padding and rounded corners.
- **Accessibility (WCAG AA)**: All interactive controls have visible `:focus-visible` outlines (2px solid #4ecdc4). Color contrast meets WCAG AA (4.5:1+) across the dark theme — secondary text uses #959595. Upload widget has full ARIA: tabpanel/tab roles, aria-controls, for/id label associations, aria-live regions for progress/errors/success, and role=progressbar. Watch page password prompt uses a label+aria-describedby pattern with role=alert on errors and embed fallback. Thumbnail picker dialog in account.html has a keyboard focus trap with focus restoration. Admin/login error messages use role=alert with aria-live=assertive.

### Backend
- **Runtime**: Primarily Node.js, leveraging Netlify Functions for serverless execution. Recent updates also incorporate Express.js for specific video upload and serving functionalities, especially with PostgreSQL integration.
- **Database**: The application supports two modes:
    1.  **Default Mode**: Uses hardcoded fallback videos for operation without a database.
    2.  **Supabase Mode**: Connects to a Supabase PostgreSQL database for dynamic content management.
    3.  **Replit PostgreSQL Mode**: Used for video upload features, leveraging `vs_uploads`, `vs_upload_chunks`, `vs_users`, and `vs_meta` tables.
- **Serverless Functions (Netlify)**: Located in `/netlify/functions/`, these handle operations such as `get-videos`, `save-videos`, `get-categories`, `save-categories`, `get-page-config`, `save-page-config`, and `upload-page-image`. The `save-videos` and `save-categories` functions use atomic Supabase RPC stored procedures (`replace_page_videos`, `replace_page_categories`) to wrap the delete-then-insert pattern in a database transaction, preventing data loss if the insert fails after deletion.
- **API Endpoints (Express)**: New endpoints under `/api/` manage user authentication (`/api/auth/{signup,login,logout}`), user data (`/api/auth/me`), video management (`/api/my-videos`, `/api/finalize-video`), and admin functions.
- **Security**: Token-based authentication, CORS restrictions, and XSS prevention (`js/sanitize.js`) are implemented. Admin endpoints require an `ADMIN_TOKEN`. User accounts are passwordless: sign-in is via 6-digit magic codes emailed through Resend (codes are sha256-hashed at rest in `vs_auth_codes`, expire in 10 minutes, capped at 5 attempts, and per-email/per-IP rate-limited). Sessions use signed HttpOnly cookies (`SESSION_SECRET` lives in `vs_meta`). Brute-force protection and rate limiting are applied to critical endpoints. Netlify serverless upload functions enforce database-backed rate limiting via Supabase (`vs_rate_limits` table + atomic `vs_check_rate_limit` RPC function) using `netlify/functions/utils/rate-limit.js`: upload-chunk (10/hr/IP on first chunk), finalize-video (10/hr/IP), upload-thumbnail (20/hr/IP), upload-link-thumbnail (20/hr/IP). Rate-limited requests return 429 with a `Retry-After` header. The utility fails closed (blocks requests) if Supabase is unavailable. Expired rate limit entries are cleaned up via `vs_cleanup_expired_rate_limits()` SQL function. Client IP is extracted from Netlify's trusted `x-nf-client-connection-ip` header to prevent spoofing.
- **Video Management**: Features include chunked video uploads (up to 1GB), video expiry options, optional password protection for videos, and an admin interface to manage videos and view statistics. Efficient range-request video serving is implemented using PostgreSQL for optimal playback. Logged-in users can edit their video metadata (title, expiration, password) from the account dashboard via `PATCH /api/my-videos/:id`.
- **Paid Account Tier**: A manual `is_paid` boolean flag on `vs_users` (defaults to false). Paid users' videos never expire — the cleanup job skips them, and their expiration options are locked to "Never" in the upload and edit UIs. An admin can toggle the flag via `PATCH /api/admin/users/:id/tier` (protected by `requireAdmin`). Setting `is_paid=true` also clears `expires_at` on all the user's existing videos. The `/api/auth/me` response includes `is_paid` so the frontend can adapt. The account dashboard shows a "Paid" badge next to the user's email.
- **Core Features**:
    - **Video Pages**: Themed video content pages.
    - **Content Management**: Admin tools for adding/editing videos, categories (songs), and tags (audiences).
    - **User Accounts**: Optional user registration to manage personal video uploads.
    - **Video Upload & Sharing**: Dedicated `/upload` page for chunked video uploads with progress tracking, auto-copy share links, QR code generation, and optional password protection.
    - **Watch Page**: Displays video, title, expiry countdown, view count, and mobile-native share sheet. Server-side OG meta tag injection provides rich link previews on social media/messaging apps.
    - **OG Meta Tags**: Branded VidShare OG image at `/assets/vidshare-og.png` (dark background, coral-to-teal gradient play button). Static OG/Twitter Card tags on `index.html` for the homepage. Dynamic OG tags on `/watch` route injected server-side before `</head>` — uses video title, platform-specific thumbnails (YouTube via `img.youtube.com`, Vimeo via `vumbnail.com`, native uploads via `/api/video-thumbnail/:id`), with fallback to the branded image. All OG image URLs are absolute. The `/watch` route is registered before `express.static` to intercept requests before the HTML extension handler.
    - **Admin Page (`/admin`)**: Provides statistics, video management, and user tier management for administrators. The dashboard has tabbed navigation: a "Videos" tab (default) lists all uploaded videos with stats and delete actions, and a "Users" tab lists all registered users with their email, join date, video count, and a toggle switch to change each user between Free and Paid tiers. Video filter state (search, status, platform, page) is persisted in the browser URL as query parameters via `history.replaceState`, allowing bookmarkable/shareable filtered views and preserving filters across page refreshes. Both lists use server-side pagination (default 50 per page, max 200) via `limit`/`offset` query params on `GET /api/admin/videos` and `GET /api/admin/users`. The response includes `total`, `limit`, and `offset` fields. The videos endpoint also returns aggregate stats (`total_size`, `total_views`, `expired_count`) computed across all records and includes the `platform` field for each video. The videos endpoint supports `search`, `status` (active/expired/password), and `platform` (upload/youtube/vimeo) query params that can be combined. The frontend renders pagination controls (prev/next, page numbers with ellipsis for large sets, and a "X–Y of Z" indicator) when there are multiple pages. The Users tab includes server-side search (by email) and tier filtering via `search` and `tier` query params on `GET /api/admin/users`. The admin video list shows source badges (Upload/YouTube/Vimeo) inline next to video titles, matching the account page layout pattern. It also shows "∞ No expiry" badges (teal) for paid users' videos and plain "No expiry" badges (green) for non-paid users' videos, consistent with the account dashboard indicator. The existing `PATCH /api/admin/users/:id/tier` endpoint handles tier changes.

## External Dependencies

- **Wistia**: Primary video hosting and streaming service, integrated via its JavaScript API. Also supported as a link-embed platform via the link parser.
- **Supported Link-Embed Platforms**: The link parser (`js/link-parser.js`) supports YouTube, Vimeo, Dailymotion, Loom, and Wistia URL parsing for embeddable video links. Each platform has `parse`, `buildEmbedUrl`, and `buildOriginalUrl` support.
- **Supabase**: Optional PostgreSQL database for dynamic content management. Used for `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- **Netlify Functions**: Serverless platform for backend logic.
- **Netlify Blobs**: Used for durable cloud storage of uploaded images.
- **Replit PostgreSQL**: Database used for the video upload and user management features.
- **qrserver.com**: External API used for generating QR codes on the success screen of video uploads.
- **Node.js Modules**:
    - `@netlify/blobs`
    - `@supabase/supabase-js`
    - `dotenv`
    - `node-fetch`
    - `express` (for new upload/auth features)
    - `pg` (PostgreSQL client for Express backend)
    - `crypto` (Node.js built-in for security)
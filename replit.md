# VidShare Dance Hub

## Overview
VidShare Dance Hub is a mobile-first video sharing platform for theater groups to distribute dance instruction and training videos to cast members. It features dedicated video pages for productions, integrates with Wistia for professional hosting, and is optimized for mobile viewing. The platform uses a static frontend, a serverless Node.js backend with Netlify Functions, and optional Supabase/Replit PostgreSQL integration for dynamic content and video uploads. It includes robust security features like token-based authentication and XSS prevention, aiming to provide a secure and accessible way for cast members to access training materials.

## User Preferences
None documented yet - this is a fresh import.

## System Architecture
The application employs a decoupled frontend and backend architecture.

### Frontend
- **Structure**: Static HTML pages (`index.html`, `oz.html`, `disc.html`, `vertical.html`, `dropbox.html`, `upload.html`, `watch.html`, `login.html`, `account.html`, `admin.html`) form the UI.
- **Styling**: Global CSS is managed in `/styles/common.css` (provides CSS reset, base typography, body background/color, focus-visible outlines, @keyframes spin, button/form defaults, source badges, and responsive helpers). Gallery-specific responsive/mobile CSS is shared via `/styles/gallery-mobile.css` (video close button, video grid breakpoints, admin banner base+mobile, popup sizing, main mobile layout at 767px, landscape fullscreen, desktop responsive layouts at 600-999/1000-1299/1300+ breakpoints) — used by test.html, vertical.html, and oz.html, with page-specific overrides kept inline (test.html: admin-banner gradient; vertical.html: .video-container.vertical aspect ratios; oz.html: categories-dropdown mobile, different content/tags-container padding).
- **Interactivity**: JavaScript modules in `/js/` handle client-side logic, Wistia API integration, and various utilities for error display, color manipulation, platform configuration, page configuration, URL management, caching, thumbnail loading, and video platform detection. Shared utility modules imported by oz.html, vertical.html, and test.html include:
    - `js/shared-errors.js` — friendly error display for video grids
    - `js/shared-color-utils.js` — `darkenColor`, `hexToRgba`, `applyAccentColor` for dynamic accent theming
    - `js/shared-platform-config.js` — `PLATFORM_CONFIG` (platform key/label/color map including dropbox), `platformInfo(v)` (resolves a video's platform with fallback to 'upload'), `injectPlatformBadgeStyles(badgeClass)` (dynamically injects CSS for platform badge colors), `sourceBadge(platform, badgeClass)` (generates badge HTML). Used by account.html (badge class `vc-badge`), admin.html (badge class `source-badge`), vertical.html and dropbox.html (badge class `platform-badge`)
    - `js/shared-page-config.js` — `loadPageConfig(pageName, options)` fetches page config from server, applies accent color & page title; supports `defaultAccentColor`, `onTitleLoaded`, `onTitleMissing`, `fetchFn`, and `debug` options
    - `js/shared-url-utils.js` — `updateBrowserUrl`, `clearBrowserUrl`, `buildVideoUrlMappings`, `checkForDirectVideoLink` for direct video linking via URL hash; also declares the global `videoUrlMappings` object
    - `js/shared-cache-utils.js` — `getCachedMetadata`, `setCachedMetadata`, `getOptimizedThumbnailUrl`, `METADATA_CACHE_DURATION`, and a pre-built `defaultCacheOptions` object for localStorage-based video metadata caching. Used by oz.html, vertical.html, and test.html. Each page creates its own named cache options object (`defaultCacheOptions`, `verticalCacheOptions`, `testCacheOptions`) referencing the shared functions.
    - `js/shared-thumbnail-utils.js` — `setThumbnailFallback`, `loadWistiaThumbnail`, `loadVideoDuration`, `fixOrphanedWords` for video grid thumbnails and durations. `loadWistiaThumbnail` and `loadVideoDuration` accept an optional `options` parameter with `getCached`/`setCached`/`transformUrl` callbacks for caching support. All three video pages (oz.html, vertical.html, test.html) pass their named cache options objects to enable localStorage caching.
    - `js/shared-video-detect.js` — `detectVideoPlatform`, `extractVideoId`, `getThumbnailUrl` for multi-platform video support (used by vertical.html and test.html only; oz.html is Wistia-only)
- **UI/UX**: Mobile-first responsive design with features like automatic landscape fullscreen. New pages prioritize user-centric design with clear calls to action and responsive layouts, including a minimalist `watch` page.
- **Accessibility**: WCAG AA compliance with visible `:focus-visible` outlines, sufficient color contrast, and comprehensive ARIA attributes for interactive components and dynamic content. Thumbnail picker dialog in account.html has a keyboard focus trap with focus restoration. Admin/login error messages use role=alert with aria-live=assertive.

### Backend
-   **Runtime**: Primarily Node.js, utilizing Netlify Functions for serverless execution and Express.js for specific functionalities, especially with PostgreSQL integration.
-   **Database**: Supports three modes: hardcoded fallback videos, Supabase PostgreSQL, and Replit PostgreSQL (for video uploads, using `vs_uploads`, `vs_upload_chunks`, `vs_users`, `vs_meta` tables).
-   **Serverless Functions (Netlify)**: Located in `/netlify/functions/`, managing video and category data, page configurations, and image uploads. Utilizes atomic Supabase RPC stored procedures for safe data updates.
-   **API Endpoints (Express)**: Under `/api/`, handling user authentication (`/api/auth/{signup,login,logout,me}`), video management (`/api/my-videos`, `/api/finalize-video`), and admin operations.
-   **Security**: Token-based authentication, CORS restrictions, XSS prevention, and `crypto.timingSafeEqual` for secure token comparison. Passwordless sign-in via emailed magic codes (sha256-hashed, time/attempt/IP-limited, Resend for email). Signed HttpOnly cookies for sessions. Brute-force protection and rate limiting (database-backed via Supabase `vs_rate_limits` table and `vs_check_rate_limit` RPC function) on critical endpoints. Comprehensive security headers (CSP with `report-uri`, HSTS, Permissions-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy). CSP violation reports are collected and logged. CORS is managed per-function.
-   **Video Management**: Supports chunked video uploads (up to 1GB), video expiry options, optional password protection, and an admin interface. Efficient range-request video serving using PostgreSQL. Users can edit video metadata. Embed availability checks for linked videos.
-   **Paid Account Tier**: `is_paid` flag in `vs_users` enables non-expiring videos. Admin can toggle this via an API endpoint.
-   **Core Features**:
    -   **Video Pages**: Themed, production-specific video content.
    -   **Content Management**: Admin tools for managing videos, categories, and tags.
    -   **User Accounts**: Optional user registration for managing personal uploads.
    -   **Video Upload & Sharing**: Dedicated `/upload` page with progress tracking, share links, QR code generation, and password protection.
    -   **Watch Page**: Displays video, metadata, view count, mobile share sheet. Dynamic server-side OG meta tag injection for rich link previews.
    -   **Admin Page (`/admin`)**: Provides statistics, video, and user management (including tier changes) with tabbed navigation. Features include URL-persisted filter state for videos and users, server-side pagination with controls, search, and filtering capabilities.

## External Dependencies
-   **Wistia**: Primary video hosting; integrated via API and supported by link parser.
-   **Supported Link-Embed Platforms**: YouTube, Vimeo, Dailymotion, Loom, Wistia (parsed by `js/link-parser.js`).
-   **Supabase**: Optional PostgreSQL database for dynamic content.
-   **Netlify Functions**: Serverless platform.
-   **Netlify Blobs**: Cloud storage for uploaded images.
-   **Replit PostgreSQL**: Database for video upload and user management.
-   **qrserver.com**: External API for QR code generation.
-   **Node.js Modules**: `@netlify/blobs`, `@supabase/supabase-js`, `dotenv`, `node-fetch`, `express`, `pg`, `crypto`.
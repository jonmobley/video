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
- **Styling**: Global CSS is managed in `/styles/common.css`, supplemented by inline styles for specific components.
- **Interactivity**: JavaScript files in the `/js/` directory handle client-side logic, including Wistia API integration for video playback. Shared utilities like `js/shared-errors.js` (friendly error display for video grids) are imported by oz.html, vertical.html, and test.html.
- **UI/UX**: The design emphasizes mobile-first responsiveness with features like automatic landscape fullscreen. New pages (`/upload`, `/watch`, `/login`, `/account`) incorporate a clean, user-centric design with clear calls to action and responsive layouts. The watch page specifically features a redesigned, minimalist header and footer, centering the video with comfortable padding and rounded corners.
- **Accessibility (WCAG AA)**: All interactive controls have visible `:focus-visible` outlines (2px solid #4ecdc4). Color contrast meets WCAG AA (4.5:1+) across the dark theme — secondary text uses #959595. Upload widget has full ARIA: tabpanel/tab roles, aria-controls, for/id label associations, aria-live regions for progress/errors/success, and role=progressbar. Watch page password prompt uses a label+aria-describedby pattern with role=alert on errors and embed fallback. Thumbnail picker dialog in account.html has a keyboard focus trap with focus restoration. Admin/login error messages use role=alert with aria-live=assertive.

### Backend
- **Runtime**: Primarily Node.js, leveraging Netlify Functions for serverless execution. Recent updates also incorporate Express.js for specific video upload and serving functionalities, especially with PostgreSQL integration.
- **Database**: The application supports two modes:
    1.  **Default Mode**: Uses hardcoded fallback videos for operation without a database.
    2.  **Supabase Mode**: Connects to a Supabase PostgreSQL database for dynamic content management.
    3.  **Replit PostgreSQL Mode**: Used for video upload features, leveraging `vs_uploads`, `vs_upload_chunks`, `vs_users`, and `vs_meta` tables.
- **Serverless Functions (Netlify)**: Located in `/netlify/functions/`, these handle operations such as `get-videos`, `save-videos`, `get-categories`, `save-categories`, `get-page-config`, `save-page-config`, and `upload-page-image`.
- **API Endpoints (Express)**: New endpoints under `/api/` manage user authentication (`/api/auth/{signup,login,logout}`), user data (`/api/auth/me`), video management (`/api/my-videos`, `/api/finalize-video`), and admin functions.
- **Security**: Token-based authentication, CORS restrictions, and XSS prevention (`js/sanitize.js`) are implemented. Admin endpoints require an `ADMIN_TOKEN`. User accounts are passwordless: sign-in is via 6-digit magic codes emailed through Resend (codes are sha256-hashed at rest in `vs_auth_codes`, expire in 10 minutes, capped at 5 attempts, and per-email/per-IP rate-limited). Sessions use signed HttpOnly cookies (`SESSION_SECRET` lives in `vs_meta`). Brute-force protection and rate limiting are applied to critical endpoints.
- **Video Management**: Features include chunked video uploads (up to 1GB), video expiry options, optional password protection for videos, and an admin interface to manage videos and view statistics. Efficient range-request video serving is implemented using PostgreSQL for optimal playback. Logged-in users can edit their video metadata (title, expiration, password) from the account dashboard via `PATCH /api/my-videos/:id`.
- **Core Features**:
    - **Video Pages**: Themed video content pages.
    - **Content Management**: Admin tools for adding/editing videos, categories (songs), and tags (audiences).
    - **User Accounts**: Optional user registration to manage personal video uploads.
    - **Video Upload & Sharing**: Dedicated `/upload` page for chunked video uploads with progress tracking, auto-copy share links, QR code generation, and optional password protection.
    - **Watch Page**: Displays video, title, expiry countdown, view count, and mobile-native share sheet.
    - **Admin Page (`/admin`)**: Provides statistics and video management for administrators.

## External Dependencies

- **Wistia**: Primary video hosting and streaming service, integrated via its JavaScript API.
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
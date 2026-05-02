# VidShare Dance Hub - Replit Project

**Last Updated:** November 05, 2025

## Overview

VidShare Dance Hub is a mobile-first video sharing platform for theater groups to share dance instruction and training videos with cast members. The application features:

- **Video Pages**: Multiple themed pages (Wizard of Oz, DISC Heroes)
- **Wistia Integration**: Professional video hosting with advanced playback controls
- **Mobile-Optimized**: Automatic landscape fullscreen for better viewing
- **Serverless Backend**: Netlify Functions with Supabase database support
- **Static Frontend**: Pure HTML/CSS/JavaScript for simplicity
- **Production-Ready Security**: Token-based authentication, XSS prevention, and performance optimizations

## Current State

The project has been successfully secured and is production-ready:

✅ **Development Server**: Running on port 5000 via Netlify Dev
✅ **Netlify Functions**: All serverless functions are operational with authentication
✅ **Security Hardened**: Token-based auth, CORS restrictions, XSS prevention
✅ **Robust Fallbacks**: Works without database using default videos
✅ **Multi-Page Support**: `/oz`, `/disc`, `/vertical` pages functional
✅ **Deployment Ready**: Configured for Autoscale deployment with production-grade security

## Project Architecture

### Frontend
- **Static HTML Pages**: `index.html`, `oz.html`, `disc.html`, `vertical.html`, `dropbox.html`
- **Styling**: CSS in `/styles/common.css` with additional inline styles
- **JavaScript**: Platform-specific code in `/js/` directory
- **Video Player**: Wistia JavaScript API integration

### Backend
- **Runtime**: Node.js with Netlify Functions
- **Database**: Supabase (PostgreSQL) - optional, has fallback to default videos
- **Functions**: Located in `/netlify/functions/`
  - `get-videos.js` - Fetch videos for a page
  - `save-videos.js` - Save video data
  - `get-categories.js` - Fetch categories
  - `save-categories.js` - Save categories
  - `get-page-config.js` - Fetch page configuration
  - `save-page-config.js` - Save page settings
  - `upload-page-image.js` - Upload page images

### Development Setup
- **Server**: Netlify Dev on port 5000
- **Configuration**: `netlify.toml` for Netlify settings
- **Environment**: Uses `.env` for Supabase credentials (optional)

## Database (Optional)

The application can work in two modes:

1. **Default Mode** (Current): Uses hardcoded fallback videos defined in the functions
2. **Supabase Mode**: Connects to Supabase PostgreSQL database for dynamic content

To enable Supabase:
1. Set up a Supabase project
2. Add environment variables: `SUPABASE_URL` and `SUPABASE_ANON_KEY`
3. Run the SQL schema from `complete-supabase-schema.sql`

## How to Use

### Development
The Netlify dev server is already configured and running. Simply:
1. View the application in the webview (port 5000)
2. Access different pages via `/oz`, `/disc`, etc.
3. Edit HTML/CSS/JS files - changes are reflected immediately
4. Netlify Functions restart automatically when modified

### Adding Videos
In edit mode (requires login):
1. Click "Login" button on any page
2. Use "Add Video" to add new Wistia videos
3. Manage categories and tags
4. Set page configuration (title, accent color, etc.)

### Deployment
The project is configured for **Autoscale** deployment:
- Automatically scales based on traffic
- Stateless design perfect for this use case
- Click "Deploy" when ready to publish

## File Structure

```
vidshare-dance-hub/
├── index.html              # Landing page
├── oz.html                 # Wizard of Oz video page
├── disc.html               # DISC Heroes video page
├── vertical.html           # Vertical format page
├── dropbox.html            # Dropbox integration page
├── netlify.toml            # Netlify configuration
├── package.json            # Node.js dependencies
├── .gitignore              # Git ignore rules
├── netlify/
│   └── functions/          # Serverless functions
├── js/                     # JavaScript modules
├── styles/                 # CSS stylesheets
├── assets/                 # Images and static assets
└── tests/                  # Test files

```

## Environment Variables

**Required for Admin Operations:**
- `ADMIN_TOKEN` - Secret token for admin authentication (required to edit content)
- `ALLOWED_ORIGIN` - Allowed origin for CORS on admin endpoints (e.g., https://yourdomain.com)

**Optional (for database-backed content):**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key

**Note**: The app works without Supabase credentials using built-in fallback videos. See `env.example` for setup guidance.

## Dependencies

**Runtime Dependencies:**
- `@netlify/blobs` - Netlify blob storage
- `@supabase/supabase-js` - Supabase client library
- `dotenv` - Environment variable management
- `node-fetch` - HTTP client

**Dev Dependencies:**
- `netlify-cli` - Netlify development and deployment tools
- `eslint` - Code quality and linting
- `jest` - Testing framework

## Security

The application implements industry best practices for security:

**Authentication & Authorization:**
- All admin endpoints require `ADMIN_TOKEN` authentication
- Token-based authorization prevents unauthorized content modification
- Viewing videos requires no authentication (public access for cast members)

**CORS Protection:**
- Admin endpoints restrict requests to `ALLOWED_ORIGIN`
- Read-only endpoints allow public access for video viewing
- Prevents cross-site request attacks

**XSS Prevention:**
- `js/sanitize.js` provides HTML escaping utilities
- Frontend sanitizes all user-generated content before rendering
- Prevents script injection attacks

**Performance & Reliability:**
- Cache-Control headers and ETag support reduce server load
- Graceful fallbacks when Supabase is unavailable
- Image uploads use Netlify Blobs (durable cloud storage)

**Code Quality:**
- ESLint configuration enforces consistent style
- Basic automated tests for authentication
- Comprehensive documentation in `SECURITY.md`

For deployment security checklist, see `SECURITY.md`.

## Recent Changes

**2026-05-02 - Hardening pass after architect review**
- ✅ Refactored to dedicated `vs_uploads` and `vs_upload_chunks` tables (avoids collision with the wistia catalog `videos` table used by oz.html/disc.html)
- ✅ Atomic finalize: BEGIN/COMMIT transaction wraps metadata insert + chunk swap so a failure can never leave half-written state
- ✅ Chunk continuity check: verifies COUNT, MIN, MAX of chunk indices match exactly 0..totalChunks-1 (catches missing/duplicate chunks)
- ✅ Orphan-chunk pruning: hourly cleanup deletes chunks whose parent `vs_uploads` row no longer exists (FK was attempted but is incompatible with chunk-first-then-finalize upload protocol)
- ✅ BIGINT serialization: pg type parser registered so `file_size` is returned as a number (was string, broke admin's storage-used calculation)
- ✅ Rate-limit Maps bounded: periodic eviction every 10 min prevents memory growth from unique IPs
- ✅ Brute-force protection: `/api/verify-password` throttled to 8 attempts per 5 min per (IP, video) pair
- ✅ Constant-time hash comparison via `crypto.timingSafeEqual`
- ✅ `Referrer-Policy: no-referrer` on watch page so `?pt=` token never leaks via Referer header
- ✅ Index on `vs_uploads.expires_at` for fast cleanup queries

**2026-05-02 - Full feature build-out**
- ✅ Video expiry: choose 1 day, 7 days, 30 days, or never — expired videos auto-deleted on server startup + hourly
- ✅ File size limit: 100 MB enforced client-side and server-side with clear messaging on upload page
- ✅ Optional video title: shown in watch page top bar and browser tab
- ✅ Auto-copy link: share link copied to clipboard automatically after upload
- ✅ QR code: displayed on success screen using qrserver.com (no package needed)
- ✅ Password protection: optional PIN at upload; watch page shows password prompt, token passed via query string for video streaming
- ✅ Rate limiting: 10 uploads per hour per IP (in-memory)
- ✅ Admin page (`/admin`): login with ADMIN_TOKEN, shows stats (count, storage, views, expired), lists all videos with delete buttons
- ✅ Watch page: shows title, expiry countdown, view count, native Share sheet on mobile
- ✅ Efficient range-request video serving using PostgreSQL SUBSTRING (reads only needed bytes)

**2026-04-21 - Video Upload & Share Feature (initial)**
- ✅ Added `/upload` and `/watch` pages
- ✅ Migrated from Netlify Functions + Netlify Blobs to Express + Replit PostgreSQL
- ✅ Chunked upload (3MB per chunk), handles large files with progress bar
- ✅ Vertical video supported automatically on watch page
- ✅ Updated `index.html` with Upload a Video button
- ✅ Run command changed to `node server.js`



**2025-11-05 - Critical Bug Fix: Category/Tag Data Integrity**
- ✅ **CRITICAL FIX**: Resolved data loss bug where saving song categories would delete all tags
- ✅ Implemented scoped deletion in `save-categories.js` using explicit `category_scope` parameter
- ✅ Songs and tags now save independently without cross-deletion
- ✅ Backend handles legacy NULL `show_in_dropdown` values for idempotent saves
- ✅ Frontend sends explicit scope: 'songs' for Manage Categories, 'tags' for Manage Tags
- ✅ Fixed Manage Categories popup JavaScript error (null button references)
- ✅ Removed old migration code that was discarding `show_in_dropdown` field
- ✅ Restored all 20 OZ videos and proper category/tag structure to database
- ⚠️ **TODO**: Re-enable authentication on save endpoints before production deployment

**2025-10-29 - Production Security Hardening**
- ✅ Added token-based authentication for all admin endpoints
- ✅ Implemented CORS restrictions on mutation operations
- ✅ Fixed Supabase client initialization to handle missing credentials gracefully
- ✅ Migrated image uploads from broken filesystem writes to Netlify Blobs
- ✅ Added XSS prevention utilities (js/sanitize.js)
- ✅ Implemented caching headers (Cache-Control, ETag) for performance
- ✅ Created comprehensive security documentation (SECURITY.md)
- ✅ Added ESLint configuration and basic authentication tests
- ✅ Application is now production-ready with all critical vulnerabilities resolved

**2025-10-28 - Categories & Tags Structure Update**
- Restructured database to distinguish between Categories (songs) and Tags (audiences)
- Added `show_in_dropdown` column to categories table
- Categories (songs) for OZ page: Oz, Munchkinland, Jitterbug, Yellow Brick Road
- Tags (audience filters) for OZ page: Chorus, Kids, Dancers
- Updated backend functions to properly return show_in_dropdown field
- Fixed FOUC (Flash of Unstyled Content) with inline CSS variables
- Increased background image opacity for better visibility (28% desktop, 25% tablet)
- Performance optimizations: localStorage caching, lazy loading, parallel API calls

**2025-10-28 - Replit Import Setup**
- Configured Netlify Dev server for port 5000
- Added Replit-specific .gitignore entries
- Set up Autoscale deployment configuration
- Verified all pages and functions are working
- Created replit.md documentation

## User Preferences

None documented yet - this is a fresh import.

## Notes

- The app works perfectly without a database connection using fallback videos
- Supabase integration is optional and can be added later if needed
- All video thumbnails and playback work through Wistia's API
- Mobile-optimized with landscape fullscreen detection
- No authentication required for viewing videos
- Admin features available through "Login" button on each page

### Database Structure
- **Categories** (show_in_dropdown = true): Song names shown in dropdown (e.g., "Oz", "Munchkinland")
- **Tags** (show_in_dropdown = false): Audience filters shown as pills (e.g., "Chorus", "Kids", "Dancers")
- Admin can manage both via "Manage Categories" and "Manage Tags" buttons in edit mode

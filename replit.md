# VidShare Dance Hub - Replit Project

**Last Updated:** October 29, 2025

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

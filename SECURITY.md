# Security Guidelines

## Overview

This document outlines security measures implemented in VidShare and best practices for maintaining security.

## Authentication

### Admin Token Protection

All admin endpoints require authentication via the `ADMIN_TOKEN` environment variable:

- `save-videos.js` - Requires admin token
- `save-categories.js` - Requires admin token  
- `save-page-config.js` - Requires admin token
- `upload-page-image.js` - Requires admin token

**Setup:**

1. Generate a secure random token:
   ```bash
   openssl rand -hex 32
   ```

2. Add to Netlify environment variables:
   ```
   ADMIN_TOKEN=your_generated_token_here
   ```

3. Include token in API requests:
   ```javascript
   fetch('/.netlify/functions/save-videos', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': 'Bearer YOUR_ADMIN_TOKEN'
     },
     body: JSON.stringify(data)
   });
   ```

### CORS Configuration

Admin endpoints use restricted CORS headers via per-function logic (`getSecuredCorsHeaders()`), not a blanket `netlify.toml` rule. Read-only functions use `getCorsHeaders()` which returns `Access-Control-Allow-Origin: *`. Admin/write functions respect the `ALLOWED_ORIGIN` environment variable.

- Default: `Access-Control-Allow-Origin: *` (for development)
- Production: Set `ALLOWED_ORIGIN` environment variable to your domain

**Example:**
```
ALLOWED_ORIGIN=https://your-site.netlify.app
```

### Constant-Time Token Comparison

Both `server.js` and Netlify function auth (`netlify/functions/utils/auth.js`) use `crypto.timingSafeEqual` for admin token verification. This prevents timing-based attacks that could be used to discover the token character by character.

## Security Headers

The following headers are set on all responses (via `netlify.toml` for Netlify and middleware in `server.js` for the Replit dev server):

### Content-Security-Policy (CSP)

Restricts what resources browsers are allowed to load, providing the primary defense against XSS:

- `default-src 'self'` — only allow resources from the same origin by default
- `script-src 'self' 'unsafe-inline' https://fast.wistia.com https://fast.wistia.net` — allows inline scripts (needed for current codebase) and Wistia player scripts
- `style-src 'self' 'unsafe-inline'` — allows inline styles
- `img-src 'self' data: https: blob:` — allows images from any HTTPS source (thumbnails from Wistia, YouTube, Vimeo, etc.)
- `connect-src 'self' https://*.supabase.co https://fast.wistia.com https://vimeo.com https://api.qrserver.com` — controls fetch/XHR destinations
- `frame-src` — allows embedding video players from YouTube, Vimeo, Dailymotion, Loom, and Wistia
- `media-src 'self' blob:` — allows video playback from same origin and blob URLs
- `frame-ancestors 'none'` — prevents this site from being embedded in iframes elsewhere

### Strict-Transport-Security (HSTS)

`max-age=63072000; includeSubDomains` — tells browsers to always use HTTPS for this domain (2 year max-age).

### Permissions-Policy

`camera=(), microphone=(), geolocation=(), payment=()` — disables access to sensitive browser APIs that this application does not use, limiting what injected scripts could access.

### Other Headers

- `X-Frame-Options: DENY` — legacy clickjacking protection (supplemented by CSP frame-ancestors)
- `X-Content-Type-Options: nosniff` — prevents MIME type sniffing
- `X-XSS-Protection: 1; mode=block` — legacy XSS filter (supplemented by CSP)
- `Referrer-Policy: strict-origin-when-cross-origin` — controls referrer information

## XSS Prevention

### HTML Sanitization

The `js/sanitize.js` utility provides functions to prevent XSS attacks when rendering user-generated content.

**Available Functions:**

```javascript
// Escape HTML for safe display
const safe = escapeHtml(userInput);
element.innerHTML = safe;

// Escape for HTML attributes
element.setAttribute('title', escapeAttr(userTitle));

// Sanitize URLs
const safeUrl = sanitizeUrl(userUrl);

// Safe text content (preferred method)
safeSetText(element, userText);

// Safe attribute setting
safeSetAttr(element, 'data-title', userTitle);
```

**Best Practices:**

1. **Always use `textContent` over `innerHTML`** when possible:
   ```javascript
   // Good
   element.textContent = video.title;
   
   // Avoid (unless content is sanitized)
   element.innerHTML = video.title;
   ```

2. **Sanitize before inserting into DOM**:
   ```javascript
   // Import sanitization utility
   const { escapeHtml, escapeAttr } = require('./js/sanitize.js');
   
   // Use when building HTML strings
   const html = `<div title="${escapeAttr(video.title)}">${escapeHtml(video.description)}</div>`;
   ```

3. **Validate URLs before using**:
   ```javascript
   const url = sanitizeUrl(video.video_url);
   if (url) {
     element.href = url;
   }
   ```

### Input Validation

All admin endpoints validate input:

- **save-videos.js**: Validates required fields (id, title, wistiaId, category)
- **save-categories.js**: Validates hex color format
- **save-page-config.js**: Validates hex color format
- **upload-page-image.js**: Validates file type, size (5MB max), content type

## Database Security

### Supabase Security

- Uses Row Level Security (RLS) policies
- Read operations use `SUPABASE_ANON_KEY` (limited permissions)
- Write operations require admin token authentication
- All database queries use parameterized queries (Supabase SDK)

### SQL Injection Prevention

- Never concatenate user input into SQL queries
- Always use Supabase SDK methods with parameters:
  ```javascript
  // Good
  supabase.from('videos').eq('id', videoId)
  
  // Bad (don't do this)
  supabase.raw(`SELECT * FROM videos WHERE id = '${videoId}'`)
  ```

## File Upload Security

### Image Uploads

- Maximum file size: 5MB
- Allowed types: JPEG, PNG, WebP
- Files stored in Netlify Blobs (not filesystem)
- Filenames are sanitized and generated server-side

## Environment Variables

### Required Variables

```bash
# Supabase (optional - has fallback to default data)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key

# Admin Security (required for admin operations)
ADMIN_TOKEN=your_secure_token

# CORS (optional - defaults to *)
ALLOWED_ORIGIN=https://your-domain.com
```

### Variable Security

1. **Never commit secrets to git**
2. **Use Netlify environment variables** for production
3. **Rotate admin token** if compromised
4. **Keep Supabase keys secure** - never expose service role key

## Security Checklist

Before deploying:

- [ ] `ADMIN_TOKEN` is set and secure (32+ characters)
- [ ] `ALLOWED_ORIGIN` is set to your domain (not `*`)
- [ ] Supabase RLS policies are enabled
- [ ] All admin operations require authentication
- [ ] User-generated content is sanitized before rendering
- [ ] File uploads are validated
- [ ] HTTPS is enforced (handled by Netlify)
- [ ] CSP, HSTS, and Permissions-Policy headers are present on all responses
- [ ] Token comparison uses constant-time (`crypto.timingSafeEqual`) in both server.js and Netlify functions

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public issue
2. Contact the project maintainer privately
3. Provide detailed information about the vulnerability
4. Allow time for a fix before public disclosure

## Security Updates

This application uses:
- Netlify Functions (automatically updated)
- Supabase SDK (check for updates regularly)
- No client-side frameworks (reduced attack surface)

**Update dependencies regularly:**
```bash
npm audit
npm update
```

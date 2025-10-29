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

Admin endpoints use restricted CORS headers:
- Default: `Access-Control-Allow-Origin: *` (for development)
- Production: Set `ALLOWED_ORIGIN` environment variable to your domain

**Example:**
```
ALLOWED_ORIGIN=https://your-site.netlify.app
```

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

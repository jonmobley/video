# Page Meta Data and Share Image Implementation

## Overview
This implementation adds the ability for administrators to customize meta data and share images for each page (oz.html, disc.html, and future pages) through the admin panel.

## Features Implemented

### 1. Database Schema Extension
- Extended `page_config` table with new fields:
  - `meta_description` - SEO description
  - `meta_keywords` - SEO keywords  
  - `og_title` - Open Graph title for social sharing
  - `og_description` - Open Graph description
  - `og_image_url` - URL/path to share image
  - `twitter_title` - Twitter-specific title (optional)
  - `twitter_description` - Twitter-specific description (optional)
  - `canonical_url` - Canonical URL for SEO

### 2. Admin Interface - Page Info Modal
- Added "Page Info" button in admin header
- Modal includes three sections:
  - **Basic Information**: Page title configuration
  - **SEO Meta Data**: Description, keywords, canonical URL
  - **Social Media Sharing**: Open Graph and Twitter meta data
- Image upload preview (URL-based for now)
- Responsive design for mobile devices

### 3. Backend Updates
- `get-page-config.js`: Returns all meta fields with sensible defaults
- `save-page-config.js`: Handles saving all meta data fields
- `upload-page-image.js`: Prepared for future image upload functionality

### 4. Frontend Integration
- Both `oz.html` and `disc.html` now dynamically load meta tags
- JavaScript runs early in page load to update meta tags
- Fallback to default values if configuration fails to load

## How to Use

### For Administrators
1. Navigate to `/admin.html`
2. Select the page you want to configure from the dropdown
3. Click "Page Info" button in the header
4. Fill in the fields:
   - **Page Title**: Appears in the page header
   - **Meta Description**: For search engines (150-160 chars recommended)
   - **Meta Keywords**: Comma-separated keywords
   - **Canonical URL**: Primary URL for the page
   - **Open Graph Title/Description**: For social media sharing
   - **Share Image URL**: Direct URL to image (1200x630px recommended)
   - **Twitter overrides**: Optional Twitter-specific content
5. Click "Save Changes"

### Image Guidelines
- Recommended size: 1200 × 630 pixels
- Formats: JPEG, PNG, WebP
- Use direct URLs (e.g., from image hosting services)
- Default fallback: `/assets/og-image.png`

## Technical Details

### Meta Tag Loading Process
1. Page loads with default meta tags (for SEO crawlers)
2. JavaScript fetches page configuration from API
3. Meta tags are dynamically updated if custom values exist
4. Falls back to defaults on error

### Migration
Run the following SQL migration to add the new fields:
```sql
-- Run add-page-meta-fields.sql
```

## Future Enhancements
1. **Direct Image Upload**: Currently uses URLs only. Future version could upload to:
   - Supabase Storage
   - Cloudinary or similar CDN
   - Netlify's own hosting

2. **Live Preview**: Show how the page appears when shared on different platforms

3. **Auto-generate Images**: Create share images with page title overlaid

4. **Meta Tag Templates**: Pre-defined templates for common page types

## Testing
1. Update page info through admin panel
2. Share the page URL on social media platforms
3. Verify correct title, description, and image appear
4. Use tools like Facebook's Sharing Debugger or Twitter Card Validator

## Notes
- Meta tags are cached by social platforms; use their debugging tools to refresh
- Always provide high-quality images for best results
- Keep descriptions concise and engaging
- Use relevant keywords without keyword stuffing

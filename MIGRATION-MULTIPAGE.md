# Multi-Page Support Migration Guide

## Overview
This update adds support for multiple video pages (oz.html and disc.html) with separate content management.

## Database Migration
1. Run the migration script to add page support:
   ```sql
   -- Run the contents of add-page-support.sql in your Supabase SQL editor
   ```

## Changes Made

### Backend (Netlify Functions)
- **get-videos.js**: Now accepts `?page=oz` or `?page=disc` parameter
- **get-categories.js**: Now accepts `?page=oz` or `?page=disc` parameter
- **save-videos.js**: Now accepts page field in request body
- **save-categories.js**: Now accepts page field in request body

### Frontend
- **oz.html**: Updated to pass `page=oz` parameter to all API calls
- **disc.html**: New page that passes `page=disc` parameter to all API calls
- **admin.html**: Added page selector dropdown to manage content for each page

## Key Features

1. **Page Isolation**: Each page (oz, disc) has its own videos and categories
2. **Backward Compatibility**: Existing oz page continues to work without changes
3. **Admin Interface**: Single admin interface to manage all pages
4. **Database Structure**: Videos and categories now have a 'page' field

## Usage

### Viewing Pages
- Wizard of Oz videos: `/oz.html`
- DISC videos: `/disc.html`

### Managing Content
1. Go to `/admin.html`
2. Select the page you want to manage from the dropdown
3. Add/edit videos and categories for that specific page

## Initial Setup for DISC Page

The DISC page starts with:
- Category: DISC (with tag "DISC")
- No videos (ready to be added via admin)

## Notes
- The same Wistia video ID can exist on different pages
- Categories are page-specific and not shared between pages
- All existing content is automatically assigned to the 'oz' page

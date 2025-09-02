# Migration Guide: Page Accent Colors and Editable Titles

This guide explains how to apply the page accent color and editable title features to your VidShare installation.

## Overview

This migration adds the ability for admins to:
1. Customize the accent color for each page (oz.html, disc.html) through the admin interface
2. Edit page titles directly by clicking on them in admin edit mode

The accent color affects:
- Buttons and interactive elements
- Active states and selections
- Borders and focus indicators
- Tag highlights
- Admin mode banner

## Migration Steps

### 1. Apply Database Migrations

Run the following SQL migrations on your Supabase database in order:

```sql
-- 1. Execute the contents of add-page-config.sql
-- 2. Execute the contents of add-page-title.sql
```

This creates a `page_config` table with:
- Default accent colors:
  - Wizard of Oz page: `#008f67` (green)
  - DISC page: `#4d90db` (blue)
- Default page titles:
  - Wizard of Oz page: "Grace Church Wizard of Oz"
  - DISC page: "DISC Heroes"

### 2. Deploy Updated Files

Deploy the following updated files to your Netlify site:
- `admin.html` - Added accent color picker in page settings
- `oz.html` - Updated to use dynamic accent colors
- `disc.html` - Updated to use dynamic accent colors
- `netlify/functions/get-page-config.js` - New function to load page configurations
- `netlify/functions/save-page-config.js` - New function to save page configurations

### 3. Environment Variables

No new environment variables are required. The functions use the existing Supabase credentials.

## Usage

### Changing Accent Colors
1. Go to the admin panel (`/admin.html`)
2. In the "Page Settings" section, select the page you want to customize
3. Use the color picker to choose a new accent color
4. Click "Save Page Settings"
5. The color will be applied immediately to the selected page

### Editing Page Titles
1. Go to any page (oz.html or disc.html)
2. Click the login link and enter admin mode
3. Click on the page title in the header
4. Edit the title in the input field that appears
5. Press Enter to save or Escape to cancel
6. The title is saved automatically to the database

## Technical Details

### CSS Variables

The implementation uses CSS custom properties for dynamic theming:
- `--accent-color`: Main accent color
- `--accent-hover`: Darker variant for hover states
- `--accent-light`: Light variant for backgrounds (10% opacity)
- `--accent-shadow`: Shadow variant for focus states (30% opacity)

### Color Calculation

The system automatically calculates color variants:
- Hover color: 10% darker than the main color
- Light variant: Main color at 10% opacity
- Shadow variant: Main color at 30% opacity

### Fallback Behavior

If the page configuration fails to load, the pages will fall back to their default colors:
- oz.html: `#008f67`
- disc.html: `#4d90db`

## Rollback

To rollback this feature:
1. Remove the `page_config` table from the database
2. Revert the file changes
3. The pages will use their hardcoded default colors

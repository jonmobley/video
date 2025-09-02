# Test Checklist: Accent Colors and Editable Page Titles

This checklist ensures all features are working correctly after implementing accent colors and editable page titles.

## Pre-requisites
- [ ] Run database migrations in order:
  1. `add-page-config.sql`
  2. `add-page-title.sql`
- [ ] Deploy all updated files to Netlify
- [ ] Ensure Supabase environment variables are set

## Test 1: Default Values
- [ ] Navigate to oz.html - should show green accent color (#008f67)
- [ ] Navigate to disc.html - should show blue accent color (#4d90db)
- [ ] oz.html title should display "Grace Church Wizard of Oz"
- [ ] disc.html title should display "DISC Heroes"

## Test 2: Accent Color Changes (Admin Panel)
1. Navigate to `/admin.html`
2. Select "Wizard of Oz" from page selector
   - [ ] Current accent color should show as #008f67
3. Change accent color using color picker
   - [ ] Text input should sync with color picker
   - [ ] Manually entering hex code should update color picker
4. Click "Save Page Settings"
   - [ ] Should show success message
5. Navigate to oz.html
   - [ ] New accent color should be applied to:
     - [ ] Buttons and hover states
     - [ ] Active tags
     - [ ] Border highlights
     - [ ] Admin mode banner
     - [ ] Focus indicators
6. Repeat steps 2-5 for DISC page

## Test 3: Invalid Color Validation
1. In admin panel, try entering invalid hex colors:
   - [ ] "red" - should show error
   - [ ] "#12345" - should show error (too short)
   - [ ] "#GGGGGG" - should show error (invalid hex)
   - [ ] "#1234567" - should show error (too long)

## Test 4: Page Title Editing (Edit Mode)
1. Navigate to oz.html
2. Click login link and enter admin mode
3. Hover over page title
   - [ ] Should show dashed border
   - [ ] Cursor should change to text cursor
4. Click on page title
   - [ ] Should become editable input field
   - [ ] Current title should be selected
5. Change title and press Enter
   - [ ] Title should update immediately
   - [ ] Unsaved indicator should appear
6. Refresh page
   - [ ] New title should persist
7. Repeat steps 1-6 for disc.html

## Test 5: Page Title Edit Cancellation
1. In edit mode, click page title
2. Type new text
3. Press Escape
   - [ ] Should revert to original title
   - [ ] Input should disappear

## Test 6: Cross-Page Independence
1. Set oz.html to red accent color (#ff0000)
2. Set disc.html to purple accent color (#800080)
3. Set oz.html title to "Test Title 1"
4. Set disc.html title to "Test Title 2"
5. Navigate between pages
   - [ ] Each page should maintain its own color
   - [ ] Each page should maintain its own title

## Test 7: Persistence and Loading
1. Make changes to colors and titles
2. Clear browser cache
3. Reload pages
   - [ ] All changes should persist
   - [ ] Colors should load before page is fully rendered

## Test 8: Fallback Behavior
1. Temporarily break database connection (optional test)
2. Load pages
   - [ ] Should fall back to default colors
   - [ ] Should fall back to default titles
   - [ ] Pages should still function normally

## Test 9: Mobile Responsiveness
1. Test on mobile device or responsive view
   - [ ] Theme color meta tag should update with accent color
   - [ ] Title editing should work on mobile (in edit mode)
   - [ ] Color picker should be accessible

## Test 10: Admin Panel Page Switching
1. In admin panel, select "Wizard of Oz"
2. Change accent color but don't save
3. Switch to "DISC" page
4. Switch back to "Wizard of Oz"
   - [ ] Unsaved changes should be lost
   - [ ] Current saved color should load

## Known Limitations
- Color picker may vary by browser
- Some older browsers may not support color input type
- Title changes require admin mode (intentional security feature)

## Success Criteria
All checkboxes should be checked for full feature validation.

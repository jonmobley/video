# Dropbox Video Integration

This document describes the Dropbox video integration for VidShare.

## Overview

The Dropbox integration allows users to add videos from their Dropbox accounts directly to the VidShare library. Videos are streamed directly from Dropbox using HTML5 video players.

## Setup Instructions

### 1. Create a Dropbox App

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps/create)
2. Click "Create App"
3. Choose:
   - API: "Scoped access"
   - Access: "Full Dropbox"
   - Name: "VidShare" (or similar)
4. After creation, copy the **App Key**

### 2. Configure VidShare

1. Copy `config-example.js` to `config.js`
2. Add your Dropbox App Key:
   ```javascript
   window.VidShareConfig = {
       dropboxAppKey: 'YOUR_APP_KEY_HERE',
       enableDropbox: true
   };
   ```

### 3. Test the Integration

1. Open `dropbox-test.html` in your browser
2. Enter your App Key and test the integration
3. Once working, the integration will be available in the main pages

## Architecture

### Components

1. **Video Platform Manager** (`js/video-platform.js`)
   - Abstracts video playback for both Wistia and Dropbox
   - Handles SDK loading and video player creation
   - Provides unified API for video operations

2. **Database Schema**
   - `platform` field: 'wistia' or 'dropbox'
   - `video_url` field: Stores Dropbox direct links
   - `wistia_id` field: Unique ID (generated for Dropbox videos)

3. **UI Components**
   - Platform badges on thumbnails
   - "Add from Dropbox" button in edit mode
   - Unified video player interface

## Features

### Current
- Single and multiple video selection from Dropbox
- HTML5 video playback for Dropbox videos
- Platform detection and appropriate player loading
- Test page for integration verification

### Planned
- Thumbnail generation for Dropbox videos
- Video duration extraction
- Automatic link refresh (Dropbox links expire)
- Batch import functionality
- Progress indicators for large files

## Integration Points

### oz.html and disc.html
The following updates are needed:

1. Include configuration and platform manager:
   ```html
   <script src="config.js"></script>
   <script src="js/video-platform.js"></script>
   ```

2. Initialize platform manager:
   ```javascript
   const platformManager = new VideoPlatformManager();
   if (window.VidShareConfig && window.VidShareConfig.enableDropbox) {
       platformManager.init(window.VidShareConfig.dropboxAppKey);
   }
   ```

3. Update video loading logic to use platform manager
4. Add "Add from Dropbox" button in edit mode
5. Update thumbnail display logic

### Backend (Netlify Functions)
- Already supports platform field in database
- No changes needed for basic functionality

## Security Considerations

1. **App Key**: Should be kept in config.js (gitignored)
2. **Direct Links**: Dropbox direct links expire after 4 hours
3. **Access Control**: Videos are only accessible to users with Dropbox access

## Usage

### Adding Videos from Dropbox

1. Enter edit mode
2. Click "Add from Dropbox"
3. Select video files from Dropbox
4. Videos are automatically added to the library

### Playing Dropbox Videos

- Click on any Dropbox video thumbnail
- Video plays using HTML5 player
- All standard controls available

## Limitations

1. Dropbox direct links expire after 4 hours
2. No server-side thumbnail generation
3. Limited to file types supported by HTML5 video
4. Bandwidth limitations from Dropbox

## Future Enhancements

1. **Link Refresh**: Automatic refresh of expired Dropbox links
2. **Thumbnail Generation**: Client-side video thumbnail extraction
3. **Caching**: Local caching of video metadata
4. **Batch Operations**: Import entire folders
5. **Format Conversion**: Handle non-HTML5 compatible formats

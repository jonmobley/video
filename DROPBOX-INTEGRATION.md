# Dropbox Video Integration

This document describes the Dropbox video integration for VidShare.

## Overview

The Dropbox integration allows users to add videos by pasting public Dropbox sharing links. Videos are streamed directly from Dropbox using HTML5 video players. No Dropbox account or authentication is required.

## How It Works

1. User copies a public Dropbox sharing link (e.g., from their Dropbox account)
2. User pastes the link in VidShare's edit mode
3. The system converts the sharing link to a direct streaming URL
4. Video is played using HTML5 video player

## Setup Instructions

No setup required! The integration works out of the box.

### Testing

1. Open `dropbox-url-test.html` in your browser
2. Paste any public Dropbox video link
3. The system will convert it and play the video

## Architecture

### Components

1. **Dropbox URL Handler** (`js/dropbox-url-handler.js`)
   - Converts Dropbox sharing URLs to direct streaming URLs
   - Validates video formats
   - Generates video metadata
   - Creates thumbnails from video frames

2. **Video Platform Manager** (`js/video-platform.js`)
   - Abstracts video playback for both Wistia and Dropbox
   - Handles video player creation
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
- Paste public Dropbox sharing URLs
- Automatic URL conversion to direct streaming links
- HTML5 video playback for Dropbox videos
- Platform detection and appropriate player loading
- Client-side thumbnail generation from video frames
- Video duration extraction
- Test page for URL validation

### Planned
- Batch URL import (paste multiple URLs)
- Automatic link refresh (Dropbox links may expire)
- URL validation before saving
- Thumbnail caching

## Integration Points

### oz.html and disc.html
The following updates are needed:

1. Include the scripts:
   ```html
   <script src="js/dropbox-url-handler.js"></script>
   <script src="js/video-platform.js"></script>
   ```

2. Initialize platform manager:
   ```javascript
   const platformManager = new VideoPlatformManager();
   await platformManager.init();
   ```

3. Update video loading logic to use platform manager
4. Add "Add Dropbox URL" button/input in edit mode
5. Update thumbnail display logic to handle both platforms

### Backend (Netlify Functions)
- Already supports platform field in database
- No changes needed for basic functionality

## URL Format Support

### Supported Dropbox URL Formats
- `https://www.dropbox.com/s/xxxxx/filename.mp4?dl=0`
- `https://www.dropbox.com/scl/fi/xxxxx/filename.mp4?rlkey=xxxxx&dl=0`

### How URL Conversion Works
1. Changes `dl=0` to `raw=1` for direct streaming
2. Or replaces `www.dropbox.com` with `dl.dropboxusercontent.com`
3. Maintains HTTPS for security

## Security Considerations

1. **Public Links Only**: Only public Dropbox links are supported
2. **Link Expiration**: Some Dropbox direct links may expire over time
3. **CORS**: Videos must be publicly accessible for browser playback

## Usage

### Adding Videos from Dropbox

1. Get a public sharing link from Dropbox for your video
2. Enter edit mode in VidShare
3. Click "Add Dropbox URL" (or use the input field)
4. Paste the Dropbox sharing link
5. Video is automatically converted and added to the library

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

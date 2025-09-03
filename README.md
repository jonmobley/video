# VidShare Dance Hub
<!-- Last updated: 2025-02-01 -->

A mobile-first video sharing platform for theater groups to share dance instruction videos with cast members. Built with Wistia integration and serverless functions.

## Features

- 📱 **Mobile-optimized** with automatic landscape fullscreen
- 🎭 **Dance-focused categories** (Ballet, Jazz, Contemporary, Tap, etc.)
- 🔄 **Real-time updates** across all devices
- 🎥 **Wistia integration** with advanced video controls
- 🔒 **No authentication required** - simple access for cast
- ⚡ **Serverless backend** with Netlify Functions

## Quick Deploy to Netlify

### Option 1: Drag & Drop (Easiest)
1. Download all files to a folder
2. Drag the entire folder to [Netlify Deploy](https://app.netlify.com/drop)
3. Your site is live!

### Option 2: Git Deploy (Recommended)
1. Create a new GitHub repository
2. Upload all files to the repository
3. Connect the repository to Netlify
4. Auto-deploys on every commit

## File Structure

```
your-project/
├── index.html                    # Main video page
├── [removed - admin features now in page edit mode]  
├── package.json                  # Node.js config
├── netlify.toml                  # Netlify configuration
├── README.md                     # This file
├── netlify/
│   └── functions/
│       ├── get-videos.js         # Load videos API
│       └── save-videos.js        # Save videos API
└── data/                         # (Auto-created on first run)
    └── videos.json              # Video storage
```

## How to Use

### For Cast Members (Main Page)
1. Visit your site URL
2. Browse videos by category
3. Tap any video to play in the header
4. Rotate phone to landscape for fullscreen viewing

### For Instructors (Edit Mode)
1. Click "Login" on any page and enter your password
2. In edit mode, click "Add Video" to add new videos
3. Paste video URLs from Wistia, Vimeo, or YouTube
4. Manage categories, set featured videos, edit page settings
5. Changes appear instantly for all visitors

### Getting Wistia Video IDs
1. Go to your Wistia dashboard
2. Select a video
3. Click "Embed & Share"
4. Copy the video ID (e.g., `abc123def456`)

## Configuration

### Custom Domain
In Netlify dashboard:
1. Go to "Domain settings"
2. Add your custom domain (e.g., `dance.yourtheater.com`)
3. Follow DNS setup instructions

### Categories
Categories can be managed directly in edit mode:
1. Click "Login" and enter edit mode
2. Click the "+" button next to categories
3. Add, edit, or delete categories as needed

### Styling
All styles are inline in the HTML files for easy customization. Key color variables:
- Primary: `#ff6b6b`
- Background: `#0f0f0f`
- Cards: `#1a1a1a`

## Technical Details

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Backend**: Netlify Functions (Node.js)
- **Storage**: Simple JSON file
- **Video Player**: Wistia JavaScript API
- **Mobile**: Responsive design with orientation detection

## Troubleshooting

### Videos Not Loading
- Check Netlify Functions are deployed
- Verify Wistia video IDs are correct
- Check browser console for errors

### Admin Panel Not Saving
- Ensure internet connection
- Check Netlify Functions logs in dashboard
- Verify video data is valid (title, ID, category)

### Mobile Fullscreen Not Working
- Ensure Wistia video is playing when rotating
- Check device supports orientation API
- Try refreshing page after rotation

## License

MIT License - Free for personal and commercial use.

## Support

This is a complete, production-ready MVP. For advanced features like user authentication, analytics, or custom video players, consider extending with additional services.
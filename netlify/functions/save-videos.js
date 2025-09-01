// Try to import Netlify Blobs, fall back gracefully if not available
let store = null;
let blobsAvailable = false;

try {
  const { getStore } = require('@netlify/blobs');
  // Only try to get store if we're in a Netlify environment
  // The siteID and token are automatically set in Netlify Functions environment
  if (process.env.NETLIFY || process.env.NETLIFY_DEV) {
    console.log('Netlify environment detected, attempting to initialize Blobs...');
    store = getStore('vidshare-data');
    blobsAvailable = true;
    console.log('Netlify Blobs initialized successfully');
  } else {
    console.log('Not in Netlify environment, Blobs disabled');
  }
} catch (error) {
  console.log('Netlify Blobs not available, using fallback mode:', error.message);
  console.log('This is expected in local development or if Blobs is not configured');
}

// Function to generate a persistent random string for a video
function generateVideoUrlString(wistiaId) {
  // Create a simple hash from the wistiaId to ensure consistency
  let hash = 0;
  for (let i = 0; i < wistiaId.length; i++) {
    const char = wistiaId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to positive number and create a base36 string
  const positiveHash = Math.abs(hash);
  let urlString = positiveHash.toString(36);
  
  // Ensure minimum length of 6 characters
  while (urlString.length < 6) {
    urlString = '0' + urlString;
  }
  
  // Limit to 8 characters for clean URLs
  return urlString.substring(0, 8);
}

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    // Log environment for debugging
    console.log('Function environment:', {
      NETLIFY: process.env.NETLIFY,
      NETLIFY_DEV: process.env.NETLIFY_DEV,
      CONTEXT: process.env.CONTEXT,
      hasSiteID: !!process.env.SITE_ID,
      hasStore: !!store
    });

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: ''
      };
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }
    const videos = JSON.parse(event.body);
    
    // Validate video data
    if (!Array.isArray(videos)) {
      throw new Error('Videos must be an array');
    }

    // Validate and enhance each video object
    for (const video of videos) {
      if (!video.id || !video.title || !video.category || !video.wistiaId) {
        throw new Error('Invalid video data structure - id, title, category, and wistiaId are required');
      }
      
      // Ensure video has a URL string
      if (!video.urlString) {
        video.urlString = generateVideoUrlString(video.wistiaId);
        console.log(`Generated URL string for video ${video.wistiaId}: ${video.urlString}`);
      }
    }

    // Check for duplicate IDs
    const ids = videos.map(video => video.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error('Duplicate video IDs found');
    }

    // Try to save to Netlify Blobs if available
    if (store) {
      try {
        await store.set('videos', JSON.stringify(videos));
        console.log('Successfully saved videos to Netlify Blobs');
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, count: videos.length, message: 'Videos saved successfully' })
        };
      } catch (blobError) {
        console.error('Could not save to Netlify Blobs:', blobError.message);
        
        // Fall back to success without persistence
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            count: videos.length, 
            message: 'Videos validated but not persisted (storage unavailable)',
            temporary: true
          })
        };
      }
    } else {
      // Netlify Blobs not available, return success but indicate temporary storage
      console.log('Netlify Blobs not available, videos not persisted');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          count: videos.length, 
          message: 'Videos validated but not persisted (Netlify Blobs unavailable)',
          temporary: true
        })
      };
    }
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};
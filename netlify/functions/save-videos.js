// Try to import Netlify Blobs, fall back gracefully if not available
let store = null;
try {
  const { getStore } = require('@netlify/blobs');
  store = getStore('vidshare-data');
} catch (error) {
  console.log('Netlify Blobs not available, using fallback mode:', error.message);
}

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

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

  try {
    const videos = JSON.parse(event.body);
    
    // Validate video data
    if (!Array.isArray(videos)) {
      throw new Error('Videos must be an array');
    }

    // Validate each video object
    for (const video of videos) {
      if (!video.id || !video.title || !video.category || !video.wistiaId) {
        throw new Error('Invalid video data structure - id, title, category, and wistiaId are required');
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
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
};
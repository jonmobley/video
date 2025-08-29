// Try to import Netlify Blobs, fall back gracefully if not available
let store = null;
try {
  const { getStore } = require('@netlify/blobs');
  store = getStore('vidshare-data');
} catch (error) {
  console.log('Netlify Blobs not available, using fallback mode:', error.message);
}

// Default videos for initial setup
const defaultVideos = [
  {
    id: 'ssgxvlsdmx',
    title: 'Chorus and Kids Stage L',
    category: 'chorus and kids',
    wistiaId: 'ssgxvlsdmx'
  },
  {
    id: '7kpm1d3mhv',
    title: 'Chorus and Kids Stage R',
    category: 'chorus and kids',
    wistiaId: '7kpm1d3mhv'
  },
  {
    id: 'eklwt6f33t',
    title: 'Section One: Dancers',
    category: 'section one',
    wistiaId: 'eklwt6f33t'
  },
  {
    id: 'xqxp9qk6ab',
    title: 'Section One: Stage R Chorus',
    category: 'section one',
    wistiaId: 'xqxp9qk6ab'
  }
];

exports.handler = async (event, context) => {
  console.log('get-videos function called with method:', event.httpMethod);
  
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    console.log('Invalid method:', event.httpMethod);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    let videos = defaultVideos; // Start with defaults

    // Try to use Netlify Blobs if available
    if (store) {
      try {
        const videosData = await store.get('videos', { type: 'json' });
        if (videosData) {
          videos = videosData;
          console.log('Loaded videos from Netlify Blobs:', videos.length, 'videos');
        } else {
          // No data exists, try to save defaults
          try {
            await store.set('videos', JSON.stringify(videos));
            console.log('Initialized with default videos in Netlify Blobs');
          } catch (saveError) {
            console.log('Could not save to Blobs, using defaults:', saveError.message);
          }
        }
      } catch (blobError) {
        console.log('Blob storage error, using defaults:', blobError.message);
      }
    } else {
      console.log('Netlify Blobs not available, using default videos');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(videos)
    };
  } catch (error) {
    console.error('Error in get-videos function:', error);
    // Always return default videos as final fallback
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(defaultVideos)
    };
  }
};
const { getStore } = require('@netlify/blobs');

// Initialize Netlify Blob store
const store = getStore('vidshare-data');

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
    // Try to read existing videos from Netlify Blobs
    let videos;
    try {
      const videosData = await store.get('videos', { type: 'json' });
      if (videosData) {
        videos = videosData;
        console.log('Loaded videos from Netlify Blobs:', videos.length, 'videos');
      } else {
        // No data exists, use defaults and save them
        videos = defaultVideos;
        await store.set('videos', JSON.stringify(videos));
        console.log('Initialized with default videos in Netlify Blobs');
      }
    } catch (blobError) {
      console.log('Blob storage error, using defaults:', blobError.message);
      videos = defaultVideos;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(videos)
    };
  } catch (error) {
    console.error('Error in get-videos function:', error);
    // Fallback to default videos even if everything fails
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(defaultVideos)
    };
  }
};
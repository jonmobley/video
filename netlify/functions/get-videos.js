const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/videos.json');

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.dirname(DATA_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
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
    await ensureDataDir();
    
    // Try to read existing videos
    let videos;
    try {
      const data = await fs.readFile(DATA_FILE, 'utf8');
      videos = JSON.parse(data);
    } catch {
      // File doesn't exist, create with default videos
      videos = defaultVideos;
      await fs.writeFile(DATA_FILE, JSON.stringify(videos, null, 2));
    }

    console.log('Returning videos:', videos.length, 'videos');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(videos)
    };
  } catch (error) {
    console.error('Error in get-videos function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to load videos', details: error.message })
    };
  }
};
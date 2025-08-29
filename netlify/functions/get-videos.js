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
    // Try to read existing videos from file
    let videos;
    try {
      await ensureDataDir();
      const data = await fs.readFile(DATA_FILE, 'utf8');
      videos = JSON.parse(data);
      console.log('Loaded videos from file:', videos.length, 'videos');
    } catch (fileError) {
      // File doesn't exist or can't be read, use default videos
      console.log('Using default videos, file error:', fileError.message);
      videos = defaultVideos;
      
      // Try to create the file, but don't fail if we can't (serverless environment)
      try {
        await ensureDataDir();
        await fs.writeFile(DATA_FILE, JSON.stringify(videos, null, 2));
        console.log('Created default videos file');
      } catch (writeError) {
        console.log('Could not write videos file (normal in serverless):', writeError.message);
      }
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
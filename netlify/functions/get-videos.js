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
    title: 'Dance Video 1',
    category: 'ballet',
    wistiaId: 'ssgxvlsdmx'
  },
  {
    id: '7kpm1d3mhv',
    title: 'Dance Video 2',
    category: 'jazz',
    wistiaId: '7kpm1d3mhv'
  },
  {
    id: 'eklwt6f33t',
    title: 'Dance Video 3',
    category: 'contemporary',
    wistiaId: 'eklwt6f33t'
  },
  {
    id: 'xqxp9qk6ab',
    title: 'Dance Video 4',
    category: 'tap',
    wistiaId: 'xqxp9qk6ab'
  }
];

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

  if (event.httpMethod !== 'GET') {
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(videos)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to load videos' })
    };
  }
};
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
    id: 'abc123def456',
    title: 'Basic Ballet Positions',
    category: 'ballet',
    wistiaId: 'abc123def456'
  },
  {
    id: 'def456ghi789',
    title: 'Jazz Square Tutorial',
    category: 'jazz',
    wistiaId: 'def456ghi789'
  },
  {
    id: 'ghi789jkl012',
    title: 'Floor Work Fundamentals',
    category: 'contemporary',
    wistiaId: 'ghi789jkl012'
  },
  {
    id: 'jkl012mno345',
    title: 'Basic Tap Steps',
    category: 'tap',
    wistiaId: 'jkl012mno345'
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
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
        throw new Error('Invalid video data structure');
      }
    }

    await ensureDataDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(videos, null, 2));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, count: videos.length })
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
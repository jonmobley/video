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
        throw new Error('Invalid video data structure - id, title, category, and wistiaId are required');
      }
    }

    // Check for duplicate IDs
    const ids = videos.map(video => video.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error('Duplicate video IDs found');
    }

    try {
      await ensureDataDir();
      await fs.writeFile(DATA_FILE, JSON.stringify(videos, null, 2));
      console.log('Successfully saved videos to file');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, count: videos.length, message: 'Videos saved successfully' })
      };
    } catch (writeError) {
      console.error('Could not write to filesystem:', writeError.message);
      
      // In serverless environment, we can't persist to filesystem
      // Return success but indicate it's temporary
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          count: videos.length, 
          message: 'Videos validated but not persisted (serverless environment)',
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
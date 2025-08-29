const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/categories.json');

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
    const categories = JSON.parse(event.body);
    
    // Validate category data
    if (!Array.isArray(categories)) {
      throw new Error('Categories must be an array');
    }

    // Validate each category object
    for (const category of categories) {
      if (!category.id || !category.name) {
        throw new Error('Invalid category data structure - id and name are required');
      }
      
      // Validate color format (hex color)
      if (category.color && !/^#[0-9A-F]{6}$/i.test(category.color)) {
        throw new Error(`Invalid color format for category ${category.name}. Use hex format like #ff6b6b`);
      }
    }

    // Check for duplicate IDs
    const ids = categories.map(cat => cat.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error('Duplicate category IDs found');
    }

    await ensureDataDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(categories, null, 2));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, count: categories.length })
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

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

// Default categories for initial setup
const defaultCategories = [
  { id: 'chorus and kids', name: 'Chorus and Kids', color: '#ff6b6b' },
  { id: 'section one', name: 'Section One', color: '#4ecdc4' }
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
    
    // Try to read existing categories
    let categories;
    try {
      const data = await fs.readFile(DATA_FILE, 'utf8');
      categories = JSON.parse(data);
    } catch {
      // File doesn't exist, create with default categories
      categories = defaultCategories;
      await fs.writeFile(DATA_FILE, JSON.stringify(categories, null, 2));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(categories)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to load categories' })
    };
  }
};

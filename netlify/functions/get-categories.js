// Try to import Netlify Blobs, fall back gracefully if not available
let store = null;
try {
  const { getStore } = require('@netlify/blobs');
  store = getStore('vidshare-data');
} catch (error) {
  console.log('Netlify Blobs not available, using fallback mode:', error.message);
}

// Default tags for initial setup (renamed from categories to tags)
const defaultCategories = [
  { id: 'dancers', name: 'Dancers', color: '#4ecdc4' },
  { id: 'kids', name: 'Kids', color: '#ff6b6b' },
  { id: 'chorus', name: 'Chorus', color: '#ffd93d' }
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
    let categories = defaultCategories; // Start with defaults

    // Try to use Netlify Blobs if available
    if (store) {
      try {
        const categoriesData = await store.get('categories', { type: 'json' });
        if (categoriesData) {
          categories = categoriesData;
          console.log('Loaded categories from Netlify Blobs:', categories.length, 'categories');
        } else {
          // No data exists, try to save defaults
          try {
            await store.set('categories', JSON.stringify(categories));
            console.log('Initialized with default categories in Netlify Blobs');
          } catch (saveError) {
            console.log('Could not save to Blobs, using defaults:', saveError.message);
          }
        }
      } catch (blobError) {
        console.log('Blob storage error, using defaults:', blobError.message);
      }
    } else {
      console.log('Netlify Blobs not available, using default categories');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(categories)
    };
  } catch (error) {
    console.error('Error in get-categories function:', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(defaultCategories)
    };
  }
};

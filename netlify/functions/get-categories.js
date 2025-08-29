const { getStore } = require('@netlify/blobs');

// Initialize Netlify Blob store
const store = getStore('vidshare-data');

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
    // Try to read existing categories from Netlify Blobs
    let categories;
    try {
      const categoriesData = await store.get('categories', { type: 'json' });
      if (categoriesData) {
        categories = categoriesData;
        console.log('Loaded categories from Netlify Blobs:', categories.length, 'categories');
      } else {
        // No data exists, use defaults and save them
        categories = defaultCategories;
        await store.set('categories', JSON.stringify(categories));
        console.log('Initialized with default categories in Netlify Blobs');
      }
    } catch (blobError) {
      console.log('Blob storage error, using defaults:', blobError.message);
      categories = defaultCategories;
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

// Try to import Netlify Blobs, fall back gracefully if not available
let store = null;
let blobsAvailable = false;

try {
  const { getStore } = require('@netlify/blobs');
  // Only try to get store if we're in a Netlify environment
  // The siteID and token are automatically set in Netlify Functions environment
  if (process.env.NETLIFY || process.env.NETLIFY_DEV) {
    console.log('Netlify environment detected, attempting to initialize Blobs...');
    store = getStore('vidshare-data');
    blobsAvailable = true;
    console.log('Netlify Blobs initialized successfully');
  } else {
    console.log('Not in Netlify environment, Blobs disabled');
  }
} catch (error) {
  console.log('Netlify Blobs not available, using fallback mode:', error.message);
  console.log('This is expected in local development or if Blobs is not configured');
}

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
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

    // Try to save to Netlify Blobs if available
    if (store) {
      try {
        await store.set('categories', JSON.stringify(categories));
        console.log('Successfully saved categories to Netlify Blobs');

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, count: categories.length })
        };
      } catch (blobError) {
        console.error('Could not save to Netlify Blobs:', blobError.message);
        
        // Fall back to success without persistence
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            count: categories.length, 
            message: 'Categories validated but not persisted (storage unavailable)',
            temporary: true
          })
        };
      }
    } else {
      // Netlify Blobs not available, return success but indicate temporary storage
      console.log('Netlify Blobs not available, categories not persisted');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          count: categories.length, 
          message: 'Categories validated but not persisted (Netlify Blobs unavailable)',
          temporary: true
        })
      };
    }
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};

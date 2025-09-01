const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;

console.log('Supabase initialization:', {
  hasUrl: !!supabaseUrl,
  hasKey: !!supabaseKey,
  urlLength: supabaseUrl ? supabaseUrl.length : 0,
  urlStart: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'undefined'
});

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client created successfully');
  } catch (error) {
    console.error('Error creating Supabase client:', error);
  }
}

// Default categories for fallback
const DEFAULT_CATEGORIES = [
  { id: 'all', name: 'All Videos', order: 0 },
  { id: 'chorus', name: 'Chorus', order: 1 },
  { id: 'principals', name: 'Principals', order: 2 },
  { id: 'dancers', name: 'Dancers', order: 3 }
];

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
    // Try to get categories from Supabase if available
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .order('order', { ascending: true });

        if (error) {
          console.error('Error fetching categories from Supabase:', error);
          throw error;
        }

        console.log(`Successfully fetched ${data.length} categories from Supabase`);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(data)
        };
      } catch (dbError) {
        console.error('Database query failed, using default categories:', dbError);
        // Fall back to default categories if database fails
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(DEFAULT_CATEGORIES)
        };
      }
    } else {
      // Supabase not configured, return default categories
      console.log('Supabase not configured, returning default categories');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(DEFAULT_CATEGORIES)
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
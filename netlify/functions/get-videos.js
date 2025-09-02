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

// Default videos for fallback
const DEFAULT_VIDEOS = {
  'oz': [
    {
      id: 'ssgxvlsdmx',
      wistiaId: 'ssgxvlsdmx',
      title: 'Chorus and Kids Stage L',
      category: 'chorus',
      tags: ['chorus', 'kids'],
      order: 0,
      page: 'oz'
    },
    {
      id: '7kpm1d3mhv',
      wistiaId: '7kpm1d3mhv',
      title: 'Chorus and Kids Stage R',
      category: 'chorus',
      tags: ['chorus', 'kids'],
      order: 1,
      page: 'oz'
    },
    {
      id: 'eklwt6f33t',
      wistiaId: 'eklwt6f33t',
      title: 'Section One: Dancers',
      category: 'dancers',
      tags: ['dancers'],
      order: 2,
      page: 'oz'
    },
    {
      id: 'xqxp9qk6ab',
      wistiaId: 'xqxp9qk6ab',
      title: 'Section One: Stage R Chorus',
      category: 'chorus',
      tags: ['chorus'],
      order: 3,
      page: 'oz'
    }
  ],
  'disc': [] // Empty array for disc page
};

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
    // Extract page parameter from query string
    const params = event.queryStringParameters || {};
    const page = params.page || 'oz'; // Default to 'oz' for backward compatibility
    
    console.log(`Fetching videos for page: ${page}`);
    // Try to get videos from Supabase if available
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('videos')
          .select('*')
          .eq('page', page)
          .order('order', { ascending: true });

        if (error) {
          console.error('Error fetching videos from Supabase:', error);
          throw error;
        }

        // Transform Supabase data to match expected format
        const videos = data.map(video => ({
          id: video.id,
          wistiaId: video.wistia_id,
          title: video.title,
          category: video.category,
          tags: video.tags || [],
          urlString: video.url_string,
          order: video.order
        }));

        console.log(`Successfully fetched ${videos.length} videos from Supabase for page: ${page}`);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(videos)
        };
      } catch (dbError) {
        console.error('Database query failed, using default videos:', dbError);
        // Fall back to default videos if database fails
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(DEFAULT_VIDEOS[page] || [])
        };
      }
    } else {
      // Supabase not configured, return default videos
      console.log('Supabase not configured, returning default videos');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(DEFAULT_VIDEOS[page] || [])
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
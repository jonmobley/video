const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

// Default videos for fallback
const DEFAULT_VIDEOS = [
  {
    id: 'ssgxvlsdmx',
    wistiaId: 'ssgxvlsdmx',
    title: 'Chorus and Kids Stage L',
    category: 'chorus',
    tags: ['chorus', 'kids'],
    order: 0
  },
  {
    id: '7kpm1d3mhv',
    wistiaId: '7kpm1d3mhv',
    title: 'Chorus and Kids Stage R',
    category: 'chorus',
    tags: ['chorus', 'kids'],
    order: 1
  },
  {
    id: 'eklwt6f33t',
    wistiaId: 'eklwt6f33t',
    title: 'Section One: Dancers',
    category: 'dancers',
    tags: ['dancers'],
    order: 2
  },
  {
    id: 'xqxp9qk6ab',
    wistiaId: 'xqxp9qk6ab',
    title: 'Section One: Stage R Chorus',
    category: 'chorus',
    tags: ['chorus'],
    order: 3
  }
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
    // Try to get videos from Supabase if available
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('videos')
          .select('*')
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

        console.log(`Successfully fetched ${videos.length} videos from Supabase`);
        
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
          body: JSON.stringify(DEFAULT_VIDEOS)
        };
      }
    } else {
      // Supabase not configured, return default videos
      console.log('Supabase not configured, returning default videos');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(DEFAULT_VIDEOS)
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
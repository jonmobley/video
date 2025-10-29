/**
 * Netlify Function: get-videos
 * 
 * Purpose: Retrieves video data for a specific page from Supabase
 * 
 * Query Parameters:
 *   - page (optional): Page identifier ('oz' or 'disc'). Defaults to 'oz'
 * 
 * Returns:
 *   - Array of video objects with transformed field names
 *   - Falls back to hardcoded defaults if database is unavailable
 * 
 * Features:
 *   - Multi-page support
 *   - Graceful fallback to default videos
 *   - Field name transformation (snake_case to camelCase)
 */

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
// These are used when Supabase is not configured or unavailable
// Helps with local development and ensures the app doesn't break
const DEFAULT_VIDEOS = {
  'oz': [
    {
      id: 'ssgxvlsdmx',
      wistiaId: 'ssgxvlsdmx',
      title: 'Chorus and Kids Stage L',
      category: 'the-merry-land-of-oz',
      tags: ['chorus', 'kids'],
      order: 0,
      page: 'oz'
    },
    {
      id: '7kpm1d3mhv',
      wistiaId: '7kpm1d3mhv',
      title: 'Chorus and Kids Stage R',
      category: 'the-merry-land-of-oz',
      tags: ['chorus', 'kids'],
      order: 1,
      page: 'oz'
    },
    {
      id: 'eklwt6f33t',
      wistiaId: 'eklwt6f33t',
      title: 'Section One: Dancers',
      category: 'the-merry-land-of-oz',
      tags: ['dancers'],
      order: 2,
      page: 'oz'
    },
    {
      id: 'xqxp9qk6ab',
      wistiaId: 'xqxp9qk6ab',
      title: 'Section One: Stage R Chorus',
      category: 'the-merry-land-of-oz',
      tags: ['chorus'],
      order: 3,
      page: 'oz'
    }
  ],
  'disc': [
    {
      id: 'vqb0pfo4zw',
      wistiaId: 'vqb0pfo4zw',
      title: 'Bathroom',
      category: 'conflict',
      tags: ['conflict'],
      urlString: 'zexm3j',
      order: 0,
      page: 'disc'
    },
    {
      id: '5vqqwph6wq',
      wistiaId: '5vqqwph6wq',
      title: 'Cookies',
      category: 'conflict',
      tags: ['conflict'],
      urlString: '4dykji',
      order: 1,
      page: 'disc'
    },
    {
      id: 'nujmnhh6fh',
      wistiaId: 'nujmnhh6fh',
      title: 'DISC FULL Intro',
      category: 'disc',
      tags: ['disc'],
      urlString: '1l49zo',
      order: 2,
      page: 'disc'
    },
    {
      id: '1t2iqoeme2',
      wistiaId: '1t2iqoeme2',
      title: 'DISC HERO Intro',
      category: 'disc',
      tags: ['disc'],
      urlString: 'kx5ooj',
      order: 3,
      page: 'disc'
    },
    {
      id: 'l6ub2gwc2r',
      wistiaId: 'l6ub2gwc2r',
      title: 'Kitchen Adapt',
      category: 'adapted',
      tags: ['adapted'],
      urlString: 'tljhw8',
      order: 4,
      page: 'disc'
    },
    {
      id: '2gexsi52zj',
      wistiaId: '2gexsi52zj',
      title: 'Kitchen',
      category: 'conflict',
      tags: ['conflict'],
      urlString: '4i9wdx',
      order: 5,
      page: 'disc'
    },
    {
      id: '1cai4aoxq3',
      wistiaId: '1cai4aoxq3',
      title: 'Returning Home Adapt',
      category: 'adapted',
      tags: ['adapted'],
      urlString: 'xz3wsu',
      order: 6,
      page: 'disc'
    },
    {
      id: '3u992i78fk',
      wistiaId: '3u992i78fk',
      title: 'Returning Home',
      category: 'conflict',
      tags: ['conflict'],
      urlString: 'ls0xk1',
      order: 7,
      page: 'disc'
    },
    {
      id: '7i7k3gmrzh',
      wistiaId: '7i7k3gmrzh',
      title: 'TV Adapt',
      category: 'adapted',
      tags: ['adapted'],
      urlString: '679o3x',
      order: 8,
      page: 'disc'
    },
    {
      id: '5emj65bgp7',
      wistiaId: '5emj65bgp7',
      title: 'TV',
      category: 'conflict',
      tags: ['conflict'],
      urlString: 'u28f9k',
      order: 9,
      page: 'disc'
    }
  ], // DISC Heroes videos restored from Git history
  'vertical': [] // Empty array for vertical page
};

/**
 * Generate a simple hash for ETag
 */
function generateHash(data) {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

exports.handler = async (event, context) => {
  // Enable CORS with caching headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' // 5 min cache, 10 min stale
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
        // Converts snake_case database fields to camelCase for frontend
        const videos = data.map(video => ({
          id: video.id,
          wistiaId: video.wistia_id,        // wistia_id -> wistiaId
          title: video.title,
          category: video.category,
          tags: video.tags || [],           // Ensure array even if null
          urlString: video.url_string,      // url_string -> urlString
          order: video.order,
          video_url: video.video_url,       // Keep snake_case for compatibility
          platform: video.platform || 'wistia' // Default to wistia for backwards compatibility
        }));

        console.log(`Successfully fetched ${videos.length} videos from Supabase for page: ${page}`);
        
        const etag = generateHash(videos);
        const clientEtag = event.headers['if-none-match'];
        
        if (clientEtag === etag) {
          return {
            statusCode: 304,
            headers: { ...headers, 'ETag': etag },
            body: ''
          };
        }
        
        return {
          statusCode: 200,
          headers: { ...headers, 'ETag': etag },
          body: JSON.stringify(videos)
        };
      } catch (dbError) {
        console.error('Database query failed, using default videos:', dbError);
        // Fall back to default videos if database fails
        const fallbackData = DEFAULT_VIDEOS[page] || [];
        const etag = generateHash(fallbackData);
        const clientEtag = event.headers['if-none-match'];
        
        if (clientEtag === etag) {
          return {
            statusCode: 304,
            headers: { ...headers, 'ETag': etag },
            body: ''
          };
        }
        
        return {
          statusCode: 200,
          headers: { ...headers, 'ETag': etag },
          body: JSON.stringify(fallbackData)
        };
      }
    } else {
      // Supabase not configured, return default videos
      console.log('Supabase not configured, returning default videos');
      const fallbackData = DEFAULT_VIDEOS[page] || [];
      const etag = generateHash(fallbackData);
      const clientEtag = event.headers['if-none-match'];
      
      if (clientEtag === etag) {
        return {
          statusCode: 304,
          headers: { ...headers, 'ETag': etag },
          body: ''
        };
      }
      
      return {
        statusCode: 200,
        headers: { ...headers, 'ETag': etag },
        body: JSON.stringify(fallbackData)
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
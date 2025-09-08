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
  'disc': [], // Empty array for disc page
  'vertical': [] // Empty array for vertical page
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
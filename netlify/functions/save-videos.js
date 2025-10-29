/**
 * Netlify Function: save-videos
 * 
 * Purpose: Saves video data to Supabase, replacing existing videos for a page
 * 
 * Request Body:
 *   - Legacy format: Array of video objects (defaults to 'oz' page)
 *   - New format: { videos: Array, page: String }
 * 
 * Video Object Requirements:
 *   - id: Unique identifier
 *   - wistiaId: Wistia platform ID
 *   - title: Display title
 *   - category: Category ID reference
 *   - tags (optional): Array of tag strings
 *   - urlString (optional): Generated if not provided
 *   - order (optional): Display order
 * 
 * Features:
 *   - Automatic URL string generation for direct video links
 *   - Multi-page support with page isolation
 *   - Validates video data before saving
 *   - Replaces all videos for the specified page
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth, getSecuredCorsHeaders } = require('./utils/auth');

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

/**
 * Generate a persistent URL string for a video based on its Wistia ID
 * This creates a consistent, short URL-friendly string for direct video links
 * 
 * @param {string} wistiaId - The Wistia video ID
 * @returns {string} A consistent 6-8 character alphanumeric string
 */
function generateVideoUrlString(wistiaId) {
  // Create a simple hash from the wistiaId to ensure consistency
  let hash = 0;
  for (let i = 0; i < wistiaId.length; i++) {
    const char = wistiaId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to positive number and create a base36 string
  const positiveHash = Math.abs(hash);
  let urlString = positiveHash.toString(36);
  
  // Ensure minimum length of 6 characters
  while (urlString.length < 6) {
    urlString = '0' + urlString;
  }
  
  // Limit to 8 characters for clean URLs
  return urlString.substring(0, 8);
}

exports.handler = async (event, context) => {
  // Get secured CORS headers
  const headers = getSecuredCorsHeaders();

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

  // Require authentication for admin operations
  const authResult = requireAuth(event);
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    // Log environment for debugging
    console.log('Function environment:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseKey,
      hasSupabase: !!supabase
    });

    const requestBody = JSON.parse(event.body);
    
    // Support both array of videos and object with videos and page
    let videos, page;
    if (Array.isArray(requestBody)) {
      // Backward compatibility - if just an array is sent, default to 'oz' page
      videos = requestBody;
      page = 'oz';
    } else {
      // New format: { videos: [...], page: 'oz' }
      videos = requestBody.videos || [];
      page = requestBody.page || 'oz';
    }
    
    console.log(`Saving ${videos.length} videos for page: ${page}`);
    
    // Validate video data
    if (!Array.isArray(videos)) {
      throw new Error('Videos must be an array');
    }

    // Validate and enhance each video object
    for (const video of videos) {
      if (!video.id || !video.title || !video.category || !video.wistiaId) {
        throw new Error('Invalid video data structure - id, title, category, and wistiaId are required');
      }
      
      // Ensure video has a URL string
      if (!video.urlString) {
        video.urlString = generateVideoUrlString(video.wistiaId);
        console.log(`Generated URL string for video ${video.wistiaId}: ${video.urlString}`);
      }
    }

    // Check for duplicate IDs
    const ids = videos.map(video => video.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error('Duplicate video IDs found');
    }

    // Try to save to Supabase if available
    if (supabase) {
      try {
        // Prepare data for Supabase
        const supabaseVideos = videos.map(video => ({
          id: video.id,
          wistia_id: video.wistiaId,
          title: video.title,
          category: video.category,
          tags: video.tags || [],
          url_string: video.urlString,
          order: video.order || 0,
          page: page,
          video_url: video.video_url,
          platform: video.platform || 'wistia'
        }));

        // Delete existing videos for this page and insert new ones
        const { error: deleteError } = await supabase
          .from('videos')
          .delete()
          .eq('page', page); // Delete only records for this page

        if (deleteError) {
          console.error('Error deleting existing videos:', deleteError);
          throw deleteError;
        }

        // Insert new videos
        const { data, error } = await supabase
          .from('videos')
          .insert(supabaseVideos);

        if (error) {
          console.error('Error saving videos to Supabase:', error);
          throw error;
        }

        console.log('Successfully saved videos to Supabase');
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, count: videos.length, page: page, message: `Videos saved successfully for page: ${page}` })
        };
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
        throw new Error(`Failed to save videos: ${dbError.message}`);
      }
    } else {
      // Supabase not configured
      console.log('Supabase not configured, videos not persisted');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          count: videos.length, 
          message: 'Videos validated but not persisted (Supabase not configured)',
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
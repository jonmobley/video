/**
 * Netlify Function: save-page-config
 * 
 * Purpose: Saves or updates page configuration including accent colors and titles
 * 
 * Request Body (JSON):
 *   - page (required): Page ID to update (e.g., 'oz', 'disc')
 *   - name (optional): Short display name for the page
 *   - accent_color (optional): Hex color for page theme
 *   - page_title (optional): Full display title for page header
 *   - meta_description (optional): SEO meta description
 *   - meta_keywords (optional): SEO meta keywords
 *   - og_title (optional): Open Graph title for social sharing
 *   - og_description (optional): Open Graph description
 *   - og_image_url (optional): URL/path to Open Graph image
 *   - twitter_title (optional): Twitter-specific title
 *   - twitter_description (optional): Twitter-specific description
 *   - canonical_url (optional): Canonical URL for SEO
 * 
 * Returns:
 *   - Updated page config object on success
 *   - Error message on failure
 * 
 * Notes:
 *   - Creates new config if page doesn't exist
 *   - Updates only provided fields if config exists
 *   - Validates hex color format for accent_color
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth, getSecuredCorsHeaders } = require('./utils/auth');

// Initialize Supabase client with environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client created successfully for page config');
  } catch (error) {
    console.error('Error creating Supabase client:', error);
  }
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

  // TODO: RE-ENABLE BEFORE DEPLOYMENT - Authentication temporarily disabled for development
  // const authResult = requireAuth(event);
  // if (!authResult.authorized) {
  //   return authResult.response;
  // }

  try {
    const body = JSON.parse(event.body);
    const { 
      page, 
      name, 
      accent_color, 
      page_title,
      meta_description,
      meta_keywords,
      og_title,
      og_description,
      og_image_url,
      twitter_title,
      twitter_description,
      canonical_url
    } = body;

    // Validate input
    if (!page) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Page ID is required' })
      };
    }

    // Validate accent_color is a valid hex color
    if (accent_color && !/^#[0-9A-F]{6}$/i.test(accent_color)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid accent color format. Must be hex color (e.g., #008f67)' })
      };
    }

    // Check if Supabase is available
    if (!supabase) {
      console.log('Supabase not configured - page config changes not persisted');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true,
          message: 'Page config validated but not persisted (Supabase not configured)',
          temporary: true
        })
      };
    }

    // Use upsert to handle both insert and update
    const upsertData = { page: page };
    if (accent_color !== undefined) upsertData.accent_color = accent_color;
    if (page_title !== undefined) upsertData.page_title = page_title;
    if (meta_description !== undefined) upsertData.meta_description = meta_description;
    if (meta_keywords !== undefined) upsertData.meta_keywords = meta_keywords;
    if (og_title !== undefined) upsertData.og_title = og_title;
    if (og_description !== undefined) upsertData.og_description = og_description;
    if (og_image_url !== undefined) upsertData.og_image_url = og_image_url;
    if (twitter_title !== undefined) upsertData.twitter_title = twitter_title;
    if (twitter_description !== undefined) upsertData.twitter_description = twitter_description;
    if (canonical_url !== undefined) upsertData.canonical_url = canonical_url;
    
    const result = await supabase
      .from('page_config')
      .upsert(upsertData, { onConflict: 'page' })
      .select()
      .single();

    if (result.error) {
      console.error('Supabase error:', result.error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: result.error.message })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result.data)
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

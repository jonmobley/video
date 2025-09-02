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

// Initialize Supabase client with environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

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

  try {
    const { page, name, accent_color, page_title } = JSON.parse(event.body);

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

    // Check if page config exists
    const { data: existingConfig } = await supabase
      .from('page_config')
      .select('id')
      .eq('id', page)
      .single();

    let result;
    
    if (existingConfig) {
      // Update existing config
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (accent_color !== undefined) updateData.accent_color = accent_color;
      if (page_title !== undefined) updateData.page_title = page_title;
      
      result = await supabase
        .from('page_config')
        .update(updateData)
        .eq('id', page)
        .select()
        .single();
    } else {
      // Insert new config
      result = await supabase
        .from('page_config')
        .insert({
          id: page,
          name: name || page.charAt(0).toUpperCase() + page.slice(1),
          accent_color: accent_color || '#008f67',
          page_title: page_title || name || page.charAt(0).toUpperCase() + page.slice(1)
        })
        .select()
        .single();
    }

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

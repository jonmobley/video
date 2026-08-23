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
 *   - coming_soon_image_url (optional): URL/path to empty-state artwork; null restores the default
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
const { requirePageAuth, getSecuredCorsHeaders } = require('./utils/auth');
const { buildPageConfigWrite } = require('../../lib/page-config-defaults');

// Initialize Supabase client with the service role key (bypasses RLS).
// The anon key must NOT be used here — page_config RLS is read-only for anon.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

if (!supabaseServiceRoleKey && process.env.SUPABASE_URL) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY is not set. ' +
    'save-page-config requires the service role key to bypass RLS. ' +
    'Set it in Netlify environment variables.'
  );
}

if (supabaseUrl && supabaseServiceRoleKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
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
      body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } })
    };
  }

  try {
    if (event.body && event.body.length > 256 * 1024) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large (max 256 KB).' } })
      };
    }
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } })
      };
    }
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
      coming_soon_image_url,
      twitter_title,
      twitter_description,
      canonical_url
    } = body;

    // Validate input
    if (!page || typeof page !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'PAGE_REQUIRED', message: 'Page ID is required.' } })
      };
    }
    if (page.length > 64 || !/^[a-z0-9_-]+$/.test(page)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'BAD_PAGE', message: 'Invalid page ID.' } })
      };
    }

    const authResult = requirePageAuth(event, page);
    if (!authResult.authorized) {
      return authResult.response;
    }

    // Validate accent_color is a valid hex color
    if (accent_color && !/^#[0-9A-F]{6}$/i.test(accent_color)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'BAD_COLOR', message: 'Invalid accent color format. Must be hex color (e.g., #008f67).' } })
      };
    }

    if (coming_soon_image_url !== undefined &&
        coming_soon_image_url !== null &&
        (typeof coming_soon_image_url !== 'string' ||
         coming_soon_image_url.length > 2048 ||
         !/^(\/|https?:\/\/)/i.test(coming_soon_image_url))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'BAD_COMING_SOON_IMAGE', message: 'Invalid Coming Soon image URL.' } })
      };
    }

    if (!supabase) {
      console.error('Supabase client not available — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: { code: 'DB_NOT_CONFIGURED', message: 'Database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' } })
      };
    }

    const changes = {};
    if (accent_color !== undefined) changes.accent_color = accent_color;
    if (page_title !== undefined) changes.page_title = page_title;
    if (meta_description !== undefined) changes.meta_description = meta_description;
    if (meta_keywords !== undefined) changes.meta_keywords = meta_keywords;
    if (og_title !== undefined) changes.og_title = og_title;
    if (og_description !== undefined) changes.og_description = og_description;
    if (og_image_url !== undefined) changes.og_image_url = og_image_url;
    if (coming_soon_image_url !== undefined) changes.coming_soon_image_url = coming_soon_image_url;
    if (twitter_title !== undefined) changes.twitter_title = twitter_title;
    if (twitter_description !== undefined) changes.twitter_description = twitter_description;
    if (canonical_url !== undefined) changes.canonical_url = canonical_url;

    const existingResult = await supabase
      .from('page_config')
      .select('page')
      .eq('page', page)
      .maybeSingle();
    if (existingResult.error) {
      console.error('Supabase error checking page config:', existingResult.error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: { code: 'DB_ERROR', message: 'Database error.' } })
      };
    }

    const upsertData = buildPageConfigWrite(page, changes, existingResult.data);
    
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
        body: JSON.stringify({ error: { code: 'DB_ERROR', message: 'Database error.' } })
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
      body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Internal server error' } })
    };
  }
};

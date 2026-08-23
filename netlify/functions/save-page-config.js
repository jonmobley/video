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

const PRESENTATION_FIELDS = new Set([
  'template_key',
  'empty_state_enabled',
  'force_empty_state',
  'empty_state_label',
  'empty_state_placeholder_count',
  'empty_state_fallback_image_url',
  'background_image_url',
  'background_position',
  'background_opacity',
  'background_blur',
  'mobile_background_opacity',
  'footer_theme',
  'category_all_label',
  'tag_all_label',
  'choreography_by_song'
]);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function presentationError(message) {
  return { code: 'BAD_PRESENTATION', message };
}

function validatePresentation(presentation) {
  if (!isPlainObject(presentation)) return presentationError('Presentation must be a plain object.');
  if (Buffer.byteLength(JSON.stringify(presentation), 'utf8') > 32 * 1024) {
    return presentationError('Presentation is too large (max 32 KB).');
  }

  for (const field of Object.keys(presentation)) {
    if (!PRESENTATION_FIELDS.has(field)) {
      return presentationError(`Unsupported presentation field: ${field}.`);
    }
  }

  const stringFields = {
    template_key: 40,
    empty_state_label: 160,
    background_position: 100,
    category_all_label: 100,
    tag_all_label: 100
  };
  for (const [field, maxLength] of Object.entries(stringFields)) {
    if (presentation[field] !== undefined &&
      (typeof presentation[field] !== 'string' || !presentation[field].trim() ||
        presentation[field].length > maxLength)) {
      return presentationError(`Invalid presentation ${field}.`);
    }
  }
  if (presentation.template_key !== undefined && presentation.template_key !== 'gallery') {
    return presentationError('Invalid presentation template_key.');
  }
  for (const field of ['empty_state_enabled', 'force_empty_state']) {
    if (presentation[field] !== undefined && typeof presentation[field] !== 'boolean') {
      return presentationError(`Invalid presentation ${field}.`);
    }
  }
  if (presentation.empty_state_placeholder_count !== undefined &&
    (!Number.isInteger(presentation.empty_state_placeholder_count) ||
      presentation.empty_state_placeholder_count < 0 ||
      presentation.empty_state_placeholder_count > 24)) {
    return presentationError('Invalid presentation empty_state_placeholder_count.');
  }
  for (const field of ['background_opacity', 'mobile_background_opacity']) {
    if (presentation[field] !== undefined &&
      (typeof presentation[field] !== 'number' || !Number.isFinite(presentation[field]) ||
        presentation[field] < 0 || presentation[field] > 1)) {
      return presentationError(`Invalid presentation ${field}.`);
    }
  }
  if (presentation.background_blur !== undefined &&
    (typeof presentation.background_blur !== 'number' || !Number.isFinite(presentation.background_blur) ||
      presentation.background_blur < 0 || presentation.background_blur > 20)) {
    return presentationError('Invalid presentation background_blur.');
  }
  for (const field of ['background_image_url', 'empty_state_fallback_image_url']) {
    if (presentation[field] !== undefined && presentation[field] !== null &&
      (typeof presentation[field] !== 'string' ||
        presentation[field].length > 2048 ||
        !/^(\/|https?:\/\/)/i.test(presentation[field]))) {
      return presentationError(`Invalid presentation ${field}.`);
    }
  }
  if (presentation.footer_theme !== undefined &&
    !['light', 'dark'].includes(presentation.footer_theme)) {
    return presentationError('Invalid presentation footer_theme.');
  }

  const choreography = presentation.choreography_by_song;
  if (choreography !== undefined) {
    if (!isPlainObject(choreography) || Object.keys(choreography).length > 100) {
      return presentationError('Invalid presentation choreography_by_song.');
    }
    for (const [song, groups] of Object.entries(choreography)) {
      if (typeof song !== 'string' || !song.trim() || song.length > 160 ||
        !Array.isArray(groups) || groups.length > 50) {
        return presentationError('Invalid presentation choreography_by_song.');
      }
      const normalizedGroups = new Set();
      for (const group of groups) {
        if (typeof group !== 'string' || !group.trim() || group.length > 120) {
          return presentationError('Invalid presentation choreography_by_song.');
        }
        const normalized = group.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
        if (normalizedGroups.has(normalized)) {
          return presentationError('Duplicate choreography group for a song.');
        }
        normalizedGroups.add(normalized);
      }
    }
  }
  return null;
}

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
       canonical_url,
       presentation
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

    if (presentation !== undefined) {
      const validationError = validatePresentation(presentation);
      if (validationError) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: validationError })
        };
      }
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
    if (presentation !== undefined) changes.presentation = presentation;

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

exports.validatePresentation = validatePresentation;

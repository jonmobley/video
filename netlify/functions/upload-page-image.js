/**
 * Netlify Function: upload-page-image
 * 
 * Purpose: Handles image uploads for page share images (Open Graph images)
 * 
 * Request Body (JSON):
 *   - page (required): Page ID to update (e.g., 'oz', 'disc')
 *   - image (required): Base64 encoded image data
 *   - contentType (required): MIME type of the image (e.g., 'image/png', 'image/jpeg')
 * 
 * Returns:
 *   - imageUrl: Public URL of the uploaded image
 *   - Updated page config object on success
 *   - Error message on failure
 * 
 * Notes:
 *   - Images are stored in Netlify's public folder during build
 *   - For production, consider using a CDN or image hosting service
 *   - Validates image format and size
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth, getSecuredCorsHeaders } = require('./utils/auth');

// Initialize Supabase client with the service role key (bypasses RLS).
// The anon key must NOT be used here — page_config RLS is read-only for anon.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

if (!supabaseServiceRoleKey && process.env.SUPABASE_URL) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY is not set. ' +
    'upload-page-image requires the service role key to bypass RLS. ' +
    'Set it in Netlify environment variables.'
  );
}

if (supabaseUrl && supabaseServiceRoleKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    console.log('Supabase client created successfully for metadata storage');
  } catch (error) {
    console.error('Error creating Supabase client:', error);
  }
}

// Maximum file size in bytes (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

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

  // Require authentication for admin operations
  const authResult = requireAuth(event);
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    if (event.body && event.body.length > 8 * 1024 * 1024) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large.' } })
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
    const { page, image, contentType } = body;

    // Validate input
    if (!page || !image || !contentType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'MISSING_FIELDS', message: 'Missing required fields: page, image, contentType.' } })
      };
    }
    if (typeof page !== 'string' || page.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(page)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'BAD_PAGE', message: 'Invalid page ID.' } })
      };
    }

    // Validate content type
    if (!ALLOWED_TYPES.includes(contentType)) {
      return {
        statusCode: 415,
        headers,
        body: JSON.stringify({ error: { code: 'UNSUPPORTED_TYPE', message: `Invalid image type. Allowed: ${ALLOWED_TYPES.join(', ')}.` } })
      };
    }

    // Decode base64 image
    const imageBuffer = Buffer.from(image, 'base64');
    if (imageBuffer.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'EMPTY_FILE', message: 'Image data is empty.' } })
      };
    }

    // Validate file size
    if (imageBuffer.length > MAX_FILE_SIZE) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: { code: 'FILE_TOO_LARGE', message: `Image too large. Max ${MAX_FILE_SIZE / 1024 / 1024} MB.` } })
      };
    }

    // Generate filename
    const extension = contentType.split('/')[1];
    const filename = `og-image-${page}.${extension}`;
    
    // Upload to Netlify Blobs
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('page-images');
    
    await store.set(filename, imageBuffer, {
      metadata: {
        contentType: contentType,
        page: page,
        uploadedAt: new Date().toISOString()
      }
    });
    
    // Generate public URL for the blob
    // The blob will be accessible via Netlify's blob storage URL
    const imageUrl = `/.netlify/blobs/page-images/${filename}`;
    
    if (!supabase) {
      console.error('Supabase client not available — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: { code: 'DB_NOT_CONFIGURED', message: 'Database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' } })
      };
    }

    const { data, error } = await supabase
      .from('page_config')
      .update({ og_image_url: imageUrl })
      .eq('page', page)
      .select()
      .single();

    if (error) {
      console.error('Supabase error updating page config:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: { code: 'DB_ERROR', message: 'Failed to update page config with image URL.' } })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        imageUrl,
        pageConfig: data,
        message: 'Image uploaded successfully'
      })
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

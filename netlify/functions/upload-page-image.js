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

// Initialize Supabase client with environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
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
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Require authentication for admin operations
  const authResult = requireAuth(event);
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    const body = JSON.parse(event.body);
    const { page, image, contentType } = body;

    // Validate input
    if (!page || !image || !contentType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: page, image, contentType' })
      };
    }

    // Validate content type
    if (!ALLOWED_TYPES.includes(contentType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: `Invalid image type. Allowed types: ${ALLOWED_TYPES.join(', ')}` 
        })
      };
    }

    // Decode base64 image
    const imageBuffer = Buffer.from(image, 'base64');

    // Validate file size
    if (imageBuffer.length > MAX_FILE_SIZE) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: `Image too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` 
        })
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
    
    // Update page config with new image URL if Supabase is configured
    if (supabase) {
      const { data, error } = await supabase
        .from('page_config')
        .update({ og_image_url: imageUrl })
        .eq('page', page)
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        // Continue anyway - image was uploaded successfully
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          imageUrl,
          pageConfig: data,
          message: 'Image uploaded successfully to Netlify Blobs'
        })
      };
    } else {
      // Supabase not configured, just return the image URL
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          imageUrl,
          message: 'Image uploaded successfully to Netlify Blobs (Supabase not configured for metadata storage)'
        })
      };
    }
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};

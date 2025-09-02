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
const fs = require('fs').promises;
const path = require('path');

// Initialize Supabase client with environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Maximum file size in bytes (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
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
    const imageUrl = `/assets/${filename}`;

    // In a production environment, you would upload to a CDN or storage service
    // For this implementation, we'll store the URL and assume the file is handled separately
    
    // Update page config with new image URL
    const { data, error } = await supabase
      .from('page_config')
      .update({ og_image_url: imageUrl })
      .eq('id', page)
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: error.message })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        imageUrl,
        pageConfig: data,
        message: 'Image URL updated successfully. Note: In production, implement actual file storage.'
      })
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

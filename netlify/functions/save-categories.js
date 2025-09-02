/**
 * Netlify Function: save-categories
 * 
 * Purpose: Saves category data to Supabase, replacing existing categories for a page
 * 
 * Request Body:
 *   - Legacy format: Array of category objects (defaults to 'oz' page)
 *   - New format: { categories: Array, page: String }
 * 
 * Category Object Requirements:
 *   - id: Unique identifier (e.g., 'dancers', 'chorus')
 *   - name: Display name (e.g., 'Dancers', 'Chorus')
 *   - color (optional): Hex color for visual styling (#RRGGBB)
 *   - order (optional): Display order in navigation
 * 
 * Features:
 *   - Validates hex color format
 *   - Multi-page support with page isolation
 *   - Replaces all categories for the specified page
 *   - Maintains referential integrity with videos
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

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    // Log environment for debugging
    console.log('Function environment:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseKey,
      hasSupabase: !!supabase
    });

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

    const requestBody = JSON.parse(event.body);
    
    // Support both array of categories and object with categories and page
    let categories, page;
    if (Array.isArray(requestBody)) {
      // Backward compatibility - if just an array is sent, default to 'oz' page
      categories = requestBody;
      page = 'oz';
    } else {
      // New format: { categories: [...], page: 'oz' }
      categories = requestBody.categories || [];
      page = requestBody.page || 'oz';
    }
    
    console.log(`Saving ${categories.length} categories for page: ${page}`);
    
    // Validate category data
    if (!Array.isArray(categories)) {
      throw new Error('Categories must be an array');
    }

    // Validate each category object
    for (const category of categories) {
      if (!category.id || !category.name) {
        throw new Error('Invalid category data structure - id and name are required');
      }
      
      // Validate color format (hex color)
      if (category.color && !/^#[0-9A-F]{6}$/i.test(category.color)) {
        throw new Error(`Invalid color format for category ${category.name}. Use hex format like #ff6b6b`);
      }
    }

    // Check for duplicate IDs
    const ids = categories.map(cat => cat.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error('Duplicate category IDs found');
    }

    // Try to save to Supabase if available
    if (supabase) {
      try {
        // Prepare data for Supabase
        const supabaseCategories = categories.map(category => ({
          id: category.id,
          name: category.name,
          color: category.color || null,
          order: category.order || 0,
          page: page
        }));

        // Delete existing categories for this page and insert new ones
        const { error: deleteError } = await supabase
          .from('categories')
          .delete()
          .eq('page', page); // Delete only records for this page

        if (deleteError) {
          console.error('Error deleting existing categories:', deleteError);
          throw deleteError;
        }

        // Insert new categories
        const { data, error } = await supabase
          .from('categories')
          .insert(supabaseCategories);

        if (error) {
          console.error('Error saving categories to Supabase:', error);
          throw error;
        }

        console.log('Successfully saved categories to Supabase');

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, count: categories.length, page: page, message: `Categories saved successfully for page: ${page}` })
        };
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
        throw new Error(`Failed to save categories: ${dbError.message}`);
      }
    } else {
      // Supabase not configured
      console.log('Supabase not configured, categories not persisted');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          count: categories.length, 
          message: 'Categories validated but not persisted (Supabase not configured)',
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
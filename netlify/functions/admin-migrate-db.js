/**
 * Admin Function: One-time database migration
 * Adds show_in_dropdown column and populates all categories
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!supabase) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Supabase not configured' })
    };
  }

  try {
    const steps = [];

    // Step 1: Upsert all categories with show_in_dropdown field
    const allCategories = [
      // OZ page - Song categories (dropdown)
      { id: 'oz-oz', name: 'Oz', category_key: 'oz', order: 0, page: 'oz', show_in_dropdown: true },
      { id: 'oz-munchkinland', name: 'Munchkinland', category_key: 'munchkinland', order: 1, page: 'oz', show_in_dropdown: true },
      { id: 'oz-jitterbug', name: 'Jitterbug', category_key: 'jitterbug', order: 2, page: 'oz', show_in_dropdown: true },
      { id: 'oz-yellowbrickroad', name: 'Yellow Brick Road', category_key: 'yellowbrickroad', order: 3, page: 'oz', show_in_dropdown: true },
      // OZ page - Audience tags (pills)
      { id: 'oz-tag-chorus', name: 'Chorus', category_key: 'chorus', order: 0, page: 'oz', show_in_dropdown: false },
      { id: 'oz-tag-kids', name: 'Kids', category_key: 'kids', order: 1, page: 'oz', show_in_dropdown: false },
      { id: 'oz-tag-dancers', name: 'Dancers', category_key: 'dancers', order: 2, page: 'oz', show_in_dropdown: false },
    ];

    steps.push('Upserting categories...');

    for (const category of allCategories) {
      const { error } = await supabase
        .from('categories')
        .upsert(category, { onConflict: 'id' });

      if (error) {
        steps.push(`ERROR upserting ${category.name}: ${error.message}`);
      } else {
        steps.push(`✅ ${category.name} (${category.show_in_dropdown ? 'dropdown' : 'pill'})`);
      }
    }

    // Verify
    const { data: verifyData, error: verifyError } = await supabase
      .from('categories')
      .select('*')
      .eq('page', 'oz')
      .order('show_in_dropdown', { ascending: false })
      .order('order', { ascending: true });

    if (verifyError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: verifyError.message,
          steps,
          hint: 'The column show_in_dropdown might not exist. Please add it manually in Supabase SQL Editor: ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_in_dropdown BOOLEAN DEFAULT true;'
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Migration completed successfully',
        steps,
        categories: verifyData
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        hint: 'If you see "column show_in_dropdown does not exist", you need to add it in Supabase SQL Editor: ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_in_dropdown BOOLEAN DEFAULT true;'
      })
    };
  }
};

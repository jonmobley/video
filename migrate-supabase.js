/**
 * One-time migration script to update remote Supabase database
 * This adds the show_in_dropdown column and inserts all categories
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('🚀 Starting Supabase migration...\n');

  // Step 1: Check if show_in_dropdown column exists
  console.log('📋 Step 1: Checking database schema...');
  const { data: existingCategories, error: fetchError } = await supabase
    .from('categories')
    .select('*')
    .limit(1);

  if (fetchError) {
    console.error('❌ Error fetching categories:', fetchError);
    process.exit(1);
  }

  const hasShowInDropdown = existingCategories.length > 0 && 
    'show_in_dropdown' in existingCategories[0];

  if (!hasShowInDropdown) {
    console.log('⚠️  Column show_in_dropdown not found!');
    console.log('\n📝 You need to run this SQL in your Supabase SQL Editor:');
    console.log('---------------------------------------------------');
    console.log('ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_in_dropdown BOOLEAN DEFAULT true;');
    console.log('---------------------------------------------------\n');
    console.log('After running that SQL, run this script again.');
    process.exit(1);
  }

  console.log('✅ Schema looks good!\n');

  // Step 2: Define all categories with correct show_in_dropdown values
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

  console.log('📝 Step 2: Upserting categories...');

  for (const category of allCategories) {
    const { error } = await supabase
      .from('categories')
      .upsert(category, { onConflict: 'id' });

    if (error) {
      console.error(`❌ Error upserting ${category.name}:`, error);
    } else {
      console.log(`✅ ${category.name} (${category.show_in_dropdown ? 'dropdown' : 'pill'})`);
    }
  }

  console.log('\n🎉 Migration complete!');
  console.log('\nVerifying data...');

  // Verify the results
  const { data: verifyData, error: verifyError } = await supabase
    .from('categories')
    .select('*')
    .eq('page', 'oz')
    .order('show_in_dropdown', { ascending: false })
    .order('order', { ascending: true });

  if (verifyError) {
    console.error('❌ Error verifying:', verifyError);
  } else {
    console.log('\n📊 Categories in database:');
    console.log('Dropdown items (show_in_dropdown = true):');
    verifyData.filter(c => c.show_in_dropdown).forEach(c => {
      console.log(`  - ${c.name}`);
    });
    console.log('\nPill items (show_in_dropdown = false):');
    verifyData.filter(c => !c.show_in_dropdown).forEach(c => {
      console.log(`  - ${c.name}`);
    });
  }
}

migrate().catch(err => {
  console.error('💥 Migration failed:', err);
  process.exit(1);
});

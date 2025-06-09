// scripts/check_table.cjs
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
  try {
    // Get table info
    const { data: tableInfo, error: tableError } = await supabase
      .from('portfolio_context_embeddings')
      .select('*')
      .limit(1);

    if (tableError) {
      console.error('Error accessing table:', tableError);
      return;
    }

    console.log('Table structure:', Object.keys(tableInfo[0] || {}));
    console.log('Number of records:', tableInfo.length);

    // Get all records
    const { data: records, error: recordsError } = await supabase
      .from('portfolio_context_embeddings')
      .select('*');

    if (recordsError) {
      console.error('Error fetching records:', recordsError);
      return;
    }

    console.log('Total records:', records.length);
    if (records.length > 0) {
      console.log('Sample record:', JSON.stringify(records[0], null, 2));
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkTable(); 
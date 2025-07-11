// test_edge_function.js (ES module version)
// Test script to call the Supabase Edge Function

import { createClient } from '@supabase/supabase-js';

// Replace with your actual Supabase credentials
const SUPABASE_URL = 'https://vdxrsbzfqucnlfxlkhdu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkeHJzYnpmcXVjbmxmeGxraGR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI3NjgzNDYsImV4cCI6MjA1ODM0NDM0Nn0.mn58x3QjurHftggrAbVZFfyTIkx38ydH_yTSorVFEKI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testEmbedKnowledge() {
  console.log('Testing embed_knowledge Edge Function...');
  
  try {
    const { data, error } = await supabase.functions.invoke('embed_knowledge');
    
    if (error) {
      console.error('Error calling function:', error);
      return;
    }
    
    console.log('Function response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('✅ Knowledge base successfully embedded!');
      console.log(`📊 Stats: ${data.stats.successfulChunks}/${data.stats.totalChunks} chunks processed`);
      console.log(`🔧 Functions covered: ${data.stats.functionsCovered.join(', ')}`);
    } else {
      console.log('❌ Function failed:', data.error);
    }
    
  } catch (err) {
    console.error('Exception occurred:', err);
  }
}

// Also show curl command for manual testing
function showCurlCommand() {
  console.log('\n--- Alternative: Use curl command ---');
  console.log(`curl -X POST ${SUPABASE_URL}/functions/v1/embed_knowledge \\`);
  console.log(`  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}"`);
}

// Run the test
await testEmbedKnowledge();
showCurlCommand(); 
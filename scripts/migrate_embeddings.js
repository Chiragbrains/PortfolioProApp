import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../services/embeddingService.js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateEmbeddings() {
  try {
    // First, get all records that need migration
    const { data: records, error: fetchError } = await supabase
      .from('portfolio_context_embeddings')
      .select('id, text_content, content_type, sql_query, metadata');

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${records.length} records to migrate`);

    // Process records in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(records.length / batchSize)}`);

      // Process each record in the batch
      for (const record of batch) {
        try {
          // Generate new embedding using E5 model
          const newEmbedding = await generateEmbedding(record.text_content);

          // Update the record with new embedding
          const { error: updateError } = await supabase
            .from('portfolio_context_embeddings')
            .update({ embedding: newEmbedding })
            .eq('id', record.id);

          if (updateError) {
            console.error(`Error updating record ${record.id}:`, updateError);
          } else {
            console.log(`Successfully migrated record ${record.id}`);
          }

          // Add a small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error processing record ${record.id}:`, error);
        }
      }
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateEmbeddings(); 
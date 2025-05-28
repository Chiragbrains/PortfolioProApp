import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const huggingFaceApiKey = process.env.HF_API_TOKEN;

if (!supabaseUrl || !supabaseKey || !huggingFaceApiKey) {
  console.error('Missing required environment variables');
  console.error('Please ensure you have set:');
  console.error('- SUPABASE_URL');
  console.error('- SUPABASE_ANON_KEY');
  console.error('- HF_API_TOKEN');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateEmbedding(text) {
  try {
    // Format the input text according to E5 model requirements
    const formattedInput = `query: ${text.trim()}`;
    
    const response = await fetch('https://api-inference.huggingface.co/models/intfloat/e5-large-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${huggingFaceApiKey}`,
      },
      body: JSON.stringify({
        inputs: formattedInput,
        options: {
          wait_for_model: true,
          use_cache: true
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Hugging Face API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // The E5 model returns an array of arrays, we need the first array
    const embedding = Array.isArray(data) ? data[0] : data;
    
    // Ensure the embedding is the correct dimension (1024)
    if (!Array.isArray(embedding) || embedding.length !== 1024) {
      console.error('Received data:', data);
      throw new Error(`Invalid embedding dimension: ${embedding.length}, expected 1024`);
    }
    
    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

async function updatePortfolioEmbeddings() {
  try {
    console.log('Starting portfolio embeddings update...');
    console.log('Fetching portfolio summaries...');

    // Fetch all portfolio summaries
    const { data: summaries, error: fetchError } = await supabase
      .from('portfolio_summary')
      .select('*');

    if (fetchError) {
      throw new Error(`Failed to fetch portfolio summaries: ${fetchError.message}`);
    }

    if (!summaries || summaries.length === 0) {
      console.log('No portfolio summaries found to update');
      return;
    }

    console.log(`Found ${summaries.length} portfolio summaries to update`);

    // Process summaries in batches to avoid rate limits
    const batchSize = 5;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < summaries.length; i += batchSize) {
      const batch = summaries.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(summaries.length / batchSize)}`);

      // Process each summary in the batch
      for (const summary of batch) {
        try {
          console.log(`\nProcessing ${summary.ticker}...`);
          
          // Create a descriptive text for the embedding
          const summaryText = `Ticker: ${summary.ticker}, Company: ${summary.company_name}, Quantity: ${summary.total_quantity}, Average Cost: ${summary.average_cost_basis}, Current Price: ${summary.current_price}, Market Value: ${summary.market_value}, P&L: ${summary.pnl_dollar}, P&L Percent: ${summary.pnl_percent}`;
          
          console.log('Generating embedding...');
          const embedding = await generateEmbedding(summaryText);
          
          if (embedding) {
            console.log('Updating database...');
            console.log('Embedding length:', embedding.length);
            console.log('First few values:', embedding.slice(0, 5));
            
            // First, verify the embedding is valid
            if (!Array.isArray(embedding) || embedding.length !== 1024) {
              console.error(`Invalid embedding format for ${summary.ticker}`);
              errorCount++;
              continue;
            }

            // Update the database
            const { error: updateError } = await supabase
              .from('portfolio_summary')
              .update({ embedding: embedding })
              .eq('ticker', summary.ticker);

            if (updateError) {
              console.error(`Error updating embedding for ${summary.ticker}:`, updateError);
              errorCount++;
              continue;
            }

            // Verify the update was successful
            const { data: verifyData, error: verifyError } = await supabase
              .from('portfolio_summary')
              .select('embedding')
              .eq('ticker', summary.ticker)
              .single();

            if (verifyError) {
              console.error(`Error verifying update for ${summary.ticker}:`, verifyError);
              errorCount++;
            } else if (!verifyData.embedding) {
              console.error(`Update verification failed for ${summary.ticker}: embedding is still NULL`);
              errorCount++;
            } else {
              console.log(`Successfully updated embedding for ${summary.ticker}`);
              console.log('Verified embedding length:', verifyData.embedding.length);
              successCount++;
            }
          }

          // Add a small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error processing summary for ${summary.ticker}:`, error);
          errorCount++;
        }
      }
    }

    console.log('\nPortfolio embeddings update completed');
    console.log(`Successfully updated: ${successCount} summaries`);
    console.log(`Failed to update: ${errorCount} summaries`);
  } catch (error) {
    console.error('Portfolio embeddings update failed:', error);
    process.exit(1);
  }
}

// Run the update
updatePortfolioEmbeddings().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
}); 
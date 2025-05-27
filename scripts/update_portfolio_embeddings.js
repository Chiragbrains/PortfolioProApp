import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const huggingFaceApiKey = process.env.HF_API_TOKEN;

if (!supabaseUrl || !supabaseKey || !huggingFaceApiKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateEmbedding(text) {
  const response = await fetch('https://api-inference.huggingface.co/models/intfloat/e5-large-v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${huggingFaceApiKey}`,
    },
    body: JSON.stringify({
      inputs: text.trim(),
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
  return data;
}

async function updatePortfolioEmbeddings() {
  try {
    // Fetch all portfolio summaries
    const { data: summaries, error: fetchError } = await supabase
      .from('portfolio_summary')
      .select('*');

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${summaries.length} portfolio summaries to update`);

    // Process summaries in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < summaries.length; i += batchSize) {
      const batch = summaries.slice(i, i + batchSize);
      console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(summaries.length / batchSize)}`);

      // Process each summary in the batch
      for (const summary of batch) {
        try {
          const summaryText = `Ticker: ${summary.ticker}, Company: ${summary.company_name}, Quantity: ${summary.total_quantity}, Average Cost: ${summary.average_cost_basis}, Current Price: ${summary.current_price}, Market Value: ${summary.market_value}, P&L: ${summary.pnl_dollar}, P&L Percent: ${summary.pnl_percent}`;
          
          // Generate embedding
          const embedding = await generateEmbedding(summaryText);
          
          if (embedding) {
            // Update the summary with the new embedding
            const { error: updateError } = await supabase
              .from('portfolio_summary')
              .update({ embedding })
              .eq('ticker', summary.ticker);

            if (updateError) {
              console.error(`Error updating embedding for ${summary.ticker}:`, updateError);
            } else {
              console.log(`Successfully updated embedding for ${summary.ticker}`);
            }
          }

          // Add a small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error processing summary for ${summary.ticker}:`, error);
        }
      }
    }

    console.log('Portfolio embeddings update completed successfully');
  } catch (error) {
    console.error('Portfolio embeddings update failed:', error);
    process.exit(1);
  }
}

// Run the update
updatePortfolioEmbeddings(); 
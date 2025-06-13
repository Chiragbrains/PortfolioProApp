import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Function to generate embedding using E5 model (1024 dimensions)
async function generateEmbedding(text) {
  try {
    const formattedInput = `schema: ${text.trim()}`;
    const response = await fetch(
      'https://api-inference.huggingface.co/models/intfloat/e5-large-v2',
      {
        headers: {
          'Authorization': `Bearer ${process.env.HF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify({ inputs: formattedInput }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result[0];
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

async function addDateRangePnLContext() {
  const dateRangePnLContext = {
    content_type: 'business_rule',
    text_content: `Date Range P&L Calculation Rules:
    1. Uses the portfolio_history table for calculations
    2. For a given month range:
       - Start value: Uses first snapshot in start month
       - End value: Uses last snapshot in end month
    3. P&L is calculated as: end_total_pnl - start_total_pnl
    4. Month matching ignores year and day values
    5. Returns exactly two values for period calculations`,
    sql_query: `WITH month_bounds AS (
      SELECT 
        (SELECT date FROM portfolio_history WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM '[start_date]'::date) ORDER BY date ASC LIMIT 1) as start_date,
        (SELECT date FROM portfolio_history WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM '[end_date]'::date) ORDER BY date DESC LIMIT 1) as end_date
      )
      SELECT 
        start_period.date as start_date,
        end_period.date as end_date,
        end_period.total_pnl - start_period.total_pnl as period_pnl,
        CASE 
          WHEN start_period.total_pnl != 0 
          THEN ((end_period.total_pnl - start_period.total_pnl) / ABS(start_period.total_pnl)) * 100
          ELSE NULL 
        END as pnl_percent
      FROM month_bounds mb
      JOIN portfolio_history start_period ON start_period.date = mb.start_date
      JOIN portfolio_history end_period ON end_period.date = mb.end_date`,
    source_type: 'business_rule',
    source_name: 'date_range_pnl_calculation'
  };

  try {
    // Combine the descriptive text and the SQL query for the main content
    const combinedContent = `${dateRangePnLContext.text_content}\n\nSQL Query Template:\n${dateRangePnLContext.sql_query}`;

    console.log('Generating embedding for date range P&L context (including SQL template)...');
    // Generate embedding from the combined content so SQL structure can be matched
    const embedding = await generateEmbedding(combinedContent);

    console.log('Upserting context into portfolio_context_embeddings...');
    const { error: upsertError } = await supabase
      .from('portfolio_context_embeddings')
      .upsert({
        // content_type column does not exist, source_type is used instead.
        // text_content and sql_query are combined into the 'content' field.
        content: combinedContent,
        text_embedded: combinedContent, // Store the actual text that was embedded
        source_type: dateRangePnLContext.source_type,
        source_name: dateRangePnLContext.source_name,
        embedding: embedding,
        created_at: new Date().toISOString() // Add for consistency with other scripts
      }, {
        onConflict: 'source_name'
      });
    if (upsertError) {
      console.error('Error upserting context:', upsertError);
      process.exit(1);
    }

    console.log('Successfully added date range P&L context');
  } catch (error) {
    console.error('Failed to add date range P&L context:', error);
    process.exit(1);
  }
}

// Run the update
addDateRangePnLContext().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});

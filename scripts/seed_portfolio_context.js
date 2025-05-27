import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../services/embeddingService.js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const initialContexts = [
  {
    content_type: 'portfolio_summary',
    text_content: 'Your portfolio contains $272,330.88 in ETFs',
    sql_query: 'SELECT SUM(market_value) as etf_value FROM portfolio_summary WHERE type = \'etf\'',
    metadata: {
      query_type: 'etf_value',
      etf_value: 272330.88
    }
  },
  {
    content_type: 'portfolio_summary',
    text_content: 'You have $13,471.00 in cash',
    sql_query: 'SELECT * FROM portfolio_summary WHERE type = \'cash\'',
    metadata: {
      query_type: 'cash',
      cash_amount: 13471.00
    }
  },
  {
    content_type: 'stock_details',
    text_content: 'Apple (AAPL) has 100 shares with a market value of $17,500.00',
    sql_query: 'SELECT * FROM portfolio_summary WHERE ticker = \'AAPL\'',
    metadata: {
      ticker: 'AAPL',
      company_name: 'Apple Inc.',
      total_quantity: 100,
      market_value: 17500.00
    }
  },
  {
    content_type: 'portfolio_summary',
    text_content: 'Your total portfolio value is $285,801.88',
    sql_query: 'SELECT SUM(market_value) as total_value FROM portfolio_summary',
    metadata: {
      query_type: 'total_value',
      total_value: 285801.88
    }
  }
];

async function seedPortfolioContext() {
  try {
    console.log('Starting to seed portfolio context...');

    for (const context of initialContexts) {
      try {
        // Generate embedding for the text content
        const embedding = await generateEmbedding(context.text_content);
        
        // Insert the record with its embedding
        const { error } = await supabase
          .from('portfolio_context_embeddings')
          .insert({
            content_type: context.content_type,
            text_content: context.text_content,
            sql_query: context.sql_query,
            metadata: context.metadata,
            embedding: embedding
          });

        if (error) {
          console.error('Error inserting record:', error);
        } else {
          console.log('Successfully inserted record for:', context.text_content);
        }

        // Add a small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Error processing record:', error);
      }
    }

    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

// Run the seeding
seedPortfolioContext(); 
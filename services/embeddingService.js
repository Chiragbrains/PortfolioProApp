// services/embeddingService.js
import { HF_API_TOKEN } from '@env';
import { useSupabaseConfig } from '../SupabaseConfigContext.js';

// Function to generate embeddings using Hugging Face
export async function generateEmbedding(text) {
  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/intfloat/e5-large-v2',
      {
        headers: {
          'Authorization': `Bearer ${HF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify({ inputs: text }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Function to update portfolio summary embeddings
export async function updatePortfolioSummaryEmbeddings(supabaseClientInstance) {
  if (!supabaseClientInstance) {
    // Fallback for existing calls from React components, though ideally they'd also pass the client
    // For scripts/edge functions, supabaseClientInstance must be provided.
    console.warn('Supabase client instance not provided to updatePortfolioSummaryEmbeddings. Attempting to use hook (React context only).');
    supabaseClientInstance = useSupabaseConfig().supabaseClient;
  }
  try {
    // Fetch all portfolio summaries
    const { data: summaries, error } = await supabaseClientInstance.from('portfolio_summary')
      .select('*');

    if (error) throw error;

    // Generate embeddings for each summary
    for (const summary of summaries) {
      const summaryText = `Ticker: ${summary.ticker}, Company: ${summary.company_name}, Quantity: ${summary.total_quantity}, Average Cost: ${summary.average_cost_basis}, Current Price: ${summary.current_price}, Market Value: ${summary.market_value}, P&L: ${summary.pnl_dollar}, P&L Percent: ${summary.pnl_percent}`;
      
      // Generate embedding
      const embeddingData = await generateEmbedding(summaryText); // Expecting [[number, number, ...]]
      
      if (embeddingData && Array.isArray(embeddingData) && embeddingData.length > 0 && Array.isArray(embeddingData[0])) {
        const embeddingVector = embeddingData[0]; // Extract the actual vector
        // Update the summary with the new embedding
        // Ensure your 'embedding' column in Supabase is of type 'vector'
        // and can accept an array of numbers.
        const { error: updateError } = await supabaseClientInstance.from('portfolio_summary')
          .update({ embedding: embeddingVector })
          .eq('ticker', summary.ticker);

        if (updateError) {
          console.error(`Error updating embedding for ${summary.ticker}:`, updateError);
        }
      }
    }
  } catch (error) {
    console.error('Error updating portfolio summary embeddings:', error);
    throw error;
  }
}

// Function to update embeddings when portfolio data changes
export const refreshPortfolioEmbeddings = async (supabaseClient) => {
  if (!supabaseClient) throw new Error("Supabase client is required");
  try {
    await updatePortfolioSummaryEmbeddings(supabaseClient); // Pass the client instance
    console.log('Portfolio summary embeddings updated successfully');
  } catch (error) {
    console.error('Failed to update portfolio summary embeddings:', error);
    throw error;
  }
}

// Schema-based RAG functions
export const generateSchemaEmbedding = async (text) => {
  try {
    // Format text to emphasize its schema/metadata nature
    const formattedInput = `schema: ${text.trim()}`;
    const response = await fetch(
      'https://api-inference.huggingface.co/models/intfloat/e5-large-v2',
      {
        headers: {
          'Authorization': `Bearer ${HF_API_TOKEN}`,
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
    return result[0]; // Return the first embedding vector
  } catch (error) {
    console.error('Error generating schema embedding:', error);
    throw error;
  }
}

// Initialize the portfolio_context_embeddings table with schema information
export const initializeSchemaEmbeddings = async (supabaseClient) => {
  if (!supabaseClient) throw new Error("Supabase client is required");

  const schemaContexts = [
    // Table Definitions
    {
      content: `investment_accounts table stores raw transaction data with columns:
      - id: UUID primary key
      - ticker: stock symbol
      - account: account name
      - quantity: number of shares (positive for buy, negative for sell)
      - cost_basis: price per share at time of transaction
      - created_at: timestamp of transaction`,
      source_type: 'table_definition',
      source_name: 'investment_accounts_table'
    },
    {
      content: `portfolio_summary table stores current portfolio state with columns:
      - ticker: stock symbol (primary key)
      - company_name: full company name
      - total_quantity: current total shares held
      - average_cost_basis: weighted average purchase price
      - current_price: latest stock price
      - total_cost_basis_value: total investment amount
      - market_value: current total value
      - pnl_dollar: profit/loss in dollars
      - pnl_percent: profit/loss percentage
      - portfolio_percent: percentage of total portfolio
      - type: asset type (stock/etf/cash)
      - embedding: vector for similarity search
      - last_updated: timestamp of last update`,
      source_type: 'table_definition',
      source_name: 'portfolio_summary_table'
    },
    {
      content: `portfolio_history table tracks portfolio value over time:
      - date: date of snapshot (primary key)
      - total_value: total portfolio market value
      - total_cost_basis: total investment amount
      - total_pnl: total profit/loss
      - cash_value: cash position value
      - created_at: timestamp of snapshot`,
      source_type: 'table_definition',
      source_name: 'portfolio_history_table'
    },
    
    // Column Descriptions
    {
      content: `investment_accounts.quantity rules:
      - Positive for buy transactions
      - Negative for sell transactions
      - Represents number of shares/units
      - Must not be zero`,
      source_type: 'column_description',
      source_name: 'investment_accounts_quantity'
    },
    {
      content: `investment_accounts.cost_basis rules:
      - For buys: represents purchase price per share
      - For sells: represents sale price per share
      - Must be positive
      - Used to calculate P&L`,
      source_type: 'column_description',
      source_name: 'investment_accounts_cost_basis'
    },
    
    // Table Relationships
    {
      content: `Relationships between tables:
      1. investment_accounts -> portfolio_summary:
         - Transactions aggregate to current positions
         - Ticker links the tables
         - Cost basis weighted average flows to summary
      2. portfolio_summary -> portfolio_history:
         - Daily snapshots of portfolio totals
         - Total values and cash reconcile daily`,
      source_type: 'relationship',
      source_name: 'table_relationships'
    },
    
    // Business Rules
    {
      content: `Portfolio value calculations:
      1. Market value = current_price * total_quantity
      2. P&L % = (market_value - total_cost) / total_cost * 100
      3. Portfolio % = market_value / total_portfolio_value * 100
      4. Total portfolio value includes cash positions
      5. Negative quantities not allowed in portfolio_summary`,
      source_type: 'business_rule',
      source_name: 'portfolio_calculations'
    },
    {
      content: `Transaction rules in investment_accounts:
      1. Buy transactions have positive quantity
      2. Sell transactions have negative quantity
      3. Cost basis must be positive for buys
      4. Cost basis for sells represents sale price
      5. Transactions are immutable once created`,
      source_type: 'business_rule',
      source_name: 'transaction_rules'
    }
  ];

  try {
    // Check if there are any existing embeddings to avoid duplicate initialization
    const { data: existing, error: checkError } = await supabaseClient
      .from('portfolio_context_embeddings')
      .select('source_name')
      .limit(1);
      
    if (checkError) {
      console.error('Error checking existing embeddings:', checkError);
      throw checkError;
    }
    
    if (existing && existing.length > 0) {
      console.log('Schema embeddings already exist. Skipping initialization.');
      return;
    }

    // Process each context and generate embeddings
    for (const ctx of schemaContexts) {
      console.log(`Generating embedding for ${ctx.source_name}...`);
      const embedding = await generateSchemaEmbedding(ctx.content);
      
      // Insert into portfolio_context_embeddings
      const { error: upsertError } = await supabaseClient
        .from('portfolio_context_embeddings')
        .upsert({
          content: ctx.content,
          embedding: embedding,
          source_type: ctx.source_type,
          source_name: ctx.source_name,
          text_embedded: ctx.content, // Store original text for verification
          created_at: new Date().toISOString()
        }, {
          onConflict: 'source_name'
        });

      if (upsertError) {
        console.error(`Error upserting schema context for ${ctx.source_name}:`, upsertError);
        continue;
      }
      
      console.log(`Successfully embedded schema context for ${ctx.source_name}`);
    }
    
    console.log('Schema embeddings initialization completed successfully');
  } catch (error) {
    console.error('Error initializing schema embeddings:', error);
    throw error;
  }
}

// Function to find similar schema contexts for a query
export const findSimilarSchemaContexts = async (supabaseClient, queryText, matchThreshold = 0.7, matchCount = 5) => {
  if (!supabaseClient) throw new Error("Supabase client is required");

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateSchemaEmbedding(queryText);

    // Search for similar contexts using vector similarity
    const { data: similarContexts, error } = await supabaseClient.rpc(
      'match_portfolio_context',
      {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount
      }
    );

    if (error) throw error;

    return similarContexts || [];
  } catch (error) {
    console.error('Error finding similar schema contexts:', error);
    throw error;
  }
}
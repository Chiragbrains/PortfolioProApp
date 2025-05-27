// services/embeddingService.js
import { supabaseClient } from './supabaseClient';
import { HF_API_TOKEN } from '@env';

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
export async function updatePortfolioSummaryEmbeddings() {
  try {
    // Fetch all portfolio summaries
    const { data: summaries, error } = await supabaseClient
      .from('portfolio_summary')
      .select('*');

    if (error) throw error;

    // Generate embeddings for each summary
    for (const summary of summaries) {
      const summaryText = `Ticker: ${summary.ticker}, Company: ${summary.company_name}, Quantity: ${summary.total_quantity}, Average Cost: ${summary.average_cost_basis}, Current Price: ${summary.current_price}, Market Value: ${summary.market_value}, P&L: ${summary.pnl_dollar}, P&L Percent: ${summary.pnl_percent}`;
      
      // Generate embedding
      const embedding = await generateEmbedding(summaryText);
      
      if (embedding) {
        // Update the summary with the new embedding
        const { error: updateError } = await supabaseClient
          .from('portfolio_summary')
          .update({ embedding })
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
export async function refreshPortfolioEmbeddings() {
  try {
    await updatePortfolioSummaryEmbeddings();
    console.log('Portfolio summary embeddings updated successfully');
  } catch (error) {
    console.error('Failed to update portfolio summary embeddings:', error);
    throw error;
  }
}
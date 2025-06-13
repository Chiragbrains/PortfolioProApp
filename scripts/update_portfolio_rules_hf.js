// Script to add new portfolio calculation rules to context embeddings
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const hfApiToken = process.env.HF_API_TOKEN;

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateEmbedding(text) {
  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/intfloat/e5-large-v2',
      {
        headers: {
          'Authorization': `Bearer ${hfApiToken}`,
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
    // The API returns an array of embeddings, we need the first one
    return result[0];
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

async function addPortfolioRules() {
  try {
    const accountValueRule = {
      content: `Account total market value calculation:
      1. Join investment_accounts with portfolio_summary on ticker
      2. Get current market value from portfolio_summary for each position
      3. Sum market_value WHERE account matches
      4. Market value = current_price * quantity from portfolio_summary
      5. Filter by account name using case-insensitive match`,
      source_type: 'business_rule',
      source_name: 'account_market_value_calculation'
    };

    console.log('Generating embedding...');
    const embedding = await generateEmbedding(accountValueRule.content);
    console.log('Embedding generated successfully');

    console.log('Inserting rule into database...');
    const { data, error } = await supabase
      .from('portfolio_context_embeddings')
      .insert({
        ...accountValueRule,
        text_embedded: accountValueRule.content,
        embedding
      });

    if (error) throw error;
    console.log('Successfully added account market value calculation rule');

  } catch (error) {
    console.error('Error adding portfolio rules:', error);
  }
}

addPortfolioRules();

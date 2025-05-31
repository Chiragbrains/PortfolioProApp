// Script to add join relationship rules to context embeddings
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
    return result[0];
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

async function addPortfolioJoinRules() {
  try {
    const joinRules = [
      {
        content: `Portfolio summary and account join relationship:
        1. investment_accounts (ia) and portfolio_summary (ps) tables are linked by ticker
        2. For current value calculations:
           - Get quantity from investment_accounts
           - Get current_price from portfolio_summary
           - Multiply quantity * current_price for position value
           - SUM(quantity * current_price) for total value
        3. For account filtering:
           - Filter by account in investment_accounts table
           - Use case-insensitive ILIKE for account matching
        4. Grouping:
           - Always group by account when calculating totals
           - Include account in SELECT for proper aggregation`,
        source_type: 'relationship',
        source_name: 'portfolio_account_join_calculation'
      },
      {
        content: `Portfolio aggregation rules:
        1. Total account value requires joining:
           - Base positions from investment_accounts
           - Current prices from portfolio_summary
        2. Position matching:
           - Match positions by ticker (case-insensitive)
           - Use ILIKE for flexible ticker matching
        3. Value calculation steps:
           - Join tables ON ticker match
           - Calculate value per position
           - Sum values by account
           - Group results by account`,
        source_type: 'business_rule',
        source_name: 'portfolio_aggregation_rules'
      }
    ];

    for (const rule of joinRules) {
      console.log('Generating embedding for:', rule.source_name);
      const embedding = await generateEmbedding(rule.content);
      
      console.log('Inserting rule into database...');
      const { data, error } = await supabase
        .from('portfolio_context_embeddings')
        .insert({
          ...rule,
          text_embedded: rule.content,
          embedding
        });

      if (error) throw error;
      console.log('Successfully added rule:', rule.source_name);
    }

  } catch (error) {
    console.error('Error adding portfolio join rules:', error);
  }
}

addPortfolioJoinRules();

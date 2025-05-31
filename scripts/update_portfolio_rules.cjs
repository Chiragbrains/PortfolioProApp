// Script to add new portfolio calculation rules to context embeddings
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const { Configuration, OpenAIApi } = require('openai');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function generateEmbedding(text) {
  const response = await openai.createEmbedding({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data.data[0].embedding;
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

    // Generate embedding for the new rule
    const embedding = await generateEmbedding(accountValueRule.content);

    // Insert the new rule into portfolio_context_embeddings
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

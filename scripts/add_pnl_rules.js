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

const pnlContexts = [
  {
    content: `portfolio_history table tracks daily P&L snapshots:
    - total_pnl field shows true profit/loss excluding cash and cost basis changes
    - Use first occurence of start and first occurence of end date total_pnl values to calculate period performance
    - Can calculate P&L for any date range (day, week, month, year)
    - Always compare end_date.total_pnl - start_date.total_pnl`,
    source_type: 'table_definition',
    source_name: 'portfolio_history_pnl'
  },
  {
    content: `P&L calculation rules:
    1. Get start and end dates based on user's period request (should be only two dates)
    2. Use total_pnl field, NOT total_value (which includes cash)
    3. Calculate: end_date.total_pnl - start_date.total_pnl
    4. For percentage: (period_pnl / start_total_pnl) * 100
    5. Support flexible date ranges (week/month/quarter/year)`,
    source_type: 'business_rule',
    source_name: 'pnl_calculation_rules'
  },
  {
    content: `Example date range formats:
    - Last week: WHERE date >= CURRENT_DATE - INTERVAL '7 days'
    - Current month: WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
    - Last 3 months: WHERE date >= CURRENT_DATE - INTERVAL '3 months'
    - Year to date: WHERE date >= DATE_TRUNC('year', CURRENT_DATE)
    - Custom range: WHERE date BETWEEN '[start_date]' AND '[end_date]'`,
    source_type: 'query_pattern',
    source_name: 'date_range_patterns'
  }
];

async function addPnLRules() {
  try {
    console.log('Adding P&L calculation rules to context embeddings...');

    for (const ctx of pnlContexts) {
      const { error } = await supabase
        .from('portfolio_context_embeddings')
        .upsert({
          content: ctx.content,
          source_type: ctx.source_type,
          source_name: ctx.source_name,
          text_embedded: ctx.content,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'source_name'
        });

      if (error) {
        console.error(`Error adding context for ${ctx.source_name}:`, error);
      } else {
        console.log(`Successfully added ${ctx.source_name}`);
      }
    }

    console.log('P&L calculation rules added successfully');
  } catch (error) {
    console.error('Error adding P&L rules:', error);
    process.exit(1);
  }
}

addPnLRules();

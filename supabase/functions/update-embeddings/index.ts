/// <reference types="https://deno.land/x/deno@v1.37.1/mod.d.ts" />
/// <reference types="https://deno.land/x/deno@v1.37.1/deno.ns.d.ts" />
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Define CORS headers directly
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};
// --- Configuration ---
const YAHOO_FINANCE_API_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const CACHE_FRESHNESS_HOURS = 2;
const USER_AGENT = 'MyStockPortfolioApp/1.0 (Supabase Edge Function)';
// --- Helper Functions (Keep exactly as they were) ---
function mapInstrumentType(instrumentType) {
  if (!instrumentType) return null;
  const lowerType = instrumentType.toLowerCase();
  if (lowerType === 'equity') return 'stock';
  if (lowerType === 'etf' || lowerType === 'mutualfund') return 'etf';
  // Add 'cash' mapping if needed, though usually handled separately
  // if (lowerType === 'cash') return 'cash';
  return null;
}
async function updateStockCache(supabaseClient, ticker, currentPrice, companyName, type) {
  try {
    const utcTimestamp = new Date().toISOString();
    const { error } = await supabaseClient.from('stock_cache').upsert({
      ticker,
      current_price: currentPrice,
      company_name: companyName,
      type: type,
      last_refreshed: utcTimestamp
    }, {
      onConflict: 'ticker'
    });
    if (error) console.error(`Cache update error for ${ticker}:`, error.message);
    else console.log(`Cache updated for ${ticker}`);
  } catch (error) {
    console.error(`Cache update exception for ${ticker}:`, error.message);
  }
}
async function fetchFromCache(supabaseClient, ticker, ignoreAge = false) {
  const defaultReturn = {
    price: null,
    name: null,
    type: null,
    last_refreshed: null
  };
  try {
    const { data, error } = await supabaseClient.from('stock_cache').select('current_price, company_name, type, last_refreshed').eq('ticker', ticker).maybeSingle();
    if (error) {
      console.error(`Cache fetch error for ${ticker}:`, error.message);
      return defaultReturn;
    }
    if (data?.current_price !== null && data?.last_refreshed) {
      const cacheTime = new Date(data.last_refreshed);
      const currentTime = new Date();
      const cacheAgeHours = (currentTime.getTime() - cacheTime.getTime()) / (1000 * 60 * 60);
      if (ignoreAge || cacheAgeHours < CACHE_FRESHNESS_HOURS) {
        const reason = ignoreAge ? 'ignoring age' : `fresh (${cacheAgeHours.toFixed(2)} hrs old)`;
        console.log(`Using cached data for ${ticker} (${reason})`);
        return {
          price: data.current_price,
          name: data.company_name,
          type: data.type,
          last_refreshed: data.last_refreshed
        };
      } else {
        console.log(`Cache for ${ticker} outdated (${cacheAgeHours.toFixed(2)} hrs old).`);
        // Return stale meta even if price is outdated
        return {
          price: null,
          name: data.company_name,
          type: data.type,
          last_refreshed: data.last_refreshed
        };
      }
    }
    return defaultReturn;
  } catch (cacheError) {
    console.error(`Cache fetch exception for ${ticker}:`, cacheError.message);
    return defaultReturn;
  }
}
async function fetchCurrentPriceAndMeta(supabaseClient, ticker) {
  // Try fresh cache first
  let cachedData = await fetchFromCache(supabaseClient, ticker, false);
  if (cachedData.price !== null) {
    return {
      price: cachedData.price,
      name: cachedData.name,
      type: cachedData.type
    };
  }
  // Price not fresh or not found, try fetching from Yahoo
  let fetchedPrice = null;
  let fetchedName = cachedData.name; // Keep stale name as fallback
  let fetchedType = cachedData.type; // Keep stale type as fallback
  let nameFromYahoo = null;
  let typeFromYahoo = null;
  try {
    const url = `${YAHOO_FINANCE_API_BASE}${ticker}`;
    console.log(`Fetching URL: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT
      }
    });
    if (response.ok) {
      const data = await response.json();
      const meta = data?.chart?.result?.[0]?.meta;
      // Extract Name
      if (meta?.shortName) nameFromYahoo = meta.shortName;
      else if (meta?.longName) nameFromYahoo = meta.longName;
      if (nameFromYahoo !== null) fetchedName = nameFromYahoo; // Prefer Yahoo name
      // Extract Type
      if (meta?.instrumentType) typeFromYahoo = mapInstrumentType(meta.instrumentType);
      if (typeFromYahoo !== null) fetchedType = typeFromYahoo; // Prefer Yahoo type
      // Extract Price (prefer regularMarketPrice, fallback to close)
      const regularMarketPrice = meta?.regularMarketPrice;
      const closePriceArray = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      const lastClosePrice = closePriceArray?.[closePriceArray.length - 1]; // Get the last available close price
      if (typeof regularMarketPrice === 'number' && regularMarketPrice > 0) {
        fetchedPrice = regularMarketPrice;
      } else if (typeof lastClosePrice === 'number' && lastClosePrice > 0) {
        fetchedPrice = lastClosePrice;
        console.log(`Using last close price for ${ticker}: ${fetchedPrice}`);
      }
      if (fetchedPrice !== null) {
        console.log(`Fetched from Yahoo for ${ticker}: Price=$${fetchedPrice}, Name=${fetchedName}, Type=${fetchedType}`);
        // Update cache with fresh data
        await updateStockCache(supabaseClient, ticker, fetchedPrice, fetchedName, fetchedType);
        return {
          price: fetchedPrice,
          name: fetchedName,
          type: fetchedType
        };
      }
    }
  } catch (error) {
    console.error(`Yahoo fetch/processing error for ${ticker}:`, error);
  }
  // If Yahoo fetch failed or returned no price, try using stale cache price
  if (fetchedPrice === null) {
    console.log(`Yahoo fetch failed for ${ticker}. Trying stale cache price.`);
    cachedData = await fetchFromCache(supabaseClient, ticker, true); // Ignore age
    if (cachedData.price !== null) {
      console.log(`Using stale cache price for ${ticker}: ${cachedData.price}, Name: ${fetchedName}, Type: ${fetchedType}`);
      // Update cache with stale price but potentially updated meta
      await updateStockCache(supabaseClient, ticker, cachedData.price, fetchedName, fetchedType);
      return {
        price: cachedData.price,
        name: fetchedName,
        type: fetchedType
      };
    }
  }
  // Absolute fallback if no price could be determined
  console.error(`Could not determine price for ${ticker}. Returning null price.`);
  return {
    price: null,
    name: fetchedName,
    type: fetchedType
  };
}
// --- End Helper Functions ---
// --- Main Request Handler ---
serve(async (req)=>{
  // Get environment variables
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const hfApiKey = Deno.env.get('HF_API_TOKEN');
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables.');
  }
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // --- Initialize Supabase Client ---
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        // Required for service role key
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    // --- 1. Fetch all transactions from investment_accounts ---
    console.log("Fetching transactions from investment_accounts...");
    const { data: transactions, error: fetchError } = await supabaseClient.from('investment_accounts').select('id, ticker, account, quantity, cost_basis, created_at'); // Select necessary fields
    if (fetchError) {
      throw new Error(`Failed to fetch investment accounts: ${fetchError.message}`);
    }
    const currentTimestamp = new Date().toISOString();
    let overallMarketValue = 0;
    let overallCostBasisValue = 0;
    let overallCashValue = 0;
    let tickerSummaries = []; // Define outside the conditional blocks
    // --- 2. Handle Empty Transactions (Clear All Scenario) ---
    if (!transactions || transactions.length === 0) {
      console.log("No investment transactions found. Zeroing out portfolio_summary.");
      // Fetch existing tickers from portfolio_summary to preserve them
      const { data: existingSummaries, error: fetchExistingError } = await supabaseClient.from('portfolio_summary').select('ticker, company_name, current_price, type'); // Select fields to keep
      if (fetchExistingError) {
        console.error("Error fetching existing summary tickers:", fetchExistingError);
        // Decide if you want to throw or continue (maybe log and proceed with empty history)
        throw new Error(`Failed to fetch existing summaries: ${fetchExistingError.message}`);
      }
      if (existingSummaries && existingSummaries.length > 0) {
        // Prepare updates to zero out financial fields
        const zeroedSummaries = existingSummaries.map((existing)=>({
            ticker: existing.ticker,
            company_name: existing.company_name,
            total_quantity: 0,
            average_cost_basis: 0,
            current_price: existing.current_price,
            total_cost_basis_value: 0,
            market_value: 0,
            pnl_dollar: 0,
            pnl_percent: 0,
            portfolio_percent: 0,
            type: existing.type,
            last_updated: currentTimestamp
          }));
        // Upsert the zeroed-out summaries
        console.log(`Upserting ${zeroedSummaries.length} zeroed summary rows...`);
        const { error: upsertError } = await supabaseClient.from('portfolio_summary').upsert(zeroedSummaries, {
          onConflict: 'ticker'
        });
        if (upsertError) {
          console.error("Error upserting zeroed summaries:", upsertError);
        // Log error but continue to update history
        } else {
          console.log("Successfully zeroed out summary rows.");
        }
      } else {
        console.log("No existing summaries found to zero out.");
      }
    // Note: overallMarketValue, overallCostBasisValue, overallCashValue remain 0
    } else {
      // --- 3. Process Non-Empty Transactions (Existing Logic) ---
      console.log(`Fetched ${transactions.length} transactions. Processing...`);
      // --- 3a. Consolidate transactions by ticker ---
      console.log("Consolidating transactions by ticker...");
      const consolidatedMap = new Map();
      for (const tx of transactions){
        const ticker = tx.ticker?.toUpperCase() ?? 'UNKNOWN';
        const quantity = tx.quantity ?? 0;
        const costBasis = tx.cost_basis ?? 0;
        const existing = consolidatedMap.get(ticker) ?? {
          totalQuantity: 0,
          totalCostValue: 0
        };
        existing.totalQuantity += quantity;
        // Only add cost for positive quantity (buys/adds)
        if (quantity > 0) {
          existing.totalCostValue += quantity * costBasis;
        }
        // Note: Simple weighted average cost. Sells require more complex logic (FIFO/LIFO etc.)
        consolidatedMap.set(ticker, existing);
      }
      console.log(`Consolidated into ${consolidatedMap.size} unique tickers.`);
      // --- 3b. Fetch prices/meta and calculate initial summary ---
      console.log("Fetching prices and calculating summaries...");
      for (const [ticker, consolidated] of consolidatedMap.entries()){
        const { totalQuantity, totalCostValue } = consolidated;
        // Skip tickers with zero or negative quantity after consolidation
        if (totalQuantity <= 0) {
          console.log(`Skipping ticker ${ticker} due to zero or negative quantity (${totalQuantity}).`);
          continue; // Skip to next ticker
        }
        let metaResult;
        let finalType;
        if (ticker === 'CASH') {
          metaResult = {
            price: 1.0,
            name: 'Cash',
            type: null
          };
          finalType = 'cash';
          overallCashValue += totalQuantity; // Accumulate cash value
        } else {
          metaResult = await fetchCurrentPriceAndMeta(supabaseClient, ticker);
          finalType = metaResult.type; // Use type determined from Yahoo/cache
        }
        const currentPrice = metaResult.price;
        const marketValue = currentPrice !== null ? currentPrice * totalQuantity : 0;
        const averageCostBasis = totalQuantity > 0 ? totalCostValue / totalQuantity : 0; // Weighted average cost
        const pnlDollar = marketValue - totalCostValue;
        const pnlPercent = totalCostValue > 0 ? pnlDollar / totalCostValue * 100 : 0;
        tickerSummaries.push({
          ticker: ticker,
          company_name: metaResult.name,
          total_quantity: totalQuantity,
          average_cost_basis: averageCostBasis,
          current_price: currentPrice,
          total_cost_basis_value: totalCostValue,
          market_value: marketValue,
          pnl_dollar: pnlDollar,
          pnl_percent: pnlPercent,
          portfolio_percent: 0,
          type: finalType,
          last_updated: currentTimestamp
        });
        overallMarketValue += marketValue; // Accumulate total market value
        overallCostBasisValue += totalCostValue; // Accumulate total cost basis
      }
      console.log("Finished initial summary calculations.");
      // --- 3c. Calculate portfolio percentage ---
      console.log("Calculating portfolio percentages...");
      tickerSummaries.forEach((summary)=>{
        summary.portfolio_percent = overallMarketValue > 0 ? summary.market_value / overallMarketValue * 100 : 0;
      });
      // --- 3d. Upsert summaries into portfolio_summary table ---
      console.log(`Upserting ${tickerSummaries.length} rows into portfolio_summary...`);
      // Delete tickers from summary table that are no longer present (have zero quantity)
      const currentTickers = tickerSummaries.map((s)=>s.ticker);
      if (currentTickers.length > 0) {
        const { error: deleteError } = await supabaseClient.from('portfolio_summary').delete().not('ticker', 'in', `(${currentTickers.map((t)=>`'${t}'`).join(',')})`); // Delete where ticker NOT IN current list
        if (deleteError) {
          console.error("Error deleting old summary rows:", deleteError);
        // Log error but continue
        } else {
          console.log("Deleted obsolete summary rows (if any).");
        }
      } else {
        // If no current tickers with positive quantity, delete all summary rows (shouldn't happen if CASH exists)
        console.warn("No tickers with positive quantity found after consolidation. Deleting all summary rows.");
        const { error: deleteAllError } = await supabaseClient.from('portfolio_summary').delete().neq('ticker', 'DUMMY_VALUE_TO_DELETE_ALL'); // Delete all
        if (deleteAllError) {
          console.error("Error deleting all summary rows:", deleteAllError);
        }
      }
      // Upsert the current summaries
      if (tickerSummaries.length > 0) {
        const { data: summaryUpsertData, error: summaryUpsertError } = await supabaseClient.from('portfolio_summary').upsert(tickerSummaries, {
          onConflict: 'ticker'
        }).select('ticker'); // Select only ticker for brevity
        if (summaryUpsertError) {
          throw new Error(`Failed to save portfolio summary: ${summaryUpsertError.message}`);
        }
        console.log(`Successfully upserted ${summaryUpsertData?.length ?? 0} rows into portfolio_summary.`);
      } else {
        console.log("No valid ticker summaries to upsert.");
      }
    } // End of else block (processing non-empty transactions)
    // --- 4. Update portfolio_history table (Always runs, uses calculated totals) ---
    const overallPnl = overallMarketValue - overallCostBasisValue;
    const historySnapshotData = {
      date: currentTimestamp.split('T')[0],
      total_value: overallMarketValue,
      total_cost_basis: overallCostBasisValue,
      total_pnl: overallPnl,
      cash_value: overallCashValue,
      created_at: currentTimestamp
    };
    console.log('Upserting portfolio_history snapshot:', JSON.stringify(historySnapshotData));
    const { error: historyUpsertError } = await supabaseClient.from('portfolio_history').upsert(historySnapshotData, {
      onConflict: 'date'
    }); // Upsert based on date
    if (historyUpsertError) {
      // Warn instead of throwing, as history update is secondary
      console.warn(`Failed to save portfolio history snapshot: ${historyUpsertError.message}`);
    } else {
      console.log("Successfully upserted portfolio_history snapshot.");
    }
    // --- 5. Generate and Store Embeddings (New Step) ---
    if (hfApiKey) {
      console.log("Starting portfolio embeddings update within Edge Function...");
      // Fetch all summaries that were just updated or created.
      // Or, fetch all summaries if you want to ensure all have embeddings.
      // For simplicity, let's fetch all and update if embedding is null or if you want to refresh all.
      const { data: summariesForEmbedding, error: fetchSummariesError } = await supabaseClient.from('portfolio_summary').select('*'); // You might want to add .is('embedding', null) if you only want to fill missing ones
      if (fetchSummariesError) {
        console.error("[Embedding] Failed to fetch portfolio summaries for embedding:", fetchSummariesError.message);
      // Decide if this should be a critical error. For now, log and continue.
      } else if (summariesForEmbedding && summariesForEmbedding.length > 0) {
        console.log(`[Embedding] Found ${summariesForEmbedding.length} portfolio summaries to process for embeddings.`);
        let embeddingSuccessCount = 0;
        let embeddingErrorCount = 0;
        for (const summary of summariesForEmbedding){
          // Construct the text for embedding (same as your Node.js script)
          const summaryText = `Ticker: ${summary.ticker}, Company: ${summary.company_name}, Quantity: ${summary.total_quantity}, Average Cost: ${summary.average_cost_basis}, Current Price: ${summary.current_price}, Market Value: ${summary.market_value}, P&L: ${summary.pnl_dollar}, P&L Percent: ${summary.pnl_percent}`;
          const embeddingVector = await generateEmbeddingForSummary(summaryText, hfApiKey);
          if (embeddingVector) {
            const { error: updateEmbeddingError } = await supabaseClient.from('portfolio_summary').update({
              embedding: embeddingVector
            }) // Supabase vector type expects an array of numbers
            .eq('ticker', summary.ticker);
            if (updateEmbeddingError) {
              console.error(`[Embedding] Error updating embedding for ${summary.ticker}:`, updateEmbeddingError.message);
              embeddingErrorCount++;
            } else {
              console.log(`[Embedding] Successfully updated embedding for ${summary.ticker}`);
              embeddingSuccessCount++;
            }
          } else {
            console.warn(`[Embedding] Skipped embedding update for ${summary.ticker} due to generation failure.`);
            embeddingErrorCount++;
          }
        }
        console.log(`[Embedding] Embeddings update complete: ${embeddingSuccessCount} succeeded, ${embeddingErrorCount} failed.`);
      } else {
        console.log("[Embedding] No portfolio summaries found to update embeddings for.");
      }
    } else {
      console.log("HF_API_TOKEN not configured. Skipping embedding generation.");
    }
    // --- 6. Return success response ---
    return new Response(JSON.stringify({
      success: true,
      summaryCount: tickerSummaries.length,
      message: transactions && transactions.length > 0 ? 'Portfolio processed.' : 'Portfolio zeroed out.'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    // Catch any errors from the main try block
    console.error('Error in Edge Function:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
// Add the missing generateEmbeddingForSummary function
async function generateEmbeddingForSummary(text, apiKey) {
  try {
    const response = await fetch('https://api-inference.huggingface.co/models/intfloat/e5-large-v2', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify({
        inputs: text
      })
    });
    if (!response.ok) {
      console.error(`Embedding API error: ${response.status} ${response.statusText}`);
      return null;
    }
    const result = await response.json();
    // Flatten the nested array if it exists
    if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
      return result[0];
    }
    return result;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

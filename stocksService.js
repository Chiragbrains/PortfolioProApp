//import { supabase } from './supabaseClient';


// Fetch all stocks
export const fetchStocks = async (supabaseClient) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  const { data, error } = await supabaseClient
    .from('stocks')
    .select('*')
    .order('account', { ascending: true });
  
  if (error) {
    console.error('Error fetching stocks:', error);
    throw error;
  }
  
  if (data) {
    return data.map(stock => ({
      ...stock,
      costBasis: stock.cost_basis,
    }));
  }
  
  return data;
};

// Add a new stock
export const addStock = async (supabaseClient, stockData) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  console.error('Adding New stock:', stockData);
  try {
    const ticker = typeof stockData.ticker === 'string' ? stockData.ticker.trim() : stockData.ticker;
    const account = typeof stockData.account === 'string' ? stockData.account.trim() : stockData.account;
    const type = typeof stockData.type === 'string' ? stockData.type.toLowerCase().trim() : stockData.type.toLowerCase();
    
    const { data: newStock, error: insertError } = await supabaseClient
      .from('stocks')
      .insert([{
        ticker: ticker,
        account: account,
        quantity: stockData.quantity,
        cost_basis: stockData.costBasis,
        type: type,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);
    
    if (insertError) throw insertError;
    
    const { data: duplicates, error: fetchError } = await supabaseClient
      .from('stocks')
      .select('*')
      .eq('ticker', ticker)
      .eq('account', account);
    
    if (fetchError) throw fetchError;
    
    if (duplicates && duplicates.length > 1) {
      console.log(`Found ${duplicates.length} records for ${ticker} in account ${account}. Consolidating...`);
      
      let totalQuantity = 0;
      let totalValue = 0;
      
      duplicates.forEach(stock => {
        totalQuantity += parseFloat(stock.quantity);
        totalValue += parseFloat(stock.quantity) * parseFloat(stock.cost_basis);
      });
      
      const weightedCostBasis = totalValue / totalQuantity;
      const oldestRecord = duplicates.reduce((oldest, current) => 
        oldest.id < current.id ? oldest : current
      );
      
      const { data: updatedStock, error: updateError } = await supabaseClient
        .from('stocks')
        .update({
          quantity: totalQuantity,
          cost_basis: weightedCostBasis,
          updated_at: new Date().toISOString()
        })
        .eq('id', oldestRecord.id);
      
      if (updateError) throw updateError;
      
      const recordsToDelete = duplicates
        .filter(stock => stock.id !== oldestRecord.id)
        .map(stock => stock.id);
      
      if (recordsToDelete.length > 0) {
        const { error: deleteError } = await supabaseClient
          .from('stocks')
          .delete()
          .in('id', recordsToDelete);
        
        if (deleteError) throw deleteError;
      }
      
      console.log(`Consolidated ${duplicates.length} records into one. New quantity: ${totalQuantity}, New cost basis: ${weightedCostBasis}`);
      return updatedStock;
    }
    
    return newStock;
  } catch (error) {
    console.error('Error adding stock:', error);
    throw error;
  }
};

// Update a stock
export const updateStock = async (SupabaseClient, stockId, stockData) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  try {
    const id = parseInt(stockId, 10);
    
    if (isNaN(id)) {
      throw new Error('Invalid stock ID: must be a valid integer');
    }
    
    const ticker = typeof stockData.ticker === 'string' ? stockData.ticker.trim() : stockData.ticker;
    const account = typeof stockData.account === 'string' ? stockData.account.trim() : stockData.account;
    const type = typeof stockData.type === 'string' ? stockData.type.toLowerCase().trim() : null;

    // Ensure costBasis is defined, or set it to a default value
    const costBasis = stockData.costBasis !== undefined ? stockData.costBasis : 0; // Set to 0 or handle as needed

    const { data, error } = await supabaseClient
      .from('stocks')
      .update({
        ticker: ticker,
        account: account,
        quantity: stockData.quantity,
        cost_basis: costBasis, // Use the defined costBasis
        type: type,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating stock:', error);
    throw error;
  }
};

// Delete a stock
export const deleteStock = async (supabaseClient, stockId) => {
  const { data, error } = await supabaseClient
    .from('stocks')
    .delete()
    .eq('id', stockId);
  
  if (error) throw error;
  return data;
};

// Bulk import stocks
export const bulkImportStocks = async (supabaseClient, stocks) => {
  try {
    console.log('Starting bulk import with stocks:', stocks.length);

    // First validate the input
    if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
      throw new Error('Invalid input: empty or invalid stocks array');
    }

    const { data, error } = await supabaseClient
      .from('stocks')
      .upsert(stocks, {
        onConflict: 'ticker,account',
        returning: 'representation', // Changed from 'true' to 'representation'
        ignoreDuplicates: false     // Will update existing records
      });

    if (error) {
      console.error('Bulk import error:', error);
      throw new Error('Failed to import stocks: ' + error.message);
    }

    // Log the response for debugging
    console.log('Upsert response:', { data, error });

    // Even if no error, check if we got data back
    if (!data || data.length === 0) {
      // Data was imported but not returned, fetch the latest records
      const { data: latestData, error: fetchError } = await supabaseClient
        .from('stocks')
        .select('*')
        .in('ticker', stocks.map(s => s.ticker))
        .in('account', stocks.map(s => s.account));

      if (fetchError) {
        console.error('Error fetching updated records:', fetchError);
        throw new Error('Failed to verify imported stocks');
      }

      console.log('Successfully imported and fetched stocks:', latestData?.length || 0);
      return latestData;
    }

    console.log('Successfully imported stocks:', data.length);
    return data;
  } catch (error) {
    console.error('Unexpected error in bulkImportStocks:', error);
    throw error;
  }
};

// Truncate the stocks table
export const truncateStocks = async (supabaseClient) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  console.log("Truncating stocks table...");
  try {
    const { data, error } = await supabaseClient.rpc("truncate_stocks");
    if (error) {
      console.error("Error truncating stocks:", error);
      throw error;
    }
    console.log("Stocks table truncated successfully.");
    return data;
  } catch (error) {
    console.error("Error in truncateStocks:", error);
    throw new Error("Failed to truncate stocks table.");
  }
};

// // Fetch cached stock data
// export const getCachedStockData = async (ticker) => {
//   try {
//     const { data, error } = await supabase
//       .from('stock_cache')
//       .select('*')
//       .eq('ticker', ticker)
//       .maybeSingle();  // Changed from .single() to .maybeSingle()

//     if (error) {
//       console.error(`Error fetching cached data for ${ticker}:`, error.message);
//       return null;
//     }

//     return data;  // Will be null if no row was found
//   } catch (error) {
//     console.error(`Unexpected error fetching cached data for ${ticker}:`, error.message);
//     return null;
//   }
// };

// Add this helper function at the top of stocksService.js
// const getESTTimestamp = () => {
//   return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
// };

// export const updateStockCache = async (ticker, currentPrice) => {
//   try {
//     const utcTimestamp = new Date().toISOString(); // Get the current time in UTC ISO format

//     const { data, error } = await supabase
//       .from('stock_cache')
//       .upsert({
//         ticker,
//         current_price: currentPrice,
//         last_refreshed: utcTimestamp, // Save the timestamp in UTC ISO format
//       });

//     if (error) {
//       console.error(`Error updating cache for ${ticker}:`, error.message);
//       return null;
//     }

//     return data;
//   } catch (error) {
//     console.error(`Unexpected error updating cache for ${ticker}:`, error.message);
//     return null;
//   }
// };

// Function to fetch stock by ticker and account
export const fetchStockByTickerAndAccount = async (supabaseClient, ticker, account) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  try {
    const { data, error } = await supabaseClient
      .from('stocks') // Specify the table name
      .select('*') // Select all columns
      .eq('ticker', ticker) // Filter by ticker
      .eq('account', account) // Filter by account
      .single(); // Use .single() to get a single record

    if (error) {
      console.error('Error fetching stock:', error);
      return null; // Return null if there's an error
    }

    return data; // Return the fetched stock data
  } catch (error) {
    console.error('Error fetching stock:', error);
    return null; // Return null if there's an unexpected error
  }
};

/**
 * Fetches historical portfolio value, cost, and P&L data.
 * @param {number} limit - Optional limit for the number of days to fetch.
 * @returns {Promise<Array<{date: string, total_value: number, total_cost_basis: number, total_pnl: number}>>} - Array of history points.
 */
export const fetchPortfolioHistory = async (supabaseClient, days = 90) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  console.log(`Fetching portfolio history for the last ${days} days.`); // Log the requested duration

  try {
    // Calculate the start date
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);

    // Format the start date as YYYY-MM-DD for Supabase query
    const startDateString = startDate.toISOString().split('T')[0];
    console.log(`Fetching data from date: ${startDateString}`); // Log the calculated start date

    const { data, error } = await supabaseClient
      .from('portfolio_history')
      .select('date, total_value, total_cost_basis, total_pnl, cash_value, created_at') // Ensure these columns exist
      .gte('date', startDateString) // Filter records greater than or equal to the start date
      .order('date', { ascending: true }); // Fetch in ascending order directly

    // Log the raw response for debugging
    // console.log('Raw response from Supabase:', { data, rowCount: data?.length });

    if (error) {
      console.error('Error fetching portfolio history:', error);
      // Consider more specific error handling if needed
      throw new Error(`Failed to fetch portfolio history: ${error.message}`);
    }

    // Data is already sorted ascending by the query
    return data || []; // Return the data or an empty array if null/undefined

  } catch (error) {
    // Catch any unexpected errors during date calculation or re-throw Supabase errors
    console.error('Unexpected error fetching portfolio history:', error);
    throw error; // Re-throw for handling in the component
  }
};

/**
 * Checks the latest portfolio history timestamp and invokes the Edge Function
 * to refresh price data if the history is older than 2 hours.
 */
export const refreshPortfolioDataIfNeeded = async (supabaseClient) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  console.log('Checking if portfolio data refresh is needed...');
  try {
    // 1. Get the latest timestamp from portfolio_history
    const { data: historyData, error: historyError } = await supabaseClient
      .from('portfolio_history')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(); // Use maybeSingle in case the table is empty

    if (historyError && historyError.code !== 'PGRST116') { // Ignore "No rows found"
      console.error(`Error fetching latest portfolio history timestamp: ${historyError.message}`);
      throw new Error('Failed to check portfolio history timestamp.');
    }

    let needsRefresh = true; // Default to refresh if no history exists
    if (historyData?.created_at) {
      const lastCreatedAt = new Date(historyData.created_at);
      const now = new Date();
      const hoursSinceLastRefresh = (now.getTime() - lastCreatedAt.getTime()) / (1000 * 60 * 60);

      console.log(`Last portfolio history entry: ${lastCreatedAt.toISOString()}, Hours since: ${hoursSinceLastRefresh.toFixed(2)}`);

      if (hoursSinceLastRefresh < 2) {
        needsRefresh = false;
        console.log('Portfolio data is recent (< 2 hours). Skipping Edge Function call.');
      } else {
        console.log('Portfolio data is older than 2 hours. Triggering Edge Function.');
      }
    } else {
        console.log('No portfolio history found. Triggering Edge Function.');
    }

    // 2. Invoke Edge Function if needed
    if (needsRefresh) {
      // IMPORTANT: Replace with your actual Edge Function invocation details
      const { data: functionData, error: functionError } = await supabaseClient.functions.invoke('dynamic-service', {
          // body: JSON.stringify({ /* any payload your function needs */ }), // Add body if required
          // headers: { 'Content-Type': 'application/json' } // Add headers if required
      });

      if (functionError) {
        console.error('Error invoking Supabase Edge Function (dynamic-service):', functionError);
        // Decide if you want to throw an error or try to proceed with potentially stale cache
        throw new Error(`Failed to refresh portfolio data via Edge Function: ${functionError.message}`);
      }

      console.log('Supabase Edge Function (dynamic-service) invoked successfully.', functionData);
      // Optional: Add a small delay to allow DB updates to propagate if needed, though usually not necessary
      // await new Promise(resolve => setTimeout(resolve, 500));
    }

    return true; // Indicate success (or that refresh wasn't needed)

  } catch (error) {
    console.error('Error in refreshPortfolioDataIfNeeded:', error);
    // Re-throw the error so the calling function (in App.js) knows something went wrong
    throw error;
  }
};

/**
 * Fetches all current stock prices from the stock_cache table.
 * @returns {Promise<Map<string, number>>} A Map where keys are tickers and values are prices.
 */
export const fetchAllCachedStockData = async (supabaseClient) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  console.log('Fetching all cached stock data...');
  try {
    const { data, error } = await supabaseClient
      .from('stock_cache')
      .select('ticker, current_price'); // Select only needed columns

    if (error) {
      console.error(`Error fetching all cached data:`, error.message);
      throw error; // Throw error to be caught by the caller
    }

    // Convert the array of {ticker, current_price} into a Map for efficient lookup
    const priceMap = new Map();
    if (data) {
      data.forEach(item => {
        // Ensure ticker is uppercase for consistent lookup
        priceMap.set(item.ticker.toUpperCase(), item.current_price);
      });
    }
    console.log(`Fetched ${priceMap.size} prices from cache.`);
    return priceMap;

  } catch (error) {
    console.error(`Unexpected error fetching all cached data:`, error.message);
    throw error; // Re-throw
  }
};


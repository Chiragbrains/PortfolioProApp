import { supabase } from './supabaseClient';

// Fetch all stocks
export const fetchStocks = async () => {
  const { data, error } = await supabase
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
export const addStock = async (stockData) => {
  console.error('Adding New stock:');
  try {
    const ticker = typeof stockData.ticker === 'string' ? stockData.ticker.trim() : stockData.ticker;
    const account = typeof stockData.account === 'string' ? stockData.account.trim() : stockData.account;
    const type = typeof stockData.type === 'string' ? stockData.type.toLowerCase().trim() : stockData.type.toLowerCase();
    
    const { data: newStock, error: insertError } = await supabase
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
    
    const { data: duplicates, error: fetchError } = await supabase
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
      
      const { data: updatedStock, error: updateError } = await supabase
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
        const { error: deleteError } = await supabase
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
export const updateStock = async (stockId, stockData) => {
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

    const { data, error } = await supabase
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
export const deleteStock = async (stockId) => {
  const { data, error } = await supabase
    .from('stocks')
    .delete()
    .eq('id', stockId);
  
  if (error) throw error;
  return data;
};

// Bulk import stocks
export const bulkImportStocks = async (stocks) => {
  try {
    console.log('Starting bulk import with stocks:', stocks.length);

    // First validate the input
    if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
      throw new Error('Invalid input: empty or invalid stocks array');
    }

    const { data, error } = await supabase
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
      const { data: latestData, error: fetchError } = await supabase
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

// Clear all stocks
// export const clearAllStocks = async () => {
//   console.log("All stocks will be triggered");
//   try {
//     const { data, error } = await supabase.from("stocks").delete().neq("id", null); // Deletes all rows
//     if (error) {
//       console.error("Error clearing stocks:", error);
//       throw error;
//     }
//     console.log("All stocks cleared successfully.");
//     return data;
//   } catch (error) {
//     console.error("Error in clearAllStocks:", error);
//     throw new Error("Failed to clear all stocks.");
//   }
// };

// Truncate the stocks table
export const truncateStocks = async () => {
  console.log("Truncating stocks table...");
  try {
    const { data, error } = await supabase.rpc("truncate_stocks");
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

// Fetch cached stock data
export const getCachedStockData = async (ticker) => {
  try {
    const { data, error } = await supabase
      .from('stock_cache')
      .select('*')
      .eq('ticker', ticker)
      .maybeSingle();  // Changed from .single() to .maybeSingle()

    if (error) {
      console.error(`Error fetching cached data for ${ticker}:`, error.message);
      return null;
    }

    return data;  // Will be null if no row was found
  } catch (error) {
    console.error(`Unexpected error fetching cached data for ${ticker}:`, error.message);
    return null;
  }
};

// Add this helper function at the top of stocksService.js
// const getESTTimestamp = () => {
//   return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
// };

export const updateStockCache = async (ticker, currentPrice) => {
  try {
    const utcTimestamp = new Date().toISOString(); // Get the current time in UTC ISO format

    const { data, error } = await supabase
      .from('stock_cache')
      .upsert({
        ticker,
        current_price: currentPrice,
        last_refreshed: utcTimestamp, // Save the timestamp in UTC ISO format
      });

    if (error) {
      console.error(`Error updating cache for ${ticker}:`, error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.error(`Unexpected error updating cache for ${ticker}:`, error.message);
    return null;
  }
};

// Function to fetch stock by ticker and account
export const fetchStockByTickerAndAccount = async (ticker, account) => {
  try {
    const { data, error } = await supabase
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
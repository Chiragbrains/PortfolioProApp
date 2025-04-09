import { supabase } from './supabaseClient';

// Fetch all stocks
export const fetchStocks = async () => {
  const { data, error } = await supabase
    .from('stocks')
    .select('*');
  
  if (error) {
    console.error('Error fetching stocks:', error);
    throw error;
  }
  
  // Transform data to match expected format in the app
  if (data) {
    return data.map(stock => ({
      ...stock,
      costBasis: stock.cost_basis, // Map from database column to app property
    }));
  }
  
  return data;
};

// Add a new stock
export const addStock = async (stockData) => {
  try {
    // Ensure all string values are trimmed
    const ticker = typeof stockData.ticker === 'string' ? stockData.ticker.trim() : stockData.ticker;
    const account = typeof stockData.account === 'string' ? stockData.account.trim() : stockData.account;
    const type = typeof stockData.type === 'string' ? stockData.type.toLowerCase().trim() : stockData.type.toLowerCase();
    
    // First, insert the new stock record
    const { data: newStock, error: insertError } = await supabase
      .from('stocks')
      .insert([{
        ticker: ticker,
        account: account,
        quantity: stockData.quantity,
        cost_basis: stockData.costBasis, // Map from app property to database column
        type: type
      }]);
    
    if (insertError) throw insertError;
    
    // Now check if there are multiple records with the same ticker and account
    const { data: duplicates, error: fetchError } = await supabase
      .from('stocks')
      .select('*')
      .eq('ticker', ticker)
      .eq('account', account);
    
    if (fetchError) throw fetchError;
    
    // If multiple records exist, consolidate them
    if (duplicates && duplicates.length > 1) {
      console.log(`Found ${duplicates.length} records for ${ticker} in account ${account}. Consolidating...`);
      
      // Calculate total quantity and weighted cost basis
      let totalQuantity = 0;
      let totalValue = 0;
      
      duplicates.forEach(stock => {
        totalQuantity += parseFloat(stock.quantity);
        totalValue += parseFloat(stock.quantity) * parseFloat(stock.cost_basis);
      });
      
      const weightedCostBasis = totalValue / totalQuantity;
      
      // Keep the oldest record (lowest ID) and update it with consolidated data
      const oldestRecord = duplicates.reduce((oldest, current) => 
        oldest.id < current.id ? oldest : current
      );
      
      // Update the oldest record with consolidated data
      const { data: updatedStock, error: updateError } = await supabase
        .from('stocks')
        .update({
          quantity: totalQuantity,
          cost_basis: weightedCostBasis
        })
        .eq('id', oldestRecord.id);
      
      if (updateError) throw updateError;
      
      // Delete all other duplicate records
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
    // Ensure stockId is properly parsed as a number if it's not already
    const id = parseInt(stockId, 10);
    
    if (isNaN(id)) {
      throw new Error('Invalid stock ID: must be a valid integer');
    }
    
    // Ensure all string values are trimmed
    const ticker = typeof stockData.ticker === 'string' ? stockData.ticker.trim() : stockData.ticker;
    const account = typeof stockData.account === 'string' ? stockData.account.trim() : stockData.account;
    const type = typeof stockData.type === 'string' ? stockData.type.toLowerCase().trim() : stockData.type.toLowerCase();
    
    console.log('Updating stock with ID:', id, 'Data:', stockData);
    
    const { data, error } = await supabase
      .from('stocks')
      .update({
        ticker: ticker,
        account: account,
        quantity: stockData.quantity,
        cost_basis: stockData.costBasis, // Map from app property to database column
        type: type
      })
      .eq('id', id);
    
    if (error) {
      console.error('Error updating stock:', error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error in updateStock function:', error);
    throw error;
  }
};

// Delete a stock
export const deleteStock = async (stockId) => {
  const { data, error } = await supabase
    .from('stocks')
    .delete()
    .eq('id', stockId);
  
  if (error) {
    console.error('Error deleting stock:', error);
    throw error;
  }
  
  return data;
};

// Bulk import stocks from Excel data
export const bulkImportStocks = async (stocksData) => {
  // First, convert the data to the format expected by Supabase
  const formattedData = stocksData.map(stock => ({
    ticker: stock.ticker,
    account: stock.account,
    quantity: parseFloat(stock.quantity),
    cost_basis: parseFloat(stock.costBasis), // Map from app property to database column
    type: stock.type.toLowerCase()
  }));
  
  // Supabase has a limit on how many rows can be inserted at once
  // So we'll chunk the data into batches of 1000 records
  const chunkSize = 1000;
  const chunks = [];
  
  for (let i = 0; i < formattedData.length; i += chunkSize) {
    chunks.push(formattedData.slice(i, i + chunkSize));
  }
  
  // Process each chunk
  const results = [];
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('stocks')
      .insert(chunk);
    
    if (error) {
      console.error('Error importing chunk:', error);
      throw error;
    }
    
    if (data) results.push(...data);
  }
  
  return results;
};

// Clear all stocks (useful for testing)
export const clearAllStocks = async () => {
  const { data, error } = await supabase
    .from('stocks')
    .delete()
    .not('id', 'is', null); // This deletes all rows
  
  if (error) {
    console.error('Error clearing stocks:', error);
    throw error;
  }
  
  return data;
};
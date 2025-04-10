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
    const type = typeof stockData.type === 'string' ? stockData.type.toLowerCase().trim() : stockData.type.toLowerCase();
    
    const { data, error } = await supabase
      .from('stocks')
      .update({
        ticker: ticker,
        account: account,
        quantity: stockData.quantity,
        cost_basis: stockData.costBasis,
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
export const bulkImportStocks = async (stocksData) => {
  try {
    const formattedData = stocksData.map((stock) => ({
      ticker: stock.ticker.toUpperCase(),
      account: stock.account.trim(),
      quantity: stock.quantity,
      cost_basis: stock.costBasis,
      type: stock.type.toLowerCase(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('stocks').insert(formattedData);
    if (error) throw error;
  } catch (error) {
    console.error('Error importing stocks:', error);
    throw new Error('Failed to import stocks.');
  }
};

// Clear all stocks
export const clearAllStocks = async () => {
  try {
    const { data, error } = await supabase
      .from('stocks')
      .delete(); // Remove all rows without any condition

    if (error) {
      console.error('Error clearing stocks:', error);
      throw error;
    }

    console.log('All stocks cleared successfully.');
    return data;
  } catch (error) {
    console.error('Error in clearAllStocks:', error);
    throw new Error('Failed to clear all stocks.');
  }
};
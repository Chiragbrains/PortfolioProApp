// Updated to use investment_accounts and portfolio_summary tables

/**
 * Fetches the latest portfolio summary data.
 * @param {SupabaseClient} supabaseClient
 * @returns {Promise<Array>} Array of summary objects from portfolio_summary.
 */
export const fetchPortfolioSummary = async (supabaseClient) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  console.log("Fetching portfolio summary...");
  const { data, error } = await supabaseClient
    .from('portfolio_summary') // Query the summary table
    .select('*')
    .order('ticker', { ascending: true }); // Or order by market_value, etc.

  if (error) {
    console.error('Error fetching portfolio summary:', error);
    throw error;
  }
  console.log(`Fetched ${data?.length ?? 0} summary rows.`);
  // No need to map cost_basis, summary table has average_cost_basis etc.
  return data || [];
};

/**
 * Fetches all individual investment account transactions.
 * @param {SupabaseClient} supabaseClient
 * @returns {Promise<Array>} Array of transaction objects from investment_accounts.
 */
export const fetchInvestmentAccounts = async (supabaseClient) => {
    if (!supabaseClient) throw new Error("Supabase client is required.");
    console.log("Fetching all investment account transactions...");
    const { data, error } = await supabaseClient
      .from('investment_accounts') // Query the transactions table
      .select('*')
      .order('created_at', { ascending: true }); // Order by creation time or ticker/account

    if (error) {
      console.error('Error fetching investment accounts:', error);
      throw error;
    }
    console.log(`Fetched ${data?.length ?? 0} investment account rows.`);
    // Map cost_basis for frontend consistency if AddStockForm expects it
    // Or adjust AddStockForm to use cost_basis directly
    return data ? data.map(tx => ({ ...tx, costBasis: tx.cost_basis })) : [];
};


/**
 * Adds a new transaction to the investment_accounts table.
 * Consolidation is handled separately by the Edge Function.
 * @param {SupabaseClient} supabaseClient
 * @param {object} transactionData - { ticker, account, quantity, cost_basis, type? }
 * @returns {Promise<object|null>} The inserted transaction object.
 */
export const addInvestmentAccount = async (supabaseClient, transactionData) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  console.log('Adding new investment transaction:', transactionData);
  try {
    // Ensure strings are trimmed and ticker is uppercase
    const ticker = typeof transactionData.ticker === 'string' ? transactionData.ticker.trim().toUpperCase() : transactionData.ticker;
    const account = typeof transactionData.account === 'string' ? transactionData.account.trim() : transactionData.account;
    // Type might be optional or derived later by the Edge Function
    const type = transactionData.type ? (typeof transactionData.type === 'string' ? transactionData.type.toLowerCase().trim() : transactionData.type) : null;

    // Basic validation before insert
    if (!ticker || !account || transactionData.quantity === undefined || transactionData.cost_basis === undefined) {
        throw new Error("Missing required fields (ticker, account, quantity, cost_basis).");
    }
    const quantity = parseFloat(transactionData.quantity);
    const cost_basis = parseFloat(transactionData.cost_basis);
    if (isNaN(quantity) || isNaN(cost_basis)) {
        throw new Error("Quantity and Cost Basis must be valid numbers.");
    }
    // Add check for positive cost basis if quantity is positive (buy)
    if (quantity > 0 && cost_basis <= 0) {
        console.warn(`Warning: Adding transaction ${ticker} with positive quantity but zero or negative cost basis (${cost_basis}).`);
    }

    // Prepare data for insertion
    const insertPayload = {
        ticker: ticker,
        account: account,
        quantity: quantity,
        cost_basis: cost_basis, // Use the correct column name
        // type: type, // Include type if it's a column in investment_accounts
        
    };

    // Insert the new transaction record
    const { data: insertedData, error: insertError } = await supabaseClient
      .from('investment_accounts') // Target the transaction table
      .insert([insertPayload])
      .select() // Select the inserted row(s)
      .single(); // Expecting one row back

    if (insertError) {
        console.error('Insert transaction error:', insertError);
        throw insertError;
    }

    console.log(`Transaction for ${ticker}/${account} added successfully.`);
    // Map cost_basis for consistency if needed by frontend
    return insertedData ? { ...insertedData, costBasis: insertedData.cost_basis } : null;

  } catch (error) {
    console.error('Error in addInvestmentAccount function:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
};


/**
 * Updates an existing investment transaction by its ID.
 * @param {SupabaseClient} supabaseClient
 * @param {number | string} transactionId - The ID of the transaction to update.
 * @param {object} updateData - Fields to update (e.g., { quantity, cost_basis }).
 * @returns {Promise<object>} The updated transaction object.
 */
export const updateInvestmentAccount = async (supabaseClient, transactionId, updateData) => {
  console.log("updateInvestmentAccount received updateData:", updateData);
  if (!supabaseClient) throw new Error("Supabase client is required.");
  if (!transactionId) throw new Error("Transaction ID is required to update.");
  console.log(`Updating investment transaction ID ${transactionId} with:`, updateData);

  // Prepare payload - only update specified fields
  // Ensure cost_basis is used for the DB column
  const updatePayload = {};
  if (updateData.quantity !== undefined) updatePayload.quantity = parseFloat(updateData.quantity);
  if (updateData.cost_basis !== undefined) updatePayload.cost_basis = parseFloat(updateData.cost_basis); // Map from frontend 'cost_basis'
  // Add other fields like 'type' if they are editable at the transaction level

  // Validate payload
  if ((updatePayload.quantity !== undefined && isNaN(updatePayload.quantity)) ||
      (updatePayload.cost_basis !== undefined && isNaN(updatePayload.cost_basis))) {
      console.error("Invalid payload after parsing:", updatePayload);
      throw new Error("Quantity and Cost Basis must be valid numbers for update.");
  }
  // Check if there's anything actually to update
  if (Object.keys(updatePayload).length === 0) {
    console.warn("No valid fields provided to update for transaction ID:", transactionId);
    // Fetch and return the current data as no update is needed
    const { data: currentData, error: fetchError } = await supabaseClient.from('investment_accounts').select('*').eq('id', transactionId).maybeSingle();
    if (fetchError) throw fetchError;
    return currentData ? { ...currentData, costBasis: currentData.cost_basis } : null;
}

// Additional business logic validation
if (updatePayload.quantity !== undefined && updatePayload.quantity > 0 && (updatePayload.cost_basis === undefined || updatePayload.cost_basis <= 0)) {
    // If quantity is positive, cost basis must also be positive (or already exist and be positive)
    // This logic might need refinement depending on whether cost_basis is always updated alongside quantity
    console.warn(`Warning: Updating transaction ID ${transactionId} with positive quantity but potentially invalid cost basis.`);
}


// Perform the update based on ID
const { data, error } = await supabaseClient
  .from('investment_accounts')
  .update(updatePayload) // Payload no longer contains updated_at
  .eq('id', transactionId)
  .select()
  .single();

if (error) {
  console.error('Error updating transaction:', error.message);
  throw new Error(`Failed to update transaction: ${error.message}`);
}

console.log('Transaction updated successfully:', data);
// Map cost_basis back for consistency if frontend expects costBasis (capital B)
return data ? { ...data, costBasis: data.cost_basis } : null;
};

/**
 * Deletes an investment transaction by its ID.
 * @param {SupabaseClient} supabaseClient
 * @param {number | string} transactionId - The ID of the transaction to delete.
 * @returns {Promise<object>} Result of the delete operation.
 */
export const deleteInvestmentAccount = async (supabaseClient, transactionId) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  if (!transactionId) {
    throw new Error('Transaction ID is required to delete.');
  }
  console.log(`Deleting investment transaction ID: ${transactionId}`);

  const { data, error } = await supabaseClient
    .from('investment_accounts') // Target the transaction table
    .delete()
    .eq('id', transactionId); // Use ID as the key

  if (error) {
    console.error('Error deleting transaction:', error.message);
    throw new Error(`Failed to delete transaction: ${error.message}`);
  }

  console.log('Transaction deleted successfully:', data); // data is often null on successful delete
  return data;
};

/**
 * Bulk imports transactions into the investment_accounts table.
 * This version simply inserts all provided rows. It does not handle updates or conflicts.
 * @param {SupabaseClient} supabaseClient
 * @param {Array<object>} transactions - Array of transaction objects { ticker, account, quantity, cost_basis, type? }.
 * @returns {Promise<Array>} Array of inserted transaction objects.
 */
export const bulkImportInvestmentAccounts = async (supabaseClient, transactions) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    throw new Error('Invalid input: Transaction data must be a non-empty array.');
  }
  console.log(`Starting bulk import for ${transactions.length} transactions...`);

  // Prepare data for insert
  const preparedTransactions = transactions.map(tx => ({
      ticker: tx.ticker?.trim().toUpperCase(),
      account: tx.account?.trim(),
      quantity: parseFloat(tx.quantity),
      cost_basis: parseFloat(tx.cost_basis), // Use cost_basis from input
      // type: tx.type ? tx.type.toLowerCase().trim() : null, // Include type if needed
      
  }));

  // Basic validation
  const invalidEntry = preparedTransactions.find(tx => !tx.ticker || !tx.account || tx.quantity === undefined || tx.cost_basis === undefined || isNaN(tx.quantity) || isNaN(tx.cost_basis));
  if (invalidEntry) {
      console.error("Invalid entry found in prepared transactions:", invalidEntry);
      throw new Error("One or more transaction entries have missing or invalid required fields (ticker, account, quantity, cost_basis).");
  }

  // Use simple insert for transactions
  const { data, error } = await supabaseClient
    .from('investment_accounts') // Target the transaction table
    .insert(preparedTransactions)
    .select(); // Select the results

  if (error) {
    console.error('Bulk import error:', error.message);
    throw new Error(`Failed to import transactions: ${error.message}`);
  }

  console.log(`Successfully inserted ${data?.length ?? 0} transactions.`);
  // Map cost_basis for consistency
  return data ? data.map(tx => ({ ...tx, costBasis: tx.cost_basis })) : [];
};


/**
 * Truncates the investment_accounts table using an RPC function.
 * @param {SupabaseClient} supabaseClient
 * @returns {Promise<any>} Result of the RPC call.
 */
export const truncateInvestmentAccounts = async (supabaseClient) => {
  if (!supabaseClient) throw new Error("Supabase client is required.");
  // IMPORTANT: Ensure you have an RPC function named 'truncate_investment_accounts' in Supabase.
  const rpcName = "truncate_investment_accounts";
  console.log(`Calling ${rpcName} RPC...`);
  try {
    const { data, error } = await supabaseClient.rpc(rpcName);
    if (error) throw error;
    console.log("Investment accounts table truncated successfully via RPC.");
    return data;
  } catch (error) {
    console.error(`Error in ${rpcName}:`, error);
    throw new Error(`Failed to truncate investment accounts table: ${error.message || error}`);
  }
};

/**
 * Fetches historical portfolio data.
 * @param {SupabaseClient} supabaseClient
 * @param {number} [days=90]
 * @returns {Promise<Array>}
 */
export const fetchPortfolioHistory = async (supabaseClient, days = 90) => {
<<<<<<< HEAD
    if (!supabaseClient) {
        console.error('No supabaseClient provided to fetchPortfolioHistory');
        throw new Error('Supabase client is required');
    }
    
    try {
        console.log(`Fetching portfolio history for last ${days} days...`);
=======
    if (!supabaseClient) return null;
    
    try {
>>>>>>> 20fee5b1230c5ccb63ac341afb8facf11e00b16e
        const { data: historyData, error } = await supabaseClient
            .from('portfolio_history')
            .select('*')
            .order('date', { ascending: true })
            .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        
<<<<<<< HEAD
        if (error) {
            console.error('Error fetching portfolio history:', error);
            throw error;
        }
        
        if (!historyData || historyData.length === 0) {
            console.log('No portfolio history data found');
            return [];
        }
        
        console.log(`Found ${historyData.length} history records`);
=======
        if (error) throw error;
>>>>>>> 20fee5b1230c5ccb63ac341afb8facf11e00b16e
        
        // Process the history data to avoid double-counting cash
        const processedData = historyData.map(record => ({
            ...record,
<<<<<<< HEAD
            total_value: record.total_value || 0,
            date: record.date // Use date field
=======
            // Use total_value directly as it already includes cash
            total_value: record.total_value || 0,
            date: record.date
>>>>>>> 20fee5b1230c5ccb63ac341afb8facf11e00b16e
        }));
        
        return processedData;
        
    } catch (error) {
<<<<<<< HEAD
        console.error('Error in fetchPortfolioHistory:', error);
        throw error; // Throw the error instead of returning null
=======
        console.error('Error fetching portfolio history:', error);
        return null;
>>>>>>> 20fee5b1230c5ccb63ac341afb8facf11e00b16e
    }
};

// --- Functions below remain largely the same as they interact with history or trigger the Edge Function ---

/**
 * Checks history and invokes the 'portfolio-processor' Edge Function if needed,
 * or if forceRefresh is true.
 * The Edge Function is responsible for reading investment_accounts and updating portfolio_summary/portfolio_history.
 * If the Edge Function is invoked, this function WAITS for it to complete.
 * @param {SupabaseClient} supabaseClient
 * @param {boolean} [forceRefresh=false] - If true, bypasses the time check and always invokes the Edge Function.
 * @returns {Promise<boolean>}
 */
export const refreshPortfolioDataIfNeeded = async (supabaseClient, forceRefresh = false) => { // Added forceRefresh parameter
  if (!supabaseClient) throw new Error("Supabase client is required.");
  console.log(`Checking if portfolio data refresh is needed... (forceRefresh: ${forceRefresh})`); // Log forceRefresh status
  try {
      let needsRefresh = false;

      if (forceRefresh) {
          console.log("Forcing refresh due to explicit request.");
          needsRefresh = true;
      } else {
          // Check the timestamp of the last history entry ONLY if not forcing refresh
          const { data: historyData, error: historyError } = await supabaseClient
              .from('portfolio_history')
              .select('created_at')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

          if (historyError && historyError.code !== 'PGRST116') { // Ignore "No rows found"
              throw new Error(`Failed to check history timestamp: ${historyError.message}`);
          }

          const refreshIntervalHours = 2; // Or your desired interval

          if (!historyData?.created_at) {
              // If no history exists, definitely needs a refresh
              needsRefresh = true;
              console.log("No history found, refresh needed.");
          } else {
              const hoursSinceLastRefresh = (new Date().getTime() - new Date(historyData.created_at).getTime()) / (1000 * 60 * 60);
              if (hoursSinceLastRefresh >= refreshIntervalHours) {
                  needsRefresh = true;
                  console.log(`Last refresh was ${hoursSinceLastRefresh.toFixed(2)} hours ago, refresh needed.`);
              }
          }
      } // End of else block (checking time)


      if (needsRefresh) {
          console.log(`Triggering Edge Function: portfolio-processor and waiting for completion...`);
          const { error: functionError } = await supabaseClient.functions.invoke('portfolio-processor');

          if (functionError) {
              console.error("Edge Function invocation failed:", functionError);
              throw new Error(`Edge Function failed: ${functionError.message || 'Unknown error'}`);
          }
          console.log('Edge Function (portfolio-processor) invoked and completed successfully.');
      } else {
          console.log(`Summary/History data is recent or refresh not forced. Skipping Edge Function call.`);
      }
      return true; // Indicate check/refresh attempt was performed successfully
  } catch (error) {
      console.error('Error in refreshPortfolioDataIfNeeded:', error);
      throw error; // Re-throw the error
  }
};

/**
 * Fetches investment transactions matching a specific ticker and account.
 * @param {SupabaseClient} supabaseClient
 * @param {string} ticker
 * @param {string} account
 * @returns {Promise<Array|null>} An array of matching transaction objects, or null on error.
 */
export const fetchInvestmentAccountsByTickerAndAccount = async (supabaseClient, ticker, account) => {
    if (!supabaseClient) throw new Error("Supabase client is required.");
    try {
        const upperTicker = ticker?.trim().toUpperCase();
        const trimAccount = account?.trim();
        if (!upperTicker || !trimAccount) {
            throw new Error("Ticker and Account are required.");
        }

        const { data, error } = await supabaseClient
        .from('investment_accounts') // Query the transaction table
        .select('*')
        .eq('ticker', upperTicker)
        .eq('account', trimAccount)
        .order('created_at', { ascending: true }); // Order transactions by date

        if (error) throw error;

        // Map cost_basis for consistency if needed
        return data ? data.map(tx => ({ ...tx, costBasis: tx.cost_basis })) : [];
    } catch (error) {
        console.error('Error fetching investment accounts by ticker/account:', error);
        return null; // Return null or empty array on error?
    }
};

// Removed fetchAllCachedStockData as portfolio_summary now holds price/meta.
// Removed fetchStockByTickerAndAccount (replaced by fetchInvestmentAccountsByTickerAndAccount).

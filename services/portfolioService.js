import { refreshPortfolioEmbeddings } from './embeddingService';

export const updatePortfolioData = async (supabaseClient, newData) => {
  try {
    // Update portfolio data in Supabase
    const { data, error } = await supabaseClient
      .from('portfolio_summary')
      .upsert(newData);

    if (error) throw error;

    // After successful update, refresh embeddings
    await refreshPortfolioEmbeddings(supabaseClient);
    
    return { data, error: null };
  } catch (error) {
    console.error('Error updating portfolio data:', error);
    return { data: null, error };
  }
};

// Add this function to handle batch updates
export const batchUpdatePortfolioData = async (supabaseClient, updates) => {
  try {
    // Update portfolio data in Supabase
    const { data, error } = await supabaseClient
      .from('portfolio_summary')
      .upsert(updates);

    if (error) throw error;

    // After successful batch update, refresh embeddings
    await refreshPortfolioEmbeddings(supabaseClient);
    
    return { data, error: null };
  } catch (error) {
    console.error('Error batch updating portfolio data:', error);
    return { data: null, error };
  }
};

// Set up real-time subscription for portfolio updates
export const setupPortfolioSubscription = (supabaseClient, onUpdate) => {
  if (!supabaseClient) {
    console.error("Supabase client is required for subscription");
    return null;
  }

  const subscription = supabaseClient
    .channel('portfolio_changes')
    .on(
      'postgres_changes',
      {
        event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'portfolio_summary'
      },
      async (payload) => {
        console.log('Portfolio data changed:', payload);
        
        // Refresh embeddings after any change
        try {
          await refreshPortfolioEmbeddings(supabaseClient);
          console.log('Embeddings refreshed after portfolio update');
        } catch (error) {
          console.error('Error refreshing embeddings:', error);
        }

        // Call the provided update callback
        if (onUpdate) {
          onUpdate(payload);
        }
      }
    )
    .subscribe();

  return subscription;
};

// Function to manually trigger embedding refresh
export const triggerEmbeddingRefresh = async (supabaseClient) => {
  try {
    await refreshPortfolioEmbeddings(supabaseClient);
    console.log('Embeddings refreshed successfully');
    return { success: true };
  } catch (error) {
    console.error('Error refreshing embeddings:', error);
    return { success: false, error };
  }
};

// Update any functions that use supabaseClient to get it from context
export const fetchPortfolioSummary = async (supabaseClient) => {
  if (!supabaseClient) throw new Error("Supabase client is required");
  // ... rest of the function
}; 
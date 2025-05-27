// services/vectorSearchService.js

/**
 * Searches for relevant context in Supabase using vector similarity.
 * @param {object} supabaseClient - The Supabase client instance.
 * @param {Array<number>} queryEmbedding - The embedding vector of the user's query.
 * @param {string} originalQuery - The original user query for context.
 * @param {number} [matchCount=3] - The maximum number of matches to return.
 * @param {number} [matchThreshold=0.70] - The minimum similarity threshold for a match.
 * @returns {Promise<{query: string, results: Array<object>}>} A promise that resolves to an object containing the original query and matching documents.
 */
export const searchRelevantContext = async (supabaseClient, queryEmbedding, originalQuery, matchCount = 3, matchThreshold = 0.70) => {
  if (!supabaseClient) {
    console.error("Supabase client not available for vector search.");
    throw new Error("Supabase client is not configured.");
  }
  if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    console.error("Query embedding not provided or invalid for vector search.");
    throw new Error("Valid query embedding is required.");
  }

  try {
    // First, check if the table exists
    const { data: tableInfo, error: tableError } = await supabaseClient
      .from('portfolio_context_embeddings')
      .select('id')
      .limit(1);

    if (tableError) {
      if (tableError.code === '42P01') { // Table doesn't exist
        console.warn('Table portfolio_context_embeddings does not exist. Creating it...');
        // Create the table with the correct structure
        const { error: createError } = await supabaseClient.rpc('create_portfolio_context_table');
        if (createError) {
          throw new Error(`Failed to create table: ${createError.message}`);
        }
      } else {
        throw new Error(`Database error: ${tableError.message}`);
      }
    }

    // Now perform the vector search
    const { data, error } = await supabaseClient.rpc('match_portfolio_context', {
      query_embedding: queryEmbedding,
      match_threshold: parseFloat(matchThreshold),
      match_count: parseInt(matchCount, 10)
    });

    if (error) {
      console.error('Supabase vector search error:', error);
      throw new Error(`Vector search failed: ${error.message}`);
    }

    // Return both the original query and results for LLM formatting
    return {
      query: originalQuery,
      results: data || []
    };
  } catch (error) {
    console.error('Error in vector search:', error);
    throw error;
  }
};
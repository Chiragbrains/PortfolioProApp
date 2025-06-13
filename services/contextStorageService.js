import { generateEmbedding } from './embeddingService';

/**
 * Checks if a similar question already exists in the database
 */
async function findSimilarQuestion(supabaseClient, queryEmbedding, threshold = 0.85) {
  try {
    const { data, error } = await supabaseClient.rpc('match_portfolio_context', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: 1
    });

    if (error) {
      console.error('Error searching for similar questions:', error);
      return null;
    }

    return data?.[0] || null;
  } catch (error) {
    console.error('Error in findSimilarQuestion:', error);
    return null;
  }
}

/**
 * Saves a new question-answer pair to the database if no similar question exists
 */
export async function saveContextToDatabase(supabaseClient, {
  userQuery,
  finalAnswer,
  sqlQuery = null,
  sqlResults = null
}) {
  try {
    // Generate embedding for the user query
    const queryEmbedding = await generateEmbedding(userQuery);
    
    // Check if a similar question already exists
    const existingQuestion = await findSimilarQuestion(supabaseClient, queryEmbedding);
    if (existingQuestion) {
      console.log('Similar question found, not saving duplicate:', existingQuestion.text_content);
      return {
        saved: false,
        existingMatch: existingQuestion
      };
    }
    
    // Determine content type based on the response
    let contentType = 'direct_answer';
    let metadata = {};
    
    if (sqlQuery) {
      contentType = 'sql_query';
      metadata = {
        query_type: 'sql',
        sql_query: sqlQuery,
        results_count: sqlResults?.length || 0
      };
    }

    // Insert the record with its embedding
    const { error } = await supabaseClient
      .from('portfolio_context_embeddings')
      .insert({
        content_type: contentType,
        text_content: userQuery, // Store the original question
        sql_query: sqlQuery,     // Store the SQL if it exists
        metadata: {
          ...metadata,
          answer: finalAnswer,   // Store the formatted answer
          timestamp: new Date().toISOString()
        },
        embedding: queryEmbedding
      });

    if (error) {
      console.error('Error saving context:', error);
      return { saved: false, error };
    }

    return { saved: true };
  } catch (error) {
    console.error('Error in saveContextToDatabase:', error);
    return { saved: false, error };
  }
} 
-- Create the function for vector similarity search
CREATE OR REPLACE FUNCTION match_portfolio_context(
  query_embedding vector(1024),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id UUID,
  content_type TEXT,
  text_content TEXT,
  sql_query TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pce.id,
    pce.content_type,
    pce.text_content,
    pce.sql_query,
    pce.metadata,
    1 - (pce.embedding <=> query_embedding) AS similarity
  FROM
    portfolio_context_embeddings pce
  WHERE 1 - (pce.embedding <=> query_embedding) > match_threshold
  ORDER BY
    pce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$; 
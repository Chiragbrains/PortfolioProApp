-- Update vector dimension to 1024
-- First, alter the existing column to 1024 dimensions
ALTER TABLE portfolio_context_embeddings 
ALTER COLUMN embedding TYPE vector(1024);

-- Drop the old function if it exists
DROP FUNCTION IF EXISTS match_portfolio_context;

-- Create the new function with 1024 dimensions
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

-- Create a function to migrate existing embeddings
CREATE OR REPLACE FUNCTION migrate_embeddings_to_1024()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    row record;
BEGIN
    FOR row IN SELECT id, embedding FROM portfolio_context_embeddings LOOP
        -- Here you would need to call your embedding service to convert the 384-dim vector to 1024-dim
        -- For now, we'll just copy the existing embedding and pad it with zeros
        UPDATE portfolio_context_embeddings 
        SET embedding_1024 = array_to_vector(
            array_cat(
                vector_to_array(row.embedding),
                array_fill(0::float, ARRAY[640])  -- Pad with 640 zeros to reach 1024
            )
        )
        WHERE id = row.id;
    END LOOP;
END;
$$;

-- Execute the migration
SELECT migrate_embeddings_to_1024();

-- Drop the old column
ALTER TABLE portfolio_context_embeddings DROP COLUMN embedding;

-- Rename the new column to the original name
ALTER TABLE portfolio_context_embeddings RENAME COLUMN embedding_1024 TO embedding;

-- Drop the migration function
DROP FUNCTION migrate_embeddings_to_1024(); 
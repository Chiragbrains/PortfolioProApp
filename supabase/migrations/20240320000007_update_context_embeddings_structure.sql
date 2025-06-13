-- Update portfolio_context_embeddings table structure
-- First, rename existing columns to match new structure
ALTER TABLE IF EXISTS portfolio_context_embeddings
  RENAME COLUMN content_type TO source_type;

-- Add new columns while preserving existing data
ALTER TABLE portfolio_context_embeddings 
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS source_name TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Copy existing text_content to content column if empty
UPDATE portfolio_context_embeddings 
SET content = text_content 
WHERE content IS NULL AND text_content IS NOT NULL;

-- Rename text_content to text_embedded
ALTER TABLE portfolio_context_embeddings
  RENAME COLUMN text_content TO text_embedded;

-- Generate source_name from existing data if needed
UPDATE portfolio_context_embeddings
SET source_name = CASE 
    WHEN source_type = 'table_definition' THEN LOWER(split_part(text_embedded, ' ', 1))
    ELSE 'auto_' || id::text
  END
WHERE source_name IS NULL;

-- Remove sql_query and metadata columns after ensuring data migration
ALTER TABLE portfolio_context_embeddings
  DROP COLUMN IF EXISTS sql_query CASCADE,
  DROP COLUMN IF EXISTS metadata CASCADE;

-- Add constraints after data is migrated
ALTER TABLE portfolio_context_embeddings
  ALTER COLUMN content SET NOT NULL,
  ALTER COLUMN source_type SET NOT NULL,
  ALTER COLUMN source_name SET NOT NULL,
  ALTER COLUMN embedding SET NOT NULL,
  ADD CONSTRAINT portfolio_context_embeddings_source_name_key UNIQUE (source_name);

-- Create index on source_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_portfolio_context_embeddings_source_type 
  ON portfolio_context_embeddings(source_type);

-- Create index on source_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_portfolio_context_embeddings_source_name 
  ON portfolio_context_embeddings(source_name);

-- Drop existing function first
DROP FUNCTION IF EXISTS match_portfolio_context(vector(1024), float, int);

-- Recreate the vector similarity search function
CREATE OR REPLACE FUNCTION match_portfolio_context(
  query_embedding vector(1024),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_type TEXT,
  source_name TEXT,
  text_embedded TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pce.id,
    pce.content,
    pce.source_type,
    pce.source_name,
    pce.text_embedded,
    1 - (pce.embedding <=> query_embedding) AS similarity
  FROM portfolio_context_embeddings pce
  WHERE 1 - (pce.embedding <=> query_embedding) > match_threshold
  ORDER BY pce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

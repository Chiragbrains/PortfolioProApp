-- Fix embedding column name and dimension issues

-- First, rename the column if it exists as 'embedded'
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'portfolio_summary' 
        AND column_name = 'embedded'
    ) THEN
        ALTER TABLE portfolio_summary RENAME COLUMN embedded TO embedding;
    END IF;
END $$;

-- Drop the old function if it exists
DROP FUNCTION IF EXISTS match_portfolio_summary;

-- Create the new function with correct column name and dimension
CREATE OR REPLACE FUNCTION match_portfolio_summary(
  query_embedding vector(1024),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  ticker text,
  company_name text,
  total_quantity numeric,
  average_cost_basis numeric,
  current_price numeric,
  market_value numeric,
  pnl_dollar numeric,
  pnl_percent numeric,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ps.ticker,
    ps.company_name,
    ps.total_quantity,
    ps.average_cost_basis,
    ps.current_price,
    ps.market_value,
    ps.pnl_dollar,
    ps.pnl_percent,
    1 - (ps.embedding <=> query_embedding) AS similarity
  FROM
    portfolio_summary ps
  WHERE 1 - (ps.embedding <=> query_embedding) > match_threshold
  ORDER BY
    ps.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Recreate the index with the correct column name
DROP INDEX IF EXISTS portfolio_summary_embedding_idx;
CREATE INDEX portfolio_summary_embedding_idx 
ON portfolio_summary 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100); 
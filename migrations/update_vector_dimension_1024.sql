-- Update vector dimension to 1024
-- First, alter the existing column to 1024 dimensions
ALTER TABLE portfolio_summary 
ALTER COLUMN embedded TYPE vector(1024);

-- Drop the old function if it exists
DROP FUNCTION IF EXISTS match_portfolio_summary;

-- Create the new function with 1024 dimensions
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
    1 - (ps.embedded <=> query_embedding) AS similarity
  FROM
    portfolio_summary ps
  WHERE 1 - (ps.embedded <=> query_embedding) > match_threshold
  ORDER BY
    ps.embedded <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create an index for faster similarity search
CREATE INDEX IF NOT EXISTS portfolio_summary_embedding_idx 
ON portfolio_summary 
USING ivfflat (embedded vector_cosine_ops)
WITH (lists = 100); 
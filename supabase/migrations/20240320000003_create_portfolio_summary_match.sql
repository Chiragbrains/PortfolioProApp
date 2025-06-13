-- Create the match_portfolio_summary function for vector similarity search
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
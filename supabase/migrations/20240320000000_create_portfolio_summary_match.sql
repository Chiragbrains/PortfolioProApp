-- Create the match_portfolio_summary function
create or replace function match_portfolio_summary(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
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
language plpgsql
as $$
begin
  return query
  select
    ps.ticker,
    ps.company_name,
    ps.total_quantity,
    ps.average_cost_basis,
    ps.current_price,
    ps.market_value,
    ps.pnl_dollar,
    ps.pnl_percent,
    1 - (ps.embedding <=> query_embedding) as similarity
  from portfolio_summary ps
  where 1 - (ps.embedding <=> query_embedding) > match_threshold
  order by ps.embedding <=> query_embedding
  limit match_count;
end;
$$; 
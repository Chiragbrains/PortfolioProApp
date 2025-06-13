-- Function to update portfolio summary embeddings
create or replace function update_portfolio_summary_embeddings()
returns void
language plpgsql
as $$
declare
    summary record;
    summary_text text;
    summary_embedding vector(1024);
begin
    -- Loop through all portfolio summaries
    for summary in select * from portfolio_summary loop
        -- Create a text representation of the summary
        summary_text := format(
            'Ticker: %s, Company: %s, Quantity: %s, Average Cost: %s, Current Price: %s, Market Value: %s, P&L: %s, P&L Percent: %s',
            summary.ticker,
            summary.company_name,
            summary.total_quantity,
            summary.average_cost_basis,
            summary.current_price,
            summary.market_value,
            summary.pnl_dollar,
            summary.pnl_percent
        );

        -- Get embedding from Hugging Face (this will be called from your application)
        -- The actual embedding generation should happen in your application
        -- and then passed to this function

        -- Update the embedding in the database
        update portfolio_summary
        set embedding = summary_embedding
        where ticker = summary.ticker;
    end loop;
end;
$$; 
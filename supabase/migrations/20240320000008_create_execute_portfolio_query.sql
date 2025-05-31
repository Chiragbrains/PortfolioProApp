-- Create a function to safely execute dynamic portfolio queries
create or replace function execute_portfolio_query(query_text text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    result jsonb;
begin
    -- Validate that the query starts with SELECT
    if not starts_with(lower(query_text), 'select') then
        raise exception 'Only SELECT queries are allowed';
    end if;

    -- Execute the query and convert results to JSON
    execute 'SELECT jsonb_agg(t) FROM (' || query_text || ') t'
    into result;

    -- Handle null result
    return coalesce(result, '[]'::jsonb);
exception
    when others then
        raise exception 'Query execution failed: %', SQLERRM;
end;
$$;

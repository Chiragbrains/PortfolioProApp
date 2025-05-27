-- Create the portfolio context table
CREATE TABLE IF NOT EXISTS portfolio_context_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  text_content TEXT NOT NULL,
  sql_query TEXT,
  metadata JSONB,
  embedding vector(1024)
); 
-- Enable the pgvector extension if not already enabled
create extension if not exists vector;

-- Add embedding column to portfolio_summary table
alter table portfolio_summary 
add column if not exists embedding vector(1024);

-- Create an index for faster similarity search
create index if not exists portfolio_summary_embedding_idx 
on portfolio_summary 
using ivfflat (embedding vector_cosine_ops)
with (lists = 100); 
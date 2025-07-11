# Supabase Edge Function: Embed Knowledge

This Edge Function generates embeddings for the yfinance knowledge content and stores them in your Supabase database.

## Prerequisites

1. **Supabase CLI installed**
2. **HuggingFace API token** (for embedding generation)
3. **Supabase project** with the `yfinance_knowledge_chunks` table

## Setup

### 1. Install Supabase CLI (if not already installed)
```bash
npm install -g supabase
```

### 2. Login to Supabase
```bash
supabase login
```

### 3. Link your project
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### 4. Set Environment Variables
In your Supabase dashboard, go to Settings > Edge Functions and add these environment variables:

- `HF_API_TOKEN`: Your HuggingFace API token
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key

### 5. Deploy the Function
```bash
supabase functions deploy embed_knowledge
```

## Usage

### Call the Function
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/embed_knowledge \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Or call from JavaScript
```javascript
const { data, error } = await supabase.functions.invoke('embed_knowledge');
console.log(data);
```

## What it Does

1. **Creates chunks** from the yfinance knowledge content (70+ chunks)
2. **Generates embeddings** using HuggingFace BAAI/bge-large-en-v1.5 model
3. **Stores in database** with function names and metadata
4. **Processes in batches** to avoid API timeouts

## Expected Output

```json
{
  "success": true,
  "message": "Knowledge base successfully embedded and stored",
  "stats": {
    "totalChunks": 70,
    "successfulChunks": 70,
    "failedChunks": 0,
    "functionsCovered": ["get_info", "get_history", "get_technicals", ...],
    "knowledgeHash": "uuid-here"
  }
}
```

## Troubleshooting

### HuggingFace API Timeout
- The function processes chunks in batches of 5 to avoid timeouts
- If you still get timeouts, reduce the batch size in the code

### Database Errors
- Ensure your `yfinance_knowledge_chunks` table exists with the correct schema
- Check that your service role key has write permissions

### Environment Variables
- Verify all environment variables are set correctly
- The function will fail if any required env vars are missing

## Table Schema

Make sure your `yfinance_knowledge_chunks` table has this structure:

```sql
create extension if not exists vector;

create table yfinance_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  chunk text,
  embedding vector(1024),
  function_name text,
  parameters jsonb,
  knowledge_hash text
);
``` 
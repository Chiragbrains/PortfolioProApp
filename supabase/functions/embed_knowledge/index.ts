import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Get credentials from environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

serve(async (req) => {
  try {
    const { text } = await req.json();
    if (!text) {
      throw new Error("Request body must contain a 'text' property.");
    }

    // 1. Get the embedding from the OpenAI API
    console.log("1. Requesting embedding from OpenAI...");
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        model: "text-embedding-3-small", // A powerful and cost-effective model
      }),
    });

    if (!embeddingResponse.ok) {
      const errorBody = await embeddingResponse.json();
      throw new Error(`OpenAI API error: ${errorBody.error.message}`);
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.data[0].embedding;
    console.log("2. Embedding received successfully.");

    // 2. Store the embedding in Supabase
    console.log("3. Inserting data into Supabase...");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: insertError } = await supabase
      .from("yfinance_knowledge_chunks")
      .insert({
        chunk: text,
        embedding: embedding,
      });

    if (insertError) {
      throw insertError;
    }

    console.log("✅ Success! Data inserted into the database.");

    return new Response(JSON.stringify({ message: "Embedding successful!" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("An error occurred:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
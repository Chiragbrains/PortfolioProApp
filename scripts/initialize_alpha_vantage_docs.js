import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const functions = require('./alpha_vantage_full.json');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Get the Hugging Face API token from environment variables
const HF_API_TOKEN = process.env.HF_API_TOKEN; 

// Base URL for the Hugging Face Inference API for e5-large-v2
const HF_EMBEDDING_API_URL = 'https://api-inference.huggingface.co/models/intfloat/e5-large-v2';

// Function to generate and store embeddings for all API documentation entries
async function generateAndStoreEmbeddings() {
  // Ensure HF_API_TOKEN is set
  if (!HF_API_TOKEN) {
    console.error("Error: HF_API_TOKEN is not set in your .env file. Please set it before running the script.");
    process.exit(1); // Stop script if token is missing
  }

  const highPriorityFunctions = [
    "TIME_SERIES_DAILY",
    "NEWS_SENTIMENT",
    "OVERVIEW",
    "DIVIDENDS",
    "CASH_FLOW",
    "INCOME_STATEMENT",
    "BALANCE_SHEET",
    "CURRENCY_EXCHANGE_RATE"
  ];

  for (const fn of functions) {
    const textChunk = `${fn.description}. Return Data Fields: ${fn.return_data.join(', ')}`;
    const priorityLevel = highPriorityFunctions.includes(fn.function_code) ? 'HIGH' : 'LOW';

    try {
      // Generate embedding using Hugging Face Inference API (e5-large-v2)
      const hfResponse = await axios.post(
        HF_EMBEDDING_API_URL,
        {
          inputs: textChunk // E5 model expects 'inputs' key with the text
        },
        {
          headers: {
            'Authorization': `Bearer ${HF_API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Check if the response contains data and is not empty
      if (!hfResponse.data || hfResponse.data.length === 0) {
        console.error(`Error: No embedding data returned for ${fn.function_code}. Stopping script.`);
        process.exit(1);
      }

      // The e5-large-v2 model usually returns an array of embeddings, even for single input
      // So, the embedding will be the first element of the response array
      const embedding = hfResponse.data[0]; 

      // Ensure the embedding has the correct dimension (1024)
      if (embedding.length !== 1024) {
        console.error(`Error: Embedding for ${fn.function_code} has dimension ${embedding.length}, expected 1024. Stopping script.`);
        process.exit(1);
      }

      // Insert data into Supabase
      const { error } = await supabase.from('api_documentation_embeddings').insert({
        category: fn.category,
        function_code: fn.function_code,
        function_name: fn.function_name,
        description: fn.description,
        required_parameters: fn.required_parameters,
        optional_parameters: fn.optional_parameters,
        example_url: fn.example_url,
        return_data: fn.return_data,
        text_chunk: textChunk,
        embedding_vector: embedding,
        priority_level: priorityLevel,
        metadata: null
      });

      if (error) {
        console.error(`Error inserting ${fn.function_code}:`, error);
        process.exit(1); // Stop script on database insertion error
      } else {
        console.log(`Inserted ${fn.function_code} with priority ${priorityLevel}`);
      }
    } catch (err) {
      console.error(`Failed to generate or store embedding for ${fn.function_code}:`, err.response ? err.response.data : err.message);
      process.exit(1); // Stop script on embedding generation or insertion error
    }
  }
}

// Function to update the embedding for a given UUID by re-generating it from text_chunk
async function updateEmbedding(uuid) {
  // Ensure HF_API_TOKEN is set
  if (!HF_API_TOKEN) {
    console.error("Error: HF_API_TOKEN is not set in your .env file. Please set it before running the script.");
    process.exit(1); // Stop script if token is missing
  }

  try {
    // 1. Fetch the text_chunk associated with the UUID
    const { data: rowData, error: fetchError } = await supabase
      .from('api_documentation_embeddings')
      .select('text_chunk')
      .eq('id', uuid)
      .single();

    if (fetchError) {
      console.error(`Error fetching text_chunk for UUID ${uuid}:`, fetchError);
      process.exit(1); // Stop script on fetch error
    }

    if (!rowData || !rowData.text_chunk) {
      console.warn(`No text_chunk found for UUID ${uuid}. Cannot generate new embedding. Stopping script.`);
      process.exit(1); // Stop script if text_chunk not found
    }

    const textChunk = rowData.text_chunk;

    // 2. Generate new embedding using Hugging Face Inference API (e5-large-v2)
    const hfResponse = await axios.post(
      HF_EMBEDDING_API_URL,
      {
        inputs: textChunk
      },
      {
        headers: {
          'Authorization': `Bearer ${HF_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!hfResponse.data || hfResponse.data.length === 0) {
      console.error(`Error: No embedding data returned for UUID ${uuid}. Stopping script.`);
      process.exit(1);
    }

    const newEmbedding = hfResponse.data[0];

    // Ensure the embedding has the correct dimension (1024)
    if (newEmbedding.length !== 1024) {
      console.error(`Error: New embedding for UUID ${uuid} has dimension ${newEmbedding.length}, expected 1024. Stopping script.`);
      process.exit(1);
    }

    // 3. Update the Supabase table with the newly generated embedding
    const { data, error: updateError } = await supabase
      .from('api_documentation_embeddings')
      .update({ embedding_vector: newEmbedding })
      .eq('id', uuid);

    if (updateError) {
      console.error(`Error updating embedding for UUID ${uuid}:`, updateError);
      process.exit(1); // Stop script on database update error
    } else {
      console.log(`Successfully updated embedding for UUID ${uuid}.`);
      return true;
    }
  } catch (err) {
    console.error(`Failed to generate or update embedding for UUID ${uuid}:`, err.response ? err.response.data : err.message);
    process.exit(1); // Stop script on any other error
  }
}

// Example usage:
// To run the data insertion:
generateAndStoreEmbeddings();

// To update an embedding (replace 'YOUR_UUID_HERE' with an actual UUID from your database)
// const uuidToUpdate = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'; // Replace with a real UUID
// updateEmbedding(uuidToUpdate);
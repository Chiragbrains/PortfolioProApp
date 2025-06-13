// /Users/chirag/Downloads/Test App - Coding/PortfolioProApp/services/alphaVantageLLMService.js
import { ALPHA_VANTAGE_API_KEY, GROQ_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';
import { ChatGroq } from "@langchain/groq";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import {
  RunnableSequence,
  RunnablePassthrough,
  RunnableLambda
} from "@langchain/core/runnables";
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddingService.js';
// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); // Use imported env vars

const llmFunctionSelector = new ChatGroq({
  apiKey: GROQ_API_KEY,
  model: "llama3-8b-8192", // Or a more capable model if needed for complex parsing
  temperature: 0.1,
});

const llmResponseFormatter = new ChatGroq({
  apiKey: GROQ_API_KEY,
  model: "meta-llama/llama-4-scout-17b-16e-instruct",
  temperature: 0.3,
});

// Function to search documentation using semantic search
async function searchAlphaVantageDocs(query, threshold = 0.7, limit = 5) {
    try {
        const queryEmbeddingResult = await generateEmbedding(query);
        
        // Ensure the embedding is in the correct format (flattened array)
// The embedding service might return [[vector]] or [vector]
        const flattenedEmbedding = Array.isArray(queryEmbeddingResult) && Array.isArray(queryEmbeddingResult[0]) 
            ? queryEmbeddingResult[0] 
            : queryEmbeddingResult;
        
        if (!Array.isArray(flattenedEmbedding) || !flattenedEmbedding.every(num => typeof num === 'number')) {
            console.error('Invalid embedding format for Supabase:', flattenedEmbedding);
            throw new Error('Generated embedding is not in the expected format (array of numbers).');
        }
        
        const { data, error } = await supabase.rpc('match_api_documentation', {
            query_embedding: flattenedEmbedding,
            match_threshold: threshold,
            match_count: limit
        });

        if (error) {
            console.error('Supabase RPC error in searchAlphaVantageDocs:', error);
            throw error;
        }
        return data;
    } catch (error) {
        console.error('Error searching Alpha Vantage documentation:', error);
        throw error;
    }
}

// New function to construct Alpha Vantage API URL and extract parameters
async function constructAlphaVantageUrlAndParams(input) {
    const { userQuery } = input;
    let determinedFunctionName;
    let extractedParams = {};
    let relevantDocs = [];
    let llmResponseJson;

    try {
        relevantDocs = await searchAlphaVantageDocs(userQuery, 0.7, 7); // Fetch a few more candidates
        if (!relevantDocs || relevantDocs.length === 0) {
            throw new Error("No relevant Alpha Vantage documentation found for the query.");
        }

        // Gather general parameter info from top relevantDocs for the LLM prompt
        let paramInfoSegments = [];
        const docsForParamInfo = relevantDocs.slice(0, 5); // REDUCED: Consider top 3 docs for param info
        for (const doc of docsForParamInfo) {
            const segment = doc.text_chunk
                .split('\n')
                    .filter(line => {
                        const lowerLine = line.toLowerCase();
                        return (lowerLine.includes('(string') || lowerLine.includes('(boolean') || lowerLine.includes('(integer') || lowerLine.includes('enum:')) &&
                               (lowerLine.includes('required') || lowerLine.includes('optional') || lowerLine.startsWith('- ')); // also catch parameter list items
                    })
                    .map(line => line.trim())
                    .join('\n');
                if (segment) {
                paramInfoSegments.push(segment);
            }
        }
        const uniqueParamLines = new Set(paramInfoSegments.join('\n').split('\n').filter(line => line.trim() !== ''));
        const paramInfoForPrompt = Array.from(uniqueParamLines).join('\n').substring(0, 1500); // REDUCED: Limit size further
        // console.log('[AlphaVantageLLMService] Compiled Parameter Info for LLM (general reference):', paramInfoForPrompt);

        const functionCandidatesPrompt = relevantDocs
            .slice(0, 5) // REDUCED: Take top 5 candidates
            .map(doc => `- Function: ${doc.api_function || "N/A"}, Description Snippet: ${doc.text_chunk.substring(0, 100).replace(/\n/g, " ")}... (Similarity: ${doc.similarity.toFixed(2)})`)
            .join('\n');

        // LLM Call for Function Selection and Parameter Extraction
        const selectionAndExtractionPrompt = `User Query: "${userQuery}"

Potentially relevant Alpha Vantage API functions based on documentation search:
${functionCandidatesPrompt || "No specific function candidates found via semantic search, rely on general knowledge."}

General Parameter Documentation Snippets (for reference across various functions, use if relevant to your CHOSEN function):
${paramInfoForPrompt || "No specific parameter documentation snippets found."}

Task:
1.  Based on the User Query and the list of potentially relevant functions, determine the SINGLE MOST SUITABLE Alpha Vantage API function name to answer the query.
2.  Extract all necessary parameters for THAT CHOSEN function from the User Query.
    -   CRITICAL: Prioritize extracting a stock ticker (e.g., AAPL). If a company name is mentioned (e.g., "Apple Inc."), infer its common stock ticker for the 'symbol' parameter.
    -   For currency exchange functions (like CURRENCY_EXCHANGE_RATE), extract 'from_currency' and 'to_currency'.
    -   For digital currency functions (like DIGITAL_CURRENCY_DAILY), extract 'symbol' (crypto symbol like BTC) and 'market' (e.g., USD).
    -   For SYMBOL_SEARCH, extract 'keywords'.
    -   For NEWS_SENTIMENT, extract 'tickers', 'topics', etc. if mentioned.
    -   For queries about company fundamentals like PE Ratio, EPS, Market Cap, prioritize the 'OVERVIEW' function if available.

Return ONLY a JSON object with the following structure:
{
  "determined_function": "THE_CHOSEN_API_FUNCTION_NAME",
  "parameters": {
    "param1": "value1",
    // ... other parameters for the chosen function
  }
}Respond with ONLY the JSON object described above, and nothing else. Do not include any explanatory text before or after the JSON object.
If a required parameter for the CHOSEN function (like 'symbol' for stock functions, or 'keywords' for SYMBOL_SEARCH) cannot be reliably extracted from the user query, include it as null in the "parameters" object.
If no suitable API function can be determined from the query and candidates, return: {"determined_function": null, "parameters": {}}

Example for stock price: {"determined_function": "TIME_SERIES_INTRADAY", "parameters": {"symbol": "AAPL", "interval": "5min"}}
Example for cash flow: {"determined_function": "CASH_FLOW", "parameters": {"symbol": "AAPL"}}
Example for currency: {"determined_function": "CURRENCY_EXCHANGE_RATE", "parameters": {"from_currency": "USD", "to_currency": "JPY"}}`;

        console.log('[AlphaVantageLLMService] Sending this prompt to LLM for function selection and parameter extraction...');
        
        let llmApiResponse;
        try {
            console.log(`[AlphaVantageLLMService] Length of selectionAndExtractionPrompt: ${selectionAndExtractionPrompt.length} characters`);
            llmApiResponse = await llmFunctionSelector.invoke(selectionAndExtractionPrompt);
            // If invoke was successful, proceed to parse
            const parser = new JsonOutputParser();
            let rawContent = llmApiResponse.content;
            console.log('[AlphaVantageLLMService] Raw LLM response for selection/parameters (after successful invoke):', JSON.stringify(rawContent));

            // Attempt to extract JSON if the LLM includes extra text
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch && jsonMatch[0]) {
                try {
                    llmResponseJson = await parser.parse(jsonMatch[0]);
                } catch (e) {
                    console.warn('[AlphaVantageLLMService] Failed to parse extracted JSON block. Trying to parse raw content directly.', e);
                    llmResponseJson = await parser.parse(rawContent); // Fallback to parsing raw content
                }
            } else {
                llmResponseJson = await parser.parse(rawContent); // No clear JSON block found, try parsing raw
            }
        } catch (llmOrParseError) { // Catch errors from LLM invocation OR parsing
            console.error('[AlphaVantageLLMService] Error during LLM invocation or parsing for function/param selection:', llmOrParseError);
            if (llmApiResponse && llmApiResponse.content) {
                 console.error('[AlphaVantageLLMService] LLM raw content (if available) that led to error:', llmApiResponse.content);
            } else if (llmApiResponse) { // llmApiResponse might be the error object itself if invoke failed
                 console.error('[AlphaVantageLLMService] LLM response object (no content field or error during invoke):', llmApiResponse);
            } else {
                console.error('[AlphaVantageLLMService] llmApiResponse is undefined, error likely during invoke itself (e.g., network error, 500).');
            }
            llmResponseJson = { determined_function: null, parameters: {} }; 
        }

        if (!llmResponseJson || !llmResponseJson.determined_function) {
            console.warn(`[AlphaVantageLLMService] LLM did not determine a function or failed to parse. Attempting fallback using best semantic match.`);
            const bestMatch = relevantDocs[0]; // Already checked relevantDocs.length > 0
            if (bestMatch && bestMatch.api_function) {
                determinedFunctionName = bestMatch.api_function;
                console.log('[AlphaVantageLLMService] Fallback: Using function from best semantic match:', determinedFunctionName);

                // Build specificParamInfoText for this determinedFunctionName
                let specificParamInfoText = "";
                if (determinedFunctionName) {
                    const paramLinesForThisFunction = new Set();
                    for (const doc of relevantDocs) { // Iterate ALL relevantDocs
                        if (doc.api_function === determinedFunctionName) {
                            doc.text_chunk.split('\n').forEach(line => {
                                const lowerLine = line.toLowerCase();
                                // Filter for lines that describe parameters
                                if ((lowerLine.includes(':') && (lowerLine.includes('required') || lowerLine.includes('optional'))) ||
                                    (lowerLine.includes('(string)') || lowerLine.includes('(enum)') || lowerLine.includes('(boolean)') || lowerLine.includes('(integer)'))) {
                                    paramLinesForThisFunction.add(line.trim());
                                }
                            });
                        }
                    }
                    specificParamInfoText = Array.from(paramLinesForThisFunction).join('\n').substring(0, 2000); // Limit length
                }
                console.log(`[AlphaVantageLLMService] Specific param info for fallback function ${determinedFunctionName} (first 300 chars):`, specificParamInfoText.substring(0,300));

                // Attempt to extract params for this fallback function
                const fallbackParamPrompt = `User Query: "${userQuery}".
For Alpha Vantage function "${determinedFunctionName}", extract the primary identifying parameter(s).
Available parameter documentation for ${determinedFunctionName}:
${specificParamInfoText || "No specific parameter documentation found, use general knowledge of the function."}
Respond ONLY with a JSON object containing the parameter(s). Example: {"symbol": "AAPL"} or {"keywords": "search"} or {"from_currency": "USD", "to_currency": "JPY"}.
If no specific entity can be reliably extracted, respond with an empty JSON object or the parameter(s) as null.`;
                try {
                    const fallbackLlmParamResponse = await llmFunctionSelector.invoke(fallbackParamPrompt);
                    const parser = new JsonOutputParser();
                    extractedParams = await parser.parse(fallbackLlmParamResponse.content);
                    console.log('[AlphaVantageLLMService] Fallback extracted params for bestMatch function:', extractedParams);
                } catch (e) {
                    console.error('[AlphaVantageLLMService] Fallback parameter extraction (for bestMatch function) failed to parse or execute:', e);
                    extractedParams = {}; // Default to empty if fallback param extraction fails
                }
            } else {
                 throw new Error("LLM could not determine an API function, and no fallback from semantic search was available.");
            }
        } else {
            determinedFunctionName = llmResponseJson.determined_function;
            extractedParams = llmResponseJson.parameters || {};
        }
        
        console.log('[AlphaVantageLLMService] Final Determined API Function:', determinedFunctionName);
        console.log('[AlphaVantageLLMService] Final Extracted Parameters:', extractedParams);

        // Validate essential parameters
        if (determinedFunctionName && determinedFunctionName !== 'NEWS_SENTIMENT' && determinedFunctionName !== 'SYMBOL_SEARCH' && determinedFunctionName !== 'CURRENCY_EXCHANGE_RATE' && determinedFunctionName !== 'DIGITAL_CURRENCY_DAILY' && (!extractedParams.symbol && !extractedParams.keywords && !extractedParams.from_currency)) {
            if (['TIME_SERIES_INTRADAY', 'TIME_SERIES_DAILY', 'TIME_SERIES_DAILY_ADJUSTED', 'TIME_SERIES_WEEKLY', 'TIME_SERIES_WEEKLY_ADJUSTED', 'TIME_SERIES_MONTHLY', 'TIME_SERIES_MONTHLY_ADJUSTED', 'GLOBAL_QUOTE', 'OVERVIEW', 'EARNINGS', 'CASH_FLOW', 'INCOME_STATEMENT', 'BALANCE_SHEET'].includes(determinedFunctionName)) {
                console.warn(`[AlphaVantageLLMService] LLM did not extract a 'symbol' (or equivalent primary ID like 'keywords' or 'from_currency') for function ${determinedFunctionName}. Query: "${userQuery}"`);
            }
        }
        if (determinedFunctionName === 'SYMBOL_SEARCH' && !extractedParams.keywords) {
            console.warn(`[AlphaVantageLLMService] LLM did not extract 'keywords' for SYMBOL_SEARCH. Query: "${userQuery}"`);
        }

    } catch (error) {
        console.error('[AlphaVantageLLMService] Error in main block of function selection or parameter extraction:', error);
        if (error.message.includes('413') || error.message.includes('Content Too Large')) {
            console.warn('[AlphaVantageLLMService] LLM content too large. Attempting simplified fallback.');
            const bestMatch = relevantDocs && relevantDocs.length > 0 ? relevantDocs[0] : null;
            if (bestMatch && bestMatch.api_function) {
                determinedFunctionName = bestMatch.api_function;
                console.log('[AlphaVantageLLMService] Fallback (413 error) to function from best semantic match:', determinedFunctionName);
                
                // Build specificParamInfoText for this determinedFunctionName (413 fallback)
                let specificParamInfoTextFor413 = "";
                if (determinedFunctionName) {
                    const paramLinesForThisFunction = new Set();
                    for (const doc of relevantDocs) {
                        if (doc.api_function === determinedFunctionName) {
                            doc.text_chunk.split('\n').forEach(line => {
                                const lowerLine = line.toLowerCase();
                                if ((lowerLine.includes(':') && (lowerLine.includes('required') || lowerLine.includes('optional'))) ||
                                    (lowerLine.includes('(string)') || lowerLine.includes('(enum)') || lowerLine.includes('(boolean)') || lowerLine.includes('(integer)'))) {
                                    paramLinesForThisFunction.add(line.trim());
                                }
                            });
                        }
                    }
                    specificParamInfoTextFor413 = Array.from(paramLinesForThisFunction).join('\n').substring(0, 2000);
                }
                console.log(`[AlphaVantageLLMService] Specific param info for 413 fallback function ${determinedFunctionName} (first 300 chars):`, specificParamInfoTextFor413.substring(0,300));

                try {
                    const fallbackParamPrompt = `User Query: "${userQuery}". 
For Alpha Vantage function "${determinedFunctionName}", extract the primary identifying parameter(s).
Available parameter documentation for ${determinedFunctionName}:
${specificParamInfoTextFor413 || "No specific parameter documentation found, use general knowledge of the function."}
Respond ONLY with a JSON object. Example: {"symbol": "AAPL"} or {"keywords": "search"}. If none, use null.`;
                    const fallbackLlmParamResponse = await llmFunctionSelector.invoke(fallbackParamPrompt);
                    const parser = new JsonOutputParser();
                    extractedParams = await parser.parse(fallbackLlmParamResponse.content);
                    console.log('[AlphaVantageLLMService] Fallback (413) extracted params:', extractedParams);
                } catch (fallbackError) {
                    console.error('[AlphaVantageLLMService] Fallback (413) parameter extraction failed:', fallbackError);
                    extractedParams = {};
                }
            } else {
                throw new Error("LLM content too large, and no fallback semantic match function found.");
            }
        } else if (error.message.includes("LLM did not return valid JSON") || error.message.toLowerCase().includes("failed to parse llm response")) {
             console.warn('[AlphaVantageLLMService] LLM output was not JSON or parsing failed. Attempting simplified fallback using best semantic match.');
            const bestMatch = relevantDocs && relevantDocs.length > 0 ? relevantDocs[0] : null;
            if (bestMatch && bestMatch.api_function) {
                determinedFunctionName = bestMatch.api_function;
                console.log('[AlphaVantageLLMService] Fallback (non-JSON/parse error) to function from best semantic match:', determinedFunctionName);

                // Build specificParamInfoText for this determinedFunctionName (non-JSON fallback)
                let specificParamInfoTextForNonJson = "";
                if (determinedFunctionName) {
                    const paramLinesForThisFunction = new Set();
                    for (const doc of relevantDocs) {
                        if (doc.api_function === determinedFunctionName) {
                            doc.text_chunk.split('\n').forEach(line => {
                                const lowerLine = line.toLowerCase();
                                if ((lowerLine.includes(':') && (lowerLine.includes('required') || lowerLine.includes('optional'))) ||
                                    (lowerLine.includes('(string)') || lowerLine.includes('(enum)') || lowerLine.includes('(boolean)') || lowerLine.includes('(integer)'))) {
                                    paramLinesForThisFunction.add(line.trim());
                                }
                            });
                        }
                    }
                    specificParamInfoTextForNonJson = Array.from(paramLinesForThisFunction).join('\n').substring(0, 2000);
                }
                console.log(`[AlphaVantageLLMService] Specific param info for non-JSON fallback ${determinedFunctionName} (first 300 chars):`, specificParamInfoTextForNonJson.substring(0,300));

                try {
                    const fallbackParamPrompt = `User Query: "${userQuery}". 
For Alpha Vantage function "${determinedFunctionName}", extract the primary identifying parameter(s).
Available parameter documentation for ${determinedFunctionName}:
${specificParamInfoTextForNonJson || "No specific parameter documentation found, use general knowledge of the function."}
Respond ONLY with a JSON object. Example: {"symbol": "AAPL"} or {"keywords": "search"}. If none, use null.`;
                    const fallbackLlmParamResponse = await llmFunctionSelector.invoke(fallbackParamPrompt);
                    const parser = new JsonOutputParser();
                    extractedParams = await parser.parse(fallbackLlmParamResponse.content);
                    console.log('[AlphaVantageLLMService] Fallback (non-JSON/parse error) extracted params:', extractedParams);
                } catch (fallbackError) {
                    console.error('[AlphaVantageLLMService] Fallback (non-JSON/parse error) parameter extraction failed:', fallbackError);
                    extractedParams = {};
                }
            } else {
                 throw new Error("LLM output not JSON/parse error, and no fallback semantic match function found.");
            }
        } else {
            // Other unhandled errors
            throw error;
        }
    }

    if (!determinedFunctionName) {
        // This should ideally be handled by the fallback logic within the try-catch.
        // If it still reaches here, it means all attempts failed.
        console.error("[AlphaVantageLLMService] Critical: Could not determine Alpha Vantage function name after all attempts including fallbacks.");
        throw new Error("Could not determine Alpha Vantage function name after all attempts.");
    }

    let queryString = `https://www.alphavantage.co/query?function=${determinedFunctionName}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    for (const [key, value] of Object.entries(extractedParams)) {
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            queryString += `&${key}=${encodeURIComponent(String(value))}`;
        }
    }
    
    console.log('[AlphaVantageLLMService] Lambda 1 Output - Constructed URL:', queryString);
    console.log('[AlphaVantageLLMService] Lambda 1 Output - Relevant Docs (first 2):', relevantDocs.slice(0,2).map(d => ({f:d.api_function, s:d.similarity, c:d.text_chunk.substring(0,50) })));
    
    return { ...input, url: queryString, relevantDocs, determinedFunctionName, extractedParams };
}

// Keep existing fetchAlphaVantageDataInternal function
const fetchAlphaVantageDataInternal = async (input) => {
    const { url, userQuery, relevantDocs, determinedFunctionName, extractedParams } = input; // Pass through relevantDocs
    
    console.log(`[AlphaVantageLLMService] Lambda 2 Input - Fetching from Alpha Vantage URL: ${url}`);
    
    if (!url.includes(`function=${determinedFunctionName}`)) {
        console.warn(`[AlphaVantageLLMService] URL function mismatch! URL: ${url}, Determined Function: ${determinedFunctionName}`);
        // Potentially correct URL or handle error
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[AlphaVantageLLMService] Alpha Vantage API request failed: ${response.status} ${response.statusText}`, errorText);
            const alphaVantageData = { error: `API request failed: ${response.statusText} - ${errorText}` };
            console.log('[AlphaVantageLLMService] Lambda 2 Output (Error) - AlphaVantageData:', alphaVantageData);
            return { ...input, alphaVantageData };
        }
        const data = await response.json();

        if (data["Error Message"]) {
            console.error("[AlphaVantageLLMService] Alpha Vantage API Error:", data["Error Message"]);
            const alphaVantageData = { error: data["Error Message"] };
            console.log('[AlphaVantageLLMService] Lambda 2 Output (API Error) - AlphaVantageData:', alphaVantageData);
            return { ...input, alphaVantageData };
        }
        if (data["Note"]) { // Typically a rate limit note
            console.warn("[AlphaVantageLLMService] Alpha Vantage API Note:", data["Note"]);
            // If it's just a note, it might still contain data, or it might be an error indicator.
            // For rate limits, it often means no useful data.
            const alphaVantageData = { note: data["Note"], ...data };
            console.log('[AlphaVantageLLMService] Lambda 2 Output (API Note) - AlphaVantageData:', alphaVantageData);
            return { ...input, alphaVantageData };
        }
        console.log('[AlphaVantageLLMService] Lambda 2 Output (Success) - AlphaVantageData (first 200 chars):', JSON.stringify(data).substring(0,200));
        return { ...input, alphaVantageData: data }; // Corrected: return actual data
    } catch (error) {
        console.error("[AlphaVantageLLMService] Fetch error:", error);
        return { ...input, alphaVantageData: { error: `Fetch error: ${error.message}` } };
    }
};

// Keep existing formatFinalResponseWithLLM function
const formatFinalResponseWithLLM = async (input) => {
    const { userQuery, alphaVantageData } = input; // relevantDocs removed from input for this function's prompt

    console.log('[AlphaVantageLLMService] Lambda 3 Input - UserQuery:', userQuery);
    console.log('[AlphaVantageLLMService] Lambda 3 Input - AlphaVantageData (keys):', Object.keys(alphaVantageData || {}));

    if (!alphaVantageData || Object.keys(alphaVantageData).length === 0) {
        return "I couldn't retrieve any data from Alpha Vantage for your query. This could be due to an invalid request or an API issue.";
    }
    if (alphaVantageData.error) {
       // Provide more context if it's a "symbol not found" type error from AlphaVantage
        if (typeof alphaVantageData.error === 'string' && alphaVantageData.error.toLowerCase().includes("invalid api call") && alphaVantageData.error.toLowerCase().includes("symbol")) {
            return `There was an issue fetching data from Alpha Vantage: ${alphaVantageData.error}. This often means the stock symbol was not found or is not supported.`;
        }
        return `There was an issue fetching data from Alpha Vantage: ${alphaVantageData.error}`;
    }
    if (alphaVantageData.Information && !alphaVantageData.note && Object.keys(alphaVantageData).length === 1) { // Handle cases where "Information" is the error
        return `I received a message from Alpha Vantage: "${alphaVantageData.Information}". This might indicate an issue with the request, API limits, or an invalid symbol.`;
    }
    const dataKeys = Object.keys(alphaVantageData);
    // Check if the only significant keys are 'note' or 'Information' (often indicates rate limit or no data)
    const significantDataExists = dataKeys.some(key => key !== 'note' && key !== 'Information' && key !== 'Error Message');

    if (alphaVantageData.note && !significantDataExists) {
        return `I received a note from Alpha Vantage: "${alphaVantageData.note}". This often indicates an API limit was reached or there's an issue with the request, and I couldn't get detailed data.`;
    }

    const systemPrompt = `You are a helpful financial assistant. Your task is to answer the user's question based *only* on the provided data from Alpha Vantage. Be concise and clear. If the data is complex, summarize the key points relevant to the user's query.
If the provided data does not seem to directly answer the question, state what information you found and that it might not fully address the query.
Do not make up information or use external knowledge. Format numbers like currency and percentages appropriately.
If the data contains an error message or a note indicating a problem (like a rate limit or invalid symbol), explain that to the user.`;

    // Limit the size of data sent to LLM to avoid overly long prompts
    // Create the string representation that would ideally be sent to the LLM
    let stringToSendToLLM = JSON.stringify(alphaVantageData, null, 2); // Pretty print for LLM

    if (stringToSendToLLM.length > 35000) {
        // If the pretty-printed version is too long, truncate it.
        stringToSendToLLM = stringToSendToLLM.substring(0, 35000) + "\n... (data truncated due to length, some information might be incomplete or cut off)";
        console.warn("[AlphaVantageLLMService] Alpha Vantage data (pretty-printed) is large, sending truncated string (first 35000 chars) to LLM.");
    }

    const humanPrompt = `The user asked: "${userQuery}"

Here is the data retrieved from Alpha Vantage:
${stringToSendToLLM}

Based ONLY on this data, please provide a response to the user's question.`;

    try {
        const llmResponse = await llmResponseFormatter.invoke([
            { type: "system", content: systemPrompt },
            { type: "human", content: humanPrompt },
        ]);
        return llmResponse.content.trim();
    } catch (error) {
        console.error("[AlphaVantageLLMService] LLM final formatting error:", error);
        return "Sorry, I encountered an error while trying to formulate a response from the fetched data.";
    }
};

// Update the chain to use new URL construction
const alphaVantageChain = RunnableSequence.from([
    new RunnableLambda({ func: constructAlphaVantageUrlAndParams }).withConfig({ runName: "ConstructAVUrlAndParams" }),
    new RunnableLambda({ func: fetchAlphaVantageDataInternal }).withConfig({ runName: "FetchAVData" }),
    new RunnableLambda({ func: formatFinalResponseWithLLM }).withConfig({ runName: "FormatAVResponse" }),
]);

/**
 * Main exported function to process a user query for Alpha Vantage data using LLMs.
 * @param {string} userQuery The user's financial query.
 * @returns {Promise<string>} A natural language response.
 */
export async function getDynamicAlphaVantageResponse(userQuery) {
    if (!userQuery || userQuery.trim() === "") {
        return "Please provide a query.";
    }
    console.log(`[AlphaVantageLLMService] Processing dynamic query: "${userQuery}"`);
    try {
        // Input to the chain is an object { userQuery: string }
        const result = await alphaVantageChain.invoke({ userQuery });
        return result;
    } catch (error) {
        console.error(`[AlphaVantageLLMService] Error in main chain for query "${userQuery}":`, error);
// Check if the error object has a more specific message from our logic
        if (error.message) {
            return error.message;
        }
        return "Sorry, I encountered an unexpected issue while processing your request for Alpha Vantage data.";
    }
}
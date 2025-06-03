// services/alphaVantageLLMService.js
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { ChatGroq } from '@langchain/groq';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import {
  RunnableSequence,
  RunnableLambda,
  RunnablePassthrough,
} from '@langchain/core/runnables';
import { ALPHA_VANTAGE_API_KEY, GROQ_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';
import { generateEmbedding } from './embeddingService.js'; // Assuming this uses HF e5-large-v2

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const chatModel = new ChatGroq({ apiKey: GROQ_API_KEY, model: 'llama3-70b-8192' }); // Standardized model

/**
 * Uses LLM to extract the ticker symbol if not found by regex.
 * It should correctly identify tickers from company names and ignore non-ticker acronyms.
 */
async function resolveTickerLLM(userQuery) {
  const messages = [
    {
      role: 'system',
      content: 'You are an assistant that extracts stock ticker symbols from user financial queries. Respond with only the ticker symbol (e.g., AAPL, MSFT, TSLA). If a company name is given, provide its most common stock ticker. If no ticker or company is found, or if an acronym like "PE" or "CEO" is mentioned but is not a company/ticker in context, respond with NULL.',
    },
    {
      role: 'user',
      content: userQuery,
    },
  ];
  let ticker = null;
  try {
    const response = await chatModel.invoke(messages);
    const rawTicker = response?.content?.trim().toUpperCase();

    // Validate if the LLM output looks like a ticker and is not "NULL"
    if (rawTicker && rawTicker !== "NULL" && /^[A-Z]{1,5}$/.test(rawTicker)) {
      ticker = rawTicker;
    }
    console.log(`[resolveTickerLLM] Query: "${userQuery}", LLM Raw Output: "${response?.content}", Resolved Ticker: ${ticker}`);
  } catch (error) {
    console.error(`[resolveTickerLLM] Error invoking LLM for ticker resolution:`, error);
  }
  return ticker;
}

/**
 * Extracts parameter values for a given API function from the user query using LLM.
 */
async function extractParameterValuesLLM(userQuery, functionName, functionDescription, preResolvedTicker) {
  const MAX_FUNC_DESC_LENGTH = 1000; // Max length for the function description in the prompt
  let truncatedDescription = functionDescription;
  if (functionDescription && functionDescription.length > MAX_FUNC_DESC_LENGTH) {
    truncatedDescription = functionDescription.substring(0, MAX_FUNC_DESC_LENGTH) + "... (description truncated)";
    console.warn(`[extractParameterValuesLLM] Function description for ${functionName} was truncated to ${MAX_FUNC_DESC_LENGTH} chars.`);
  }
  const prompt = `
User Query: "${userQuery}"
Alpha Vantage API Function: "${functionName}"
Function Description: "${truncatedDescription}"
${preResolvedTicker ? `A stock ticker "${preResolvedTicker}" has been pre-identified from the query. If this function requires a stock symbol (usually named 'symbol' or 'tickers'), prioritize using this pre-identified ticker.` : ''}

Based on the function name, its description, and the user query, identify all necessary and common optional parameters for this function and extract their values from the User Query.
Common parameters include:
- 'symbol': Stock ticker.
- 'tickers': Comma-separated list of stock tickers (for NEWS_SENTIMENT).
- 'interval': Time interval (e.g., "1min", "5min", "15min", "30min", "60min", "daily", "weekly", "monthly").
- 'keywords': For SYMBOL_SEARCH.
- 'from_currency', 'to_currency': For CURRENCY_EXCHANGE_RATE.
- 'market': For digital currency functions (e.g., "USD", "EUR").
- 'outputsize': Typically "compact" or "full".
- 'month': For intraday data for a specific month (format YYYY-MM).
- 'topics': For NEWS_SENTIMENT.
- 'limit', 'sort', 'time_from', 'time_to': For NEWS_SENTIMENT.

If a parameter value is not found in the query or not applicable, omit it from the JSON response.
If the function is something like MARKET_STATUS, TOP_GAINERS_LOSERS, or general economic indicators (REAL_GDP, CPI, etc.) that don't take user-derived parameters beyond 'interval' or 'maturity', return an empty JSON object {}.

Respond ONLY with a JSON object where keys are parameter names and values are the extracted values.
Example for TIME_SERIES_INTRADAY: {"symbol": "AAPL", "interval": "5min", "outputsize": "compact"}
Example for SYMBOL_SEARCH: {"keywords": "Apple"}
Example for NEWS_SENTIMENT (general): {"topics": "earnings", "limit": "10"}
Example for NEWS_SENTIMENT (specific ticker): {"tickers": "MSFT", "topics": "technology"}
Example for CURRENCY_EXCHANGE_RATE: {"from_currency": "USD", "to_currency": "EUR"}

JSON Response:`;

  const messages = [
    {
      role: 'system',
      content: 'You are an AI assistant that extracts parameter values for a given API function from a user query. Respond only in JSON format as specified.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ];

  const llmResponse = await chatModel.invoke(messages);
  const parser = new JsonOutputParser();
  let extractedParams = {};

  try {
    let rawContent = llmResponse.content;
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch && jsonMatch[0]) {
      extractedParams = await parser.parse(jsonMatch[0]);
    } else {
      extractedParams = await parser.parse(rawContent);
    }
  } catch (e) {
    console.error("Failed to parse parameters from LLM:", e, "Raw content:", llmResponse.content);
    // Return empty or default params if parsing fails
    return {};
  }

  // Ensure preResolvedTicker is used correctly
  if (preResolvedTicker) {
    const needsSymbol = !['MARKET_STATUS', 'SYMBOL_SEARCH', 'CURRENCY_EXCHANGE_RATE', 'TOP_GAINERS_LOSERS', 'EARNINGS_CALENDAR', 'IPO_CALENDAR', 'REAL_GDP', 'CPI', 'INFLATION', 'RETAIL_SALES', 'DURABLES', 'UNEMPLOYMENT', 'NONFARM_PAYROLL', 'ALL_COMMODITIES', 'WTI', 'BRENT', 'NATURAL_GAS', 'COPPER', 'ALUMINUM', 'WHEAT', 'CORN', 'COTTON', 'SUGAR', 'COFFEE'].includes(functionName) && !functionName.startsWith('FX_') && !functionName.startsWith('DIGITAL_CURRENCY_');
    
    if (functionName === 'NEWS_SENTIMENT') {
      // If 'tickers' already extracted, append; otherwise, set.
      extractedParams.tickers = extractedParams.tickers
        ? `${extractedParams.tickers},${preResolvedTicker}`.split(',').map(t=>t.trim()).filter((v,i,a)=>a.indexOf(v)===i).join(',') // de-duplicate
        : preResolvedTicker;
      delete extractedParams.symbol; // NEWS_SENTIMENT uses 'tickers'
    } else if (needsSymbol) {
      extractedParams.symbol = preResolvedTicker;
    }
  }
  return extractedParams;
}


/**
 * Constructs the Alpha Vantage URL and required parameters.
 */
async function constructAlphaVantageUrlAndParams({ userQuery }) {
  // REMOVE: let ticker = userQuery.match(/\b[A-Z]{1,5}\b/)?.[0] || null;
  // ALWAYS use LLM for ticker resolution for better contextual understanding
  console.log('[constructAlphaVantageUrlAndParams] Using LLM to resolve ticker...');
  const ticker = await resolveTickerLLM(userQuery);
  console.log('[Ticker Resolved by LLM]', ticker);

  const queryEmbeddingResult = await generateEmbedding(userQuery);
  const embeddedQuery = Array.isArray(queryEmbeddingResult) && Array.isArray(queryEmbeddingResult[0])
        ? queryEmbeddingResult[0]
        : queryEmbeddingResult;

  if (!Array.isArray(embeddedQuery) || !embeddedQuery.every(num => typeof num === 'number')) {
      console.error('Invalid embedding format for Supabase:', embeddedQuery);
      throw new Error('Generated embedding is not in the expected format (array of numbers).');
  }
  console.log('[User Query Embedding Generated]');

  // Assumes 'match_api_documentation' RPC exists and queries a table
  // populated from alpha_vantage_full.json, returning function_code, description,
  // required_parameters, optional_parameters.
  // Updated to use 'match_api_documentation' RPC
  const { data: matchData, error: matchError } = await supabase.rpc('match_api_documentation', {
    query_embedding: embeddedQuery,
    match_threshold: 0.7, // Default threshold, adjust as needed
    match_count: 1, // Get the best match
  });

  if (matchError) {
    console.error('Supabase RPC error in match_api_documentation:', matchError);
    throw matchError;
  }
  if (!matchData || matchData.length === 0) {
    throw new Error('No matching Alpha Vantage API function found for the query.');
  }

  const bestMatch = matchData[0]; // Contains function_code, description, etc.
  const determinedFunctionName = bestMatch.function_code;
  console.log('[Best API Match]', { name: determinedFunctionName, description: bestMatch.description });

  if (!determinedFunctionName) {
    throw new Error('Could not determine API function from semantic match.');
  }

  // Extract parameter values using LLM, providing the resolved ticker
  const extractedParams = await extractParameterValuesLLM(userQuery, determinedFunctionName, bestMatch.description, ticker);
  console.log('[Extracted Parameters by LLM]', extractedParams);

  // Construct Alpha Vantage URL
  const baseURL = 'https://www.alphavantage.co/query';
  const queryParams = new URLSearchParams();
  queryParams.append('function', determinedFunctionName);

  for (const paramName in extractedParams) {
    const paramValue = extractedParams[paramName];
    if (paramValue !== null && paramValue !== undefined && String(paramValue).trim() !== "") {
      queryParams.append(paramName, String(paramValue));
    }
  }
  
  // Ensure essential parameters (like 'symbol' for stock functions if not covered by ticker logic, or 'keywords' for SYMBOL_SEARCH) are present.
  // The extractParameterValuesLLM should handle this based on its prompt.
  // A final check can be added here if needed. For example:
  if (determinedFunctionName === 'SYMBOL_SEARCH' && !queryParams.has('keywords')) {
    console.warn("SYMBOL_SEARCH called without 'keywords'. Using original user query as fallback.");
    queryParams.append('keywords', userQuery); // Fallback, consider if this is always desired
  }
  if (['CURRENCY_EXCHANGE_RATE'].includes(determinedFunctionName) && (!queryParams.has('from_currency') || !queryParams.has('to_currency'))) {
    throw new Error(`Missing 'from_currency' or 'to_currency' for ${determinedFunctionName}`);
  }
  // Add more specific checks if other functions have non-obvious mandatory params not typically in user query.


  queryParams.append('apikey', ALPHA_VANTAGE_API_KEY);
  const alphaURL = `${baseURL}?${queryParams.toString()}`;
  console.log('[Alpha Vantage URL]', alphaURL);

  return { userQuery, alphaURL, match: bestMatch, ticker, determinedFunctionName, extractedParams };
}

/**
 * Fetches data from Alpha Vantage using constructed URL.
 */
async function fetchAlphaVantageDataInternal({ userQuery, alphaURL, match, ticker, determinedFunctionName, extractedParams }) {
  if (!alphaURL) { // Should be caught by constructAlphaVantageUrlAndParams
    return { userQuery, alphaData: { error: "Alpha Vantage URL was not constructed." }, match, ticker, determinedFunctionName, extractedParams };
  }
  console.log(`[Fetching AV Data] URL: ${alphaURL}`);
  try {
    const response = await axios.get(alphaURL);
    const data = response.data;
    console.log('[Alpha Vantage Raw Data]', JSON.stringify(data).substring(0, 300) + "...");


    if (data["Error Message"]) {
      console.error("[Alpha Vantage API Error]", data["Error Message"]);
      return { userQuery, alphaData: { error: data["Error Message"] }, match, ticker, determinedFunctionName, extractedParams };
    }
    if (data["Note"]) {
      console.warn("[Alpha Vantage API Note]", data["Note"]);
      // Return note with data, as it might be a rate limit but still have some (possibly old) data.
      return { userQuery, alphaData: { ...data, note: data["Note"] }, match, ticker, determinedFunctionName, extractedParams };
    }
    return { userQuery, alphaData: data, match, ticker, determinedFunctionName, extractedParams };
  } catch (error) {
    console.error("[Fetch AV Data Error]", error.isAxiosError ? error.toJSON() : error);
    const errorMessage = error.response?.data?.Message || error.message || "Unknown error fetching data.";
    return { userQuery, alphaData: { error: `Fetch error: ${errorMessage}` }, match, ticker, determinedFunctionName, extractedParams };
  }
}

/**
 * Formats the API data using LLM for natural language response.
 */
async function formatFinalResponseWithLLM({ userQuery, alphaData, determinedFunctionName, extractedParams }) {
  const MAX_API_DATA_LENGTH = 30000; // Max characters for the API data to send to LLM.
                                   // 35k was likely too large for an 8k token total payload limit.
  console.log('[Formatting Final Response] UserQuery:', userQuery);
  console.log('[Formatting Final Response] AlphaVantageData Keys:', Object.keys(alphaData || {}));

  if (!alphaData || Object.keys(alphaData).length === 0) {
    return "I couldn't retrieve any data from Alpha Vantage for your query. This could be due to an invalid request or an API issue.";
  }
  if (alphaData.error) {
    if (typeof alphaData.error === 'string' && alphaData.error.toLowerCase().includes("invalid api call") && (alphaData.error.toLowerCase().includes("symbol") || alphaData.error.toLowerCase().includes("keywords"))) {
        return `There was an issue fetching data from Alpha Vantage: ${alphaData.error}. This often means the stock symbol or search keywords were not found or are not supported.`;
    }
    return `There was an issue fetching data from Alpha Vantage: ${alphaData.error}`;
  }
  if (alphaData.Information && !alphaData.note && Object.keys(alphaData).length === 1) {
    return `I received a message from Alpha Vantage: "${alphaData.Information}". This might indicate an issue with the request, API limits, or an invalid symbol/parameter.`;
  }
  
  const significantDataExists = Object.keys(alphaData).some(key => key !== 'note' && key !== 'Information' && key !== 'Error Message');
  if (alphaData.note && !significantDataExists) {
    return `I received a note from Alpha Vantage: "${alphaData.note}". This often indicates an API limit was reached or there's an issue with the request, and I couldn't get detailed data.`;
  }

  const systemPrompt = `You are a helpful financial assistant. Your task is to answer the user's question based *only* on the provided data from Alpha Vantage. Be concise and clear.
If the data is complex (e.g., time series), summarize the key points relevant to the user's query.
If the provided data does not seem to directly answer the question, state what information you found and that it might not fully address the query.
Do not make up information or use external knowledge. Format numbers like currency and percentages appropriately.
If the data contains an error message or a note indicating a problem (like a rate limit or invalid symbol/parameters), explain that to the user based on the error/note content.
The user's query was about the function '${determinedFunctionName}' with parameters like ${JSON.stringify(extractedParams)}. Keep this in mind when interpreting the data.`;

  let stringToSendToLLM = JSON.stringify(alphaData, null, 2);
  if (stringToSendToLLM.length > MAX_API_DATA_LENGTH) {
    console.warn(`[Format Final Response] Alpha Vantage data (pretty-printed) is large, sending truncated string (first ${MAX_API_DATA_LENGTH} chars) to LLM.`);
    stringToSendToLLM = stringToSendToLLM.substring(0, MAX_API_DATA_LENGTH) + "\n... (data truncated due to length)";
  }

  const humanPrompt = `User question: "${userQuery}"

Alpha Vantage API response:
${stringToSendToLLM}

Based ONLY on this data, please provide a response to the user's question.`;

  try {
    const llmResponse = await chatModel.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: humanPrompt },
    ]);
    return llmResponse.content?.trim() || "No response content from LLM.";
  } catch (error) {
    console.error("[Format Final Response] LLM formatting error:", error);
    return "Sorry, I encountered an error while trying to formulate a response from the fetched data.";
  }
}

/**
 * Main pipeline using LangChain RunnableSequence
 */
export const getAlphaVantageResponse = RunnableSequence.from([
  new RunnableLambda({ func: constructAlphaVantageUrlAndParams }).withConfig({ runName: 'ConstructAVUrlAndParams' }),
  new RunnableLambda({ func: fetchAlphaVantageDataInternal }).withConfig({ runName: 'FetchAVData' }),
  new RunnableLambda({ func: formatFinalResponseWithLLM }).withConfig({ runName: 'FormatAVResponse' }),
]);

/**
 * Convenience wrapper to use the pipeline as a standard async function
 */
export async function runAlphaVantagePipeline(userQuery) {
  if (!userQuery || userQuery.trim() === "") {
    return "Please provide a query.";
  }
  console.log(`[AlphaVantageLLMService] Processing query: "${userQuery}"`);
  try {
    const result = await getAlphaVantageResponse.invoke({ userQuery });
    return result;
  } catch (error) {
    console.error(`[AlphaVantageLLMService] Error in main pipeline for query "${userQuery}":`, error);
    // Check if the error object has a more specific message from our logic
    if (error.message) {
        // Customize error messages based on known issues
        if (error.message.includes("No matching Alpha Vantage API function found")) {
            return "I couldn't find a relevant financial data function for your query. Could you try rephrasing it or asking about a specific stock or economic indicator?";
        }
        if (error.message.includes("Failed to generate query embedding")) {
            return "There was an issue understanding your query. Please try again.";
        }
        return `Sorry, an error occurred: ${error.message}`;
    }
    return "Sorry, I encountered an unexpected issue while processing your request for Alpha Vantage data.";
  }
}

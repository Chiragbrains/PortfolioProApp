// /Users/chirag/Downloads/Test App - Coding/PortfolioProApp/services/alphaVantageLLMService.js
import { ALPHA_VANTAGE_API_KEY, GROQ_API_KEY } from '@env';
import { ChatGroq } from "@langchain/groq";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import {
  RunnableSequence,
  RunnablePassthrough,
  RunnableLambda
} from "@langchain/core/runnables";

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

// Condensed Alpha Vantage API Documentation Summary for LLM
const condensedApiDocumentation = `
As an expert financial analyst and stock data specialist, refer to this documentation for AlphaVantage and find Function: , Description: , and Parameters: for each function.
If you cant find it then only refer to below details.
Alpha Vantage API Documentation Summary:

Function: GLOBAL_QUOTE
Description: Fetches the latest price and trading information for a single stock symbol.
Parameters:
  - symbol (string, required): The stock symbol (e.g., AAPL, MSFT).

Function: TIME_SERIES_INTRADAY
Description: Fetches intraday time series (timestamp, open, high, low, close, volume) for a stock symbol.
Parameters:
  - symbol (string, required): The stock symbol.
  - interval (string, required, enum: ["1min", "5min", "15min", "30min", "60min"]): Time interval.
  - outputsize (string, optional, enum: ["compact", "full"], default: "compact"): 'compact' (latest 100) or 'full'.
  - adjusted (boolean, optional, default: true): Whether to return adjusted values.

Function: TIME_SERIES_DAILY_ADJUSTED
Description: Fetches daily adjusted time series (open, high, low, close, adjusted close, volume, dividend, split coefficient) for a stock symbol.
Parameters:
  - symbol (string, required): The stock symbol.
  - outputsize (string, optional, enum: ["compact", "full"], default: "compact"): 'compact' (latest 100 data points) or 'full' (full-length time series).

Function: OVERVIEW
Description: Fetches company information, financial ratios, and other key metrics for a stock symbol.
Parameters:
  - symbol (string, required): The stock symbol.

Function: EARNINGS
Description: Fetches annual and quarterly earnings (EPS) for a company.
Parameters:
  - symbol (string, required): The stock symbol.

Function: SYMBOL_SEARCH
Description: Searches for stock symbols and company names matching keywords. Useful for finding a ticker if the user provides a company name.
Parameters:
  - keywords (string, required): Keywords to search (e.g., 'apple inc', 'microsoft').

Function: CURRENCY_EXCHANGE_RATE
Description: Fetches the real-time exchange rate for a pair of physical currencies.
Parameters:
  - from_currency (string, required): The currency code to convert from (e.g., USD).
  - to_currency (string, required): The currency code to convert to (e.g., JPY).

Function: DIGITAL_CURRENCY_DAILY
Description: Fetches daily historical data (open, high, low, close, volume) for a digital currency (e.g., Bitcoin).
Parameters:
  - symbol (string, required): The digital currency symbol (e.g., BTC).
  - market (string, required): The exchange market symbol for the digital currency (e.g., USD, EUR).

Function: NEWS_SENTIMENT
Description: Fetches live and historical market news and sentiment data for a stock, or overall market sentiment.
Parameters:
  - tickers (string, optional): Comma-separated stock tickers (e.g., AAPL,MSFT). If blank, returns overall market sentiment.
  - topics (string, optional, enum: ["blockchain", "earnings", "ipo", "mergers_and_acquisitions", "financial_markets", "economy_fiscal", "economy_monetary", "economy_macro", "energy_transportation", "finance", "life_sciences", "manufacturing", "real_estate", "retail_wholesale", "technology"]): Relevant topics.
  - time_from (string, optional, format: YYYYMMDDTHHMM): Filter news from this time.
  - time_to (string, optional, format: YYYYMMDDTHHMM): Filter news up to this time.
  - sort (string, optional, enum: ["LATEST", "RELEVANCE"], default: "LATEST"): Sort order.
  - limit (integer, optional, range: 1-1000, default: 50): Number of results.

Note: For all functions, the API key is handled separately and should not be part of the 'params' object.
`;

const getFunctionSelectionPrompt = (userQuery) => {
  return `You are an expert AI assistant. Your task is to analyze the user's financial query and select the most appropriate Alpha Vantage API function and its parameters by consulting the provided Alpha Vantage API Documentation Summary.

Respond ONLY with a JSON object in the following format:
{
  "functionName": "SELECTED_FUNCTION_NAME_OR_NULL",
  "params": { /* "param_name": "param_value", ... */ },
  "confidence": "high|medium|low",
  "reasoning": "Brief explanation for your choice or why no function was chosen."
}

If no suitable function is found or essential parameters (like a stock symbol for most functions) cannot be extracted, set "functionName" to null.
Prioritize extracting standard stock tickers (e.g., AAPL, MSFT). If a company name is mentioned (e.g., "Apple Inc."), infer the ticker.
For functions requiring a 'symbol' parameter, ensure it is extracted from the user query. If the query is about currency exchange, extract 'from_currency' and 'to_currency'. For crypto, extract 'symbol' and 'market'.

Alpha Vantage API Documentation Summary:
${condensedApiDocumentation}

User Query: "${userQuery}"

Your JSON Response:`;
};

const selectAlphaVantageFunctionAndParams_LLM = async (input) => {
  const { userQuery } = input;
  console.log('[AlphaVantageLLMService] Selecting function for query:', userQuery);
  const prompt = getFunctionSelectionPrompt(userQuery);

  try {
    const llmResponse = await llmFunctionSelector.invoke(prompt);
    const parser = new JsonOutputParser();
    const parsedJson = await parser.parse(llmResponse.content);

    console.log('[AlphaVantageLLMService] LLM Selection Response:', parsedJson);
    if (!parsedJson.functionName) {
      throw new Error(parsedJson.reasoning || "LLM could not determine a suitable Alpha Vantage function.");
    }
    if (parsedJson.confidence === 'low' && !parsedJson.functionName) { // This condition might be redundant if !parsedJson.functionName already throws
         throw new Error(parsedJson.reasoning || "LLM has low confidence and could not determine a function.");
    }

    return {
      selectedFunction: parsedJson.functionName,
      selectedParams: parsedJson.params || {}, // Ensure params is an object
      userQuery // Pass through for next steps
    };
  } catch (error) {
    console.error('[AlphaVantageLLMService] Error in LLM function selection:', error);
    // Propagate a structured error or a user-friendly message
    throw new Error(`Failed to select Alpha Vantage function: ${error.message}`);
  }
};

const fetchAlphaVantageDataInternal = async (input) => {
  const { selectedFunction, selectedParams } = input;
  if (!selectedFunction) {
    // This case should ideally be caught earlier by the LLM selection step throwing an error
    return { ...input, alphaVantageData: { error: "No Alpha Vantage function was selected." } };
  }

  let queryString = `https://www.alphavantage.co/query?function=${selectedFunction}&apikey=${ALPHA_VANTAGE_API_KEY}`;
  for (const key in selectedParams) {
    if (selectedParams[key] !== undefined && selectedParams[key] !== null) { // Ensure param has a value
        queryString += `&${key}=${encodeURIComponent(selectedParams[key])}`;
    }
  }

  console.log(`[AlphaVantageLLMService] Fetching from Alpha Vantage: ${queryString}`);
  try {
    const response = await fetch(queryString);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AlphaVantageLLMService] Alpha Vantage API request failed: ${response.status} ${response.statusText}`, errorText);
      return { ...input, alphaVantageData: { error: `API request failed: ${response.statusText} - ${errorText}` } };
    }
    const data = await response.json();

    if (data["Error Message"]) {
      console.error("[AlphaVantageLLMService] Alpha Vantage API Error:", data["Error Message"]);
      return { ...input, alphaVantageData: { error: data["Error Message"] } };
    }
    if (data["Note"]) {
      console.warn("[AlphaVantageLLMService] Alpha Vantage API Note (likely rate limit):", data["Note"]);
      // Return the note along with any data received, as it might still be useful or indicative of an issue.
      return { ...input, alphaVantageData: { note: data["Note"], ...data } };
    }
    return { ...input, alphaVantageData: data };
  } catch (error) {
    console.error("[AlphaVantageLLMService] Fetch error:", error);
    return { ...input, alphaVantageData: { error: `Fetch error: ${error.message}` } };
  }
};

const formatFinalResponseWithLLM = async (input) => {
  const { userQuery, alphaVantageData } = input;

  if (!alphaVantageData || Object.keys(alphaVantageData).length === 0) {
    return "I couldn't retrieve any data from Alpha Vantage for your query. This could be due to an invalid request or an API issue.";
  }
  if (alphaVantageData.error) {
    return `There was an issue fetching data from Alpha Vantage: ${alphaVantageData.error}`;
  }
  // If only a note is present (e.g., rate limit) and no other significant data keys
  const dataKeys = Object.keys(alphaVantageData);
  if (alphaVantageData.note && dataKeys.length <= (dataKeys.includes('note') ? 1 : 0) + (dataKeys.includes('Information') ? 1 : 0) ) {
    return `I received a note from Alpha Vantage: "${alphaVantageData.note}". This often indicates an API limit was reached or there's an issue with the request, and I couldn't get detailed data.`;
  }


  const systemPrompt = `You are a helpful financial assistant. Your task is to answer the user's question based *only* on the provided data from Alpha Vantage.
Be concise and clear. If the data is complex, summarize the key points relevant to the user's query.
If the provided data does not seem to directly answer the question, state what information you found and that it might not fully address the query.
Do not make up information or use external knowledge. Format numbers like currency and percentages appropriately.`;

  // Limit the size of data sent to LLM to avoid overly long prompts
  let dataForLLM = alphaVantageData;
  const stringifiedData = JSON.stringify(alphaVantageData);
  if (stringifiedData.length > 35000) { // Heuristic limit, adjust as needed
    dataForLLM = { summary: "Data was too large to display fully. Key information should be extracted by the assistant if possible.", note: alphaVantageData.note, error: alphaVantageData.error };
    // Potentially, you could try to intelligently summarize parts of the data here before sending to LLM
    // For example, if it's a time series, take the first few and last few entries.
    console.warn("[AlphaVantageLLMService] Alpha Vantage data is large, sending a summary placeholder to LLM.");
  }


  const humanPrompt = `The user asked: "${userQuery}"

Here is the data retrieved from Alpha Vantage:
${JSON.stringify(dataForLLM, null, 2)}

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

const alphaVantageChain = RunnableSequence.from([
  new RunnableLambda({ func: selectAlphaVantageFunctionAndParams_LLM }).withConfig({ runName: "SelectAVFunction" }),
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
    const result = await alphaVantageChain.invoke({ userQuery });
    return result;
  } catch (error) {
    console.error(`[AlphaVantageLLMService] Error in main chain for query "${userQuery}":`, error);
    return error.message || "Sorry, I encountered an unexpected issue while processing your request for Alpha Vantage data.";
  }
}

// --- Example Usage (for testing in Node.js environment if needed) ---
/*
async function testService() {
  const queries = [
    "What's the latest price of AAPL?",
    "Show me 15min intraday data for MSFT.",
    "Company overview for GOOG",
    "Search for stocks related to 'artificial intelligence'",
    "How much is 100 USD in JPY?",
    "Daily bitcoin price in USD",
    "What are my top holdings?" // Example of a query LLM should reject for AV
  ];

  for (const query of queries) {
    console.log(`\n--- Testing Query: "${query}" ---`);
    const response = await getDynamicAlphaVantageResponse(query);
    console.log("LLM Response:", response);
    // Alpha Vantage free tier has a rate limit (e.g., 5 calls/min).
    // Add a delay if making multiple test calls quickly.
    await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds delay
  }
}

if (require.main === module && process.env.NODE_ENV !== 'production') {
  // testService().catch(console.error);
}
*/
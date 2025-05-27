// GeneralChatbox.js 
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Pressable,
  Switch
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { GROQ_API_KEY, ALPHA_VANTAGE_API_KEY } from '@env'; // Import ALPHA_VANTAGE_API_KEY
import { useSupabaseConfig } from './SupabaseConfigContext'; // Import hook
import { LinearGradient } from 'expo-linear-gradient';
import { generateEmbedding } from './services/embeddingService';
import { searchRelevantContext } from './services/vectorSearchService';
import { getRagLLMResponse, formatSQLResultsForChat } from './services/ragLlmService';
import { saveContextToDatabase } from './services/contextStorageService';

const screenHeight = Dimensions.get('window').height;

const GeneralChatbox = ({ onClose }) => {
  const [messages, setMessages] = useState([
    { 
      id: `welcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant', 
      content: 'Hello! I can help you analyze your portfolio. You can ask me about your holdings, performance, gains/losses, or any other portfolio-related questions. What would you like to know?',
      mode: 'standard'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isRAGEnabled, setIsRAGEnabled] = useState(true);
  const scrollViewRef = useRef();
  const { supabaseClient } = useSupabaseConfig();

  // --- Portfolio Query Specific State ---
  // queryResults, llmPortfolioTextResponse, lastExecutedQuery are not needed as separate states here.
  // We will store the results directly in the message object.

  const SWIPE_CLOSE_THRESHOLD_Y = 50; // Min vertical distance to trigger close
  const SWIPE_CLOSE_VELOCITY_Y = 500; // Min velocity to trigger close (points/second)

  const dragGesture = Gesture.Pan()
    .onStart(() => {
      console.log('[GeneralChatbox] SwipeDown: Gesture Started (onStart)');
    })
    .onBegin(() => {
      console.log('[GeneralChatbox] SwipeDown: Gesture Began (onBegin)');
    })
    .onUpdate((event) => {
      // This can be very noisy, uncomment if you need to see continuous updates
      // console.log(`[GeneralChatbox] SwipeDown: Gesture Update - Y: ${event.translationY.toFixed(2)}, VelY: ${event.velocityY.toFixed(2)}`);
    })
    .activeOffsetY([5, Infinity]) // Activate after a smaller downward movement (e.g., 5px)
    // .failOffsetY([-SWIPE_CLOSE_THRESHOLD_Y / 2, -Infinity])   // Remove or relax this condition
    .shouldCancelWhenOutside(false) // Continue gesture even if pointer moves outside the handle
    .minPointers(1) // Ensure it's a single-finger pan
    .maxPointers(1) // Ensure it's a single-finger pan
    .cancelsTouchesInView(false) // Try preventing touch cancellation
    .simultaneousWithExternalGesture(scrollViewRef) // Allow to run with ScrollView's gesture
    .onEnd((event) => {
      console.log(`[GeneralChatbox] SwipeDown: Gesture Ended (onEnd) - Y: ${event.translationY.toFixed(2)}, VelY: ${event.velocityY.toFixed(2)}`);
      // Check if the swipe was sufficiently downwards and fast enough
      if (event.translationY > SWIPE_CLOSE_THRESHOLD_Y && event.velocityY > SWIPE_CLOSE_VELOCITY_Y) {
        console.log('[GeneralChatbox] SwipeDown: Thresholds MET. Closing chatbox.');
        onClose();
      } else {
        console.log('[GeneralChatbox] SwipeDown: Thresholds NOT MET.');
      }
    })
    .onFinalize(() => {
      console.log('[GeneralChatbox] SwipeDown: Gesture Finalized (onFinalize)');
    });

    useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // --- Helper functions from PortfolioGraph.js (adapted) ---
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const getGainLossColor = (value) => {
    return value >= 0 ? portfolioQueryStyles.positiveChange : portfolioQueryStyles.negativeChange;
  };

  const formatDisplayKey = (key) => {
    if (!key || typeof key !== 'string') return '';
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // --- Portfolio Query Logic (from PortfolioGraph.js, adapted) ---
  const interpretPortfolioQuery = async (userQuery) => {
    console.log('[GeneralChatbox] interpretPortfolioQuery: START for query -', userQuery);
    const systemPrompt = `You are an expert SQL generator. Your task is to translate natural language questions into SQL SELECT queries for a specific table.
Database Schema:
Table Name: portfolio_summary
Columns:
- ticker: TEXT (Stock ticker symbol)
- company_name: TEXT (Name of the company)
- total_quantity: NUMERIC (Number of shares owned)
- average_cost_basis: NUMERIC (Average purchase price per share)
- current_price: NUMERIC (Latest market price per share)
- total_cost_basis_value: NUMERIC (total_quantity * average_cost_basis)
- market_value: NUMERIC (quantity * current_price)
- pnl_dollar: NUMERIC (market_value - total_cost_basis_value)
- pnl_percent: NUMERIC (Value already in percentage form, no need to multiply by 100)
- portfolio_percent: NUMERIC (market_value / total_portfolio_value) shown as a percentage
- type: TEXT (Type of asset, e.g., stock, etf or cash)
- last_updated: TIMESTAMP (When the data was last refreshed)

Constraints:
1. ONLY generate SQL SELECT queries. Do not generate INSERT, UPDATE, DELETE, or any other type of SQL statement.
2. ONLY query the 'portfolio_summary' table. Do not refer to any other tables.
3. Ensure the generated SQL is valid for PostgreSQL.
4. If the user's question cannot be answered with a SELECT query on the 'portfolio_summary' table based on the provided schema, respond ONLY with the exact text 'QUERY_UNANSWERABLE'.
5. When asked about "how many" shares or a specific quantity of a stock, select the 'total_quantity' column. Do not use COUNT(*).
6. For queries about losses or worst performing stocks, use ORDER BY pnl_dollar ASC (ascending order to show biggest losses first).
7. For queries about gains or best performing stocks, use ORDER BY pnl_dollar DESC (descending order to show biggest gains first).
8. When a user refers to a specific company:
   a. If the input is clearly a ticker symbol (e.g., "AAPL", "MSFT"), use an exact match on the \`ticker\` column (e.g., \`WHERE ticker = 'AAPL'\`). Ensure the ticker in the SQL is uppercase.
   b. If the input is a company name (e.g., "Apple", "Microsoft Corporation"), try to determine its common stock ticker symbol and use an exact match on the \`ticker\` column with that symbol in uppercase.
   c. As a fallback, if you cannot confidently determine the ticker from a company name, or if the name is partial, you may use \`company_name LIKE '%User Provided Name%'\`.
9. If the user asks for information about multiple distinct companies or tickers in a single question, combine the conditions into a single SQL query using the \`OR\` operator.
10. For queries about assets that are "breaking even", "close to breaking even", or "almost breaking even", use the following SQL pattern:
    SELECT * FROM portfolio_summary WHERE type != 'cash'  AND ABS(pnl_percent) = (SELECT MIN(ABS(pnl_percent)) FROM portfolio_summary WHERE type != 'cash')

Examples:
- User: "how many apple stocks do I have?" -> SQL: SELECT total_quantity FROM portfolio_summary WHERE ticker = 'AAPL'
- User: "info on Google" -> SQL: SELECT * FROM portfolio_summary WHERE ticker = 'GOOGL'
- User: "details for MSFT" -> SQL: SELECT * FROM portfolio_summary WHERE ticker = 'MSFT'
- User: "market value of International Business Machines" -> SQL: SELECT market_value FROM portfolio_summary WHERE ticker = 'IBM'
- User: "show me amd and nvidia" -> SQL: SELECT * FROM portfolio_summary WHERE ticker = 'AMD' OR ticker = 'NVDA'
- User: "data for Apple and Microsoft" -> SQL: SELECT * FROM portfolio_summary WHERE ticker = 'AAPL' OR ticker = 'MSFT'
- User: "what is my biggest loss?" -> SQL: SELECT ticker, pnl_dollar FROM portfolio_summary ORDER BY pnl_dollar ASC LIMIT 1
- User: "what is my biggest gain?" -> SQL: SELECT ticker, pnl_dollar FROM portfolio_summary ORDER BY pnl_dollar DESC LIMIT 1
- User: "total value of my portfolio" -> SQL: SELECT SUM(market_value) FROM portfolio_summary
- User: "what assets am I almost breaking even on?" -> SQL: SELECT * FROM portfolio_summary WHERE type != 'cash' AND ABS(pnl_percent) = (SELECT MIN(ABS(pnl_percent)) FROM portfolio_summary WHERE type != 'cash')`;
    try {
        console.log('[GeneralChatbox] interpretPortfolioQuery: Preparing to call Groq for SQL generation.');
        const makeRequest = () => {
            return new Promise((resolve, reject) => {
                const payload = { model: "meta-llama/llama-4-scout-17b-16e-instruct", messages: [{ role: "system", content: systemPrompt },{ role: "user", content: userQuery }], temperature: 0.5, max_tokens: 500 };
                const xhr = new XMLHttpRequest();
                xhr.timeout = 20000;
                xhr.onreadystatechange = function() {
                    // console.log(`[GeneralChatbox] interpretPortfolioQuery: XHR readyState: ${this.readyState}, status: ${this.status}`); // Can be very verbose
                    if (this.readyState === 4) {
                        if (this.status >= 200 && this.status < 300) { try { const response = JSON.parse(this.responseText); resolve(response); } catch (e) { reject(new Error(`Failed to parse response: ${this.responseText.substring(0, 100)}...`)); } }
                        else { reject(new Error(`Request failed with status ${this.status}: ${this.responseText}`)); }
                    }
                };
                xhr.ontimeout = function() { reject(new Error("Request timed out after 20 seconds")); };
                xhr.onerror = function() { reject(new Error("Network error occurred"));};
                xhr.open("POST", "https://api.groq.com/openai/v1/chat/completions", true);
                xhr.setRequestHeader("Content-Type", "application/json"); xhr.setRequestHeader("Authorization", `Bearer ${GROQ_API_KEY}`);
                xhr.send(JSON.stringify(payload));
            });
        };
        const makeRequestWithRetries = async (retries = 1) => { // Reduced retries for chat
            let attempt = 0;
            while (attempt <= retries) {
                try {
                    console.log(`[GeneralChatbox] interpretPortfolioQuery: Groq SQL generation attempt ${attempt + 1}`);
                    return await makeRequest();
                } catch (error) {
                    console.warn(`[GeneralChatbox] interpretPortfolioQuery: Groq SQL generation attempt ${attempt + 1} failed:`, error.message);
                    if (attempt === retries) throw error;
                    attempt++;
                    await new Promise(resolve => setTimeout(resolve, 500 + attempt * 500)); // Exponential backoff
                }
            }
        };
        const data = await makeRequestWithRetries();
        console.log('[GeneralChatbox] interpretPortfolioQuery: Groq SQL generation response received.');
        if (data?.choices?.[0]?.message?.content) {
            const rawContent = data.choices[0].message.content;
            console.log('[GeneralChatbox] interpretPortfolioQuery: Raw content from LLM -', rawContent.substring(0, 100) + "...");
            if (rawContent === 'QUERY_UNANSWERABLE') return 'QUERY_UNANSWERABLE';
            const sqlRegex = /```(?:sql)?\s*(SELECT[\s\S]*?)(?:;)?\s*```|^(SELECT[\s\S]*?)(?:;)?$/im;
            const match = rawContent.match(sqlRegex);
            let extractedSql = null;
            if (match) { extractedSql = (match[1] || match[2] || '').trim(); }
            else if (rawContent.toUpperCase().includes('SELECT')) { const selectRegex = /SELECT\s+[^;]*/i; const selectMatch = rawContent.match(selectRegex); if (selectMatch) { extractedSql = selectMatch[0].trim(); } }
            if (extractedSql?.toUpperCase().startsWith('SELECT')) { console.log('[GeneralChatbox] interpretPortfolioQuery: Extracted SQL -', extractedSql); return extractedSql.endsWith(';') ? extractedSql.slice(0, -1).trim() : extractedSql; }
        }
        console.log('[GeneralChatbox] interpretPortfolioQuery: No SQL extracted or content missing.');
        return null; // Indicate not a portfolio query / failed to extract SQL
    } catch (error) {
        console.error('[GeneralChatbox] interpretPortfolioQuery: ERROR -', error);
        return null; // Indicate not a portfolio query on error
    }
  };

  const fetchPortfolioDataFromSupabase = async (sqlQuery) => {
    if (!supabaseClient) throw new Error("Supabase client not available.");
    if (!sqlQuery || typeof sqlQuery !== 'string' || !sqlQuery.trim().toUpperCase().startsWith('SELECT')) throw new Error("Invalid or non-SELECT SQL query provided.");
    console.log('[GeneralChatbox] fetchPortfolioDataFromSupabase: START for SQL -', sqlQuery);
    const { data, error } = await supabaseClient.rpc('execute_sql', { sql_query: sqlQuery });
    if (error) { console.error("Supabase RPC error:", error); throw new Error(`Database query failed: ${error.message}`); }
    console.log('[GeneralChatbox] fetchPortfolioDataFromSupabase: END - Data received from Supabase, rows:', data?.length);
    return data || [];
  };

  const getFormattedPortfolioTextResponseFromLLM = async (originalUserQuery, databaseResults) => {
    console.log('[GeneralChatbox] getFormattedPortfolioTextResponseFromLLM: START for query -', originalUserQuery);
    if (!databaseResults || databaseResults.length === 0) return "No data was found to answer your question.";
    
    const safeUserQuery = String(originalUserQuery || '');
    const resultsSampleForLLM = Array.isArray(databaseResults) ? databaseResults.slice(0, 100) : []; // limit to 100 rows for LLM
    
    try {
      console.log('[GeneralChatbox] getFormattedPortfolioTextResponseFromLLM: Preparing to call Groq for text formatting.');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // Shorter timeout for chat
      
      console.log('[GeneralChatbox] getFormattedPortfolioTextResponseFromLLM: Calling Groq API...');
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [
            { 
              role: "system", 
              content: `You are an AI assistant that provides clear and concise natural language answers based on database query results.
Given a user's question and database results, formulate a helpful text response.
Your response will be displayed in a mobile app, so keep it readable.

Important formatting rules:
1. DO NOT use any HTML tags or markdown formatting
2. DO NOT use <font> tags or any other HTML styling
3. For P&L values, just write them directly (e.g., "-$1,234.56" or "-12.34%")
4. The app will automatically color-code negative values in red and positive values in green (via the display component, you just provide the text).
5. Use bullet points by starting each line with an asterisk and space ("* ")

Important notes about the data:
- For money values, use appropriate currency formatting.
- The pnl_percent and portfolio_percent fields are already in percentage form (e.g., 5.2 means 5.2%), do not multiply by 100.
- When showing P&L values, format them as: "-$X,XXX.XX, -XX.XX%" or "$X,XXX.XX, XX.XX%". (The comma is important for parsing by the display component).
- Do not include column names like "pnl_dollar:" or "pnl_percent:" in the output.

Be direct and clear in your response. Mention relevant results, including company names where appropriate.

When presenting information for multiple assets from the query results:
  - If the information for each asset is brief (e.g., just ticker and P&L), you can list them concisely, for example: 'Here are the P&Ls: Apple (AAPL) is +$100.00, +5.00%; Microsoft (MSFT) is -$50.00, -2.00%.'
  - If there are several details for each asset, use a clear paragraph or a short, descriptive sentence for each asset. Avoid an exhaustive list of bullet points for every single field of every asset. For example, instead of many bullets, try: "Apple (AAPL) has a market value of $1500.00 and a P&L of +$100.00, +5.00%. Microsoft (MSFT) shows a market value of $2000.00 with a P&L of -$50.00, -2.00%."
  - Avoid overly repetitive phrasing.
  - If a user asks for a list (e.g., "list my top 5 holdings"), then using bullet points starting with an asterisk and space ("* ") for each holding is appropriate.

For single asset results or general summaries, a simple paragraph is often best.
Do NOT use markdown like **bold** or _italics_. Use clear sentence structure for emphasis if needed.`
            },
            { 
              role: "user", 
              content: `Original Question: "${safeUserQuery}"\n\nDatabase Results (sample of up to 10 rows):\n${JSON.stringify(resultsSampleForLLM, null, 2)}`
            }
          ],
          temperature: 0.3, // Lower temperature for more deterministic and factual output
        })
      });
      clearTimeout(timeoutId);
      console.log('[GeneralChatbox] getFormattedPortfolioTextResponseFromLLM: Groq API response status -', response.status);
      if (!response.ok) { const errorBody = await response.text(); throw new Error(`LLM Text Response API error: ${response.status} ${response.statusText} - ${errorBody}`);}
      const data = await response.json();
      const formattedText = data.choices?.[0]?.message?.content.trim();
      console.log('[GeneralChatbox] getFormattedPortfolioTextResponseFromLLM: Formatted text -', formattedText ? formattedText.substring(0,100) + "..." : "Empty");
      if (formattedText) return formattedText;
      return "Could not get a formatted response from the assistant.";
    } catch (error) {
      console.error("[GeneralChatbox] getFormattedPortfolioTextResponseFromLLM: ERROR -", error);
      if (error.name === 'AbortError') { console.warn("[GeneralChatbox] getFormattedPortfolioTextResponseFromLLM: Request timed out."); return "The request to the AI assistant timed out.";}
      return "Error processing your request with the AI assistant.";
    }
  };


  // --- General LLM Response (existing) ---
  const fetchGeneralLLMResponse = async (userQuery) => {
    setIsLoading(true);
    console.log('[GeneralChatbox] fetchGeneralLLMResponse: START for query -', userQuery);
    let finalBotResponseText = "Sorry, I encountered an issue processing your request."; // Default error

    try { // This is the main try block for the entire function
      // Phase 1: Ask LLM (Llama 3) to classify intent and extract entities
      const intentExtractionSystemPrompt = `You are an AI assistant that analyzes user queries about finance.
Your task is to classify the user's intent and extract relevant entities if the query is about specific stock data.
Respond ONLY with a JSON object in the following format:
- If the query is a general finance question (e.g., "what is a PE ratio?", "explain inflation"):
  {"intent": "generic_finance_explanation"}
- If the query asks for specific data about a stock (e.g., "price of AAPL", "MSFT PE ratio", "market cap for GOOG", "overview for TSLA"):
  {"intent": "specific_data_lookup", "ticker": "TICKER_SYMBOL", "data_type": "price|pe_ratio|market_cap|overview"}
  (Possible data_type values are: "price", "pe_ratio", "market_cap", "overview". If multiple are implied, pick the most prominent or 'overview'. If asking for general info on a stock, use 'overview'.)
- If the query does not fit the above, or if a ticker is ambiguous or not clearly identifiable:
  {"intent": "unknown_or_general_chat"}

Extract the ticker symbol accurately. For example, in "what is the PE ratio of Apple?", the ticker should be "AAPL".
If you cannot confidently identify a standard stock ticker for a specific data lookup, set intent to "unknown_or_general_chat".`;

      console.log('[GeneralChatbox] Phase 1: Calling LLM for intent extraction.');
      const intentLlmCall = fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [
            { role: "system", content: intentExtractionSystemPrompt },
            { role: "user", content: userQuery }
          ],
          temperature: 0.1,
          max_tokens: 150,
          // response_format: { type: "json_object" }, // Enable if Groq/Llama3 reliably supports it
        }),
      });
      console.log('[GeneralChatbox] Phase 1: Awaiting intent LLM response...');
      const intentResponse = await intentLlmCall;
      console.log('[GeneralChatbox] Phase 1: Intent LLM response status -', intentResponse.status);

      if (!intentResponse.ok) {
        const errorBody = await intentResponse.text();
        throw new Error(`Intent extraction API error ${intentResponse.status}`);
      }

      let parsedIntent;
      let rawIntentText = ''; // To store the raw text for logging if JSON parse fails

      try {
        console.log('[GeneralChatbox] Phase 1: Reading intent response as text...');
        rawIntentText = await intentResponse.text(); // Read as text first
        console.log('[GeneralChatbox] Phase 1: Raw intent text received -', rawIntentText.substring(0,150) + "...");
        const intentData = JSON.parse(rawIntentText); // Then try to parse the entire response

        // Now, intentData holds the parsed JSON from the overall response.
        // Next, extract the 'content' string which is supposed to be another JSON.
        const content = intentData.choices?.[0]?.message?.content; // This 'content' is a string
        if (!content) {
            console.warn("[GeneralChatbox] LLM intent response content string is empty within the JSON structure:", intentData);
            // Fallback if the content string itself is missing or empty
            parsedIntent = { intent: "unknown_or_general_chat", reason: "Empty content string from LLM" };
        } else {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch && jsonMatch[0]) {
              parsedIntent = JSON.parse(jsonMatch[0]);
            } else {
              // If content itself is "Not Found" or not a JSON string.
              console.warn("[GeneralChatbox] Could not find a clear JSON block in intent content string, trying to parse whole content string:", content.substring(0,200));
              parsedIntent = JSON.parse(content); // This might fail if 'content' is "Not Found"
            }
        }
        console.log('[GeneralChatbox] Parsed Intent from LLM:', parsedIntent);
      } catch (e) {
        // This catches errors from parsing rawIntentText OR from parsing the 'content' string.
        console.error(
          "[GeneralChatbox] Error parsing intent JSON. Initial error during text->JSON or content string->JSON:", e, 
          "Raw text response from API:", rawIntentText ? rawIntentText.substring(0,500) : "Not available (error before text read)"
        );
        parsedIntent = { intent: "unknown_or_general_chat", reason: "Failed to parse intent response or content string" }; // Fallback
      }

      // Phase 2: Act based on the intent - Fetch data from Alpha Vantage if needed
      let retrievedDataString = "No specific real-time data was fetched for this query via external APIs.";
      const { intent, ticker, data_type: dataType } = parsedIntent;

      if (intent === "specific_data_lookup" && ticker && ALPHA_VANTAGE_API_KEY) {
        console.log('[GeneralChatbox] Phase 2: Intent is specific_data_lookup. Fetching from Alpha Vantage.');
        const upperTicker = ticker.toUpperCase();

        let fetchedDetailsArray = [];

        // Attempt to fetch GLOBAL_QUOTE data (price, change, etc.)
        console.log(`[GeneralChatbox] Phase 2.1: Fetching GLOBAL_QUOTE for ${upperTicker}`);
        try {
            console.log(`[GeneralChatbox] Fetching price for ${upperTicker} from Alpha Vantage...`);
            const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${upperTicker}&apikey=${ALPHA_VANTAGE_API_KEY}`;
          const avResponse = await fetch(quoteUrl);
          if (avResponse.ok) {
            const avData = await avResponse.json();
            const globalQuote = avData["Global Quote"];
            console.log(`[GeneralChatbox] Alpha Vantage GLOBAL_QUOTE response for ${upperTicker}:`, JSON.stringify(avData, null, 2).substring(0, 500));
            if (globalQuote && globalQuote["05. price"]) {
                fetchedDetailsArray.push(`Price data for ${globalQuote["01. symbol"] || upperTicker}: Current Price $${parseFloat(globalQuote["05. price"]).toFixed(2)}, Previous Close $${parseFloat(globalQuote["08. previous close"]).toFixed(2)}, Change ${globalQuote["10. change percent"]}.`);
              console.log(`[GeneralChatbox] Successfully fetched price for ${upperTicker}:`, retrievedDataString);
            } else if (avData["Note"]) {
               console.warn('[GeneralChatbox] Alpha Vantage API Note (OVERVIEW):', avData["Note"]);
                fetchedDetailsArray.push(`Could not fetch price for ${upperTicker} (Alpha Vantage Note: ${avData["Note"]})`);
            } else {
              console.warn('[GeneralChatbox] Alpha Vantage - Overview data not found:', JSON.stringify(avData).substring(0,200));
                fetchedDetailsArray.push(`Price data not found for ${upperTicker} via Alpha Vantage.`);
            }
          } else {
            const errorText = await avResponse.text();
            console.error(`[GeneralChatbox] Alpha Vantage GLOBAL_QUOTE API Error Status: ${avResponse.status}`, errorText.substring(0, 500));
              fetchedDetailsArray.push(`Error fetching price data for ${upperTicker} from Alpha Vantage (Status: ${avResponse.status}).`);
          }
        } catch (e) {
          console.error("[GeneralChatbox] Exception during Alpha Vantage GLOBAL_QUOTE call:", e);
            fetchedDetailsArray.push(`Error connecting to financial data provider for ${upperTicker} price.`);
        }

        // Attempt to fetch OVERVIEW data (PE, Market Cap, Description, etc.)
        console.log(`[GeneralChatbox] Phase 2.2: Fetching OVERVIEW for ${upperTicker}`);
        try {
            console.log(`[GeneralChatbox] Fetching overview for ${upperTicker} from Alpha Vantage...`);
            const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${upperTicker}&apikey=${ALPHA_VANTAGE_API_KEY}`;
          const avResponse = await fetch(overviewUrl);
          if (avResponse.ok) {
            const avData = await avResponse.json();
            console.log(`[GeneralChatbox] Alpha Vantage OVERVIEW response for ${upperTicker}:`, JSON.stringify(avData, null, 2).substring(0, 500));
            if (avData && avData["Symbol"]) {
              let details = [];
              if (avData["Name"]) details.push(`Company: ${avData["Name"]} (${avData["Symbol"]})`);
              if (avData["PERatio"] && avData["PERatio"] !== "None") details.push(`P/E Ratio: ${avData["PERatio"]}`);
              if (avData["MarketCapitalization"] && avData["MarketCapitalization"] !== "None") {
                  const marketCap = parseInt(avData["MarketCapitalization"]);
                  if (!isNaN(marketCap)) details.push(`Market Cap: $${(marketCap / 1e9).toFixed(2)}B`);
              }
              if (avData["Description"] && avData["Description"] !== "None") details.push(`Description: ${avData["Description"].substring(0, 200)}...`);
              if (avData["EPS"] && avData["EPS"] !== "None") details.push(`EPS: ${avData["EPS"]}`);
              if (avData["DividendYield"] && avData["DividendYield"] !== "None") details.push(`Dividend Yield: ${(parseFloat(avData["DividendYield"]) * 100).toFixed(2)}%`);
              if (avData["52WeekHigh"] && avData["52WeekHigh"] !== "None") details.push(`52W High: $${avData["52WeekHigh"]}`);
              if (avData["52WeekLow"] && avData["52WeekLow"] !== "None") details.push(`52W Low: $${avData["52WeekLow"]}`);
              
              if (details.length > 0) {
                fetchedDetailsArray.push(`Overview: ${details.join('; ')}.`);
              } else {
                fetchedDetailsArray.push(`Key overview data not readily available for ${upperTicker}.`);
              }
              console.log(`[GeneralChatbox] Successfully fetched overview for ${upperTicker}:`, retrievedDataString);
            } else if (avData["Note"]) {
               console.warn('[GeneralChatbox] Alpha Vantage API Note (OVERVIEW):', avData["Note"]);
                fetchedDetailsArray.push(`Could not fetch overview for ${upperTicker} (Alpha Vantage Note: ${avData["Note"]})`);
            } else {
              console.warn('[GeneralChatbox] Alpha Vantage - Overview data not found:', JSON.stringify(avData).substring(0,200));
                fetchedDetailsArray.push(`Overview data not found for ${upperTicker} via Alpha Vantage.`);
            }
          } else {
            const errorText = await avResponse.text();
            console.error(`[GeneralChatbox] Alpha Vantage OVERVIEW API Error Status: ${avResponse.status}`, errorText.substring(0, 500));
              fetchedDetailsArray.push(`Error fetching overview data for ${upperTicker} from Alpha Vantage (Status: ${avResponse.status}).`);
          }
        } catch (e) {
          console.error("[GeneralChatbox] Exception during Alpha Vantage OVERVIEW call:", e);
            fetchedDetailsArray.push(`Error connecting to financial data provider for ${upperTicker} overview.`);
        }
        retrievedDataString = fetchedDetailsArray.length > 0 ? fetchedDetailsArray.join(" \n") + " (Source: Alpha Vantage)" : "Could not retrieve detailed data from Alpha Vantage.";

      } else {
        console.log(`[GeneralChatbox] Phase 2: Intent is '${intent}'. Skipping Alpha Vantage call. Ticker: ${ticker}, DataType: ${dataType}, Key available: ${!!ALPHA_VANTAGE_API_KEY}`);
      }

      // Phase 3: Generate final response using LLM (Llama 3)
      console.log("[GeneralChatbox] Phase 3: Preparing final LLM prompt with data:", retrievedDataString.substring(0,100) + "...");
      const finalResponseSystemPrompt = `You are a helpful AI assistant and also act as a financial analyst when asked about market topics. 
The user asked the following question. This question was NOT answerable from their personal portfolio data.

IMPORTANT LIMITATION: You DO NOT have access to real-time data from the internet (like current stock prices, live PE ratios, or today's news headlines).

The following information was retrieved from an external financial data API (if applicable):
---
${retrievedDataString}
---

Based on the user's query AND the retrieved data above, provide an insightful and professional response.
If the retrieved data directly answers the query, present it clearly.
If the retrieved data indicates an error, an API limit, or that data was not found (e.g., contains "Could not fetch", "Error fetching", "data not found"), acknowledge this limitation for the specific request. Then, provide general context about the query topic or explain where the user might typically find such information, based on your expertise and general knowledge.
If the query is more general (e.g., "explain what a PE ratio is"), provide a concise, expert explanation.
Maintain a professional and helpful tone.`;
    
      // This inner try...catch was for the final LLM call specifically, which is fine.
      console.log('[GeneralChatbox] Phase 3: Calling final LLM for response generation.');
      const finalLlmResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama3-8b-8192", // Or your preferred Groq model
          messages: [
            { role: "system", content: finalResponseSystemPrompt },
            { role: "user", content: userQuery }
          ],
          temperature: 0.7,
        }),
      });

      console.log('[GeneralChatbox] Phase 3: Final LLM response status -', finalLlmResponse.status);
      if (!finalLlmResponse.ok) {
        const errorBody = await finalLlmResponse.text();
        throw new Error(`Final LLM response API error ${finalLlmResponse.status}`);
      }

      const data = await finalLlmResponse.json();
      const botResponseText = data.choices?.[0]?.message?.content.trim();
      console.log('[GeneralChatbox] Phase 3: Final bot response text -', botResponseText ? botResponseText.substring(0,100) + "..." : "Empty");

      if (botResponseText) {
        finalBotResponseText = botResponseText;
      } else {
        console.warn("[GeneralChatbox] Phase 3: Empty response content from final LLM.");
        throw new Error("Empty response from LLM");
      }
      console.log('[GeneralChatbox] fetchGeneralLLMResponse: END - Successfully processed.');
    } catch (error) { // This catch is for the main try block starting at line 261
      console.error("[GeneralChatbox] Error in fetchGeneralLLMResponse:", error);
      // Update finalBotResponseText if it hasn't been set by a more specific error message
      if (finalBotResponseText === "Sorry, I encountered an issue processing your request." || !finalBotResponseText.includes(error.message) ) {
        finalBotResponseText = `Sorry, an error occurred: ${error.message.substring(0,150)}`;
      }
    } finally {      
      console.log('[GeneralChatbox] fetchGeneralLLMResponse: FINALLY block - Updating messages.');
      setMessages(prevMessages => [
        ...prevMessages,
{ 
          id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          text: finalBotResponseText, 
          sender: 'bot',
          mode: 'error'
        },
      ]);
      setIsLoading(false);
    }
  };
  const handleSend = async () => {
    if (!supabaseClient) {
      console.error("Supabase client not available");
      return;
    }
    if (!inputText.trim()) return;

    const userMessage = inputText.trim();
    console.log('[GeneralChatbox] handleSend: Starting with message:', userMessage);
    console.log('[GeneralChatbox] handleSend: RAG Mode:', isRAGEnabled ? 'Enabled' : 'Disabled');
    
    setInputText('');
    setMessages(prev => [...prev, { 
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user', 
      content: userMessage 
    }]);
    setIsLoading(true);

    try {
      if (isRAGEnabled) {
        // First try to interpret as a portfolio query
        console.log('[GeneralChatbox] handleSend: Attempting to interpret as portfolio query...');
        const sqlQuery = await interpretPortfolioQuery(userMessage);
        
        if (sqlQuery && sqlQuery !== 'QUERY_UNANSWERABLE') {
          console.log('[GeneralChatbox] handleSend: Valid SQL query generated:', sqlQuery);
          try {
            const portfolioData = await fetchPortfolioDataFromSupabase(sqlQuery);
            console.log('[GeneralChatbox] handleSend: Portfolio data retrieved:', portfolioData);
            
            if (portfolioData && portfolioData.length > 0) {
              const formattedResponse = await getFormattedPortfolioTextResponseFromLLM(userMessage, portfolioData);
              setMessages(prev => [...prev, { 
                id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                role: 'assistant', 
                content: formattedResponse,
                mode: 'rag-sql'
              }]);
              return;
            }
          } catch (error) {
            console.error('[GeneralChatbox] handleSend: Error fetching portfolio data:', error);
          }
        }

        // If portfolio query fails or no data found, try RAG with embeddings
        console.log('[GeneralChatbox] handleSend: Falling back to RAG with embeddings...');
        const queryEmbedding = await generateEmbedding(userMessage);
        
        if (!queryEmbedding) {
          throw new Error("Could not generate embedding for the query");
        }

        const flattenedEmbedding = Array.isArray(queryEmbedding[0]) ? queryEmbedding[0] : queryEmbedding;
        console.log('[GeneralChatbox] handleSend: Flattened embedding length:', flattenedEmbedding.length);

        const { data: portfolioData, error } = await supabaseClient
          .rpc('match_portfolio_summary', {
            query_embedding: flattenedEmbedding,
            match_threshold: 0.7,
            match_count: 5
          });

        if (error) {
          console.error('[GeneralChatbox] handleSend: Portfolio search error:', error);
          throw error;
        }
        
        console.log('[GeneralChatbox] handleSend: Portfolio data found:', portfolioData ? `${portfolioData.length} results` : 'No results');

        if (portfolioData && portfolioData.length > 0) {
          const response = await getRagLLMResponse(userMessage, portfolioData);
          if (response) {
            setMessages(prev => [...prev, { 
              id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              role: 'assistant', 
              content: response,
              mode: 'rag-embedding'
            }]);
            return;
          }
        }

        // If no portfolio data found or RAG failed, fall back to standard response
        console.log('[GeneralChatbox] handleSend: No portfolio data found, falling back to standard response');
        await getStandardLLMResponse(userMessage);
      } else {
        // Standard AI Mode
        await getStandardLLMResponse(userMessage);
      }
    } catch (error) {
      console.error('[GeneralChatbox] handleSend: Error occurred:', error);
      setMessages(prev => [...prev, { 
        id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant', 
        content: "I apologize, but I encountered an error. Please try again.",
        mode: 'error'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Function for standard LLM responses (without RAG)
  const getStandardLLMResponse = async (userQuery) => {
    console.log('[GeneralChatbox] getStandardLLMResponse: Starting with query:', userQuery);
    
    try {
      console.log('[GeneralChatbox] getStandardLLMResponse: Preparing LLM request...');
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [
            {
              role: "system",
              content: `You are a helpful AI assistant that can answer questions about finance and investing.
Keep responses concise, accurate, and focused on the user's question.
If you don't know something, say so politely.`
            },
            { role: "user", content: userQuery }
          ],
          temperature: 0.7,
        }),
      });

      console.log('[GeneralChatbox] getStandardLLMResponse: LLM API response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GeneralChatbox] getStandardLLMResponse: LLM API error:', errorText);
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('[GeneralChatbox] getStandardLLMResponse: LLM response data received');
      
      const botResponse = data.choices?.[0]?.message?.content;
      console.log('[GeneralChatbox] getStandardLLMResponse: Bot response extracted:', botResponse ? 'Success' : 'Failed');
      
      setMessages(prev => [...prev, { 
        id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant', 
        content: botResponse,
        mode: 'standard'
      }]);
    } catch (error) {
      console.error('[GeneralChatbox] getStandardLLMResponse: Error:', error);
      setMessages(prev => [...prev, { 
        id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant', 
        content: "I apologize, but I encountered an error. Please try again.",
        mode: 'error'
      }]);
    }
  };

  // Add logs to getRagLLMResponse function
  const getRagLLMResponse = async (userQuery, portfolioData) => {
    console.log('[GeneralChatbox] getRagLLMResponse: Starting with query:', userQuery);
    console.log('[GeneralChatbox] getRagLLMResponse: Portfolio data available:', portfolioData ? `${portfolioData.length} items` : 'None');
    
    try {
      console.log('[GeneralChatbox] getRagLLMResponse: Preparing LLM request...');
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [
            {
              role: "system",
              content: `You are a helpful AI assistant that provides information about the user's portfolio.
Use the following portfolio data to answer the user's question:
${JSON.stringify(portfolioData, null, 2)}

If the data doesn't contain relevant information to answer the question, say so politely.
Keep responses concise and focused on the data provided.`
            },
            { role: "user", content: userQuery }
          ],
          temperature: 0.7,
        }),
      });

      console.log('[GeneralChatbox] getRagLLMResponse: LLM API response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GeneralChatbox] getRagLLMResponse: LLM API error:', errorText);
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('[GeneralChatbox] getRagLLMResponse: LLM response data received');
      
      const botResponse = data.choices?.[0]?.message?.content;
      console.log('[GeneralChatbox] getRagLLMResponse: Bot response extracted:', botResponse ? 'Success' : 'Failed');
      
      return botResponse;
    } catch (error) {
      console.error('[GeneralChatbox] getRagLLMResponse: Error:', error);
      return null;
    }
  };

  // --- Copied and adapted from PortfolioGraph.js ---
  const FormattedLLMResponse = ({ text }) => {
    if (!text) return null;
    const lines = text.split('\n');

    const renderTextWithPL = (lineText) => {
      const pnlRegex = /(-\$?\s*[\d,]+\.\d{2}\s*,\s*-?\s*\d+\.?\d*\s*%|\$?\s*[\d,]+\.\d{2}\s*,\s*\+?\s*\d+\.?\d*\s*%)/g;
      const pnlParts = lineText.split(pnlRegex); // Split by P&L

      return pnlParts.map((pnlPart, pnlIndex) => {
        if (pnlPart && pnlPart.match(pnlRegex)) { // This part is a P&L value
          const isNegative = pnlPart.startsWith('-') || pnlPart.includes(' -');
          return <Text key={`pnl-${pnlIndex}`} style={isNegative ? portfolioQueryStyles.negativeChange : portfolioQueryStyles.positiveChange}>{pnlPart}</Text>;
        } else if (pnlPart) { // This part is regular text, potentially containing tickers
          // Regex to find tickers: standalone (2-5 uppercase letters) or in parentheses (1-5 uppercase letters)
          // This regex splits the string and includes the tickers themselves in the resulting array.
          const tickerSplitRegex = /(\b[A-Z]{2,5}\b|\([A-Z]{1,5}\))/g;
          const textParts = pnlPart.split(tickerSplitRegex);

          return textParts.map((textPart, textIndex) => {
            if (textPart && textPart.match(tickerSplitRegex)) {
              // This part is a ticker.
              let tickerSymbol = textPart;
              let openParen = '';
              let closeParen = '';

              if (textPart.startsWith('(') && textPart.endsWith(')')) {
                tickerSymbol = textPart.substring(1, textPart.length - 1);
                openParen = '(';
                closeParen = ')';
              }

              return (
                <Text key={`ticker-${pnlIndex}-${textIndex}`}>
                  {openParen}
                  <Text style={{ fontWeight: 'bold' }}>{tickerSymbol}</Text>
                  {closeParen}
                </Text>
              );
            }
            // This part is regular text between tickers or P&L values
            return <Text key={`text-${pnlIndex}-${textIndex}`}>{textPart}</Text>;
          }).filter(Boolean); // Filter out empty strings from split
        }
        return null;
      }).filter(Boolean); // Filter out nulls if pnlPart was empty
    };

    return (
      <View style={portfolioQueryStyles.llmTextResponseContainer}>
        {lines.map((line, index) => {
          line = line.trim();
          if (line.startsWith('* ')) {
            return (
              <View key={index} style={portfolioQueryStyles.bulletItemContainer}>
                <Text style={portfolioQueryStyles.bulletPoint}>•</Text>
                <Text style={portfolioQueryStyles.bulletText}>
                  {renderTextWithPL(line.substring(2))}
                </Text>
              </View>
            );
          } else if (line.length > 0) {
            return (
              <Text key={index} style={portfolioQueryStyles.llmParagraph}>
                {renderTextWithPL(line)}
              </Text>
            );
          }
          return null;
        })}
      </View>
    );
  };

  const renderFallbackResults = (results) => {
    if (!results || results.length === 0) {
      return <Text style={portfolioQueryStyles.resultsEmptyText}>No matching records found.</Text>;
    }

    const firstRow = results[0];
    const columnNames = Object.keys(firstRow);
    const numRows = results.length;
    const numCols = columnNames.length;

    // Scenario 1: Single value result (e.g., SUM, COUNT, AVG)
    if (numRows === 1 && numCols === 1) {
      const key = columnNames[0];
      const value = firstRow[key];
      return (
        <View style={portfolioQueryStyles.singleResultContainer}>
          <Text style={portfolioQueryStyles.singleResultKey}>{formatDisplayKey(key)}</Text>
          <Text style={portfolioQueryStyles.singleResultValue}>
            {typeof value === 'number'
              ? (key.toLowerCase().includes('pnl_dollar')
                  ? <Text style={[portfolioQueryStyles.valueAmount, getGainLossColor(value)]}>{formatCurrency(value)}</Text>
                  : (key.toLowerCase().includes('pnl_percent')
                      ? <Text style={[portfolioQueryStyles.valueAmount, getGainLossColor(value)]}>{value.toFixed(2)}%</Text>
                      : formatCurrency(value)))
              : String(value)}
          </Text>
        </View>
      );
    }

    // Scenario 3: Default to table for multiple rows or multiple columns
    return (
      <View style={portfolioQueryStyles.resultsTable}>
        <View style={portfolioQueryStyles.resultsRowHeader}>
          {columnNames.map((key) => (
            <Text key={key} style={portfolioQueryStyles.resultsCellHeader}>
              {formatDisplayKey(key)}
            </Text>
          ))}
        </View>
        {results.map((row, rowIndex) => (
          <View key={rowIndex} style={portfolioQueryStyles.resultsRow}>
            {Object.values(row).map((value, cellIndex) => {
               const currentColumnKey = columnNames[cellIndex];
               return (
                <Text key={cellIndex} style={portfolioQueryStyles.resultsCell}>
                  {typeof value === 'number'
                    ? (currentColumnKey.toLowerCase().includes('pnl_dollar')
                        ? <Text style={[portfolioQueryStyles.valueAmount, getGainLossColor(value)]}>{formatCurrency(value)}</Text>
                        : (currentColumnKey.toLowerCase().includes('pnl_percent')
                            ? <Text style={[portfolioQueryStyles.valueAmount, getGainLossColor(value)]}>{value.toFixed(2)}%</Text>
                            : value.toFixed(2)))
                    : value === null || value === undefined ? '' : String(value)}
                </Text>
              );
            })}
          </View>
        ))}
      </View>
    );
  };
  // --- End of copied components ---

  return (
    <View style={styles.overlay}>
      <View style={styles.chatboxContainer}>
        {/* Top Bar (Header) */}
        <LinearGradient
          colors={['#6D28D9', '#3B0764', '#1A1A2E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.topBar}
        >
          <GestureDetector gesture={dragGesture}>
            <View style={styles.swipeHandleContainer}>
              <View style={styles.swipeHandle} />
            </View>
          </GestureDetector>
          <View style={styles.topBarContent}>
            <Text style={styles.topBarTitle}>AI Chatbox</Text>
            <View style={styles.toggleContainer}>
              <Text style={styles.toggleLabel}>RAG</Text>
              <Switch
                value={isRAGEnabled}
                onValueChange={setIsRAGEnabled}
                trackColor={{ false: '#767577', true: '#8A2BE2' }}
                thumbColor={isRAGEnabled ? '#f4f3f4' : '#f4f3f4'}
                ios_backgroundColor="#3e3e3e"
              />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
        {/* Messages Area (Scrollable) */}
        <View style={styles.messagesWrapper}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContentContainer}
            keyboardShouldPersistTaps="handled"
          >
            {/* ... message rendering ... */}
            {messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.messageBubble,
                  msg.role === 'user' ? styles.userMessage : styles.botMessage,
                ]}
              >
                <Text style={msg.role === 'user' ? styles.userMessageText : styles.botMessageText}>
                  {msg.content}
                </Text>
                {msg.role === 'assistant' && msg.mode && (
                  <View style={styles.modeIndicator}>
                    <Text style={styles.modeIndicatorText}>
                      {msg.mode === 'rag-sql' ? 'SQL RAG' :
                        msg.mode === 'rag-embedding' ? 'Embedding RAG' :
                          msg.mode === 'standard' ? 'Standard AI' :
                            msg.mode === 'error' ? 'Error' : ''}
                    </Text>
                  </View>
                )}
              </View>
            ))}
            {(isLoading || isPortfolioLoading) && (
              <View key="loading" style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#007AFF" />
              </View>
            )}
          </ScrollView>
        </View>
        {/* Input Field (Always at bottom) */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          style={styles.inputContainer}
        >
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={`Ask about your portfolio ${isRAGEnabled ? '(RAG Enabled)' : '(Standard AI)'}...`}
            placeholderTextColor="rgba(0,0,0,0.4)"
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!isLoading}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.10)', justifyContent: 'flex-end', alignItems: 'center' },
  chatboxContainer: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', flexDirection: 'column' },
  topBar: {
    height: 70,
    paddingHorizontal: 20,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(95vh - 140px)',
  },
  messagesContainer: {
    height: 'calc(95vh - 140px)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    overflowY: 'auto',
  },
  messagesContentContainer: {
    padding: 15,
    paddingBottom: 20,
  },
  messageBubble: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    marginBottom: 12,
    maxWidth: '85%',
    minWidth: '20%',
  },
  userMessage: {
    backgroundColor: '#1565C0',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 5,
  },
  botMessage: {
    backgroundColor: '#E0E0E0',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 5,
  },
  userMessageText: {
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  botMessageText: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 22,
  },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 15, borderTopColor: '#E0E7F1', backgroundColor: '#FFFFFF', padding: 1 },
  input: {
    flex: 1,
    color: '#000000',
    fontSize: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 5,
    marginRight: 20,
    minHeight: 48,
    maxHeight: 120,
  },
  sendButton: {
    marginLeft: 20,
    backgroundColor: '#10b981',
    borderRadius: 24,
    padding: 12,
    minWidth: 90,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#BFBFDF',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loadingContainer: {
    alignSelf: 'flex-start',
    padding: 15,
  },
  swipeHandleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    width: '100%',
  },
  swipeHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  topBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
    paddingVertical: 12,
  },
  topBarTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
  },
  toggleLabel: {
    color: '#fff',
    marginRight: 10,
    fontSize: 16,
  },
  closeButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    marginLeft: 12,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modeIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modeIndicatorText: {
    fontSize: 10,
    color: 'rgba(0, 0, 0, 0.6)',
    fontWeight: '500',
  },
  messagesWrapper: { flex: 1, backgroundColor: '#FFFFFF', marginBottom: 60 },
});

// Styles for portfolio query results, adapted from PortfolioGraph.js
const portfolioQueryStyles = StyleSheet.create({
  portfolioMessageBubble: {
    backgroundColor: '#E8F0F9',
    borderColor: '#C9DDF0',
    borderWidth: 1,
    padding: 16, // Increased padding
  },
  llmTextResponseContainer: {
    paddingVertical: 8,
  },
  llmParagraph: {
    fontSize: 16, // Increased font size
    lineHeight: 24, // Increased line height
    color: '#222',
    marginBottom: 8,
  },
  bulletItemContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingLeft: 8,
  },
  bulletPoint: {
    fontSize: 16, // Increased font size
    lineHeight: 24, // Increased line height
    color: '#00529B',
    marginRight: 8,
    fontWeight: 'bold',
  },
  bulletText: {
    flex: 1,
    fontSize: 16, // Increased font size
    lineHeight: 24, // Increased line height
    color: '#222',
  },
  resultsEmptyText: {
    fontSize: 16, // Increased font size
    color: '#666',
    textAlign: 'center',
    paddingVertical: 12,
  },
  positiveChange: {
    color: '#2E7D32',
    fontWeight: '500', // Added font weight
  },
  negativeChange: {
    color: '#C62828',
    fontWeight: '500', // Added font weight
  },
  resultsTable: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
  },
  resultsRowHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#B0BEC5',
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: '#ECEFF1',
  },
  resultsCellHeader: {
    flex: 1,
    fontSize: 14, // Increased font size
    fontWeight: 'bold',
    paddingHorizontal: 8,
    color: '#37474F',
    textTransform: 'capitalize',
  },
  resultsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#CFD8DC',
    paddingVertical: 8,
  },
  resultsCell: {
    flex: 1,
    fontSize: 14, // Increased font size
    paddingHorizontal: 8,
    color: '#455A64',
  },
  singleResultContainer: {
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
    marginVertical: 8,
  },
  singleResultKey: {
    fontSize: 16, // Increased font size
    color: '#546E7A',
    marginBottom: 4,
  },
  singleResultValue: {
    fontSize: 20, // Increased font size
    fontWeight: '600',
    color: '#263238',
  },
  valueAmount: {
    fontSize: 14, // Increased font size
    fontWeight: '500',
  },
});


export { styles, portfolioQueryStyles, GeneralChatbox as default };
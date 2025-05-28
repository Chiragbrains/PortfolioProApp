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
import { LinearGradient } from 'expo-linear-gradient';
import { useSupabaseConfig } from './SupabaseConfigContext';
import { GROQ_API_KEY, ALPHA_VANTAGE_API_KEY } from '@env';
import { generateEmbedding } from './services/embeddingService';
import { searchRelevantContext } from './services/vectorSearchService';
import { getRagLLMResponse, formatSQLResultsForChat } from './services/ragLlmService';
import { saveContextToDatabase } from './services/contextStorageService';

const screenHeight = Dimensions.get('window').height;

const UnifiedChatbox = ({ onClose }) => {
  // --- State ---
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
  const scrollViewRef = useRef();
  const { supabaseClient } = useSupabaseConfig();

  // --- Gesture for swipe-to-close ---
  const SWIPE_CLOSE_THRESHOLD_Y = 50;
  const SWIPE_CLOSE_VELOCITY_Y = 500;
  const dragGesture = Gesture.Pan()
    .onEnd((event) => {
      if (event.translationY > SWIPE_CLOSE_THRESHOLD_Y && event.velocityY > SWIPE_CLOSE_VELOCITY_Y) {
        onClose();
      }
    });

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // --- Helper functions for formatting ---
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

  // --- Portfolio Query Logic (SQL via LLM) ---
  const interpretPortfolioQuery = async (userQuery) => {
    console.log('[UnifiedChatbox] interpretPortfolioQuery: START for query -', userQuery);
    const systemPrompt = `You are an expert SQL generator for portfolio analysis. Your task is to translate natural language questions into SQL SELECT queries for a specific table.

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
   a. If the input is clearly a ticker symbol (e.g., "AAPL", "MSFT"), use an exact match on the \`ticker\` column
   b. If the input is a company name (e.g., "Apple", "Microsoft"), use ILIKE on the \`company_name\` column
9. For queries about asset types (stocks, ETFs, cash), use the \`type\` column with exact matches
10. When calculating performance metrics, include:
    - Total market value
    - Total P&L (dollar and percentage)
    - Number of holdings
    - Average P&L percentage

Examples:
- User: "What's the overall performance of my stocks?" -> 
  SQL: SELECT 
    SUM(market_value) as total_market_value,
    SUM(pnl_dollar) as total_pnl_dollar,
    AVG(pnl_percent) as avg_pnl_percent,
    COUNT(*) as num_holdings
  FROM portfolio_summary 
  WHERE type = 'stock';

- User: "Tell me about my ETF investments" ->
  SQL: SELECT 
    ticker, company_name, market_value, pnl_dollar, pnl_percent, portfolio_percent
  FROM portfolio_summary 
  WHERE type = 'etf'
  ORDER BY market_value DESC;

- User: "How are my tech stocks doing?" ->
  SQL: SELECT 
    ticker, company_name, market_value, pnl_dollar, pnl_percent
  FROM portfolio_summary 
  WHERE type = 'stock' AND company_name ILIKE '%tech%'
  ORDER BY pnl_percent DESC;

- User: "Give me an overview of my portfolio" ->
  SQL: SELECT 
    ticker, company_name, market_value, pnl_dollar, pnl_percent, portfolio_percent
  FROM portfolio_summary 
  ORDER BY market_value DESC;

- User: "What's my cash position?" ->
  SQL: SELECT 
    ticker, company_name, market_value, pnl_dollar, pnl_percent, portfolio_percent
  FROM portfolio_summary 
  WHERE type = 'cash';`;

    try {
      console.log('[UnifiedChatbox] interpretPortfolioQuery: Preparing to call Groq for SQL generation.');
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userQuery }
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`SQL generation API error: ${response.status}`);
      }

      const data = await response.json();
      const sqlQuery = data.choices?.[0]?.message?.content;
      
      if (sqlQuery === 'QUERY_UNANSWERABLE') {
        return 'QUERY_UNANSWERABLE';
      }

      // Extract SQL query from the response
      const sqlRegex = /```(?:sql)?\s*(SELECT[\s\S]*?)(?:;)?\s*```|^(SELECT[\s\S]*?)(?:;)?$/im;
      const match = sqlQuery.match(sqlRegex);
      if (match) {
        const extractedSql = (match[1] || match[2] || '').trim();
        if (extractedSql.toUpperCase().startsWith('SELECT')) {
          return extractedSql;
        }
      }
      return null;
    } catch (error) {
      console.error('[UnifiedChatbox] interpretPortfolioQuery: Error:', error);
      return null;
    }
  };

  const fetchPortfolioDataFromSupabase = async (sqlQuery) => {
    if (!supabaseClient) throw new Error("Supabase client not available.");
    if (!sqlQuery || typeof sqlQuery !== 'string' || !sqlQuery.trim().toUpperCase().startsWith('SELECT')) throw new Error("Invalid or non-SELECT SQL query provided.");
    const { data, error } = await supabaseClient.rpc('execute_sql', { sql_query: sqlQuery });
    if (error) { throw new Error(`Database query failed: ${error.message}`); }
    return data || [];
  };

  const getFormattedPortfolioTextResponseFromLLM = async (originalUserQuery, databaseResults) => {
    console.log('[UnifiedChatbox] getFormattedPortfolioTextResponseFromLLM: START for query -', originalUserQuery);
    if (!databaseResults || databaseResults.length === 0) return "No data was found to answer your question.";
    
    const safeUserQuery = String(originalUserQuery || '');
    const resultsSampleForLLM = Array.isArray(databaseResults) ? databaseResults.slice(0, 100) : [];
    
    try {
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
              content: `You are an AI assistant that provides clear and concise natural language answers based on database query results.
Given a user's question and database results, formulate a helpful text response.
Your response will be displayed in a mobile app, so keep it readable.

Important formatting rules:
1. DO NOT use any HTML tags or markdown formatting
2. DO NOT use <font> tags or any other HTML styling
3. For P&L values, just write them directly (e.g., "-$1,234.56" or "-12.34%")
4. The app will automatically color-code negative values in red and positive values in green
5. Use bullet points by starting each line with an asterisk and space ("* ")

For sector-based queries:
- Start with a summary of the sector's overall performance
- Then list individual holdings with their key metrics
- Group similar holdings together
- Highlight significant gains or losses
- Mention the total number of holdings in the sector

For dividend-paying stocks:
- Start with the total number of dividend-paying stocks
- List them by dividend yield
- Include their current market value and P&L
- Highlight any significant dividend yields

Be direct and clear in your response. Mention relevant results, including company names where appropriate.`
            },
            { 
              role: "user", 
              content: `Original Question: "${safeUserQuery}"\n\nDatabase Results:\n${JSON.stringify(resultsSampleForLLM, null, 2)}`
            }
          ],
          temperature: 0.3,
        })
      });

      if (!response.ok) {
        throw new Error(`LLM Text Response API error: ${response.status}`);
      }

      const data = await response.json();
      const formattedText = data.choices?.[0]?.message?.content.trim();
      
      if (formattedText) return formattedText;
      return "Could not get a formatted response from the assistant.";
    } catch (error) {
      console.error("[UnifiedChatbox] getFormattedPortfolioTextResponseFromLLM: ERROR -", error);
      return "Error processing your request with the AI assistant.";
    }
  };

  // --- General LLM Response (standard AI) ---
  const getStandardLLMResponse = async (userQuery) => {
    console.log('[UnifiedChatbox] getStandardLLMResponse: Starting with query:', userQuery);
    let finalBotResponseText = "Sorry, I encountered an issue processing your request."; // Default error

    try {
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

      console.log('[UnifiedChatbox] Phase 1: Calling LLM for intent extraction.');
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
        }),
      });

      console.log('[UnifiedChatbox] Phase 1: Awaiting intent LLM response...');
      const intentResponse = await intentLlmCall;
      console.log('[UnifiedChatbox] Phase 1: Intent LLM response status -', intentResponse.status);

      if (!intentResponse.ok) {
        const errorBody = await intentResponse.text();
        throw new Error(`Intent extraction API error ${intentResponse.status}`);
      }

      let parsedIntent;
      let rawIntentText = '';

      try {
        console.log('[UnifiedChatbox] Phase 1: Reading intent response as text...');
        rawIntentText = await intentResponse.text();
        console.log('[UnifiedChatbox] Phase 1: Raw intent text received -', rawIntentText.substring(0,150) + "...");
        const intentData = JSON.parse(rawIntentText);
        const content = intentData.choices?.[0]?.message?.content;
        
        if (!content) {
          console.warn("[UnifiedChatbox] LLM intent response content string is empty within the JSON structure:", intentData);
          parsedIntent = { intent: "unknown_or_general_chat", reason: "Empty content string from LLM" };
        } else {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch && jsonMatch[0]) {
            parsedIntent = JSON.parse(jsonMatch[0]);
          } else {
            console.warn("[UnifiedChatbox] Could not find a clear JSON block in intent content string, trying to parse whole content string:", content.substring(0,200));
            parsedIntent = JSON.parse(content);
          }
        }
        console.log('[UnifiedChatbox] Parsed Intent from LLM:', parsedIntent);
      } catch (e) {
        console.error(
          "[UnifiedChatbox] Error parsing intent JSON:", e,
          "Raw text response from API:", rawIntentText ? rawIntentText.substring(0,500) : "Not available"
        );
        parsedIntent = { intent: "unknown_or_general_chat", reason: "Failed to parse intent response or content string" };
      }

      // Phase 2: Act based on the intent - Fetch data from Alpha Vantage if needed
      let retrievedDataString = "No specific real-time data was fetched for this query via external APIs.";
      const { intent, ticker, data_type: dataType } = parsedIntent;

      if (intent === "specific_data_lookup" && ticker && ALPHA_VANTAGE_API_KEY) {
        console.log('[UnifiedChatbox] Phase 2: Intent is specific_data_lookup. Fetching from Alpha Vantage.');
        const upperTicker = ticker.toUpperCase();
        let fetchedDetailsArray = [];

        // Fetch GLOBAL_QUOTE data
        try {
          const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${upperTicker}&apikey=${ALPHA_VANTAGE_API_KEY}`;
          const avResponse = await fetch(quoteUrl);
          if (avResponse.ok) {
            const avData = await avResponse.json();
            const globalQuote = avData["Global Quote"];
            if (globalQuote && globalQuote["05. price"]) {
              fetchedDetailsArray.push(`Price data for ${globalQuote["01. symbol"] || upperTicker}: Current Price $${parseFloat(globalQuote["05. price"]).toFixed(2)}, Previous Close $${parseFloat(globalQuote["08. previous close"]).toFixed(2)}, Change ${globalQuote["10. change percent"]}.`);
            } else if (avData["Note"]) {
              fetchedDetailsArray.push(`Could not fetch price for ${upperTicker} (Alpha Vantage Note: ${avData["Note"]})`);
            } else {
              fetchedDetailsArray.push(`Price data not found for ${upperTicker} via Alpha Vantage.`);
            }
          } else {
            const errorText = await avResponse.text();
            fetchedDetailsArray.push(`Error fetching price data for ${upperTicker} from Alpha Vantage (Status: ${avResponse.status}).`);
          }
        } catch (e) {
          fetchedDetailsArray.push(`Error connecting to financial data provider for ${upperTicker} price.`);
        }

        // Fetch OVERVIEW data
        try {
          const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${upperTicker}&apikey=${ALPHA_VANTAGE_API_KEY}`;
          const avResponse = await fetch(overviewUrl);
          if (avResponse.ok) {
            const avData = await avResponse.json();
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
            } else if (avData["Note"]) {
              fetchedDetailsArray.push(`Could not fetch overview for ${upperTicker} (Alpha Vantage Note: ${avData["Note"]})`);
            } else {
              fetchedDetailsArray.push(`Overview data not found for ${upperTicker} via Alpha Vantage.`);
            }
          } else {
            const errorText = await avResponse.text();
            fetchedDetailsArray.push(`Error fetching overview data for ${upperTicker} from Alpha Vantage (Status: ${avResponse.status}).`);
          }
        } catch (e) {
          fetchedDetailsArray.push(`Error connecting to financial data provider for ${upperTicker} overview.`);
        }
        retrievedDataString = fetchedDetailsArray.length > 0 ? fetchedDetailsArray.join(" \n") + " (Source: Alpha Vantage)" : "Could not retrieve detailed data from Alpha Vantage.";
      }

      // Phase 3: Generate final response using LLM
      console.log("[UnifiedChatbox] Phase 3: Preparing final LLM prompt with data:", retrievedDataString.substring(0,100) + "...");
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

      const finalLlmResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [
            { role: "system", content: finalResponseSystemPrompt },
            { role: "user", content: userQuery }
          ],
          temperature: 0.7,
        }),
      });

      if (!finalLlmResponse.ok) {
        const errorBody = await finalLlmResponse.text();
        throw new Error(`Final LLM response API error ${finalLlmResponse.status}`);
      }

      const data = await finalLlmResponse.json();
      const botResponseText = data.choices?.[0]?.message?.content.trim();

      if (botResponseText) {
        finalBotResponseText = botResponseText;
      } else {
        throw new Error("Empty response from LLM");
      }
    } catch (error) {
      console.error("[UnifiedChatbox] Error in getStandardLLMResponse:", error);
      if (finalBotResponseText === "Sorry, I encountered an issue processing your request." || !finalBotResponseText.includes(error.message)) {
        finalBotResponseText = `Sorry, an error occurred: ${error.message.substring(0,150)}`;
      }
    }
    
    return finalBotResponseText;
  };

  // --- RAG LLM Response ---
  const getRagLLMResponseUnified = async (userQuery, portfolioData) => {
    // Use the getRagLLMResponse from GeneralChatbox.js, but format the response with FormattedLLMResponse
    try {
      const response = await getRagLLMResponse(userQuery, portfolioData);
      return response;
    } catch (error) {
      return null;
    }
  };

  // --- Main send handler ---
  const handleSend = async () => {
    if (!supabaseClient) {
      console.error("Supabase client not available");
      return;
    }
    if (!inputText.trim()) return;

    const userMessage = inputText.trim();
    console.log('[UnifiedChatbox] handleSend: Starting with message:', userMessage);
    
    setInputText('');
    setMessages(prev => [...prev, { 
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user', 
      content: userMessage 
    }]);
    setIsLoading(true);

    try {
      // Try SQL portfolio query first
      const sqlQuery = await interpretPortfolioQuery(userMessage);
      if (sqlQuery && sqlQuery !== 'QUERY_UNANSWERABLE') {
        try {
          const portfolioData = await fetchPortfolioDataFromSupabase(sqlQuery);
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
          console.error('[UnifiedChatbox] SQL query error:', error);
        }
      }

      // If SQL fails, try RAG embedding
      const queryEmbedding = await generateEmbedding(userMessage);
      if (!queryEmbedding) {
        throw new Error("Could not generate embedding for the query");
      }

      const flattenedEmbedding = Array.isArray(queryEmbedding[0]) ? queryEmbedding[0] : queryEmbedding;
      const { data: portfolioData, error } = await supabaseClient
        .rpc('match_portfolio_summary', {
          query_embedding: flattenedEmbedding,
          match_threshold: 0.7,
          match_count: 5
        });

      if (error) {
        throw error;
      }

      if (portfolioData && portfolioData.length > 0) {
        const response = await getRagLLMResponseUnified(userMessage, portfolioData);
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
      const standardResponse = await getStandardLLMResponse(userMessage);
      if (standardResponse) {
        setMessages(prev => [...prev, { 
          id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant', 
          content: standardResponse,
          mode: 'standard'
        }]);
      }
    } catch (error) {
      console.error('[UnifiedChatbox] Error in handleSend:', error);
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

  // --- Message Formatting (from GeneralChatbox.js) ---
  const FormattedLLMResponse = ({ text }) => {
    if (!text) return null;
    const lines = text.split('\n');
    const renderTextWithPL = (lineText) => {
      const pnlRegex = /(-\$?\s*[\d,]+\.\d{2}\s*,\s*-?\s*\d+\.?\d*\s*%|\$?\s*[\d,]+\.\d{2}\s*,\s*\+?\s*\d+\.?\d*\s*%)/g;
      const pnlParts = lineText.split(pnlRegex);
      return pnlParts.map((pnlPart, pnlIndex) => {
        if (pnlPart && pnlPart.match(pnlRegex)) {
          const isNegative = pnlPart.startsWith('-') || pnlPart.includes(' -');
          return <Text key={`pnl-${pnlIndex}`} style={isNegative ? portfolioQueryStyles.negativeChange : portfolioQueryStyles.positiveChange}>{pnlPart}</Text>;
        } else if (pnlPart) {
          const tickerSplitRegex = /(\b[A-Z]{2,5}\b|\([A-Z]{1,5}\))/g;
          const textParts = pnlPart.split(tickerSplitRegex);
          return textParts.map((textPart, textIndex) => {
            if (textPart && textPart.match(tickerSplitRegex)) {
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
            return <Text key={`text-${pnlIndex}-${textIndex}`}>{textPart}</Text>;
          }).filter(Boolean);
        }
        return null;
      }).filter(Boolean);
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

  // --- Render ---
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
            {messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.messageBubble,
                  msg.role === 'user' ? styles.userMessage : (msg.mode && msg.mode.startsWith('rag') ? styles.ragBotMessage : styles.botMessage),
                ]}
              >
                {msg.role === 'assistant' && msg.content ? (
                  <FormattedLLMResponse text={msg.content} />
                ) : (
                  <Text style={msg.role === 'user' ? styles.userMessageText : styles.botMessageText}>
                    {msg.content}
                  </Text>
                )}
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
            placeholder="Ask about your portfolio..."
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
  ragBotMessage: {
    backgroundColor: '#E6E6FA', // Lavender for RAG bot
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

const portfolioQueryStyles = StyleSheet.create({
  portfolioMessageBubble: {
    backgroundColor: '#E8F0F9',
    borderColor: '#C9DDF0',
    borderWidth: 1,
    padding: 16,
  },
  llmTextResponseContainer: {
    paddingVertical: 8,
  },
  llmParagraph: {
    fontSize: 16,
    lineHeight: 24,
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
    fontSize: 16,
    lineHeight: 24,
    color: '#00529B',
    marginRight: 8,
    fontWeight: 'bold',
  },
  bulletText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: '#222',
  },
  resultsEmptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 12,
  },
  positiveChange: {
    color: '#2E7D32',
    fontWeight: '500',
  },
  negativeChange: {
    color: '#C62828',
    fontWeight: '500',
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
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 16,
    color: '#546E7A',
    marginBottom: 4,
  },
  singleResultValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#263238',
  },
  valueAmount: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export { styles, portfolioQueryStyles, UnifiedChatbox as default }; 
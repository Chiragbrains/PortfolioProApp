// SchemaRAGChatbox.js
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
  Animated,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSupabaseConfig } from './SupabaseConfigContext';
import { 
  findSimilarSchemaContexts, 
  generateSchemaEmbedding, 
  initializeSchemaEmbeddings 
} from './services/embeddingService';

// --- Langchain Imports ---
import { ChatGroq } from "@langchain/groq";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser, JsonOutputParser } from "@langchain/core/output_parsers";
import { 
  RunnableSequence, 
  RunnablePassthrough, 
  RunnableLambda 
} from "@langchain/core/runnables";

// Import the JSX UI component
import { SchemaRAGChatbox as SchemaRAGChatboxUI } from './SchemaRAGChatbox.jsx';
import { getDynamicAlphaVantageResponse, runAlphaVantagePipeline } from './services/alphaVantageLLMService.js'; // Corrected path

import { GROQ_API_KEY } from '@env';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const PANEL_TOTAL_HEIGHT = SCREEN_HEIGHT * 1;
const MINIMIZED_PANEL_HEIGHT = SCREEN_HEIGHT * 0.57; // Reduced height to ensure input field is visible

const SchemaRAGChatbox = ({ onClose, onMinimizeChange, navBarHeight }) => { // Added navBarHeight prop
  // State management
  const [messages, setMessages] = useState([
    { 
      id: `welcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant', 
      content: 'Hello! I can help analyze your portfolio using enhanced schema understanding. Ask me about your holdings, performance, or any portfolio-related questions.',
      mode: 'rag'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { supabaseClient } = useSupabaseConfig();
  
  // Animation state
  const [isMinimized, setIsMinimized] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;
  const dragStartTranslateY = useRef(0);

  // Calculate the effective keyboard offset based on whether the chatbox is minimized
  // When minimized, the main app's nav bar is visible, so we need to offset by its height.
  // When expanded, the main app's nav bar is hidden, so the offset is 0.
  const effectiveKeyboardOffset = isMinimized ? navBarHeight : 0;

  // Gesture handler for dragging
  const dragGesture = Gesture.Pan()    
    .onStart(() => {
      dragStartTranslateY.current = translateY._value;
    })
    .onUpdate((event) => {
      let newY = dragStartTranslateY.current + event.translationY;
      newY = Math.max(0, newY);
      newY = Math.min(newY, PANEL_TOTAL_HEIGHT - MINIMIZED_PANEL_HEIGHT);
      translateY.setValue(newY);
    })
    .onEnd((event) => {
      const targetExpandedY = 0;
      const targetMinimizedY = PANEL_TOTAL_HEIGHT - MINIMIZED_PANEL_HEIGHT;
      let newIsMinimizedState = isMinimized;
      
      if (!isMinimized) {
        if (event.translationY > (PANEL_TOTAL_HEIGHT - MINIMIZED_PANEL_HEIGHT) / 2 || event.velocityY > 500) {
          Animated.spring(translateY, {
            toValue: targetMinimizedY,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
          newIsMinimizedState = true;
        } else {
          Animated.spring(translateY, {
            toValue: targetExpandedY,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
          // newIsMinimizedState remains false
        }
      } else {
        if (event.translationY < -(PANEL_TOTAL_HEIGHT - MINIMIZED_PANEL_HEIGHT) / 3 || event.velocityY < -500) {
          Animated.spring(translateY, {
            toValue: targetExpandedY,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
          newIsMinimizedState = false;
        } else {
          Animated.spring(translateY, {
            toValue: targetMinimizedY,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start();
          // newIsMinimizedState remains true
        }
      }

      if (isMinimized !== newIsMinimizedState) {
        setIsMinimized(newIsMinimizedState);
        onMinimizeChange?.(newIsMinimizedState); // Call the callback if it exists
      }

    });

  // Initialize schema embeddings if needed
  useEffect(() => {
    const initializeIfNeeded = async () => {
      try {
        const { data, error } = await supabaseClient
          .from('portfolio_context_embeddings')
          .select('id')
          .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
          console.log('No schema contexts found. Initializing...');
          setIsLoading(true);
          await initializeSchemaEmbeddings(supabaseClient);
          setIsLoading(false);
          console.log('Schema contexts initialized successfully');
        }
      } catch (error) {
        console.error('Error checking/initializing schema contexts:', error);
      }
    };

    if (supabaseClient) {
      initializeIfNeeded();
    }
  }, [supabaseClient]);

  // LLM instances
  const llmEntityExtraction = new ChatGroq({
    apiKey: GROQ_API_KEY,
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    temperature: 0.1,
  });

  const llmSqlGeneration = new ChatGroq({
    apiKey: GROQ_API_KEY,
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    temperature: 0.1,
  });

  // Extract and resolve ticker from user query
  const determineQuerySourceAndEntities = async (userQuery) => {
    console.log('[SchemaRAGChatbox] determineQuerySourceAndEntities: START for query -', userQuery);
    
    const systemPrompt = `You are an AI assistant specialized in financial queries. Your primary task is to determine the data source required to answer the user's question and extract relevant entities.
Data Sources:
1. "portfolio_db": Use this if the query is about the user's own portfolio holdings, performance, transaction history, stock by accounts, account values, or anything that would typically be stored in their personal investment database.
2. "alpha_vantage": Use this if the query is about general market data, real-time stock prices, company overviews, news, currency exchange rates, or cryptocurrency data that is NOT specific to the user's personal holdings but rather general market information.
   If the query does not clearly fit "portfolio_db", assume it is for "alpha_vantage".

Entity Extraction:
- If a company name is found (e.g., "Apple", "Microsoft Corp"), try to map it to its common stock ticker (e.g., "AAPL", "MSFT").
- If a ticker symbol is directly mentioned, use that.
- For Alpha Vantage, also identify if the query implies a specific type of data (e.g., "price", "overview", "news", "exchange_rate", "crypto_daily").
Respond ONLY with a JSON object in the following format:
{
  "dataSource": "portfolio_db" | "alpha_vantage",
  "entityInfo": { // Present if a specific company/ticker is relevant
    "type": "ticker_identified" | "company_name_unresolved" | "general_query_entity", // 'general_query_entity' if dataSource is portfolio_db but no specific ticker
    "ticker": "TICKER_SYMBOL_OR_NULL", // e.g., "AAPL"
    "original_mention": "USER_MENTION_OR_NULL", // e.g., "Apple"
    "name": "COMPANY_NAME_OR_NULL" // e.g., "XYZ Corp" if unresolved
  },
  "alphaVantageQueryType": "quote" | "overview" | "news" | "time_series_daily" | "currency_exchange" | "crypto_daily" | "search" | "general_market_info" | null // if dataSource is 'alpha_vantage'
}

IMPORTANT: Return ONLY the JSON object, no additional text, markdown, or explanations.`;

    try {
        const llmResponse = await llmEntityExtraction.invoke([
            { type: "system", content: systemPrompt },
            { type: "human", content: userQuery },
        ]);
        
        let rawContent = llmResponse.content.trim();
        console.log('[SchemaRAGChatbox] Raw LLM response:', rawContent);

        // Remove any markdown code block fences if present
        const markdownMatch = rawContent.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
        if (markdownMatch && markdownMatch[1]) {
            rawContent = markdownMatch[1].trim();
        }

        // Remove any text after the last closing brace
        const lastBraceIndex = rawContent.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
            rawContent = rawContent.substring(0, lastBraceIndex + 1);
        }

        console.log('[SchemaRAGChatbox] Cleaned content for parsing:', rawContent);

        try {
            const parsedContent = JSON.parse(rawContent);
            
            // Validate the parsed content has required fields
            if (!parsedContent.dataSource) {
                throw new Error('Missing required field: dataSource');
            }

            // Ensure entityInfo is present and has required fields if it exists
            if (parsedContent.entityInfo) {
                if (!parsedContent.entityInfo.type) {
                    throw new Error('Missing required field: entityInfo.type');
                }
            }

            console.log('[SchemaRAGChatbox] Successfully parsed and validated response:', parsedContent);
            return parsedContent;
        } catch (parseError) {
            console.error('[SchemaRAGChatbox] JSON parse error:', parseError);
            console.error('[SchemaRAGChatbox] Content that failed to parse:', rawContent);
            throw new Error(`Failed to parse LLM response as JSON: ${parseError.message}`);
        }
    } catch (error) {
        console.error('[SchemaRAGChatbox] Error in determineQuerySourceAndEntities:', error);
        // Return a safe default that will route to Alpha Vantage
        return { 
            dataSource: "alpha_vantage", 
            entityInfo: { type: "general_query_entity" }, 
            alphaVantageQueryType: "general_market_info",
            error: error.message,
            reasoning: "Error during source determination, defaulting to Alpha Vantage."
        };
    }
  };

  // Generate SQL from context and entity info
  const generateSQLFromContext = async (userQuery, schemaContexts, queryDetails) => {
    try {
      const contextText = schemaContexts
        .map(ctx => `${ctx.source_type.toUpperCase()}: ${ctx.content}`)
        .join('\n\n');

      let entityInstruction = "";
      if (queryDetails?.entityInfo?.type === 'ticker_identified' && queryDetails.entityInfo.ticker) {
        entityInstruction = `IMPORTANT_TICKER_DIRECTIVE: The specific stock ticker symbol to use for this query is '${queryDetails.entityInfo.ticker}'. You MUST use this exact string in any SQL condition involving the ticker. Do NOT use "${queryDetails.entityInfo.original_mention}" or any ticker derived from the user's question text. Use ONLY '${queryDetails.entityInfo.ticker}'.`;
      } else if (queryDetails?.entityInfo?.type === 'company_name_unresolved' && queryDetails.entityInfo.name && queryDetails.entityInfo.original_mention) {
        entityInstruction = `USER_MENTIONED_COMPANY_NAME: The user's query mentions the company name: "${queryDetails.entityInfo.name}" (originally mentioned as: "${queryDetails.entityInfo.original_mention}"). For this query, you should prioritize matching against a 'company_name' column if available in the schema, using an ILIKE comparison. For example, if the user mentioned "Example Corp", your SQL might include \`WHERE company_name ILIKE '%Example Corp%'\`. If a ticker can also be inferred and is available, you might use that as well.`;
      }

      const systemPromptContent = `You are a PostgreSQL expert. Generate precise SQL SELECT queries based on schema and natural language questions. Always use ILIKE for case-insensitive text matching in WHERE clauses. Return only the SQL query without any explanations.`;
      
      const userPromptContent = `Given the following database schema information:
${contextText}

You are an expert SQL generator. Your task is to translate natural language questions into SQL SELECT queries.
Generate a PostgreSQL SELECT query to answer this question: "${userQuery}"
${entityInstruction}

Requirements:
1. Use ONLY the tables and columns defined in the schema information provided above.
2. If an 'IMPORTANT_TICKER_DIRECTIVE' is provided, you MUST use the exact ticker symbol from that directive in your WHERE clause for ticker symbols (e.g., \`WHERE ticker ILIKE 'DIRECTIVE_TICKER'\`). Do NOT use any other ticker or name from the user's question or the directive's "original_mention" part. Do NOT add wildcards like '%' to this specific ticker.
3. If a 'USER_MENTIONED_COMPANY_NAME' directive is provided, you should attempt to include a condition to match against the 'company_name' column (if available and relevant in the schema) using ILIKE with wildcards (e.g., \`WHERE company_name ILIKE '%MENTIONED_COMPANY_NAME%'\`). You may also include a ticker match if a ticker can be reasonably inferred and is present in the schema.
4. If neither 'IMPORTANT_TICKER_DIRECTIVE' nor 'USER_MENTIONED_COMPANY_NAME' is given, and the user's question seems to refer to a stock by name or ticker, use ILIKE for case-insensitive matching on the 'ticker' column (e.g., \`WHERE ticker ILIKE '%SYMBOL_FROM_USER_QUESTION%'\`) or 'company_name' column if appropriate and available in the schema.
5. Start the query with SELECT or WITH
6. Do NOT include any explanations or comments
7. Do NOT include semicolons at the end
8. For account value and position queries:
   - Always JOIN investment_accounts (ia) with portfolio_summary (ps)
   - Join condition: ON ps.ticker = ia.ticker
   - Get quantities from investment_accounts
   - Get prices from portfolio_summary
   - Calculate position value as: ps.current_price * ia.quantity
9. For account filtering:
   - Filter using ia.account ILIKE pattern
   - Include account name in SELECT for grouping
10. GROUP BY Clause: When using aggregate functions (e.g., SUM, AVG, COUNT, MAX, MIN), any column in the SELECT list that is NOT itself an aggregate function or enclosed within one MUST be included in the GROUP BY clause. For example, if you SELECT "col_a", "SUM(col_b)", then "col_a" must be in 'GROUP BY'. Columns used *only* inside an aggregate function (e.g., 'col_b' in 'SUM(col_b)') should generally not be in the GROUP BY clause unless you intend to group by each distinct value of that column.
11. For profit/loss calculations:
   - Use portfolio_history table for date-based analysis
   - Calculate period P&L as: end_date.total_pnl - start_date.total_pnl
   - Do NOT use total_value for P&L (it includes cash and cost basis changes)
   - Use exact dates from portfolio_history, not calculated summaries

Example formats:
- Account total value: 
  SELECT 
    ia.account,
    SUM(ps.current_price * ia.quantity) as total_value
  FROM investment_accounts ia
  JOIN portfolio_summary ps ON ps.ticker = ia.ticker
  WHERE ia.account ILIKE '%Account_Name%'
  GROUP BY ia.account

- Account positions: 
  SELECT 
    ia.account,
    ia.ticker,
    ia.quantity,
    ps.current_price,
    (ps.current_price * ia.quantity) as position_value
  FROM investment_accounts ia
  JOIN portfolio_summary ps ON ps.ticker = ia.ticker
  WHERE ia.account ILIKE '%Account_Name%'

- Stock holdings: 
  SELECT ia.account, ia.quantity, ps.current_price
  FROM investment_accounts ia
  JOIN portfolio_summary ps ON ps.ticker = ia.ticker
  WHERE ia.ticker ILIKE 'AAPL'

- Date Range P&L:
  WITH month_bounds AS (
    SELECT 
      -- Get first and last dates that match the month pattern
      (
        SELECT date
        FROM portfolio_history
        WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM '[start_date]'::date)
        ORDER BY date ASC
        LIMIT 1
      ) as start_date,
      (
        SELECT date
        FROM portfolio_history
        WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM '[end_date]'::date)
        ORDER BY date DESC
        LIMIT 1
      ) as end_date
  ) SELECT 
    ph_start.date as start_date,
    ph_end.date as end_date,
    ph_end.total_pnl - ph_start.total_pnl as period_pnl,
    CASE 
      WHEN ph_start.total_pnl != 0 
      THEN ((ph_end.total_pnl - ph_start.total_pnl) / ABS(ph_start.total_pnl)) * 100
      ELSE NULL 
    END as pnl_percent
  FROM month_bounds mb
  JOIN portfolio_history ph_start ON ph_start.date = mb.start_date
  JOIN portfolio_history ph_end ON ph_end.date = mb.end_date

Your SQL query:`;


      const llmResponse = await llmSqlGeneration.invoke([
        { type: "system", content: systemPromptContent },
        { type: "human", content: userPromptContent }
      ]);
      
      let sql = llmResponse.content.trim();
      console.log('Raw SQL from LLM (before cleaning):', sql);

      // Clean markdown formatting if present
      const markdownMatch = sql.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/);
      if (markdownMatch && markdownMatch[1]) {
        sql = markdownMatch[1].trim();
      }
      
      console.log('Extracted SQL before validation:', sql);

      // Basic validation
      const lowerSql = sql.toLowerCase();
      if (!lowerSql.startsWith('select') && !lowerSql.startsWith('with')) {
        throw new Error(`Generated SQL must start with SELECT or WITH. Got: ${sql}`);
      }
      
      return sql;
    } catch (error) {
      console.error('Error generating SQL:', error);
      throw error;
    }
  };

  // Format query results into natural language
  const formatQueryResults = async (userQuery, sqlQuery, results) => {
    try {
      console.log('Formatting results:', { userQuery, results });
      
      const limitedResults = Array.isArray(results) ? results.slice(0, 10) : results;
      
      const systemContent = "You are a financial analyst assistant. Provide clear, natural language explanations of portfolio data. Be concise and thorough.";
      
      const userContent = `Given the user question "${userQuery}" and these database results (showing up to 10 entries):
${JSON.stringify(limitedResults, null, 2)}
${results.length > 10 ? `\n(Showing 10 out of ${results.length} total results)\n` : ''}
Provide a natural language response that:
1. Directly answers the user's question
2. Lists ALL items in the results (if multiple items exist)
3. Groups items by owner/type where relevant
4. Uses clear, conversational language
5. Formats lists in a readable way using commas and "and"
6. Formats numbers appropriately (currency with $ and commas, percentages with % sign)
Return ONLY the response text, no explanations or metadata.
The SQL query used was: ${sqlQuery}

Example account list format: "You have AMD in multiple accounts: Robinhood, Schwab, and Vanguard accounts."
Example single result: "You have AMD in your Robinhood account."
For multiple owners: "AMD is held in Chirag's Robinhood and Schwab accounts, and in Reena's Vanguard account."`;

      const llmResponse = await llmSqlGeneration.invoke([
        { type: "system", content: systemContent },
        { type: "human", content: userContent }
      ]);

      return llmResponse.content.trim();

    } catch (error) {
      console.error('Error formatting results:', error);
      throw error;
    }
  };

  // Execute Supabase query
  const executeSupabaseQuery = async (sqlQuery) => {
    const { data, error } = await supabaseClient.rpc('execute_portfolio_query', { 
      query_text: sqlQuery 
    });
    if (error) throw error;
    return data;
  };

  // Handle message sending with RAG pipeline
  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const query = inputText.trim();
    setInputText('');
    setIsLoading(true);

    // Add user message immediately
    const userMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: query,
      mode: 'rag'
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      // Step 1: Determine query source and extract entities
      const queryDetails = await determineQuerySourceAndEntities(query);

      let formattedResponse;

      if (queryDetails.dataSource === "portfolio_db") {
        console.log('[SchemaRAGChatbox] Query identified for Portfolio DB. Running RAG chain...');
        // Create the RAG processing chain for portfolio data
        const portfolioRagChain = RunnableSequence.from([
          // Pass initial query and pre-determined queryDetails
          RunnablePassthrough.assign({
            queryDetails: () => queryDetails, // Add queryDetails to the chain's input object
            similarContexts: new RunnableLambda({ 
              func: async (input) => findSimilarSchemaContexts(supabaseClient, input.query) 
            }).withConfig({ runName: "SchemaContextRetrieval" }),
          }),
          
          // Validate contexts exist
          new RunnableLambda({
            func: async (input) => {
              if (!input.similarContexts || input.similarContexts.length === 0) {
                throw new Error('No relevant schema context found for your portfolio query.');
              }
              return input;
            }
          }).withConfig({ runName: "ContextValidation" }),
          
          // Generate SQL
          RunnablePassthrough.assign({
            generatedSql: new RunnableLambda({ 
              // Pass queryDetails (which includes entityInfo) to generateSQLFromContext
              func: async (input) => generateSQLFromContext(input.query, input.similarContexts, input.queryDetails) 
            }).withConfig({ runName: "SQLGeneration" }),
          }),
          
          // Format SQL for RPC execution
          new RunnableLambda({
            func: (input) => {
              let baseSql = input.generatedSql.replace(/;$/, '');
              const finalSqlForRpc = `SELECT row_to_json(t.*) FROM (${baseSql}) t`;
              console.log('Final SQL for RPC:', finalSqlForRpc);
              return { ...input, baseSql, finalSqlForRpc };
            }
          }).withConfig({ runName: "SQLFormattingForRPC" }),
          
          // Execute query
          RunnablePassthrough.assign({
            queryResults: new RunnableLambda({ 
              func: async (input) => executeSupabaseQuery(input.finalSqlForRpc) 
            }).withConfig({ runName: "SQLExecution" }),
          }),
          
          // Format results into natural language
          new RunnableLambda({ 
            func: async (input) => formatQueryResults(input.query, input.baseSql, input.queryResults) 
          }).withConfig({ runName: "NaturalLanguageFormatting" }),
        ]);
        formattedResponse = await portfolioRagChain.invoke({ query });

      } else if (queryDetails.dataSource === "alpha_vantage") {
        console.log('[SchemaRAGChatbox] Query identified for Alpha Vantage. Calling Alpha Vantage service...');
        // Use the original user query for Alpha Vantage service
        formattedResponse = await runAlphaVantagePipeline(query, supabaseClient); // Pass the client;
      } else {
        // This 'else' case should ideally not be reached if the LLM always returns one of the two.
        console.warn(`[SchemaRAGChatbox] Unexpected dataSource: ${queryDetails.dataSource}. Defaulting to Alpha Vantage.`);
        formattedResponse = await runAlphaVantagePipeline(query, supabaseClient); // Pass the client
      }

      const assistantMessage = {
        id: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: formattedResponse,
        mode: 'rag'
      };
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      console.error('Error in message handling:', error);
      let errorMessage = 'Sorry, there was an error processing your request. Please try again.';
      if (error.message.includes('No relevant schema context found')) {
        errorMessage = "I couldn't find relevant information in your portfolio for that query. Try asking about general market data if that's what you intended.";
      } else if (error.message.includes('Failed to select Alpha Vantage function')) {
        errorMessage = "I had trouble understanding how to fetch that market data. Could you try rephrasing?";
      }
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: errorMessage,
        mode: 'rag'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Render the draggable panel with UI component
  return (
    <View style={componentStyles.container}>
      <GestureDetector gesture={dragGesture}>
        <Animated.View
          style={[
            componentStyles.draggablePanel,
            {
              transform: [{ translateY }],
              height: isMinimized ? MINIMIZED_PANEL_HEIGHT : PANEL_TOTAL_HEIGHT,
            },
          ]}
        >
          <SchemaRAGChatboxUI
            messages={messages}
            inputTextValue={inputText}
            onInputTextChange={setInputText}
            onSendMessagePress={handleSend}
            isLoading={isLoading}
            onClose={onClose} // onClose is already passed
            keyboardOffset={effectiveKeyboardOffset} // Pass the calculated offset
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

// Styles for the draggable panel
const componentStyles = StyleSheet.create({
  container: {
    height: PANEL_TOTAL_HEIGHT, 
    width: '100%',
    backgroundColor: 'transparent', 
    pointerEvents: "box-none",
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  draggablePanel: {
    width: '100%',
    height: PANEL_TOTAL_HEIGHT, 
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
    position: 'absolute',
    bottom: 0,
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
  },
});

export default SchemaRAGChatbox;

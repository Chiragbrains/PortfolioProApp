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
import { findSimilarSchemaContexts, generateSchemaEmbedding, initializeSchemaEmbeddings } from './services/embeddingService';
// --- Langchain Imports ---
import { ChatGroq } from "@langchain/groq";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser, JsonOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnablePassthrough, RunnableLambda } from "@langchain/core/runnables";
// --- End Langchain Imports ---
// Removed import of styles from GeneralChatbox, will define locally
import { GROQ_API_KEY } from '@env';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_TOTAL_HEIGHT = SCREEN_HEIGHT * 0.9; // Full height of the draggable panel when expanded
const MINIMIZED_PANEL_HEIGHT = 80; // Height of the panel when minimized at the bottom

const SchemaRAGChatbox = ({ onClose }) => {
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
  const scrollViewRef = useRef();
  const { supabaseClient } = useSupabaseConfig();
  
  // Animation state
  const [isMinimized, setIsMinimized] = useState(false); // Starts expanded (not minimized)
  const translateY = useRef(new Animated.Value(0)).current; // 0 for expanded (top of its container)
  const dragStartTranslateY = useRef(0);

const dragGesture = Gesture.Pan()
  .onStart(() => {
    dragStartTranslateY.current = translateY._value;
  })
  .onUpdate((event) => {
    let newY = dragStartTranslateY.current + event.translationY;
    // Clamp newY: 0 (fully expanded) to PANEL_TOTAL_HEIGHT - MINIMIZED_PANEL_HEIGHT (fully minimized)
    newY = Math.max(0, newY); // Cannot drag above its top
    newY = Math.min(newY, PANEL_TOTAL_HEIGHT - MINIMIZED_PANEL_HEIGHT); // Max downward drag
    translateY.setValue(newY);
  })
  .onEnd((event) => {
    const targetExpandedY = 0;
    const targetMinimizedY = PANEL_TOTAL_HEIGHT - MINIMIZED_PANEL_HEIGHT;
    
    if (!isMinimized) { // If currently expanded (at the top of its container)
      // Check if dragged down enough to minimize
      if (event.translationY > (PANEL_TOTAL_HEIGHT - MINIMIZED_PANEL_HEIGHT) / 2 || event.velocityY > 500) {
        Animated.spring(translateY, {
          toValue: targetMinimizedY,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }).start();
        setIsMinimized(true);
      } else { // Snap back to expanded (top)
        Animated.spring(translateY, {
          toValue: targetExpandedY,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }).start();
      }
    } else { // If currently minimized (at the bottom)
      // Check if dragged up enough to expand
      if (event.translationY < -(PANEL_TOTAL_HEIGHT - MINIMIZED_PANEL_HEIGHT) / 3 || event.velocityY < -500) {
        Animated.spring(translateY, {
          toValue: targetExpandedY,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }).start();
        setIsMinimized(false);
      } else { // Snap back to minimized (bottom)
        Animated.spring(translateY, {
          toValue: targetMinimizedY,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }).start();
      }
    }
  }); // Fixed: Added semicolon and proper closing

useEffect(() => {
  scrollViewRef.current?.scrollToEnd({ animated: true });
}, [messages]);

  // Add initialization check
  useEffect(() => {
    const initializeIfNeeded = async () => {
      try {
        // Check if we have any schema contexts
        const { data, error } = await supabaseClient
          .from('portfolio_context_embeddings')
          .select('id')
          .limit(1);

        if (error) throw error;

        // If no data exists, initialize schema contexts
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

  // --- Langchain LLM Instances ---
  const llmEntityExtraction = new ChatGroq({
    apiKey: GROQ_API_KEY,
    model: "meta-llama/llama-4-scout-17b-16e-instruct",  // Updated to use correct model property
    temperature: 0.1,
  });

  const llmSqlGeneration = new ChatGroq({
    apiKey: GROQ_API_KEY,
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    temperature: 0.1,
  });
  // --- End Langchain LLM Instances ---
  const extractAndResolveTickerFromQuery = async (userQuery) => {
    console.log('[SchemaRAGChatbox] extractAndResolveTickerFromQuery: START for query -', userQuery);
    const systemPrompt = `You are an AI assistant specialized in financial queries.
Your task is to analyze the user's question and identify if it refers to a specific company by its name or ticker symbol.
If a company name is found (e.g., "Apple", "Microsoft Corp"), try to map it to its common stock ticker (e.g., "AAPL", "MSFT").
If a ticker symbol is directly mentioned, use that.

Respond ONLY with a JSON object in the following format:
- If a ticker is identified or resolved from a company name:
  {"type": "ticker_identified", "ticker": "TICKER_SYMBOL", "original_mention": "User's Mention"}
- If a company name is mentioned but cannot be confidently mapped to a ticker:
  {"type": "company_name_unresolved", "name": "COMPANY_NAME", "original_mention": "User's Mention"}
- If the query is general and does not seem to refer to a specific company/ticker:
  {"type": "general_query"}

Examples:
User: "What's the price of Apple?" -> {"type": "ticker_identified", "ticker": "AAPL", "original_mention": "Apple"}
User: "Tell me about MSFT" -> {"type": "ticker_identified", "ticker": "MSFT", "original_mention": "MSFT"}
User: "Information on Tesla Inc." -> {"type": "ticker_identified", "ticker": "TSLA", "original_mention": "Tesla Inc."}
User: "Market value of International Business Machines" -> {"type": "ticker_identified", "ticker": "IBM", "original_mention": "International Business Machines"}
User: "What are my top holdings?" -> {"type": "general_query"}
User: "Performance of XYZ Corp" (if XYZ Corp is not a known major company) -> {"type": "company_name_unresolved", "name": "XYZ Corp", "original_mention": "XYZ Corp"}`;

    const promptTemplate = PromptTemplate.fromTemplate(systemPrompt + "\n\nUser: {query}\nAI:");
    
    const chain = promptTemplate.pipe(llmEntityExtraction).pipe(new JsonOutputParser());

    try {
      // Forcing JSON output with Groq can sometimes be tricky if the model doesn't strictly adhere.
      // Llama3 is generally good with JSON if prompted correctly.
      // The `JsonOutputParser` will attempt to parse the string output.
      // We might need to add a retry or a more robust JSON extraction if the model sometimes fails to output perfect JSON.
      const llmResponse = await llmEntityExtraction.invoke([
        { type: "system", content: systemPrompt },
        { type: "human", content: userQuery },
      ]);
      // Assuming the response content is a JSON string
      const parsedContent = JSON.parse(llmResponse.content);
      console.log('[SchemaRAGChatbox] extractAndResolveTickerFromQuery: Parsed entity info -', parsedContent);
      return parsedContent;

    } catch (error) {
      console.error('[SchemaRAGChatbox] Error in extractAndResolveTickerFromQuery:', error);
      return { type: "general_query", error: error.message }; // Fallback
    }
  };
  const generateSQLFromContext = async (userQuery, schemaContexts, entityInfo) => { // Added entityInfo
    try {
      const contextText = schemaContexts
        .map(ctx => `${ctx.source_type.toUpperCase()}: ${ctx.content}`)
        .join('\n\n');

      let entityInstruction = "";
      if (entityInfo?.type === 'ticker_identified' && entityInfo.ticker) {
        entityInstruction = `IMPORTANT_TICKER_DIRECTIVE: The specific stock ticker symbol to use for this query is '${entityInfo.ticker}'. You MUST use this exact string in any SQL condition involving the ticker. Do NOT use "${entityInfo.original_mention}" or any ticker derived from the user's question text. Use ONLY '${entityInfo.ticker}'.`;
      } else if (entityInfo?.type === 'company_name_unresolved' && entityInfo.name && entityInfo.original_mention) {
        entityInstruction = `USER_MENTIONED_COMPANY_NAME: The user's query mentions the company name: "${entityInfo.name}" (originally mentioned as: "${entityInfo.original_mention}"). For this query, you should prioritize matching against a 'company_name' column if available in the schema, using an ILIKE comparison. For example, if the user mentioned "Example Corp", your SQL might include \`WHERE company_name ILIKE '%Example Corp%'\`. If a ticker can also be inferred and is available, you might use that as well.`;
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

      const markdownMatch = sql.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/);
      if (markdownMatch && markdownMatch[1]) {
        sql = markdownMatch[1].trim();
      }
      console.log('Extracted SQL before validation:', sql);

      // Basic validation that we got a SELECT query or a CTE
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

  const formatQueryResults = async (userQuery, sqlQuery, results) => {
    try {
      console.log('Formatting results:', { userQuery, results });
      
      // Limit the results to prevent content too large error
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

      const llmResponse = await llmSqlGeneration.invoke([ // Can use the same SQL model or a different one for formatting
        { type: "system", content: systemContent },
        { type: "human", content: userContent }
      ]);

      return llmResponse.content.trim();

    } catch (error) {
      console.error('Error formatting results:', error);
      throw error;
    }
  };

  // --- Langchain Runnable for Supabase SQL Execution ---
  const executeSupabaseQuery = async (sqlQuery) => {
    const { data, error } = await supabaseClient.rpc('execute_portfolio_query', { query_text: sqlQuery });
    if (error) throw error;
    return data;
  };

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
      const mainChain = RunnableSequence.from([
        // Input: { query: "user query" }
        RunnablePassthrough.assign({ // Keep original query and add entityInfo and contexts
          entityInfo: new RunnableLambda({ func: async (input) => extractAndResolveTickerFromQuery(input.query) })
            .withConfig({ runName: "EntityExtraction" }),
          similarContexts: new RunnableLambda({ func: async (input) => findSimilarSchemaContexts(supabaseClient, input.query) })
            .withConfig({ runName: "SchemaContextRetrieval" }),
        }),
        // Output: { query, entityInfo, similarContexts }
        new RunnableLambda({ // Check for contexts
          func: async (input) => {
            if (!input.similarContexts || input.similarContexts.length === 0) {
              throw new Error('No relevant schema context found for the query');
            }
            return input;
          }
        }).withConfig({ runName: "ContextValidation" }),
        RunnablePassthrough.assign({
          generatedSql: new RunnableLambda({ func: async (input) => generateSQLFromContext(input.query, input.similarContexts, input.entityInfo) })
            .withConfig({ runName: "SQLGeneration" }),
        }),
        // Output: { query, entityInfo, similarContexts, generatedSql }
        new RunnableLambda({ // Clean and wrap SQL for RPC
          func: (input) => {
            let baseSql = input.generatedSql.replace(/;$/, '');
            const finalSqlForRpc = `SELECT row_to_json(t.*) FROM (${baseSql}) t`;
            console.log('Final SQL for RPC:', finalSqlForRpc);
            return { ...input, baseSql, finalSqlForRpc };
          }
        }).withConfig({ runName: "SQLFormattingForRPC" }),
        RunnablePassthrough.assign({
          queryResults: new RunnableLambda({ func: async (input) => executeSupabaseQuery(input.finalSqlForRpc) })
            .withConfig({ runName: "SQLExecution" }),
        }),
        // Output: { query, ..., baseSql, finalSqlForRpc, queryResults }
        new RunnableLambda({ func: async (input) => formatQueryResults(input.query, input.baseSql, input.queryResults) })
          .withConfig({ runName: "NaturalLanguageFormatting" }),
        // Output: formattedResponse (string)
      ]);

      const chainInput = { query };
      const formattedResponse = await mainChain.invoke(chainInput);

      // To get intermediate results for metadata, we'd typically run parts of the chain
      // or structure the chain to pass through all data.
      // For simplicity here, we'll re-fetch entityInfo and contexts if needed for metadata,
      // or ideally, the chain would be structured to return a final object.
      // Let's assume the chain is modified to pass through necessary data for metadata.
      const assistantMessage = {
        id: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: formattedResponse,
        mode: 'rag'
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error in message handling:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again.',
        mode: 'rag'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Define styles locally for this component
  const componentStyles = StyleSheet.create({
    container: {
      flex: 1,
      // This container will be positioned by App.js
      // It should be transparent to allow the main app to be visible
      // when the chat panel is not covering the full area.
      backgroundColor: 'transparent', 
    },
    draggablePanel: {
      // This is the visible chat panel
      width: '100%',
      height: PANEL_TOTAL_HEIGHT, // The full height it can occupy
      backgroundColor: '#1c1c1e',
      // Rounded corners at the bottom, as it slides down from the top of its container
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 2, // Shadow below the panel
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
      // No longer absolutely positioned within its direct parent (componentStyles.container).
      // It will flow normally within componentStyles.container, which is flex: 1.
      // Its positioning is now primarily dictated by the View wrapping SchemaRAGChatbox in App.js.
      overflow: 'hidden', // Clip content like messages when minimized
    },
    dragHandleContainer: {
      paddingVertical: 10,
      alignItems: 'center',
    },
    dragHandle: {
      width: 40,
      height: 4,
      backgroundColor: '#666',
      borderRadius: 2,
    },
    messagesWrapper: {
      flex: 1,
      flexDirection: 'column',
    },
    messagesContainer: {
      flex: 1,
    },
    messagesContentContainer: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 8,  // Add padding at the top
      flexGrow: 1,
      justifyContent: 'flex-start', // Change to flex-start to start from top
    },
    inputContainer: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: '#2c2c2e',
      backgroundColor: '#1c1c1e',
      marginTop: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 300, // Ensure the input area has a minimum height

    },
    input: {
      flex: 1,
      backgroundColor: '#2c2c2e',
      borderRadius: 20,
      padding: 12,
      color: '#fff',
      fontSize: 16,
      maxHeight: 120,
      marginRight: 12,
    },
    sendButton: {
      backgroundColor: '#4F46E5',
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    topBar: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    topBarContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    topBarTitle: {
      color: '#fff',
      fontSize: 18,
      fontWeight: 'bold',
    },
    closeButton: {
      padding: 8,
    },
    closeButtonText: {
      color: '#fff',
      fontSize: 24,
      fontWeight: '300',
    },
    messageBubble: {
      maxWidth: '80%',
      padding: 12,
      borderRadius: 16,
      marginVertical: 4,
    },
    userMessage: {
      alignSelf: 'flex-end',
      backgroundColor: '#4F46E5',
      borderTopRightRadius: 4,
    },
    ragBotMessage: {
      alignSelf: 'flex-start',
      backgroundColor: '#2c2c2e',
      borderTopLeftRadius: 4,
    },
    userMessageText: {
      color: '#fff',
    },
    botMessageText: {
      color: '#fff',
    },
    loadingContainer: {
      padding: 20,
      alignItems: 'center',
    },
    modeIndicator: {
      marginTop: 4,
      backgroundColor: 'rgba(79, 70, 229, 0.2)',
      borderRadius: 4,
      alignSelf: 'flex-start',
    },
    modeIndicatorText: {
      color: '#4F46E5',
      fontWeight: '600',
    },
  });

  const MessageBubble = ({ message }) => ( // Using componentStyles for specificity
    <View style={[
      componentStyles.messageBubble,
      message.role === 'user' ? componentStyles.userMessage : componentStyles.ragBotMessage
    ]}>
      <Text
        style={message.role === 'user' ? componentStyles.userMessageText : componentStyles.botMessageText}
        selectable={true}
      >
        {message.content}
      </Text>
      {message.mode === 'rag' && message.role === 'assistant' && (
        <View style={[componentStyles.modeIndicator, { padding: 2 }]}>
          <Text style={[componentStyles.modeIndicatorText, { fontSize: 6 }]}>SCHEMA-RAG</Text>
        </View>
      )}
    </View>
  );

  // Modified return statement for the draggable bottom bar
  return (
    <View style={componentStyles.container}>
      <GestureDetector gesture={dragGesture}>
        <Animated.View
          style={[
            componentStyles.draggablePanel,
            {
              transform: [{ translateY }],
              // Height is fixed by PANEL_TOTAL_HEIGHT in styles
            },
          ]}
        >
          <View style={componentStyles.dragHandleContainer}>
            <View style={componentStyles.dragHandle} />
          </View>
          
          <View style={componentStyles.topBar}>
            <View style={componentStyles.topBarContent}>
              <Text style={componentStyles.topBarTitle}>Portfolio Assistant</Text>
              <TouchableOpacity style={componentStyles.closeButton} onPress={onClose}>
                <Text style={componentStyles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={componentStyles.messagesWrapper}>
            <ScrollView
              ref={scrollViewRef}
              style={componentStyles.messagesContainer}
              contentContainerStyle={componentStyles.messagesContentContainer}
            >
              {messages.map(message => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && (
                <View style={componentStyles.loadingContainer}>
                  <ActivityIndicator size="small" color="#4F46E5" />
                </View>
              )}
            </ScrollView>
          </View>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            // Adjusted keyboardVerticalOffset. This might need further tuning based on your exact App.js layout.
            // A common value for iOS if there's a bottom tab bar is that tab bar's height.
            keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0} 
            style={componentStyles.inputContainer}
          >
            <TextInput
              style={componentStyles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask about your portfolio..."
              placeholderTextColor="#666"
              multiline
              maxHeight={120}
            />
            <TouchableOpacity
              style={[componentStyles.sendButton, (!inputText.trim() || isLoading) && componentStyles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || isLoading}
            >
              <Text style={componentStyles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

export default SchemaRAGChatbox;

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
  Pressable,
  Switch
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useSupabaseConfig } from './SupabaseConfigContext';
import { findSimilarSchemaContexts, generateSchemaEmbedding, initializeSchemaEmbeddings } from './services/embeddingService';
import { styles, portfolioQueryStyles } from './GeneralChatbox';
import { GROQ_API_KEY } from '@env';

const screenHeight = Dimensions.get('window').height;

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

  // Swipe gesture configuration
  const SWIPE_CLOSE_THRESHOLD_Y = 50;
  const SWIPE_CLOSE_VELOCITY_Y = 500;
  const [startY, setStartY] = useState(null);
  
  const dragGesture = Gesture.Pan()
    .onStart((event) => {
      const localY = event.absoluteY;
      setStartY(localY);
      if (localY < 100) {
        console.log('[SchemaRAGChatbox] SwipeDown: Gesture Started in top bar, y:', localY);
        return true;
      }
      return false;
    })
    .activeOffsetY([5, Infinity])
    .shouldCancelWhenOutside(false)
    .minPointers(1)
    .maxPointers(1)
    .simultaneousWithExternalGesture(scrollViewRef)
    .onUpdate((event) => {
      if (startY && startY < 100) {
        console.log('[SchemaRAGChatbox] SwipeDown: Moving');
      }
    })
    .onEnd((event) => {
      if (startY && startY < 100 && event.translationY > SWIPE_CLOSE_THRESHOLD_Y && event.velocityY > SWIPE_CLOSE_VELOCITY_Y) {
        onClose();
      }
      setStartY(null);
    });

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

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama3-8b-8192", // Using a model good for instruction following and JSON
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userQuery }
          ],
          temperature: 0.1,
          max_tokens: 150,
          response_format: { type: "json_object" } // Request JSON output
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Ticker extraction API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      const parsedContent = JSON.parse(content);
      console.log('[SchemaRAGChatbox] extractAndResolveTickerFromQuery: Parsed entity info -', parsedContent);
      return parsedContent;
    } catch (error) {
      console.error('[SchemaRAGChatbox] Error in extractAndResolveTickerFromQuery:', error);
      return { type: "general_query", error: error.message }; // Fallback
    }
  };
  const generateSQLFromContext = async (userQuery, schemaContexts, entityInfo) => { // Added entityInfo
    try {
      // Combine relevant schema contexts
      const contextText = schemaContexts
        .map(ctx => `${ctx.source_type.toUpperCase()}: ${ctx.content}`)
        .join('\n\n');

      let entityInstruction = "";
      if (entityInfo?.type === 'ticker_identified' && entityInfo.ticker) {
          entityInstruction = `IMPORTANT_TICKER_DIRECTIVE: The specific stock ticker symbol to use for this query is '${entityInfo.ticker}'. You MUST use this exact string in any SQL condition involving the ticker. Do NOT use "${entityInfo.original_mention}" or any ticker derived from the user's question text. Use ONLY '${entityInfo.ticker}'.`;
      } else if (entityInfo?.type === 'company_name_unresolved' && entityInfo.name && entityInfo.original_mention) {
          entityInstruction = `USER_MENTIONED_COMPANY_NAME: The user's query mentions the company name: "${entityInfo.name}" (originally mentioned as: "${entityInfo.original_mention}"). For this query, you should prioritize matching against a 'company_name' column if available in the schema, using an ILIKE comparison. For example, if the user mentioned "Example Corp", your SQL might include \`WHERE company_name ILIKE '%Example Corp%'\`. If a ticker can also be inferred and is available, you might use that as well.`;
      }

      // Generate SQL using context and query
      const prompt = `Given the following database schema information:
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

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [
            { role: "system", content: "You are a PostgreSQL expert. Generate precise SQL SELECT queries based on schema and natural language questions. Always use ILIKE for case-insensitive text matching in WHERE clauses. Return only the SQL query without any explanations." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1, // Low temperature for more deterministic SQL generation
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`GROQ API error: ${response.status}`);
      }

      const result = await response.json();
      console.log('Raw GROQ response:', JSON.stringify(result, null, 2));
      
      let sql = result.choices[0].message.content.trim();
      console.log('Raw SQL from LLM (before cleaning):', sql);

      // Remove markdown code block if present
      // Matches ```sql\n...\n``` or ```\n...\n```
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

      const prompt = `Given the user question "${userQuery}" and these database results:
${JSON.stringify(results, null, 2)}

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

      const payload = {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          { role: "system", content: "You are a financial analyst assistant. Provide clear, natural language explanations of portfolio data. Be concise and thorough." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      };

      console.log('GROQ API request payload:', JSON.stringify(payload, null, 2));

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('GROQ API error response:', errorText);
        throw new Error(`GROQ API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      return result.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error formatting results:', error);
      throw error;
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const query = inputText.trim();
    setInputText('');
    setIsLoading(true);

    // Add user message
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: query,
      mode: 'rag'
    }]);

    try {
      console.log('Processing user query:', query);

      // 1. Extract entities (ticker/company name) from the query
      console.log('Extracting entities from query...');
      const entityInfo = await extractAndResolveTickerFromQuery(query);
      console.log('Extracted entity info:', entityInfo);

      // 2. Find relevant schema contexts based on the original query
      console.log('Finding similar schema contexts...');
      const similarContexts = await findSimilarSchemaContexts(supabaseClient, query);
      console.log('Found schema contexts:', JSON.stringify(similarContexts, null, 2));

      if (!similarContexts || similarContexts.length === 0) {
        throw new Error('No relevant schema context found for the query');
      }

      // 3. Generate SQL from context, passing the original query and resolved entityInfo
      console.log('Generating SQL from context...');
      // Pass the original userQuery for context, and entityInfo for specific targeting
      // The generateSQLFromContext prompt should be updated to use entityInfo if available.
      const sql = await generateSQLFromContext(query, similarContexts, entityInfo);
      console.log('Generated SQL:', sql);
      
      // Remove any trailing semicolons from the LLM-generated SQL
      let baseSql = sql.replace(/;$/, '');
      console.log('Base SQL (from LLM, semicolon removed):', baseSql);

      // Wrap the query to ensure each row is returned as a JSON object.
      // This is necessary because the RPC function 'execute_portfolio_query'
      // is defined to RETURN SETOF json, and the error "structure of query does not match function result type" (42804)
      // with details like "Returned type date does not match expected type json in column 1"
      // indicates that the raw multi-column output of baseSql is not compatible.
      const finalSqlForRpc = `SELECT row_to_json(t.*) FROM (${baseSql}) t`;
      console.log('Final SQL for RPC (wrapped for JSON output):', finalSqlForRpc);
      
      // 4. Execute SQL query using RPC
      console.log('Executing SQL query via RPC...');
      const { data: results, error: queryError } = await supabaseClient.rpc(
        'execute_portfolio_query',
        { query_text: finalSqlForRpc }
      );
      console.log('Query results:', JSON.stringify(results, null, 2));

      if (queryError) {
        console.error('Query error:', queryError);
        throw queryError;
      }

      // 5. Format results in natural language
      console.log('Formatting query results...');
      const formattedResponse = await formatQueryResults(query, baseSql, results);
      console.log('Formatted response:', formattedResponse);

      // Add assistant response
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: formattedResponse,
        mode: 'rag',
        metadata: {
          entityInfo: entityInfo, // Store resolved entity
          contexts: similarContexts, // Store original contexts
          sql: baseSql, // Store the SQL as generated by LLM for potential display/debugging
          results // Store the actual results from the DB
        }
      }]);
      console.log('Response added to messages');

    } catch (error) {
      console.error('Error processing query:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try rephrasing your question.',
        mode: 'rag',
        error: error.message
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Message rendering components
  const MessageBubble = ({ message }) => (
    <View style={[
      styles.messageBubble,
      message.role === 'user' ? styles.userMessage : styles.ragBotMessage
    ]}>
      <Text
        style={message.role === 'user' ? styles.userMessageText : styles.botMessageText}
        selectable={true} // Allows text selection
      >
        {message.content}
      </Text>
      {message.mode === 'rag' && message.role === 'assistant' && (
        <View style={styles.modeIndicator}>
          <Text style={styles.modeIndicatorText}>SCHEMA-RAG</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.overlay}>
      <GestureDetector gesture={dragGesture}>
        <View style={styles.chatboxContainer}>
          <LinearGradient
            colors={['#4F46E5', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.topBar}
          >
            <View style={styles.swipeHandleContainer}>
              <View style={styles.swipeHandle} />
            </View>
            <View style={styles.topBarContent}>
              <Text style={styles.topBarTitle}>Portfolio Assistant (Schema-RAG)</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <View style={styles.messagesWrapper}>
            <ScrollView
              ref={scrollViewRef}
              style={styles.messagesContainer}
              contentContainerStyle={styles.messagesContentContainer}
            >
              {messages.map(message => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#4F46E5" />
                </View>
              )}
            </ScrollView>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            style={styles.inputContainer}
          >
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask about your portfolio..."
              placeholderTextColor="#666"
              multiline
              maxHeight={120}
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
      </GestureDetector>
    </View>
  );
};

export default SchemaRAGChatbox;

// SchemaRAGChatbox.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSupabaseConfig } from './SupabaseConfigContext';

// --- Langchain Imports ---
import { ChatGroq } from "@langchain/groq";
import { PromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnablePassthrough, RunnableLambda } from "@langchain/core/runnables";

// --- Service & UI Imports ---
import { findSimilarSchemaContexts, initializeSchemaEmbeddings } from './services/embeddingService';
import { SchemaRAGChatboxUI } from './SchemaRAGChatbox.jsx';
import YFinanceHandler from './yfinance_handler.js';
import { GROQ_API_KEY } from '@env';

// --- Constants ---
const SCREEN_HEIGHT = Dimensions.get('window').height;
const PANEL_TOTAL_HEIGHT = SCREEN_HEIGHT * 1;
const MINIMIZED_PANEL_HEIGHT = SCREEN_HEIGHT * 0.57;

const SchemaRAGChatbox = ({ onClose, onMinimizeChange, navBarHeight }) => {
  // --- State and Refs ---
  const [messages, setMessages] = useState([
    { 
      id: `welcome-${Date.now()}`,
      role: 'assistant', 
      content: 'Hello! Ask me about your portfolio or general market data.',
      renderInstructions: [],
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { supabaseClient } = useSupabaseConfig();
  
  const translateY = useRef(new Animated.Value(0)).current;
  const dragStartTranslateY = useRef(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const yfinanceHandler = useRef(new YFinanceHandler()).current;

  // --- LLM Instances ---
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

  // --- Effects ---
  useEffect(() => {
    const initializeIfNeeded = async () => {
      if (!supabaseClient) return;
      try {
        const { data, error } = await supabaseClient.from('portfolio_context_embeddings').select('id').limit(1);
        if (error) throw error;

        if (!data || data.length === 0) {
          console.log('No schema contexts found. Initializing...');
          setIsLoading(true);
          setMessages(prev => [...prev, { id: `init-${Date.now()}`, role: 'assistant', content: 'Setting up portfolio connection for the first time...', renderInstructions: [] }]);
          await initializeSchemaEmbeddings(supabaseClient);
          setIsLoading(false);
          console.log('Schema contexts initialized successfully');
          setMessages(prev => [...prev, { id: `init-done-${Date.now()}`, role: 'assistant', content: 'Connection ready. You can now ask about your portfolio.', renderInstructions: [] }]);
        }
      } catch (error) {
        console.error('Error checking/initializing schema contexts:', error);
        setMessages(prev => [...prev, { id: `init-error-${Date.now()}`, role: 'assistant', content: `Error setting up portfolio connection: ${error.message}`, renderInstructions: [] }]);
        setIsLoading(false);
      }
    };
    initializeIfNeeded();
  }, [supabaseClient]);

  // --- Core RAG Pipeline Functions (Using User-Provided Prompts) ---

  const determineQuerySourceAndEntities = async (userQuery) => {
    // Using user-provided prompt #1
    const systemPrompt = `You are an expert query router for a financial chatbot. Your task is to analyze the user's question and determine the correct data source.

There are two data sources:
1.  **"portfolio_db"**: Use for questions about the user's PERSONAL holdings. These queries often use possessive words like "my", "I", "mine", or ask about specific accounts.
2.  **"yfinance"**: Use for GENERAL market data about a stock or the market as a whole. These are impersonal questions.

**CRITICAL INSTRUCTION:** The user's phrasing is the most important clue.

**Examples:**
- "how many apple shares do I have?" -> **"portfolio_db"** (The user is asking about *their* shares)
- "what is the price of apple stock?" -> **"yfinance"** (A general question about the market price)
- "show my portfolio" -> **"portfolio_db"**
- "get the latest news for MSFT" -> **"yfinance"**
- "what is the total value of my main account?" -> **"portfolio_db"**
- "what is the market cap of Tesla?" -> **"yfinance"**

Now, analyze the following user query and respond ONLY with a JSON object in the format:
{ "dataSource": "portfolio_db" | "yfinance", "entityInfo": { ... } }`;
    
    const llmResponse = await llmEntityExtraction.invoke([{ type: "system", content: systemPrompt }, { type: "human", content: userQuery }]);
    try {
        const jsonMatch = llmResponse.content.trim().match(/{[\s\S]*}/);
        if (jsonMatch && jsonMatch[0]) return JSON.parse(jsonMatch[0]);
        throw new Error('No valid JSON object found in LLM response.');
    } catch (error) {
        console.error("Error determining query source, defaulting to yfinance:", error);
        return { dataSource: "yfinance", entityInfo: {} };
    }
  };

  const generateSQLFromContext = async (userQuery, schemaContexts, queryDetails) => {
    const contextText = schemaContexts.map(ctx => `${ctx.source_type.toUpperCase()}: ${ctx.content}`).join('\n\n');
      const systemPromptContent = `You are a PostgreSQL expert. Generate precise SQL SELECT queries based on schema and natural language questions. Always use ILIKE for case-insensitive text matching in WHERE clauses. Return only the SQL query without any explanations.`;
      
    // Using user-provided prompt #2
      const userPromptContent = `Given the following database schema information:
${contextText}

You are an expert SQL generator with 40 years of experience. Your task is to translate natural language questions into SQL SELECT queries.
Generate a PostgreSQL SELECT query to answer this question: "${userQuery}"

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

    const llmResponse = await llmSqlGeneration.invoke([{ type: "system", content: systemPromptContent }, { type: "human", content: userPromptContent }]);
    const sql = llmResponse.content.trim().replace(/```sql|```/g, '').replace(/;$/, '');
    
    if (!sql.toLowerCase().startsWith('select') && !sql.toLowerCase().startsWith('with')) {
        throw new Error('Generated response did not contain a valid SELECT or WITH statement.');
    }
    console.log('Generated SQL Query:', sql);
    return sql;
  };

  const executeSupabaseQuery = async (sqlQuery) => {
    const { data, error } = await supabaseClient.rpc('execute_portfolio_query', { query_text: sqlQuery });
    if (error) throw error;
    return data;
  };

  const generateFinalResponse = async ({ query, rawData }) => {
    const formattingPrompt = PromptTemplate.fromTemplate(`
      You are an expert financial UI developer. Your task is to process raw JSON data from a financial API and generate a user-friendly response for a mobile app.
      
      Based on the user's query and the provided Raw Data, create a JSON object with two keys: "summary" and "render_instructions".
      
      **User's Query:** "{query}"
      **Raw Data:** {rawData}
      
      ---
      **COMPONENT RULES:**
      - **Use "key_value_pairs"** for single objects (like company info).
      - **Use "table"** for lists of objects (like holdings or price history). Headers should be derived from object keys.
      - **Use "bar_chart"** for categorical or time-based breakdowns (like quarterly revenue).
      - **Use "line_chart"** for continuous time-series data (like historical portfolio value).
      
      ---
      **CRITICAL INSTRUCTIONS FOR CHARTING:**
      If the user asks for a chart or the data clearly represents a time series (like quarterly revenue), you MUST create the correct chart component.
      - The 'data' array for charts must be an array of objects, e.g., [{{ "label": "Q1", "value": 100 }}].
      - You MUST extract the correct date/label and the corresponding numerical value from the Raw Data.
      
      **Example of transforming backend data to a chart:**
      If the Raw Data is \`{{ "get_quarterly_income_stmt": {{ "2024-12-31": {{"Total Revenue": 150000}}, "2024-09-30": {{"Total Revenue": 140000}}}} }}\`, your output should be:
      \`\`\`json
      {{
        "summary": "Here is a bar chart of the quarterly revenue.",
        "render_instructions": [
          {{
            "component": "bar_chart",
            "props": {{
              "title": "Quarterly Revenue",
              "data": [
                {{ "label": "2024-12-31", "value": 150000 }},
                {{ "label": "2024-09-30", "value": 140000 }}
              ],
              "options": {{ "xKey": "label", "yKey": "value" }}
            }}
          }}
        ]
      }}
      \`\`\`
      
      Now, analyze the query and data, and respond ONLY with a single, valid JSON object.
      `);
      
          const finalChain = RunnableSequence.from([
            formattingPrompt,
            llmSqlGeneration, // Assuming this is your text-generation LLM instance
            new JsonOutputParser()
          ]);
      
          try {
            return await finalChain.invoke({ query, rawData: JSON.stringify(rawData, null, 2) });
          } catch (error) {
            console.error("Error generating final formatted response:", error);
            return {
              summary: "I found the data, but had trouble formatting it. Here is the raw data.",
              render_instructions: [{ component: 'key_value_pairs', props: { title: 'Raw Data', data: rawData } }]
            };
          }
        };

  // --- Main Handler ---
  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;
    const query = inputText.trim();
    setInputText('');
    setIsLoading(true);

    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', content: query }]);

    try {
      const queryDetails = await determineQuerySourceAndEntities(query);
      let rawData, charts = null;

      if (queryDetails.dataSource === "portfolio_db") {
        console.log("Routing to Portfolio DB using original chain logic...");
        const portfolioRagChain = RunnableSequence.from([
          RunnablePassthrough.assign({
            similarContexts: new RunnableLambda({ func: (input) => findSimilarSchemaContexts(supabaseClient, input.query) })
          }),
          (input) => {
              if (!input.similarContexts?.length) throw new Error('No relevant schema context found for your portfolio query.');
              return input;
          },
          RunnablePassthrough.assign({
            generatedSql: new RunnableLambda({ func: (input) => generateSQLFromContext(input.query, input.similarContexts, queryDetails) })
          }),
          new RunnableLambda({ func: async ({ generatedSql }) => {
              // Patch: Remove trailing semicolon, wrap as SELECT row_to_json(t.*) FROM (<sql>) t
              const baseSql = generatedSql.replace(/;$/, '');
              const finalSqlQuery = `SELECT row_to_json(t.*) FROM (${baseSql}) t`;
              const { data, error } = await supabaseClient.rpc('execute_portfolio_query', { query_text: finalSqlQuery });
              if (error) throw error;
              if (!Array.isArray(data) || data.length === 0) {
                throw new Error('No data found for your portfolio query. Please check your portfolio or try a different question.');
              }
              // Patch: Return data as-is (do not map item.row_to_json)
              return data;
          }})
        ]);
        rawData = await portfolioRagChain.invoke({ query, queryDetails });
      } else {
        console.log("Routing to YFinance...");
        const yfinanceResponse = await yfinanceHandler.processQuery(query);
        if (yfinanceResponse.type === 'error' || !yfinanceResponse.content) {
          throw new Error(yfinanceResponse.error || 'No data found for your yfinance query. Please try again later.');
        }
        rawData = yfinanceResponse; // Pass the entire backend response for raw data (logs + llm output)
        charts = yfinanceResponse.charts || null;
      }

      const finalResponse = await generateFinalResponse({ query, rawData });

      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: finalResponse.summary,
        renderInstructions: finalResponse.render_instructions,
        rawData,
        charts,
      }]);
      
    } catch (error) {
      console.error('Error in message handling pipeline:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, an error occurred: ${error.message}`,
        renderInstructions: [],
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Animation & Gesture Logic ---
  const dragGesture = Gesture.Pan()
    .onStart(() => { dragStartTranslateY.current = translateY._value; })
    .onUpdate((event) => {
        let newY = dragStartTranslateY.current + event.translationY;
        newY = Math.max(0, Math.min(newY, PANEL_TOTAL_HEIGHT - MINIMIZED_PANEL_HEIGHT));
        translateY.setValue(newY);
    })
    .onEnd((event) => {
        const targetExpandedY = 0;
        const targetMinimizedY = PANEL_TOTAL_HEIGHT - MINIMIZED_PANEL_HEIGHT;
        let newIsMinimizedState = isMinimized;
        if (!isMinimized) {
            if (event.translationY > 100 || event.velocityY > 500) {
                Animated.spring(translateY, { toValue: targetMinimizedY, useNativeDriver: true, tension: 100, friction: 10 }).start();
                newIsMinimizedState = true;
            } else {
                Animated.spring(translateY, { toValue: targetExpandedY, useNativeDriver: true, tension: 100, friction: 10 }).start();
            }
        } else {
            if (event.translationY < -100 || event.velocityY < -500) {
                Animated.spring(translateY, { toValue: targetExpandedY, useNativeDriver: true, tension: 100, friction: 10 }).start();
                newIsMinimizedState = false;
            } else {
                Animated.spring(translateY, { toValue: targetMinimizedY, useNativeDriver: true, tension: 100, friction: 8 }).start();
            }
        }
        if (isMinimized !== newIsMinimizedState) {
            setIsMinimized(newIsMinimizedState);
            onMinimizeChange?.(newIsMinimizedState);
        }
    });

  return (
    <View style={componentStyles.container}>
      <GestureDetector gesture={dragGesture}>
        <Animated.View style={[componentStyles.draggablePanel, { transform: [{ translateY }] }]}>
          <SchemaRAGChatboxUI
            messages={messages}
            inputTextValue={inputText}
            onInputTextChange={setInputText}
            onSendMessagePress={handleSend}
            isLoading={isLoading}
            onClose={onClose}
            keyboardOffset={isMinimized ? navBarHeight : 0}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const componentStyles = StyleSheet.create({
  container: { height: PANEL_TOTAL_HEIGHT, width: '100%', position: 'absolute', bottom: 0, zIndex: 1000, pointerEvents: 'box-none' },
  draggablePanel: {
    width: '100%',
    height: PANEL_TOTAL_HEIGHT, 
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
  },
});

export default SchemaRAGChatbox;

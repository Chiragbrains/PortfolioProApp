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
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// --- Service & UI Imports ---
import { findSimilarSchemaContexts, initializeSchemaEmbeddings } from './services/embeddingService';
import { SchemaRAGChatboxUI } from './SchemaRAGChatbox.jsx';
import YFinanceHandler from './yfinance_handler.js';
import { GROQ_API_KEY, LLM7_API_KEY } from '@env';
import { ChatLLM7 } from 'langchain-llm7';

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
  const llmEntityExtraction = new ChatLLM7({
    apiKey: LLM7_API_KEY,
    // model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    model: 'gpt-4o-mini-2024-07-18',
    temperature: 0.1,
  });
  const llmSqlGeneration = new ChatLLM7({
    apiKey: LLM7_API_KEY,
    // model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    model: 'gpt-4o-mini-2024-07-18',
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
    
    const llmResponse = await llmEntityExtraction.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userQuery),
    ]);
    try {
        const jsonMatch = llmResponse.content.trim().match(/{[\s\S]*}/);
        if (jsonMatch && jsonMatch[0]) return JSON.parse(jsonMatch[0]);
        throw new Error('No valid JSON object found in LLM response.');
    } catch (error) {
        console.error("Error determining query source, defaulting to yfinance:", error);
        return { dataSource: "yfinance", entityInfo: {} };
    }
  };

  // --- MODIFIED FUNCTION ---
  const generateSQLFromContext = async (userQuery, schemaContexts, queryDetails) => {
    const contextText = schemaContexts.map(ctx => `${ctx.source_type.toUpperCase()}: ${ctx.content}`).join('\n\n');
    const systemPromptContent = `You are a PostgreSQL expert. Generate precise, efficient SQL SELECT queries from natural language. Return only the SQL query.`;

    const userPromptContent = `Given the following database schema information:
${contextText}

Translate this question into a single, efficient PostgreSQL SELECT query: "${userQuery}"

---
**Core Concepts:**
- **"Value"** is a monetary amount, calculated as \`price * quantity\`. Use an appropriate alias like 'total_value'.
- **"Shares"** or **"quantity"** is the number of units held, from the \`quantity\` column. Use an alias like 'total_shares'.
- To get a price, you MUST JOIN \`investment_accounts\` with \`portfolio_summary\` ON \`ps.ticker = ia.ticker\`.

**Requirements:**
1.  Use ONLY the tables and columns from the schema above.
2.  For queries about a specific stock, use a simple and efficient WHERE clause (e.g., \`WHERE ia.ticker ILIKE 'MSFT'\`). DO NOT use complex CTEs like 'WITH' for single-ticker lookups.
3.  Use \`ILIKE\` for case-insensitive text matching.
4.  Start the query with \`SELECT\`.
5.  Do NOT include explanations, comments, or a final semicolon.
6.  When using aggregate functions (SUM, AVG, COUNT), every non-aggregated column in the SELECT list MUST be in the GROUP BY clause.

---
**Example Formats:**

- **Question:** "What is the total value of my main account?"
  **SQL:**
  SELECT ia.account, SUM(ps.current_price * ia.quantity) as total_value FROM investment_accounts ia JOIN portfolio_summary ps ON ps.ticker = ia.ticker WHERE ia.account ILIKE '%main account%' GROUP BY ia.account

- **Question:** "How many total shares of apple do I own?"
  **SQL:**
  SELECT SUM(ia.quantity) as total_shares FROM investment_accounts ia WHERE ia.ticker ILIKE 'AAPL'

- **Question:** "What's the total value of my microsoft stock?"
  **SQL:**
  SELECT SUM(ps.current_price * ia.quantity) as total_value FROM investment_accounts ia JOIN portfolio_summary ps ON ps.ticker = ia.ticker WHERE ia.ticker ILIKE 'MSFT'

- **Question:** "Show my positions in my trading account"
  **SQL:**
  SELECT ia.ticker, ia.quantity, ps.current_price, (ps.current_price * ia.quantity) as position_value FROM investment_accounts ia JOIN portfolio_summary ps ON ps.ticker = ia.ticker WHERE ia.account ILIKE '%trading account%'

Your SQL query:`;

    const llmResponse = await llmSqlGeneration.invoke([
      new SystemMessage(systemPromptContent),
      new HumanMessage(userPromptContent),
    ]);

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
            llmSqlGeneration,
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
              const baseSql = generatedSql.replace(/;$/, '');
              const finalSqlQuery = `SELECT row_to_json(t.*) FROM (${baseSql}) t`;
              const { data, error } = await supabaseClient.rpc('execute_portfolio_query', { query_text: finalSqlQuery });
              if (error) throw error;
              if (!Array.isArray(data) || data.length === 0) {
                throw new Error('No data found for your portfolio query. Please check your portfolio or try a different question.');
              }
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
        rawData = yfinanceResponse;
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

if (!GROQ_API_KEY || typeof GROQ_API_KEY !== 'string' || GROQ_API_KEY.length < 10) {
  throw new Error('GROQ_API_KEY is missing or invalid. Please check your .env file and restart the app.');
}

export default SchemaRAGChatbox;
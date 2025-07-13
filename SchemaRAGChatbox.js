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

// --- Service & UI Imports ---
import { findSimilarSchemaContexts, initializeSchemaEmbeddings } from './services/embeddingService';
import { SchemaRAGChatboxUI } from './SchemaRAGChatbox.jsx';
import YFinanceHandler from './yfinance_handler.js';
import { OPENROUTER_API_KEY } from '@env';

// --- OpenRouter LLM Helper ---
const ROUTER_MODEL = 'meta-llama/llama-3-70b-instruct'; // Fast model for simple tasks
const SQL_GENERATION_MODEL = 'meta-llama/llama-3-70b-instruct'; // Powerful model for SQL generation

async function callOpenRouter({ messages, model = ROUTER_MODEL, apiKey = OPENROUTER_API_KEY, jsonMode = false }) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
    throw new Error('OPENROUTER_API_KEY is missing or invalid. Please check your .env file and restart the app.');
  }

  const body = {
    model,
    messages,
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost', // required
      'X-Title': 'Portfolio Chat App',    // optional
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No valid response from OpenRouter.');
  }

  // Conditionally parse the response
  if (jsonMode) {
    // For functions expecting JSON, parse the string content
    return JSON.parse(content);
  } else {
    // For SQL generation, return the raw string content
    return content;
  }
}
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

  // --- Effects ---
  useEffect(() => {
    // This function remains the same
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


  // --- Core RAG Pipeline Functions ---

  const determineQuerySourceAndEntities = async (userQuery) => {
    const systemPrompt = `You are an expert query router for a financial chatbot. Your task is to analyze the user's question and determine the correct data source.

There are two data sources:
1.  **"portfolio_db"**: Use for questions about the user's PERSONAL holdings. These queries often use possessive words like "my", "I", "mine", or ask about specific accounts.
2.  **"yfinance"**: Use for GENERAL market data about a stock or the market as a whole.

Analyze the user query and respond ONLY with a JSON object in the format:
{ "dataSource": "portfolio_db" | "yfinance", "entityInfo": { ... } }`;

    try {
      // JSON mode is enforced in the helper function now
      const result = await callOpenRouter({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuery },
        ],
        jsonMode: true,
      });
      return result;
    } catch (error) {
      console.error("Error determining query source, defaulting to yfinance:", error);
      return { dataSource: "yfinance", entityInfo: {} };
    }
  };

  const generateSQLFromContext = async (userQuery, schemaContexts) => {
    const contextText = schemaContexts.map(ctx => `${ctx.source_type.toUpperCase()}: ${ctx.content}`).join('\n\n');
    
    // **FIX:** This prompt is simplified and more direct for better accuracy.
    const userPromptContent = `
**Database Schema:**
${contextText}

---
**Task:**
Based on the schema, write a single, efficient PostgreSQL query for the following question.
**Question:** "${userQuery}"

---
**Critical Rules:**
1.  **NEVER GUESS column or table names.** Only use what is provided in the schema.
2.  **"Value" means money:** Calculate it as \`price * quantity\`.
3.  **"Shares" or "quantity" means a count:** Use the \`quantity\` column directly.
4.  For prices, you **MUST JOIN** \`investment_accounts\` with \`portfolio_summary\`.
5.  Use \`ILIKE\` for case-insensitive text matching (e.g., \`WHERE ticker ILIKE 'aapl'\`).
6.  Respond with **ONLY the SQL query**. No explanations, no markdown, no semicolon.

---
**Query:**
`;
    // **FIX:** We now call the more powerful model specifically for this complex task.
    const content = await callOpenRouter({
      messages: [{ role: "user", content: userPromptContent }],
      model: SQL_GENERATION_MODEL // Using the powerful model
    });

    const sql = content.trim().replace(/```sql|```/g, '').replace(/;$/, '');
    
    if (!sql.toLowerCase().startsWith('select') && !sql.toLowerCase().startsWith('with')) {
        throw new Error('Generated response did not contain a valid SELECT or WITH statement.');
    }
    console.log('Generated SQL Query:', sql);
    return sql;
  };

  const generateFinalResponse = async ({ query, rawData }) => {
    const systemPrompt = (`
      You are an expert financial UI developer. Your task is to process raw JSON data and generate a user-friendly response for a mobile app.
      
      Based on the user's query: "${query}"
      And the provided Raw Data: ${JSON.stringify(rawData, null, 2)}
      
      Create a JSON object with two keys: "summary" and "render_instructions".
      
      **COMPONENT RULES:**
      - Use "key_value_pairs" for single objects.
      - Use "table" for lists of objects.
      - Use "bar_chart" or "line_chart" for time-series data.
      
      Respond ONLY with a single, valid JSON object.
      `);
    try {
      // JSON mode enforced in the helper
      const result = await callOpenRouter({
        messages: [{ role: "system", content: systemPrompt }],
        jsonMode: true,
      });
      return result;
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
        console.log("Routing to Portfolio DB...");
        const similarContexts = await findSimilarSchemaContexts(supabaseClient, query);
        if (!similarContexts || !similarContexts.length) {
          throw new Error('No relevant schema context found for your portfolio query.');
        }
        const generatedSql = await generateSQLFromContext(query, similarContexts);
        const baseSql = generatedSql.replace(/;$/, '');
        const finalSqlQuery = `SELECT row_to_json(t.*) FROM (${baseSql}) t`;
        
        const { data, error } = await supabaseClient.rpc('execute_portfolio_query', { query_text: finalSqlQuery });
        if (error) {
          throw new Error(`SQL Error: ${error.message}\n\nSQL: ${finalSqlQuery}`);
        }
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('No data found for your portfolio query. Please check your portfolio or try a different question.');
        }
        rawData = data;
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

      // --- FIX: Validate the AI response before setting state ---
      const messageContent = (finalResponse && typeof finalResponse.summary === 'string')
        ? finalResponse.summary
        : 'I found data but could not generate a summary.'; // Fallback text

      const renderInstructions = (finalResponse && Array.isArray(finalResponse.render_instructions))
        ? finalResponse.render_instructions
        : []; // Fallback empty array

      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: messageContent, // Use the validated string
        renderInstructions: renderInstructions, // Use the validated array
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
  // This section remains the same
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
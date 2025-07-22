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
    try {
      // For functions expecting JSON, parse the string content
      return JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', content);
      throw new Error('Invalid JSON response from OpenRouter');
    }
  } else {
    // For SQL generation, return the raw string content
    return content;
  }
}

// --- Constants ---
const SCREEN_HEIGHT = Dimensions.get('window').height;
const PANEL_TOTAL_HEIGHT = SCREEN_HEIGHT * 1;
const MINIMIZED_PANEL_HEIGHT = SCREEN_HEIGHT * 0.2;

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
{ "dataSource": "portfolio_db" | "yfinance", "entityInfo": { } }

Example responses:
{"dataSource": "portfolio_db", "entityInfo": {}}
{"dataSource": "yfinance", "entityInfo": {}}`;

    try {
      const result = await callOpenRouter({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuery },
        ],
        jsonMode: true,
      });
      
      // Validate the response structure
      if (!result || typeof result !== 'object' || !result.dataSource) {
        console.error("Invalid query routing response:", result);
        return { dataSource: "yfinance", entityInfo: {} };
      }
      
      return result;
    } catch (error) {
      console.error("Error determining query source, defaulting to yfinance:", error);
      return { dataSource: "yfinance", entityInfo: {} };
    }
  };

  const generateSQLFromContext = async (userQuery, schemaContexts) => {
    const contextText = schemaContexts.map(ctx => `${ctx.source_type.toUpperCase()}: ${ctx.content}`).join('\n\n');
    
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
    
    const content = await callOpenRouter({
      messages: [{ role: "user", content: userPromptContent }],
      model: SQL_GENERATION_MODEL
    });

    const sql = content.trim().replace(/```sql|```/g, '').replace(/;$/, '');
    
    if (!sql.toLowerCase().startsWith('select') && !sql.toLowerCase().startsWith('with')) {
        throw new Error('Generated response did not contain a valid SELECT or WITH statement.');
    }
    console.log('Generated SQL Query:', sql);
    return sql;
  };

  const generateFinalResponse = async ({ query, rawData }) => {
    const systemPrompt = `You are an expert financial UI developer. Your task is to process raw JSON data and generate a user-friendly response for a mobile app.

Based on the user's query: "${query}"
And the provided Raw Data: ${JSON.stringify(rawData, null, 2)}

Create a JSON object with exactly these two keys:
- "summary": A clear, human-readable summary of the findings (string)
- "render_instructions": An array of UI component instructions

**COMPONENT RULES:**
- Use "key_value_pairs" for single objects with props: {title: string, data: object}
- Use "table" for lists of objects with props: {title: string, data: {headers: array, rows: array}}
- Use "bar_chart" or "line_chart" for time-series data with props: {data: array, options: {xKey: string, yKey: string}}

**Example Response:**
{
  "summary": "Here are your portfolio holdings showing 3 stocks with a total value of $15,234.",
  "render_instructions": [
    {
      "component": "key_value_pairs",
      "props": {
        "title": "Portfolio Summary",
        "data": {"Total Value": "$15,234", "Number of Holdings": 3}
      }
    }
  ]
}

Respond with ONLY the JSON object, no additional text.`;

    try {
      const result = await callOpenRouter({
        messages: [{ role: "system", content: systemPrompt }],
        jsonMode: true,
      });
      
      console.log('Generated final response:', result);
      
      // Validate the response structure more thoroughly
      if (!result || typeof result !== 'object') {
        throw new Error('Response is not an object');
      }
      
      if (!result.summary || typeof result.summary !== 'string') {
        throw new Error('Missing or invalid summary field');
      }
      
      if (!Array.isArray(result.render_instructions)) {
        throw new Error('Missing or invalid render_instructions field');
      }
      
      return result;
    } catch (error) {
      console.error("Error generating final formatted response:", error);
      
      // Create a better fallback response
      const fallbackSummary = `I found ${Array.isArray(rawData) ? rawData.length : 1} data record(s) for your query.`;
      const fallbackRenderInstructions = [];
      
      // Try to create a basic table from the raw data
      if (Array.isArray(rawData) && rawData.length > 0) {
        const firstItem = rawData[0];
        if (firstItem && typeof firstItem === 'object') {
          const headers = Object.keys(firstItem);
          const rows = rawData.map(item => headers.map(header => item[header] || ''));
          
          fallbackRenderInstructions.push({
            component: 'table',
            props: {
              title: 'Query Results',
              data: { headers, rows }
            }
          });
        }
      } else if (rawData && typeof rawData === 'object') {
        fallbackRenderInstructions.push({
          component: 'key_value_pairs',
          props: {
            title: 'Query Results',
            data: rawData
          }
        });
      }
      
      return {
        summary: fallbackSummary,
        render_instructions: fallbackRenderInstructions
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

      // Validate the final response before setting state
      let messageContent = 'I found data but could not generate a summary.';
      let renderInstructions = [];
      
      if (finalResponse && typeof finalResponse === 'object') {
        if (typeof finalResponse.summary === 'string' && finalResponse.summary.length > 0) {
          messageContent = finalResponse.summary;
        }
        
        if (Array.isArray(finalResponse.render_instructions)) {
          renderInstructions = finalResponse.render_instructions;
        }
      }

      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: messageContent,
        renderInstructions: renderInstructions,
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
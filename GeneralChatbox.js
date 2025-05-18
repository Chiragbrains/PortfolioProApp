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
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { GROQ_API_KEY } from '@env'; // Assuming you have your Groq API key here
import { useSupabaseConfig } from './SupabaseConfigContext'; // Import hook

const screenHeight = Dimensions.get('window').height;

const GeneralChatbox = ({ onClose }) => {
  const [messages, setMessages] = useState([
    { id: '1', text: 'Hello! Type your inquiry regarding your portfolio only.', sender: 'bot' },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(false); // Separate loading for portfolio queries
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
        const makeRequest = () => {
            return new Promise((resolve, reject) => {
                const payload = { model: "meta-llama/llama-4-scout-17b-16e-instruct", messages: [{ role: "system", content: systemPrompt },{ role: "user", content: userQuery }], temperature: 0.5, max_tokens: 500 };
                const xhr = new XMLHttpRequest();
                xhr.timeout = 20000;
                xhr.onreadystatechange = function() {
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
            while (retries >= 0) { try { return await makeRequest(); } catch (error) { if (retries === 0) throw error; retries--; await new Promise(resolve => setTimeout(resolve, 500)); } }
        };
        const data = await makeRequestWithRetries();
        if (data?.choices?.[0]?.message?.content) {
            const rawContent = data.choices[0].message.content;
            if (rawContent === 'QUERY_UNANSWERABLE') return 'QUERY_UNANSWERABLE';
            const sqlRegex = /```(?:sql)?\s*(SELECT[\s\S]*?)(?:;)?\s*```|^(SELECT[\s\S]*?)(?:;)?$/im;
            const match = rawContent.match(sqlRegex);
            let extractedSql = null;
            if (match) { extractedSql = (match[1] || match[2] || '').trim(); }
            else if (rawContent.toUpperCase().includes('SELECT')) { const selectRegex = /SELECT\s+[^;]*/i; const selectMatch = rawContent.match(selectRegex); if (selectMatch) { extractedSql = selectMatch[0].trim(); } }
            if (extractedSql?.toUpperCase().startsWith('SELECT')) { return extractedSql.endsWith(';') ? extractedSql.slice(0, -1).trim() : extractedSql; }
        }
        return null; // Indicate not a portfolio query / failed to extract SQL
    } catch (error) {
        console.error('Error in interpretPortfolioQuery:', error);
        return null; // Indicate not a portfolio query on error
    }
  };

  const fetchPortfolioDataFromSupabase = async (sqlQuery) => {
    if (!supabaseClient) throw new Error("Supabase client not available.");
    if (!sqlQuery || typeof sqlQuery !== 'string' || !sqlQuery.trim().toUpperCase().startsWith('SELECT')) throw new Error("Invalid or non-SELECT SQL query provided.");
    const { data, error } = await supabaseClient.rpc('execute_sql', { sql_query: sqlQuery });
    if (error) { console.error("Supabase RPC error:", error); throw new Error(`Database query failed: ${error.message}`); }
    return data || [];
  };

  const getFormattedPortfolioTextResponseFromLLM = async (originalUserQuery, databaseResults) => {
    if (!databaseResults || databaseResults.length === 0) return "No data was found to answer your question.";
    
    const safeUserQuery = String(originalUserQuery || '');
    const resultsSampleForLLM = Array.isArray(databaseResults) ? databaseResults.slice(0, 100) : []; // limit to 100 rows for LLM
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // Shorter timeout for chat
      
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

Be direct and clear in your response. Mention all relevant results in your response including company name.
- Display results in a readable and concise format.
- If you need to list items, start each item on a new line with an asterisk and a space (e.g., "* Item 1").
- Do NOT use markdown like **bold** or _italics_. Use clear sentence structure for emphasis if needed.
- If providing a summary or a key takeaway, present it as a simple paragraph.`
            },
            { 
              role: "user", 
              content: `Original Question: "${safeUserQuery}"\n\nDatabase Results (sample of up to 5 rows):\n${JSON.stringify(resultsSampleForLLM, null, 2)}`
            }
          ],
          temperature: 0.3, // Lower temperature for more deterministic and factual output
        })
      });
      clearTimeout(timeoutId);
      if (!response.ok) { const errorBody = await response.text(); throw new Error(`LLM Text Response API error: ${response.status} ${response.statusText} - ${errorBody}`);}
      const data = await response.json();
      if (data.choices?.[0]?.message?.content) return data.choices[0].message.content.trim();
      return "Could not get a formatted response from the assistant.";
    } catch (error) {
      console.error("Error getting formatted portfolio text response from LLM:", error);
      if (error.name === 'AbortError') return "The request to the AI assistant timed out.";
      return "Error processing your request with the AI assistant.";
    }
  };

  // --- General LLM Response (existing) ---
  const fetchGeneralLLMResponse = async (userQuery) => {
    setIsLoading(true);
    const systemPrompt = `You are a helpful general-purpose AI assistant. Answer the user's questions clearly and concisely.`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama3-8b-8192", // Or your preferred Groq model
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userQuery }
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("LLM API Error:", errorBody);
        throw new Error(`API error ${response.status}`);
      }

      const data = await response.json();
      const botResponse = data.choices?.[0]?.message?.content.trim();

      if (botResponse) {
        setMessages(prevMessages => [ // Ensure this updates the messages state
          ...prevMessages,
          { id: String(Date.now() + 1), text: botResponse, sender: 'bot' },
        ]);
      } else {
        throw new Error("Empty response from LLM");
      }
    } catch (error) {
      console.error("Error fetching LLM response:", error);
      setMessages(prevMessages => [
        ...prevMessages,
        { id: String(Date.now() + 1), text: "Sorry, I couldn't get a response. Please try again.", sender: 'bot' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    const userQuery = inputText.trim();
    if (userQuery.length === 0) return;

    const newUserMessage = { id: String(Date.now()), text: inputText.trim(), sender: 'user' };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setInputText('');
    setIsPortfolioLoading(true); // Use general loading for now, or a specific one

    try {
      const sqlQuery = await interpretPortfolioQuery(userQuery);

      if (sqlQuery === 'QUERY_UNANSWERABLE') {
        setMessages(prevMessages => [...prevMessages, { id: String(Date.now() + 1), text: "I can't answer that question based on the available portfolio data.", sender: 'bot', type: 'info' }]);
      } else if (sqlQuery) {
        const results = await fetchPortfolioDataFromSupabase(sqlQuery);
        const formattedText = await getFormattedPortfolioTextResponseFromLLM(userQuery, results);
        setMessages(prevMessages => [...prevMessages, {
          id: String(Date.now() + 1),
          text: formattedText, // This is the primary text to display
          sender: 'bot',
          type: 'portfolio_response',
          query: userQuery,
          rawData: results, // Keep raw data if needed for a "show table" fallback
          llmResponse: formattedText
        }]);
      } else {
        // Not a portfolio query, or interpretation failed, proceed to general LLM
        await fetchGeneralLLMResponse(userQuery);
      }
    } catch (error) {
      console.error("Error in handleSend (portfolio query path):", error);
      setMessages(prevMessages => [...prevMessages, { id: String(Date.now() + 1), text: `Sorry, an error occurred: ${error.message}`, sender: 'bot' }]);
    } finally {
      setIsPortfolioLoading(false);
      setIsLoading(false); // Ensure general loading is also turned off
    }
  };

  // --- Copied and adapted from PortfolioGraph.js ---
  const FormattedLLMResponse = ({ text }) => {
    if (!text) return null;
    const lines = text.split('\n');

    const renderTextWithPL = (lineText) => {
      // Regex to find P&L patterns like "$1,234.56, 12.34%" or "-$500.00, -5.00%"
      // It expects a comma separating the dollar amount and the percentage.
      const pnlRegex = /(-\$?\s*[\d,]+\.\d{2}\s*,\s*-?\s*\d+\.?\d*\s*%|\$?\s*[\d,]+\.\d{2}\s*,\s*\+?\s*\d+\.?\d*\s*%)/g;
      const parts = lineText.split(pnlRegex);

      return parts.map((part, index) => {
        if (part && part.match(pnlRegex)) {
          const isNegative = part.startsWith('-') || part.includes(' -');
          return <Text key={index} style={isNegative ? portfolioQueryStyles.negativeChange : portfolioQueryStyles.positiveChange}>{part}</Text>;
        }
        return <Text key={index}>{part}</Text>;
      });
    };

    return (
      <View style={portfolioQueryStyles.llmTextResponseContainer}>
        {lines.map((line, index) => {
          line = line.trim();
          if (line.startsWith('* ')) {
            return (
              <View key={index} style={portfolioQueryStyles.bulletItemContainer}>
                <Text style={portfolioQueryStyles.bulletPoint}>•</Text>
                <Text style={portfolioQueryStyles.bulletText}>{renderTextWithPL(line.substring(2))}</Text>
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
    // This Pressable acts as a boundary for the chatbox, consuming presses within it.
    <Pressable
      style={styles.chatboxPressableBoundary} 
      onPress={() => { /* Do nothing, just consume the press */ }}

    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingViewInternal} 
        behavior={Platform.OS === 'android' ? 'height' : 'padding'}
        keyboardVerticalOffset={0}
        // onStartShouldSetResponder can be removed if the Pressable wrapper works
      >
        <View style={styles.chatContainer}>
          <GestureDetector gesture={dragGesture}>
            <View 
              style={styles.swipeHandleContainer}
              onStartShouldSetResponderCapture={() => true} // Change to true to capture touch
            >
              <View style={styles.swipeHandle} />
            </View>
          </GestureDetector>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>General Assistant about your Portfolio</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContentContainer}
          >
            {messages.map(msg => (
              msg.type === 'portfolio_response' ? (
                <View key={msg.id} style={[styles.messageBubble, styles.botMessage, portfolioQueryStyles.portfolioMessageBubble]}>
                  {msg.llmResponse && !msg.llmResponse.toLowerCase().includes("error") && !msg.llmResponse.toLowerCase().includes("no data was found") ? (
                    <FormattedLLMResponse text={msg.llmResponse} />
                  ) : msg.rawData && msg.rawData.length > 0 ? (
                    <>
                      {msg.llmResponse && <Text style={portfolioQueryStyles.llmParagraph}>{msg.llmResponse}</Text>}
                      <Text style={portfolioQueryStyles.llmParagraph}>Here's the data I found:</Text>
                      {renderFallbackResults(msg.rawData)}
                    </>
                  ) : (
                    <Text style={portfolioQueryStyles.llmParagraph}>{msg.text || "No information found for your query."}</Text>
                  )}
                </View>
              ) : (
                <View
                  key={msg.id}
                  style={[
                    styles.messageBubble,
                    msg.sender === 'user' ? styles.userMessage : styles.botMessage,
                  ]}
                >
                  <Text style={msg.sender === 'user' ? styles.userMessageText : styles.botMessageText}>{msg.text}</Text>
                </View>
              )
            ))}
            {(isLoading || isPortfolioLoading) && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#007AFF" />
              </View>
            )}
          </ScrollView>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask info about your portfolio..."
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={isLoading || isPortfolioLoading}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chatboxPressableBoundary: { // New style for the outer Pressable
    // Give KAV the explicit height. It will be positioned at the bottom by App.js's modalOverlay.
    height: screenHeight * 0.9, // Set KAV height to the intended visual height of the chatbox
    width: '90%', 
  },
  keyboardAvoidingViewInternal: { // Style for the KAV, now filling the Pressable
    flex: 1, // Make KAV fill the Pressable wrapper
    width: '100%', // Ensure KAV takes full width of its Pressable parent
  },
  chatContainer: {
    // chatContainer should fill the KAV. KAV's behavior="padding" will adjust this.
    flex: 1, 
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
  },
  swipeHandleContainer: {
    alignItems: 'center',
    paddingVertical: 10, // Makes the area around the handle touchable for swipe
    width: '100%', // Ensure it spans the top of the chatbox
  },
  swipeHandle: {
    width: 50, // Wider handle
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#B0B0B0', // A visible grey color for the handle
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContentContainer: {
    padding: 10,
  },
  messageBubble: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 15,
    marginBottom: 8,
    maxWidth: '80%',
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
    fontSize: 15,
    color: '#FFFFFF',
  },
  botMessageText: {
    fontSize: 15,
    color: '#000000', // Default black for bot, user text color can be set if needed
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#B0B0B0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    marginRight: 10,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#1565C0',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  sendButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    alignSelf: 'flex-start',
    padding: 10,
  },
});

// Styles for portfolio query results, adapted from PortfolioGraph.js
const portfolioQueryStyles = StyleSheet.create({
  portfolioMessageBubble: {
    backgroundColor: '#E8F0F9', // A slightly different background for portfolio responses
    borderColor: '#C9DDF0',
    borderWidth: 1,
  },
  llmTextResponseContainer: {
    paddingVertical: 5, // Reduced padding for chat bubble
  },
  llmParagraph: {
    fontSize: 14, // Slightly smaller for chat
    lineHeight: 20,
    color: '#222',
    marginBottom: 6,
  },
  bulletItemContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingLeft: 5, // Less indent for chat
  },
  bulletPoint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#00529B', // Portfolio-specific bullet color
    marginRight: 6,
    fontWeight: 'bold',
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#222',
  },
  resultsEmptyText: { // Added for fallback table
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 10,
  },
  positiveChange: {
    color: '#2E7D32', // Darker green
  },
  negativeChange: {
    color: '#C62828', // Darker red
  },
  // Fallback table styles (if you decide to implement the table display)
  resultsTable: { marginTop: 8, borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 4 },
  resultsRowHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#B0BEC5', paddingBottom: 4, marginBottom: 4, backgroundColor: '#ECEFF1', },
  resultsCellHeader: { flex: 1, fontSize: 11, fontWeight: 'bold', paddingHorizontal: 2, color: '#37474F', textTransform: 'capitalize', },
  resultsRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#CFD8DC', paddingVertical: 4, },
  resultsCell: { flex: 1, fontSize: 11, paddingHorizontal: 2, color: '#455A64', },
  singleResultContainer: { paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 4, marginVertical: 5 },
  singleResultKey: { fontSize: 13, color: '#546E7A', marginBottom: 2, },
  singleResultValue: { fontSize: 16, fontWeight: '600', color: '#263238', },
  valueAmount: { 
    // This style is used by formatCurrency within renderFallbackResults
    // It can be basic, as color is applied by getGainLossColor directly
    // For example:
    // fontSize: 11, // if used in table cells
    // fontWeight: 'normal', // if used in table cells
  },
});


export default GeneralChatbox;
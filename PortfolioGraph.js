// PortfolioGraph.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Dimensions,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Platform,
  TouchableWithoutFeedback,
  TextInput,
  ScrollView,
  KeyboardAvoidingView, // Add KeyboardAvoidingView
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { fetchPortfolioSummary, fetchInvestmentAccounts, addInvestmentAccount, updateInvestmentAccount, deleteInvestmentAccount, bulkImportInvestmentAccounts, truncateInvestmentAccounts, refreshPortfolioDataIfNeeded, fetchPortfolioHistory } from './stocksService'; // Update import statement at the top to include fetchPortfolioHistory
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useSupabaseConfig } from './SupabaseConfigContext'; // Import hook
import { GROQ_API_KEY } from '@env'; // Import the Groq key from .env

const { width: initialScreenWidth, height: initialScreenHeight } = Dimensions.get('window');

// --- Chart Configuration Constants ---
// Adjusted for no Y-axis labels
const CHART_PADDING_LEFT = Platform.OS === 'ios' ? 15 : 10; // Increased padding for iOS
const CHART_PADDING_RIGHT = Platform.OS === 'ios' ? 20 : 16;
const Y_AXIS_LABEL_WIDTH = 0; // Set to 0 as labels are hidden
const CHART_MARGIN_VERTICAL = Platform.OS === 'ios' ? 15 : 10;
const CHART_HEIGHT = Math.min(initialScreenHeight * 0.3, 220); // Make height responsive
// --- End Chart Configuration Constants ---

export const PortfolioGraph = () => {
  const [historyData, setHistoryData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(90);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [chartWidth, setChartWidth] = useState(initialScreenWidth);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showIndicator, setShowIndicator] = useState(true); // CHANGED: Set default to true to show the indicator
  const indicatorX = useRef(new Animated.Value(0)).current;
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [query, setQuery] = useState('');
  const [queryResults, setQueryResults] = useState(null); // State for results
  const [lastExecutedQuery, setLastExecutedQuery] = useState(''); // State for the user's query text
  const [llmTextResponse, setLlmTextResponse] = useState(''); // New state for LLM's formatted text response

  const { supabaseClient } = useSupabaseConfig(); // Get client


  const getChartLayout = useCallback(() => {
    const containerPaddingHorizontal = 0;
    const effectiveChartWidth = chartWidth - (containerPaddingHorizontal * 2);
    // Use updated Y_AXIS_LABEL_WIDTH (0) in calculation
    const drawableWidth = effectiveChartWidth - CHART_PADDING_LEFT - CHART_PADDING_RIGHT - Y_AXIS_LABEL_WIDTH;
    // startX is now just the left padding
    const startX = CHART_PADDING_LEFT;
    return { drawableWidth, startX, effectiveChartWidth };
  }, [chartWidth]); // chartWidth is the dependency


  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString + 'T00:00:00');
        if (isNaN(date.getTime())) {
            console.warn("Invalid date string received:", dateString);
            return 'Invalid Date';
        }
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch (e) {
        console.error("Error formatting date:", dateString, e);
        return 'Error Date';
    }
  };

  const updateSelectedPoint = useCallback((index) => {
    if (
        historyData &&
        historyData.originalData &&
        index >= 0 &&
        index < historyData.originalData.length
       ) {
      const dataPoint = historyData.originalData[index];
      if (dataPoint) {
        const stockValue = dataPoint.total_value || 0;
        const totalValue = stockValue;

        setSelectedPoint(prevPoint => {
            if (prevPoint?.index === index && prevPoint?.value === totalValue && prevPoint?.date === dataPoint.date) {
                return prevPoint;
            }
            return {
                value: totalValue,
                date: dataPoint.date,
                index: index,
            };
        });
      } else {
          console.warn(`Data point at index ${index} is undefined.`);
      }
    }
  }, [historyData]);

  // Make sure fetchPortfolioHistory is stable or add it to dependencies if needed
  const loadHistory = useCallback(async (days) => {
    console.log(`Loading history for ${days} days...`); // Log: Check if called
    setIsLoading(true);
    setError(null);
    // REMOVED: setShowIndicator(false); - We want indicator to stay visible
    // Reset data *before* fetching new data to ensure UI updates
    setHistoryData(null);
    setSelectedPoint(null);
  
    if (!supabaseClient) { // Guard
      setError("Supabase connection not configured.");
      setIsLoading(false);
      return;
  }

    try {
      const data = await fetchPortfolioHistory(supabaseClient, days);
      console.log(`Fetched data for ${days} days:`, data ? data.length : 0, "items"); // Log: Check fetched data

      if (data && data.length > 0) {
        // Ensure data is sorted by date
        data.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Process data *only* from the fetched result
        const labels = data.map(item => {
          const date = new Date(item.date + 'T00:00:00');
          return `${date.getMonth() + 1}/${date.getDate()}`;
        });

        const values = data.map(item => {
          const cashValue = item.cash_value || 0;
          const stockValue = item.total_value || 0;
          return stockValue + cashValue;
        });

        const newHistoryData = {
          labels: labels,
          datasets: [
            {
              data: values,
              color: (opacity = 1) => `rgba(21, 101, 192, ${opacity})`,
              strokeWidth: 3,
            },
          ],
          originalData: data,
        };
        console.log(`Setting new history data for ${days} days.`); // Log: Check before setting state
        setHistoryData(newHistoryData); // Update state with new data

        // Set selected point based on the *new* data
        if (values.length > 0) {
            const lastIndex = values.length - 1;
            const lastDataPoint = data[lastIndex];
            const lastCashValue = lastDataPoint.cash_value || 0;
            const lastStockValue = lastDataPoint.total_value || 0;
            setSelectedPoint({
                value: lastStockValue,
                date: lastDataPoint.date,
                index: lastIndex,
            });
            
            // ADDED: Set initial indicator position at the end of the chart
            const { drawableWidth, startX } = getChartLayout();
            Animated.timing(indicatorX, {
                toValue: startX + drawableWidth,
                duration: 0,
                useNativeDriver: false,
            }).start();
        }

      } else {
        // Explicitly handle no data case after fetch
        setHistoryData(null);
        setSelectedPoint(null);
        console.log(`No data returned for ${days} days.`); // Log: Check empty data case
      }
    } catch (err) {
      console.error(`Error loading portfolio history for ${days} days:`, err);
      setError('Failed to load portfolio history.');
      // Ensure state is cleared on error too
      setHistoryData(null);
      setSelectedPoint(null);
    } finally {
      setIsLoading(false);
    }
    // Removed fetchPortfolioHistory from dependency array assuming it's a stable import
    // If fetchPortfolioHistory itself depends on component props/state, add it back.
  }, [supabaseClient, getChartLayout]); // Added getChartLayout to dependencies

  useEffect(() => {
    if (supabaseClient) {
      loadHistory(timeRange);
  }
}, [timeRange, loadHistory, supabaseClient]); // Add supabaseClient dependency

  useEffect(() => {
    if (selectedPoint) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true
      }).start();
    }
  }, [selectedPoint, fadeAnim]);

  const handleTimeRangeChange = (days) => {
    if (timeRange !== days) {
        console.log("Changing time range to:", days); // Log: Check if handler is called
        setTimeRange(days); // This state change triggers the useEffect above
    }
  };

  const updateIndicatorAndData = useCallback((touchX) => {
    if (!historyData || !historyData.datasets || historyData.datasets[0].data.length === 0) return;

    const { drawableWidth, startX, effectiveChartWidth } = getChartLayout();
    const dataPoints = historyData.datasets[0].data.length;

    //console.log(`updateIndicatorAndData - touchX: ${touchX.toFixed(2)}, startX: ${startX.toFixed(2)}, drawableWidth: ${drawableWidth.toFixed(2)}, chartWidth: ${chartWidth}, effectiveChartWidth: ${effectiveChartWidth}`); // <<< ADD THIS LOG

    const clampedTouchX = Math.max(startX, Math.min(touchX, startX + drawableWidth));
    
    //console.log(`updateIndicatorAndData - clampedTouchX (indicatorX): ${clampedTouchX.toFixed(2)}`); // <<< ADD THIS LOG

    Animated.timing(indicatorX, {
      toValue: clampedTouchX,
      duration: 50,
      useNativeDriver: false,
    }).start();

    let relativeX = 0;
    if (drawableWidth > 0) {
        relativeX = (clampedTouchX - startX) / drawableWidth;
    }

    let index = 0;
    if (dataPoints > 1) {
        index = Math.round(relativeX * (dataPoints - 1));
    }
    index = Math.max(0, Math.min(index, dataPoints - 1));

    updateSelectedPoint(index);

    setSelectedIndex(index);
  }, [historyData, getChartLayout, updateSelectedPoint]);

  const panGesture = Gesture.Pan()
    .onBegin((event) => {
           //console.log('panGesture: onBegin - Setting showIndicator to TRUE'); // <<< LOG ADDED
           setShowIndicator(true);
           updateIndicatorAndData(event.x);
    })
    .onUpdate((event) => {
      if (showIndicator) {
          updateIndicatorAndData(event.x);
      } else {
        // This case might happen if onBegin didn't fire correctly or state update was delayed
        //console.log('panGesture: onUpdate - SKIPPING update, showIndicator is FALSE'); // <<< LOG ADDED
        setShowIndicator(true); // ADDED: Force indicator to show
        updateIndicatorAndData(event.x);
      }
    })
    .onEnd(() => {
      //console.log('panGesture: onEnd'); // <<< LOG ADDED
      // REMOVED: Don't hide indicator on pan end
    })
    .hitSlop({ top: -10, bottom: -10, left: -CHART_PADDING_LEFT, right: -CHART_PADDING_RIGHT });

  const composedGesture = panGesture;

  const hideInteraction = useCallback(() => {
      // CHANGED: This function now just updates the selected point to the end
      // but doesn't hide the indicator
      if (historyData && historyData.originalData && historyData.originalData.length > 0) {
          updateSelectedPoint(historyData.originalData.length - 1);
          // ADDED: Update indicator position to the end of the chart
          const { drawableWidth, startX } = getChartLayout();
          Animated.timing(indicatorX, {
            toValue: startX + drawableWidth,
            duration: 0,
            useNativeDriver: false,
          }).start();
      }
  }, [historyData, updateSelectedPoint, getChartLayout]);


  const calculateGainLoss = useCallback(() => {
    if (historyData?.datasets?.[0]?.data && selectedPoint && selectedPoint.index > 0) {
      const data = historyData.datasets[0].data;
      const index = selectedPoint.index;

      if (index < data.length) {
        const currentValue = selectedPoint.value; // This should be the stock value only
        const previousDataPoint = historyData.originalData[index - 1]; // Get the previous data point
        const previousValue = previousDataPoint ? previousDataPoint.total_value || 0 : 0; // Only use stock value

        // Log the values being used
        //console.log(`  Current Value : ${currentValue}`);
        //console.log(`  Previous Value : ${previousValue}`); // Compare if needed

        if (previousValue != null && previousValue !== 0) {
          const gainLoss = currentValue - previousValue;
          const percent = (gainLoss / previousValue) * 100;
          if (isFinite(gainLoss) && isFinite(percent)) {
              return { value: gainLoss, percent: percent };
          }
        }
      }
    }
    return { value: 0, percent: 0 };
  }, [historyData, selectedPoint]);

  const getGainLossColor = (value) => {
    return value >= 0 ? styles.positiveChange : styles.negativeChange;
  };

  const handleQuerySubmit = async () => {
    console.log("Question from user:", query);
    if (!query.trim()) {
      console.log("Query is empty, skipping.");
      return;
    }

    // Clear old state before starting new query
    setIsLoading(true);
    setError(null);
    setQueryResults(null);
    setLastExecutedQuery('');
    setLlmTextResponse('');

    try {
      // Validate Supabase client and connection
      if (!supabaseClient) {
        throw new Error("Database connection not available");
      }

      // Test database connection first
      try {
        await supabaseClient.from('portfolio_summary').select('ticker', { count: 'exact', head: true });
      } catch (connectionError) {
        console.error("Connection test failed:", connectionError);
        throw new Error('Unable to connect to database. Please check your internet connection.');
      }

      // Process query with retries for mobile
      let retries = 2;
      let sqlQuery = null;
      let queryError = null;

      while (retries > 0 && !sqlQuery) {
        try {
          sqlQuery = await interpretQuery(query);
          break;
        } catch (error) {
          console.error(`Query attempt failed (${retries} retries left):`, error);
          queryError = error;
          retries--;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between retries
        }
      }

      if (!sqlQuery && queryError) {
        throw queryError;
      }

      console.log("Generated SQL:", sqlQuery);

      if (sqlQuery && sqlQuery !== 'QUERY_UNANSWERABLE') {
        const results = await fetchFromSupabase(sqlQuery);
        setQueryResults(results);
        setLastExecutedQuery(query);
        
        if (results && results.length > 0) {
          try {
            const formattedText = await getFormattedTextResponseFromLLM(query, results);
            if (formattedText) {
              setLlmTextResponse(formattedText);
            }
          } catch (llmError) {
            console.error("LLM formatting failed:", llmError);
            // Continue with raw results if formatting fails
          }
        }
      } else if (sqlQuery === 'QUERY_UNANSWERABLE') {
        setError("I can't answer that question based on the available portfolio data.");
      } else {
        throw new Error("Failed to generate a valid query. Please try rephrasing your question.");
      }
    } catch (error) {
      console.error("Error processing query:", error);
      setError(error.message || "Failed to process query. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const interpretQuery = async (userQuery) => {
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

Examples:
- User: "how many apple stocks do I have?" -> SQL: SELECT total_quantity FROM portfolio_summary WHERE ticker = 'AAPL'
- User: "what is my biggest loss?" -> SQL: SELECT ticker, pnl_dollar FROM portfolio_summary ORDER BY pnl_dollar ASC LIMIT 1
- User: "which stock am I losing the most on?" -> SQL: SELECT ticker, pnl_dollar FROM portfolio_summary ORDER BY pnl_dollar ASC LIMIT 1
- User: "what is my biggest gain?" -> SQL: SELECT ticker, pnl_dollar FROM portfolio_summary ORDER BY pnl_dollar DESC LIMIT 1
- User: "what is the total value of my portfolio?" -> SQL: SELECT SUM(market_value) FROM portfolio_summary
`;
    try {
        // Add mobile-specific fetch configuration
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'User-Agent': 'Mozilla/5.0' // Add user agent for mobile compatibility
            },
            body: JSON.stringify({
                model: "llama3-8b-8192",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userQuery }
                ],
                temperature: 0.7,
                max_tokens: 500
            })
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Failed to get error details');
            console.error("Groq API Error Details:", {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`API request failed (${response.status}). Please try again.`);
        }

        let data;
        try {
            const text = await response.text();
            data = JSON.parse(text);
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError);
            console.error("Raw Response:", await response.text().catch(() => 'Failed to get raw response'));
            throw new Error("Failed to parse the API response. Please try again.");
        }

        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            const rawContent = data.choices[0].message.content;
            let extractedSql = null;
            
            // 1. Check for exact refusal string first
            if (rawContent === 'QUERY_UNANSWERABLE') {
                return 'QUERY_UNANSWERABLE';
            }

            // 2. Try regex to find SELECT statements within markdown blocks
            const sqlRegex = /```(?:sql)?\s*(SELECT[\s\S]*?)(?:;)?\s*```|^(SELECT[\s\S]*?)(?:;)?$/im;
            const match = rawContent.match(sqlRegex);

            if (match) {
                // Prefer the captured group within backticks (match[1]) or the standalone query (match[2])
                extractedSql = (match[1] || match[2] || '').trim();
            } else {
                // 3. If regex fails, check for "SQL:" prefix (case-insensitive)
                let potentialSql = rawContent;
                if (potentialSql.toUpperCase().startsWith('SQL:')) {
                    potentialSql = potentialSql.substring(4).trim();
                }

                // 4. Check if the remaining string looks like a SELECT query
                if (potentialSql.toUpperCase().startsWith('SELECT')) {
                    extractedSql = potentialSql;
                }
            }

            // 5. Clean trailing semicolon from whatever was extracted
            if (extractedSql && extractedSql.endsWith(';')) {
                extractedSql = extractedSql.slice(0, -1).trim();
            }

            // 6. Final validation
            if (extractedSql && extractedSql.toUpperCase().startsWith('SELECT')) {
                return extractedSql;
            } else if (rawContent.trim() === 'QUERY_UNANSWERABLE') {
                return 'QUERY_UNANSWERABLE';
            }
        }
        console.error("Unexpected response structure from Groq API:", data);
        throw new Error("Failed to generate a valid SQL query. Please try rephrasing your question.");
    } catch (error) {
        console.error("Error in interpretQuery:", error);
        throw new Error(`Failed to process your query: ${error.message}`);
    }
  };

    // *** NEW FUNCTION: Execute SQL query via Supabase RPC ***
    const fetchFromSupabase = async (sqlQuery) => {
      if (!supabaseClient) {
        throw new Error("Supabase client not available.");
      }
      if (!sqlQuery || typeof sqlQuery !== 'string' || !sqlQuery.trim().toUpperCase().startsWith('SELECT')) {
        throw new Error("Invalid or non-SELECT SQL query provided.");
      }
  
      console.log("Executing Supabase query via RPC:", sqlQuery);
      try {
        // Add timeout for mobile environments
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Query timed out')), 30000);
        });
  
        const queryPromise = supabaseClient.rpc('execute_sql', { 
          sql_query: sqlQuery 
        });
  
        const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
  
        if (error) {
          console.error("Supabase RPC error:", error);
          
          // Check for specific mobile Safari/Chrome errors
          if (error.message?.includes('NetworkError') || error.message?.includes('network') || error.message?.includes('Failed to fetch')) {
            throw new Error('Network connection error. Please check your internet connection and try again.');
          }
          
          // Handle other errors with specific messages
          let errorMessage = 'Database query failed';
          if (error.message) errorMessage += `: ${error.message}`;
          if (error.details) errorMessage += ` (${error.details})`;
          if (error.hint) errorMessage += `. ${error.hint}`;
          throw new Error(errorMessage);
        }
  
        console.log("Supabase query results:", data);
        return data || [];
  
      } catch (rpcError) {
        console.error("Error during Supabase RPC call:", rpcError);
        if (rpcError.message?.includes('timed out')) {
          throw new Error('The query took too long to respond. Please try again.');
        }
        throw new Error(`Query failed: ${rpcError.message}`);
      }
    };
    // *** END NEW FUNCTION ***

  if (isLoading) {
    // Keep loading state simple
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading Portfolio History...</Text>
      </View>
    );
  }

  // Separate check for error state
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        {/* Pass the *current* timeRange to retry */}
        <TouchableOpacity onPress={() => loadHistory(timeRange)} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getFormattedTextResponseFromLLM = async (originalUserQuery, databaseResults) => {
    if (!databaseResults || databaseResults.length === 0) {
      return "No data was found to answer your question.";
    }
  
    // Remove the slice and use all results
    const safeUserQuery = String(originalUserQuery || '');
  
    // Defensive check for databaseResults before stringifying for the prompt
    // Also, limit the size of the results sent to the LLM to prevent overly large payloads.
    const resultsSampleForLLM = Array.isArray(databaseResults) ? databaseResults.slice(0, 10) : []; // Send up to 10 rows

    console.log("Requesting formatted text response from LLM...");
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`, // Ensure GROQ_API_KEY is correctly imported and available
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [
            { 
              role: "system", 
              content: `You are an AI assistant that provides clear and concise natural language answers based on database query results.
Given a user's question and database results, formulate a helpful text response.
Important notes about the data:
- For money values, use appropriate currency formatting
- The pnl_percent and portfolio_percent fields are already in percentage form (e.g., 5.2 means 5.2%), do not multiply by 100
Be direct and clear in your response. Mention all relevant results in your response.`
            },
            { 
              role: "user", 
              content: `Question: "${safeUserQuery}"
Database Results (sample of up to 10 rows): ${JSON.stringify(resultsSampleForLLM, null, 2)}`
            }
          ],
        }),
      });
  
      if (!response.ok) {
        const errorBody = await response.text();
        console.error("LLM Text Response API Error Body:", errorBody);
        throw new Error(`LLM Text Response API error: ${response.status} ${response.statusText}`);
      }
  
      const data = await response.json();
      console.log("LLM Text Response:", data);
  
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        return data.choices[0].message.content.trim();
      }
      return "Could not get a formatted response from the assistant.";
    } catch (error) {
      console.error("Error getting formatted text response from LLM:", error);
      return "There was an error processing your request with the AI assistant.";
    }
  };
  
  // Helper function to format keys/column names for display
const formatDisplayKey = (key) => {
  if (!key) return '';
  // Replace underscores with spaces and capitalize the
  const numCols = columnNames.length;

  // Scenario 1: Single value result (e.g., SUM, COUNT, AVG)
  if (numRows === 1 && numCols === 1) {
    const key = columnNames[0];
    const value = firstRow[key];
    return (
      <View style={styles.singleResultContainer}>
        <Text style={styles.singleResultKey}>{formatDisplayKey(key)}</Text>
        <Text style={styles.singleResultValue}>
          {typeof value === 'number' ? (key.includes('percent') ? `${value.toFixed(2)}%` : formatCurrency(value)) : String(value)}
        </Text>
      </View>
    );
  }

  // Scenario 2: Single item with a specific metric (e.g., "biggest gain", "AAPL P&L")
  if (numRows === 1 && columnNames.includes('ticker') && numCols > 1) {
    const ticker = firstRow.ticker;
    // Find the primary metric value (excluding ticker) - take the first non-ticker column
    let metricKey = '';
    let metricValue;
    for (const col of columnNames) {
      if (col !== 'ticker') {
        metricKey = col;
        metricValue = firstRow[col];
        break; // Take the first non-ticker column found
      }
    } // Fallback to table if single item heuristic doesn't find a metric
    if (metricKey) { // Ensure a metric column was found
        return (
          <View style={styles.singleResultContainer}>
            <Text style={styles.singleResultKey}>{`${ticker} - ${formatDisplayKey(metricKey)}`}</Text>
            <Text style={styles.singleResultValue}>
              {typeof metricValue === 'number' ? (metricKey.includes('percent') ? `${metricValue.toFixed(2)}%` : formatCurrency(metricValue)) : String(metricValue)}
            </Text>
          </View>
        );
    }
  }


  // Scenario 3: Default to table for multiple rows or multiple columns not fitting above patterns
  return (
    <View style={styles.resultsTable}>
      <View style={styles.resultsRowHeader}>
        {columnNames.map((key) => (
          <Text key={key} style={styles.resultsCellHeader}>
            {formatDisplayKey(key)}
          </Text>
        ))}
      </View>
      {results.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.resultsRow}>
          {Object.values(row).map((value, cellIndex) => {
             const currentColumnKey = columnNames[cellIndex]; // Get the key for the current cell's column
             return (
              <Text key={cellIndex} style={styles.resultsCell}>
                {/* Format numbers to 2 decimal places for table, special for percent */}
                {typeof value === 'number'
                  ? (currentColumnKey.includes('percent') ? `${value.toFixed(2)}%` : value.toFixed(2))
                  : value === null || value === undefined
                  ? ''
                  : String(value)}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
};
  // --- End of renderDynamicResults ---

  // --- Main Render ---
  // Calculate layout and gain/loss *after* checking loading/error states
  const { effectiveChartWidth } = getChartLayout();
  const gainLoss = calculateGainLoss();

  // Calculate decorator values (memoized calculation might be overkill here)
  const getDecoratorValues = () => {
      if (!selectedPoint || !historyData?.datasets?.[0]?.data) {
          return { pointY: 0 }; // Only need pointY
      }
      const data = historyData.datasets[0].data;
      const validData = data.filter(val => val !== null && val !== undefined);
      if (validData.length === 0) return { pointY: 0 };

      const minValue = Math.min(...validData);
      const maxValue = Math.max(...validData);
      const chartDrawableHeight = CHART_HEIGHT - (CHART_MARGIN_VERTICAL * 2);

      let pointY = CHART_HEIGHT - CHART_MARGIN_VERTICAL;
      if (maxValue > minValue && chartDrawableHeight > 0 && selectedPoint.value !== null) {
          const normalizedValue = (selectedPoint.value - minValue) / (maxValue - minValue);
          pointY = CHART_MARGIN_VERTICAL + chartDrawableHeight - (normalizedValue * chartDrawableHeight);
          pointY = Math.max(CHART_MARGIN_VERTICAL, Math.min(pointY, CHART_HEIGHT - CHART_MARGIN_VERTICAL));
      } else if (maxValue === minValue && chartDrawableHeight > 0) {
          pointY = CHART_MARGIN_VERTICAL + chartDrawableHeight / 2;
      }
      return { pointY };
  };
  const decoratorValues = getDecoratorValues();

  //console.log('Render - showIndicator:', showIndicator); // <<< LOG ADDED

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <TouchableWithoutFeedback onPress={hideInteraction}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Header section */}
          <View style={styles.valueDisplayContainer}>
            <Animated.View style={{ opacity: fadeAnim }} key={selectedPoint?.index ?? 'initial'}>
              {selectedPoint ? (
                <>
                  <Text style={styles.valueLabel}>Portfolio Value</Text>
                  <Text style={styles.valueAmount}>
                    {formatCurrency(selectedPoint.value)}
                  </Text>
                  <Text style={styles.valueDate}>
                    {formatDate(selectedPoint.date)}
                  </Text>
                  {selectedPoint.index > 0 && (gainLoss.value !== 0 || gainLoss.percent !== 0) && (
                    <Text style={[styles.gainLossText, getGainLossColor(gainLoss.value)]}>
                      {gainLoss.value >= 0 ? '+' : ''}{formatCurrency(gainLoss.value)} ({gainLoss.percent >= 0 ? '+' : ''}{gainLoss.percent.toFixed(2)}%)
                    </Text>
                  )}
                </>
              ) : (
                // Placeholder when no point is selected (e.g., after error or no data)
                <>
                  <Text style={styles.valueLabel}>Portfolio Value</Text>
                  <Text style={styles.valueAmount}>--</Text>
                  <Text style={styles.valueDate}>{historyData ? 'Select a point' : 'No data available'}</Text>
                </>
              )}
            </Animated.View>
          </View>

          {/* Time range selector */}
          <View style={styles.timeRangeSelector}>
            {/* Buttons call handleTimeRangeChange */}
            <TouchableOpacity onPress={() => handleTimeRangeChange(30)} style={[styles.timeButton, timeRange === 30 && styles.activeTimeButton]}><Text style={[styles.timeButtonText, timeRange === 30 && styles.activeTimeButtonText]}>1M</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => handleTimeRangeChange(90)} style={[styles.timeButton, timeRange === 90 && styles.activeTimeButton]}><Text style={[styles.timeButtonText, timeRange === 90 && styles.activeTimeButtonText]}>3M</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => handleTimeRangeChange(180)} style={[styles.timeButton, timeRange === 180 && styles.activeTimeButton]}><Text style={[styles.timeButtonText, timeRange === 180 && styles.activeTimeButtonText]}>6M</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => handleTimeRangeChange(365)} style={[styles.timeButton, timeRange === 365 && styles.activeTimeButton]}><Text style={[styles.timeButtonText, timeRange === 365 && styles.activeTimeButtonText]}>1Y</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => handleTimeRangeChange(730)} style={[styles.timeButton, timeRange === 730 && styles.activeTimeButton]}><Text style={[styles.timeButtonText, timeRange === 730 && styles.activeTimeButtonText]}>2Y</Text></TouchableOpacity>
          </View>

          {/* Chart section */}
          {/* Conditionally render chart or empty state based on historyData */}
          {historyData && historyData.datasets && historyData.datasets[0].data.length > 0 ? (
            <GestureDetector gesture={composedGesture}>
              <View style={styles.chartOuterContainer}>
                <LineChart
                  data={historyData} // Use the state variable directly
                  width={effectiveChartWidth} // Use calculated width
                  height={CHART_HEIGHT}
                  // yAxisLabel="$" // REMOVED
                  yAxisSuffix=""
                  withInnerLines={false}
                  withOuterLines={false}
                  withVerticalLines={false}
                  withHorizontalLines={true} // Keep horizontal grid lines
                  // withHorizontalLabels={false} // Alternative way to hide labels, but formatYLabel is safer
                  horizontalLabelRotation={0}
                  chartConfig={{
                    backgroundColor: 'white',
                    backgroundGradientFrom: 'white',
                    backgroundGradientTo: 'white',
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(21, 101, 192, ${opacity})`,
                    labelColor: (opacity = 0.6) => `rgba(102, 102, 102, ${opacity})`, // X-axis label color
                    propsForBackgroundLines: {
                      strokeDasharray: '',
                      strokeWidth: 0.5,
                      stroke: '#ebebeb',
                    },
                    propsForDots: {
                      r: showIndicator ? "0" : "3",
                      strokeWidth: "0",
                    },
                    propsForLabels: { // Style for X-axis labels
                      fontSize: 10,
                      fontWeight: '400',
                    },
                    formatYLabel: () => '', // HIDE Y-Axis Labels
                    yAxisLabelWidth: Y_AXIS_LABEL_WIDTH, // Use constant (0)
                    style: {
                         marginVertical: 0,
                    }
                  }}
                  bezier
                  style={styles.chart} // Contains paddingLeft, paddingRight
                  decorator={() => {
                    if (!selectedPoint) return null;
                    const { pointY } = decoratorValues;
                    return (
                      <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        {/* Vertical bar */}
                        <Animated.View
                          style={[
                            styles.decoratorLine,
                            { left: indicatorX }
                          ]}
                        />
                        {/* Dot */}
                        <Animated.View
                          style={[
                            styles.decoratorDot,
                            { top: pointY - 7, left: Animated.subtract(indicatorX, 7) }
                          ]}
                        />
                      </View>
                    );
                  }}
                />
              </View>
            </GestureDetector>
          ) : (
            // Show empty state if historyData is null or empty after loading/error checks
            <View style={[styles.chartOuterContainer, styles.centered, { height: CHART_HEIGHT }]}>
                <Text style={styles.emptyText}>No historical data for this period</Text>
                <Text style={styles.emptySubText}>Portfolio snapshots are generated daily</Text>
            </View>
          )}

          <View style={styles.queryBarContainer}>
            <TextInput
              style={styles.queryInput}
              placeholder="Ask a question about your portfolio..."
              value={query}
              onChangeText={setQuery}
              maxFontSizeMultiplier={1.0} // Prevent text scaling
              onSubmitEditing={handleQuerySubmit}
              returnKeyType="search"
            />
            <TouchableOpacity 
              onPress={handleQuerySubmit}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.queryButtonText}>Submit</Text>
            </TouchableOpacity>
          </View>

          {lastExecutedQuery && (
            <View style={styles.resultsContainer}>
              <View style={styles.resultsHeader}>
                  <Text style={styles.resultsTitle}>Results for: "{lastExecutedQuery}"</Text>
                  <TouchableOpacity onPress={() => { setQueryResults(null); setLastExecutedQuery(''); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={styles.resultsClearButton}>Clear</Text>
                  </TouchableOpacity>
              </View>

              {isLoading && !queryResults && ( // Show loading specifically for results fetch
                  <ActivityIndicator style={{ marginVertical: 20 }} size="small" color="#1565C0" />
              )}

              {error && !queryResults && ( // Show error if fetch failed
                  <Text style={[styles.errorText, { marginVertical: 10 }]}>{error}</Text>
              )}
              {/* Display LLM Formatted Text Response if available */}
              {llmTextResponse ? (
                  <Text style={styles.llmTextResponse}>{llmTextResponse}</Text>
              ) : queryResults && queryResults.length === 0 && !isLoading ? ( // Handle empty results if no LLM response         
                  <Text style={styles.resultsEmptyText}>No matching records found.</Text>
                ) : queryResults && queryResults.length > 0 && !isLoading ? ( // Fallback to raw results if no LLM response
                  renderFallbackResults(queryResults)
              ) : null}
              
                </View>
              )}
           
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  // (Keep existing styles, but add decorator styles)
  scrollView: {
    flex: 1,
    backgroundColor: 'white',
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20, // More padding for iOS
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
  },
  valueDisplayContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    minHeight: 105,
    justifyContent: 'center',
  },
  valueLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  valueAmount: {
    fontSize: 28,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
    lineHeight: 34,
  },
  valueDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  gainLossText: {
    fontSize: 15,
    fontWeight: '500',
  },
  chartOuterContainer: {
    width: '100%',
    paddingHorizontal: Platform.OS === 'ios' ? 5 : 0, // Add horizontal padding for iOS
  },
  chart: {
    paddingRight: CHART_PADDING_RIGHT,
    paddingLeft: CHART_PADDING_LEFT,
  },
  timeRangeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  timeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  activeTimeButton: {
    backgroundColor: '#1565C0',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  timeButtonText: {
    color: '#333',
    fontWeight: '500',
    fontSize: 13,
  },
  activeTimeButtonText: {
    color: 'white',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  errorText: {
    color: '#D32F2F',
    textAlign: 'center',
    marginBottom: 15,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: 5,
  },
  emptySubText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#1565C0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 12,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  positiveChange: {
    color: '#4CAF50',
  },
  negativeChange: {
    color: '#D32F2F',
  },
  // Styles for Decorator elements
  decoratorLine: {
    position: 'absolute',
    bottom: CHART_MARGIN_VERTICAL,
    width: 2,
    backgroundColor: '#1976D2', // Modern blue
    borderRadius: 1,
    opacity: 0.7,
  },
  decoratorDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#1976D2',
    shadowColor: '#1976D2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  queryBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    maxHeight: Platform.OS === 'ios' ? 60 : 'auto', // Limit height on iOS
  },
  queryInput: {
    flex: 1,
    padding: Platform.OS === 'ios' ? 12 : 10,
    fontSize: Platform.OS === 'ios' ? 16 : 14, // Larger font for iOS
    maxHeight: Platform.OS === 'ios' ? 40 : 'auto', // Limit input height on iOS
  },
  queryButtonText: {
    color: '#1565C0',
    fontWeight: 'bold',
    fontSize: Platform.OS === 'ios' ? 16 : 14, // Larger font for iOS
    paddingHorizontal: Platform.OS === 'ios' ? 12 : 8,
  },
    // Styles for Query Results
    resultsContainer: {
      marginTop: 15,
      marginHorizontal: 10,
      padding: 10,
      backgroundColor: '#f9f9f9',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#eee',
    },
    resultsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    resultsTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: '#333',
      flex: 1, // Allow text to wrap
      marginRight: 10,
    },
    resultsClearButton: {
      fontSize: 13,
      color: '#1565C0',
      fontWeight: '500',
    },
    resultsEmptyText: {
      fontSize: 14,
      color: '#666',
      textAlign: 'center',
      paddingVertical: 15,
    },
    resultsTable: {
      // Basic table structure
    },
    resultsRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
      paddingVertical: 8,
    },
    resultsRowHeader: {
      flexDirection: 'row',
      borderBottomWidth: 2,
      borderBottomColor: '#ddd',
      paddingBottom: 8,
      marginBottom: 5,
      backgroundColor: '#f0f0f0', // Slight background for header
    },
    resultsCell: {
      flex: 1, // Distribute space equally - adjust if needed
      fontSize: 12,
      paddingHorizontal: 4, // Add some spacing
      color: '#444',
    },
    resultsCellHeader: {
      flex: 1,
      fontSize: 12,
      fontWeight: 'bold',
      paddingHorizontal: 4,
      color: '#111',
      textTransform: 'capitalize', // Nicer header text
    },
    llmTextResponse: {
      fontSize: 15,
      lineHeight: 22,
      color: '#333',
      paddingVertical: 10,
    },
});
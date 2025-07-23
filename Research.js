// ResearchTab.js - Dynamic Version with Groq API
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Animated,
  RefreshControl,
  Dimensions,
  StatusBar,
  Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import StandardInput from './components/StandardInput';
import PrimaryButton from './components/PrimaryButton';
import TabSelector from './components/TabSelector';
import InfoCard from './components/InfoCard';
import YFinanceHandler from './yfinance_handler.js';

// Enhanced StockChart with fallback
let StockChart;
try {
  StockChart = require('./components/StockChart').default;
} catch (e) {
  StockChart = ({ data, isDark }) => (
    <View style={[styles.chartPlaceholder, isDark && styles.chartPlaceholderDark]}>
      <Text style={[styles.chartPlaceholderText, isDark && styles.chartPlaceholderTextDark]}>
        📈 Chart visualization coming soon
      </Text>
    </View>
  );
}

const { width: screenWidth } = Dimensions.get('window');

// Dynamic field configurations - can be easily extended
const FIELD_TEMPLATES = {
  Fundamental: [
    { key: "Company Name", icon: "🏢", category: "basic", priority: 1 },
    { key: "Symbol", icon: "📊", category: "basic", priority: 1 },
    { key: "Current Price", icon: "💰", category: "price", priority: 1 },
    { key: "52-Week High/Low", icon: "📈", category: "price", priority: 2 },
    { key: "Market Cap", icon: "🏦", category: "valuation", priority: 1 },
    { key: "P/E Ratio", icon: "📋", category: "valuation", priority: 1 },
    { key: "Earnings Per Share", icon: "💎", category: "profitability", priority: 1 },
    { key: "Return on Equity", icon: "📊", category: "profitability", priority: 2 },
    { key: "Total Revenue", icon: "💸", category: "financial", priority: 1 },
    { key: "Free Cash Flow", icon: "💵", category: "financial", priority: 2 },
    { key: "Total Debt", icon: "⚖️", category: "financial", priority: 2 },
    { key: "Debt to Equity Ratio", icon: "⚡", category: "financial", priority: 2 }
  ],
  Technical: [
    { key: "50-Day Moving Average", icon: "📊", category: "trend", priority: 1 },
    { key: "200-Day Moving Average", icon: "📈", category: "trend", priority: 1 },
    { key: "20-Day EMA", icon: "📉", category: "trend", priority: 2 },
    { key: "RSI", icon: "⚡", category: "momentum", priority: 1 },
    { key: "MACD", icon: "🎯", category: "momentum", priority: 1 },
    { key: "Volume", icon: "📊", category: "volume", priority: 2 },
    { key: "Bollinger Bands", icon: "📈", category: "volatility", priority: 2 },
    { key: "Support Level", icon: "🔽", category: "levels", priority: 2 },
    { key: "Resistance Level", icon: "🔼", category: "levels", priority: 2 }
  ]
};

// Popular stock suggestions
const POPULAR_STOCKS = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'NVDA', 'META', 'NFLX'];

// Groq API Service
class GroqParsingService {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || 'your-groq-api-key';
    this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
  }

  async parseStockData(rawData, fields, stockSymbol) {
    try {
      if (this.apiKey === 'your-groq-api-key') {
          console.warn('Groq API key is not set. Using placeholder. This will fail.');
          throw new Error('Groq API key is not configured.');
      }

      const fieldNames = fields.map(f => f.key).join(', ');
      
      // Truncate rawData to prevent exceeding API limits
      const truncatedRawData = rawData.substring(0, 15000);

      const prompt = `
# ROLE
You are a meticulous, rule-based Financial Data Extraction Specialist. Your ONLY function is to parse raw text data and extract specific values into a structured JSON format according to a strict set of rules. You must not infer, guess, or create data. Your work is precise and verifiable against the source data.

# CONTEXT
- **Stock Symbol:** ${stockSymbol}
- **Requested Fields:** ${fieldNames}
- **Raw Data:** ${truncatedRawData}


# TASK
Extract the data for every field listed in 'Requested Fields' from the 'Raw Data' and return a single, clean JSON object.

# EXECUTION PLAN (CRITICAL)
You must follow this two-step process. Do not output the final JSON until you have completed the internal '[REASONING]' step.

**Step 1: [REASONING] - Internal Monologue**
For EACH field in the 'Requested Fields' list, you will perform the following internal analysis:
1.  **Identify Field:** State the exact field you are currently searching for.
2.  **Locate Value:** Scan the 'Raw Data' for a direct keyword match or a highly common financial synonym (e.g., for "Market Cap" look for "Market Cap", "Mkt Cap", "Market Capitalization"). State the exact key-value pair or line you found in the 'Raw Data' that contains the value.
3.  **Extract Raw Value:** State the exact, raw value you extracted from that line. If no match is found, state "Not Found".
4.  **Apply Formatting:** Based on the 'FORMATTING RULES' below, determine the correct format. State the rule you are applying and the final formatted value. If the value is "Not Found", the formatted value is "N/A".

**Step 2: [FINAL OUTPUT] - JSON Object**
After completing the reasoning for ALL fields, consolidate the final formatted values into a single JSON object. The keys must be the exact strings from the 'Requested Fields' list.

# FORMATTING RULES
- **Currency (e.g., Price, Market Cap, Revenue):** Must be a string starting with "$". For values over 1 billion or 1 trillion, use "B" or "T" as a suffix (e.g., "$250.5B", "$1.2T"). For all other currency values, include two decimal places (e.g., "$150.25").
- **Percentages (e.g., Dividend Yield, Payout Ratio):** Must be a string ending with "%" with one or two decimal places (e.g., "5.2%", "25.55%").
- **Ratios (e.g., P/E, P/S, RSI, Beta):** Must be a number with two decimal places (e.g., "15.75", "1.20").
- **Volume:** Must be an integer with commas as thousand separators (e.g., "1,250,000").
- **General Numbers:** Use appropriate prefixes/suffixes where logical but default to a number with two decimal places.
- **Not Found:** If a value cannot be located in the 'Raw Data', the value in the JSON MUST be the string "N/A".

# OUTPUT SPECIFICATIONS
- The final output MUST be a single, valid JSON object enclosed in a code block.
- Do not include the '[REASONING]' step in the final output. It is your internal guide only.

WRONG EXAMPLES (DO NOT DO):
{
  "Current Price": "** $713",
  "Market Cap": "** $1",
  "Debt to Equity Ratio": "** $49"
}

Return ONLY the JSON object with complete, properly formatted values, no additional text or symbols.`;

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-maverick-17b-128e-instruct', // Using your suggested model
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1, // Low temperature for consistent parsing
          max_tokens: 2048,
          // Alternative 1: Enforce JSON output from the API
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Groq API Error Body:", errorBody);
        throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      let content = data.choices[0]?.message?.content?.trim();

      if (!content) {
        throw new Error('No content received from Groq API');
      }

      // Alternative 2: Robustly find and extract the JSON from the response string
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch && jsonMatch[0]) {
          content = jsonMatch[0];
      } else {
          console.warn('Could not find a JSON object in the response. Attempting to parse directly.');
      }

      console.log('Cleaned Groq response:', content);

      // Parse the JSON response
      try {
        const parsedData = JSON.parse(content);

        // Post-process to clean up any remaining formatting issues
        const cleanedData = {};
        Object.entries(parsedData).forEach(([key, value]) => {
          if (typeof value === 'string') {
            // Remove any remaining ** prefixes and clean whitespace
            let cleanValue = value.replace(/^\*\*\s*/, '').trim();

            // Special handling for ratios - ensure they don't have dollar signs
            if (key.toLowerCase().includes('ratio') || key.toLowerCase().includes('roe')) {
              cleanValue = cleanValue.replace(/^\$/, ''); // Remove leading $
              if (!cleanValue.includes('%') && !isNaN(parseFloat(cleanValue)) && parseFloat(cleanValue) < 10) {
                // If it's a decimal ratio, could add % for display
                if (parseFloat(cleanValue) < 1) {
                  cleanValue = (parseFloat(cleanValue) * 100).toFixed(1) + '%';
                }
              }
            }

            cleanedData[key] = cleanValue;
          } else {
            cleanedData[key] = value;
          }
        });

        console.log('Final cleaned Groq data:', cleanedData);
        return cleanedData;

      } catch (jsonError) {
        console.warn('JSON parsing failed, attempting manual extraction:', jsonError);
        console.warn('Raw content that failed to parse:', content);
        return this.fallbackParsing(rawData, fields);
      }

    } catch (error) {
      console.error('Groq parsing error:', error);
      // Fallback to simple regex parsing
      return this.fallbackParsing(rawData, fields);
    }
  }

  // Fallback parsing method using simple patterns - IMPROVED
  fallbackParsing(rawData, fields) {
    console.log('Using improved fallback parsing method');
    const result = {};

    fields.forEach(field => {
      const key = field.key;
      let value = 'N/A';

      try {
        // More robust regex to find the key and capture the value after it, ignoring extra text.
        const pattern = new RegExp(`(?:${this.escapeRegex(key)})\\s*[:*]*\\s*([^\\n\\r]+)`, 'i');
        const match = rawData.match(pattern);

        if (match && match[1]) {
          let extractedValue = match[1].trim();
          
          // Clean up the extracted value
          // Remove leading symbols, parenthetical text, etc.
          extractedValue = extractedValue.replace(/^\(?[^0-9$]*/, '').trim();
          // Stop at the first word that doesn't belong (like 'Trailing')
          extractedValue = extractedValue.split(/\s+/)[0];
          // Remove any trailing non-numeric characters (except for B, M, T, K for large numbers)
          extractedValue = extractedValue.replace(/[^0-9.,BMTK]$/, '');

          value = extractedValue;
        }
      } catch (e) {
        console.warn(`Regex error during fallback for ${key}:`, e.message);
      }
      
      result[key] = value;
    });
    console.log('Fallback parsing result:', result);
    return result;
  }


  // Helper method to escape regex special characters
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

const ResearchTab = () => {
  // State management
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('Fundamental');
  const [researchData, setResearchData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [parsingMethod, setParsingMethod] = useState('groq'); // 'groq' or 'fallback'

  // Animation values
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];
  const scaleAnim = useState(new Animated.Value(0.95))[0];

  // Initialize Groq service
  const groqService = useMemo(() => new GroqParsingService(), []);

  // Auto-hide suggestions
  useEffect(() => {
    setShowSuggestions(searchQuery.length === 0);
  }, [searchQuery]);

  // Animate content on load
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Dynamic query builder
  const buildQueryString = useCallback(() => {
    const ticker = searchQuery.trim().toUpperCase();
    if (!ticker) return '';

    const fields = FIELD_TEMPLATES[selectedTemplate].map(f => f.key);
    return `For ${ticker}, provide the following ${selectedTemplate.toLowerCase()} analysis data:\n${fields.join('\n')}`;
  }, [searchQuery, selectedTemplate]);

  // Helper function to format values - FIXED
  const formatFieldValue = (value, key) => {
    // Check for object and handle it first
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle specific known object structures like {Upper, Lower}
        if ('Upper' in value && 'Lower' in value) {
             const upper = isNaN(parseFloat(value.Upper)) ? value.Upper : parseFloat(value.Upper).toFixed(2);
             const lower = isNaN(parseFloat(value.Lower)) ? value.Lower : parseFloat(value.Lower).toFixed(2);
            return `${upper} / ${lower}`;
        }
        // Fallback for unexpected objects to prevent crash
        return JSON.stringify(value);
    }

    if (value === 'N/A' || value === null || value === undefined) return 'N/A';
    
    // Handle strings that represent a range
    if (typeof value === 'string' && value.includes('/')) {
        return value; // Assume it's already formatted
    }

    let cleanValue = String(value).replace(/,/g, '');
    const num = parseFloat(cleanValue);

    if (isNaN(num)) return value;

    const keyLower = key.toLowerCase();

    if (keyLower.includes('price') || keyLower.includes('revenue') || keyLower.includes('market cap') || keyLower.includes('cash flow') || keyLower.includes('debt') || keyLower.includes('per share')) {
        if (Math.abs(num) >= 1.0e+12) return `$${(num / 1.0e+12).toFixed(2)}T`;
        if (Math.abs(num) >= 1.0e+9) return `$${(num / 1.0e+9).toFixed(2)}B`;
        if (Math.abs(num) >= 1.0e+6) return `$${(num / 1.0e+6).toFixed(2)}M`;
        return `$${num.toFixed(2)}`;
    }

    if (keyLower.includes('ratio') || keyLower.includes('return on equity')) {
        if (keyLower.includes('debt to equity ratio') && num > 10) { // Often returned as percentage
             return (num / 100).toFixed(2);
        }
        return num.toFixed(2);
    }
    
    if (keyLower.includes('volume')) {
        return Math.round(num).toLocaleString();
    }

    return String(value);
  };

  // Enhanced submit handler with Groq parsing
  const handleSubmit = async () => {
    const queryString = buildQueryString();
    if (!queryString) {
      setError('Please enter a valid ticker symbol.');
      return;
    }

    setIsLoading(true);
    setError('');
    setResearchData(null);

    try {
      const yfinanceHandler = new YFinanceHandler();
      const response = await yfinanceHandler.processQuery(queryString);

      if (response.type === 'error' || !response.content) {
        throw new Error(response.error || 'No data found for your query.');
      }

      // Get content to parse
      let contentToSearch = '';
      if (typeof response.content === 'string') {
        contentToSearch = response.content;
      } else if (typeof response.content === 'object') {
        contentToSearch = JSON.stringify(response.content);
      } else {
        contentToSearch = String(response.content);
      }

      console.log('Raw response content:', contentToSearch);

      // Use Groq for intelligent parsing
      const currentFields = FIELD_TEMPLATES[selectedTemplate];
      let parsedData;

      if (parsingMethod === 'groq') {
        try {
          parsedData = await groqService.parseStockData(
            contentToSearch,
            currentFields,
            searchQuery.trim().toUpperCase()
          );
        } catch (groqError) {
          console.warn('Groq parsing failed, using fallback:', groqError);
          setParsingMethod('fallback');
          parsedData = groqService.fallbackParsing(contentToSearch, currentFields);
        }
      } else {
        parsedData = groqService.fallbackParsing(contentToSearch, currentFields);
      }

      // Transform parsed data to include metadata and format values
      const enrichedData = {};
      currentFields.forEach(field => {
        const rawValue = parsedData[field.key] || 'N/A';
        const formattedValue = formatFieldValue(rawValue, field.key);

        enrichedData[field.key] = {
          value: formattedValue,
          icon: field.icon,
          category: field.category,
          priority: field.priority
        };
      });

      console.log('Final enriched data:', enrichedData);

      // Check if we got meaningful data
      const hasValidData = Object.values(enrichedData).some(field =>
        field.value && field.value !== 'N/A' && field.value.trim() !== ''
      );

      if (!hasValidData) {
        setError(`No meaningful data could be extracted. This might be due to:\n• Invalid ticker symbol\n• API limitations\n• Temporary service issues\n\nTry a different symbol or try again later.`);
        setIsLoading(false);
        return;
      }

      setResearchData(enrichedData);
      setLastUpdated(new Date());
      setShowSuggestions(false);

      // Success animation
      Animated.spring(scaleAnim, {
        toValue: 1.05,
        useNativeDriver: true,
      }).start(() => {
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
        }).start();
      });

    } catch (err) {
      console.error('Submit error:', err);
      setError(`Error: ${err.message}\n\nTroubleshooting:\n• Check your internet connection\n• Verify the ticker symbol\n• Try again in a few moments`);

      // Error shake animation
      const shakeAnimation = Animated.sequence([
        Animated.timing(slideAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]);
      shakeAnimation.start();
    } finally {
      setIsLoading(false);
    }
  };

  // Pull to refresh handler
  const onRefresh = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setRefreshing(true);
    await handleSubmit();
    setRefreshing(false);
  }, [searchQuery, handleSubmit]);

  // Quick stock selection
  const handleQuickSelect = (ticker) => {
    setSearchQuery(ticker);
    setShowSuggestions(false);
  };

  // Retry handler
  const handleRetry = () => {
    setError('');
    handleSubmit();
  };

  // Toggle parsing method
  const toggleParsingMethod = () => {
    const newMethod = parsingMethod === 'groq' ? 'fallback' : 'groq';
    setParsingMethod(newMethod);
    Alert.alert(
      'Parsing Method Changed',
      `Switched to ${newMethod === 'groq' ? 'Groq AI' : 'Basic Fallback'} parsing method.`
    );
  };

  // Group data by category with priority sorting
  const groupedData = useMemo(() => {
    if (!researchData) return {};

    const grouped = {};
    Object.entries(researchData).forEach(([key, data]) => {
      const category = data.category || 'other';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push({ key, ...data });
    });

    // Sort within categories by priority
    Object.keys(grouped).forEach(category => {
      grouped[category].sort((a, b) => (a.priority || 3) - (b.priority || 3));
    });

    return grouped;
  }, [researchData]);

  // Category titles mapping
  const categoryTitles = {
    basic: '📋 Basic Information',
    price: '💰 Price Data',
    valuation: '📊 Valuation Metrics',
    profitability: '💎 Profitability',
    financial: '💸 Financial Health',
    trend: '📈 Trend Analysis',
    momentum: '⚡ Momentum Indicators',
    volume: '📊 Volume Analysis',
    volatility: '📊 Volatility Metrics',
    levels: '🎯 Support & Resistance'
  };

  // Theme styles
  const themeStyles = isDarkMode ? darkThemeStyles : lightThemeStyles;

  return (
    <ScrollView
      contentContainerStyle={[styles.container, themeStyles.container]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#007AFF', '#34C759']}
          tintColor={isDarkMode ? '#ffffff' : '#000000'}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={isDarkMode ? '#1a1a1a' : '#ffffff'}
      />

      {/* Header with gradient */}
      <LinearGradient
        colors={isDarkMode ? ['#2c2c2c', '#1a1a1a'] : ['#f8f9fa', '#ffffff']}
        style={styles.header}
      >
        <Animated.View
          style={[
            styles.titleContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          <Text style={[styles.title, themeStyles.title]}>
            🤖 AI Stock Research Hub
          </Text>
          <Text style={[styles.subtitle, themeStyles.subtitle]}>
            Powered by AI for dynamic market analysis
          </Text>
        </Animated.View>

        {/* Theme Toggle */}
        <TouchableOpacity
          style={[styles.themeToggle, themeStyles.themeToggle]}
          onPress={() => setIsDarkMode(!isDarkMode)}
        >
          <Text style={styles.themeToggleText}>
            {isDarkMode ? '☀️' : '🌙'}
          </Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Parsing Method Indicator */}
      <TouchableOpacity
        style={[styles.parsingIndicator, themeStyles.parsingIndicator]}
        onPress={toggleParsingMethod}
      >
        <Text style={[styles.parsingText, themeStyles.parsingText]}>
          {parsingMethod === 'groq' ? '🤖 AI Parsing' : '⚙️ Basic Parsing'} (Tap to switch)
        </Text>
      </TouchableOpacity>

      {/* Search Section */}
      <Animated.View
        style={[
          styles.searchSection,
          themeStyles.searchSection,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }]
          }
        ]}
      >
        <StandardInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Enter ticker symbol (e.g., AAPL, GOOGL)"
          style={[styles.input, themeStyles.input]}
          placeholderTextColor={isDarkMode ? '#888' : '#666'}
        />

        {/* Quick Select Chips */}
        {showSuggestions && (
          <Animated.View style={[styles.suggestionsContainer, { opacity: fadeAnim }]}>
            <Text style={[styles.suggestionsTitle, themeStyles.suggestionsTitle]}>
              Popular Stocks:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipsContainer}>
                {POPULAR_STOCKS.map((ticker) => (
                  <TouchableOpacity
                    key={ticker}
                    style={[styles.chip, themeStyles.chip]}
                    onPress={() => handleQuickSelect(ticker)}
                  >
                    <Text style={[styles.chipText, themeStyles.chipText]}>
                      {ticker}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        )}
      </Animated.View>

      {/* Template Selector */}
      <Animated.View
        style={[
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}
      >
        <TabSelector
          options={['Fundamental', 'Technical']}
          selected={selectedTemplate}
          onSelect={setSelectedTemplate}
          style={[styles.tabSelector, themeStyles.tabSelector]}
        />
      </Animated.View>

      {/* Action Button */}
      <Animated.View
        style={[
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
        ]}
      >
        <PrimaryButton
          title={isLoading ? "🤖 AI Analyzing..." : "🔍 Get AI Research"}
          onPress={handleSubmit}
          disabled={isLoading || !searchQuery.trim()}
          style={[
            styles.button,
            themeStyles.button,
            (isLoading || !searchQuery.trim()) && styles.buttonDisabled
          ]}
        />
      </Animated.View>

      {/* Loading State */}
      {isLoading && (
        <Animated.View style={[styles.loadingContainer, { opacity: fadeAnim }]}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={[styles.loadingText, themeStyles.loadingText]}>
            🤖 AI is analyzing market data...
          </Text>
          <Text style={[styles.loadingSubtext, themeStyles.loadingSubtext]}>
            Using {parsingMethod === 'groq' ? 'Groq AI' : 'fallback parsing'} method
          </Text>
        </Animated.View>
      )}

      {/* Error State */}
      {!!error && (
        <Animated.View
          style={[
            styles.errorContainer,
            themeStyles.errorContainer,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
          ]}
        >
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={[styles.error, themeStyles.error]}>{error}</Text>
          <View style={styles.errorActions}>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>🔄 Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.switchButton} onPress={toggleParsingMethod}>
              <Text style={styles.switchButtonText}>🔄 Switch Method</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Results Section */}
      {!!researchData && (
        <Animated.View
          style={[
            styles.resultsContainer,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
          ]}
        >
          {/* Status Info */}
          <View style={[styles.statusContainer, themeStyles.statusContainer]}>
            <Text style={[styles.statusText, themeStyles.statusText]}>
              ✅ Parsed {Object.keys(researchData).length} fields using {parsingMethod === 'groq' ? 'AI' : 'basic'} method
            </Text>
            {lastUpdated && (
              <Text style={[styles.lastUpdated, themeStyles.lastUpdated]}>
                Last updated: {lastUpdated.toLocaleTimeString()}
              </Text>
            )}
          </View>

          {/* Grouped Data Display */}
          {Object.entries(groupedData).map(([category, items]) => (
            <View key={category} style={styles.categorySection}>
              <Text style={[styles.categoryTitle, themeStyles.categoryTitle]}>
                {categoryTitles[category] || category.toUpperCase()}
              </Text>
              <View style={styles.categoryGrid}>
                {items.map(({ key, value, icon, priority }) => (
                  <Animated.View
                    key={key}
                    style={[
                      styles.enhancedInfoCard,
                      themeStyles.enhancedInfoCard,
                      priority === 1 && styles.highPriorityCard,
                      { transform: [{ scale: scaleAnim }] }
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardIcon}>{icon || '📊'}</Text>
                      <Text style={[styles.cardTitle, themeStyles.cardTitle]}>
                        {key}
                      </Text>
                      {priority === 1 && <Text style={styles.priorityBadge}>⭐</Text>}
                    </View>
                    <Text style={[
                      styles.cardValue,
                      themeStyles.cardValue,
                      value === 'N/A' && styles.cardValueNA
                    ]}>
                      {value || 'N/A'}
                    </Text>
                  </Animated.View>
                ))}
              </View>
            </View>
          ))}

          {/* Chart Section for Technical Analysis */}
          {selectedTemplate === 'Technical' && (
            <Animated.View
              style={[
                styles.chartSection,
                themeStyles.chartSection,
                { opacity: fadeAnim }
              ]}
            >
              <Text style={[styles.chartTitle, themeStyles.chartTitle]}>
                📊 Technical Chart
              </Text>
              <StockChart data={researchData} isDark={isDarkMode} />
            </Animated.View>
          )}
        </Animated.View>
      )}
    </ScrollView>
  );
};

// Enhanced Styles
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    position: 'relative',
  },
  titleContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  themeToggle: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeToggleText: {
    fontSize: 20,
  },
  parsingIndicator: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e3f2fd',
    borderRadius: 20,
    alignSelf: 'center',
  },
  parsingText: {
    fontSize: 12,
    color: '#1976d2',
    fontWeight: '600',
  },
  searchSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  input: {
    marginBottom: 12,
    fontSize: 16,
  },
  suggestionsContainer: {
    marginTop: 8,
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  chipsContainer: {
    flexDirection: 'row',
    paddingRight: 20,
  },
  chip: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#bbdefb',
  },
  chipText: {
    color: '#1976d2',
    fontSize: 14,
    fontWeight: '600',
  },
  tabSelector: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  button: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    paddingVertical: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: '#999',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 20,
    marginHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  error: {
    color: '#d32f2f',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
  },
  retryButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  switchButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  switchButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  resultsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  statusContainer: {
    backgroundColor: '#e8f5e8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
  },
  statusText: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600',
  },
  lastUpdated: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  enhancedInfoCard: {
    width: (screenWidth - 60) / 2,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  highPriorityCard: {
    borderLeftColor: '#FF6B35',
    borderLeftWidth: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    flex: 1,
  },
  priorityBadge: {
    fontSize: 12,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  cardValueNA: {
    color: '#999',
    fontStyle: 'italic',
  },
  chartSection: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  chartTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
  },
  chartPlaceholder: {
    height: 200,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e9ecef',
    borderStyle: 'dashed',
  },
  chartPlaceholderText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
});

// Dark Theme Styles
const darkThemeStyles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
  },
  title: {
    color: '#ffffff',
  },
  subtitle: {
    color: '#cccccc',
  },
  themeToggle: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  parsingIndicator: {
    backgroundColor: '#333333',
  },
  parsingText: {
    color: '#64b5f6',
  },
  searchSection: {
    backgroundColor: '#2c2c2c',
  },
  input: {
    backgroundColor: '#333333',
    color: '#ffffff',
  },
  suggestionsTitle: {
    color: '#cccccc',
  },
  chip: {
    backgroundColor: '#333333',
    borderColor: '#555555',
  },
  chipText: {
    color: '#64b5f6',
  },
  tabSelector: {
    backgroundColor: '#2c2c2c',
  },
  button: {
    backgroundColor: '#007AFF',
  },
  loadingText: {
    color: '#cccccc',
  },
  loadingSubtext: {
    color: '#999999',
  },
  errorContainer: {
    backgroundColor: '#332c2c',
    borderLeftColor: '#f44336',
  },
  error: {
    color: '#ff6b6b',
  },
  statusContainer: {
    backgroundColor: '#2c3e2c',
    borderLeftColor: '#66bb6a',
  },
  statusText: {
    color: '#81c784',
  },
  lastUpdated: {
    color: '#888888',
  },
  categoryTitle: {
    color: '#ffffff',
  },
  enhancedInfoCard: {
    backgroundColor: '#2c2c2c',
    borderLeftColor: '#64b5f6',
  },
  cardTitle: {
    color: '#cccccc',
  },
  cardValue: {
    color: '#ffffff',
  },
  chartSection: {
    backgroundColor: '#2c2c2c',
  },
  chartTitle: {
    color: '#ffffff',
  },
  chartPlaceholder: {
    backgroundColor: '#333333',
    borderColor: '#555555',
  },
  chartPlaceholderText: {
    color: '#cccccc',
  },
});

// Light Theme Styles (default)
const lightThemeStyles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
  },
  title: {
    color: '#1a1a1a',
  },
  subtitle: {
    color: '#666666',
  },
  themeToggle: {
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  parsingIndicator: {
    backgroundColor: '#e3f2fd',
  },
  parsingText: {
    color: '#1976d2',
  },
  searchSection: {
    backgroundColor: '#f8f9fa',
  },
  input: {
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
  },
  suggestionsTitle: {
    color: '#666666',
  },
  chip: {
    backgroundColor: '#e3f2fd',
    borderColor: '#bbdefb',
  },
  chipText: {
    color: '#1976d2',
  },
  tabSelector: {
    backgroundColor: '#ffffff',
  },
  button: {
    backgroundColor: '#007AFF',
  },
  loadingText: {
    color: '#666666',
  },
  loadingSubtext: {
    color: '#999999',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    borderLeftColor: '#f44336',
  },
  error: {
    color: '#d32f2f',
  },
  statusContainer: {
    backgroundColor: '#e8f5e8',
    borderLeftColor: '#4caf50',
  },
  statusText: {
    color: '#2e7d32',
  },
  lastUpdated: {
    color: '#888888',
  },
  categoryTitle: {
    color: '#1a1a1a',
  },
  enhancedInfoCard: {
    backgroundColor: '#ffffff',
    borderLeftColor: '#007AFF',
  },
  cardTitle: {
    color: '#666666',
  },
  cardValue: {
    color: '#1a1a1a',
  },
  chartSection: {
    backgroundColor: '#ffffff',
  },
  chartTitle: {
    color: '#1a1a1a',
  },
  chartPlaceholder: {
    backgroundColor: '#f8f9fa',
    borderColor: '#e9ecef',
  },
  chartPlaceholderText: {
    color: '#666666',
  },
});

export default ResearchTab;

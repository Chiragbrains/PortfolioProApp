// RAGChatbox.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Dimensions, Pressable,
  Switch
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSupabaseConfig } from './SupabaseConfigContext';
import { generateEmbedding } from './services/embeddingService';
import { searchRelevantContext } from './services/vectorSearchService';
import { getRagLLMResponse, formatSQLResultsForChat } from './services/ragLlmService';
import { saveContextToDatabase } from './services/contextStorageService';

const screenHeight = Dimensions.get('window').height;

const RAGChatbox = ({ onClose }) => {
  const [messages, setMessages] = useState([
    { id: 'rag-1', role: 'assistant', content: 'Hello! How can I help you with your portfolio today? (RAG Enabled)', mode: 'standard' },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRAGEnabled, setIsRAGEnabled] = useState(true);
  const scrollViewRef = useRef();
  const { supabaseClient } = useSupabaseConfig();

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const fetchPortfolioDataFromSupabase = async (sqlQuery) => {
    if (!supabaseClient) throw new Error("Supabase client not available.");
    if (!sqlQuery || typeof sqlQuery !== 'string' || !sqlQuery.trim().toUpperCase().startsWith('SELECT')) {
      throw new Error("Invalid or non-SELECT SQL query provided.");
    }
    const { data, error } = await supabaseClient.rpc('execute_sql', { sql_query: sqlQuery });
    if (error) {
      console.error("Supabase RPC error executing SQL:", error);
      throw new Error(`Database query failed: ${error.message}`);
    }
    return data || [];
  };

  const handleSend = async () => {
    const userQuery = inputText.trim();
    if (userQuery.length === 0 || isLoading) return;

    setMessages(prevMessages => [...prevMessages, {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: userQuery
    }]);
    setInputText('');
    setIsLoading(true);

    try {
      let finalAnswer;

      if (isRAGEnabled) {
        const queryEmbedding = await generateEmbedding(userQuery);
        if (!queryEmbedding) {
          throw new Error("Could not generate query embedding");
        }

        const relevantContext = await searchRelevantContext(queryEmbedding);
        if (relevantContext && relevantContext.sql) {
          try {
            const sqlResults = await fetchPortfolioDataFromSupabase(relevantContext.sql);
            finalAnswer = await formatSQLResultsForChat(userQuery, relevantContext.sql, sqlResults);
            mode = 'rag-sql';
          } catch (sqlError) {
            console.error("SQL execution error:", sqlError);
            finalAnswer = `Error executing the query: ${sqlError.message}`;
            mode = 'error';
          }
        } else {
          // Fallback to standard RAG
          finalAnswer = await getRagLLMResponse(userQuery, relevantContext?.data || []);
          mode = 'rag-embedding';
        }
      } else {
        // Standard AI mode
        finalAnswer = await getRagLLMResponse(userQuery, []);
        mode = 'standard';
      }

      setMessages(prevMessages => [...prevMessages, {
        id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: finalAnswer || "I apologize, but I couldn't process that request.",
        mode: mode
      }]);

    } catch (error) {
      console.error("Error in handleSend:", error);
      let errorMessage = "Sorry, an error occurred while processing your request.";
      
      if (error.message.includes("Supabase client not available")) {
        errorMessage = "Database connection is not available. Please try again later.";
      } else if (error.message.includes("embedding")) {
        errorMessage = "There was an issue processing your question. Please try rephrasing it.";
      } else if (error.message.includes("API")) {
        errorMessage = "There was an issue connecting to the AI service. Please try again later.";
      }
      
      setMessages(prevMessages => [...prevMessages, {
        id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: errorMessage,
        mode: 'error'
      }]);
    } finally {
      setIsLoading(false);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  };

  // FormattedLLMResponse component for formatting messages with P&L values and ticker symbols
  const FormattedLLMResponse = ({ text }) => {
    if (!text) return null;
    const lines = text.split('\n');

    const renderTextWithPL = (lineText) => {
      const pnlRegex = /(-\$?\s*[\d,]+\.\d{2}\s*,\s*-?\s*\d+\.?\d*\s*%|\$?\s*[\d,]+\.\d{2}\s*,\s*\+?\s*\d+\.?\d*\s*%)/g;
      const pnlParts = lineText.split(pnlRegex);

      return pnlParts.map((pnlPart, pnlIndex) => {
        if (pnlPart && pnlPart.match(pnlRegex)) {
          const isNegative = pnlPart.startsWith('-') || pnlPart.includes(' -');
          return <Text key={`pnl-${pnlIndex}`} style={isNegative ? styles.negativeChange : styles.positiveChange}>{pnlPart}</Text>;
        } else if (pnlPart) {
          const tickerSplitRegex = /(\b[A-Z]{2,5}\b|\([A-Z]{1,5}\)|(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*))/g;
          const textParts = pnlPart.split(tickerSplitRegex);
          
          return textParts.map((textPart, textIndex) => {
            if (textPart && textPart.match(tickerSplitRegex)) {
              let tickerSymbol = textPart;
              let openParen = '';
              let closeParen = '';
              
              if (textPart.startsWith('(') && textPart.endsWith(')')) {
                tickerSymbol = textPart.substring(1, textPart.length - 1);
                openParen = '(';
                closeParen = ')';
              }

              return (
                <Text key={`ticker-${pnlIndex}-${textIndex}`}>
                  {openParen}
                  <Text style={{ fontWeight: 'bold' }}>{tickerSymbol}</Text>
                  {closeParen}
                </Text>
              );
            }
            return <Text key={`text-${pnlIndex}-${textIndex}`}>{textPart}</Text>;
          }).filter(Boolean);
        }
        return null;
      }).filter(Boolean);
    };

    return (
      <View style={styles.llmTextResponseContainer}>
        {lines.map((line, index) => {
          line = line.trim();
          if (line.startsWith('* ')) {
            return (
              <View key={index} style={styles.bulletItemContainer}>
                <Text style={styles.bulletPoint}>•</Text>
                <Text style={styles.bulletText}>
                  {renderTextWithPL(line.substring(2))}
                </Text>
              </View>
            );
          } else if (line.length > 0) {
            return (
              <Text key={index} style={styles.llmParagraph}>
                {renderTextWithPL(line)}
              </Text>
            );
          }
          return null;
        })}
      </View>
    );
  };

  return (
    <View style={styles.chatboxContainer}>
      <LinearGradient
        colors={['#2A0B4A', '#3B0764', '#1A1A2E']}
        start={{ x: 0, y: 0 }} 
        end={{ x: 1, y: 1 }}
        style={styles.topBar}
      >
        <Pressable style={styles.topBarPressable} onPress={onClose}>
          <View style={styles.topBarContent}>
            <Text style={styles.topBarTitle}>Portfolio Chat</Text>
            <View style={styles.toggleContainer}>
              <Text style={styles.toggleLabel}>RAG</Text>
              <Switch
                value={isRAGEnabled}
                onValueChange={setIsRAGEnabled}
                trackColor={{ false: '#767577', true: '#8A2BE2' }}
                thumbColor={isRAGEnabled ? '#f4f3f4' : '#f4f3f4'}
                ios_backgroundColor="#3e3e3e"
              />
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </Pressable>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingViewInternal}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <View style={styles.chatContainer}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContentContainer}
          >
            {messages.map(msg => (
              <View
                key={msg.id}
                style={[
                  styles.messageBubble,
                  msg.role === 'user' ? styles.userMessage : (msg.mode && msg.mode.startsWith('rag') ? styles.ragBotMessage : styles.botMessage),
                ]}
              >
                {msg.role === 'assistant' && msg.content ? (
                  <FormattedLLMResponse text={msg.content} />
                ) : (
                  <Text style={msg.role === 'user' ? styles.userMessageText : styles.botMessageText}>
                    {msg.content}
                  </Text>
                )}
                {msg.role === 'assistant' && msg.mode && (
                  <View style={styles.modeIndicator}>
                    <Text style={styles.modeIndicatorText}>
                      {msg.mode === 'rag-sql' ? 'SQL RAG' :
                       msg.mode === 'rag-embedding' ? 'Embedding RAG' :
                       msg.mode === 'standard' ? 'Standard AI' :
                       msg.mode === 'error' ? 'Error' : ''}
                    </Text>
                  </View>
                )}
              </View>
            ))}
            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#8A2BE2" />
                <Text style={styles.thinkingText}>Processing...</Text>
              </View>
            )}
          </ScrollView>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask about your portfolio..."
              placeholderTextColor="rgba(0,0,0,0.4)"
              onSubmitEditing={handleSend}
              returnKeyType="send"
              editable={!isLoading}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendButton, isLoading && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={isLoading}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// Styles that match GeneralChatbox with some RAG-specific overrides
const styles = StyleSheet.create({
  chatboxContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    flexDirection: 'column'
  },
  topBar: {
    height: 70,
    paddingHorizontal: 20,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
  },
  messagesContentContainer: {
    padding: 15,
    paddingBottom: 20,
  },
  messageBubble: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    marginBottom: 12,
    maxWidth: '85%',
    minWidth: '20%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userMessage: {
    backgroundColor: '#1565C0',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 5,
  },
  botMessage: {
    backgroundColor: '#F5F5F5',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 5,
  },
  ragBotMessage: {
    backgroundColor: '#E8F0F9',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 5,
    borderColor: '#C9DDF0',
    borderWidth: 1,
  },
  userMessageText: {
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  botMessageText: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 22,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 15,
    borderTopColor: '#E0E7F1',
    backgroundColor: '#FFFFFF',
    padding: 1,
  },
  input: {
    flex: 1,
    color: '#000000',
    fontSize: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 5,
    marginRight: 20,
    minHeight: 48,
    maxHeight: 120,
  },
  sendButton: {
    marginLeft: 20,
    backgroundColor: '#10b981',
    borderRadius: 24,
    padding: 12,
    minWidth: 90,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#BFBFDF',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loadingContainer: {
    alignSelf: 'flex-start',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thinkingText: {
    marginLeft: 10,
    color: '#555',
  },
  topBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
    paddingVertical: 12,
  },
  topBarTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  toggleLabel: {
    color: '#fff',
    marginRight: 8,
    fontSize: 14,
  },
  closeButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    marginLeft: 12,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modeIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modeIndicatorText: {
    fontSize: 10,
    color: 'rgba(0, 0, 0, 0.6)',
    fontWeight: '500',
  },
  // Message formatting styles
  llmTextResponseContainer: {
    paddingVertical: 8,
  },
  llmParagraph: {
    fontSize: 16,
    lineHeight: 24,
    color: '#222',
    marginBottom: 8,
  },
  bulletItemContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingLeft: 8,
  },
  bulletPoint: {
    fontSize: 16,
    lineHeight: 24,
    color: '#00529B',
    marginRight: 8,
    fontWeight: 'bold',
  },
  bulletText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: '#222',
  },
  positiveChange: {
    color: '#2E7D32',
    fontWeight: '500',
  },
  negativeChange: {
    color: '#C62828',
    fontWeight: '500',
  },
});

export default RAGChatbox;
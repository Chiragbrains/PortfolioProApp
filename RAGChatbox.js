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
// Import a shared FormattedLLMResponse component if you have one, or define it here/inline
// For now, we'll use a simpler text display.

const screenHeight = Dimensions.get('window').height;

const RAGChatbox = ({ onClose }) => {
  const [messages, setMessages] = useState([
    { id: 'rag-1', text: 'Hello! How can I help you with your portfolio today? (RAG Enabled)', sender: 'bot' },
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
    // Using the generic rpc 'execute_sql' if you have it, or a specific one for portfolio_summary
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

    const newUserMessage = { id: String(Date.now()), text: userQuery, sender: 'user' };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setInputText('');
    setIsLoading(true);

    let botResponse = { id: String(Date.now() + 1), text: "Thinking...", sender: 'bot' };
    setMessages(prevMessages => [...prevMessages, botResponse]);

    try {
      if (isRAGEnabled) {
        // RAG mode logic
        const queryEmbedding = await generateEmbedding(userQuery);
        if (!queryEmbedding) {
          throw new Error("Could not generate embedding for the query. Please try again.");
        }

        const { results: retrievedContexts } = await searchRelevantContext(supabaseClient, queryEmbedding, userQuery, 5, 0.65);
        if (!retrievedContexts || retrievedContexts.length === 0) {
          console.warn("No relevant context found for the query.");
        }

        const llmDecision = await getRagLLMResponse(userQuery, retrievedContexts || []);

        let finalAnswer = "Sorry, I encountered an issue.";
        let sqlQuery = null;
        let sqlResults = null;

        if (llmDecision.type === 'sql') {
          try {
            sqlQuery = llmDecision.content;
            // Remove the SQL query display
            botResponse = { ...botResponse, text: "Fetching data..." };
            setMessages(prevMessages => prevMessages.map(m => m.id === botResponse.id ? botResponse : m));

            sqlResults = await fetchPortfolioDataFromSupabase(sqlQuery);
            if (!sqlResults || sqlResults.length === 0) {
              finalAnswer = "No data was found for your query.";
            } else {
              finalAnswer = await formatSQLResultsForChat(userQuery, sqlQuery, sqlResults);
            }
          } catch (sqlError) {
            console.error("SQL execution error:", sqlError);
            finalAnswer = `Error executing the query: ${sqlError.message}`;
          }
        } else if (llmDecision.type === 'text') {
          finalAnswer = llmDecision.content;
        } else if (llmDecision.type === 'unanswerable') {
          finalAnswer = llmDecision.content;
        } else if (llmDecision.type === 'error') {
          finalAnswer = llmDecision.content;
        }

        // 4. Save the question and answer to the context table
        const saveResult = await saveContextToDatabase(supabaseClient, {
          userQuery,
          finalAnswer,
          sqlQuery,
          sqlResults
        });

        if (!saveResult.saved && saveResult.existingMatch) {
          console.log('Using existing answer from database');
          // Use the existing answer if it's a very similar question
          if (saveResult.existingMatch.metadata?.answer) {
            finalAnswer = saveResult.existingMatch.metadata.answer;
          }
        }

        botResponse = { ...botResponse, text: finalAnswer };
      } else {
        // Standard AI mode logic
        const llmDecision = await getRagLLMResponse(userQuery, []);
        // ... rest of standard AI logic ...
      }

    } catch (error) {
      console.error("Error in RAG handleSend:", error);
      let errorMessage = "Sorry, an error occurred while processing your request.";
      
      if (error.message.includes("Supabase client not available")) {
        errorMessage = "Database connection is not available. Please try again later.";
      } else if (error.message.includes("embedding")) {
        errorMessage = "There was an issue processing your question. Please try rephrasing it.";
      } else if (error.message.includes("API")) {
        errorMessage = "There was an issue connecting to the AI service. Please try again later.";
      }
      
      botResponse = { ...botResponse, text: errorMessage };
    } finally {
      setMessages(prevMessages => prevMessages.map(m => m.id === botResponse.id ? botResponse : m));
      setIsLoading(false);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  };

  // Update message rendering to remove SQL display
  const renderMessage = (msg) => {
    const isUser = msg.sender === 'user';
    return <Text style={isUser ? styles.userMessageText : styles.botMessageText}>{msg.text}</Text>;
  };

  return (
    <View style={styles.chatboxContainer}>
      <LinearGradient
        colors={['#2A0B4A', '#3B0764', '#1A1A2E']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0} // Adjust as needed
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
                  msg.sender === 'user' ? styles.userMessage : styles.botMessage,
                ]}
              >
                {renderMessage(msg)}
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
              placeholder="Ask about your portfolio (RAG)..."
              placeholderTextColor="rgba(0,0,0,0.4)"
              onSubmitEditing={handleSend}
              returnKeyType="send"
              editable={!isLoading}
            />
            <TouchableOpacity style={[styles.sendButton, isLoading && styles.sendButtonDisabled]} onPress={handleSend} disabled={isLoading}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// Use styles similar to GeneralChatbox.js, with minor adjustments if needed
// For brevity, I'm pointing to GeneralChatbox's styles.
// You would copy GeneralChatbox.styles and potentially tweak colors for RAGChatbox.
import { styles as generalChatboxStyles } from './GeneralChatbox'; // Assuming styles are exported

const styles = StyleSheet.create({
  ...generalChatboxStyles, // Spread existing styles
  topBar: { // Override or add specific styles
    ...generalChatboxStyles.topBar,
    // backgroundColor: '#2A0B4A', // Example override if LinearGradient is removed
  },
  botMessage: {
    ...generalChatboxStyles.botMessage,
    backgroundColor: '#E6E6FA', // Lavender for RAG bot
  },
  input: {
    ...generalChatboxStyles.input,
    color: '#000000', // Black text for input
    backgroundColor: 'rgba(230, 230, 250, 0.5)', // Light lavender background
  },
  sendButton: {
    ...generalChatboxStyles.sendButton,
    backgroundColor: '#8A2BE2', // BlueViolet
  },
  sendButtonDisabled: {
    backgroundColor: '#BFBFDF',
  },
  loadingContainer: { ...generalChatboxStyles.loadingContainer, alignItems: 'center', paddingVertical: 10 },
  thinkingText: { marginLeft: 10, color: '#555'},
  sqlBlock: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', backgroundColor: '#f0f0f0', padding: 8, marginVertical: 4, borderRadius: 4, color: '#333' },
  topBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
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
});

export default RAGChatbox;
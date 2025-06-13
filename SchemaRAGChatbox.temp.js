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
import { ChatGroq } from "@langchain/groq";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser, JsonOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnablePassthrough, RunnableLambda } from "@langchain/core/runnables";
import { styles as baseStyles, portfolioQueryStyles } from './GeneralChatbox';
import { GROQ_API_KEY } from '@env';

const windowHeight = Dimensions.get('window').height;

// Additional styles specific to SchemaRAGChatbox
const styles = StyleSheet.create({
  modeIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  modeIndicatorText: {
    fontSize: 6,
    color: 'rgba(0, 0, 0, 0.6)',
    fontWeight: '500',
  }
});

const SchemaRAGChatbox = ({ onClose }) => {
  // ...existing code...

  const [messages, setMessages] = useState([
    { 
      id: `welcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant', 
      content: 'Hello! I can help analyze your portfolio using enhanced schema understanding. Ask me about your holdings, performance, or any portfolio-related questions.',
      mode: 'rag'
    }
  ]);

  // Message rendering components
  const MessageBubble = ({ message }) => (
    <View style={[
      baseStyles.messageBubble,
      message.role === 'user' ? baseStyles.userMessage : baseStyles.ragBotMessage
    ]}>
      <Text
        style={message.role === 'user' ? baseStyles.userMessageText : baseStyles.botMessageText}
        selectable={true}
      >
        {message.content}
      </Text>
      {message.mode === 'rag' && message.role === 'assistant' && (
        <View style={[styles.modeIndicator, { padding: 2 }]}>
          <Text style={[styles.modeIndicatorText, { fontSize: 6 }]}>SCHEMA-RAG</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[baseStyles.overlay, { justifyContent: 'flex-end' }]}>
      <GestureDetector gesture={dragGesture}>
        <View style={[baseStyles.chatboxContainer, {
          height: windowHeight * 0.8,
          backgroundColor: '#fff',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: -2,
          },
          shadowOpacity: 0.25,
          shadowRadius: 3.84,
          elevation: 5,
        }]}>
          <LinearGradient
            colors={['#4F46E5', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[baseStyles.topBar, { borderTopLeftRadius: 20, borderTopRightRadius: 20 }]}
          >
            <View style={baseStyles.swipeHandleContainer}>
              <View style={baseStyles.swipeHandle} />
            </View>
            <View style={baseStyles.topBarContent}>
              <Text style={baseStyles.topBarTitle}>Portfolio Assistant</Text>
              <TouchableOpacity style={baseStyles.closeButton} onPress={onClose}>
                <Text style={baseStyles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <View style={[baseStyles.messagesWrapper, { flex: 1 }]}>
            <ScrollView
              ref={scrollViewRef}
              style={baseStyles.messagesContainer}
              contentContainerStyle={baseStyles.messagesContentContainer}
            >
              {messages.map(message => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && (
                <View style={baseStyles.loadingContainer}>
                  <ActivityIndicator size="small" color="#4F46E5" />
                </View>
              )}
            </ScrollView>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            style={baseStyles.inputContainer}
          >
            <TextInput
              style={baseStyles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask about your portfolio..."
              placeholderTextColor="#666"
              multiline
              maxHeight={120}
            />
            <TouchableOpacity
              style={[baseStyles.sendButton, (!inputText.trim() || isLoading) && baseStyles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || isLoading}
            >
              <Text style={baseStyles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </GestureDetector>
    </View>
  );
};

export default SchemaRAGChatbox;

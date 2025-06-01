import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  useWindowDimensions,
  Dimensions,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_MIN_HEIGHT = 80;
const PANEL_MAX_HEIGHT = SCREEN_HEIGHT * 0.9; // This constant is not used in this file after changes

export const SchemaRAGChatbox = ({
  messages = [],
  inputTextValue = '',
  onInputTextChange = () => {},
  onSendMessagePress = () => {},
  isLoading = false,
  onClose,
}) => {
  const scrollViewRef = useRef();

  const handleSendMessage = () => {
    // Now calls the handler passed via props
    if (inputTextValue.trim() && !isLoading) {
      onSendMessagePress(inputTextValue);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150); // Slightly increased delay for smoother scroll
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    // This component is now the direct UI content for the chat.
    // It's placed inside an Animated.View in SchemaRAGChatbox.js.
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.chatUIContainer} // Use a style that makes it fill its parent and sets background
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0} // Adjust if needed
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Schema RAG Chat</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        ref={scrollViewRef}
        style={styles.messageArea}
        // Add padding to the bottom of the ScrollView's content to make space for the inputArea
        contentContainerStyle={{ paddingBottom: (styles.inputArea.paddingVertical || styles.inputArea.padding || 0) * 2 + (styles.input.height || 40) }}
        onContentSizeChange={scrollToBottom}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg) => ( 
          <View
            key={msg.id || msg.timestamp || Math.random()} 
            style={[
              styles.message,
              msg.role === 'user' ? styles.userMessage : styles.botMessage,
            ]}
          >
            <Text style={msg.role === 'user' ? styles.userText : styles.botText}>
              {msg.content}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          value={inputTextValue}
          onChangeText={onInputTextChange}
          placeholder="Ask about your portfolio..."
          placeholderTextColor="#888"
          editable={!isLoading} 
        />
        <TouchableOpacity 
          style={[
            styles.sendButton, 
            (isLoading || !inputTextValue.trim()) && styles.sendButtonDisabled
          ]} 
          onPress={handleSendMessage} 
          disabled={isLoading || !inputTextValue.trim()}
        >
          {isLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.sendButtonText}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  chatUIContainer: { // Renamed from chatboxContainer to avoid confusion with parent's panel style
    backgroundColor: '#2C3E50',
    // borderTopLeftRadius and borderTopRightRadius are handled by the parent draggable panel
    overflow: 'hidden',
    flexDirection: 'column',
    // justifyContent: 'space-between', // flexGrow:1 on ScrollView will handle this
    flex: 1, 
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: '#1A2E4C', // Header color
  },
  headerTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    color: 'white',
    fontSize: 20,
  },
  messageArea: { 
    padding: 10, 
    flexGrow: 1,
  },
  message: { padding: 10, borderRadius: 8, marginBottom: 8, maxWidth: '80%' },
  userMessage: { backgroundColor: '#0066cc', alignSelf: 'flex-end' }, // User message blue
  botMessage: { backgroundColor: '#3B597D', alignSelf: 'flex-start' }, // Bot message slightly lighter dark
  userText: { color: 'white' },
  botText: { color: 'white' },
  inputArea: { 
    flexDirection: 'row', 
    padding: 10, 
    borderTopWidth: 1, 
    borderTopColor: '#3B597D', 
    backgroundColor: '#1A2E4C',
    // No longer absolutely positioned; KeyboardAvoidingView will handle it.
  },
  input: { 
    flex: 1, 
    backgroundColor: '#2C3E50', 
    color: 'white', 
    borderRadius: 5, 
    paddingHorizontal: 10, 
    marginRight: 10, 
    height: 40, 
    borderWidth: 1, 
    borderColor: '#3B597D',
    minHeight: 40,
  },
  sendButton: { backgroundColor: '#0066cc', borderRadius: 5, paddingVertical: 10, paddingHorizontal: 15, justifyContent: 'center', alignItems: 'center', minWidth: 70, height: 40 },
  sendButtonDisabled: {
    backgroundColor: '#555', // Darker, disabled look
  },
  sendButtonText: { color: 'white', fontWeight: 'bold' },
});

export default SchemaRAGChatbox;
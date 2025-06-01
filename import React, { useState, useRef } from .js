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
  ActivityIndicator, // Added for loading state
  useWindowDimensions,
} from 'react-native';

const SchemaRAGChatbox = ({
  messages = [], // Receives messages from parent
  inputTextValue = '', // Receives input text value from parent
  onInputTextChange = () => {}, // Parent handles input text changes
  onSendMessagePress = () => {}, // Parent handles send action
  isLoading = false, // Parent indicates if loading
  onClose,
}) => {
  const scrollViewRef = useRef();
  const { width } = useWindowDimensions();

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

  // Removed toggleChat and animation logic as it's likely handled by the parent Modal in App.js
  // The 'isMobile' check for width is removed as the parent (Modal in App.js) controls the overall size.

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.chatContainer}
      // Consider adjusting keyboardVerticalOffset if input is obscured, especially in a modal.
      // A value of 0 might be better if the modal itself handles keyboard adjustments.
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
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
        onContentSizeChange={scrollToBottom}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg) => ( // Use msg.id for key if available and unique
          <View
            key={msg.id || msg.timestamp || Math.random()} // Ensure unique key
            style={[
              styles.message,
              // Adapt to message structure from SchemaRAGChatbox.js ({ role: 'user'/'assistant', content: ... })
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
          editable={!isLoading} // Disable input when loading
        />
        <TouchableOpacity style={[styles.sendButton, (isLoading || !inputTextValue.trim()) && styles.sendButtonDisabled]} onPress={handleSendMessage} disabled={isLoading || !inputTextValue.trim()}>
          {isLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.sendButtonText}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  chatContainer: {
    flex: 1, // Take full space of the modal
    backgroundColor: '#2C3E50', // Darker background for chat
    // borderRadius is good if this component is the outermost view, but it's inside a modal container.
    overflow: 'hidden',
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
  messageArea: { padding: 10, flexGrow: 1 },
  message: { padding: 10, borderRadius: 8, marginBottom: 8, maxWidth: '80%' },
  userMessage: { backgroundColor: '#0066cc', alignSelf: 'flex-end' }, // User message blue
  botMessage: { backgroundColor: '#3B597D', alignSelf: 'flex-start' }, // Bot message slightly lighter dark
  userText: { color: 'white' },
  botText: { color: 'white' },
  inputArea: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: '#3B597D', backgroundColor: '#1A2E4C' },
  input: { flex: 1, backgroundColor: '#2C3E50', color: 'white', borderRadius: 5, paddingHorizontal: 10, marginRight: 10, height: 40, borderWidth: 1, borderColor: '#3B597D' },
  sendButton: { backgroundColor: '#0066cc', borderRadius: 5, paddingVertical: 10, paddingHorizontal: 15, justifyContent: 'center', alignItems: 'center', minWidth: 70, height: 40 },
  sendButtonDisabled: {
    backgroundColor: '#555', // Darker, disabled look
  },
  sendButtonText: { color: 'white', fontWeight: 'bold' },
  // Removed toggleButton styles as it's handled by parent
});

export default SchemaRAGChatbox;
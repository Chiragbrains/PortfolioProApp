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
        contentContainerStyle={styles.messageContentContainer}
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
  chatUIContainer: {
    backgroundColor: '#1E1B4B',
    overflow: 'hidden',
    flexDirection: 'column',
    flex: 1,
    display: 'flex',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: '#7C3AED',
    height: 36,
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  closeButton: {
    padding: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
  },
  closeButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '500',
  },
  messageArea: { 
    flex: 1,
    padding: 10,
    marginBottom: 60,
    backgroundColor: '#1E1B4B',
  },
  messageContentContainer: {
    paddingBottom: 80,
  },
  message: { 
    padding: 12, 
    borderRadius: 16, 
    marginBottom: 8, 
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  userMessage: { 
    backgroundColor: '#7C3AED',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  botMessage: { 
    backgroundColor: '#312E81',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  userText: { 
    color: 'white',
    fontSize: 15,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  botText: { 
    color: 'white',
    fontSize: 15,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  inputArea: { 
    flexDirection: 'row', 
    padding: 12, 
    borderTopWidth: 1, 
    borderTopColor: '#312E81', 
    backgroundColor: '#1E1B4B',
    position: 'absolute',
    top: '87%',
    left: 0,
    right: 0,
    zIndex: 10,
    transform: [{ translateY: -20 }],
  },
  input: { 
    flex: 1, 
    backgroundColor: '#312E81', 
    color: 'white', 
    borderRadius: 20, 
    paddingHorizontal: 15, 
    marginRight: 10, 
    height: 44, 
    borderWidth: 1, 
    borderColor: '#7C3AED',
    minHeight: 40,
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  sendButton: { 
    backgroundColor: '#7C3AED', 
    borderRadius: 22, 
    paddingVertical: 10, 
    paddingHorizontal: 20, 
    justifyContent: 'center', 
    alignItems: 'center', 
    minWidth: 80, 
    height: 44,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#4C1D95',
    opacity: 0.7,
  },
  sendButtonText: { 
    color: 'white', 
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
});

export default SchemaRAGChatbox;
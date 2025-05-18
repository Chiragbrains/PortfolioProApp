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
} from 'react-native';
import { GROQ_API_KEY } from '@env'; // Assuming you have your Groq API key here

const screenHeight = Dimensions.get('window').height;

const GeneralChatbox = ({ onClose }) => {
  const [messages, setMessages] = useState([
    { id: '1', text: 'Hello! How can I help you today?', sender: 'bot' },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef();

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const fetchLLMResponse = async (userQuery) => {
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
        setMessages(prevMessages => [
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

  const handleSend = () => {
    if (inputText.trim().length === 0) return;

    const newUserMessage = { id: String(Date.now()), text: inputText.trim(), sender: 'user' };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    fetchLLMResponse(inputText.trim());
    setInputText('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.keyboardAvoidingView}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0} // Adjust as needed
    >
      <View style={styles.chatContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>General Assistant</Text>
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
            <View
              key={msg.id}
              style={[
                styles.messageBubble,
                msg.sender === 'user' ? styles.userMessage : styles.botMessage,
              ]}
            >
              <Text style={styles.messageText}>{msg.text}</Text>
            </View>
          ))}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#1565C0" />
            </View>
          )}
        </ScrollView>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask anything..."
            onSubmitEditing={handleSend} // Allows sending with keyboard "Go" or "Search"
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={isLoading}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1, // Important for KeyboardAvoidingView to work within a modal
    justifyContent: 'flex-end',
  },
  chatContainer: {
    height: screenHeight * 0.7, // Take up 70% of screen height from bottom
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
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
    color: '#1565C0',
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
  },
  botMessage: {
    backgroundColor: '#E0E0E0',
    alignSelf: 'flex-start',
  },
  messageText: {
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
  }
});

export default GeneralChatbox;
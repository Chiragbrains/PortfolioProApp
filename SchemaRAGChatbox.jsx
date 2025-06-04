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
  // Animated and useWindowDimensions are not directly used in this UI component anymore
  // They are used in the parent SchemaRAGChatbox.js for the draggable panel
  // Dimensions is also not directly used here as screenHeight is imported from scaling.js
  Animated,
  ActivityIndicator,
  useWindowDimensions,
  Dimensions,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { scaleSize, scaleFont, screenHeight, scaleLayoutValue } from './utils/scaling.js'; // Import new scaleLayoutValue

// const { height: SCREEN_HEIGHT } = Dimensions.get('window'); // Now imported as screenHeight

// Calculate the effective height of the input area for layout adjustments
const CALCULATED_INPUT_AREA_HEIGHT = scaleSize(12 + 44 + 12); // padding + input_height + padding

export const SchemaRAGChatbox = ({
  messages = [],
  inputTextValue = '',
  onInputTextChange = () => {},
  onSendMessagePress = () => {},
  isLoading = false,
  onClose,
  navBarHeight = 0, // Add navBarHeight prop with a default
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

  // Dynamic style for messageAreaWrapper to account for navBarHeight and inputArea height
  const dynamicMessageAreaWrapperStyle = {
    ...styles.messageAreaWrapper,
    marginBottom: CALCULATED_INPUT_AREA_HEIGHT + navBarHeight,
  };

  return (
    // This component is now the direct UI content for the chat.
    // It's placed inside an Animated.View in SchemaRAGChatbox.js.
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.chatUIContainer} // Use a style that makes it fill its parent and sets background
      keyboardVerticalOffset={Platform.OS === "ios" ? navBarHeight : 0} 
    >
      <View style={styles.header}>
        {/* Drag Handle - now on its own line */}
        <View style={styles.dragHandle} />
        
        {/* Row for Title and Close Button */}
        <View style={styles.headerContentRow}>
          <View style={styles.headerSideSpacer} /> {/* Added for balance */}
          <Text style={styles.headerTitle}>AI Chatbot</Text>
          {/* Close Button or placeholder for balance */}
          {onClose ? (          
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.closeButtonPlaceholder} />
          )}
        </View>
      </View>
      {/* Message Area */}
      <View style={dynamicMessageAreaWrapperStyle}>
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
                // Apply scaled padding to message bubbles if desired
                // { padding: scaleSize(12), borderRadius: scaleSize(16), marginBottom: scaleSize(8) }
              ]}
            >
              <Text style={[
                msg.role === 'user' ? styles.userText : styles.botText,
                // Apply scaled font size to message text if desired
                // { fontSize: scaleFont(15), lineHeight: scaleFont(20) }
              ]}>
                {msg.content}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Input Area - Apply dynamic scaling */}
      <View style={[
        styles.inputArea,
        {
          padding: scaleSize(12),
          borderTopWidth: scaleSize(1),
          bottom: navBarHeight, // Position inputArea above the external nav bar
        }
      ]}>
        <TextInput
          style={[
            styles.input,
            {
              borderRadius: scaleSize(20),
              paddingHorizontal: scaleSize(15),
              height: scaleSize(44),
              fontSize: scaleFont(15),
              borderWidth: 1, // Changed to a fixed tiny value
            }
          ]}
          value={inputTextValue}
          onChangeText={onInputTextChange}
          placeholder="Ask about your portfolio..."
          placeholderTextColor="#888"
          editable={!isLoading} 
        />
        <TouchableOpacity 
          style={[
            styles.sendButton,
            {
              borderRadius: scaleSize(22),
              paddingVertical: scaleSize(10),
              paddingHorizontal: scaleSize(20),
              minWidth: scaleSize(80),
              height: scaleSize(44),
            },
            (isLoading || !inputTextValue.trim()) && styles.sendButtonDisabled
          ]} 
          onPress={handleSendMessage} 
          disabled={isLoading || !inputTextValue.trim()}
        >
          {isLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={[
                styles.sendButtonText,
                {
                  fontSize: scaleFont(16),
                }
              ]}>Send</Text>}
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
    flexDirection: 'column', // Stack drag handle and content row
    alignItems: 'center', // Center drag handle horizontally
    paddingTop: scaleLayoutValue(8), // Add some padding at the top
    paddingBottom: scaleLayoutValue(4), // Padding below the title/button row
    paddingHorizontal: scaleLayoutValue(15), // Use scaleLayoutValue for horizontal padding
    backgroundColor: '#7C3AED',
    // Height will be more dynamic, or adjust scaleSize if fixed height is desired e.g. scaleSize(40)
  },
  dragHandle: { // Style for the visual drag handle
    width: 60, // Fixed width for the handle
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)', // Light handle on purple background
    borderRadius: 2,
    marginBottom: scaleLayoutValue(6), // Space between handle and title row
  },
  headerContentRow: { // New style for the row containing title and close button
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%', // Ensure it takes full width for space-between
  },
  headerTitle: {
    color: 'white',
    fontSize: scaleFont(16), // Reduced base font size
    fontWeight: '600',
    letterSpacing: 0.5,
    flex: 1, // Allow title to take up available space
    textAlign: 'center', // Center the text within its available space
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  closeButton: {
    padding: scaleLayoutValue(4), // Use scaleLayoutValue for button padding
    //backgroundColor: 'rgba(255, 255, 255, 0.1)',
    width: 40, // Ensure consistent width for centering title
    alignItems: 'center', // Center the '✕' within the touchable area
    justifyContent: 'center', // Center the '✕' within the touchable area
    borderRadius: scaleSize(12), // Scaled
  },
  closeButtonText: {
    color: 'white',
    fontSize: scaleFont(16), // Reduced base font size
    fontWeight: '500',
  },
  closeButtonPlaceholder: {
    width: 40, // Ensure consistent width for centering title
  },
  headerSideSpacer: { // Style for the balancing spacer on the left of the title
    width: 40, // Match the closeButton/placeholder width
  },
  messageAreaWrapper: { // New wrapper for message area to control its flex behavior
    flex: 1,
    // marginBottom is now dynamic and set inline: CALCULATED_INPUT_AREA_HEIGHT + navBarHeight
    backgroundColor: '#1E1B4B', // Match chatUIContainer background
  },
  messageArea: { 
    flex: 1,
    padding: scaleSize(10), // Scaled
  },
  messageContentContainer: {
    paddingBottom: scaleSize(20), // Reduced padding, as marginBottom on wrapper handles space
  },
  message: { 
    padding: scaleSize(12), // Scaled
    borderRadius: scaleSize(16), // Scaled
    marginBottom: scaleSize(8), // Scaled
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: scaleSize(4), // Scaled
    elevation: 2,
  },
  userMessage: { 
    backgroundColor: '#7C3AED',
    alignSelf: 'flex-end',
    borderBottomRightRadius: scaleSize(4), // Scaled
  },
  botMessage: { 
    backgroundColor: '#312E81',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: scaleSize(4), // Scaled
  },
  userText: { 
    color: 'white',
    fontSize: scaleFont(12), // Further reduced base font size
    lineHeight: scaleFont(18), // Adjusted line height
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  botText: { 
    color: 'white',
    fontSize: scaleFont(12), // Further reduced base font size
    lineHeight: scaleFont(18), // Adjusted line height
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  inputArea: { 
    flexDirection: 'row', 
    // padding is now dynamic
    // borderTopWidth is now dynamic
    borderTopColor: '#312E81', 
    backgroundColor: '#1E1B4B',
    position: 'absolute', 
    // bottom is now dynamic, set in the component's style prop
    // top: '82%', // REMOVED: Let flexbox and KeyboardAvoidingView handle vertical position
    left: 0,
    right: 0,
    zIndex: 10,
    // transform: [{ translateY: -20 }], // This might need adjustment or removal
  },
  input: { 
    flex: 1, 
    backgroundColor: '#312E81', 
    color: 'white', 
    // borderRadius is now dynamic
    // paddingHorizontal is now dynamic
    marginRight: scaleSize(10), // Scaled
    // height is now dynamic
    // borderWidth is now dynamic
    borderColor: '#7C3AED',
    minHeight: scaleSize(40), // Scaled
    // fontSize is now dynamic
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  sendButton: { 
    backgroundColor: '#7C3AED', 
    // borderRadius is now dynamic
    // paddingVertical is now dynamic
    // paddingHorizontal is now dynamic
    justifyContent: 'center', 
    alignItems: 'center', 
    // minWidth is now dynamic
    // height is now dynamic
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: scaleSize(4), // Scaled
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#4C1D95',
    opacity: 0.7,
  },
  sendButtonText: { 
    color: 'white', 
    fontWeight: '600', // Adjusted fontWeight
    // fontSize is already dynamically set in the component's style prop using scaleFont(16)
    letterSpacing: 1, // Reduced letter spacing
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
});

export default SchemaRAGChatbox;
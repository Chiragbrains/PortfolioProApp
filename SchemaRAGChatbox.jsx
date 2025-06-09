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
  Image,
  Modal,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { scaleSize, scaleFont, screenHeight, scaleLayoutValue } from './utils/scaling.js'; // Import new scaleLayoutValue
import Markdown from 'react-native-markdown-display';

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
  keyboardOffset = 0, // Renamed from navBarHeight, now represents the offset for KeyboardAvoidingView
}) => {
  const scrollViewRef = useRef();
  const [isTextSelected, setIsTextSelected] = useState(false);
  const [selectedRawData, setSelectedRawData] = useState(null);
  const [isRawDataModalVisible, setIsRawDataModalVisible] = useState(false);

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
    marginBottom: CALCULATED_INPUT_AREA_HEIGHT, // Input area is at bottom: 0, so only its height is needed
  };

  const markdownStyles = {
    body: {
      color: '#FFFFFF',
      fontSize: 16,
      lineHeight: 24,
    },
    heading1: {
      color: '#FFFFFF',
      fontSize: 24,
      fontWeight: 'bold',
      marginTop: 20,
      marginBottom: 10,
    },
    heading2: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: 'bold',
      marginTop: 15,
      marginBottom: 8,
    },
    heading3: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: 'bold',
      marginTop: 12,
      marginBottom: 6,
    },
    paragraph: {
      color: '#FFFFFF',
      marginBottom: 10,
    },
    list_item: {
      color: '#FFFFFF',
      marginBottom: 5,
    },
    bullet_list: {
      marginBottom: 10,
    },
    ordered_list: {
      marginBottom: 10,
    },
    strong: {
      color: '#FFFFFF',
      fontWeight: 'bold',
    },
    em: {
      color: '#FFFFFF',
      fontStyle: 'italic',
    },
    code_inline: {
      backgroundColor: '#2C2C2E',
      color: '#FFFFFF',
      padding: 4,
      borderRadius: 4,
    },
    code_block: {
      backgroundColor: '#2C2C2E',
      color: '#FFFFFF',
      padding: 10,
      borderRadius: 4,
      marginVertical: 10,
    },
  };

  const handleTextSelectionStart = () => {
    setIsTextSelected(true);
  };

  const handleTextSelectionEnd = () => {
    setIsTextSelected(false);
  };

  const renderRawDataButton = (data) => {
    if (!data) return null;
    
    return (
      <TouchableOpacity
        style={styles.rawDataButton}
        onPress={() => {
          setSelectedRawData(data);
          setIsRawDataModalVisible(true);
        }}
      >
        <Text style={styles.rawDataButtonText}>View Raw Data</Text>
      </TouchableOpacity>
    );
  };

  const renderMessage = (message) => {
    const isUser = message.role === 'user';
    const messageStyle = isUser ? styles.userMessage : styles.botMessage;
    const textStyle = isUser ? styles.userText : styles.botText;

    return (
      <View key={message.id} style={[styles.message, messageStyle]}>
        {isUser ? (
          <Text 
            style={textStyle}
            selectable={true}
            onSelectionChange={({ nativeEvent }) => {
              if (nativeEvent.selection) {
                handleTextSelectionStart();
              } else {
                handleTextSelectionEnd();
              }
            }}
          >
            {message.content}
          </Text>
        ) : (
          <View
            onStartShouldSetResponder={() => true}
            onResponderGrant={handleTextSelectionStart}
            onResponderRelease={handleTextSelectionEnd}
            onResponderTerminate={handleTextSelectionEnd}
          >
            <Markdown 
              style={{
                ...markdownStyles,
                body: {
                  ...markdownStyles.body,
                  userSelect: 'text',
                },
                paragraph: {
                  ...markdownStyles.paragraph,
                  userSelect: 'text',
                },
                list_item: {
                  ...markdownStyles.list_item,
                  userSelect: 'text',
                },
              }}
            >
              {message.content}
            </Markdown>
            
            {/* Render charts if available */}
            {message.charts && Object.entries(message.charts).map(([key, chart]) => (
              <View key={`chart-${key}`} style={styles.chartContainer}>
                <Image
                  source={{ uri: `data:image/png;base64,${chart.data}` }}
                  style={styles.chart}
                  resizeMode="contain"
                  onError={(e) => console.error('Error loading chart:', e.nativeEvent.error)}
                />
                <Text style={styles.chartCaption}>
                  {chart.type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </Text>
              </View>
            ))}

            {/* Add raw data button if data is available */}
            {renderRawDataButton(message.rawData)}
          </View>
        )}
      </View>
    );
  };

  return (
    // This component is now the direct UI content for the chat.
    // It's placed inside an Animated.View in SchemaRAGChatbox.js.
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.chatUIContainer} // Use a style that makes it fill its parent and sets background
      keyboardVerticalOffset={Platform.OS === "ios" ? keyboardOffset : 0} 
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
          scrollEnabled={true}
          onScrollBeginDrag={() => {
            if (isTextSelected) {
              handleTextSelectionEnd();
            }
          }}
        >
          {messages.map(renderMessage)}
        </ScrollView>
      </View>

      {/* Raw Data Modal */}
      <Modal
        visible={isRawDataModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsRawDataModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Raw Data</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setIsRawDataModalVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScrollView}>
              <Text style={styles.rawDataText} selectable={true}>
                {JSON.stringify(selectedRawData, null, 2)}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Input Area - Apply dynamic scaling */}
      <View style={[
        styles.inputArea,
        {
          padding: scaleSize(12),
          //borderTopWidth: scaleSize(1),
          bottom: 0, // Input area should be at the bottom of its container
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
    fontSize: scaleFont(20), // Reduced base font size
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
    //borderTopColor: '#312E81', 
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
    minHeight: scaleSize(31), // Scaled
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
  chartContainer: {
    marginTop: scaleSize(10),
    marginBottom: scaleSize(10),
    backgroundColor: '#2C2C2E',
    borderRadius: scaleSize(8),
    padding: scaleSize(10),
    alignItems: 'center',
    width: '100%',
    overflow: 'hidden',
  },
  chart: {
    width: '100%',
    height: scaleSize(200),
    marginBottom: scaleSize(5),
    backgroundColor: 'transparent',
  },
  chartCaption: {
    color: '#FFFFFF',
    fontSize: scaleFont(12),
    fontStyle: 'italic',
    marginTop: scaleSize(5),
  },
  rawDataButton: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#4C1D95',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  rawDataButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#312E81',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '500',
  },
  modalScrollView: {
    padding: 16,
  },
  rawDataText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

export default SchemaRAGChatbox;
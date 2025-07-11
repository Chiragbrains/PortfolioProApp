// SchemaRAGChatbox.jsx
import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Linking,
  Dimensions,
} from 'react-native';
// FIX: Import ScrollView from react-native-gesture-handler to resolve passive listener violations
import { ScrollView } from 'react-native-gesture-handler';
import Markdown from 'react-native-markdown-display';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// --- Reusable UI Component Renderers ---

const KeyValueRenderer = ({ title, data }) => {
  // Ensure data is a non-empty object
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) return null;

  return (
    <View style={styles.rendererContainer}>
      <Text style={styles.rendererTitle}>{title}</Text>
      <View style={styles.kvContainer}>
        {Object.entries(data).map(([key, value]) => (
          <View key={key} style={styles.kvRow}>
            <Text style={styles.kvKey}>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Text>
            <Text style={styles.kvValue} selectable={true}>
              {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const TableRenderer = ({ title, data }) => {
  // Ensure data has headers and rows
  if (!data || !Array.isArray(data.headers) || !Array.isArray(data.rows) || data.rows.length === 0) return null;

  return (
    <View style={styles.rendererContainer}>
      <Text style={styles.rendererTitle}>{title}</Text>
      <ScrollView horizontal={true}>
        <View>
          <View style={styles.tableHeaderRow}>
            {data.headers.map((header, index) => (
              <Text key={index} style={[styles.tableCell, styles.tableHeaderText]}>{header}</Text>
            ))}
          </View>
          {data.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={[styles.tableBodyRow, rowIndex % 2 === 1 && styles.tableAltRow]}>
              {row.map((cell, cellIndex) => (
                <Text key={cellIndex} style={styles.tableCell} selectable={true}>
                  {typeof cell === 'number' ? cell.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(cell)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const NewsRenderer = ({ title, data }) => {
  // Ensure data is a non-empty array
  if (!Array.isArray(data) || data.length === 0) return null;

  return (
    <View style={styles.rendererContainer}>
      <Text style={styles.rendererTitle}>{title}</Text>
      {data.map((item, index) => (
        <TouchableOpacity key={index} style={styles.newsCard} onPress={() => item.link && Linking.openURL(item.link)}>
          <Text style={styles.newsTitle} selectable={true}>{item.title}</Text>
          {item.publisher && <Text style={styles.newsPublisher}>{item.publisher}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
};

// --- Chart Renderer (Dashboard-style) ---
const ChartRenderer = ({ chartType, data, options = {} }) => {
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const pieChartSize = Math.max(160, Math.min(screenWidth * 0.6, 320));
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  switch (chartType) {
    case 'line_chart':
      return (
        <ResponsiveContainer width={screenWidth - 40} height={screenHeight * 0.3}>
          <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
            <XAxis dataKey={options.xKey || 'label'} stroke="#9ca3af" fontSize={12} tick={{ fill: '#9ca3af' }} />
            <YAxis hide />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey={options.yKey || 'value'} stroke="#8b5cf6" strokeWidth={2} dot={false} />
            {options.yKey2 && <Line type="monotone" dataKey={options.yKey2} stroke="#9ca3af" strokeWidth={2} dot={false} strokeDasharray="5 5" />}
          </LineChart>
        </ResponsiveContainer>
      );
    case 'bar_chart':
      return (
        <ResponsiveContainer width={screenWidth - 40} height={screenHeight * 0.3}>
          <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
            <XAxis dataKey={options.xKey || 'label'} stroke="#9ca3af" fontSize={12} tick={{ fill: '#9ca3af' }} />
            <YAxis hide />
            <Tooltip />
            <Bar dataKey={options.yKey || 'value'} fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      );
    case 'pie_chart':
      return (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <ResponsiveContainer width={pieChartSize} height={pieChartSize}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                outerRadius={pieChartSize / 2 - 10}
                innerRadius={pieChartSize / 2.8}
                paddingAngle={5}
                dataKey={options.yKey || 'value'}
                nameKey={options.xKey || 'label'}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || ['#8b5cf6', '#06b6d4', '#10b981', '#ef4444', '#f59e42'][index % 5]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </View>
      );
    default:
      return <Text style={{ color: 'red' }}>Unsupported chart type: {chartType}</Text>;
  }
};

// --- Main Chat UI Component ---

export const SchemaRAGChatboxUI = ({
  messages = [],
  inputTextValue = '',
  onInputTextChange = () => {},
  onSendMessagePress = () => {},
  isLoading = false,
  onClose,
  keyboardOffset = 0,
}) => {
  const scrollViewRef = useRef();
  const [selectedRawData, setSelectedRawData] = useState(null);
  const [isRawDataModalVisible, setIsRawDataModalVisible] = useState(false);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (messages.length) {
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [messages]);

  const renderRawDataButton = (data) => {
    if (!data) return null;
    return (
      <TouchableOpacity
        style={styles.rawDataButton}
        onPress={() => { setSelectedRawData(data); setIsRawDataModalVisible(true); }}
      >
        <Text style={styles.rawDataButtonText}>View Raw Data</Text>
      </TouchableOpacity>
    );
  };

  /**
   * Renders the content of a single message bubble.
   * FIX: This function now correctly renders user messages as selectable Text
   * and assistant messages as selectable Markdown.
   */
  const renderMessageContent = (message) => {
    const { role, content, renderInstructions, rawData } = message;
    const isUser = role === 'user';

    return (
        <View style={[styles.message, isUser ? styles.userMessage : styles.botMessage]}>
        {isUser ? (
                // User messages are simple, selectable text
                <Text style={styles.userText} selectable={true}>
                    {content}
                </Text>
            ) : (
                // Assistant messages have a summary, dynamic components, and a raw data button
                <>
                    <Markdown selectable={true} style={markdownStyles}>{content || ''}</Markdown>
                    {/* Dynamically render UI components based on instructions from the logic layer */}
                    {Array.isArray(renderInstructions) && renderInstructions.map((instruction, index) => {
                      const { component, props } = instruction;
                      switch (component) {
                        case 'key_value_pairs': return <KeyValueRenderer key={index} {...props} />;
                        case 'table': return <TableRenderer key={index} {...props} />;
                        case 'news_list': return <NewsRenderer key={index} {...props} />;
                        case 'line_chart':
                        case 'bar_chart':
                        case 'pie_chart':
                          return <ChartRenderer key={index} chartType={component} {...props} />;
                        default: return <Text key={index} style={{color: 'red'}}>Unsupported component: {component}</Text>;
                      }
                    })}

                    {!isUser && renderRawDataButton(rawData)}
                </>
            )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.chatUIContainer}
      keyboardVerticalOffset={keyboardOffset}
    >
      <View style={styles.header}>
        <View style={styles.dragHandle} />
        <View style={styles.headerContentRow}>
          <Text style={styles.headerTitle}>AI Financial Assistant</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
        </View>
      </View>
      
        <ScrollView
          ref={scrollViewRef}
          style={styles.messageArea}
          contentContainerStyle={styles.messageContentContainer}
          keyboardShouldPersistTaps="handled"
      >
        {messages.map(message => <View key={message.id}>{renderMessageContent(message)}</View>)}
        {isLoading && (
            <View style={[styles.message, styles.botMessage]}>
                <ActivityIndicator color="#A78BFA" />
            </View>
        )}
        </ScrollView>

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
              <TouchableOpacity onPress={() => setIsRawDataModalVisible(false)}>
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

      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          value={inputTextValue}
          onChangeText={onInputTextChange}
          placeholder="Ask a question..."
          placeholderTextColor="#888"
          editable={!isLoading} 
        />
        <TouchableOpacity 
          style={[styles.sendButton, (isLoading || !inputTextValue.trim()) && styles.sendButtonDisabled]} 
          onPress={() => onSendMessagePress(inputTextValue)} 
          disabled={isLoading || !inputTextValue.trim()}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const markdownStyles = {
    body: { color: '#FFFFFF', fontSize: 16 },
    heading1: { color: '#A78BFA', marginTop: 10, marginBottom: 5 },
    strong: { fontWeight: 'bold' },
    paragraph: { marginTop: 5, marginBottom: 10 },
};

const styles = StyleSheet.create({
  // Layout
  chatUIContainer: { backgroundColor: '#1E1B4B', flex: 1, flexDirection: 'column' },
  header: { paddingBottom: 8, paddingTop: 12, paddingHorizontal: 15, backgroundColor: '#7C3AED', alignItems: 'center' },
  headerContentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  dragHandle: { width: 60, height: 4, backgroundColor: 'rgba(255, 255, 255, 0.3)', borderRadius: 2, marginBottom: 8 },
  headerTitle: { color: 'white', fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center', marginLeft: 30 },
  closeButton: { padding: 4, width: 30, alignItems: 'center' },
  closeButtonText: { color: 'white', fontSize: 20 },
  messageArea: { flex: 1, paddingHorizontal: 10 },
  messageContentContainer: { paddingVertical: 10 },
  inputArea: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#312E81', backgroundColor: '#1E1B4B' },
  input: { flex: 1, backgroundColor: '#312E81', color: 'white', borderRadius: 20, paddingHorizontal: 15, height: 44, fontSize: 16, marginRight: 10 },
  sendButton: { backgroundColor: '#7C3AED', borderRadius: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, height: 44 },
  sendButtonDisabled: { backgroundColor: '#4C1D95' },
  sendButtonText: { color: 'white', fontWeight: '600' },
  
  // Messages
  message: { padding: 12, borderRadius: 16, marginBottom: 8, maxWidth: '100%' },
  userMessage: { backgroundColor: '#7C3AED', alignSelf: 'flex-end', borderBottomRightRadius: 4, maxWidth: '85%' },
  botMessage: { backgroundColor: '#312E81', alignSelf: 'stretch', borderBottomLeftRadius: 4 },
  userText: { color: 'white', fontSize: 16 }, // Style for user's plain text message
  
  // Raw Data Modal
  rawDataButton: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 6, alignSelf: 'flex-start' },
  rawDataButtonText: { color: '#E0E0E0', fontSize: 12, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', maxHeight: '80%', backgroundColor: '#1E1B4B', borderRadius: 12, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#312E81' },
  modalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  modalCloseButtonText: { color: '#FFFFFF', fontSize: 20 },
  modalScrollView: { padding: 16 },
  rawDataText: { color: '#E0E0E0', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Dynamic Component Renderers
  rendererContainer: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: 12, marginTop: 12 },
  rendererTitle: { color: '#A78BFA', fontSize: 14, fontWeight: 'bold', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(167, 139, 250, 0.3)' },
  kvContainer: {},
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  kvKey: { color: '#D1D5DB', flex: 1 },
  kvValue: { color: '#FFFFFF', fontWeight: '500', flex: 1, textAlign: 'right' },
  
  tableHeaderRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.3)' },
  tableBodyRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  tableAltRow: { backgroundColor: 'rgba(255,255,255,0.05)' },
  tableCell: { minWidth: 120, padding: 10, color: '#E0E0E0', fontSize: 14 },
  tableHeaderText: { color: '#FFFFFF', fontWeight: 'bold' },
  
  newsCard: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  newsTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  newsPublisher: { color: '#A78BFA', fontSize: 12, fontStyle: 'italic' },
});

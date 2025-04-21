import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet,
  Modal,
  ScrollView,
  Alert
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { fetchStocks } from './stocksService';

const AddStockForm = ({ visible, onClose, onSubmit, initialValues = null, isEditing = false }) => {
  const [stockData, setStockData] = useState({
    ticker: '',
    account: '',
    quantity: '',
    costBasis: '',
    type: 'stock'
  });
  const [accounts, setAccounts] = useState([]);

  // Load unique accounts when the form is opened
  useEffect(() => {
    if (visible) {
      loadUniqueAccounts();
      
      // If in edit mode and initialValues are provided, populate the form
      if (isEditing && initialValues) {
        setStockData({
          ticker: initialValues.ticker || '',
          account: initialValues.account || '',
          quantity: initialValues.quantity?.toString() || '',
          costBasis: initialValues.costBasis?.toString() || '',
          type: initialValues.type?.toLowerCase() || 'stock'
        });
      } else {
        // Reset form for new stock
        setStockData({
          ticker: '',
          account: '',
          quantity: '',
          costBasis: '',
          type: 'stock'
        });
      }
    }
  }, [visible, initialValues, isEditing]);

  const loadUniqueAccounts = async () => {
    try {
      // Fetch all stocks
      const stocks = await fetchStocks();
      
      // Extract unique account names
      const uniqueAccounts = [...new Set(stocks.map(stock => stock.account))];
      setAccounts(uniqueAccounts.sort());
    } catch (error) {
      console.error('Error loading unique accounts:', error);
    }
  };

  const handleSubmit = () => {
    // Trim whitespace from text input fields
    const trimmedData = {
      ...stockData,
      ticker: stockData.ticker.trim(),
      account: stockData.account.trim(),
      quantity: stockData.quantity.trim(),
      costBasis: stockData.costBasis.trim()
    };
    
    // If editing, include the ID from initialValues
    if (isEditing && initialValues && initialValues.id) {
      onSubmit({
        ...trimmedData,
        id: initialValues.id
      });
    } else {
      onSubmit(trimmedData);
    }
  };
  
  const handleDelete = async () => {
    console.log("Delete button pressed for stock ID:", initialValues.id); // Debug log

    try {
      console.log("Deleting stock with ID:", initialValues.id); // Debug log
      await onSubmit({ id: initialValues.id, action: 'delete' });
      Alert.alert("Success", "Stock deleted successfully!"); // Notify success
    } catch (error) {
      console.error('Error deleting stock:', error); // Log any errors
      Alert.alert('Error', 'Failed to delete stock: ' + error.message);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
    >
      <View style={styles.modalContainer}>
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>
            {isEditing ? 'Edit Stock' : 'Add New Stock'}
          </Text>
          
          <ScrollView>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Ticker Symbol:</Text>
              <TextInput
                style={styles.input}
                value={stockData.ticker}
                onChangeText={(text) => setStockData({...stockData, ticker: text.toUpperCase()})}
                placeholder="Enter ticker (e.g., AAPL)"
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                editable={!isEditing}
              />
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Account</Text>
              <Picker
                style={styles.picker}
                selectedValue={stockData.account}
                enabled={!isEditing}
                onValueChange={(itemValue) => {
                  if (!isEditing) {
                    setStockData({...stockData, account: itemValue});
                  }
                }}
              >
                <Picker.Item label="Select an account..." value="" />
                {accounts.map((account) => (
                  <Picker.Item key={account} label={account} value={account} />
                ))}
                <Picker.Item label="+ Add New Account" value="new_account" />
              </Picker>
            </View>
            
            {stockData.account === 'new_account' && (
              <TextInput
                style={styles.input}
                value={stockData.account === 'new_account' ? '' : stockData.account}
                onChangeText={(text) => setStockData({...stockData, account: text})}
                placeholder="Enter new account name"
              />
            )}
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Quantity:</Text>
              <TextInput
                style={styles.input}
                value={stockData.quantity}
                onChangeText={(text) => {
                  const numericValue = text.replace(/[^0-9.]/g, '');
                  setStockData({...stockData, quantity: numericValue});
                }}
                keyboardType="numeric"
                placeholder="Enter quantity"
                autoCorrect={false}
              />
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Cost Basis per Share:</Text>
              <TextInput
                style={styles.input}
                value={stockData.costBasis}
                onChangeText={(text) => {
                  const numericValue = text.replace(/[^0-9.]/g, '');
                  setStockData({...stockData, costBasis: numericValue});
                }}
                keyboardType="decimal-pad"
                placeholder="Enter cost per share"
                autoCorrect={false}
              />
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Type</Text>
              <Picker
                style={styles.picker}
                selectedValue={stockData.type}
                enabled={!isEditing}
                onValueChange={(itemValue) => {
                  if (!isEditing) {
                    setStockData({...stockData, type: itemValue});
                  }
                }}
              >
                <Picker.Item label="Stock" value="Stock" />
                <Picker.Item label="ETF" value="ETF" />
                <Picker.Item label="CASH" value="CASH" />
              </Picker>
            </View>
          </ScrollView>
          
          <View style={styles.buttonContainer}>
            {isEditing && (
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Text style={styles.buttonText}>Delete</Text>
              </TouchableOpacity>
            )}
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
                <Text style={styles.buttonText}>{isEditing ? 'Update' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  formContainer: {
    width: '90%',
    maxHeight: '90%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    elevation: 5,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    marginBottom: 5,
    color: '#555',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
  },
  picker: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    overflow: 'hidden',
  },
  buttonContainer: {
    marginTop: 10,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cancelButton: {
    backgroundColor: '#888',
    padding: 10,
    borderRadius: 5,
    width: '48%',
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: '#0066cc',
    padding: 10,
    borderRadius: 5,
    width: '48%',
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
    padding: 10,
    borderRadius: 5,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default AddStockForm;

// App.js - Rewritten UI Structure
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Modal, StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, Pressable,
    ActivityIndicator, Alert, Platform, TextInput, Dimensions, FlatList
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ConnectionErrorModal from './ConnectionErrorModal';
import Dashboard from './Dashboard';
import { TrendingUp, BarChart3, BarChart4, BarChartHorizontal, LineChart, PieChart, Users } from 'lucide-react';
import PortfolioSummary from './PortfolioSummary';
import Header from './components/Header';
import SchemaRAGChatbox from './SchemaRAGChatbox';

// --- Import Service Functions ---
import {
    fetchPortfolioSummary, fetchInvestmentAccounts, addInvestmentAccount,
    updateInvestmentAccount, deleteInvestmentAccount, bulkImportInvestmentAccounts,
    truncateInvestmentAccounts, refreshPortfolioDataIfNeeded, fetchPortfolioHistory
} from './stocksService';

// --- Import Components ---
import AddStockForm from './AddStockForm';
import { useSupabaseConfig } from './SupabaseConfigContext';
import GeneralChatbox from './GeneralChatbox'; // Existing
import { setupPortfolioSubscription } from './services/portfolioService';

// --- Helper Functions ---
import DashboardSummary from './components/DashboardSummary';
import HoldingListItem from './components/HoldingListItem';
import { formatNumber, formatTimestamp } from './utils/formatters';

// --- Import New Components ---
import BottomNavBar from './components/BottomNavBar';
import MenuDrawer from './components/MenuDrawer';
import ImportConfirmationModal from './components/ImportConfirmationModal';
import PopupNotification from './components/PopupNotification';
import AccountCard from './components/AccountCard';

// --- Main App Component ---
export default function App() {
    // --- State (Keep ALL existing state variables) ---
    const [summaryData, setSummaryData] = useState([]);
    const [investmentAccountsData, setInvestmentAccountsData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('portfolio'); // Default tab
    const [error, setError] = useState(null);
    const [isAddingStock, setIsAddingStock] = useState(false);
    const [selectedStock, setSelectedStock] = useState(null);
    const [isEditingStock, setIsEditingStock] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const [globalSearchTerm, setGlobalSearchTerm] = useState('');
    const [isClearDataModalVisible, setIsClearDataModalVisible] = useState(false);
    const [isPopupVisible, setIsPopupVisible] = useState(false);
    const [popupMessage, setPopupMessage] = useState('');
    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [importData, setImportData] = useState(null);
    const [isDisconnectModalVisible, setIsDisconnectModalVisible] = useState(false);
    const [lastRefreshedTimestamp, setLastRefreshedTimestamp] = useState(null);
    const [isConnectionErrorModalVisible, setIsConnectionErrorModalVisible] = useState(false);
    const [connectionErrorMessage, setConnectionErrorMessage] = useState('');
    const [expandedAccounts, setExpandedAccounts] = useState({});
    const [portfolioSearchTerm, setPortfolioSearchTerm] = useState('');
    const [portfolioSortBy, setPortfolioSortBy] = useState('ticker');
    const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(true);
    const [isValueVisible, setIsValueVisible] = useState(false);
    const [isChatboxVisible, setIsChatboxVisible] = useState(false);    const [isChatPanelLow, setIsChatPanelLow] = useState(false); // true if panel is minimized/low
    const [isChatboxMinimized, setIsChatboxMinimized] = useState(false); // New state for chatbox minimized status
    

    const { supabaseClient, clearConfig } = useSupabaseConfig();

    // --- Effects ---
    useEffect(() => {
        if (!supabaseClient) {
            console.log("No Supabase client available for subscription");
            return;
        }
        // Set up portfolio subscription
        const subscription = setupPortfolioSubscription(supabaseClient, (payload) => {
            console.log('Portfolio updated:', payload);
            // Handle any UI updates needed when portfolio changes
        });

        // Cleanup subscription on unmount
        return () => {
            if (subscription) {
                subscription.unsubscribe();
            }
        };
    }, [supabaseClient]);

    // --- Data Loading (Ensure it calls without forcing it) ---
      const loadData = useCallback(async (showPopup = true) => {
        if (!supabaseClient || !clearConfig) {
          console.error("Supabase client or clearConfig not available in loadData");
          // If clearConfig isn't available, we can't redirect, show error
          setError("Configuration context error. Cannot proceed.");
          setIsLoading(false);
          return;
        }
        console.log("loadData triggered");
        setIsLoading(true);
        setError(null); // Clear previous errors
        setLastRefreshedTimestamp(null);
    
        try {
          // Call refresh check WITHOUT forcing it (allow time-based check)
          // This might throw an error if connection fails here
          await refreshPortfolioDataIfNeeded(supabaseClient /*, false */);
          console.log("Potential refresh complete.");
    
          // Fetch latest data AFTER potential refresh
          // This might also throw an error if connection fails
          const [summaryResult, accountsResult, historyResult] = await Promise.all([
            fetchPortfolioSummary(supabaseClient),
            fetchInvestmentAccounts(supabaseClient),
            fetchPortfolioHistory(supabaseClient, 1)
          ]);
          // --- Process fetched data (if successful) ---
          let latestTimestamp = null;
          if (historyResult && historyResult.length > 0) latestTimestamp = historyResult[historyResult.length - 1]?.created_at;
          setLastRefreshedTimestamp(latestTimestamp);
          setSummaryData(summaryResult || []);
          setInvestmentAccountsData(accountsResult || []);
          console.log("Data processed and state updated.");
    
          if (showPopup) {
            setPopupMessage('Portfolio data refreshed successfully!');
            setIsPopupVisible(true);
            setTimeout(() => setIsPopupVisible(false), 2000);
          }
          // --- End Process fetched data ---
    
        } catch (err) {
          console.error('Error loading data:', err);
          const errorMessage = err.message || 'An unknown error occurred';
    
          // --- Check for specific connection/auth errors ---
          const isAuthOrConnectionError =
            errorMessage.includes('JWT') ||
            errorMessage.includes('Unauthorized') ||
            errorMessage.includes('Invalid API key') || // Check for the specific error
            errorMessage.includes('fetch'); // General network/fetch error
    
            if (isAuthOrConnectionError) {
              console.log("Authentication or connection error detected. Showing custom modal.");
              // Set state to show the custom modal instead of Alert.alert
              setConnectionErrorMessage(`Failed to connect to Supabase. \nPlease verify your URL and Key. \n\nError: ${errorMessage}\n\n`);
              setIsConnectionErrorModalVisible(true);
              // Don't call clearConfig here, wait for modal OK press
      
            } else {
              // Handle other errors (show inline error or maybe another modal)
              setError(`Failed to load portfolio: ${errorMessage}`);
              // Alert.alert('Error Loading Data', `Could not load portfolio data. ${errorMessage}`); // Or use another modal
              setSummaryData([]);
              setInvestmentAccountsData([]);
            }
          } finally {
            setIsLoading(false);
            console.log("loadData finished");
          }
        }, [supabaseClient, clearConfig]);
    
        // --- Handler for Connection Error Modal OK Button ---
        const handleConnectionErrorOk = async () => {
          setIsConnectionErrorModalVisible(false); // Hide the modal first
          try {
            console.log("Connection Error Modal OK pressed. Calling clearConfig...");
            await clearConfig(); // Clear config and trigger SetupScreen
            console.log("clearConfig finished.");
          } catch (clearError) {
            console.error("Failed to clear config:", clearError);
            setError("Failed to reset configuration. Please restart the app.");
            // Maybe show another modal/alert here for this secondary error
          }
        };
        
    // --- Effects (Keep existing useEffects) ---
    useEffect(() => { if (supabaseClient) loadData(); }, [supabaseClient, loadData]);
    // This effect is now for the Account Detail search, not global tab switching

    // --- File Handling / Import ---
      const handleFileSelect = async (result) => {
        try {
          setError(null);
          console.log("handleFileSelect received:", result);
          const fileUri = result.uri;
          const fileName = result.name;

          if (!fileUri) {
            throw new Error("No file URI found in result.");
          }

          // CSV handling
          if (fileUri.endsWith('.csv') || (result.mimeType && result.mimeType.includes('csv'))) {
            let csvContent;
            if (Platform.OS === 'web') {
              const response = await fetch(fileUri);
              csvContent = await response.text();
            } else {
              csvContent = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
            }
            // Parse CSV to JSON using XLSX
            const workbook = XLSX.read(csvContent, { type: 'string' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            await processExcelData(jsonData);
            return;
          }

          console.log(`Handling file: ${fileName}, URI: ${fileUri}`);
          if (Platform.OS === 'web') {
            console.log("Running web file handling logic...");
            // On web, the URI is often a blob URL. Fetch it.
            try {
                console.log("Attempting to fetch data URI...");
                const response = await fetch(fileUri);
                console.log(`Fetch response status: ${response.status}, ok: ${response.ok}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch file data: ${response.statusText}`);
                }
                console.log("Fetching blob from response...");
                const blob = await response.blob();
                console.log(`Blob fetched, size: ${blob.size}, type: ${blob.type}`);

                const reader = new FileReader();
                reader.onload = async (e) => {
                  console.log("FileReader onload triggered.");
                  try {
                    if (!e.target || !e.target.result) {
                        setIsLoading(false);
                        throw new Error("FileReader onload event target or result is missing.");
                    }
                    console.log("Reading data as Uint8Array...");
                    const data = new Uint8Array(e.target.result);
                    console.log(`Data read, length: ${data.length}. Parsing workbook...`);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    console.log(`Using sheet: ${sheetName}`);
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);
                    console.log(`Parsed ${jsonData.length} rows. Processing data...`);
                    await processExcelData(jsonData);
                    console.log("processExcelData finished.");
                  } catch (error) { console.error('Error processing Excel (Web onload):', error); Alert.alert('Error', `Excel processing failed: ${error.message}`); setIsLoading(false); }
                };
                reader.onerror = (error) => { console.error('FileReader error:', error); Alert.alert('Error', 'Failed to read file'); setIsLoading(false); };
                console.log("Calling reader.readAsArrayBuffer...");
                reader.readAsArrayBuffer(blob); // Read the fetched blob
            } catch (fetchError) {
                console.error('Error during web file fetch/blob handling:', fetchError);
                Alert.alert('Error', `Failed to handle file: ${fetchError.message}`);
                setIsLoading(false); // Ensure loading stops on fetch error
            }
          } else {
            console.log("Running native file handling logic...");
            const base64Content = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
            const workbook = XLSX.read(base64Content, { type: 'base64' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            await processExcelData(jsonData);
          }
        } catch (error) { console.error('File selection/reading error:', error); Alert.alert('Error', `File handling error: ${error.message}`); setIsLoading(false); }
      };
    
      const processExcelData = async (data) => {
        try {
            console.log("Processing Excel data...");
          if (!data || data.length === 0) throw new Error('No data found in Excel');
          validateData(data);
          const normalizedData = data.map((row, index) => {
            const findColumnValue = (obj, prefixes) => {
                //for (const prefix of prefixes) { const key = Object.keys(obj).find(k => k.toLowerCase().trim() === prefix.toLowerCase()); if (key && obj[key] !== null && obj[key] !== undefined) return obj[key]; }
                //for (const prefix of prefixes) { const key = Object.keys(obj).find(k => k.toLowerCase().trim().includes(prefix.toLowerCase())); if (key && obj[key] !== null && obj[key] !== undefined) { console.warn(`Fallback match for '${prefix}' in row ${index + 1}. Key: '${key}'`); return obj[key]; } }
                const rowKeys = Object.keys(obj);
                // 1. Exact match (case-insensitive, trimmed)
                for (const prefix of prefixes) {
                    const key = rowKeys.find(k => k.toLowerCase().trim() === prefix.toLowerCase());
                    if (key && obj[key] !== null && obj[key] !== undefined) {
                        // console.log(`Row ${index + 1}: Exact match found for '${prefix}' -> Key: '${key}', Value: '${obj[key]}'`);
                        return obj[key];
                    }
                }
                // 2. Fallback: Includes match (case-insensitive, trimmed) - Use with caution
                // for (const prefix of prefixes) { const key = rowKeys.find(k => k.toLowerCase().trim().includes(prefix.toLowerCase())); if (key && obj[key] !== null && obj[key] !== undefined) { console.warn(`Row ${index + 1}: Fallback match for '${prefix}'. Key: '${key}', Value: '${obj[key]}'`); return obj[key]; } }
                return null;
            };
            const ticker = findColumnValue(row, ['ticker', 'symbol']);
            const account = findColumnValue(row, ['account', 'accountname']);
            const quantity = findColumnValue(row, ['quantity', 'shares', 'units']);
            const costBasis = findColumnValue(row, ['costbasis', 'cost_basis', 'cost', 'price']);
            const type = findColumnValue(row, ['type', 'securitytype']); // Keep type if needed by Edge Func
            if (ticker === null) throw new Error(`Missing ticker in row ${index + 1}`);
            if (account === null) throw new Error(`Missing account in row ${index + 1}`);
            if (quantity === null || isNaN(parseFloat(quantity))) throw new Error(`Missing/invalid quantity in row ${index + 1}`);
            if (costBasis === null || isNaN(parseFloat(costBasis))) throw new Error(`Missing/invalid cost basis in row ${index + 1}`);
            return { ticker: String(ticker).trim().toUpperCase(), account: String(account).trim(), quantity: parseFloat(quantity), cost_basis: parseFloat(costBasis), type: type ? String(type).trim().toLowerCase() : null };
          });
          setImportData(normalizedData);
          setIsImportModalVisible(true);
          setIsLoading(false);
        } catch (error) { console.error('Excel processing error:', error); setError(`Excel Processing Error: ${error.message}`); Alert.alert('Excel Processing Error', error.message); setIsLoading(false); }
      };
    
      // --- Bulk Import ---
      const handleBulkImport = async () => {
        if (!supabaseClient || !importData) { setError("Config/data error."); setIsImportModalVisible(false); setImportData(null); return; }
        setIsImportModalVisible(false); setIsLoading(true);
        try {
          console.log('Starting bulk import into investment_accounts...');
          const result = await bulkImportInvestmentAccounts(supabaseClient, importData);
          console.log('Import completed:', result?.length ?? 0, 'rows affected.');
    
          if (result) {
            // Force refresh AFTER import succeeds and WAIT for it
            console.log("Forcing portfolio refresh after bulk import...");
            await refreshPortfolioDataIfNeeded(supabaseClient, true); // <-- Force refresh and await
            console.log("Refresh after bulk import complete.");
    
            // Now load the fresh data
            await loadData(false); // Reload data without popup after refresh
    
            setPopupMessage(`Imported ${result.length} transactions successfully!`);
            setIsPopupVisible(true);
            setTimeout(() => setIsPopupVisible(false), 2000);
          } else {
            throw new Error('Bulk import function returned no result.');
          }
        } catch (error) {
          console.error('Import or refresh error:', error); // Catch errors from import OR refresh
          setError(`Import failed: ${error.message}`);
          Alert.alert('Import Error', `Failed to import transactions: ${error.message}`);
        } finally {
          setImportData(null);
          setIsLoading(false);
        }
      };
    
      // --- Add/Edit/Delete Handlers ---
      const handleAddStock = async (formData) => {
        // *** Set loading true immediately ***
        setIsLoading(true);
        // Hide the form right away
        setIsAddingStock(false);
        if (!supabaseClient) { setError("Configuration error."); 
          setIsLoading(false); // Ensure loading stops on early exit
          return; }
        
        try {
          setIsLoading(true);
          if (!formData.ticker?.trim()) throw new Error('Ticker required');
          if (!formData.account?.trim()) throw new Error('Account required');
          const quantity = parseFloat(formData.quantity);
          const costBasis = parseFloat(formData.costBasis);
          if (isNaN(quantity)) throw new Error('Quantity must be a number');
          if (isNaN(costBasis) || (quantity > 0 && costBasis <= 0)) throw new Error('Cost basis must be positive for buys');
          const transactionData = { ticker: formData.ticker.trim().toUpperCase(), account: formData.account.trim(), quantity: quantity, cost_basis: costBasis };
          // 1. Add to DB
          await addInvestmentAccount(supabaseClient, transactionData);
          Alert.alert("Success", `Transaction for ${transactionData.ticker} added!`);
    
          // 2. Force Edge Function execution and WAIT
          console.log("Forcing portfolio refresh after add...");
          await refreshPortfolioDataIfNeeded(supabaseClient, true);
          console.log("Refresh after add complete.");
    
          // 3. Fetch updated data AFTER refresh
          const [updatedSummary, updatedTransactions] = await Promise.all([
              fetchPortfolioSummary(supabaseClient),
              fetchInvestmentAccounts(supabaseClient)
          ]);
    
          // 4. Update local state
          setSummaryData(updatedSummary || []);
          setInvestmentAccountsData(updatedTransactions || []);
          setIsAddingStock(false);
    
        } catch (error) {
            console.error('Error adding transaction or refreshing:', error);
            Alert.alert('Error', `Failed to add transaction: ${error.message}`);
            // Optionally try to reload data even on error?
            // await loadData(false);
        } finally {
          setIsLoading(false);
        }
      };
    
      const handleEditStock = (transaction) => {
        const transactionToEdit = { ...transaction, costBasis: transaction.cost_basis ?? 0 };
        setSelectedStock(transactionToEdit); 
        setIsEditingStock(true);             
        setIsAddingStock(true);
      };
    
      const handleUpdateStock = async (formData) => {
        if (!supabaseClient) { setError("Configuration error."); setIsLoading(false); return; }
        if (!selectedStock || !selectedStock.id) { Alert.alert('Error', 'No transaction selected.'); setIsLoading(false); return; }
        try {
          setIsLoading(true);
          let operationSuccess = false;
          let alertMessage = '';
          if (formData.action === 'delete') {
            await deleteInvestmentAccount(supabaseClient, selectedStock.id); // Use ID for delete
            alertMessage = "Transaction deleted!";
            operationSuccess = true;
          } else {
            // Validation for update
            const quantity = parseFloat(formData.quantity); // Parse here
            const costBasis = parseFloat(formData.costBasis); // Parse here
    
            if (isNaN(quantity) || quantity < 0) { // Allow 0 quantity?
                throw new Error('Quantity must be a non-negative number.');
            }
            if (isNaN(costBasis) || (quantity > 0 && costBasis <= 0)) {
                 throw new Error('Cost basis must be positive for buys/holds.');
            }
    
            const updatePayload = {
                quantity: quantity, // Use parsed number
                cost_basis: costBasis, // Use parsed number
            };
            await updateInvestmentAccount(supabaseClient, selectedStock.id, updatePayload);
            alertMessage = "Transaction updated!";
            operationSuccess = true;
          }
    
        if (operationSuccess) {
          Alert.alert("Success", alertMessage);
    
          // 2. Force Edge Function execution and WAIT
          console.log("Forcing portfolio refresh after update/delete...");
          await refreshPortfolioDataIfNeeded(supabaseClient, true);
          console.log("Refresh after update/delete complete.");
    
          // 3. Fetch updated data AFTER refresh
          console.log("Fetching updated summary and transactions after refresh...");
          const [updatedSummary, updatedTransactions] = await Promise.all([
              fetchPortfolioSummary(supabaseClient),
              fetchInvestmentAccounts(supabaseClient)
          ]);
          console.log(`Fetched ${updatedSummary?.length} summary rows, ${updatedTransactions?.length} transaction rows.`);
    
          // 4. Update local state
          setSummaryData(updatedSummary || []);
          setInvestmentAccountsData(updatedTransactions || []);
          console.log("Local state updated with fresh data.");
        }
    
        setIsAddingStock(false); setIsEditingStock(false); setSelectedStock(null);
    
      } catch (error) {
          console.error('Error managing transaction or refreshing:', error);
          Alert.alert('Error', `Failed to ${formData.action || 'update'} transaction: ${error.message}`);
          // Optionally try to reload data even on error?
          // await loadData(false);
      } finally {
        setIsLoading(false);
      }
    };
      // --- Clear All Data (Already forces and awaits refresh) ---
      const handleClearAllData = () => { // <--- DEFINE THIS FUNCTION
        setIsClearDataModalVisible(true);
    };  
      const confirmClearAllData = async () => {
        if (!supabaseClient) { /* ... error handling ... */ return; }
        try {
          setIsLoading(true);
          console.log("Confirming delete all investment accounts...");
    
          // 1. Clear transactions in DB
          await truncateInvestmentAccounts(supabaseClient);
          console.log("Investment accounts table cleared.");
    
          // 2. Immediately clear local state for instant UI update
          setSummaryData([]);
          setInvestmentAccountsData([]);
          console.log("Local state cleared.");
    
          // 3. Force refresh and WAIT for Edge Function to complete zeroing summary
          console.log("Triggering background refresh (Edge Function - Forced) and waiting...");
          await refreshPortfolioDataIfNeeded(supabaseClient, true);
          console.log("Forced refresh complete.");
    
          // 4. Show success popup
          setPopupMessage('All transaction data cleared!');
          setIsPopupVisible(true);
          setTimeout(() => setIsPopupVisible(false), 1000);
    
          // 5. No immediate reload needed here, UI is clear, DB summary is zeroed.
          // The next loadData call will fetch the correct zeroed state.
    
        } catch (error) {
          console.error("Error clearing data or during forced refresh:", error);
          Alert.alert('Error', `Failed to clear transaction data: ${error.message}`);
        } finally {
          setIsClearDataModalVisible(false);
          setIsLoading(false);
        }
      };
    
      // --- Disconnect ---
      const handleDisconnect = () => setIsDisconnectModalVisible(true); // Show disconnect modal
      const confirmDisconnect = async () => {
        setIsDisconnectModalVisible(false);
        try {
            await clearConfig(); // Call clearConfig from context
            // Reset app state immediately
            setSummaryData([]);
            setInvestmentAccountsData([]);
            setError(null);
            setLastRefreshedTimestamp(null);
            // The AppWrapper should handle showing the SetupScreen now
            // Optionally show a success message before the screen changes
            // setPopupMessage('Disconnected successfully!');
            // setIsPopupVisible(true);
            // setTimeout(() => setIsPopupVisible(false), 2000);
        } catch (error) {
            console.error("Error during disconnect:", error);
            Alert.alert("Error", "Failed to disconnect. Please try again.");
        }
      };
    
      // --- Data Validation Helper ---
      const validateData = (data) => {
        if (!Array.isArray(data) || data.length === 0) throw new Error('No data rows found');
        const firstRow = data[0];
        const columns = Object.keys(firstRow).map(key => key.toLowerCase().trim());
        const requiredColumns = [
          { names: ['ticker', 'symbol'], label: 'Ticker/Symbol' },
          { names: ['account', 'accountname'], label: 'Account' },
          { names: ['quantity', 'shares', 'units'], label: 'Quantity/Shares' },
          { names: ['costbasis', 'cost_basis', 'cost', 'price'], label: 'Cost Basis/Price' },
          // { names: ['type', 'securitytype'], label: 'Type' } // Type might be optional
        ];
        requiredColumns.forEach(req => {
          const hasColumn = req.names.some(name => columns.includes(name));
          if (!hasColumn) {
             const hasPartialMatch = req.names.some(name => columns.some(col => col.includes(name)));
             if (!hasPartialMatch) throw new Error(`Missing required column: ${req.label}`);
             else console.warn(`Potential column mismatch for ${req.label}.`);
          }
        });
        return true;
      };
    
    // --- Helper for Account Detail View ---
    const toggleAccountExpansion = (accountName) => {
        setExpandedAccounts(prev => ({ ...prev, [accountName]: !prev[accountName] }));
    };

    // Group accounts for Account Detail View
    const groupedAccounts = useMemo(() => {
        const grouped = {};
        (investmentAccountsData || []).forEach(tx => {
            const accountName = tx.account || 'Uncategorized';
            if (!grouped[accountName]) grouped[accountName] = { transactions: [], totalValue: 0, totalCost: 0, pnl: 0, pnlPercentage: 0 };
            const currentPrice = summaryData.find(s => s.ticker === tx.ticker)?.current_price ?? (tx.ticker === 'CASH' ? 1 : 0);
            const quantity = tx.quantity ?? 0;
            const costBasis = tx.cost_basis ?? 0;
            const currentValue = currentPrice * quantity;
            const costValue = costBasis * quantity;
            grouped[accountName].transactions.push({ ...tx, currentPrice, currentValue, costValue, pnl: currentValue - costValue });
            grouped[accountName].totalValue += currentValue;
            grouped[accountName].totalCost += costValue;
        });
        Object.keys(grouped).forEach(accountName => {
            const account = grouped[accountName];
            account.pnl = account.totalValue - account.totalCost;
            account.pnlPercentage = account.totalCost > 0 ? (account.pnl / account.totalCost) * 100 : 0;
        });
        return grouped;
    }, [investmentAccountsData, summaryData]);

    // Filter accounts based on search term for Account Detail View
    const filteredGroupedAccounts = useMemo(() => {
        if (!globalSearchTerm) return groupedAccounts;
        const filtered = {};
        const searchTermLower = globalSearchTerm.toLowerCase();
        // Create a quick lookup map for company names from summaryData
        const companyNameMap = new Map(summaryData.map(item => [item.ticker, item.company_name]));

        Object.keys(groupedAccounts).forEach(accountName => {
            const account = groupedAccounts[accountName];
            // Check if account name matches
            const accountNameMatch = (accountName || '').toLowerCase().includes(searchTermLower);
            // Check if any transaction ticker OR company name matches
            const filteredTransactions = account.transactions.filter(tx =>
                (tx.ticker || '').toLowerCase().includes(searchTermLower) ||
                (companyNameMap.get(tx.ticker) || '').toLowerCase().includes(searchTermLower) // Check company name
            );
            // Include the account if the account name matches OR any of its transactions match ticker/company name
            if (accountNameMatch || filteredTransactions.length > 0) {
                filtered[accountName] = { ...account, transactions: filteredTransactions };
            }
        });
        return filtered;
    }, [groupedAccounts, globalSearchTerm]);

    // --- Effect to Auto-Expand Accounts on Navigation (Moved Here) ---
    useEffect(() => {
        // Only run when switching TO the accountDetail tab
        if (activeTab === 'accountDetail') { 
            // If search term is cleared, collapse all cards
            if (!globalSearchTerm) {
                setExpandedAccounts({});
                return; // Exit early
            }

            // Get the names of accounts currently filtered/visible
            const visibleAccountNames = Object.keys(filteredGroupedAccounts);
            if (visibleAccountNames.length > 0) {
                const newExpandedState = {};
                visibleAccountNames.forEach(name => {
                    newExpandedState[name] = true; // Expand accounts matching search
                });
                setExpandedAccounts(newExpandedState);
            }
        }
    }, [activeTab, filteredGroupedAccounts, globalSearchTerm]); // Add globalSearchTerm dependency


    // --- Render Active Tab Content ---
    const renderActiveTabContent = () => {
        const formattedTimestamp = formatTimestamp(lastRefreshedTimestamp);
        const activeHoldings = summaryData.filter(s => s.total_quantity && s.total_quantity > 0);
        
        // Add filtering based on search term
        const filteredHoldings = portfolioSearchTerm
            ? activeHoldings.filter(holding => 
                holding.ticker.toLowerCase().includes(portfolioSearchTerm.toLowerCase()) ||
                (holding.company_name && holding.company_name.toLowerCase().includes(portfolioSearchTerm.toLowerCase()))
            )
            : activeHoldings;

        const sortedHoldings = [...filteredHoldings].sort((a, b) => {
            if (portfolioSortBy === 'value') {
                return (b.market_value || 0) - (a.market_value || 0);
            } else if (portfolioSortBy === 'ticker') {
                return (a.ticker || '').localeCompare(b.ticker || '');
            } else if (portfolioSortBy === 'pnl') {
                return (b.pnl_dollar || 0) - (a.pnl_dollar || 0);
            }
            return 0;
        });
        switch (activeTab) {
            case 'portfolio':
                return (
                    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                        <PortfolioSummary summaryData={summaryData} onMenuPress={() => setMenuVisible(true)} />
                        {/* --- Last Updated Timestamp --- */}
                        {formattedTimestamp && (
                            <View style={newStyles.timestampContainer}>
                                <Text style={newStyles.timestampText}>
                                    Last updated: {formattedTimestamp} (Refreshes if &gt; 2hrs old)
                                </Text>
                            </View>
                        )}
                        {/* --- End Timestamp --- */}
                        {/* --- Search and Sort UI --- */}
                        <View style={newStyles.portfolioListControls}>
                            <View style={newStyles.portfolioSearchWrapper}>
                                <TextInput
                                    style={newStyles.portfolioSearchInput}
                                    placeholder="Search Holdings..."
                                    value={portfolioSearchTerm}
                                    onChangeText={setPortfolioSearchTerm}
                                    clearButtonMode="while-editing"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                                {portfolioSearchTerm ? (
                                    <TouchableOpacity style={newStyles.clearSearchButton} onPress={() => setPortfolioSearchTerm('')}>
                                        <Text style={newStyles.clearSearchText}>✕</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                            <View style={newStyles.portfolioSortWrapper}>
                                <Picker
                                    selectedValue={portfolioSortBy}
                                    style={newStyles.portfolioSortPicker}
                                    onValueChange={(itemValue) => setPortfolioSortBy(itemValue)}
                                    // Add dropdownIconColor if needed for styling
                                >
                                    <Picker.Item label="Sort by Value" value="value" />
                                    <Picker.Item label="Sort by Ticker" value="ticker" />
                                    <Picker.Item label="Sort by P&L" value="pnl" />
                                </Picker>
                            </View>
                        </View>
                        {/* --- End Search and Sort UI --- */}

                        {/* Conditional Rendering for List */}
                        {isLoading && activeHoldings.length === 0 ? ( // Show loading only if list is empty
                            <View style={newStyles.loadingContainer}>
                                <ActivityIndicator size="large" color={newStyles.primaryColor.color} />
                                <Text style={newStyles.loadingText}>Loading...</Text>
                            </View>
                        ) : activeHoldings.length === 0 ? (
                            <View style={newStyles.emptyStateContainer}><Text style={newStyles.emptyStateText}>No active holdings.</Text></View>
                        ) : (
                            <FlatList
                                data={sortedHoldings} 
                                //data={activeHoldings.sort((a, b) => (b.market_value || 0) - (a.market_value || 0))} // Sort by value desc
                                renderItem={({ item }) => (
                                    <HoldingListItem
                                        item={item}
                                        onPress={() => {
                                            setActiveTab('accountDetail');
                                            //setGlobalSearchTerm(item.ticker); // Pre-fill search for account detail
                                            setGlobalSearchTerm(item.company_name || item.ticker); // Search by NAME, fallback to ticker
                                        }}
                                    />
                                )
                                }
                                keyExtractor={(item) => item.ticker}
                                contentContainerStyle={{ paddingBottom: 80 }} // Space for FAB and NavBar
                                extraData={portfolioSearchTerm + portfolioSortBy}
                                //ListHeaderComponent={<Text style={newStyles.listHeader}>Holdings</Text>}
                            />
                        )}
                    </ScrollView>
                );
            case 'accountDetail':
                 const accountNames = Object.keys(filteredGroupedAccounts).sort();
                return (
                    <View style={{ flex: 1 }}>
                         <View style={newStyles.accountSearchContainer}>
                            <TextInput
                                style={newStyles.accountSearchInput}
                                placeholder="Search Accounts or Tickers..."
                                value={globalSearchTerm}
                                onChangeText={setGlobalSearchTerm}
                                clearButtonMode="while-editing"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </View>
                        {isLoading && accountNames.length === 0 ? (
                            <View style={newStyles.loadingContainer}>
                                <ActivityIndicator size="large" color={newStyles.primaryColor.color} />
                                <Text style={newStyles.loadingText}>Loading...</Text>
                            </View>
                        ) : accountNames.length === 0 ? (
                             <View style={newStyles.emptyStateContainer}><Text style={newStyles.emptyStateText}>No accounts found{globalSearchTerm ? ' matching search' : ''}.</Text></View>
                        ) : (
                            <FlatList
                                data={accountNames}
                                renderItem={({ item: accountName }) => (
                                    <AccountCard
                                        accountName={accountName}
                                        accountData={filteredGroupedAccounts[accountName]}
                                        isExpanded={!!expandedAccounts[accountName]}
                                        onExpand={() => toggleAccountExpansion(accountName)}
                                        onTransactionPress={handleEditStock} // Use existing handler
                                        summaryData={summaryData} // Pass summary for type lookup
                                    />
                                )}
                                keyExtractor={(item) => item}
                                contentContainerStyle={{ paddingBottom: 80 }} // Space for FAB and NavBar
                            />
                        )}
                    </View>
                );
            case 'dashboard':
                return <Dashboard />;
            default:
                return null;
        }
    };
    // --- Function to open the Add Stock modal ---
  const openAddStockModal = () => {
    setSelectedStock(null); setIsEditingStock(false); setIsAddingStock(true);
  };
    // --- Function to trigger file selection ---
    const triggerFileSelect = async () => {
        setMenuVisible(false); // Close menu immediately
        setIsLoading(true); // Show loading indicator
        setError(null); // Clear previous errors
    
        try {
          const result = await DocumentPicker.getDocumentAsync({
            type: [
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
              'application/vnd.ms-excel', // .xls
              'text/csv', // .csv
            ],
            copyToCacheDirectory: Platform.OS !== 'web', // Recommended for native to ensure readability
          });
    
          console.log("Document Picker Result:", JSON.stringify(result, null, 2)); // Detailed log
    
          // Handle modern Expo SDK result structure (assets array)
          if (result.assets && result.assets.length > 0) {
            const asset = result.assets[0];
            if (!asset.uri) {
              throw new Error("File URI is missing from picker result.");
            }
            console.log(`Selected file: ${asset.name}, URI: ${asset.uri}`);
            await handleFileSelect(asset); // Pass the asset object
          }
          // Handle older Expo SDK result structure (type: 'success')
          else if (result.type === 'success' && result.uri) {
             console.warn("Using legacy DocumentPicker result structure.");
             console.log(`Selected file: ${result.name}, URI: ${result.uri}`);
             await handleFileSelect(result); // Pass the whole result object
          }
          // Handle cancellation
          else if (result.canceled || result.type === 'cancel') {
            console.log('File selection cancelled by user.');
            setIsLoading(false); // Stop loading on cancellation
          }
          // Handle unexpected result
          else {
            console.warn("Unexpected document picker result structure:", result);
            throw new Error("Failed to select file or unexpected result format.");
          }
        } catch (err) {
          console.error('Error picking document:', err);
          Alert.alert('Import Error', `Failed to select file: ${err.message}`);
          setIsLoading(false); // Ensure loading stops on error
        }
        // Note: setIsLoading(false) is handled within handleFileSelect on success/error there
      };
    
    const handleChatboxMinimizeChange = (minimized) => {
        setIsChatboxMinimized(minimized);
    };

    // --- Main Render ---
    return (
        <SafeAreaView style={newStyles.safeArea}>
            {/* <Header onMenuPress={() => setMenuVisible(true)} /> */}

            {error && <Text style={newStyles.errorText}>{error}</Text>}

            {/* Main Content Area */}
            <View style={newStyles.contentArea}>
                {renderActiveTabContent()}
            </View>

            {/* Bottom Navigation */}
            <View style={[newStyles.navBarContainer, { zIndex: 1000 }]}>
                <BottomNavBar activeTab={activeTab} setActiveTab={setActiveTab} />
            </View>

            {/* Floating Add Button */}
            {activeTab !== 'dashboard' && activeTab !== 'history' && (!isChatboxVisible || isChatboxMinimized) && (
                <TouchableOpacity style={[newStyles.fab, { zIndex: 1000 }]} onPress={openAddStockModal}>
                    <Text style={newStyles.fabText}>+</Text>
                </TouchableOpacity>
            )}

            {/* Chat Button */}
            {!isChatboxVisible && (
                <TouchableOpacity
                    style={[newStyles.chatButton, { zIndex: 1000 }]}
                    onPress={() => setIsChatboxVisible(true)}
                    activeOpacity={0.85}
                >
                    <Text style={{ fontSize: 28, color: 'white' }}>💬</Text>
                </TouchableOpacity>
            )}

            {/* Chatbox */}
            {isChatboxVisible && (
                <View style={[newStyles.chatboxWrapper, { zIndex: 100 }]}>
                    <SchemaRAGChatbox
                        onClose={() => {
                            setIsChatboxVisible(false);
                            setIsChatboxMinimized(false); // Reset minimized state when chatbox is closed
                        }}
                        onMinimizeChange={handleChatboxMinimizeChange} // Pass the callback
                    />
                </View>
            )}

            {/* Other Modals */}
            <MenuDrawer
                visible={menuVisible}
                onClose={() => setMenuVisible(false)}
                onImportPress={() => {
                    setMenuVisible(false);
                    triggerFileSelect();   // Call the file selection function
                }}
                onClearDataPress={() => { setMenuVisible(false); handleClearAllData(); }}
                onDisconnectPress={() => { setMenuVisible(false); handleDisconnect(); }}
            />
            <AddStockForm
              visible={isAddingStock}
              onClose={() => { setIsAddingStock(false); setIsEditingStock(false); setSelectedStock(null); }}
              onSubmit={isEditingStock ? handleUpdateStock : handleAddStock}
              initialValues={selectedStock}
              isEditing={isEditingStock}
              loading={isLoading}
            />
            <Modal visible={isClearDataModalVisible} /* ... existing props ... */ >
                {/* ... existing Clear Data Modal JSX ... */}
                 <View style={newStyles.modalOverlay}><View style={newStyles.modalContainer}><Text style={newStyles.modalTitle}>Confirm Clear Data</Text><Text style={newStyles.modalMessage}>Delete ALL transactions from 'investment_accounts'? This cannot be undone.</Text><View style={newStyles.modalButtons}><TouchableOpacity style={[newStyles.modalButton, newStyles.cancelButton]} onPress={() => setIsClearDataModalVisible(false)}><Text style={newStyles.cancelButtonText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={[newStyles.modalButton, newStyles.confirmButton, { backgroundColor: '#dc3545' }]} onPress={confirmClearAllData}><Text style={newStyles.confirmButtonText}>Delete All</Text></TouchableOpacity></View></View></View>
            </Modal>
            <Modal visible={isDisconnectModalVisible} /* ... existing props ... */ >
                {/* ... existing Disconnect Modal JSX ... */}
                 <View style={newStyles.modalOverlay}><View style={newStyles.modalContainer}><Text style={newStyles.modalTitle}>Confirm Disconnect</Text><Text style={newStyles.modalMessage}>Disconnect and clear saved Supabase credentials?</Text><View style={newStyles.modalButtons}><TouchableOpacity style={[newStyles.modalButton, newStyles.cancelButton]} onPress={() => setIsDisconnectModalVisible(false)}><Text style={newStyles.cancelButtonText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={[newStyles.modalButton, newStyles.confirmButton]} onPress={confirmDisconnect}><Text style={newStyles.confirmButtonText}>Disconnect</Text></TouchableOpacity></View></View></View>
            </Modal>
            <ImportConfirmationModal visible={isImportModalVisible} data={importData} onCancel={() => { setIsImportModalVisible(false); setImportData(null); setIsLoading(false); }} onConfirm={handleBulkImport} />
            <ConnectionErrorModal visible={isConnectionErrorModalVisible} message={connectionErrorMessage} onOkPress={handleConnectionErrorOk} />
            <PopupNotification visible={isPopupVisible} message={popupMessage} />
        </SafeAreaView>
    );
}

// --- New Styles ---
const newStyles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F4F7FC', // Light background color
    },
    contentArea: {
        flex: 1,
        backgroundColor: '#F4F7FC',
        position: 'relative',
        zIndex: 1,
    },
    contentAreaWithChat: {
        marginBottom: 80, // Space for minimized chat
    },
    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingTop: Platform.OS === 'ios' ? 10 : 15, // Adjust top padding
        paddingBottom: 10,
        backgroundColor: '#1A2E4C', // Dark blue header
    },
    headerButton: {
        width: 40, // Ensure tappable area
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerIcon: {
        color: '#FFFFFF',
        fontSize: 24,
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
    },
    // Bottom Nav Bar
    navBarContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E0E7F1',
        //zIndex: 1, // Lower z-index for nav bar
    },
    navItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 8,
    },
    navText: {
        fontSize: 22, // Emoji size
        color: '#8A94A6', // Inactive color
    },
    navTextActive: {
        color: '#0066cc', // Active color (primary)
    },
    navLabel: {
        fontSize: 10,
        color: '#8A94A6',
        marginTop: 2,
    },
    navLabelActive: {
        color: '#0066cc',
        fontWeight: '600',
    },
    // Summary Card (Dashboard)
    // Styles for DashboardSummary update
    summaryCard: { // Keep existing card styles
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 0, // Padding is now handled internally
        marginHorizontal: 15, // Keep horizontal margin
        marginTop: 15, // Keep top margin
        marginBottom: 10, // Reduce bottom margin        shadowColor: '#9DAABF',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 4,
        overflow: 'hidden', 
    },
    summaryHeaderTouchable: { // New style for the tappable header area
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14, // Reduce vertical padding
        paddingHorizontal: 16, // Reduce horizontal padding
    },
    summaryHeaderRight: { // Container for value and icon
        flexDirection: 'row',
        alignItems: 'center',
    },
    summaryLabel: { // Keep existing
        fontSize: 16,
        color: '#6C7A91',
        marginBottom: 4,
    },
    summaryValue: { // Keep existing (or adjust alignment if needed)
        fontSize: 28,
        fontWeight: '700',
        color: '#1A2E4C',
        // marginBottom: 8, // Removed margin, handled by container padding
        marginRight: 10, // Space before icon
    },
    summaryCollapseIcon: { // Style for the collapse icon
        fontSize: 18,
        color: '#6C7A91', // Muted color
    },
    summaryContentContainer: { // Container for content below header
        paddingHorizontal: 16,
        paddingBottom: 16, // Add bottom padding for content
        paddingTop: 0, // No top padding needed here
    },
    summaryPnlContainer: { // Keep existing
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4, // Add some space below header value
    },
    summaryPnlText: {
        fontSize: 15,
        fontWeight: '600',
        marginRight: 6,
    },
    summaryPnlPercent: {
        fontSize: 14,
        fontWeight: '500',
    },
    listHeader: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1A2E4C',
        paddingHorizontal: 15,
        marginTop: 10, // Space above list
        marginBottom: 5,
    },
    holdingCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        marginHorizontal: 15,
        marginBottom: 10,
        padding: 15,
        shadowColor: '#9DAABF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
    },
    holdingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    holdingTickerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    holdingTicker: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1A2E4C',
    },
    holdingType: {
        fontSize: 10,
        color: '#0066cc',
        backgroundColor: '#E7F5FF',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        marginLeft: 8,
        fontWeight: '500',
        overflow: 'hidden',
    },
    holdingInfoContainer: { // Left side container
        flex: 1, // Takes up space pushing price/value to the right
        marginRight: 10, // Space between left and right columns
    },
    holdingCompanyName: {
        fontSize: 12,
        color: '#6C7A91',
        marginTop: 2,
    },
    holdingPriceValueContainer: { // New container for price/value on the right
        alignItems: 'flex-end', // Align text to the right
    },
    holdingValueSubText: { // Style for the value (now below price on right)
        fontSize: 12,
        color: '#6C7A91', // Muted color like company name
    },
    holdingShares: { // Ensure shares text doesn't push P&L too far
        flexShrink: 1, // Allow shares text to shrink if needed
        marginRight: 10, // Add space between shares and P&L
        fontSize: 12,
        color: '#6C7A91',
    },
    holdingCurrentPrice: { // Style for the current price (now on top right)
        fontSize: 16, // Make it slightly larger like the old value
        fontWeight: '600',
        color: '#1A2E4C', // Darker color
        marginBottom: 2, // Space below price
    },
    holdingPnl: {
        fontSize: 12,
        fontWeight: '500',
        textAlign: 'right', // Ensure P&L aligns right
    },
    // Account Detail
    accountSearchContainer: {
        padding: 15,
        backgroundColor: '#F4F7FC', // Match background
        borderBottomWidth: 1,
        borderBottomColor: '#E0E7F1',
    },
    accountSearchInput: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        paddingHorizontal: 15,
        paddingVertical: 12,
        fontSize: 15,
        borderWidth: 1,
        borderColor: '#E0E7F1',
       },
    accountCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        marginHorizontal: 15,
        marginBottom: 12,
        shadowColor: '#9DAABF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
        overflow: 'hidden',
    },
    accountHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between', // Space out left, middle, right
        alignItems: 'center',
        padding: 15,
        backgroundColor: '#FAFBFC',
    },
    accountHeaderLeft: { // New style for left content
         flex: 1, // Allow left side to take up remaining space
    //     flexShrink: -1, // Allow shrinking if needed
         marginRight: 30, // Space between left and middle
    //     alignItems: 'flex-start', // Align text left
     },
     accountHeaderMiddle: { // New style for middle content
        
         width: 200, // Give the middle section a fixed width (adjust as needed)
        // alignItems: 'center', // Center value and P&L vertically
     },
       accountHeaderRight: { // New style for right content
        // This view is no longer used for value/pnl, only the icon
        //alignItems: 'flex-end', // Keep if needed for icon alignment
        flexDirection: 'row',
        alignItems: 'center',
    },
    accountName: {
        fontSize: 17,
        fontWeight: '600',
        color: '#1A2E4C',
    },
    accountSubText: {
        fontSize: 12,
        color: '#6C7A91',
        marginTop: 2,
    },
    accountValue: {
        fontSize: 16,
        fontWeight: '600',
        // textAlign: 'center', // Remove or set to 'left' (default)
        color: '#1A2E4C',
    },
    accountPnl: {
        fontSize: 12,
        fontWeight: '500',
        textAlign: 'left', // Remove or set to 'left' (default)
        marginTop: 2,
    },
    accountExpandIcon: {
        fontSize: 16,
        color: '#6C7A91', // Keep icon on the far right
        marginLeft: 10,
    },
    accountDetailsContent: {
        paddingHorizontal: 15,
        paddingBottom: 10,
        borderTopWidth: 1,
        borderTopColor: '#E0E7F1',
    },
    transactionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F4F7FC', // Lighter separator
    },
    transactionLeft: {
        flexDirection: 'row',
        flex: 1, // Allow left side to take available space
        alignItems: 'center',
        marginRight: 8, // Space between left and right
    },
    transactionTicker: {
        fontSize: 14, // Slightly smaller
        fontWeight: '500',
        color: '#1A2E4C',
    },
    transactionType: {
        fontSize: 10,
        color: '#0066cc',
        backgroundColor: '#E7F5FF',
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 6,
        marginLeft: 6,
        fontWeight: '500',
        overflow: 'hidden',
    },
    transactionRight: {
        alignItems: 'flex-end', // Align text to the right
        flexShrink: 0, // Prevent right side from shrinking
    },
    transactionQtyCost: { // Combined Qty and Avg Cost
        fontSize: 13,
        color: '#6C7A91',
        marginLeft: 8, // Space after ticker
    },
    transactionCurrentPrice: { // Style for current price in transaction row
        fontSize: 14,
        fontWeight: '500',
        color: '#1A2E4C',
        marginBottom: 2, // Space below price
    },
    transactionPnl: { // Style for P&L in transaction row
        fontSize: 12,
               fontWeight: '500',
    },
    transactionValue: { // Keep this if needed elsewhere, otherwise remove
        // fontSize: 14,
        // fontWeight: '500',
        // color: '#1A2E4C',
    },
    // FAB
    fab: {
        position: 'absolute',
        bottom: 80,
        right: 20,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#0066cc',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 8,
        //zIndex: 1, // Lower z-index for FAB
    },
    fabText: {
        color: '#FFFFFF',
        fontSize: 30,
        lineHeight: 32, // Adjust for vertical centering
    },
    // General
    profitText: { color: '#28A745' }, // Green
    lossText: { color: '#DC3545' }, // Red
    primaryColor: { color: '#0066cc' },
    // Loading & Empty State
    loadingContainer: { // New style for loading indicator + text
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        //padding: 20,
        marginTop: 50, // Keep some top margin
    },
    loadingText: { // Style for the "Loading..." text
        marginTop: 10,
        fontSize: 16,
        color: '#6C7A91',
    },
    loadingOverlay: {
               position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center', alignItems: 'center', zIndex: 2000,
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyStateText: {
        fontSize: 16,
        color: '#6C7A91',
        textAlign: 'center',
    },
    errorText: {
        color: '#DC3545', padding: 10, textAlign: 'center', backgroundColor: '#F8D7DA',
        marginHorizontal: 15, marginTop: 10, borderRadius: 8,
    },
    // Menu Styles (Copied and prefixed from old styles for consistency)
    menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, },
    menuOverlayBackground: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', },
    menuDrawer: { position: 'absolute', top: 0, left: 0, width: 280, height: '100%', backgroundColor: 'white', padding: 0, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 10, },
    menuHeader: { paddingVertical: 8, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1A2E4C', }, // Use header color
    menuHeaderText: { fontSize: 20, fontWeight: 'bold', color: 'white', },
    menuCloseButton: { fontSize: 24, color: 'white', padding: 5, },
    menuItem: { paddingVertical: 18, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', },
    menuItemText: { fontSize: 18, color: '#333', },
    menuSeparator: { height: 10, backgroundColor: '#f5f5f5', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e0e0e0', },
    disconnectText: { color: '#DC3545', },
    // Modal Styles (Copied and prefixed)
    modalOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContainer: {
        flex: 1,
        position: 'relative',
    },
    gestureRootView: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    chatboxContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
    },
    modalTitle: { fontSize: 19, fontWeight: '600', marginBottom: 18, textAlign: 'center', color: '#1A2E4C', },
    modalMessage: { marginBottom: 30, fontSize: 15, lineHeight: 23, textAlign: 'center', color: '#495057', },
    modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', },
    modalButton: { marginLeft: 12, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 8, minWidth: 90, alignItems: 'center', },
    cancelButton: { backgroundColor: '#6C7A91', }, // Grey cancel
    cancelButtonText: { color: 'white', fontWeight: '600', fontSize: 15, },
    confirmButton: { backgroundColor: '#0066cc', }, // Primary confirm
    confirmButtonText: { color: 'white', fontWeight: '600', fontSize: 15, },
    // Popup Notification (Keep existing)
    popupContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, left: '10%', right: '10%', backgroundColor: 'rgba(0, 102, 204, 0.9)', padding: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', zIndex: 2000, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, },
    popupText: { color: 'white', fontSize: 15, fontWeight: '600', textAlign: 'center', },
    // Add styles for Summary Breakdown
    summarySeparator: {
        height: 1,
        backgroundColor: '#E0E7F1', // Light separator line
        marginVertical: 15, // Space around the line
    },
    summaryBreakdownContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around', // Distribute items evenly
        flexWrap: 'wrap', // Allow wrapping on smaller screens
    },
    summaryStatItem: {
        alignItems: 'center',
        minWidth: 70, // Ensure items have some minimum width
        marginBottom: 10, // Space if wrapping occurs
        paddingHorizontal: 5, // Prevent text touching edges
    },
    summaryStatValue: {
        fontSize: 15, // Slightly smaller than main value
        fontWeight: '600',
        color: '#1A2E4C',
        marginBottom: 2,
    },
    summaryStatLabel: {
        fontSize: 11, // Small label
        color: '#6C7A91',
        textAlign: 'center',
    },
    // Add styles for Portfolio Search/Sort
    portfolioListControls: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 8,
        alignItems: 'center',
        backgroundColor: '#F4F7FC',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E7F1',
    },
    portfolioSearchWrapper: {
        flex: 1,
        position: 'relative',
        marginRight: 8,
    },
    portfolioSearchInput: {
        backgroundColor: '#FFFFFF',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: Platform.OS === 'ios' ? 8 : 6,
        fontSize: 13,
        borderWidth: 1,
        borderColor: '#E0E7F1',
        paddingRight: 28,
    },
    clearSearchButton: {
        position: 'absolute',
        right: 4,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    clearSearchText: {
        color: '#8A94A6',
        fontSize: 14,
    },
    portfolioSortWrapper: {
        minWidth: 110,
        backgroundColor: '#FFFFFF',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#E0E7F1',
        overflow: 'hidden',
        justifyContent: 'center',
        height: Platform.OS === 'ios' ? 32 : 34,
    },
    portfolioSortPicker: {
        height: '100%',
        width: '100%',
        backgroundColor: 'transparent',
        color: '#1A2E4C',
        borderWidth: 0,
        borderColor: 'transparent',
        borderRadius: 6,
        ...(Platform.OS === 'ios' ? {} : { height: 34 }),
    },
    visibilityButton: {
        padding: 5, // Tappable area
        marginRight: 10, // Space before collapse icon
    },
    visibilityIcon: {
        fontSize: 20, // Adjust size as needed
        color: '#6C7A91', // Match collapse icon color
    },
    timestampContainer: {
        paddingHorizontal: 12,
        paddingVertical: 0,
        alignItems: 'center',
        backgroundColor: '#F4F7FC',
    },
    timestampText: {
        fontSize: 10,
        color: '#8A94A6',
        fontStyle: 'italic',
    },
    chatButton: {
        position: 'absolute',
        left: 16,
        bottom: 80,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#7C3AED', // Modern purple
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        zIndex: 100,
        borderWidth: 1,
        borderColor: 'rgba(124, 58, 237, 0.2)', // Subtle border
    },
    chatboxWrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '100%',
        backgroundColor: 'transparent',
        pointerEvents: "box-none",
        zIndex: 2, // Higher z-index for chatbox wrapper
    },
});
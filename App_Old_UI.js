// App.js
import React, { useState, useEffect, useCallback, useMemo } from 'react'; // Added useMemo
import { Modal, StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert, Platform, TextInput, Dimensions } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import ConnectionErrorModal from './ConnectionErrorModal';

// --- Import Service Functions (using investment_accounts & portfolio_summary) ---
import {
    fetchPortfolioSummary,
    fetchInvestmentAccounts,
    addInvestmentAccount,
    updateInvestmentAccount,
    deleteInvestmentAccount,
    bulkImportInvestmentAccounts,
    truncateInvestmentAccounts,
    refreshPortfolioDataIfNeeded,
    fetchPortfolioHistory
} from './stocksService';
// --- End Import Service Functions ---

import AddStockForm from './AddStockForm';
import PortfolioGraph from './PortfolioGraph'; // Import the graph component
import { useSupabaseConfig } from './SupabaseConfigContext'; // Import the context hook

// Helper function for number formatting with commas
const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

// --- Header Component ---
const Header = ({ onMenuPress }) => {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.menuButton} onPress={onMenuPress}>
        <Text style={styles.menuIcon}>☰</Text>
      </TouchableOpacity>
      <Text style={styles.headerText}>Stock Portfolio Tracker</Text>
      <View style={styles.menuPlaceholder} />
    </View>
  );
};

// --- Menu Drawer Component ---
const MenuDrawer = ({ visible, onClose, onImportPress, onClearDataPress, onDisconnectPress }) => { // Added onDisconnectPress
  if (!visible) return null;

  return (
    <View style={styles.menuOverlay}>
      <TouchableOpacity style={styles.menuOverlayBackground} onPress={onClose} />
      <View style={styles.menuDrawer}>
        <View style={styles.menuHeader}>
          <Text style={styles.menuHeaderText}>Menu</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.menuCloseButton}>✕</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.menuItem} onPress={onImportPress}>
          <Text style={styles.menuItemText}>Import Excel File</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={onClearDataPress}>
          <Text style={styles.menuItemText}>Clear All Data</Text>
        </TouchableOpacity>
        <View style={styles.menuSeparator} />
        <TouchableOpacity style={styles.menuItem} onPress={onDisconnectPress}>
          <Text style={[styles.menuItemText, styles.disconnectText]}>Disconnect Supabase</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// --- Tab Navigation Component ---
const TabNavigation = ({ activeTab, setActiveTab }) => {
  return (
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'portfolio' && styles.activeTab]}
        onPress={() => setActiveTab('portfolio')}
      >
        <Text style={[styles.tabText, activeTab === 'portfolio' && styles.activeTabText]}>Portfolio</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'accountDetail' && styles.activeTab]}
        onPress={() => setActiveTab('accountDetail')}
      >
        <Text style={[styles.tabText, activeTab === 'accountDetail' && styles.activeTabText]}>Account Detail</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'history' && styles.activeTab]} // Added History Tab
        onPress={() => setActiveTab('history')}
      >
        <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>History</Text>
      </TouchableOpacity>
    </View>
  );
};

// --- StockList Component (Uses summaryData) ---
const StockList = ({ summaryData, isLoading, setActiveTab, setGlobalSearchTerm, lastRefreshedTimestamp, onAddStockPress }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('ticker');

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return null;
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return "Invalid Date";
      return `Last updated: ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} (Refreshes if > 2hrs old)`;
    } catch (e) { return "Error formatting date"; }
  };
  const formattedTimestamp = formatTimestamp(lastRefreshedTimestamp);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Loading portfolio summary...</Text>
      </View>
    );
  }
// Filter out items with zero or null quantity BEFORE sorting and searching
const activeHoldings = (summaryData || []).filter(stock => stock.total_quantity && stock.total_quantity > 0);

// Now, check if there are any active holdings left to display
if (!activeHoldings || activeHoldings.length === 0) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>No active holdings found.</Text>
      <Text style={styles.emptyStateSubText}>Add transactions via the '+' button or import an Excel file.</Text>
    </View>
  );
}

// Sort and filter the ACTIVE holdings based on user input
const sortedStocks = [...activeHoldings] // Use the filtered array
  .sort((a, b) => {
    switch (sortBy) {
      case 'ticker': return (a.ticker || '').localeCompare(b.ticker || '');
      case 'pnl': return (b.pnl_dollar || 0) - (a.pnl_dollar || 0);
      case 'value': return (b.market_value || 0) - (a.market_value || 0);
      default: return 0;
    }
  })
  .filter(stock => searchTerm === '' || (stock.ticker || '').toLowerCase().includes(searchTerm.toLowerCase()));


  return (
    <View style={styles.stockListContainer}>
      <View style={styles.searchSortContainer}>
        {/* Search Input */}
        <View style={styles.searchInputWrapper}>
          <TextInput style={styles.searchInput} placeholder="Search by ticker..." value={searchTerm} onChangeText={setSearchTerm} clearButtonMode="while-editing" autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
          {searchTerm !== '' && (<TouchableOpacity style={styles.clearSearchButton} onPress={() => setSearchTerm('')}><Text style={styles.clearSearchText}>✕</Text></TouchableOpacity>)}
        </View>
        {searchTerm !== '' && (<View style={styles.searchActiveIndicator}><Text style={styles.searchResultText}>Found {sortedStocks.length} {sortedStocks.length === 1 ? 'match' : 'matches'}</Text></View>)}
        {/* Sort Dropdown */}
        <View style={styles.sortByContainer}>
          <Picker selectedValue={sortBy} style={styles.picker} onValueChange={setSortBy}>
            <Picker.Item label="Sort by Ticker" value="ticker" />
            <Picker.Item label="Sort by P&L" value="pnl" />
            <Picker.Item label="Sort by Value" value="value" />
          </Picker>
        </View>
      </View>

      {formattedTimestamp && (<View style={styles.lastRefreshedContainer}><Text style={styles.lastRefreshedText}>{formattedTimestamp}</Text></View>)}

      <ScrollView style={styles.modernStockList} scrollEventThrottle={16}>
        {sortedStocks.map((stock, index) => {
          const displayType = stock.type ? stock.type.charAt(0).toUpperCase() + stock.type.slice(1).toLowerCase() : 'N/A';
          const isProfitable = (stock.pnl_dollar || 0) >= 0;
          return (
            <TouchableOpacity key={stock.ticker || index} style={styles.modernStockCard} onPress={() => { setActiveTab('accountDetail'); setGlobalSearchTerm(stock.ticker); }}>
              <View style={styles.stockCardHeader}>
                <View style={styles.stockCardTitleContainer}><Text style={styles.stockCardTicker}>{stock.ticker}</Text>{stock.type && stock.type.toLowerCase() !== 'stock' && (<Text style={styles.stockTypeTag}>{displayType}</Text>)}</View>
                <Text style={styles.stockCardPrice}>${(stock.current_price ?? 0).toFixed(2)}</Text>
              </View>
              <View style={styles.stockCardDetails}>
                <View style={styles.stockCardMetric}><Text style={styles.stockCardMetricLabel}>Shares</Text><Text style={styles.stockCardMetricValue}>{formatNumber(Math.round(stock.total_quantity || 0))}</Text></View>
                <View style={styles.stockCardMetric}><Text style={styles.stockCardMetricLabel}>Avg Cost</Text><Text style={styles.stockCardMetricValue}>${(stock.average_cost_basis ?? 0).toFixed(2)}</Text></View>
                <View style={styles.stockCardMetric}><Text style={styles.stockCardMetricLabel}>Value</Text><Text style={styles.stockCardMetricValue}>${formatNumber(Math.round(stock.market_value || 0))}</Text></View>
              </View>
              <View style={styles.stockCardFooter}>
                <View style={styles.stockCardPnLContainer}><Text style={styles.stockCardMetricLabel}>P&L</Text><Text style={[styles.stockCardPnL, isProfitable ? styles.profit : styles.loss]}>{isProfitable ? '+' : '-'}${Math.abs(stock.pnl_dollar || 0) >= 1000 ? formatNumber(Math.abs(stock.pnl_dollar || 0).toFixed(0)) : Math.abs(stock.pnl_dollar || 0).toFixed(2)}<Text style={[styles.stockCardPnLPercent, isProfitable ? styles.profit : styles.loss]}>{' '}({(stock.pnl_percent ?? 0).toFixed(2)}%)</Text></Text></View>
                <View style={styles.stockCardAllocationContainer}><Text style={styles.stockCardMetricLabel}>% of Portfolio</Text><Text style={styles.stockCardAllocation}>{(stock.portfolio_percent ?? 0).toFixed(2)}%</Text></View>
              </View>
              <View style={[styles.stockCardPnLBar, {width: `${Math.min(Math.abs(stock.pnl_percent || 0) * 2, 100)}%`}, isProfitable ? styles.profitBar : styles.lossBar]}></View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {/* Add Stock Button is now rendered conditionally in App component */}
    </View>
  );
};

// --- PortfolioSummary Component (Uses summaryData) ---
const PortfolioSummary = ({ summaryData }) => {
  const [userCollapsed, setUserCollapsed] = useState(true);
  const isCollapsed = userCollapsed;

  if (!summaryData || summaryData.length === 0) return null;

  const totalValue = summaryData.reduce((sum, stock) => sum + (stock.market_value || 0), 0);
  const totalCost = summaryData.reduce((sum, stock) => sum + (stock.total_cost_basis_value || 0), 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPercentage = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
  const uniqueStocksCount = summaryData.filter(s => s.type !== 'cash').length;
  const cashValue = summaryData.find(s => s.ticker === 'CASH')?.market_value || 0;
  const cashPercentage = totalValue > 0 ? (cashValue / totalValue) * 100 : 0;
  const stockValue = summaryData.filter(s => s.type === 'stock').reduce((sum, s) => sum + (s.market_value || 0), 0);
  const stockPercentage = totalValue > 0 ? (stockValue / totalValue) * 100 : 0;
  const etfValue = summaryData.filter(s => s.type === 'etf').reduce((sum, s) => sum + (s.market_value || 0), 0);
  const etfPercentage = totalValue > 0 ? (etfValue / totalValue) * 100 : 0;

  const toggleCollapse = () => setUserCollapsed(!userCollapsed);
  const isProfitable = totalPnL >= 0;

  return (
    <View style={styles.modernSummaryContainer}>
      <TouchableOpacity style={styles.modernSummaryHeader} onPress={toggleCollapse} activeOpacity={0.7}>
        <Text style={styles.modernSummaryHeaderText}>Portfolio Summary</Text>
        <View style={styles.collapseIconContainer}><Text style={[styles.collapseIcon, isCollapsed && styles.collapseIconRotated]}>▼</Text></View>
      </TouchableOpacity>
      {!isCollapsed && (
        <View style={styles.modernSummaryContent}>
          <View style={styles.summaryMainCard}>
            <View style={styles.summaryMainValues}>
              <View style={styles.summaryMainValueItem}><Text style={styles.summaryMainLabel}>Total Value</Text><Text style={styles.summaryMainValue}>${formatNumber(Math.round(totalValue))}</Text></View>
              <View style={styles.summaryMainValueItem}><Text style={styles.summaryMainLabel}>Total Cost</Text><Text style={styles.summaryMainValue}>${formatNumber(Math.round(totalCost))}</Text></View>
            </View>
            <View style={styles.summaryPnLContainer}>
              <View style={styles.summaryPnLRow}><Text style={styles.summaryPnLLabel}>Total P&L</Text><Text style={[styles.summaryPnLValue, isProfitable ? styles.profit : styles.loss]}>{isProfitable ? '+' : '-'}${formatNumber(Math.abs(Math.round(totalPnL)))} ({isProfitable ? '+' : '-'}{Math.abs(totalPnLPercentage).toFixed(2)}%)</Text></View>
              <View style={styles.summaryPnLBarContainer}><View style={[styles.summaryPnLBar, {width: `${Math.min(Math.abs(totalPnLPercentage), 100)}%`}, isProfitable ? styles.profitBar : styles.lossBar]}></View></View>
            </View>
          </View>
          <View style={styles.summaryCardsContainer}>
            <View style={styles.summaryCard}><Text style={styles.summaryCardTitle}>Assets</Text><Text style={styles.summaryCardValue}>{uniqueStocksCount}</Text><Text style={styles.summaryCardSubtitle}>Unique Securities</Text></View>
            {stockValue > 0 && (<View style={styles.summaryCard}><Text style={styles.summaryCardTitle}>Stocks</Text><Text style={styles.summaryCardValue}>${formatNumber(Math.round(stockValue))}</Text><Text style={styles.summaryCardSubtitle}>{stockPercentage.toFixed(2)}%</Text></View>)}
            {etfValue > 0 && (<View style={styles.summaryCard}><Text style={styles.summaryCardTitle}>ETFs</Text><Text style={styles.summaryCardValue}>${formatNumber(Math.round(etfValue))}</Text><Text style={styles.summaryCardSubtitle}>{etfPercentage.toFixed(2)}%</Text></View>)}
            {cashValue > 0 && (<View style={styles.summaryCard}><Text style={styles.summaryCardTitle}>Cash</Text><Text style={styles.summaryCardValue}>${formatNumber(Math.round(cashValue))}</Text><Text style={styles.summaryCardSubtitle}>{cashPercentage.toFixed(2)}%</Text></View>)}
          </View>
        </View>
      )}
    </View>
  );
};

// --- AccountDetailView Component (Uses investmentAccountsData + summaryData) ---
const AccountDetailView = ({ investmentAccountsData, summaryData, isLoading, handleEditStock, searchTerm, setSearchTerm }) => {
  const [expandedAccounts, setExpandedAccounts] = useState({});
  const screenWidth = Dimensions.get('window').width;

  const priceMap = useMemo(() => {
    const map = new Map();
    (summaryData || []).forEach(item => { if (item.ticker) map.set(item.ticker, item.current_price ?? 0); });
    return map;
  }, [summaryData]);

  const accounts = useMemo(() => {
    const grouped = {};
    (investmentAccountsData || []).forEach(tx => {
      const accountName = tx.account || 'Uncategorized';
      if (!grouped[accountName]) grouped[accountName] = { transactions: [], totalValue: 0, totalCost: 0, pnl: 0, pnlPercentage: 0 };
      const currentPrice = priceMap.get(tx.ticker) ?? (tx.ticker === 'CASH' ? 1 : 0);
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
  }, [investmentAccountsData, priceMap]);

  const toggleAccount = (accountName) => setExpandedAccounts(prev => ({ ...prev, [accountName]: !prev[accountName] }));

  useEffect(() => {
    if (searchTerm !== '') {
      const accountsWithResults = {};
      Object.keys(accounts || {}).forEach(accountName => {
        const hasResults = accounts[accountName].transactions.some(tx => (tx.ticker || '').toLowerCase().includes(searchTerm.toLowerCase()) || (accountName || '').toLowerCase().includes(searchTerm.toLowerCase()));
        if (hasResults) accountsWithResults[accountName] = true;
      });
      setExpandedAccounts(accountsWithResults);
    }
  }, [searchTerm, accounts]);

  if (isLoading) {
    return (<View style={styles.loadingContainer}><ActivityIndicator size="large" color="#0066cc" /><Text style={styles.loadingText}>Loading account details...</Text></View>);
  }
  if (!investmentAccountsData || investmentAccountsData.length === 0) {
    return (<View style={styles.emptyState}><Text style={styles.emptyStateText}>No investment transactions found.</Text><Text style={styles.emptyStateSubText}>Add transactions via the '+' button or import an Excel file.</Text></View>);
  }

  const filteredAccounts = {};
  Object.keys(accounts).forEach(accountName => {
    const account = accounts[accountName];
    const filteredTransactions = account.transactions.filter(tx => searchTerm === '' || (tx.ticker || '').toLowerCase().includes(searchTerm.toLowerCase()) || (accountName || '').toLowerCase().includes(searchTerm.toLowerCase()));
    if (filteredTransactions.length > 0 || (searchTerm !== '' && (accountName || '').toLowerCase().includes(searchTerm.toLowerCase()))) {
      filteredAccounts[accountName] = { ...account, transactions: filteredTransactions };
    }
  });

  return (
    <View style={styles.accountsContainer}>
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <TextInput style={styles.searchInput} placeholder="Search by ticker or account..." value={searchTerm} onChangeText={setSearchTerm} clearButtonMode="while-editing" autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
          {searchTerm !== '' && (<TouchableOpacity style={styles.clearSearchButton} onPress={() => setSearchTerm('')}><Text style={styles.clearSearchText}>✕</Text></TouchableOpacity>)}
        </View>
        {searchTerm !== '' && (<View style={styles.searchActiveIndicator}><Text style={styles.searchResultText}>Found in {Object.keys(filteredAccounts).length} {Object.keys(filteredAccounts).length === 1 ? 'account' : 'accounts'}</Text></View>)}
      </View>
      <ScrollView style={styles.accountDetailList}>
        {Object.keys(filteredAccounts).sort().map((accountName, index) => {
          const account = filteredAccounts[accountName];
          const pnl = account.pnl || 0;
          const pnlPercentage = account.pnlPercentage || 0;
          const isExpanded = !!expandedAccounts[accountName];
          return (
            <View key={accountName || index} style={styles.modernAccountCard}>
              <TouchableOpacity style={[styles.accountHeader, isExpanded && { borderBottomWidth: 1 }]} onPress={() => toggleAccount(accountName)} activeOpacity={0.7}>
                <View style={styles.accountHeaderLeft}><Text style={styles.modernAccountName}>{accountName}</Text><Text style={styles.accountStockCount}>{account.transactions.length} {account.transactions.length === 1 ? 'transaction' : 'transactions'}</Text></View>
                <View style={styles.accountHeaderRight}><View style={styles.accountValueContainer}><Text style={styles.accountValueLabel}>Value</Text><Text style={styles.accountValueAmount}>${formatNumber(Math.round(account.totalValue || 0))}</Text></View><View style={styles.collapseIconContainer}><Text style={[styles.accountCollapseIcon, !isExpanded && styles.accountCollapseIconRotated]}>▼</Text></View></View>
              </TouchableOpacity>
              {isExpanded && (
                <View style={styles.accountDetails}>
                  <View style={styles.accountSummaryCards}>
                    <View style={styles.summaryCard}><Text style={styles.summaryCardLabel}>Total Cost</Text><Text style={styles.summaryCardValue}>${formatNumber(Math.round(account.totalCost || 0))}</Text></View>
                    <View style={styles.summaryCard}><Text style={styles.summaryCardLabel}>P&L</Text><Text style={[styles.summaryCardValue, pnl >= 0 ? styles.profit : styles.loss]}>${Math.abs(pnl) >= 1000 ? formatNumber(Math.abs(pnl).toFixed(0)) : Math.abs(pnl).toFixed(2)} ({pnl >= 0 ? '+' : '-'}{Math.abs(pnlPercentage).toFixed(2)}%)</Text></View>
                  </View>
                  <View style={styles.tableContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                      <View style={{width: screenWidth * 1.2}}>
                        <View style={styles.tableHeader}>
                          <Text style={[styles.cell, styles.headerCell, { flex: 2.5, minWidth: 85, textAlign: 'left' }]}>Ticker</Text> {/* Align left */}
                          <Text style={[styles.cell, styles.headerCell, { flex: 1, minWidth: 60 }]}>Shares</Text>
                          <Text style={[styles.cell, styles.headerCell, { flex: 1, minWidth: 70 }]}>Cost</Text>
                          <Text style={[styles.cell, styles.headerCell, { flex: 1, minWidth: 60 }]}>Price</Text>
                          <Text style={[styles.cell, styles.headerCell, { flex: 1, minWidth: 70 }]}>Value</Text>
                          <Text style={[styles.cell, styles.headerCell, { flex: 1, minWidth: 65 }]}>P&L</Text>
                        </View>
                        {account.transactions.sort((a, b) => (a.ticker || '').localeCompare(b.ticker || '')).map((tx, txIndex) => {
                          const isTxProfitable = (tx.pnl || 0) >= 0;
                          const summaryInfo = summaryData.find(s => s.ticker === tx.ticker);
                          const displayType = summaryInfo?.type ? summaryInfo.type.charAt(0).toUpperCase() + summaryInfo.type.slice(1).toLowerCase() : '';
                          return (
                            <TouchableOpacity key={tx.id || txIndex} style={[styles.row, txIndex % 2 === 0 ? styles.evenRow : styles.oddRow]} onPress={() => handleEditStock(tx)}>
                              <Text style={[styles.cell, { flex: 2.5, minWidth: 85, textAlign: 'left' }]}>{tx.ticker}{displayType && displayType.toLowerCase() !== 'stock' && (<Text style={styles.typeBadge}>{' '}({displayType})</Text>)}</Text>
                              <Text style={[styles.cell, { flex: 1, minWidth: 60 }]}>{formatNumber(Math.round(tx.quantity || 0))}</Text>
                              <Text style={[styles.cell, { flex: 1, minWidth: 70 }]}>${(tx.cost_basis ?? 0).toFixed(2)}</Text>
                              <Text style={[styles.cell, { flex: 1, minWidth: 60 }]}>${(tx.currentPrice ?? 0).toFixed(2)}</Text>
                              <Text style={[styles.cell, { flex: 1, minWidth: 70 }]}>${formatNumber(Math.round(tx.currentValue || 0))}</Text>
                              <Text style={[styles.cell, isTxProfitable ? styles.profit : styles.loss, { flex: 1, minWidth: 65 }]}>${Math.abs(tx.pnl || 0) >= 1000 ? formatNumber(Math.abs(tx.pnl || 0).toFixed(0)) : Math.abs(tx.pnl || 0).toFixed(2)}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

// --- PopupNotification Component ---
const PopupNotification = ({ visible, message }) => {
  if (!visible) return null;
  return (<View style={newStyles.popupContainer}><Text style={newStyles.popupText}>{message}</Text></View>);
};


// --- ImportConfirmationModal Component ---
const ImportConfirmationModal = ({ visible, data, onConfirm, onCancel }) => {
  if (!visible) return null;
  const displayTickers = data?.slice(0, 10).map(s => s.ticker).join(', ') + (data?.length > 10 ? '...' : '');
  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Import Confirmation</Text>
        <Text style={styles.modalMessage}>Found {data?.length || 0} transactions to import.\n\nTickers: {displayTickers}\n\nThis will add these transactions to the 'investment_accounts' table.</Text>
        <View style={styles.modalButtons}>
          <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={onCancel}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={onConfirm}><Text style={styles.confirmButtonText}>Import</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// --- Main App component ---
export default function App() {
  // --- State ---
  const [summaryData, setSummaryData] = useState([]);
  const [investmentAccountsData, setInvestmentAccountsData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('portfolio');
  const [error, setError] = useState(null);
  const [isAddingStock, setIsAddingStock] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null); // Transaction being edited
  const [isEditingStock, setIsEditingStock] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false); // State for menu visibility
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [isClearDataModalVisible, setIsClearDataModalVisible] = useState(false); // State for clear data modal
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [isImportModalVisible, setIsImportModalVisible] = useState(false);
  const [importData, setImportData] = useState(null);
  const [isDisconnectModalVisible, setIsDisconnectModalVisible] = useState(false); // State for disconnect modal
  const [lastRefreshedTimestamp, setLastRefreshedTimestamp] = useState(null);
  const [isConnectionErrorModalVisible, setIsConnectionErrorModalVisible] = useState(false);
  const [connectionErrorMessage, setConnectionErrorMessage] = useState('');
  
  const { supabaseClient, clearConfig } = useSupabaseConfig(); // Get client and clearConfig from context

  // --- Data Loading (Ensure it calls without forcing) ---
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
    
  useEffect(() => { if (supabaseClient) loadData(); }, [supabaseClient, loadData]);
  useEffect(() => { if (activeTab === 'portfolio') setGlobalSearchTerm(''); }, [activeTab]);

  // --- File Handling / Import ---
  const handleFileSelect = async (result) => {
    try {
      setIsLoading(true); setError(null);
      if (Platform.OS === 'web') {
        const file = result.file;
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            await processExcelData(jsonData);
          } catch (error) { console.error('Error processing Excel:', error); Alert.alert('Error', `Excel processing failed: ${error.message}`); setIsLoading(false); }
        };
        reader.onerror = (error) => { console.error('FileReader error:', error); Alert.alert('Error', 'Failed to read file'); setIsLoading(false); };
        reader.readAsArrayBuffer(file);
      } else {
        const base64Content = await FileSystem.readAsStringAsync(result.uri, { encoding: FileSystem.EncodingType.Base64 });
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
      if (!data || data.length === 0) throw new Error('No data found in Excel');
      validateData(data);
      const normalizedData = data.map((row, index) => {
        const findColumnValue = (obj, prefixes) => {
            for (const prefix of prefixes) { const key = Object.keys(obj).find(k => k.toLowerCase().trim() === prefix.toLowerCase()); if (key && obj[key] !== null && obj[key] !== undefined) return obj[key]; }
            for (const prefix of prefixes) { const key = Object.keys(obj).find(k => k.toLowerCase().trim().includes(prefix.toLowerCase())); if (key && obj[key] !== null && obj[key] !== undefined) { console.warn(`Fallback match for '${prefix}' in row ${index + 1}. Key: '${key}'`); return obj[key]; } }
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
        setTimeout(() => setIsPopupVisible(false), 3000);
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
      setTimeout(() => setIsPopupVisible(false), 3000);

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

  // --- Render Active Tab ---
  const renderActiveTab = () => {
    switch (activeTab) {
      case 'portfolio':
        return (
          <View style={styles.tabContent}>
            <PortfolioSummary summaryData={summaryData} />
            <StockList summaryData={summaryData} isLoading={isLoading && summaryData.length === 0} setActiveTab={setActiveTab} setGlobalSearchTerm={setGlobalSearchTerm} lastRefreshedTimestamp={lastRefreshedTimestamp} onAddStockPress={openAddStockModal} />
          </View>
        );
      case 'accountDetail':
        return (<AccountDetailView investmentAccountsData={investmentAccountsData} summaryData={summaryData} isLoading={isLoading && investmentAccountsData.length === 0} handleEditStock={handleEditStock} searchTerm={globalSearchTerm} setSearchTerm={setGlobalSearchTerm} />);
      case 'history': // Added History case
        return (<PortfolioGraph />); // Render the graph component
      default:
        return ( // Default to portfolio
          <View style={styles.tabContent}>
            <PortfolioSummary summaryData={summaryData} />
            <StockList summaryData={summaryData} isLoading={isLoading && summaryData.length === 0} setActiveTab={setActiveTab} setGlobalSearchTerm={setGlobalSearchTerm} lastRefreshedTimestamp={lastRefreshedTimestamp} onAddStockPress={openAddStockModal} />
          </View>
        );
    }
  };

  // --- Function to open the Add Stock modal ---
  const openAddStockModal = () => {
    setSelectedStock(null); setIsEditingStock(false); setIsAddingStock(true);
  };

  // --- Main Render ---
  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Menu Button */}
      <Header onMenuPress={() => setMenuVisible(true)} />

      {/* Tab Navigation */}
      <TabNavigation activeTab={activeTab} setActiveTab={setActiveTab} />

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Render Active Tab Content */}
      {renderActiveTab()}

      {/* Floating Add Button (Conditional) */}
      {(activeTab === 'portfolio' || activeTab === 'accountDetail') && (
          <View style={styles.addButtonContainer}>
              <TouchableOpacity style={styles.addButton} onPress={openAddStockModal}>
                  <Text style={styles.addButtonText}>+</Text>
              </TouchableOpacity>
          </View>
      )}

      {/* Menu Drawer */}
      <MenuDrawer
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onImportPress={async () => { // Import Action
          setMenuVisible(false);
          try {
            if (Platform.OS === 'web') {
              const input = document.createElement('input'); input.type = 'file'; input.accept = '.xlsx,.xls';
              input.onchange = (e) => { const file = e.target.files[0]; if (file) handleFileSelect({ file }); };
              input.click();
            } else {
              const result = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'], copyToCacheDirectory: true });
              if (result.type !== 'cancel' && !result.canceled) { const fileUri = result.assets && result.assets.length > 0 ? result.assets[0].uri : result.uri; if (fileUri) handleFileSelect({ uri: fileUri }); }
            }
          } catch (error) { Alert.alert('Error', 'Failed to pick document.'); }
        }}
        onClearDataPress={() => { // Clear Data Action
          setMenuVisible(false);
          handleClearAllData(); // Shows confirmation modal
        }}
        onDisconnectPress={() => { // Disconnect Action
          setMenuVisible(false);
          handleDisconnect(); // Shows confirmation modal
        }}
      />

      {/* Add/Edit Transaction Form Modal */}
      <AddStockForm visible={isAddingStock} onClose={() => { setIsAddingStock(false); setIsEditingStock(false); setSelectedStock(null); }} onSubmit={isEditingStock ? handleUpdateStock : handleAddStock} initialValues={selectedStock} isEditing={isEditingStock} />

      {/* Clear Data Confirmation Modal */}
      <Modal visible={isClearDataModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsClearDataModalVisible(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalContainer}><Text style={styles.modalTitle}>Confirm Clear Data</Text><Text style={styles.modalMessage}>Delete ALL transactions from 'investment_accounts'? This cannot be undone.</Text><View style={styles.modalButtons}><TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsClearDataModalVisible(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={[styles.modalButton, styles.confirmButton, { backgroundColor: '#dc3545' }]} onPress={confirmClearAllData}><Text style={styles.confirmButtonText}>Delete All</Text></TouchableOpacity></View></View></View>
      </Modal>

      {/* Disconnect Confirmation Modal */}
      <Modal visible={isDisconnectModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsDisconnectModalVisible(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalContainer}><Text style={styles.modalTitle}>Confirm Disconnect</Text><Text style={styles.modalMessage}>Disconnect and clear saved Supabase credentials?</Text><View style={styles.modalButtons}><TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsDisconnectModalVisible(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={confirmDisconnect}><Text style={styles.confirmButtonText}>Disconnect</Text></TouchableOpacity></View></View></View>
      </Modal>

      {/* Import Confirmation Modal */}
      <ImportConfirmationModal visible={isImportModalVisible} data={importData} onCancel={() => { setIsImportModalVisible(false); setImportData(null); setIsLoading(false); }} onConfirm={handleBulkImport} />
      
      {/* Render the Connection Error Modal */}
      <ConnectionErrorModal
        visible={isConnectionErrorModalVisible}
        message={connectionErrorMessage}
        onOkPress={handleConnectionErrorOk} // Pass the handler function
      />

      {/* Popup Notification */}
      <PopupNotification visible={isPopupVisible} message={popupMessage} />

      {/* Global Loading Indicator
      {isLoading && (<View style={styles.globalLoadingOverlay}><ActivityIndicator size="large" color="#FFFFFF" /></View>)} */}
    </SafeAreaView>
  );
}

// --- Styles (Keep existing styles, ensure menu/modal styles are present) ---
const styles = StyleSheet.create({
    // ... (Keep ALL styles from the previous version, including modal, menu, etc.) ...
    // Ensure these specific styles are present and correct:
    container: {
      flex: 1,
      backgroundColor: '#F8F9FA', // Slightly off-white background
      paddingTop: Platform.OS === 'android' ? 25 : 0,
  },
    header: { backgroundColor: '#0066cc', padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', },
    menuButton: { padding: 5, width: 40, alignItems: 'center', }, // Ensure tappable area
    menuIcon: { color: 'white', fontSize: 24, fontWeight: 'bold', },
    headerText: { color: 'white', fontSize: 20, fontWeight: 'bold', flex: 1, textAlign: 'center', },
    menuPlaceholder: { width: 40, }, // Balance the header
    tabContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e0e0e0', backgroundColor: 'white', },
    tab: { flex: 1, padding: 15, alignItems: 'center', },
    activeTab: { borderBottomWidth: 3, borderBottomColor: '#0066cc', },
    tabText: { color: '#666', },
    activeTabText: { color: '#0066cc', fontWeight: 'bold', },
    menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, },
    menuOverlayBackground: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', },
    menuDrawer: { position: 'absolute', top: 0, left: 0, width: 280, height: '100%', backgroundColor: 'white', padding: 0, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 10, },
    menuHeader: { paddingVertical: 20, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0066cc', },
    menuHeaderText: { fontSize: 20, fontWeight: 'bold', color: 'white', },
    menuCloseButton: { fontSize: 24, color: 'white', padding: 5, },
    menuItem: { paddingVertical: 18, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', },
    menuItemText: { fontSize: 16, color: '#333', },
    menuSeparator: { height: 10, backgroundColor: '#f5f5f5', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e0e0e0', },
    disconnectText: { color: '#dc3545', }, // Style for disconnect option
    modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 20, },
    modalContainer: { backgroundColor: 'white', borderRadius: 8, padding: 20, width: '90%', maxWidth: 400, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, },
    modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15, textAlign: 'center', color: '#343a40', },
    modalMessage: { marginBottom: 25, fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#495057', },
    modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', },
    modalButton: { marginLeft: 10, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 5, minWidth: 90, alignItems: 'center', },
    cancelButton: { backgroundColor: '#6c757d', },
    cancelButtonText: { color: 'white', fontWeight: 'bold', },
    confirmButton: { backgroundColor: '#0066cc', },
    confirmButtonText: { color: 'white', fontWeight: 'bold', },
    // ... include all other styles from previous versions ...
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, },
    loadingText: { marginTop: 10, color: '#666', },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, },
    emptyStateText: { fontSize: 16, color: '#666', textAlign: 'center', },
    emptyStateSubText: { fontSize: 13, color: '#999', textAlign: 'center', marginTop: 10, },
    stockListContainer: { flex: 1, backgroundColor: '#f5f5f5', },
    searchContainer: { padding: 10, backgroundColor: '#f8f8f8', borderBottomWidth: 1, borderBottomColor: '#eee', },
    searchInputWrapper: { position: 'relative', flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10, },
    searchInput: {
      height: 44, // Slightly taller
      borderColor: '#DEE2E6', // Slightly lighter border
      borderWidth: 1,
      borderRadius: 10, // More rounded
      paddingHorizontal: 12,
      paddingRight: 35, // Space for clear button
      backgroundColor: 'white',
      flex: 1,
      fontSize: 15, // Slightly larger text
  },
    clearSearchButton: { position: 'absolute', right: 10, padding: 5, justifyContent: 'center', height: '100%', },
    clearSearchText: { color: '#999', fontSize: 16, },
    searchActiveIndicator: { marginTop: 5, paddingHorizontal: 5, backgroundColor: '#e6f2ff', paddingVertical: 4, borderRadius: 4, alignSelf: 'flex-start', },
    searchResultText: { fontSize: 12, color: '#0066cc', fontStyle: 'italic', },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: '#F8F9FA', // Light background for header
      paddingVertical: 12, // More padding
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: '#DEE2E6',
  },
  headerCell: {
    fontWeight: '600', // Semi-bold header text
    color: '#495057', // Dark grey text
    textAlign: 'right', // Default right align numbers
    flex: 1,
    paddingHorizontal: 6,
    fontSize: 13, // Slightly smaller header text
},
row: {
    flexDirection: 'row',
    paddingVertical: 12, // More padding
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0', // Very light separator
    alignItems: 'center',
},
evenRow: { backgroundColor: 'white', },
oddRow: { backgroundColor: '#FDFDFD', }, // Subtle striping
cell: {
    flex: 1,
    paddingHorizontal: 6,
    fontSize: 14,
    textAlign: 'right', // Default right align numbers
    color: '#343A40', // Standard text color
},
    profit: { color: '#28a745', },
    loss: { color: '#dc3545', },
    errorText: { color: '#721c24', padding: 12, textAlign: 'center', backgroundColor: '#f8d7da', marginHorizontal: 10, marginTop: 5, marginBottom: 5, borderRadius: 4, borderWidth: 1, borderColor: '#f5c6cb', },
    accountDetailList: { flex: 1, },
    tableContainer: {
      borderWidth: 1,
      borderColor: '#E9ECEF', // Lighter border
      borderRadius: 8, // Rounded corners for table container
      backgroundColor: 'white',
      marginVertical: 12,
      overflow: 'hidden', // Clip scrollview
      // Remove shadow from table container itself
  },
    tabContent: { flex: 1,  },
    typeBadge: { fontSize: 11, color: '#6c757d', fontStyle: 'italic', },
    addButtonContainer: { position: 'absolute', bottom: 20, right: 20, zIndex: 999, },
    addButton: { backgroundColor: '#0066cc', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, },
    addButtonText: { color: 'white', fontSize: 24, lineHeight: 28, },
    accountsContainer: { flex: 1, },
    modernAccountCard: { // Account Detail Card
      backgroundColor: 'white',
      borderRadius: 12, // More rounded corners
      marginVertical: 8,
      marginHorizontal: 12, // Consistent horizontal margin
      // Softer shadows
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 3,
      overflow: 'hidden', // Ensure content stays within bounds
  },
  accountHeader: { // Account Detail Header
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14, // Adjust padding
    paddingHorizontal: 18,
    borderBottomWidth: 1, // Use border when expanded
    borderBottomColor: '#E9ECEF', // Lighter border color
    backgroundColor: '#FDFDFD', // Very light grey for header section
},
    accountHeaderLeft: { flexDirection: 'column', alignItems: 'flex-start', flex: 1, marginRight: 10, },
    modernAccountName: { fontSize: 17, fontWeight: '600', marginBottom: 2, color: '#343a40', },
    accountStockCount: { fontSize: 13, color: '#6c757d', },
    accountHeaderRight: { flexDirection: 'row', alignItems: 'center', },
    accountValueContainer: { marginRight: 10, alignItems: 'flex-end', },
    accountValueLabel: { fontSize: 12, color: '#6c757d', },
    accountValueAmount: { fontWeight: '600', fontSize: 15, color: '#343a40', },
    accountCollapseIcon: { fontSize: 16, color: '#0066cc', },
    accountCollapseIconRotated: { transform: [{ rotate: '180deg' }], },
    accountDetails: { padding: 18, },
    accountSummaryCards: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16, flexWrap: 'wrap', },
    summaryCard: { minWidth: 120, padding: 12, borderWidth: 1, borderColor: '#e9ecef', borderRadius: 6, marginBottom: 8, backgroundColor: 'white', alignItems: 'center', },
    summaryCardTitle: { fontSize: 13, color: '#6c757d', marginBottom: 4, },
    summaryCardLabel: { fontSize: 13, color: '#6c757d', marginBottom: 4, },
    summaryCardValue: { fontWeight: '600', fontSize: 15, color: '#343a40', },
    summaryCardSubtitle: { fontSize: 11, color: '#6c757d', marginTop: 2, },
    collapseIconContainer: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 5, },
    modernStockList: { flex: 1, paddingTop: 5, },
    modernStockCard: { // Stock List Card
      backgroundColor: 'white',
      borderRadius: 12, // More rounded corners
      padding: 16, // Increased padding
      marginVertical: 6,
      marginHorizontal: 12, // Consistent horizontal margin
      // Softer shadows
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 3,
  },
  stockCardHeader: { // Stock List Header
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12, // More space below header
},
    stockCardTitleContainer: { flex: 1, marginRight: 8, flexDirection: 'row', alignItems: 'center', },
    stockCardTicker: { fontSize: 16, fontWeight: '600', color: '#343a40', },
    stockCardPrice: { fontSize: 15, fontWeight: '500', color: '#343a40', },
    stockCardDetails: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0', },
    stockCardMetric: { flex: 1, alignItems: 'center', paddingHorizontal: 4, },
    stockCardMetricLabel: { fontSize: 12, color: '#6c757d', marginBottom: 2, },
    stockCardMetricValue: { fontWeight: '500', fontSize: 14, color: '#343a40', },
    stockCardFooter: { // Stock List Footer Row
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginTop: 8,
  },
    stockCardPnLContainer: { alignItems: 'flex-start', },
    stockCardPnL: { fontSize: 14, fontWeight: '500', },
    stockCardPnLPercent: { fontSize: 12, },
    stockCardAllocationContainer: { alignItems: 'flex-end', },
    stockCardAllocation: { fontSize: 13, color: '#6c757d', fontWeight: '500', },
    stockCardPnLBar: { height: 5, borderRadius: 3, marginTop: 8, alignSelf: 'flex-start', },
    profitBar: { backgroundColor: '#28a745', },
    lossBar: { backgroundColor: '#dc3545', },
    modernSummaryContainer: { // Portfolio Summary Card
      backgroundColor: 'white',
      marginHorizontal: 12, // Consistent horizontal margin
      marginTop: 12,
      marginBottom: 8,
      borderRadius: 12, // More rounded corners
      overflow: 'hidden', // Important for borderRadius
      // Softer shadows
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 5,
      elevation: 4, // Android shadow
  },
  modernSummaryHeader: { // Summary Header
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14, // Adjust padding
    paddingHorizontal: 18,
    backgroundColor: '#0066cc', // Keep primary color
},
    modernSummaryHeaderText: { fontSize: 17, fontWeight: '600', color: 'white', },
    collapseIcon: { color: 'white', fontSize: 18, },
    modernSummaryContent: { padding: 18, },
    summaryMainCard: { backgroundColor: '#f8f9fa', padding: 12, borderRadius: 6, marginBottom: 16, },
    summaryMainValues: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, },
    summaryMainValueItem: { flexDirection: 'column', alignItems: 'flex-start', },
    summaryMainLabel: { fontSize: 13, color: '#6C757D', marginBottom: 4, }, // Grey label
    summaryMainValue: { fontWeight: '600', fontSize: 18, color: '#343a40', },
    summaryPnLContainer: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#e9ecef', paddingTop: 10, },
    summaryPnLRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, },
    summaryPnLLabel: { fontSize: 13, color: '#6c757d', },
    summaryPnLValue: { fontWeight: '600', fontSize: 16, },
    summaryCardsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', },
    stockTypeTag: { // Tag for ETF/Cash etc.
      fontSize: 10,
      color: '#0056b3',
      backgroundColor: '#E7F5FF', // Lighter blue background
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10, // Pill shape
      marginLeft: 8,
      fontWeight: '600', // Bolder tag text
      overflow: 'hidden',
  },
    summaryPnLBarContainer: { marginTop: 4, backgroundColor: '#e9ecef', height: 6, borderRadius: 3, width: '100%', overflow: 'hidden', },
    summaryPnLBar: { height: '100%', borderRadius: 3, },
    popupContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, left: '10%', right: '10%', backgroundColor: 'rgba(0, 102, 204, 0.9)', padding: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', zIndex: 2000, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, },
    popupText: { color: 'white', fontSize: 15, fontWeight: '600', textAlign: 'center', },
    searchSortContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12, // Match card margins
      paddingVertical: 10,
      backgroundColor: '#F8F9FA', // Keep light background
      borderBottomWidth: 1,
      borderBottomColor: '#E9ECEF', // Lighter border
  },
  sortByContainer: {
    minWidth: 130,
    height: 44, // Match search input height
    borderWidth: 1,
    borderColor: '#DEE2E6', // Match search input border
    borderRadius: 10, // Match search input radius
    backgroundColor: 'white',
    justifyContent: 'center',
    overflow: 'hidden',
},
  picker: { height: 40, width: '100%', borderWidth: 0, backgroundColor: 'transparent', color: '#495057', ...(Platform.OS === 'ios' ? {} : {}), },
    globalLoadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1500, },
    lastRefreshedContainer: { paddingHorizontal: 15, paddingBottom: 8, paddingTop: 4, alignItems: 'center', backgroundColor: '#f8f9fa', },
    lastRefreshedText: { fontSize: 11, color: '#6c757d', fontStyle: 'italic', },
});

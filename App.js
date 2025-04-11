// App.js
import React, { useState, useEffect } from 'react';
import { Modal, StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert, Platform, TextInput, Dimensions } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { fetchStocks, addStock, updateStock, deleteStock, bulkImportStocks, clearAllStocks, truncateStocks } from './stocksService';
import AddStockForm from './AddStockForm';

// Helper function for number formatting with commas
const formatNumber = (num) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

// Helper function for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Component for the header
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

// Component for the menu drawer
const MenuDrawer = ({ visible, onClose, onImportPress, onClearDataPress }) => {
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
      </View>
    </View>
  );
};

// Component for the tab navigation
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
    </View>
  );
};

// Component for the stock list
const StockList = ({ stocks, isLoading, onScroll, setActiveTab, setGlobalSearchTerm }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const screenWidth = Dimensions.get('window').width;
  
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Fetching stock data...</Text>
      </View>
    );
  }

  if (!stocks || stocks.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>No stocks imported yet. Please import an Excel file.</Text>
        <Text style={styles.emptyStateSubText}>Your Excel should contain columns for: ticker, account, quantity, costBasis, type</Text>
      </View>
    );
  }

  // Consolidate stocks by ticker
  const consolidatedStocks = {};
  stocks.forEach(stock => {
    const ticker = stock.ticker;
    
    if (!consolidatedStocks[ticker]) {
      consolidatedStocks[ticker] = {
        ticker,
        totalQuantity: 0,
        totalCost: 0,
        currentPrice: ticker === "CASH" ? 1 : stock.currentPrice || 0,
        totalValue: 0,
        pnl: 0,
        pnlPercentage: 0,
        portfolioPercentage: 0,
        type: stock.type // Preserve the type
      };
    }
    
    consolidatedStocks[ticker].totalQuantity += (stock.quantity || 0);
    consolidatedStocks[ticker].totalCost += ((stock.costBasis || 0) * (stock.quantity || 0));
    
    // Handle CASH ticker specially
    if (ticker === "CASH") {
      consolidatedStocks[ticker].currentPrice = 1;
      consolidatedStocks[ticker].totalValue += (stock.quantity || 0); // For CASH, value = quantity
    } else {
      consolidatedStocks[ticker].totalValue += ((stock.currentPrice || 0) * (stock.quantity || 0));
    }
  });
  
  // Calculate additional metrics
  const totalPortfolioValue = Object.values(consolidatedStocks).reduce(
    (sum, stock) => sum + stock.totalValue, 0
  );
  
  // Calculate P&L and portfolio percentage
  Object.values(consolidatedStocks).forEach(stock => {
    stock.pnl = stock.totalValue - stock.totalCost;
    stock.pnlPercentage = stock.totalCost > 0 ? (stock.pnl / stock.totalCost) * 100 : 0;
    stock.portfolioPercentage = totalPortfolioValue > 0 ? (stock.totalValue / totalPortfolioValue) * 100 : 0;
    stock.averageCostBasis = stock.totalQuantity > 0 ? stock.totalCost / stock.totalQuantity : 0;
  });
  
  // Convert to array and sort by ticker alphabetically (A to Z)
  const sortedStocks = Object.values(consolidatedStocks)
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
    .filter(stock => searchTerm === '' || stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <View style={styles.stockListContainer}>
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by ticker..."
            value={searchTerm}
            onChangeText={setSearchTerm}
            clearButtonMode="while-editing"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchTerm !== '' && (
            <TouchableOpacity style={styles.clearSearchButton} onPress={() => setSearchTerm('')}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        {searchTerm !== '' && (
          <View style={styles.searchActiveIndicator}>
            <Text style={styles.searchResultText}>
              Found {sortedStocks.length} {sortedStocks.length === 1 ? 'match' : 'matches'}
            </Text>
          </View>
        )}
      </View>
      
      <ScrollView 
        style={styles.modernStockList}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {sortedStocks.map((stock, index) => {
          // Format the type for display - capitalize first letter
          const displayType = stock.type ? 
            stock.type.charAt(0).toUpperCase() + stock.type.slice(1).toLowerCase() : 
            'Stock';
          
          const isProfitable = stock.pnl >= 0;
          
          return (
            <TouchableOpacity 
              key={index} 
              style={styles.modernStockCard}
              onPress={() => {
                // Navigate directly to account detail view with search
                setActiveTab('accountDetail');
                // Set the global search term to the clicked ticker
                setGlobalSearchTerm(stock.ticker);
              }}
            >
              <View style={styles.stockCardHeader}>
                <View style={styles.stockCardTitleContainer}>
                  <Text style={styles.stockCardTicker}>{stock.ticker}</Text>
                  {stock.type && stock.type.toLowerCase() !== 'stock' && (
                    <Text style={styles.stockTypeTag}>
                      {displayType}
                    </Text>
                  )}
                </View>
                <Text style={styles.stockCardPrice}>${stock.currentPrice.toFixed(2)}</Text>
              </View>
              
              <View style={styles.stockCardDetails}>
                <View style={styles.stockCardMetric}>
                  <Text style={styles.stockCardMetricLabel}>Shares</Text>
                  <Text style={styles.stockCardMetricValue}>{formatNumber(Math.round(stock.totalQuantity))}</Text>
                </View>
                
                <View style={styles.stockCardMetric}>
                  <Text style={styles.stockCardMetricLabel}>Avg Cost</Text>
                  <Text style={styles.stockCardMetricValue}>${stock.averageCostBasis.toFixed(2)}</Text>
                </View>
                
                <View style={styles.stockCardMetric}>
                  <Text style={styles.stockCardMetricLabel}>Value</Text>
                  <Text style={styles.stockCardMetricValue}>${formatNumber(Math.round(stock.totalValue))}</Text>
                </View>
              </View>
              
              <View style={styles.stockCardFooter}>
                <View style={styles.stockCardPnLContainer}>
                  <Text style={styles.stockCardMetricLabel}>P&L</Text>
                  <Text style={[styles.stockCardPnL, isProfitable ? styles.profit : styles.loss]}>
                    {isProfitable ? '+' : '-'}${Math.abs(stock.pnl) >= 1000 ? formatNumber(Math.abs(stock.pnl).toFixed(0)) : Math.abs(stock.pnl).toFixed(2)}
                    <Text style={[styles.stockCardPnLPercent, isProfitable ? styles.profit : styles.loss]}>
                      {' '}({Math.abs(stock.pnlPercentage).toFixed(2)}%)
                    </Text>
                  </Text>
                </View>
                
                <View style={styles.stockCardAllocationContainer}>
                  <Text style={styles.stockCardMetricLabel}>% of Portfolio</Text>
                  <Text style={styles.stockCardAllocation}>{stock.portfolioPercentage.toFixed(2)}%</Text>
                </View>
              </View>
              
              <View style={[styles.stockCardPnLBar, {width: `${Math.min(Math.abs(stock.pnlPercentage) * 2, 100)}%`}, isProfitable ? styles.profitBar : styles.lossBar]}></View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

// Component for the portfolio summary with collapsible functionality
const PortfolioSummary = ({ stocks, forceCollapse }) => {
  const [userCollapsed, setUserCollapsed] = useState(true);
  
  // Combine user-initiated collapse with scroll-initiated collapse
  const isCollapsed = userCollapsed || forceCollapse;
  
  if (!stocks || stocks.length === 0) return null;

  // Create consolidated view for summary calculation
  const consolidatedStocks = {};
  stocks.forEach(stock => {
    const ticker = stock.ticker;
    
    if (!consolidatedStocks[ticker]) {
      consolidatedStocks[ticker] = {
      ticker,
        totalQuantity: 0,
        totalCost: 0,
        currentPrice: ticker === "CASH" ? 1 : stock.currentPrice || 0,
        totalValue: 0,
        type: stock.type // Type is required so we don't need defaults anymore
      };
    }
    
    consolidatedStocks[ticker].totalQuantity += (stock.quantity || 0);
    consolidatedStocks[ticker].totalCost += ((stock.costBasis || 0) * (stock.quantity || 0));
    
    // Handle CASH ticker specially
    if (ticker === "CASH") {
      consolidatedStocks[ticker].currentPrice = 1;
      consolidatedStocks[ticker].totalValue += (stock.quantity || 0); // For CASH, value = quantity
    } else {
      consolidatedStocks[ticker].totalValue += ((stock.currentPrice || 0) * (stock.quantity || 0));
    }
  });
  
  const totalValue = Object.values(consolidatedStocks).reduce((sum, stock) => sum + stock.totalValue, 0);
  const totalCost = Object.values(consolidatedStocks).reduce((sum, stock) => sum + stock.totalCost, 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPercentage = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
  
  // Count unique stocks (excluding CASH)
  const uniqueStocksCount = Object.keys(consolidatedStocks).filter(ticker => ticker !== "CASH").length;
  
  // Calculate CASH as percentage of portfolio
  const cashValue = Object.values(consolidatedStocks)
    .filter(stock => stock.type?.toLowerCase() === 'cash')
    .reduce((sum, stock) => sum + stock.totalValue, 0);
  const cashPercentage = totalValue > 0 ? (cashValue / totalValue) * 100 : 0;
  
  // Calculate stock values and percentages
  const stockValue = Object.values(consolidatedStocks)
    .filter(stock => stock.type?.toLowerCase() === 'stock')
    .reduce((sum, stock) => sum + stock.totalValue, 0);
  const stockPercentage = totalValue > 0 ? (stockValue / totalValue) * 100 : 0;
  
  // Calculate ETF values and percentages
  const etfValue = Object.values(consolidatedStocks)
    .filter(stock => stock.type?.toLowerCase() === 'etf')
    .reduce((sum, stock) => sum + stock.totalValue, 0);
  const etfPercentage = totalValue > 0 ? (etfValue / totalValue) * 100 : 0;

  const toggleCollapse = () => {
    setUserCollapsed(!userCollapsed);
  };

  const isProfitable = totalPnL >= 0;

  return (
    <View style={styles.modernSummaryContainer}>
      <TouchableOpacity 
        style={styles.modernSummaryHeader} 
        onPress={toggleCollapse}
        activeOpacity={0.7}
      >
        <Text style={styles.modernSummaryHeaderText}>Portfolio Summary</Text>
        <View style={styles.collapseIconContainer}>
          <Text style={[styles.collapseIcon, isCollapsed && styles.collapseIconRotated]}>▼</Text>
        </View>
      </TouchableOpacity>
      
      {!isCollapsed && (
        <View style={styles.modernSummaryContent}>
          <View style={styles.summaryMainCard}>
            <View style={styles.summaryMainValues}>
              <View style={styles.summaryMainValueItem}>
                <Text style={styles.summaryMainLabel}>Total Value</Text>
                <Text style={styles.summaryMainValue}>${formatNumber(Math.round(totalValue))}</Text>
              </View>
              
              <View style={styles.summaryMainValueItem}>
                <Text style={styles.summaryMainLabel}>Total Cost</Text>
                <Text style={styles.summaryMainValue}>${formatNumber(Math.round(totalCost))}</Text>
              </View>
            </View>
            
            <View style={styles.summaryPnLContainer}>
              <View style={styles.summaryPnLRow}>
                <Text style={styles.summaryPnLLabel}>Total P&L</Text>
                <Text style={[styles.summaryPnLValue, isProfitable ? styles.profit : styles.loss]}>
                  {isProfitable ? '+' : '-'}${formatNumber(Math.abs(Math.round(totalPnL)))} ({isProfitable ? '+' : '-'}{Math.abs(totalPnLPercentage).toFixed(2)}%)
                </Text>
              </View>
              <View style={styles.summaryPnLBarContainer}>
                <View style={[styles.summaryPnLBar, {width: `${Math.min(Math.abs(totalPnLPercentage), 100)}%`}, isProfitable ? styles.profitBar : styles.lossBar]}></View>
              </View>
            </View>
          </View>
          
          <View style={styles.summaryCardsContainer}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardTitle}>Assets</Text>
              <Text style={styles.summaryCardValue}>{uniqueStocksCount}</Text>
              <Text style={styles.summaryCardSubtitle}>Unique Securities</Text>
            </View>
            
            {stockValue > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardTitle}>Stocks</Text>
                <Text style={styles.summaryCardValue}>${formatNumber(Math.round(stockValue))}</Text>
                <Text style={styles.summaryCardSubtitle}>{stockPercentage.toFixed(2)}% of portfolio</Text>
              </View>
            )}
            
            {etfValue > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardTitle}>ETFs</Text>
                <Text style={styles.summaryCardValue}>${formatNumber(Math.round(etfValue))}</Text>
                <Text style={styles.summaryCardSubtitle}>{etfPercentage.toFixed(2)}% of portfolio</Text>
              </View>
            )}
            
            {cashValue > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardTitle}>Cash</Text>
                <Text style={styles.summaryCardValue}>${formatNumber(Math.round(cashValue))}</Text>
                <Text style={styles.summaryCardSubtitle}>{cashPercentage.toFixed(2)}% of portfolio</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

// Component for detailed account view showing stocks by account - Add editing functionality
const AccountDetailView = ({ accounts, isLoading, handleEditStock, searchTerm, setSearchTerm }) => {
  const [expandedAccounts, setExpandedAccounts] = useState({});
  const screenWidth = Dimensions.get('window').width;
  
  // Toggle account expansion
  const toggleAccount = (accountName) => {
    setExpandedAccounts(prev => ({
      ...prev,
      [accountName]: !prev[accountName]
    }));
  };

  // Auto-expand accounts when search is active
  useEffect(() => {
    if (searchTerm !== '') {
      // Get list of accounts that contain search results
      const accountsWithResults = {};
      Object.keys(accounts || {}).forEach(accountName => {
        const account = accounts[accountName];
        const hasResults = account.stocks.some(
          stock => stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()) || 
                  accountName.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (hasResults) {
          accountsWithResults[accountName] = true;
        }
      });
      
      // Expand only accounts with matching results
      setExpandedAccounts(accountsWithResults);
    }
  }, [searchTerm, accounts]);
  
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Fetching stock data...</Text>
      </View>
    );
  }

  if (!accounts || Object.keys(accounts).length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>No accounts to display.</Text>
      </View>
    );
  }

  // Filter accounts based on search term
  const filteredAccounts = {};
  Object.keys(accounts).forEach(accountName => {
    const account = accounts[accountName];
    // Filter stocks within the account that match either by ticker or account name
    const filteredStocks = account.stocks.filter(
      stock => searchTerm === '' || 
      stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()) || 
      accountName.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Only add the account if it has matching stocks
    if (filteredStocks.length > 0) {
      filteredAccounts[accountName] = {
        ...account,
        stocks: filteredStocks
      };
    }
  });

  return (
    <View style={styles.accountsContainer}>
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by ticker or account..."
            value={searchTerm}
            onChangeText={setSearchTerm}
            clearButtonMode="while-editing"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchTerm !== '' && (
            <TouchableOpacity style={styles.clearSearchButton} onPress={() => setSearchTerm('')}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        {searchTerm !== '' && (
          <View style={styles.searchActiveIndicator}>
            <Text style={styles.searchResultText}>
              Found in {Object.keys(filteredAccounts).length} {Object.keys(filteredAccounts).length === 1 ? 'account' : 'accounts'}
            </Text>
          </View>
        )}
      </View>
      <ScrollView style={styles.accountDetailList}>
        {Object.keys(filteredAccounts).map((accountName, index) => {
          const account = filteredAccounts[accountName];
          const pnl = account.pnl || 0;
          const pnlPercentage = account.pnlPercentage || 0;
          const isExpanded = !!expandedAccounts[accountName]; // Default to collapsed
          
          return (
            <View key={index} style={styles.modernAccountCard}>
              <TouchableOpacity 
                style={[
                  styles.accountHeader,
                  isExpanded && { borderBottomWidth: 1 } 
                ]}
                onPress={() => toggleAccount(accountName)}
                activeOpacity={0.7}
              >
                <View style={styles.accountHeaderLeft}>
                  <Text style={styles.modernAccountName}>{accountName}</Text>
                  <Text style={styles.accountStockCount}>
                    {account.stocks.length} {account.stocks.length === 1 ? 'position' : 'positions'}
                  </Text>
                </View>
                
                <View style={styles.accountHeaderRight}>
                  <View style={styles.accountValueContainer}>
                    <Text style={styles.accountValueLabel}>Value</Text>
                    <Text style={styles.accountValueAmount}>
                      ${formatNumber(Math.round(account.totalValue || 0))}
                    </Text>
                  </View>
                  
                  <View style={styles.collapseIconContainer}>
                    <Text style={[styles.accountCollapseIcon, !isExpanded && styles.accountCollapseIconRotated]}>
                      ▼
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
              
              {isExpanded && (
                <View style={styles.accountDetails}>
                  <View style={styles.accountSummaryCards}>
                    <View style={styles.summaryCard}>
                      <Text style={styles.summaryCardLabel}>Total Cost</Text>
                      <Text style={styles.summaryCardValue}>
                        ${formatNumber(Math.round(account.totalCost || 0))}
                      </Text>
                    </View>
                    
                    <View style={styles.summaryCard}>
                      <Text style={styles.summaryCardLabel}>P&L</Text>
                      <Text style={[styles.summaryCardValue, pnl >= 0 ? styles.profit : styles.loss]}>
                        ${Math.abs(pnl) >= 1000 ? formatNumber(Math.abs(pnl).toFixed(0)) : Math.abs(pnl).toFixed(2)} 
                        ({pnl >= 0 ? '+' : '-'}{Math.abs(pnlPercentage).toFixed(2)}%)
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.tableContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                      <View style={{width: screenWidth * 1.2}}>
                        <View style={styles.tableHeader}>
                          <Text style={[styles.cell, styles.headerCell, { flex: 2.5, minWidth: 85 }]}>Ticker</Text>
                          <Text style={[styles.cell, styles.headerCell, { flex: 1, minWidth: 60 }]}>Shares</Text>
                          <Text style={[styles.cell, styles.headerCell, { flex: 1, minWidth: 70 }]}>Cost</Text>
                          <Text style={[styles.cell, styles.headerCell, { flex: 1, minWidth: 60 }]}>Price</Text>
                          <Text style={[styles.cell, styles.headerCell, { flex: 1, minWidth: 70 }]}>Value</Text>
                          <Text style={[styles.cell, styles.headerCell, { flex: 1, minWidth: 65 }]}>P&L</Text>
                        </View>
                        
                        {account.stocks
                          .sort((a, b) => a.ticker.localeCompare(b.ticker))
                          .map((stock, stockIndex) => {
                            const currentValue = (stock.currentPrice || 0) * (stock.quantity || 0);
                            const costValue = (stock.costBasis || 0) * (stock.quantity || 0);
                            const pnl = currentValue - costValue;
                            
                            // Format the type for display - capitalize first letter
                            const displayType = stock.type ? 
                              stock.type.charAt(0).toUpperCase() + stock.type.slice(1).toLowerCase() : 
                              'Stock';
                            
                            return (
                              <TouchableOpacity 
                                key={stockIndex} 
                                style={[styles.row, stockIndex % 2 === 0 ? styles.evenRow : styles.oddRow]}
                                onPress={() => handleEditStock(stock)}
                              >
                                <Text style={[styles.cell, { flex: 2.5, minWidth: 85 }]}>
                                  {stock.ticker}
                                  {stock.type && stock.type.toLowerCase() !== 'stock' && (
                                    <Text style={styles.typeBadge}>
                                      {' '}({displayType})
                                    </Text>
                                  )}
                                </Text>
                                <Text style={[styles.cell, { flex: 1, minWidth: 60 }]}>{formatNumber(Math.round(stock.quantity))}</Text>
                                <Text style={[styles.cell, { flex: 1, minWidth: 70 }]}>${stock.costBasis.toFixed(2)}</Text>
                                <Text style={[styles.cell, { flex: 1, minWidth: 60 }]}>${stock.currentPrice.toFixed(2)}</Text>
                                <Text style={[styles.cell, { flex: 1, minWidth: 70 }]}>${formatNumber(Math.round(currentValue))}</Text>
                                <Text style={[styles.cell, pnl >= 0 ? styles.profit : styles.loss, { flex: 1, minWidth: 65 }]}>
                                  ${Math.abs(pnl) >= 1000 ? formatNumber(Math.abs(pnl).toFixed(0)) : Math.abs(pnl).toFixed(2)}
                                </Text>
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

// Main App component
export default function App() {
  const [stocks, setStocks] = useState([]);
  const [accounts, setAccounts] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('portfolio');
  const [error, setError] = useState(null);
  const [isAddingStock, setIsAddingStock] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [isEditingStock, setIsEditingStock] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Load data from Supabase on app load
  useEffect(() => {
    loadStocks();
  }, []);
  
  // Reset search term when changing tabs
  useEffect(() => {
    if (activeTab === 'portfolio') {
      setGlobalSearchTerm('');
    }
  }, [activeTab]);

  const loadStocks = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch stocks from Supabase
      const stockData = await fetchStocks();
      
      // Process the stock data
      await processStockData(stockData);
    } catch (error) {
      console.error('Error loading stocks:', error);
      setError(error.message);
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (fileUri) => {
    try {
      setIsLoading(true);
      setError(null);
  
      // Read file content as base64
      const fileContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
  
      // Parse Excel file
      const workbook = XLSX.read(fileContent, { type: 'base64' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
  
      console.log('Excel data:', data);
  
      // Process and validate each row
      const normalizedData = data.map((row, index) => {
        // Find column names case-insensitively
        const findColumn = (prefixes) => {
          const key = Object.keys(row).find(k =>
            prefixes.some(p => k.toLowerCase().includes(p.toLowerCase()))
          );
          return key ? row[key] : null;
        };
  
        // Extract data with flexible column names
        const ticker = findColumn(['ticker', 'symbol']);
        const account = findColumn(['account', 'accountname']);
        const quantity = findColumn(['quantity', 'shares', 'units']);
        const costBasis = findColumn(['costbasis', 'cost', 'price']);
        const type = findColumn(['type', 'securitytype']);
  
        // Validate required fields
        if (!ticker) throw new Error(`Missing ticker in row ${index + 1}`);
        if (!account) throw new Error(`Missing account in row ${index + 1}`);
        if (!quantity) throw new Error(`Missing quantity in row ${index + 1}`);
        if (!costBasis) throw new Error(`Missing cost basis in row ${index + 1}`);
        if (!type) throw new Error(`Missing type in row ${index + 1}`);
  
        // Format the data
        const processedRow = {
          ticker: String(ticker).toUpperCase(),
          account: String(account).trim(),
          quantity: parseFloat(quantity),
          costBasis: parseFloat(costBasis),
          type: String(type).toLowerCase(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
  
        // Validate data types
        if (isNaN(processedRow.quantity)) throw new Error(`Invalid quantity in row ${index + 1}`);
        if (isNaN(processedRow.costBasis)) throw new Error(`Invalid cost basis in row ${index + 1}`);
  
        console.log('Processed row:', processedRow);
        return processedRow;
      });
  
      // Show confirmation dialog
      Alert.alert(
        "Import Confirmation",
        `Found ${normalizedData.length} stocks to import:\n\n` +
        `Tickers: ${normalizedData.map(s => s.ticker).join(', ')}\n\n` +
        `Continue with import?`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              setIsLoading(false);
              setError(null);
            },
          },
          {
            text: "Import",
            onPress: async () => {
              try {
                const result = await bulkImportStocks(normalizedData);
                console.log('Import result:', result);
  
                if (result && result.length > 0) {
                  await loadStocks();
                  Alert.alert("Success", `Imported ${result.length} stocks successfully!`);
                } else {
                  throw new Error('No data was imported');
                }
              } catch (error) {
                console.error('Import error:', error);
                Alert.alert('Import Error', error.message);
              } finally {
                setIsLoading(false);
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('File processing error:', error);
      Alert.alert('Error', error.message);
      setIsLoading(false);
    }
  };
    
  const handleAddStock = async (stockData) => {
    try {
      setIsLoading(true);
      
      // Check if this is a delete action
      if (stockData.action === 'delete') {
        if (!stockData.id) {
          throw new Error('Cannot delete stock: missing ID');
        }
        await deleteStock(stockData.id);
        setIsEditingStock(false);
        setSelectedStock(null);
        await loadStocks();
        Alert.alert("Success", "Stock deleted successfully!");
        return;
      }
      
      // Validate data
      if (!stockData.ticker) throw new Error('Ticker is required');
      if (!stockData.account) throw new Error('Account is required');
      if (!stockData.quantity || isNaN(parseFloat(stockData.quantity)) || parseFloat(stockData.quantity) <= 0) 
        throw new Error('Quantity must be a positive number');
      if (!stockData.costBasis || isNaN(parseFloat(stockData.costBasis)) || parseFloat(stockData.costBasis) <= 0) 
        throw new Error('Cost basis must be a positive number');
      if (!['stock', 'etf', 'cash'].includes(stockData.type.toLowerCase()))
        throw new Error('Type must be Stock, ETF, or CASH');
      
      const processedData = {
        ...stockData,
        quantity: parseFloat(stockData.quantity),
        costBasis: parseFloat(stockData.costBasis)
      };
      
      if (isEditingStock && selectedStock) {
        // Make sure we have a valid ID
        if (!selectedStock.id) {
          throw new Error('Cannot update stock: missing ID');
        }
        
        console.log('Updating stock with ID:', selectedStock.id);
        
        // Update existing stock
        await updateStock(selectedStock.id, processedData);
        Alert.alert("Success", "Stock updated successfully!");
      } else {
        // Add new stock
        await addStock(processedData);
        Alert.alert("Success", `Stock added successfully! If duplicate ${processedData.ticker} positions existed in ${processedData.account}, they have been automatically consolidated.`);
      }
      
      // Close form and reload stocks
      setIsAddingStock(false);
      setIsEditingStock(false);
      setSelectedStock(null);
      await loadStocks();
    } catch (error) {
      console.error('Error managing stock:', error);
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleClearAllData = async () => {
    console.log("Clear button clicked");
    setIsModalVisible(true); // Show the modal
  };

  const confirmClearAllData = async () => {
    try {
      console.log("Delete All confirmed");
      await truncateStocks();
      console.log("All stocks cleared successfully");
      await loadStocks(); // Reload the stock list or perform any other actions
    } catch (error) {
      console.error("Error clearing data:", error);
    } finally {
      setIsModalVisible(false); // Hide the modal
    }
  };

  const validateData = (data) => {
    console.log('Validating data:', data); // Debug log
  
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No data found in the Excel file');
    }
  
    const firstRow = data[0];
    console.log('First row:', firstRow); // Debug log
  
    // Get all column names in lowercase for case-insensitive comparison
    const columns = Object.keys(firstRow).map(key => key.toLowerCase());
    console.log('Available columns:', columns); // Debug log
  
    // Check for required columns with flexible naming
    const requiredColumns = [
      ['ticker', 'symbol'],
      ['account', 'accountname'],
      ['quantity', 'shares', 'units'],
      ['costbasis', 'cost', 'price'],
      ['type', 'securitytype']
    ];
  
    requiredColumns.forEach(alternatives => {
      const hasColumn = alternatives.some(col => 
        columns.some(existingCol => existingCol.includes(col.toLowerCase()))
      );
      if (!hasColumn) {
        throw new Error(`Missing required column. Need one of: ${alternatives.join(' or ')}`);
      }
    });
  
    return true;
  };
  
  // Helper function to get a value from an object by a case-insensitive key prefix
  const getValueByKeyPrefix = (obj, prefix) => {
    const key = Object.keys(obj).find(k => k.toLowerCase() === prefix.toLowerCase());
    return key ? obj[key] : null;
  };

  const processStockData = async (data) => {
    try {
      // Normalize the data (handle different column names)
      const normalizedData = data.map(row => {
        let type = getValueByKeyPrefix(row, 'type');
        if (!type) {
          throw new Error(`Missing type for ${getValueByKeyPrefix(row, 'ticker')}. Type must be 'Stock', 'ETF', or 'CASH'.`);
        }
        type = type.toLowerCase();

        return {
          id: row.id,
          ticker: getValueByKeyPrefix(row, 'ticker'),
          account: getValueByKeyPrefix(row, 'account'),
          quantity: parseFloat(getValueByKeyPrefix(row, 'quantity') || 0),
          costBasis: parseFloat(getValueByKeyPrefix(row, 'costbasis') || 0),
          type: type,
        };
      });

      // Get unique tickers
      const tickers = [...new Set(normalizedData.map(item => item.ticker))];

      // Helper function to process a chunk of tickers
      const processChunk = async (chunk) => {
        const stockDataPromises = chunk.map(fetchYahooFinanceData); // Fetch data for all tickers in the chunk
        const stockDataResults = await Promise.all(stockDataPromises); // Wait for all requests in the chunk to complete
        return stockDataResults;
      };

      // Fetch current prices in chunks of 5 tickers
      const stockDataMap = {};
      for (let i = 0; i < tickers.length; i += 5) {
        const chunk = tickers.slice(i, i + 5); // Get the next chunk of 5 tickers
        console.log(`Processing chunk: ${chunk.join(', ')}`);

        const stockDataResults = await processChunk(chunk); // Process the chunk
        stockDataResults.forEach(data => {
          if (data) stockDataMap[data.ticker] = data; // Add the results to the stockDataMap
        });

        if (i + 5 < tickers.length) {
          console.log('Waiting for 2 minutes before processing the next chunk...');
          await delay(120000); // Wait for 2 minutes (120,000 ms) before processing the next chunk
        }
      }

      // Process each stock entry
      const processedStocks = normalizedData.map(stock => {
        const marketData = stockDataMap[stock.ticker] || { currentPrice: 0 };

        // Force CASH ticker to always have price of 1.0
        let currentPrice = stock.ticker === "CASH" ? 1.0 : marketData.currentPrice || 0;

        // If price is 0 (not found), use a cost-basis-based fallback
        if (currentPrice === 0) {
          currentPrice = (stock.costBasis || 0) * 1.05; // Use cost basis + 5% as fallback
          console.log(`Using fallback price for ${stock.ticker}: $${currentPrice.toFixed(2)}`);
        }

        const quantity = stock.quantity || 0;
        const costBasis = stock.costBasis || 0;

        const currentValue = currentPrice * quantity;
        const totalCost = costBasis * quantity;
        const pnl = currentValue - totalCost;
        const pnlPercentage = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

        return {
          ...stock,
          currentPrice,
          currentValue,
          pnl,
          pnlPercentage,
          portfolioPercentage: 0, // Will be calculated after
        };
      });

      // Calculate portfolio percentage
      const totalPortfolioValue = processedStocks.reduce((sum, stock) => sum + (stock.currentValue || 0), 0);
      const stocksWithPortfolioPercentage = processedStocks.map(stock => ({
        ...stock,
        portfolioPercentage: totalPortfolioValue > 0 ? ((stock.currentValue || 0) / totalPortfolioValue) * 100 : 0,
      }));

      setStocks(stocksWithPortfolioPercentage);
    } catch (error) {
      console.error('Error processing stock data:', error);
      setError(`Error processing data: ${error.message}`);
      Alert.alert('Data Processing Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };
  
// Using fetchYahooFinanceData function to get stock prices
const fetchYahooFinanceData = async (ticker) => {
  try {
    if (ticker === "CASH") {
      console.log(`Ticker CASH: fixed price = $1.00`);
      return { ticker, currentPrice: 1.0 };
    }

    console.log(`Fetching data for ${ticker} from Yahoo Finance...`);

    try {
      // Direct Yahoo Finance API call
      const yahooFinanceUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d`;

    // Use proxy for web to bypass CORS
    const proxyUrl = Platform.OS === 'web' ? 'https://cors-anywhere.herokuapp.com/' : '';
    const response = await axios.get(proxyUrl + yahooFinanceUrl);
    
    if (response.data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
      const price = response.data.chart.result[0].meta.regularMarketPrice;
      console.log(`Successfully fetched Yahoo price for ${ticker}: $${price}`);
      return { ticker, currentPrice: price };
    }

    throw new Error('Price not found');
    } catch (yahooError) {
      console.log(`Yahoo Finance failed for ${ticker}, trying Google Finance...`);
      
      // Try Google Finance as backup
      const googlePrice = await getGoogleFinancePrice(ticker);
      if (googlePrice && googlePrice > 0) {
        console.log(`Successfully fetched Google price for ${ticker}: $${googlePrice}`);
        return { ticker, currentPrice: googlePrice };
      }
    }

    console.log(`No valid price found for ${ticker} from either source`);
    return { ticker, currentPrice: 0, error: "No price available" };
  } catch (error) {
    console.error(`Error fetching price for ${ticker}:`, error.message);
    return { ticker, currentPrice: 0, error: error.message };
  }
};

  // Function to get stock price from Google Finance
  const getGoogleFinancePrice = async (ticker) => {
    try {
      const exchanges = ['NASDAQ', 'NYSE'];
      
      for (const exchange of exchanges) {
        try {
          const url = `https://www.google.com/finance/quote/${ticker}:${exchange}`;
          const response = await fetch(url);
          const html = await response.text();
          
          const priceMatch = html.match(/data-last-price="([0-9,.]+)"/);
          if (priceMatch && priceMatch[1]) {
            const price = parseFloat(priceMatch[1].replace(/,/g, ''));
            console.log(`Found price ${price} for ${ticker} from Google Finance (${exchange})`);
            return price;
          }
        } catch (exchangeError) {
          console.log(`Error fetching ${ticker} from ${exchange}: ${exchangeError.message}`);
        }
      }
      return 0;
    } catch (error) {
      console.error(`Failed to get price for ${ticker} from Google:`, error);
      return 0;
    }
  };
  
  // Function to handle stock edit selection
  const handleEditStock = (stock) => {
    console.log("Editing stock:", stock);
    console.log("Stock ID:", stock.id);
    console.log("Stock data:", JSON.stringify(stock));
    setSelectedStock(stock);
    setIsEditingStock(true);
    setIsAddingStock(true);
  };

  const renderActiveTab = () => {
    const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
    
    const handleScroll = (event) => {
      const scrollY = event.nativeEvent.contentOffset.y;
      if (scrollY > 10 && !isSummaryCollapsed) {
        setIsSummaryCollapsed(true);
      } else if (scrollY <= 10 && isSummaryCollapsed) {
        setIsSummaryCollapsed(false);
      }
    };
    
    switch (activeTab) {
      case 'portfolio':
    return (
          <View style={styles.tabContent}>
            <PortfolioSummary stocks={stocks} forceCollapse={isSummaryCollapsed} />
            <StockList 
              stocks={stocks} 
              isLoading={isLoading} 
              onScroll={handleScroll}
              setActiveTab={setActiveTab}
              setGlobalSearchTerm={setGlobalSearchTerm}
            />
      </View>
    );
      case 'accountDetail':
        return (
          <AccountDetailView 
            accounts={accounts} 
            isLoading={isLoading} 
            handleEditStock={handleEditStock}
            searchTerm={globalSearchTerm}
            setSearchTerm={setGlobalSearchTerm}
          />
        );
      default:
        return <StockList stocks={stocks} isLoading={isLoading} />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header onMenuPress={() => setMenuVisible(true)} />
      <TabNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
      {error && <Text style={styles.errorText}>{error}</Text>}
      {renderActiveTab()}
      
      {/* Add Stock Button */}
      <View style={styles.addButtonContainer}>
        <TouchableOpacity style={styles.addButton} onPress={() => {
          setSelectedStock(null);
          setIsEditingStock(false);
          setIsAddingStock(true);
        }}>
          <Text style={styles.addButtonText}>+ Add Stock</Text>
            </TouchableOpacity>
          </View>
          
      {/* Menu Drawer */}
      <MenuDrawer 
        visible={menuVisible} 
        onClose={() => setMenuVisible(false)}
        onImportPress={() => {
          setMenuVisible(false);
          DocumentPicker.getDocumentAsync({
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            copyToCacheDirectory: true,
          }).then(result => {
            if (result.type !== 'cancel') {
              handleFileSelect(result.uri); // Use result.uri instead of result.assets[0].uri
            }
          }).catch(error => {
            console.error('Error picking document:', error);
            Alert.alert('Error', 'Failed to pick document. Please try again.');
          });
        }}
        onClearDataPress={handleClearAllData}
      />
      
      {/* Add/Edit Stock Form Modal */}
      <AddStockForm
        visible={isAddingStock}
        onClose={() => {
          setIsAddingStock(false);
          setIsEditingStock(false);
          setSelectedStock(null);
        }}
        onSubmit={handleAddStock}
        initialValues={selectedStock}
        isEditing={isEditingStock}
      />

      {/* Custom Modal */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Warning</Text>
            <Text style={styles.modalMessage}>
              This will delete ALL stocks from the database. This action cannot be undone.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={confirmClearAllData}
              >
                <Text style={styles.confirmButtonText}>Delete All</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: Platform.OS === 'android' ? 25 : 0,
  },
  header: {
    backgroundColor: '#0066cc',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuButton: {
    width: 30,
  },
  menuIcon: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  menuPlaceholder: {
    width: 30,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    padding: 15,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#0066cc',
  },
  tabText: {
    color: '#666',
  },
  activeTabText: {
    color: '#0066cc',
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  emptyStateSubText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 10,
  },
  summaryContainer: {
    backgroundColor: 'white',
    margin: 10,
    marginBottom: 0,
    borderRadius: 5,
    overflow: 'hidden',
    elevation: 2,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#0066cc',
  },
  summaryHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  collapseIcon: {
    color: 'white',
    fontSize: 18,
  },
  summaryContent: {
    padding: 15,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 5,
  },
  summaryLabel: {
    color: '#666',
  },
  summaryValue: {
    fontWeight: 'bold',
  },
  stockListContainer: {
    flex: 1,
  },
  accountDetailContainer: {
    flex: 1,
  },
  searchContainer: {
    padding: 10,
    backgroundColor: '#f8f8f8',
  },
  searchInputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: 'white',
  },
  clearSearchButton: {
    position: 'absolute',
    right: 10,
    padding: 5,
  },
  clearSearchText: {
    color: '#999',
    fontSize: 16,
  },
  searchActiveIndicator: {
    marginTop: 5,
    paddingHorizontal: 5,
    backgroundColor: '#e6f2ff',
    paddingVertical: 4,
    borderRadius: 4,
  },
  searchResultText: {
    fontSize: 12,
    color: '#0066cc',
    fontStyle: 'italic',
  },
  stockList: {
    flex: 1,
    padding: 10,
  },
  accountList: {
    flex: 1,
    padding: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e0e0e0',
    padding: 10,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  headerCell: {
    fontWeight: 'bold',
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
  },
  evenRow: {
    backgroundColor: 'white',
  },
  oddRow: {
    backgroundColor: '#f9f9f9',
  },
  cell: {
    flex: 1,
    paddingHorizontal: 5,
    fontSize: 14,
    overflow: 'hidden',
  },
  profit: {
    color: 'green',
  },
  loss: {
    color: 'red',
  },
  accountCard: {
    backgroundColor: 'white',
    borderRadius: 5,
    padding: 15,
    marginVertical: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  accountName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#0066cc',
  },
  accountInfo: {
    marginTop: 5,
  },
  errorText: {
    color: 'red',
    padding: 10,
    textAlign: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0066cc',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  accountDetailList: {
    flex: 1,
    padding: 10,
  },
  accountDetailCard: {
    backgroundColor: 'white',
    borderRadius: 5,
    padding: 15,
    marginVertical: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  accountDetailName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#0066cc',
  },
  accountSummary: {
    backgroundColor: '#f0f8ff',
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  accountSummaryText: {
    fontSize: 14,
  },
  tableContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 5,
    backgroundColor: 'white',
    margin: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  tabContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  typeBadge: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  addButtonContainer: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    zIndex: 999,
  },
  addButton: {
    backgroundColor: '#0066cc',
    padding: 15,
    borderRadius: 50,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  addButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  noteText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 5,
    paddingHorizontal: 20,
  },
  adminButtonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    zIndex: 999,
  },
  adminButton: {
    backgroundColor: '#ff6666',
    padding: 10,
    borderRadius: 5,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  adminButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  accountsContainer: {
    flex: 1,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  menuOverlayBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  menuDrawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 250,
    height: '100%',
    backgroundColor: 'white',
    padding: 0,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  menuHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0066cc',
  },
  menuHeaderText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  menuCloseButton: {
    fontSize: 20,
    color: 'white',
  },
  menuItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  menuItemText: {
    fontSize: 16,
  },
  pnlLine: {
    marginTop: 5,
  },
  modernAccountCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderLeftWidth: 5,
    borderLeftColor: '#0066cc',
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0,
    borderBottomColor: '#f0f0f0',
  },
  accountHeaderLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  modernAccountName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#0066cc',
  },
  accountStockCount: {
    fontSize: 14,
    color: '#666',
    backgroundColor: '#f0f7ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  accountHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountValueContainer: {
    marginRight: 15,
    alignItems: 'flex-end',
  },
  accountValueLabel: {
    fontSize: 13,
    color: '#666',
  },
  accountValueAmount: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  accountCollapseIcon: {
    fontSize: 12,
    color: '#0066cc',
  },
  accountCollapseIconRotated: {
    transform: [{ rotate: '270deg' }],
  },
  accountDetails: {
    marginTop: 12,
  },
  accountSummaryCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryCard: {
    width: '48%',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: 'white',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  summaryCardTitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  summaryCardValue: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  summaryCardSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  collapseIconContainer: {
    width: 24,
    height: 24,
    backgroundColor: '#f0f7ff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernStockList: {
    flex: 1,
    padding: 10,
  },
  modernStockCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 4,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderLeftWidth: 5,
    borderLeftColor: '#0066cc',
  },
  stockCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockCardTitleContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  stockCardTicker: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#0066cc',
  },
  stockCardPrice: {
    fontSize: 14,
    color: '#666',
  },
  stockCardDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  stockCardMetric: {
    flex: 1,
    alignItems: 'center',
  },
  stockCardMetricLabel: {
    fontSize: 13,
    color: '#666',
  },
  stockCardMetricValue: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  stockCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockCardPnLContainer: {
    marginRight: 15,
    alignItems: 'flex-end',
  },
  stockCardPnL: {
    fontSize: 14,
    color: '#666',
  },
  stockCardPnLPercent: {
    fontSize: 12,
    color: '#666',
  },
  stockCardAllocationContainer: {
    marginRight: 15,
    alignItems: 'flex-end',
  },
  stockCardAllocation: {
    fontSize: 14,
    color: '#666',
  },
  stockCardPnLBar: {
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  profitBar: {
    backgroundColor: 'green',
  },
  lossBar: {
    backgroundColor: 'red',
  },
  modernSummaryContainer: {
    backgroundColor: 'white',
    margin: 10,
    marginBottom: 0,
    borderRadius: 5,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  modernSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#0066cc',
  },
  modernSummaryHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  collapseIcon: {
    color: 'white',
    fontSize: 18,
  },
  collapseIconRotated: {
    transform: [{ rotate: '270deg' }],
  },
  modernSummaryContent: {
    padding: 15,
  },
  summaryMainCard: {
    backgroundColor: '#f0f8ff',
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  summaryMainValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  summaryMainValueItem: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  summaryMainLabel: {
    fontSize: 13,
    color: '#666',
  },
  summaryMainValue: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  summaryPnLContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 10,
  },
  summaryPnLRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryPnLLabel: {
    fontSize: 13,
    color: '#666',
  },
  summaryPnLValue: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  summaryCardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  stockTypeTag: {
    fontSize: 12,
    color: 'white',
    backgroundColor: '#0066cc',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  summaryPnLBarContainer: {
    marginTop: 10,
    backgroundColor: '#f0f0f0',
    height: 6,
    borderRadius: 3,
    width: '100%',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#e0e0e0',
  },
  confirmButton: {
    backgroundColor: '#ff6666',
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: 'bold',
  },
  confirmButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

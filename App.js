// App.js
import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback here
import { Modal, StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert, Platform, TextInput, Dimensions, Picker } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { fetchStocks, addStock, updateStock, deleteStock, bulkImportStocks, truncateStocks, fetchStockByTickerAndAccount, refreshPortfolioDataIfNeeded, fetchAllCachedStockData, fetchPortfolioHistory } from './stocksService';
import AddStockForm from './AddStockForm';
import PortfolioGraph from './PortfolioGraph'; // Add this import

import { useSupabaseConfig } from './SupabaseConfigContext'; // Import the hook


// Helper function for number formatting with commas
const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) {
    return '0'; // Or handle as appropriate, e.g., return '-'
  }
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

// Helper function for delay
//const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
const MenuDrawer = ({ visible, onClose, onImportPress, onClearDataPress,onDisconnectPress }) => {
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
      <TouchableOpacity
        style={[styles.tab, activeTab === 'history' && styles.activeTab]}
        onPress={() => setActiveTab('history')}
      >
        <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>History</Text>
      </TouchableOpacity>
    </View>
  );
};

// Component for the stock list
       // <Text style={styles.emptyStateText}>No stocks imported yet. Please import an Excel file.</Text>
const StockList = ({ stocks, isLoading, onScroll, setActiveTab, setGlobalSearchTerm, lastRefreshedTimestamp }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const screenWidth = Dimensions.get('window').width;
  const [sortBy, setSortBy] = useState('ticker'); // State for sorting
  
  const formatTimestamp = (timestamp) => {
    if (!timestamp) {
        // console.log("formatTimestamp: Received null or undefined timestamp");
        return null;
    }
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
            console.error("formatTimestamp: Invalid date created from timestamp:", timestamp);
            return "Invalid Date";
        }
        const formatted = `Last updated: ${date.toLocaleDateString(undefined, {
            month: 'short', day: 'numeric',
        })} ${date.toLocaleTimeString(undefined, {
            hour: 'numeric', minute: '2-digit'
        })} (Refreshes if > 2hrs old)`;
        //console.log(`formatTimestamp: Formatted '${timestamp}' to '${formatted}'`);
        return formatted;
    } catch (e) {
        console.error("Error formatting timestamp:", timestamp, e);
        return "Error formatting date";
    }
};

// Calculate the formatted timestamp using the prop inside the component body
const formattedTimestamp = formatTimestamp(lastRefreshedTimestamp);

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
  // stocks.forEach(stock => {
  //   const ticker = stock.ticker;
  (stocks || []).forEach(stock => { // Add guard for stocks array
   const ticker = stock.ticker?.toUpperCase() || 'UNKNOWN'; // Handle potential missing ticker
     
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
        type: stock.type || 'stock' // Preserve the type
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
    .sort((a, b) => {
      switch (sortBy) {
        case 'ticker':
          return a.ticker.localeCompare(b.ticker); // Sort by ticker
        case 'pnl':
          return b.pnl - a.pnl; // Sort by P&L descending
        case 'value':
          return b.totalValue - a.totalValue; // Sort by value descending
        default:
          return 0;
      }
    })
    .filter(stock => searchTerm === '' || stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <View style={styles.stockListContainer}>
      <View style={styles.searchSortContainer}>
        {/* Search By Ticker Input */}
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

        {/* Sort By Dropdown */}
        <View style={styles.sortByContainer}>
          <Picker
            selectedValue={sortBy}
            style={styles.picker}
            onValueChange={(itemValue) => setSortBy(itemValue)}
          >
            <Picker.Item label="Sort by Ticker" value="ticker" />
            <Picker.Item label="Sort by P&L" value="pnl" />
            <Picker.Item label="Sort by Value" value="value" />
          </Picker>
        </View>
      </View>

      {/* Last Refreshed Timestamp - This should now work */}
      {formattedTimestamp && (
                <View style={styles.lastRefreshedContainer}>
                    <Text style={styles.lastRefreshedText}>{formattedTimestamp}</Text>
                </View>
            )}

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
      
      {/* Add Stock Button */}
      <View style={styles.addButtonContainer}>
        <TouchableOpacity style={styles.addButton} onPress={() => {
          setSelectedStock(null);
          setIsEditingStock(false);
          setIsAddingStock(true);
        }}>
          <Text style={styles.addButtonText}>+</Text> {/* Change text to '+' */}
        </TouchableOpacity>
      </View>
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

// Component for popup notification
const PopupNotification = ({ visible, message }) => {
  if (!visible) return null;

  return (
    <View style={styles.popupContainer}>
      <Text style={styles.popupText}>{message}</Text>
    </View>
  );
};

// Add this component before the App component
const ImportConfirmationModal = ({ visible, data, onConfirm, onCancel }) => {
  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Import Confirmation</Text>
        <Text style={styles.modalMessage}>
          Found {data?.length || 0} stocks to import:{'\n\n'}
          Tickers: {data?.map(s => s.ticker).join(', ')}
        </Text>
        <View style={styles.modalButtons}>
          <TouchableOpacity 
            style={[styles.modalButton, styles.cancelButton]}
            onPress={onCancel}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.modalButton, styles.confirmButton]}
            onPress={onConfirm}
          >
            <Text style={styles.confirmButtonText}>Import</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

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
  const [isClearDataModalVisible, setIsClearDataModalVisible] = useState(false);
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [isImportModalVisible, setIsImportModalVisible] = useState(false);
  const [importData, setImportData] = useState(null);
  const [isDisconnectModalVisible, setIsDisconnectModalVisible] = useState(false); // <-- Add this line
  const [lastRefreshedTimestamp, setLastRefreshedTimestamp] = useState(null);
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);

  const { supabaseClient, clearConfig } = useSupabaseConfig(); // Get the dynamic client

  
  // Load data on app load and define loadStocks using useCallback
  const loadStocks = useCallback(async (showPopup = true) => { // Added showPopup flag
    if (!supabaseClient) { // Guard against missing client
      console.error("Supabase client not available in loadStocks");
      setError("Configuration error. Please check settings.");
      return;
  }console.log("loadStocks triggered");
    setIsLoading(true);
    setError(null);
    setLastRefreshedTimestamp(null); // Reset timestamp on load

    try {
            // 1. Check history and potentially trigger Edge Function to refresh cache/history
            await refreshPortfolioDataIfNeeded(supabaseClient);
            console.log("Potential refresh complete.");

            // 2. Fetch stocks, prices, and the *very latest* history entry
            const [rawStockData, cachedPricesMap, latestHistory] = await Promise.all([
              fetchStocks(supabaseClient),
              fetchAllCachedStockData(supabaseClient),
              fetchPortfolioHistory(supabaseClient, 1) // <-- Fetch only last day(s)
          ]);

          console.log(`Fetched ${rawStockData.length} raw stock entries.`);
          console.log(`Fetched ${cachedPricesMap.size} prices from cache.`);

          // 3. Extract timestamp from the latest history entry
          let latestTimestamp = null;
          if (latestHistory && latestHistory.length > 0) {
              // Get the last element (most recent date)
              const mostRecentEntry = latestHistory[latestHistory.length - 1];
              latestTimestamp = mostRecentEntry?.created_at; // Get its created_at
          }
          //console.log(`Extracted latest timestamp: ${latestTimestamp}`);

          // Update timestamp state
          setLastRefreshedTimestamp(latestTimestamp); // <-- Set timestamp state

      // 4. Process data using fetched prices
      processStockData(rawStockData, cachedPricesMap); // Pass prices map
      console.log("Stock data processed.");

      if (showPopup) {
        setPopupMessage('Portfolio data refreshed successfully!');
        setIsPopupVisible(true);
        setTimeout(() => setIsPopupVisible(false), 2000);
      }
    } catch (err) { // Changed variable name to avoid conflict
      console.error('Error loading stocks:', err);
      if (err.message.includes('JWT') || err.message.includes('Unauthorized') || err.message.includes('fetch')) {
        setError(`Connection failed: ${err.message}. Please check Supabase settings.`);
        // Optionally clear bad config here or prompt user
        // await clearConfig();
    } else {
        setError(`Failed to load portfolio: ${errorMessage}`);
    } 
      Alert.alert('Error Loading Data', `Could not load portfolio data. ${errorMessage}`);
    } finally {
      setIsLoading(false);
      console.log("loadStocks finished");
    }
  }, [supabaseClient]);
  // Load data from Supabase on app load
  useEffect(() => {
    if (supabaseClient) { // Only load if client exists
      loadStocks();
    }
  }, [supabaseClient, loadStocks]);
  
  // Reset search term when changing tabs
  useEffect(() => {
    if (activeTab === 'portfolio') {
      setGlobalSearchTerm('');
    }
  }, [activeTab]);

  const handleFileSelect = async (result) => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('File select triggered'); // Debug log
      console.log('Result:', result); // Debug log

      if (Platform.OS === 'web') {
        // Web platform handling
        const file = result.file;
        console.log('Processing web file:', file.name); // Debug log

        const reader = new FileReader();
        
        reader.onload = async (e) => {
          try {
            console.log('FileReader loaded'); // Debug log
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            console.log('Workbook sheets:', workbook.SheetNames); // Debug log
      
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            
            console.log('Parsed Excel data:', jsonData); // Debug log

            if (!jsonData || jsonData.length === 0) {
              throw new Error('No data found in the Excel file');
            }

            await processExcelData(jsonData);
          } catch (error) {
            console.error('Error processing Excel file:', error);
            Alert.alert('Error', error.message);
          } finally {
            setIsLoading(false);
          }
        };

        reader.onerror = (error) => {
          console.error('FileReader error:', error); // Debug log
          Alert.alert('Error', 'Failed to read the file');
          setIsLoading(false);
        };

        reader.readAsArrayBuffer(file);
      } else {
        // Mobile platform handling
        console.log('Processing mobile file:', result.uri); // Debug log
        
        const base64Content = await FileSystem.readAsStringAsync(result.uri, {
          encoding: FileSystem.EncodingType.Base64
        });
        
        const workbook = XLSX.read(base64Content, { type: 'base64' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        console.log('Parsed Excel data:', jsonData); // Debug log
        
        await processExcelData(jsonData);
      }
    } catch (error) {
      console.error('File processing error:', error);
      Alert.alert('Error', error.message);
      setIsLoading(false);
    } 
  };
  
  // Helper function to process Excel data
  const processExcelData = async (data) => {
    try {
      console.log('Starting to process Excel data...'); // Debug log

      if (!data || data.length === 0) {
        throw new Error('No data found in the Excel file');
      }

      // Log the first row to see the column structure
      console.log('Sample row:', data[0]);

      const normalizedData = data.map((row, index) => {
        // Find column names case-insensitively
        const findColumn = (prefixes) => {
          const key = Object.keys(row).find(k =>
            prefixes.some(p => k.toLowerCase().includes(p.toLowerCase()))
          );
          if (!key) {
            console.log(`Could not find column for prefixes: ${prefixes.join(', ')}`);
            console.log('Available columns:', Object.keys(row));
          }
          return key ? row[key] : null;
        };

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

        const normalized = {
          ticker: String(ticker).toUpperCase(),
          account: String(account).trim(),
          quantity: parseFloat(quantity),
          cost_basis: parseFloat(costBasis),
          type: String(type).toLowerCase(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        //console.log(`Processed row ${index + 1}:`, normalized); // Debug log
        return normalized;
      });

      console.log(`Normalized ${normalizedData.length} rows`); // Debug log

      // Show confirmation modal instead of Alert
      setImportData(normalizedData);
      setIsImportModalVisible(true);
    } catch (error) {
      console.error('Excel processing error:', error);
      setError(error.message);
      setIsLoading(false);
    }
  };
    
  const handleAddStock = async (stockData) => {
    if (!supabaseClient) { // Guard against missing client
      console.error("Supabase client not available in loadStocks");
      setError("Configuration error. Please check settings.");
      return;
  }
    try {
      setIsLoading(true);
      
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
        costBasis: parseFloat(stockData.costBasis) // Ensure this is a number
      };
  
      // Check if the stock already exists
      const existingStock = await getStockByTickerAndAccount(supabaseClient, processedData.ticker, processedData.account);
      
      if (existingStock) {
        // Calculate new quantity and weighted average cost basis
        const newQuantity = existingStock.quantity + processedData.quantity;
        const newCostBasis = ((existingStock.cost_basis * existingStock.quantity) + (processedData.costBasis * processedData.quantity)) / newQuantity;

        await updateStock(supabaseClient,existingStock.id, {
          quantity: newQuantity,
          costBasis: newCostBasis, // Update with the new weighted average cost basis
          type: existingStock.type,
        });
        Alert.alert("Success", "Stock updated successfully!");
      } else {
        // Add new stock
        await addStock(supabaseClient, processedData);
        Alert.alert("Success", `Stock added successfully!`);        
      }
      
      
      
      // Close form and reload stocks
      setIsAddingStock(false);
      setIsEditingStock(false);
      setSelectedStock(null);
      await loadStocks(false);
    } catch (error) {
      console.error('Error managing stock:', error);
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleClearAllData = async () => {
    console.log("Clear button clicked");
    setIsClearDataModalVisible(true); // Use the correct setter
  };

  const confirmClearAllData = async () => {
    if (!supabaseClient) { // Guard against missing client
      console.error("Supabase client not available in loadStocks");
      setError("Configuration error. Please check settings.");
      return;
  }
    try {
      setIsLoading(true); // Show loading indicator during deletion
      console.log("Delete All confirmed");
      await truncateStocks(supabaseClient); // Use the service function
      console.log("All stocks cleared successfully");
      setStocks([]); // Immediately clear client-side state
      setAccounts({});
      // Optionally call loadStocks() if you want to fetch anything remaining or confirm empty state
      // await loadStocks(false);
      setPopupMessage('All stock data cleared!');
      setIsPopupVisible(true);
      setTimeout(() => setIsPopupVisible(false), 3000);
    } catch (error) {
      console.error("Error clearing data:", error);
      Alert.alert('Error', `Failed to clear data: ${error.message}`);
    } finally {
      setIsClearDataModalVisible(false); // Use the correct setter
      setIsLoading(false);
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

    // --- processStockData (Simplified: uses cachedPricesMap) ---
    const processStockData = (rawData, cachedPricesMap) => {
      console.log(`Processing ${rawData.length} raw stocks with ${cachedPricesMap.size} cached prices.`);
      try {
        // 1. Process each stock entry using the cache
        const processedStocks = rawData.map(stock => {
          const ticker = stock.ticker?.toUpperCase(); // Ensure uppercase for lookup
          let currentPrice = 0;
  
          if (ticker === "CASH") {
            currentPrice = 1.0;
          } else if (ticker && cachedPricesMap.has(ticker)) {
            currentPrice = cachedPricesMap.get(ticker) ?? 0; // Use cached price, default to 0 if null/undefined
          } else {
            // Fallback if ticker is missing or not in cache (should be rare if refresh worked)
            console.warn(`Price not found in cache for ticker: ${ticker}. Using 0.`);
            currentPrice = 0;
          }
  
          const quantity = stock.quantity ?? 0;
          // Use costBasis field which should be mapped in fetchStocks or provided directly
          const costBasis = stock.costBasis ?? 0;
  
          const currentValue = currentPrice * quantity;
          const totalCost = costBasis * quantity;
          const pnl = currentValue - totalCost;
          const pnlPercentage = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
  
          return {
            ...stock, // Includes id, ticker, account, quantity, type, costBasis
            currentPrice,
            currentValue,
            totalCost, // Keep totalCost for reference if needed
            pnl,
            pnlPercentage,
            portfolioPercentage: 0, // Calculated next
          };
        });
  
        // 2. Calculate total portfolio value
        const totalPortfolioValue = processedStocks.reduce((sum, stock) => sum + (stock.currentValue || 0), 0);
        console.log(`Total Portfolio Value: ${totalPortfolioValue}`);
  
        // 3. Calculate portfolio percentage for each stock
        const stocksWithPortfolioPercentage = processedStocks.map(stock => ({
          ...stock,
          portfolioPercentage: totalPortfolioValue > 0 ? ((stock.currentValue || 0) / totalPortfolioValue) * 100 : 0,
        }));
  
        // 4. Group stocks by account and calculate account totals
        const accountsMap = {};
        stocksWithPortfolioPercentage.forEach(stock => {
          const accountName = stock.account || 'Uncategorized'; // Handle missing account name
          if (!accountsMap[accountName]) {
            accountsMap[accountName] = {
              stocks: [],
              totalValue: 0,
              totalCost: 0,
              pnl: 0,
              pnlPercentage: 0
            };
          }
          accountsMap[accountName].stocks.push(stock);
          accountsMap[accountName].totalValue += stock.currentValue || 0;
          // Recalculate total cost per account based on included stocks
          accountsMap[accountName].totalCost += (stock.costBasis ?? 0) * (stock.quantity ?? 0);
        });
  
        // Calculate P&L for each account
        Object.keys(accountsMap).forEach(accountName => {
          const account = accountsMap[accountName];
          account.pnl = account.totalValue - account.totalCost;
          account.pnlPercentage = account.totalCost > 0 ? (account.pnl / account.totalCost) * 100 : 0;
        });
  
        // 5. Update state
        setStocks(stocksWithPortfolioPercentage);
        setAccounts(accountsMap);
        console.log(`Processing complete. ${stocksWithPortfolioPercentage.length} stocks, ${Object.keys(accountsMap).length} accounts.`);
  
      } catch (error) {
        console.error('Error processing stock data:', error);
        setError(`Error processing data: ${error.message}`);
        Alert.alert('Data Processing Error', `Could not process portfolio data: ${error.message}`);
        // Clear potentially inconsistent state
        setStocks([]);
        setAccounts({});
      }
      // Removed the finally block that set isLoading to false, as it's handled in loadStocks
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

  const handleUpdateStock = async (stockData) => {
    if (!supabaseClient) { // Guard against missing client
      console.error("Supabase client not available in loadStocks");
      setError("Configuration error. Please check settings.");
      return;
      }
    try {
      setIsLoading(true);
      console.log("Stock data received:", stockData); // Debug log

    if (stockData.action === 'delete') {
      console.log("Delete action triggered for stock ID:", stockData.id); // Debug log
      await deleteStock(supabaseClient, stockData.id); // Ensure this is called
      Alert.alert("Success", "Stock deleted successfully!");
      // Close form and reload stocks
      setIsEditingStock(false);
      setSelectedStock(null);
      await loadStocks(); // Reload stocks after deletion
      return; // Exit the function after deletion
    }
      if (!stockData.id) throw new Error('Stock ID is required');
      if (!stockData.quantity || isNaN(parseFloat(stockData.quantity)) || parseFloat(stockData.quantity) < 0) 
        throw new Error('Quantity must be a non-negative number');
      if (!stockData.costBasis || isNaN(parseFloat(stockData.costBasis)) || parseFloat(stockData.costBasis) < 0) 
        throw new Error('Cost basis must be a non-negative number');

      const updatedData = {
        quantity: parseFloat(stockData.quantity), // Replace with new quantity
        costBasis: parseFloat(stockData.costBasis), // Replace with new cost basis
        type: stockData.type, // Keep the existing type
      };

      await updateStock(supabaseClient, stockData.id, updatedData);
      Alert.alert("Success", "Stock updated successfully!");

      // Close form and reload stocks
      setIsEditingStock(false);
      setSelectedStock(null);
      await loadStocks(false);
    } catch (error) {
      console.error('Error updating stock:', error);
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderActiveTab = () => {
    const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
    
    const handleScroll = (event) => {
      const scrollY = event.nativeEvent.contentOffset.y;
      setIsSummaryCollapsed(scrollY > 10);
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
              lastRefreshedTimestamp={lastRefreshedTimestamp} // Prop passed here
            />
      </View>
    );
      case 'accountDetail':
        return (
          <AccountDetailView 
            accounts={accounts} 
            isLoading={isLoading && Object.keys(accounts).length === 0} 
            handleEditStock={handleEditStock}
            searchTerm={globalSearchTerm}
            setSearchTerm={setGlobalSearchTerm}
          />
        );
      case 'history':
        return (
          <PortfolioGraph /> // Render the new graph component
        );
      default:
        return (
          <View style={styles.tabContent}>
            <PortfolioSummary stocks={stocks} forceCollapse={isSummaryCollapsed} />
            <StockList
              stocks={stocks}
              isLoading={isLoading && stocks.length === 0}
              onScroll={handleScroll}
              setActiveTab={setActiveTab}
              setGlobalSearchTerm={setGlobalSearchTerm}
            />
          </View>
        );
    }
  };

  // Function to open the Add Stock modal
  const openAddStockModal = () => {
    setSelectedStock(null);
    setIsEditingStock(false);
    setIsAddingStock(true);
};
  return (
    <SafeAreaView style={styles.container}>
      <Header onMenuPress={() => setMenuVisible(true)} />
      <TabNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
      {error && <Text style={styles.errorText}>{error}</Text>}
      {renderActiveTab()}
      
      {/* Floating Add Button - Visible on Portfolio and Account Detail tabs */}
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
        onImportPress={async () => {
          setMenuVisible(false);
          try {
            if (Platform.OS === 'web') {
              // Web file picker
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.xlsx,.xls';
              input.onchange = (e) => {
                console.log('File selected'); // Debug log
                const file = e.target.files[0];
                if (file) {
                  console.log('Selected file:', file.name); // Debug log
                  handleFileSelect({ file });
                }
              };
              
              input.click();
            } else {
              // Mobile file picker
              const result = await DocumentPicker.getDocumentAsync({
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                copyToCacheDirectory: true
              });
              
              console.log('Document picker result:', result); // Debug log
              
              if (result.type !== 'cancel') {
                handleFileSelect(result);
              }
            }
          } catch (error) {
            console.error('Error picking document:', error);
            Alert.alert('Error', 'Failed to pick document. Please try again.');
          }
        }}
        onClearDataPress={() => {
          setMenuVisible(false);
          handleClearAllData();
        }}
        onDisconnectPress={async () => { // Pass the handler
          console.log("Disconnect button pressed in MenuDrawer");
          setMenuVisible(false); // Close the menu
          setIsDisconnectModalVisible(true); // Show the custom confirmation modal
      }}
      />
      
      {/* Add/Edit Stock Form Modal */}
      <AddStockForm
        visible={isAddingStock}
        onClose={() => {
          setIsAddingStock(false);
          setIsEditingStock(false);
          setSelectedStock(null);
        }}
        onSubmit={isEditingStock ? handleUpdateStock : handleAddStock}
        initialValues={selectedStock}
        isEditing={isEditingStock}
      />

      {/* Clear Data Confirmation Modal */}
      <Modal
        visible={isClearDataModalVisible} // Use correct state variable
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsClearDataModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Confirm Clear Data</Text>
            <Text style={styles.modalMessage}>
              This will delete ALL stocks from the database. This action cannot be undone. Are you sure?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsClearDataModalVisible(false)} // Use correct state setter
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, { backgroundColor: '#dc3545' }]}
                onPress={confirmClearAllData} // Use correct handler
              >
                <Text style={styles.confirmButtonText}>Delete All</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

{/* Disconnect Confirmation Modal */}
      <Modal
        visible={isDisconnectModalVisible} // Use the state variable
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDisconnectModalVisible(false)} // Allow closing via back button etc.
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Confirm Disconnect</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to disconnect from Supabase? You will need to re-enter your URL and Key to use the app again.
            </Text>
            <View style={styles.modalButtons}>
              {/* Cancel Button */}
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsDisconnectModalVisible(false)} // Just close the modal
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              {/* Confirm Disconnect Button */}
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]} 
                onPress={async () => {
                  console.log("Disconnect confirmed in Modal");
                  setIsDisconnectModalVisible(false); // Close the modal

                  // --- Disconnect Logic ---
                  try {
                      await clearConfig(); // Call the function from context
                      console.log("clearConfig finished successfully.");
                      // Reset app state
                      setStocks([]);
                      setAccounts({});
                      setError(null);
                      // Optional success message
                      setPopupMessage('Disconnected successfully!');
                      setIsPopupVisible(true);
                      setTimeout(() => setIsPopupVisible(false), 2000);
                  } catch (error) {
                      console.error("Error during disconnect:", error);
                      // Show error using Alert (or another custom modal/popup if Alert is unreliable)
                      Alert.alert("Error", "Failed to disconnect. Please try again.");
                  }
                  // --- End Disconnect Logic ---
                }}
              >
                <Text style={styles.confirmButtonText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Import Confirmation Modal */}
      <ImportConfirmationModal
        visible={isImportModalVisible}
        data={importData}
        onCancel={() => {
          setIsImportModalVisible(false);
          setImportData(null);
          setIsLoading(false);
        }}
        onConfirm={async () => {
          if (!supabaseClient) { // Guard against missing client
            console.error("Supabase client not available in loadStocks");
            setError("Configuration error. Please check settings.");
            return;
          }
          try {
            console.log('User confirmed import, starting...');
            setIsLoading(true);
            
            const result = await bulkImportStocks(supabaseClient, importData);
            console.log('Import completed:', result);

            if (result && result.length > 0) {
              await loadStocks(false);
              setPopupMessage(`Imported ${result.length} stocks successfully!`);
              setIsPopupVisible(true);
              setTimeout(() => setIsPopupVisible(false), 3000);
            } else {
              throw new Error('No data was imported');
            }
          } catch (error) {
            console.error('Import error:', error);
            setError(error.message);
          } finally {
            setIsImportModalVisible(false);
            setImportData(null);
            setIsLoading(false);
          }
        }}
      />

      {/* Popup Notification */}
      <PopupNotification visible={isPopupVisible} message={popupMessage} />

      {/* Global Loading Indicator (Optional) */}
      {isLoading && (
          <View style={styles.globalLoadingOverlay}>
              <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
      )}
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
    padding: 5, // Add padding for easier tap
    width: 40, // Ensure enough tap area
    alignItems: 'center', 
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
    width: 40,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: 'white', // Add background
  },
  tab: {
    flex: 1,
    padding: 15,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 3,
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
    backgroundColor: '#f5f5f5', // Match container background
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
  errorText: { // Re-used style
    color: 'red',
    padding: 10,
    textAlign: 'center',
    backgroundColor: '#ffebee', // Light red background for errors
    marginHorizontal: 10,
    marginTop: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ffcdd2',
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
    padding: 8, // Reduced padding
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    marginBottom: 8, // Reduced margin
    backgroundColor: 'white',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  summaryCardTitle: {
    fontSize: 12, // Reduce font size
    color: '#666',
    marginBottom: 2, // Reduce margin
  },
  summaryCardValue: {
    fontWeight: 'bold',
    fontSize: 14, // Reduce font size
  },
  summaryCardSubtitle: {
    fontSize: 10, // Reduce font size
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
    padding: 10,
    marginVertical: 6,
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
    flex: 1, // Allow ticker to take space
    marginRight: 8,
  },
  stockCardTicker: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
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
    height: 4,
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
    marginTop: 10, // Add top margin
    marginBottom: 2,
    borderRadius: 8,
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
    overflow: 'hidden', // Ensure text stays within bounds
  },
  summaryPnLBarContainer: {
    marginTop: 10,
    backgroundColor: '#f0f0f0',
    height: 6,
    borderRadius: 3,
    width: '100%',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '80%',
    maxWidth: 500,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  modalMessage: {
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    marginLeft: 10,
    padding: 10,
    borderRadius: 5,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#e0e0e0',
  },
  confirmButton: {
    backgroundColor: '#0066cc',
  },
  popupContainer: {
    position: 'absolute',
    top: 50,
    left: '10%',
    right: '10%',
    backgroundColor: '#0066cc',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 5,
  },
  popupText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  searchSortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8, // Reduced vertical padding
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInputWrapper: {
    flex: 1, // Make the search input take more space
    marginRight: 10, // Add some space between search and sort
    position: 'relative', // Needed for clear button positioning
  },
  searchInput: {
    height: 40, // Increase height for better visibility
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingRight: 30, // Space for clear button
    backgroundColor: 'white',
  },
  sortByContainer: {
    minWidth: 120, // Ensure enough width
    height: 40, // Match search input height
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: 'white',
    justifyContent: 'center', // Center picker vertically
  },
  picker: {
    height: 50,
    width: '100%',
    borderWidth: 0, // Remove border
    backgroundColor: 'white', // Optional: Set background color
  },
  globalLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000, // Ensure it's above other elements
  },
  lastRefreshedContainer: {
    paddingHorizontal: 15,
    paddingBottom: 8,
    paddingTop: 0,
    alignItems: 'center',
    
  },
  lastRefreshedText: {
    fontSize: 10,
    color: '#666', // <-- Lighter grey color
    fontStyle: 'italic',
  },
});

// Helper function to get stock by ticker and account
const getStockByTickerAndAccount = async (ticker, account) => {
  // Implement the logic to fetch the stock from the database
  // This could be a call to your stocksService to get the stock by ticker and account
  return await fetchStockByTickerAndAccount(supabaseClient, ticker, account);
};
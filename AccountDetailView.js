// AccountDetailView.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const AccountDetailView = ({ accountData, onClose, onTransactionPress }) => {
  if (!accountData) return null;

  const totalValue = accountData.stocks?.reduce((sum, stock) => sum + (stock.market_value || 0), 0) || 0;
  const totalCost = accountData.stocks?.reduce((sum, stock) => sum + (stock.total_cost_basis_value || 0), 0) || 0;
  const totalPnL = totalValue - totalCost;
  const totalPnLPercentage = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
  const isProfitable = totalPnL >= 0;

  // Modern, dashboard-style card for account detail
  return (
    <View style={styles.dashboardAccountContainer}>
      <View style={styles.dashboardAccountHeader}>
        <Text style={styles.dashboardAccountTitle}>{accountData.account_name}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.dashboardAccountContent}>
        <View style={styles.dashboardAccountSummaryCard}>
          <View style={styles.dashboardAccountSummaryRow}>
            <View style={styles.dashboardAccountSummaryItem}>
              <Text style={styles.dashboardAccountSummaryLabel}>Total Value</Text>
              <Text style={styles.dashboardAccountSummaryValue}>${formatNumber(Math.round(totalValue))}</Text>
            </View>
            <View style={styles.dashboardAccountSummaryItem}>
              <Text style={styles.dashboardAccountSummaryLabel}>Total Cost</Text>
              <Text style={styles.dashboardAccountSummaryValue}>${formatNumber(Math.round(totalCost))}</Text>
            </View>
          </View>
          <View style={styles.dashboardAccountPnLRow}>
            <Text style={styles.dashboardAccountPnLLabel}>Total P&L</Text>
            <Text style={[styles.dashboardAccountPnLValue, isProfitable ? styles.profit : styles.loss]}>
              {isProfitable ? '+' : '-'}${formatNumber(Math.abs(Math.round(totalPnL)))} ({isProfitable ? '+' : '-'}{Math.abs(totalPnLPercentage).toFixed(2)}%)
            </Text>
          </View>
          <View style={styles.dashboardAccountPnLBarContainer}>
            <View style={[styles.dashboardAccountPnLBar, {width: `${Math.min(Math.abs(totalPnLPercentage), 100)}%`}, isProfitable ? styles.profitBar : styles.lossBar]}></View>
          </View>
        </View>
        {/* Holdings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Holdings</Text>
          {accountData.stocks?.map((stock, index) => {
            const stockIsProfitable = stock.pnl_dollar >= 0;
            const stockPnlPercentage = stock.pnl_percent || 0;
            return (
              <TouchableOpacity
                key={`${stock.ticker}-${index}`}
                style={styles.dashboardStockCard}
                onPress={() => onTransactionPress(stock)}
                activeOpacity={0.7}
              >
                <View style={styles.stockHeader}>
                  <View style={styles.stockTitleContainer}>
                    <Text style={styles.stockTicker}>{stock.ticker}</Text>
                    <Text style={styles.stockName} numberOfLines={1}>{stock.company_name}</Text>
                  </View>
                  <View style={styles.stockValueContainer}>
                    <Text style={styles.stockValue}>${formatNumber(Math.round(stock.market_value))}</Text>
                    <Text style={styles.stockQuantity}>{formatNumber(stock.total_quantity)} shares</Text>
                  </View>
                </View>
                <View style={styles.stockDetails}>
                  <View style={styles.detailRow}>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Avg. Cost</Text>
                      <Text style={styles.detailValue}>${formatNumber(stock.average_cost_basis)}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Current Price</Text>
                      <Text style={styles.detailValue}>${formatNumber(stock.current_price)}</Text>
                    </View>
                  </View>
                  <View style={styles.pnlContainer}>
                    <Text style={styles.pnlLabel}>P&L</Text>
                    <View style={styles.pnlValueContainer}>
                      <Text style={[styles.pnlValue, stockIsProfitable ? styles.profit : styles.loss]}>
                        {stockIsProfitable ? '+' : '-'}${formatNumber(Math.abs(Math.round(stock.pnl_dollar)))}
                      </Text>
                      <Text style={[styles.pnlPercentage, stockIsProfitable ? styles.profit : styles.loss]}>
                        ({stockIsProfitable ? '+' : '-'}{Math.abs(stockPnlPercentage).toFixed(2)}%)
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  dashboardAccountContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  dashboardAccountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    backgroundColor: 'linear-gradient(90deg, #22d3ee 0%, #8b5cf6 60%, #ec4899 100%)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  dashboardAccountTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  dashboardAccountContent: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  dashboardAccountSummaryCard: {
    backgroundColor: 'white',
    borderRadius: 18,
    margin: 16,
    marginBottom: 8,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ece9f7',
    padding: 18,
  },
  dashboardAccountSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  dashboardAccountSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  dashboardAccountSummaryLabel: {
    fontSize: 15,
    color: '#6C7A91',
    marginBottom: 4,
  },
  dashboardAccountSummaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A2E4C',
  },
  dashboardAccountPnLRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dashboardAccountPnLLabel: {
    fontSize: 15,
    color: '#6C7A91',
  },
  dashboardAccountPnLValue: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  dashboardAccountPnLBarContainer: {
    height: 6,
    backgroundColor: '#ece9f7',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 6,
  },
  dashboardAccountPnLBar: {
    height: '100%',
    borderRadius: 3,
  },
  dashboardStockCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
    borderLeftWidth: 5,
    borderLeftColor: '#8b5cf6',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#1565C0',
    fontWeight: '500',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  stockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  stockTitleContainer: {
    flex: 1,
    marginRight: 16,
  },
  stockTicker: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  stockName: {
    fontSize: 14,
    color: '#666',
  },
  stockValueContainer: {
    alignItems: 'flex-end',
  },
  stockValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  stockQuantity: {
    fontSize: 14,
    color: '#666',
  },
  stockDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  profit: {
    color: '#4CAF50',
  },
  loss: {
    color: '#D32F2F',
  },
});

export default AccountDetailView;
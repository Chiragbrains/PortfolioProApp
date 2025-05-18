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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{accountData.account_name}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Value</Text>
              <Text style={styles.summaryValue}>${formatNumber(Math.round(totalValue))}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Cost</Text>
              <Text style={styles.summaryValue}>${formatNumber(Math.round(totalCost))}</Text>
            </View>
          </View>

          <View style={styles.pnlContainer}>
            <Text style={styles.pnlLabel}>Total P&L</Text>
            <View style={styles.pnlValueContainer}>
              <Text style={[styles.pnlValue, isProfitable ? styles.profit : styles.loss]}>
                {isProfitable ? '+' : '-'}${formatNumber(Math.abs(Math.round(totalPnL)))}
              </Text>
              <Text style={[styles.pnlPercentage, isProfitable ? styles.profit : styles.loss]}>
                ({isProfitable ? '+' : '-'}{Math.abs(totalPnLPercentage).toFixed(2)}%)
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Holdings</Text>
          {accountData.stocks?.map((stock, index) => {
            const stockIsProfitable = stock.pnl_dollar >= 0;
            const stockPnlPercentage = stock.pnl_percent || 0;

            return (
              <TouchableOpacity
                key={`${stock.ticker}-${index}`}
                style={styles.stockCard}
                onPress={() => onTransactionPress(stock)}
                activeOpacity={0.7}
              >
                <View style={styles.stockHeader}>
                  <View style={styles.stockTitleContainer}>
                    <Text style={styles.stockTicker}>{stock.ticker}</Text>
                    <Text style={styles.stockName} numberOfLines={1}>
                      {stock.company_name}
                    </Text>
                  </View>
                  <View style={styles.stockValueContainer}>
                    <Text style={styles.stockValue}>
                      ${formatNumber(Math.round(stock.market_value))}
                    </Text>
                    <Text style={styles.stockQuantity}>
                      {formatNumber(stock.total_quantity)} shares
                    </Text>
                  </View>
                </View>

                <View style={styles.stockDetails}>
                  <View style={styles.detailRow}>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Avg. Cost</Text>
                      <Text style={styles.detailValue}>
                        ${formatNumber(stock.average_cost_basis)}
                      </Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Current Price</Text>
                      <Text style={styles.detailValue}>
                        ${formatNumber(stock.current_price)}
                      </Text>
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
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#1565C0',
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: 'white',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  pnlContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 16,
  },
  pnlLabel: {
    fontSize: 14,
    color: '#666',
  },
  pnlValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pnlValue: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 4,
  },
  pnlPercentage: {
    fontSize: 14,
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
  stockCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
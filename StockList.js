// StockList.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const StockList = ({ stocks, onStockPress }) => {
  if (!stocks || stocks.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No stocks in portfolio</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {stocks.map((stock, index) => {
        const isProfitable = stock.pnl_dollar >= 0;
        const pnlPercentage = stock.pnl_percent || 0;

        return (
          <TouchableOpacity
            key={`${stock.ticker}-${index}`}
            style={styles.stockCard}
            onPress={() => onStockPress(stock)}
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
                  <Text style={[styles.pnlValue, isProfitable ? styles.profit : styles.loss]}>
                    {isProfitable ? '+' : '-'}${formatNumber(Math.abs(Math.round(stock.pnl_dollar)))}
                  </Text>
                  <Text style={[styles.pnlPercentage, isProfitable ? styles.profit : styles.loss]}>
                    ({isProfitable ? '+' : '-'}{Math.abs(pnlPercentage).toFixed(2)}%)
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  stockCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
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
  pnlContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  profit: {
    color: '#4CAF50',
  },
  loss: {
    color: '#D32F2F',
  },
});

export default StockList; 
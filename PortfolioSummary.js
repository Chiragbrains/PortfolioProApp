// PortfolioSummary.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const PortfolioSummary = ({ summaryData }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);

  if (!summaryData || summaryData.length === 0) return null;

  const totalValue = summaryData.reduce((sum, stock) => sum + (stock.market_value || 0), 0);
  const totalCost = summaryData.reduce((sum, stock) => sum + (stock.total_cost_basis_value || 0), 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPercentage = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
  const isProfitable = totalPnL >= 0;

  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

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
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  modernSummaryContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modernSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  modernSummaryHeaderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  collapseIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  collapseIcon: {
    fontSize: 12,
    color: '#666',
    transform: [{ rotate: '0deg' }],
  },
  collapseIconRotated: {
    transform: [{ rotate: '180deg' }],
  },
  modernSummaryContent: {
    padding: 16,
    paddingTop: 0,
  },
  summaryMainCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
  },
  summaryMainValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryMainValueItem: {
    flex: 1,
  },
  summaryMainLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  summaryMainValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  summaryPnLContainer: {
    marginTop: 8,
  },
  summaryPnLRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryPnLLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryPnLValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  profit: {
    color: '#4CAF50',
  },
  loss: {
    color: '#D32F2F',
  },
  summaryPnLBarContainer: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  summaryPnLBar: {
    height: '100%',
    borderRadius: 2,
  },
  profitBar: {
    backgroundColor: '#4CAF50',
  },
  lossBar: {
    backgroundColor: '#D32F2F',
  },
});

export default PortfolioSummary; 
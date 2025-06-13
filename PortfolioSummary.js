// PortfolioSummary.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons'; // If using Expo, for hamburger icon

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const PortfolioSummary = ({ summaryData, onMenuPress }) => {
  // Set collapsed by default
  const [isCollapsed, setIsCollapsed] = useState(true);
  // Set privacy ON by default (values hidden)
  const [isValueVisible, setIsValueVisible] = useState(false);
  if (!summaryData || summaryData.length === 0) return null;
  const totalValue = summaryData.reduce((sum, stock) => sum + (stock.market_value || 0), 0);
  const totalCost = summaryData.reduce((sum, stock) => sum + (stock.total_cost_basis_value || 0), 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPercentage = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
  const isProfitable = totalPnL >= 0;

  // Asset breakdown
  const cash = summaryData.filter(s => s.type === 'cash').reduce((sum, s) => sum + (s.market_value || 0), 0);
  const stocks = summaryData.filter(s => s.type === 'stock').reduce((sum, s) => sum + (s.market_value || 0), 0);
  const etfs = summaryData.filter(s => s.type === 'etf').reduce((sum, s) => sum + (s.market_value || 0), 0);
  const total = totalValue || 1;
  const breakdown = [
    { label: 'Stocks', value: stocks, color: '#10b981' },
    { label: 'ETFs', value: etfs, color: '#8b5cf6' },
    { label: 'Cash', value: cash, color: '#06b6d4' },
  ].filter(b => b.value > 0);

  // Use lock icon for hidden state, unlock for visible
  const lockIcon = '🔒';
  const unlockIcon = '🔓';

  return (
    <LinearGradient
      colors={['#5B3EBC', '#3B0764', '#1A1A2E']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.summaryCard}
    >
      {/* Hamburger menu icon at top left, no background */}
      <TouchableOpacity style={styles.menuIconTouchable} onPress={onMenuPress} hitSlop={{top: 10, left: 10, right: 10, bottom: 10}}>
        <Ionicons name="menu" size={28} color="#fff" />
      </TouchableOpacity>
      {/* The summaryHeaderTouchable now needs to be aware of the menu icon's space */}
      <TouchableOpacity style={styles.summaryHeaderTouchable} onPress={() => setIsCollapsed(!isCollapsed)} activeOpacity={0.8}>
        {/* This View will contain the label and the right-aligned items */}
        <View style={styles.headerContentWrapper}> 
          <Text style={styles.summaryLabel}>Portfolio Summary</Text>
          {/* Group for right-aligned items */}
          <View style={styles.headerRightItemsGroup}>
            <TouchableOpacity style={styles.visibilityButton} onPress={() => setIsValueVisible(v => !v)}>
              <Text style={styles.visibilityIcon}>{isValueVisible ? unlockIcon : lockIcon}</Text>
            </TouchableOpacity>
            <Text 
              style={styles.summaryValue}
              adjustsFontSizeToFit={true} 
              numberOfLines={1}           
              minimumFontScale={0.7} 
            >
              {isValueVisible ? `$${formatNumber(Math.round(totalValue))}` : '••••••'}
            </Text>
            <Text style={styles.summaryCollapseIcon}>{isCollapsed ? '▼' : '▲'}</Text>
          </View>
        </View> 
      </TouchableOpacity>
      {!isCollapsed && (
        <View style={styles.summaryContentContainer}>
          <View style={styles.summaryPnlContainer}>
            <Text style={styles.summaryPnlText}>Total P&L</Text>
            <Text style={[styles.summaryPnlPercent, isProfitable ? styles.profit : styles.loss]}>
              {isProfitable ? '+' : '-'}${formatNumber(Math.abs(Math.round(totalPnL)))} ({isProfitable ? '+' : '-'}{Math.abs(totalPnLPercentage).toFixed(2)}%)
            </Text>
          </View>
          <View style={styles.summarySeparator} />
          <View style={styles.summaryBreakdownContainer}>
            {breakdown.map(b => (
              <View key={b.label}>
                <Text style={[styles.modernCardBreakdownLabel, {color: b.color}]}>{b.label}</Text>
                <Text style={[styles.modernCardBreakdownValue, {color: b.color}]}>${formatNumber(Math.round(b.value))} ({((b.value/total)*100).toFixed(1)}%)</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  summaryCard: {
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    width: 'auto',
    alignSelf: 'stretch',
    minWidth: 0,
    maxWidth: '100%',
    minHeight: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
    justifyContent: 'center',
    position: 'relative',
  },
  menuIconTouchable: {
    position: 'absolute',
    top: 12,
    left: 6,
    zIndex: 10,
    backgroundColor: 'transparent',
    padding: 2,
  },
  summaryHeaderTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingLeft: 32,
    flex: 1,
  },
  headerContentWrapper: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRightItemsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'left',
    letterSpacing: 0.5,
    marginRight: 6,
  },
  summaryValue: {
    fontSize: 16,
    textAlign: 'right',
    flex: 1,
    fontWeight: '700',
    color: '#fff',
    marginRight: 6,
  },
  summaryCollapseIcon: {
    fontSize: 14,
    color: '#B6C2DF',
  },
  summaryContentContainer: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: 0,
  },
  summaryPnlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  summaryPnlText: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
    color: '#fff',
  },
  summaryPnlPercent: {
    fontSize: 11,
    fontWeight: '500',
    color: '#B6C2DF',
  },
  summarySeparator: {
    height: 1,
    backgroundColor: '#27395A',
    marginVertical: 6,
  },
  summaryBreakdownContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  summaryStatItem: {
    alignItems: 'center',
    minWidth: 50,
    marginBottom: 0,
    paddingHorizontal: 2,
  },
  summaryStatValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 1,
  },
  summaryStatLabel: {
    fontSize: 9,
    color: '#B6C2DF',
    textAlign: 'center',
  },
  visibilityButton: {
    padding: 3,
    marginRight: 4,
  },
  visibilityIcon: {
    fontSize: 14,
    color: '#B6C2DF',
  },
});

export default PortfolioSummary;
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const DashboardSummary = ({ summaryData, isCollapsed, onToggleCollapse, isValueVisible, onToggleVisibility }) => {
    if (!summaryData || summaryData.length === 0) return null;

    const totalValue = summaryData.reduce((sum, stock) => sum + (stock.market_value || 0), 0);
    const totalCost = summaryData.reduce((sum, stock) => sum + (stock.total_cost_basis_value || 0), 0);
    const totalPnL = totalValue - totalCost;
    const totalPnLPercentage = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
    const isProfitable = totalPnL >= 0;

    const hiddenValuePlaceholder = '$*****';
    const hiddenPnlPlaceholder = '*****';

    const activeHoldings = summaryData.filter(s => s.total_quantity && s.total_quantity > 0);
    const uniqueAssetsCount = activeHoldings.filter(s => s.type !== 'cash').length;
    const cashValue = activeHoldings.find(s => s.ticker === 'CASH')?.market_value || 0;
    const cashPercentage = totalValue > 0 ? (cashValue / totalValue) * 100 : 0;
    const stockValue = activeHoldings.filter(s => s.type === 'stock').reduce((sum, s) => sum + (s.market_value || 0), 0);
    const stockPercentage = totalValue > 0 ? (stockValue / totalValue) * 100 : 0;
    const etfValue = activeHoldings.filter(s => s.type === 'etf').reduce((sum, s) => sum + (s.market_value || 0), 0);
    const etfPercentage = totalValue > 0 ? (etfValue / totalValue) * 100 : 0;

    return (
        <View style={styles.summaryCard}>
            <TouchableOpacity onPress={onToggleCollapse} activeOpacity={0.7} style={styles.summaryHeaderTouchable}>
                <Text style={styles.summaryLabel}>Portfolio Value</Text>
                <View style={styles.summaryHeaderRight}>
                    <Text style={styles.summaryValue}>
                        {isValueVisible ? `$${formatNumber(Math.round(totalValue))}` : hiddenValuePlaceholder}
                    </Text>
                    <TouchableOpacity onPress={onToggleVisibility} style={styles.visibilityButton}>
                        <Text style={styles.visibilityIcon}>{isValueVisible ? '👁️' : '🔒'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.summaryCollapseIcon}>{isCollapsed ? '▼' : '▲'}</Text>
                </View>
            </TouchableOpacity>

            {!isCollapsed && (
                <View style={styles.summaryContentContainer}>
                    <View style={styles.summaryPnlContainer}>
                        <Text style={[styles.summaryPnlText, isProfitable ? styles.profitText : styles.lossText]}>
                            {isProfitable ? '▲' : '▼'} ${formatNumber(Math.abs(Math.round(totalPnL)))}
                        </Text>
                        <Text style={[styles.summaryPnlPercent, isProfitable ? styles.profitText : styles.lossText]}>
                            ({isProfitable ? '+' : ''}{totalPnLPercentage.toFixed(2)}%)
                        </Text>
                    </View>

                    <View style={styles.summarySeparator} />
                    <View style={styles.summaryBreakdownContainer}>
                        <View style={styles.summaryStatItem}>
                            <Text style={styles.summaryStatValue}>{uniqueAssetsCount}</Text>
                            <Text style={styles.summaryStatLabel}>Assets</Text>
                        </View>
                        {stockValue > 0 && (
                            <View style={styles.summaryStatItem}>
                                <Text style={styles.summaryStatValue}>${formatNumber(Math.round(stockValue))}</Text>
                                <Text style={styles.summaryStatLabel}>Stocks ({stockPercentage.toFixed(1)}%)</Text>
                            </View>
                        )}
                        {etfValue > 0 && (
                            <View style={styles.summaryStatItem}>
                                <Text style={styles.summaryStatValue}>${formatNumber(Math.round(etfValue))}</Text>
                                <Text style={styles.summaryStatLabel}>ETFs ({etfPercentage.toFixed(1)}%)</Text>
                            </View>
                        )}
                        {cashValue > 0 && (
                            <View style={styles.summaryStatItem}>
                                <Text style={styles.summaryStatValue}>${formatNumber(Math.round(cashValue))}</Text>
                                <Text style={styles.summaryStatLabel}>Cash ({cashPercentage.toFixed(1)}%)</Text>
                            </View>
                        )}
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    summaryCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 16,
        marginVertical: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    summaryHeaderTouchable: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    summaryLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    summaryHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    summaryValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#333',
        marginRight: 8,
    },
    visibilityButton: {
        padding: 4,
    },
    visibilityIcon: {
        fontSize: 16,
    },
    summaryCollapseIcon: {
        fontSize: 16,
        color: '#666',
        marginLeft: 8,
    },
    summaryContentContainer: {
        marginTop: 12,
    },
    summaryPnlContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    summaryPnlText: {
        fontSize: 18,
        fontWeight: '600',
        marginRight: 4,
    },
    summaryPnlPercent: {
        fontSize: 16,
        fontWeight: '500',
    },
    profitText: {
        color: '#34C759',
    },
    lossText: {
        color: '#FF3B30',
    },
    summarySeparator: {
        height: 1,
        backgroundColor: '#E5E5EA',
        marginVertical: 12,
    },
    summaryBreakdownContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    summaryStatItem: {
        width: '48%',
        marginBottom: 12,
    },
    summaryStatValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    summaryStatLabel: {
        fontSize: 14,
        color: '#666',
        marginTop: 2,
    },
});

export default DashboardSummary; 
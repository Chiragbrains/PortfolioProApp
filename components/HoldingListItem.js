import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const HoldingListItem = ({ item, onPress }) => {
    const isProfitable = (item.pnl_dollar || 0) >= 0;
    const displayType = item.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1).toLowerCase() : 'N/A';
    const currentPrice = item.current_price ?? 0;
    const marketValue = item.market_value || 0;

    return (
        <TouchableOpacity style={styles.holdingCard} onPress={onPress}>
            <View style={styles.holdingRow}>
                <View style={styles.holdingInfoContainer}>
                    <View style={styles.holdingTickerContainer}>
                        <Text style={styles.holdingTicker}>{item.ticker}</Text>
                        {item.type && item.type !== 'stock' && <Text style={styles.holdingType}>{displayType}</Text>}
                    </View>
                    {item.company_name && (
                        <Text style={styles.holdingCompanyName} numberOfLines={1} ellipsizeMode="tail">
                            {item.company_name}
                        </Text>
                    )}
                </View>

                <View style={styles.holdingPriceValueContainer}>
                    <Text style={styles.holdingCurrentPrice}>
                        ${currentPrice.toFixed(2)}
                    </Text>
                    <Text style={styles.holdingValueSubText}>
                         ${formatNumber(Math.round(marketValue))}
                    </Text>
                </View>
            </View>

            <View style={[styles.holdingRow, { marginTop: 10 }]}>
                <Text style={styles.holdingShares}>
                    {formatNumber(Math.round(item.total_quantity || 0))} Shares @ ${(item.average_cost_basis ?? 0).toFixed(2)} avg
                </Text>
                <Text style={[styles.holdingPnl, isProfitable ? styles.profitText : styles.lossText]}>
                    {isProfitable ? '+' : '-'}${formatNumber(Math.abs(item.pnl_dollar || 0).toFixed(0))} ({(item.pnl_percent ?? 0).toFixed(1)}%)
                </Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    holdingCard: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 12,
        marginHorizontal: 12,
        marginVertical: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 2,
    },
    holdingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    holdingInfoContainer: {
        flex: 1,
        marginRight: 8,
    },
    holdingTickerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    holdingTicker: {
        fontSize: 15,
        fontWeight: '600',
        color: '#333',
    },
    holdingType: {
        fontSize: 10,
        color: '#666',
        backgroundColor: '#F2F2F7',
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 3,
        marginLeft: 6,
    },
    holdingCompanyName: {
        fontSize: 12,
        color: '#666',
        marginTop: 1,
    },
    holdingPriceValueContainer: {
        alignItems: 'flex-end',
    },
    holdingCurrentPrice: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    holdingValueSubText: {
        fontSize: 12,
        color: '#666',
        marginTop: 1,
    },
    holdingShares: {
        fontSize: 12,
        color: '#666',
    },
    holdingPnl: {
        fontSize: 12,
        fontWeight: '500',
    },
    profitText: {
        color: '#34C759',
    },
    lossText: {
        color: '#FF3B30',
    },
});

export default HoldingListItem; 
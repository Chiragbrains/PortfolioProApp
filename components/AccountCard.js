import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const AccountCard = ({ accountName, accountData, isExpanded, onExpand, onTransactionPress, summaryData }) => {
    const { transactions, totalValue, totalCost, pnl, pnlPercentage } = accountData;
    const pnlColor = pnl >= 0 ? '#28A745' : '#DC3545';
    const pnlPrefix = pnl >= 0 ? '+' : '';
    const pnlPercentPrefix = pnlPercentage >= 0 ? '+' : '';

    return (
        <View style={styles.accountCard}>
            <TouchableOpacity style={styles.accountHeader} onPress={onExpand}>
                <View style={styles.accountHeaderLeft}>
                    <Text style={styles.accountName}>{accountName}</Text>
                    <Text style={styles.accountSubText}>{transactions.length} transactions</Text>
                </View>
                <View style={styles.accountHeaderMiddle}>
                    <Text style={styles.accountValue}>${totalValue.toFixed(2)}</Text>
                    <Text style={[styles.accountPnl, { color: pnlColor }]}>
                        {pnlPrefix}${pnl.toFixed(2)} ({pnlPercentPrefix}{pnlPercentage.toFixed(2)}%)
                    </Text>
                </View>
                <View style={styles.accountHeaderRight}>
                    <Text style={styles.accountExpandIcon}>{isExpanded ? '▼' : '▶'}</Text>
                </View>
            </TouchableOpacity>
            {isExpanded && (
                <View style={styles.accountDetailsContent}>
                    {transactions.map((tx, index) => {
                        const currentPrice = summaryData.find(s => s.ticker === tx.ticker)?.current_price ?? (tx.ticker === 'CASH' ? 1 : 0);
                        const quantity = tx.quantity ?? 0;
                        const costBasis = tx.cost_basis ?? 0;
                        const currentValue = currentPrice * quantity;
                        const costValue = costBasis * quantity;
                        const txPnl = currentValue - costValue;
                        const txPnlColor = txPnl >= 0 ? '#28A745' : '#DC3545';
                        const txPnlPrefix = txPnl >= 0 ? '+' : '';
                        return (
                            <TouchableOpacity key={index} style={styles.transactionRow} onPress={() => onTransactionPress(tx)}>
                                <View style={styles.transactionLeft}>
                                    <Text style={styles.transactionTicker}>{tx.ticker}</Text>
                                    {tx.type && <Text style={styles.transactionType}>{tx.type}</Text>}
                                </View>
                                <View style={styles.transactionRight}>
                                    <Text style={styles.transactionQtyCost}>{quantity} @ ${costBasis.toFixed(2)}</Text>
                                    <Text style={styles.transactionCurrentPrice}>${currentPrice.toFixed(2)}</Text>
                                    <Text style={[styles.transactionPnl, { color: txPnlColor }]}>
                                        {txPnlPrefix}${txPnl.toFixed(2)}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    accountCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        marginHorizontal: 12,
        marginBottom: 8,
        shadowColor: '#9DAABF',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 2,
        overflow: 'hidden',
    },
    accountHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#FAFBFC',
    },
    accountHeaderLeft: {
        flex: 1,
        marginRight: 20,
    },
    accountHeaderMiddle: {
        width: 160,
    },
    accountHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    accountName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1A2E4C',
    },
    accountSubText: {
        fontSize: 11,
        color: '#6C7A91',
        marginTop: 1,
    },
    accountValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1A2E4C',
    },
    accountPnl: {
        fontSize: 11,
        fontWeight: '500',
        marginTop: 1,
    },
    accountExpandIcon: {
        fontSize: 14,
        color: '#6C7A91',
        marginLeft: 8,
    },
    accountDetailsContent: {
        paddingHorizontal: 12,
        paddingBottom: 8,
        borderTopWidth: 1,
        borderTopColor: '#E0E7F1',
    },
    transactionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F4F7FC',
    },
    transactionLeft: {
        flexDirection: 'row',
        flex: 1,
        alignItems: 'center',
        marginRight: 6,
    },
    transactionTicker: {
        fontSize: 13,
        fontWeight: '500',
        color: '#1A2E4C',
    },
    transactionType: {
        fontSize: 9,
        color: '#0066cc',
        backgroundColor: '#E7F5FF',
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
        marginLeft: 4,
        fontWeight: '500',
        overflow: 'hidden',
    },
    transactionRight: {
        alignItems: 'flex-end',
        flexShrink: 0,
    },
    transactionQtyCost: {
        fontSize: 12,
        color: '#6C7A91',
        marginLeft: 6,
    },
    transactionCurrentPrice: {
        fontSize: 13,
        fontWeight: '500',
        color: '#1A2E4C',
        marginBottom: 1,
    },
    transactionPnl: {
        fontSize: 11,
        fontWeight: '500',
    },
    transactionValue: {
        fontSize: 13,
        fontWeight: '500',
        color: '#1A2E4C',
    },
});

export default AccountCard; 
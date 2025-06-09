import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

const Header = ({ onMenuPress }) => (
    <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={onMenuPress}>
            <Text style={styles.headerIcon}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Portfolio Pro</Text>
        <View style={styles.headerButton} /> {/* Placeholder */}
    </View>
);

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingTop: Platform.OS === 'ios' ? 10 : 15,
        paddingBottom: 10,
        backgroundColor: '#1A2E4C',
    },
    headerButton: {
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerIcon: {
        color: '#FFFFFF',
        fontSize: 24,
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
    },
});

export default Header; 
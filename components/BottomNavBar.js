import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { PieChart, Users, BarChart3 } from 'lucide-react';

const BottomNavBar = ({ activeTab, setActiveTab }) => (
    <View style={styles.navBar}>
        <TouchableOpacity
            style={styles.navItem}
            onPress={() => setActiveTab('portfolio')}
        >
            <PieChart size={28} strokeWidth={3.2} color={activeTab === 'portfolio' ? '#0066cc' : '#8A94A6'} />
            <Text style={[styles.navLabel, activeTab === 'portfolio' && styles.navLabelActive]}>Portfolio</Text>
        </TouchableOpacity>
        <TouchableOpacity
            style={styles.navItem}
            onPress={() => setActiveTab('accountDetail')}
        >
            <Users size={28} strokeWidth={3.2} color={activeTab === 'accountDetail' ? '#0066cc' : '#8A94A6'} />
            <Text style={[styles.navLabel, activeTab === 'accountDetail' && styles.navLabelActive]}>Accounts</Text>
        </TouchableOpacity>
        <TouchableOpacity
            style={styles.navItem}
            onPress={() => setActiveTab('dashboard')}
        >
            <BarChart3 size={28} strokeWidth={3.2} color={activeTab === 'dashboard' ? '#0066cc' : '#8A94A6'} />
            <Text style={[styles.navLabel, activeTab === 'dashboard' && styles.navLabelActive]}>Dashboard</Text>
        </TouchableOpacity>
    </View>
);

const styles = StyleSheet.create({
    navBar: {
        flexDirection: 'row',
        height: 65,
        borderTopWidth: 1,
        borderTopColor: '#E0E7F1',
        backgroundColor: '#FFFFFF',
        paddingBottom: Platform.OS === 'ios' ? 10 : 0,
    },
    navItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 8,
    },
    navLabel: {
        fontSize: 10,
        color: '#8A94A6',
        marginTop: 2,
    },
    navLabelActive: {
        color: '#0066cc',
        fontWeight: '600',
    },
});

export default BottomNavBar; 
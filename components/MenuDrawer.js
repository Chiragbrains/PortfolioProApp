import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const MenuDrawer = ({ visible, onClose, onImportPress, onClearDataPress, onDisconnectPress }) => {
    if (!visible) return null;
    return (
        <View style={styles.menuOverlay}>
            <TouchableOpacity style={styles.menuOverlayBackground} onPress={onClose} />
            <View style={styles.menuDrawer}>
                <View style={styles.menuHeader}>
                    <Text style={styles.menuHeaderText}>Menu</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Text style={styles.menuCloseButton}>✕</Text>
                    </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.menuItem} onPress={onImportPress}>
                    <Text style={styles.menuItemText}>Import Data</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={onClearDataPress}>
                    <Text style={styles.menuItemText}>Clear All Data</Text>
                </TouchableOpacity>
                <View style={styles.menuSeparator} />
                <TouchableOpacity style={styles.menuItem} onPress={onDisconnectPress}>
                    <Text style={[styles.menuItemText, styles.disconnectText]}>Disconnect</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    menuOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
    },
    menuOverlayBackground: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    menuDrawer: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 280,
        height: '100%',
        backgroundColor: 'white',
        padding: 0,
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 10,
    },
    menuHeader: {
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1A2E4C',
    },
    menuHeaderText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
    },
    menuCloseButton: {
        fontSize: 24,
        color: 'white',
        padding: 5,
    },
    menuItem: {
        paddingVertical: 18,
        paddingHorizontal: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    menuItemText: {
        fontSize: 18,
        color: '#333',
    },
    menuSeparator: {
        height: 10,
        backgroundColor: '#f5f5f5',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#e0e0e0',
    },
    disconnectText: {
        color: '#DC3545',
    },
});

export default MenuDrawer; 
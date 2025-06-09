import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

const PopupNotification = ({ visible, message }) => {
    if (!visible) return null;
    return (
        <View style={styles.popupContainer}>
            <Text style={styles.popupText}>{message}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    popupContainer: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 30,
        left: '10%',
        right: '10%',
        backgroundColor: 'rgba(0, 102, 204, 0.9)',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
    },
    popupText: {
        color: 'white',
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
    },
});

export default PopupNotification; 
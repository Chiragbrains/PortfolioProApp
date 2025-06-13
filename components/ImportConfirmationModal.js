import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const ImportConfirmationModal = ({ visible, data, onCancel, onConfirm }) => {
    if (!visible) return null;
    return (
        <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
                <Text style={styles.modalTitle}>Confirm Import</Text>
                <Text style={styles.modalMessage}>
                    {data ? `Import ${data.length} transactions?` : 'No data to import.'}
                </Text>
                <View style={styles.modalButtons}>
                    <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={onCancel}>
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={onConfirm}>
                        <Text style={styles.confirmButtonText}>Import</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 25,
        width: '90%',
        maxWidth: 400,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    modalTitle: {
        fontSize: 19,
        fontWeight: '600',
        marginBottom: 18,
        textAlign: 'center',
        color: '#1A2E4C',
    },
    modalMessage: {
        marginBottom: 30,
        fontSize: 15,
        lineHeight: 23,
        textAlign: 'center',
        color: '#495057',
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    modalButton: {
        marginLeft: 12,
        paddingVertical: 11,
        paddingHorizontal: 18,
        borderRadius: 8,
        minWidth: 90,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: '#6C7A91',
    },
    cancelButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 15,
    },
    confirmButton: {
        backgroundColor: '#0066cc',
    },
    confirmButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 15,
    },
});

export default ImportConfirmationModal; 
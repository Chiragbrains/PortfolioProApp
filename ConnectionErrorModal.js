// ConnectionErrorModal.js (or add within App.js)
import React from 'react';
import { Modal, StyleSheet, Text, View, TouchableOpacity } from 'react-native';

const ConnectionErrorModal = ({ visible, message, onOkPress }) => {
  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Connection Error</Text>
        <Text style={styles.modalMessage}>
          {message || 'Failed to connect to Supabase. Please verify your URL and Key.'}
        </Text>
        <View style={styles.modalButtonContainer}>
          {/* Only show OK button */}
          <TouchableOpacity
            style={[styles.modalButton, styles.confirmButton]} // Use confirm button style or a neutral one
            onPress={onOkPress} // Call the handler passed via props
          >
            <Text style={styles.confirmButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// Add styles similar to your other modals
const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 20,
  },
  modalContainer: {
    backgroundColor: 'white', borderRadius: 8, padding: 20,
    width: '90%', maxWidth: 400, elevation: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '600', marginBottom: 15,
    textAlign: 'center', color: '#343a40',
  },
  modalMessage: {
    marginBottom: 25, fontSize: 15, lineHeight: 22,
    textAlign: 'center', color: '#495057',
  },
  modalButtonContainer: { // Renamed from modalButtons for clarity
    flexDirection: 'row',
    justifyContent: 'center', // Center the single OK button
  },
  modalButton: {
    paddingVertical: 10, paddingHorizontal: 15,
    borderRadius: 5, minWidth: 90, alignItems: 'center',
  },
  confirmButton: { backgroundColor: '#0066cc', }, // Or a neutral color
  confirmButtonText: { color: 'white', fontWeight: 'bold', },
});

export default ConnectionErrorModal; // Export if in a separate file

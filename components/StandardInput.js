import React from 'react';
import { TextInput, View, StyleSheet } from 'react-native';

const StandardInput = ({ value, onChangeText, placeholder, style, ...props }) => (
  <View style={[styles.container, style]}>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      style={styles.input}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { width: '100%' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    width: '100%',
  },
});

export default StandardInput;

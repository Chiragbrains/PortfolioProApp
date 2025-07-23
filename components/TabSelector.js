import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

const TabSelector = ({ options, selected, onSelect, style }) => (
  <View style={[styles.container, style]}>
    {options.map(option => (
      <TouchableOpacity
        key={option}
        style={[styles.tab, selected === option && styles.selectedTab]}
        onPress={() => onSelect(option)}
      >
        <Text style={[styles.tabText, selected === option && styles.selectedText]}>{option}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#ddd',
  },
  selectedTab: {
    backgroundColor: '#007bff',
  },
  tabText: {
    fontSize: 16,
    color: '#333',
  },
  selectedText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default TabSelector;

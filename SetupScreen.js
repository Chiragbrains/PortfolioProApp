// /SetupScreen.js (New File)
import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Alert, ScrollView, Linking, Platform, TouchableOpacity } from 'react-native';
import { useSupabaseConfig } from './SupabaseConfigContext';

const SetupScreen = () => {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const { saveConfig, isLoading, configError } = useSupabaseConfig();

  const handleConnect = async () => {
    const success = await saveConfig(url.trim(), anonKey.trim());
    if (!success) {
        // Error is handled and displayed via configError state in context
        Alert.alert("Connection Failed", configError || "Please check your URL and Anon Key and try again.");
    }
    // On success, the App component will automatically re-render the main view
  };

  const openLink = (url) => {
      Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Connect to Your Supabase</Text>
      <Text style={styles.instructions}>
        Before using the app, you need to set up your own Supabase project.
        Follow the instructions provided (link below) to create the necessary tables and functions.
        Then, enter your Supabase Project URL and Anon Key below.
      </Text>

      {/* Add a link to your detailed setup instructions */}
      <TouchableOpacity onPress={() => openLink('YOUR_SETUP_INSTRUCTION_URL_HERE')}>
          <Text style={styles.link}>View Setup Instructions</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        placeholder="Supabase Project URL (e.g., https://xyz.supabase.co)"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      <TextInput
        style={styles.input}
        placeholder="Supabase Anon Key (public)"
        value={anonKey}
        onChangeText={setAnonKey}
        autoCapitalize="none"
        secureTextEntry={true} // Hide key slightly
      />

      {isLoading && <ActivityIndicator size="large" color="#0066cc" />}
      {configError && <Text style={styles.errorText}>{configError}</Text>}

      <Button title={isLoading ? "Connecting..." : "Connect & Save"} onPress={handleConnect} disabled={isLoading} />

      <Text style={styles.privacyNote}>
          Your URL and Anon Key are stored only in your browser's local storage and are not sent to our servers.
          Ensure you have enabled Row Level Security on your Supabase tables.
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#f5f5f5',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 15,
        textAlign: 'center',
    },
    instructions: {
        textAlign: 'center',
        marginBottom: 20,
        color: '#333',
        lineHeight: 20,
    },
    link: {
        color: '#0066cc',
        textDecorationLine: 'underline',
        marginBottom: 20,
    },
    input: {
        width: '100%',
        height: 50,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 15,
        marginBottom: 15,
        backgroundColor: 'white',
    },
    errorText: {
        color: 'red',
        marginBottom: 10,
        textAlign: 'center',
    },
    privacyNote: {
        marginTop: 25,
        fontSize: 12,
        color: '#666',
        textAlign: 'center',
        fontStyle: 'italic',
    }
});

export default SetupScreen;

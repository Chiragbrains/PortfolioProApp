// /AppWrapper.js (New File or rename index.js/entry point)
import React, { useEffect } from 'react';
import App from './App'; // Your existing App component
import SetupScreen from './SetupScreen';
import { SupabaseConfigProvider, useSupabaseConfig } from './SupabaseConfigContext';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // Needed for PortfolioGraph gestures
import { initializeSchemaEmbeddings } from './services/embeddingService';

const AppContent = () => {
  const { isConfigured, isLoading, configError, supabase } = useSupabaseConfig();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize schema embeddings if needed
        if (supabase) {
          await initializeSchemaEmbeddings(supabase);
        }
      } catch (error) {
        console.error('Error during app initialization:', error);
      }
    };

    initializeApp();
  }, [supabase]); // Re-run if supabase instance changes

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text>Loading Configuration...</Text>
      </View>
    );
  }

   // Show setup screen if not configured OR if there was an error loading config
  if (!isConfigured || configError) {
    // Pass clearConfig down if you add a "Reset" button to SetupScreen
    return <SetupScreen />;
  }

  // Render the main app if configured
  return <App />;
};

const AppWrapper = () => {
  return (
    // Wrap with GestureHandlerRootView if using react-native-gesture-handler
    <GestureHandlerRootView style={{ flex: 1 }}>
        <SupabaseConfigProvider>
          <AppContent />
        </SupabaseConfigProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    }
});

export default AppWrapper;

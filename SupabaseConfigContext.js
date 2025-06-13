// /SupabaseConfigContext.js (New File)
import React, { createContext, useState, useEffect, useContext, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Or window.localStorage for web
import { Platform } from 'react-native';

const SupabaseConfigContext = createContext(null);

// Use AsyncStorage for React Native, localStorage for Web
const storage = Platform.OS === 'web' ? window.localStorage : AsyncStorage;
const URL_KEY = 'userSupabaseUrl';
const ANON_KEY = 'userSupabaseAnonKey';

export const SupabaseConfigProvider = ({ children }) => {
  const [supabaseUrl, setSupabaseUrl] = useState(null);
  const [anonKey, setAnonKey] = useState(null);
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [configError, setConfigError] = useState(null);

  // Load config from storage on mount
  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      setConfigError(null);
      try {
        const storedUrl = await storage.getItem(URL_KEY);
        const storedKey = await storage.getItem(ANON_KEY);

        if (storedUrl && storedKey) {
          setSupabaseUrl(storedUrl);
          setAnonKey(storedKey);
          // Create client immediately if config found
          const client = createClient(storedUrl, storedKey);
          setSupabaseClient(client);
        }
      } catch (error) {
        console.error("Error loading Supabase config:", error);
        setConfigError("Failed to load configuration.");
      } finally {
        setIsLoading(false);
      }
    };
    loadConfig();
  }, []);

  // Function to save config and create client
  const saveConfig = async (url, key) => {
    setIsLoading(true);
    setConfigError(null);
    try {
      // Basic validation
      if (!url || !key || !url.startsWith('http')) {
        throw new Error("Invalid URL or Anon Key provided.");
      }

      // Attempt to create a client to test (optional but good UX)
      const tempClient = createClient(url, key);
      // Optional: Perform a simple test query
      // const { error: testError } = await tempClient.from('stocks').select('id', { count: 'exact', head: true });
      // if (testError) {
      //   console.warn("Supabase connection test failed:", testError);
      //   throw new Error(`Connection failed. Check URL/Key and ensure tables exist. Error: ${testError.message}`);
      // }

      // Save to storage
      await storage.setItem(URL_KEY, url);
      await storage.setItem(ANON_KEY, key);

      // Update state
      setSupabaseUrl(url);
      setAnonKey(key);
      setSupabaseClient(tempClient); // Use the tested client
      console.log("Supabase configuration saved successfully.");

    } catch (error) {
      console.error("Error saving Supabase config:", error);
      setConfigError(error.message || "Failed to save configuration.");
      // Clear potentially bad state
      setSupabaseUrl(null);
      setAnonKey(null);
      setSupabaseClient(null);
      await storage.removeItem(URL_KEY); // Clear storage on failure
      await storage.removeItem(ANON_KEY);
      return false; // Indicate failure
    } finally {
      setIsLoading(false);
    }
    return true; // Indicate success
  };

  // Function to clear config
  const clearConfig = async () => {
      setIsLoading(true);
      try {
          await storage.removeItem(URL_KEY);
          await storage.removeItem(ANON_KEY);
          setSupabaseUrl(null);
          setAnonKey(null);
          setSupabaseClient(null);
          setConfigError(null);
          console.log("Supabase configuration cleared.");
      } catch (error) {
          console.error("Error clearing config:", error);
          setConfigError("Failed to clear configuration.");
      } finally {
          setIsLoading(false);
      }
  };


  // Memoize context value
  const value = useMemo(() => ({
    supabaseUrl,
    anonKey,
    supabaseClient,
    isLoading,
    configError,
    saveConfig,
    clearConfig,
    isConfigured: !!supabaseClient, // Helper flag
  }), [supabaseUrl, anonKey, supabaseClient, isLoading, configError]);

  return (
    <SupabaseConfigContext.Provider value={value}>
      {children}
    </SupabaseConfigContext.Provider>
  );
};

// Custom hook to use the context
export const useSupabaseConfig = () => {
  const context = useContext(SupabaseConfigContext);
  if (context === undefined) {
    throw new Error('useSupabaseConfig must be used within a SupabaseConfigProvider');
  }
  return context;
};

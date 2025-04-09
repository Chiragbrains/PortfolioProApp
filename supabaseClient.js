import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://vdxrsbzfqucnlfxlkhdu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkeHJzYnpmcXVjbmxmeGxraGR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI3NjgzNDYsImV4cCI6MjA1ODM0NDM0Nn0.mn58x3QjurHftggrAbVZFfyTIkx38ydH_yTSorVFEKI';

// Create a custom storage object
const customStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  localStorage: customStorage,
  autoRefreshToken: true,
  persistSession: true,
});

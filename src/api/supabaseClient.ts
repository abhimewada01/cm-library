import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_SESSION_PREFIX = 'cm_library_supabase_';

const secureSessionStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(`${SUPABASE_SESSION_PREFIX}${key}`),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(`${SUPABASE_SESSION_PREFIX}${key}`, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(`${SUPABASE_SESSION_PREFIX}${key}`),
};

const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

/** `null` keeps the existing API-backed app working until Supabase is configured. */
export const supabase = projectUrl && publishableKey
  ? createClient(projectUrl, publishableKey, {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export const isSupabaseConfigured = Boolean(supabase);

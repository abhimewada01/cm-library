import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'cm_library_access_token';
const REFRESH_TOKEN_KEY = 'cm_library_refresh_token';

function browserStorage() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window;
}

/** Keep server-issued credentials in Android Keystore-backed secure storage.
 * Student profile data and passwords are deliberately not persisted here. */
export async function saveTokens(accessToken: string, refreshToken?: string) {
  const browser = browserStorage();
  if (browser) {
    browser.sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) browser.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    else browser.localStorage.removeItem(REFRESH_TOKEN_KEY);
    browser.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  else await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function getAccessToken() {
  const browser = browserStorage();
  if (browser) return browser.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken() {
  const browser = browserStorage();
  if (browser) return browser.localStorage.getItem(REFRESH_TOKEN_KEY);
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearTokens() {
  const browser = browserStorage();
  if (browser) {
    browser.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    browser.localStorage.removeItem(REFRESH_TOKEN_KEY);
    browser.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

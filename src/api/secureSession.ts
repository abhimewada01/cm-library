import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'cm_library_access_token';
const REFRESH_TOKEN_KEY = 'cm_library_refresh_token';

/** Keep server-issued credentials in Android Keystore-backed secure storage.
 * Student profile data and passwords are deliberately not persisted here. */
export async function saveTokens(accessToken: string, refreshToken?: string) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  else await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

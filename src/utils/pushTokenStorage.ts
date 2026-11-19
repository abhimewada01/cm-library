import * as SecureStore from 'expo-secure-store';

const PUSH_TOKEN_KEY = 'cm-library.expo-push-token';
export const getStoredPushToken = () => SecureStore.getItemAsync(PUSH_TOKEN_KEY);
export const savePushToken = (token: string) => SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
export const clearStoredPushToken = () => SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);

import * as SecureStore from 'expo-secure-store';

// SecureStore keys must be alphanumeric plus . _ -
const TOKEN_KEY = 'orderBookingApp.authToken';

export function getStoredToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function clearStoredToken() {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}

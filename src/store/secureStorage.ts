import * as SecureStore from 'expo-secure-store';
import type { StateStorage } from 'zustand/middleware';

/**
 * Zustand StateStorage adapter backed by expo-secure-store.
 * Drop-in replacement for localStorage/AsyncStorage in the persist middleware.
 * Keys and values must fit SecureStore limits (key ≤ 240 chars, value ≤ 2 KB).
 */
export const secureStorage: StateStorage = {
  getItem:    (key) => SecureStore.getItemAsync(key),
  setItem:    (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

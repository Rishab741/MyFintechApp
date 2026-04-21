import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, AppStateStatus } from 'react-native';
import 'react-native-url-polyfill/auto';

// ─── Secure token storage (device keychain / keystore) ───────────────────────
const SecureStoreAdapter = {
  getItem:    (key: string) => SecureStore.getItemAsync(key),
  setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// ─── Validate env vars at startup ────────────────────────────────────────────
// Using non-null assertion on undefined crashes the app silently before any
// error boundary can catch it. Fail loudly with a readable message instead.
const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL     ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    '[Supabase] Missing environment variables.\n' +
    'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.\n' +
    'For EAS builds, add them via: eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value <url>'
  );
}

// ─── Supabase client ─────────────────────────────────────────────────────────
// PKCE flow prevents auth-code interception attacks on mobile.
// autoRefreshToken silently rotates the JWT before it expires using the
// long-lived refresh token (configured via Dashboard → Auth → Token lifetime).
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage:            SecureStoreAdapter,
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: false,
      flowType:           'pkce',
    },
  }
);

// ─── Proactive refresh on app foreground ─────────────────────────────────────
// When the app has been backgrounded the JS runtime is paused, so the
// internal refresh timer never fires. Force a refresh on every foreground
// so the user always has a valid token ready — zero perceived latency.
let _appState: AppStateStatus = AppState.currentState;

AppState.addEventListener('change', (nextState: AppStateStatus) => {
  if (_appState.match(/inactive|background/) && nextState === 'active') {
    supabase.auth.startAutoRefresh();
  }
  if (nextState.match(/inactive|background/)) {
    supabase.auth.stopAutoRefresh();
  }
  _appState = nextState;
});

// ─── Helper: get session, refreshing if close to expiry ──────────────────────
// Returns null if the user is not signed in.
export async function getValidSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;

  // Refresh proactively if token expires within 5 minutes
  const expiresAt  = session.expires_at ?? 0;           // unix seconds
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const fiveMin    = 5 * 60;

  if (expiresAt - nowSeconds < fiveMin) {
    const { data } = await supabase.auth.refreshSession();
    return data.session;
  }

  return session;
}

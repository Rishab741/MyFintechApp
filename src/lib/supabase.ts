import { createClient } from '@supabase/supabase-js';
import * as ExpoCrypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState, AppStateStatus } from 'react-native';
import 'react-native-url-polyfill/auto';

// ─── WebCrypto polyfill ───────────────────────────────────────────────────────
// React Native / Hermes does not expose crypto.subtle, which the Supabase SDK
// needs for PKCE SHA-256 code challenges.  Without this, Supabase falls back
// to the weaker "plain" challenge method and logs a warning on every auth call.
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  (globalThis as any).crypto = {
    ...(globalThis.crypto ?? {}),
    getRandomValues: ExpoCrypto.getRandomValues,
    subtle: {
      digest: async (algorithm: string, data: ArrayBuffer) => {
        const ALGO_MAP: Record<string, ExpoCrypto.CryptoDigestAlgorithm> = {
          'SHA-1':   ExpoCrypto.CryptoDigestAlgorithm.SHA1,
          'SHA-256': ExpoCrypto.CryptoDigestAlgorithm.SHA256,
          'SHA-384': ExpoCrypto.CryptoDigestAlgorithm.SHA384,
          'SHA-512': ExpoCrypto.CryptoDigestAlgorithm.SHA512,
          'SHA1':    ExpoCrypto.CryptoDigestAlgorithm.SHA1,
          'SHA256':  ExpoCrypto.CryptoDigestAlgorithm.SHA256,
          'SHA384':  ExpoCrypto.CryptoDigestAlgorithm.SHA384,
          'SHA512':  ExpoCrypto.CryptoDigestAlgorithm.SHA512,
        };
        const algo = ALGO_MAP[algorithm] ?? ALGO_MAP[algorithm.toUpperCase()] ?? ExpoCrypto.CryptoDigestAlgorithm.SHA256;
        // expo-crypto digest accepts TypedArray, not bare ArrayBuffer
        return ExpoCrypto.digest(algo, new Uint8Array(data));
      },
    },
  };
}

// ─── Secure token storage with chunking ──────────────────────────────────────
// expo-secure-store v15 enforces a 2048-byte BYTE limit per key (not chars).
// We check byte length via TextEncoder so multi-byte characters (accented
// names, emoji) never silently push a chunk past the hard limit.
// Chunks are kept at 1800 bytes — well under the 2048-byte ceiling.
const CHUNK_SIZE = 1800;

const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const one = await SecureStore.getItemAsync(key);
    if (one !== null) return one;
    // Try reassembling chunks
    const parts: string[] = [];
    let i = 0;
    while (true) {
      const chunk = await SecureStore.getItemAsync(`${key}.chunk.${i}`);
      if (chunk === null) break;
      parts.push(chunk);
      i++;
    }
    return parts.length ? parts.join('') : null;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    // Check byte length (not char length) so multi-byte characters don't push
    // a chunk past expo-secure-store's hard 2048-byte limit.
    const byteLen = new TextEncoder().encode(value).length;
    if (byteLen <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    // Remove any legacy single-key value
    await SecureStore.deleteItemAsync(key).catch(() => {});
    // Write chunks — slice by character but keep chunk byte-budget safe
    let i = 0;
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      await SecureStore.setItemAsync(`${key}.chunk.${i}`, value.slice(offset, offset + CHUNK_SIZE));
      i++;
    }
  },

  removeItem: async (key: string): Promise<void> => {
    await SecureStore.deleteItemAsync(key).catch(() => {});
    let i = 0;
    while (true) {
      const chunkKey = `${key}.chunk.${i}`;
      const exists = await SecureStore.getItemAsync(chunkKey);
      if (exists === null) break;
      await SecureStore.deleteItemAsync(chunkKey).catch(() => {});
      i++;
    }
  },
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

/**
 * app/_layout.tsx  —  Root layout & auth gate
 *
 * YOUR ROUTE STRUCTURE:
 *   app/(auth)/login.tsx   ← sign in / sign up screen  (already exists ✓)
 *   app/(main)/home.tsx    ← main app with tabs         (already exists ✓)
 *
 * THE BLANK SCREEN BUG:
 *   After signInWithPassword() succeeds, Supabase updates its internal
 *   session but nothing told Expo Router to navigate anywhere.
 *   Result: blank screen until you manually tapped away.
 *
 * THE FIX:
 *   onAuthStateChange fires on every auth event (sign-in, sign-out, refresh).
 *   We store the session in Zustand there, and the routing useEffect
 *   immediately reacts and pushes the correct route.
 *
 * ABOUT THE auth.tsx I GENERATED EARLIER:
 *   → DELETE IT. It was wrong for your structure.
 *   → Your auth screen lives at app/(auth)/login.tsx. Keep it exactly there.
 *   → No changes needed to your (auth)/login.tsx or (main)/home.tsx files.
 */

import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/store/useAuthStore';

export default function RootLayout() {
  const { session, setSession, initialized, setInitialized } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // ── 1. Hydrate session on cold start + listen for all future changes ────────
  useEffect(() => {
    // Check whatever session already exists (e.g. from a previous app open)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });

    // *** THIS IS THE KEY FIX ***
    // onAuthStateChange fires when the user signs in, signs out, or the
    // JWT refreshes. Calling setSession here triggers the routing effect
    // below — so navigation happens instantly after login with zero
    // blank-screen delay.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setInitialized(true); // also covers the edge case where listener fires before getSession
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── 2. Route guard — runs whenever session or route changes ─────────────────
  useEffect(() => {
    if (!initialized) return; // wait until we know the real auth state

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Not logged in → send to login
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Logged in but still on auth screen → go to app
      router.replace('/(tabs)');
    }
    // session && in (main) → do nothing, already in the right place
  }, [session, initialized, segments]);

  // ── 3. Dark splash while session resolves (prevents wrong-screen flash) ─────
  if (!initialized) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0D14', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#C9A84C" size="large" />
      </View>
    );
  }

  return <Slot />;
}
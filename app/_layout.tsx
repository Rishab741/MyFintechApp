import { QueryClientProvider } from '@tanstack/react-query';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, ActivityIndicator, Linking, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '../src/lib/queryClient';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/store/useAuthStore';
import { useConnectionStore } from '../src/store/useConnectionStore';

export default function RootLayout() {
  const { session, setSession, initialized, setInitialized } = useAuthStore();
  const { setConnecting, setBrokerageConnected } = useConnectionStore();
  const segments = useSegments();
  const router = useRouter();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const [routeDecided, setRouteDecided] = useState(false);

  // ── 1. Hydrate session on cold start + listen for all future changes ────────
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setInitialized(true);
      })
      .catch(() => {
        // Supabase unreachable (bad env vars, offline) — unblock the router
        // so the user lands on the login screen rather than an infinite spinner.
        setSession(null);
        setInitialized(true);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setInitialized(true);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── 2. SnapTrade callback handler (always active at root level) ──────────────
  //
  // Two triggers for saving the connection:
  //   A) Deep link  — SnapTrade redirects to myfintechapp://snaptrade-callback
  //   B) AppState   — user manually swipes back from the browser (fallback)
  //
  // Both call the same saveSnapTradeConnection helper.

  const saveSnapTradeConnection = async (authorizationId: string | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Skip if already saved
    const { data: existing } = await supabase
      .from('snaptrade_connections')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing?.account_id) {
      setBrokerageConnected(true);
      setConnecting(false);
      return;
    }

    // Save the connection — the edge function extracts user_id from the JWT
    const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
      body: {
        action: 'snaptrade_save_connection',
        brokerage_authorization_id: authorizationId,
      },
    });

    if (error || !data?.success) {
      console.log('saveSnapTradeConnection failed:', error, data);
      setConnecting(false);
      return;
    }

    console.log('Connection saved at root level ✅ account_id:', data.account_id);
    setBrokerageConnected(true);
    setConnecting(false);

    // Fetch holdings in background so Portfolio has data ready immediately
    supabase.functions.invoke('exchange-plaid-token', {
      body: { action: 'snaptrade_get_holdings' },
    }).then(({ error: hErr }) => {
      if (hErr) console.log('Initial holdings fetch error:', hErr);
      else console.log('Initial holdings fetched ✅');
    });
  };

  // Trigger A: deep link (myfintechapp://snaptrade-callback)
  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (!url.includes('snaptrade-callback')) return;
      console.log('Deep link received at root:', url);
      const questionMark = url.indexOf('?');
      const params: Record<string, string> = {};
      if (questionMark !== -1) {
        url.slice(questionMark + 1).split('&').forEach(pair => {
          const [k, v] = pair.split('=');
          if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
        });
      }
      const authId =
        params['authorizationId'] ??
        params['brokerage_authorization'] ??
        params['brokerageAuthorizationId'] ??
        null;
      saveSnapTradeConnection(authId);
    };

    // Cold-start: app was fully closed and opened via deep link
    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }); });

    // Warm: app already running, deep link fires
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);

  // Trigger B: AppState foreground (user swiped back from browser without deep link)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active' &&
        useConnectionStore.getState().isConnecting
      ) {
        console.log('App foregrounded during connect flow — attempting save...');
        saveSnapTradeConnection(null);
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  // ── 3. Route guard (auth + first-run onboarding) ────────────────────────────
  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
        // Keep spinner up — wait for segment to update to '(auth)'
      } else {
        setRouteDecided(true); // Already on login, safe to render
      }
      return;
    }

    if (session && inAuthGroup) {
      // New sign-in: check user_metadata.onboarded flag.
      // First-time user (flag absent/false) → onboarding wizard.
      // Returning user → dashboard directly.
      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.user_metadata?.onboarded) {
            router.replace('/(tabs)');
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.replace('/onboard' as any);
          }
        } catch {
          router.replace('/(tabs)'); // fail-safe: always reach the app
        }
      })();
      return;
    }

    // session && !inAuthGroup — user is already on the correct route
    setRouteDecided(true);
  }, [session, initialized, segments]);

  // ── 4. Splash while session resolves or routing is in progress ───────────────
  if (!initialized || !routeDecided) {
    return (
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#060E1F', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#0EA5E9" size="large" />
          </View>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Slot />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

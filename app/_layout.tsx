import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, ActivityIndicator, Linking, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/store/useAuthStore';
import { useConnectionStore } from '../src/store/useConnectionStore';

export default function RootLayout() {
  const { session, setSession, initialized, setInitialized } = useAuthStore();
  const { setConnecting, setBrokerageConnected } = useConnectionStore();
  const segments = useSegments();
  const router = useRouter();
  const appState = useRef<AppStateStatus>(AppState.currentState);

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

    // Save the connection — the edge function fetches the real account_id from SnapTrade
    const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
      body: {
        action: 'snaptrade_save_connection',
        user_id: user.id,
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
      body: { action: 'snaptrade_get_holdings', user_id: user.id },
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

  // ── 3. Route guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, initialized, segments]);

  // ── 4. Splash while session resolves ────────────────────────────────────────
  if (!initialized) {
    return (
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#0A0D14', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#C9A84C" size="large" />
          </View>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Slot />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

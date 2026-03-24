import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { create, LinkExit, LinkSuccess, open } from 'react-native-plaid-link-sdk';
import { supabase } from '../src/lib/supabase';

// Parses query params from a URL string without using the browser URL class,
// which is not available in React Native's JS engine.
// e.g. "vestara://snaptrade-callback?authorizationId=abc&status=SUCCESS"
// → { authorizationId: "abc", status: "SUCCESS" }
function parseQueryParams(url: string): Record<string, string> {
  const questionMark = url.indexOf('?');
  if (questionMark === -1) return {};
  const queryString = url.slice(questionMark + 1);
  const result: Record<string, string> = {};
  queryString.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key) result[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
  });
  return result;
}

export default function ConnectInvestment() {
  const [loading, setLoading] = useState(false);
  const [brokerageConnected, setBrokerageConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);

  useEffect(() => {
    checkExistingConnection();

    // Listen for the deep link that SnapTrade fires after the user connects.
    // This is the critical piece that saves the connection and closes the loop.
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleSnapTradeCallback(url);
    });

    // Also handle the case where the app was fully closed and the deep link
    // launched it — getInitialURL fires once on mount in that scenario.
    Linking.getInitialURL().then(url => {
      if (url) handleSnapTradeCallback(url);
    });

    return () => subscription.remove();
  }, []);

  const checkExistingConnection = async () => {
    setCheckingConnection(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('snaptrade_connections')
        .select('account_id')
        .eq('user_id', user.id)
        .maybeSingle();

      setBrokerageConnected(!!data?.account_id);
    } catch (err) {
      console.log('Connection check failed:', err);
    } finally {
      setCheckingConnection(false);
    }
  };

  // Called when SnapTrade redirects back to vestara://snaptrade-callback
  // after the user finishes entering their Binance API keys in the portal.
  const handleSnapTradeCallback = async (url: string) => {
    if (!url.includes('snaptrade-callback')) return;

    console.log('SnapTrade deep link received:', url);

    try {
      // React Native does not have the browser URL class — parse manually.
      const params = parseQueryParams(url);
      console.log('Parsed params:', JSON.stringify(params));

      // SnapTrade passes the authorization id as one of these param names
      const authorizationId =
        params['authorizationId'] ??
        params['brokerage_authorization'] ??
        params['brokerageAuthorizationId'] ??
        null;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No user found during deep link handling');
        return;
      }

      setLoading(true);

      const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
        body: {
          action: 'snaptrade_save_connection',
          user_id: user.id,
          brokerage_authorization_id: authorizationId,
        },
      });

      setLoading(false);

      if (error || !data?.success) {
        console.error('Save connection failed:', error, data);
        Alert.alert(
          'Connection Error',
          'Your account connected but we could not save it. Please try again.'
        );
        return;
      }

      console.log('Connection saved ✅ account_id:', data.account_id);
      setBrokerageConnected(true);
      Alert.alert('Connected!', 'Your Binance account has been linked successfully.');
    } catch (err: any) {
      setLoading(false);
      console.error('Deep link handling crashed:', err);
    }
  };

  // ── PLAID: Banks & Traditional Finance ────────────────────────────────────
  const handlePlaid = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
        body: { action: 'plaid_create' },
      });

      if (error || !data?.link_token) throw new Error('Could not initialize Bank Link');

      create({ token: data.link_token });

      setTimeout(() => {
        setLoading(false);
        open({
          onSuccess: async (success: LinkSuccess) => {
            await supabase.functions.invoke('exchange-plaid-token', {
              body: {
                action: 'plaid_exchange',
                public_token: success.publicToken,
                metadata: success.metadata,
              },
            });
            Alert.alert('Success', 'Bank account synchronized.');
          },
          onExit: (exit: LinkExit) => console.log('Plaid Exit', exit),
        });
      }, 100);
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Connection Error', err.message);
    }
  };

  // ── SNAPTRADE: Binance, Coinbase & Brokerages ──────────────────────────────
  const handleBrokerageConnect = async (brokerId?: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to connect accounts.');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
        body: {
          action: 'snaptrade_create',
          user_id: user.id,
          broker: brokerId,
        },
      });

      setLoading(false);

      // Edge function found an existing connection in DB — no need to open portal.
      if (data?.already_connected) {
        setBrokerageConnected(true);
        return;
      }

      if (error || !data?.redirect_uri) {
        throw new Error('Could not initialize Brokerage Link');
      }

      // Open the SnapTrade portal in the system browser.
      // When the user finishes connecting, SnapTrade fires vestara://snaptrade-callback
      // which is caught by handleSnapTradeCallback above.
      const supported = await Linking.canOpenURL(data.redirect_uri);
      if (supported) {
        await Linking.openURL(data.redirect_uri);
      } else {
        Alert.alert('Error', 'Cannot open connection portal.');
      }
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Connection Error', err.message);
    }
  };

  if (checkingConnection) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#C9A84C" />
      </View>
    );
  }

  if (brokerageConnected) {
    return (
      <View style={styles.container}>
        <View style={styles.connectedBadge}>
          <Text style={styles.connectedText}>✓ Brokerage Connected</Text>
          <Text style={styles.connectedSub}>Your portfolio is syncing</Text>
        </View>
        {/* Mount your portfolio / analytics component here */}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator color="#C9A84C" />
          <Text style={styles.loaderText}>Establishing Secure Connection...</Text>
        </View>
      )}

      <View style={styles.grid}>
        <PlatformButton
          title="Banks & Savings"
          icon="🏦"
          onPress={handlePlaid}
          disabled={loading}
        />
        <PlatformButton
          title="Binance"
          icon="🔶"
          onPress={() => handleBrokerageConnect('BINANCE')}
          disabled={loading}
        />
        <PlatformButton
          title="Coinbase"
          icon="🔵"
          onPress={() => handleBrokerageConnect('COINBASE')}
          disabled={loading}
        />
        <PlatformButton
          title="Other Brokers"
          icon="📈"
          onPress={() => handleBrokerageConnect()}
          disabled={loading}
        />
      </View>
    </View>
  );
}

const PlatformButton = ({ title, icon, onPress, disabled }: any) => (
  <TouchableOpacity
    style={[styles.pBtn, disabled && { opacity: 0.5 }]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.7}
  >
    <View style={styles.iconCircle}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
    </View>
    <Text style={styles.pBtnText}>{title}</Text>
    <Text style={styles.pBtnSub}>Connect Seamlessly</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { width: '100%', paddingVertical: 10 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  loader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 10,
  },
  loaderText: { color: '#C9A84C', fontSize: 12, fontWeight: '600' },
  pBtn: {
    backgroundColor: '#12161F',
    width: '48%',
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  pBtnText: { color: '#F0EDE6', fontSize: 13, fontWeight: '700' },
  pBtnSub: { color: '#5A6070', fontSize: 10, marginTop: 4 },
  connectedBadge: {
    backgroundColor: '#12161F',
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
  },
  connectedText: { color: '#C9A84C', fontSize: 15, fontWeight: '700' },
  connectedSub: { color: '#5A6070', fontSize: 11, marginTop: 4 },
});
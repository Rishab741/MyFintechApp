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
import { useConnectionStore } from '../src/store/useConnectionStore';

export default function ConnectInvestment({ onConnectionChange }: { onConnectionChange?: (connected: boolean) => void } = {}) {
  const [loading, setLoading] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  // true once browser is open — shows the "I've connected" button
  const [awaitingCallback, setAwaitingCallback] = useState(false);

  const { brokerageConnected, setBrokerageConnected } = useConnectionStore();

  useEffect(() => {
    checkExistingConnection();
  }, []);

  useEffect(() => {
    onConnectionChange?.(brokerageConnected);
  }, [brokerageConnected]);

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

      if (data?.account_id) setBrokerageConnected(true);
    } catch (err) {
      console.log('Connection check failed:', err);
    } finally {
      setCheckingConnection(false);
    }
  };

  // Called after the user returns from the SnapTrade browser portal.
  // Fetches their accounts from SnapTrade and saves to DB — no deep link needed.
  const handleConnectionDone = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
        body: {
          action: 'snaptrade_save_connection',
          user_id: user.id,
          brokerage_authorization_id: null,
        },
      });

      if (error || !data?.success) {
        Alert.alert(
          'Not Connected Yet',
          'We could not find a connected account. Make sure you completed the connection in the browser, then try again.'
        );
        setLoading(false);
        return;
      }

      setAwaitingCallback(false);
      setBrokerageConnected(true);

      // Fetch initial holdings in background
      supabase.functions.invoke('exchange-plaid-token', {
        body: { action: 'snaptrade_get_holdings', user_id: user.id },
      }).then(({ error: hErr }) => {
        if (hErr) console.log('Initial holdings fetch error:', hErr);
      });

      Alert.alert('Connected!', 'Your account has been linked. Portfolio data is loading.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── PLAID: Banks ───────────────────────────────────────────────────────────
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

  // ── SNAPTRADE: Brokerages ──────────────────────────────────────────────────
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
        body: { action: 'snaptrade_create', user_id: user.id, broker: brokerId },
      });

      setLoading(false);

      if (data?.already_connected) {
        setBrokerageConnected(true);
        return;
      }

      if (error || !data?.redirect_uri) {
        throw new Error('Could not initialize Brokerage Link');
      }

      const supported = await Linking.canOpenURL(data.redirect_uri);
      if (!supported) {
        Alert.alert('Error', 'Cannot open connection portal.');
        return;
      }

      await Linking.openURL(data.redirect_uri);
      // Show the "I've connected" prompt once the browser is open
      setAwaitingCallback(true);
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Connection Error', err.message);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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
      </View>
    );
  }

  // Shown after browser opens — user has finished in SnapTrade and returned
  if (awaitingCallback) {
    return (
      <View style={styles.container}>
        <View style={styles.callbackCard}>
          <Text style={styles.callbackIcon}>🔗</Text>
          <Text style={styles.callbackTitle}>Complete your connection</Text>
          <Text style={styles.callbackSub}>
            Finish connecting in the browser, then tap the button below.
          </Text>
          <TouchableOpacity
            style={[styles.doneBtn, loading && { opacity: 0.6 }]}
            onPress={handleConnectionDone}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#0A0D14" />
              : <Text style={styles.doneBtnText}>I've Connected — Continue</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setAwaitingCallback(false)}
            disabled={loading}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
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
        <PlatformButton title="Banks & Savings" icon="🏦" onPress={handlePlaid} disabled={loading} />
        <PlatformButton title="Binance"          icon="🔶" onPress={() => handleBrokerageConnect('BINANCE')}   disabled={loading} />
        <PlatformButton title="Coinbase"         icon="🔵" onPress={() => handleBrokerageConnect('COINBASE')}  disabled={loading} />
        <PlatformButton title="Other Brokers"    icon="📈" onPress={() => handleBrokerageConnect()}            disabled={loading} />
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  loader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, gap: 10 },
  loaderText: { color: '#C9A84C', fontSize: 12, fontWeight: '600' },

  pBtn: { backgroundColor: '#12161F', width: '48%', padding: 16, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  iconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.03)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  pBtnText: { color: '#F0EDE6', fontSize: 13, fontWeight: '700' },
  pBtnSub: { color: '#5A6070', fontSize: 10, marginTop: 4 },

  connectedBadge: { backgroundColor: '#12161F', padding: 20, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
  connectedText: { color: '#C9A84C', fontSize: 15, fontWeight: '700' },
  connectedSub: { color: '#5A6070', fontSize: 11, marginTop: 4 },

  callbackCard: { backgroundColor: '#12161F', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', gap: 10 },
  callbackIcon: { fontSize: 36, marginBottom: 4 },
  callbackTitle: { color: '#F0EDE6', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  callbackSub: { color: '#5A6070', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 8 },

  doneBtn: { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center' },
  doneBtnText: { color: '#0A0D14', fontSize: 14, fontWeight: '700' },

  cancelBtn: { paddingVertical: 8 },
  cancelBtnText: { color: '#5A6070', fontSize: 13 },
});

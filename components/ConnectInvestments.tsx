import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '../src/lib/supabase';
import { useConnectionHealth } from '../src/portfolio/hooks/useConnectionHealth';

// ── Token constants ───────────────────────────────────────────────────────────
const GOLD   = '#C9A84C';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const GREEN  = '#22C55E';
const CARD   = '#12161F';
const BORDER_GOLD  = 'rgba(201,168,76,0.3)';
const BORDER_RED   = 'rgba(239,68,68,0.3)';
const BORDER_AMBER = 'rgba(245,158,11,0.3)';
const BORDER_GREEN = 'rgba(34,197,94,0.3)';
const MUTED  = '#5A6070';
const TXT    = '#F0EDE6';

export default function ConnectInvestment({
  onConnectionChange,
}: {
  onConnectionChange?: (connected: boolean) => void;
} = {}) {
  const health = useConnectionHealth();
  const [loading,          setLoading]          = useState(false);
  const [awaitingCallback, setAwaitingCallback] = useState(false);

  // Notify parent whenever connection status changes
  React.useEffect(() => {
    onConnectionChange?.(health.status === 'healthy' || health.status === 'stale');
  }, [health.status]);

  // ── SnapTrade: open portal ────────────────────────────────────────────────
  const handleBrokerageConnect = useCallback(async (brokerId?: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Error', 'You must be logged in.'); return; }

      const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
        body: { action: 'snaptrade_create', user_id: user.id, broker: brokerId },
      });

      if (data?.already_connected) {
        await health.recheck();
        return;
      }

      if (error || !data?.redirect_uri) {
        throw new Error(data?.error ?? error?.message ?? 'No portal URL returned');
      }

      await Linking.openURL(data.redirect_uri);
      setAwaitingCallback(true);
    } catch (err: any) {
      Alert.alert('Connection Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [health]);

  // ── SnapTrade: user returned from portal ──────────────────────────────────
  const handleConnectionDone = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
        body: { action: 'snaptrade_save_connection', user_id: user.id, brokerage_authorization_id: null },
      });

      if (error || !data?.success) {
        Alert.alert(
          'Not Connected Yet',
          'We could not find a connected account. Complete the connection in the browser first, then tap below.',
        );
        return;
      }

      setAwaitingCallback(false);

      // Fetch initial holdings in background
      supabase.functions.invoke('exchange-plaid-token', {
        body: { action: 'snaptrade_get_holdings', user_id: user.id },
      }).then(({ error: hErr, data: hData }) => {
        if (hData?.error === 'brokerage_auth_expired') {
          health.markSyncResult('brokerage_auth_expired');
        } else if (!hErr) {
          health.markSyncResult('ok');
        }
      });

      await health.recheck();
      Alert.alert('Connected!', 'Your brokerage is linked. Portfolio data is loading.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [health]);

  // ── Render: loading ───────────────────────────────────────────────────────
  if (health.isChecking && health.status === 'unknown') {
    return (
      <View style={s.container}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  // ── Render: awaiting portal callback ─────────────────────────────────────
  if (awaitingCallback) {
    return (
      <View style={s.container}>
        <View style={[s.card, { borderColor: BORDER_GOLD }]}>
          <FontAwesome name="link" size={28} color={GOLD} />
          <Text style={s.cardTitle}>Complete your connection</Text>
          <Text style={s.cardSub}>
            Finish in the browser, then tap below to confirm.
          </Text>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: GOLD }, loading && s.btnDisabled]}
            onPress={handleConnectionDone}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#0A0D14" />
              : <Text style={[s.btnTxt, { color: '#0A0D14' }]}>I've Connected — Continue</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setAwaitingCallback(false)} disabled={loading}>
            <Text style={s.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: healthy ───────────────────────────────────────────────────────
  if (health.status === 'healthy') {
    const lastSync = health.lastSyncAt
      ? health.lastSyncAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null;
    return (
      <View style={s.container}>
        <View style={[s.card, { borderColor: BORDER_GREEN }]}>
          <View style={s.statusRow}>
            <View style={[s.dot, { backgroundColor: GREEN }]} />
            <Text style={[s.statusLabel, { color: GREEN }]}>Brokerage Connected</Text>
          </View>
          {lastSync && <Text style={s.syncTime}>Last synced {lastSync}</Text>}
          <Text style={s.cardSub}>Your portfolio updates automatically every night.</Text>
          <TouchableOpacity
            style={[s.btnOutline, { borderColor: BORDER_GREEN }]}
            onPress={() => health.recheck()}
            activeOpacity={0.7}
          >
            <FontAwesome name="refresh" size={12} color={MUTED} />
            <Text style={s.btnOutlineTxt}>Verify connection</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: stale ─────────────────────────────────────────────────────────
  if (health.status === 'stale') {
    const lastSync = health.lastSyncAt
      ? health.lastSyncAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : 'unknown';
    return (
      <View style={s.container}>
        <View style={[s.card, { borderColor: BORDER_AMBER }]}>
          <View style={s.statusRow}>
            <View style={[s.dot, { backgroundColor: AMBER }]} />
            <Text style={[s.statusLabel, { color: AMBER }]}>Data is stale</Text>
          </View>
          <Text style={s.cardSub}>
            Last portfolio snapshot: {lastSync}. The brokerage link exists but no recent data has been fetched.
          </Text>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: AMBER }, loading && s.btnDisabled]}
            onPress={() => handleBrokerageConnect()}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#0A0D14" />
              : <Text style={[s.btnTxt, { color: '#0A0D14' }]}>Sync Now</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: expired ───────────────────────────────────────────────────────
  if (health.status === 'expired') {
    return (
      <View style={s.container}>
        <View style={[s.card, { borderColor: BORDER_RED }]}>
          <View style={s.statusRow}>
            <View style={[s.dot, { backgroundColor: RED }]} />
            <Text style={[s.statusLabel, { color: RED }]}>Authorization expired</Text>
          </View>
          <Text style={s.cardSub}>
            Your brokerage revoked access. This happens when you change your password or the session times out. Reconnect to resume syncing.
          </Text>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: RED }, loading && s.btnDisabled]}
            onPress={() => handleBrokerageConnect()}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnTxt}>Reconnect Brokerage</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: disconnected / connect flow ───────────────────────────────────
  return (
    <View style={s.container}>
      {loading && (
        <View style={s.loaderRow}>
          <ActivityIndicator color={GOLD} />
          <Text style={s.loaderTxt}>Establishing Secure Connection…</Text>
        </View>
      )}
      <View style={s.grid}>
        <PlatformButton title="Banks & Savings" icon="bank"          color={GOLD}   onPress={() => handleBrokerageConnect()}            disabled={loading} />
        <PlatformButton title="Binance"          icon="btc"           color="#F3BA2F" onPress={() => handleBrokerageConnect('BINANCE')}  disabled={loading} />
        <PlatformButton title="Coinbase"         icon="send"          color="#0052FF" onPress={() => handleBrokerageConnect('COINBASE')} disabled={loading} />
        <PlatformButton title="Other Brokers"    icon="line-chart"    color={GOLD}   onPress={() => handleBrokerageConnect()}            disabled={loading} />
      </View>
    </View>
  );
}

function PlatformButton({
  title, icon, color, onPress, disabled,
}: { title: string; icon: any; color: string; onPress: () => void; disabled: boolean }) {
  return (
    <TouchableOpacity
      style={[s.pBtn, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={[s.iconCircle, { backgroundColor: color + '18' }]}>
        <FontAwesome name={icon} size={20} color={color} />
      </View>
      <Text style={s.pBtnText}>{title}</Text>
      <Text style={s.pBtnSub}>Connect Seamlessly</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { width: '100%', paddingVertical: 10 },

  card: {
    backgroundColor: CARD, borderRadius: 20, padding: 20,
    borderWidth: 1, gap: 10, alignItems: 'flex-start',
  },
  statusRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:        { width: 8, height: 8, borderRadius: 4 },
  statusLabel:{ fontSize: 14, fontWeight: '700' },
  syncTime:   { fontSize: 11, color: MUTED },
  cardTitle:  { color: TXT, fontSize: 16, fontWeight: '700', textAlign: 'center', alignSelf: 'center' },
  cardSub:    { color: MUTED, fontSize: 12, lineHeight: 18 },

  btn: {
    width: '100%', borderRadius: 14,
    paddingVertical: 13, alignItems: 'center', marginTop: 4,
  },
  btnDisabled: { opacity: 0.55 },
  btnTxt:      { color: '#fff', fontSize: 14, fontWeight: '700' },

  btnOutline: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 14, marginTop: 4,
  },
  btnOutlineTxt: { color: MUTED, fontSize: 12 },

  cancelBtn: { paddingVertical: 8, alignSelf: 'center' },
  cancelTxt: { color: MUTED, fontSize: 13 },

  loaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, justifyContent: 'center' },
  loaderTxt: { color: GOLD, fontSize: 12, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  pBtn: {
    backgroundColor: CARD, width: '48%', padding: 16,
    borderRadius: 20, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  iconCircle: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  pBtnText: { color: TXT, fontSize: 13, fontWeight: '700' },
  pBtnSub:  { color: MUTED, fontSize: 10, marginTop: 4 },
});

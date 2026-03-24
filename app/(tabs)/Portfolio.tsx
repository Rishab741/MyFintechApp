import { supabase } from '@/src/lib/supabase';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width } = Dimensions.get('window');

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD       = '#C9A84C';
const GOLD_LIGHT = '#E5C97A';
const GOLD_DIM   = 'rgba(201,168,76,0.12)';
const GOLD_BDR   = 'rgba(201,168,76,0.3)';
const BG         = '#0A0D14';
const CARD       = '#12161F';
const CARD2      = '#0F1319';
const BORDER     = 'rgba(255,255,255,0.07)';
const TXT        = '#F0EDE6';
const MUTED      = '#5A6070';
const SUB        = '#8A94A6';
const GREEN      = '#2ECC71';
const RED        = '#E74C3C';
const BLUE       = '#3B82F6';

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const sans  = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Position {
  symbol: string;
  description?: string;
  quantity: number;
  price: number;
  open_pnl?: number;
  currency?: string;
  type?: string;
}

interface HoldingsData {
  account?: { name?: string; number?: string };
  positions?: Position[];
  balances?: { currency?: string; cash?: number; buying_power?: number }[];
  option_positions?: any[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number, decimals = 2) =>
  n.toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtCurrency = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);

const pnlColor = (n: number) => (n > 0 ? GREEN : n < 0 ? RED : MUTED);
const pnlPrefix = (n: number) => (n > 0 ? '+' : '');

// ─── Mini sparkline (pure RN, no libs needed) ─────────────────────────────────
// Renders a simple SVG-like bar chart using Views
const MiniBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => {
  const pct = max === 0 ? 0 : Math.abs(value) / max;
  return (
    <View style={{ width: 48, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(pct * 100, 100)}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
};

// ─── Position card ────────────────────────────────────────────────────────────
const PositionCard: React.FC<{ pos: Position; maxValue: number; index: number }> = ({ pos, maxValue, index }) => {
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(12)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 400, delay: index * 60, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, tension: 80, friction: 9, delay: index * 60, useNativeDriver: true } as any),
    ]).start();
  }, []);

  const value  = pos.quantity * pos.price;
  const pnl    = pos.open_pnl ?? 0;
  const pnlPct = value > 0 ? (pnl / (value - pnl)) * 100 : 0;

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }, { scale }] }}>
      <TouchableOpacity
        style={pc.card}
        onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        activeOpacity={1}
      >
        {/* Left: symbol + name */}
        <View style={pc.left}>
          <View style={pc.symbolWrap}>
            <Text style={pc.symbolLetter}>{pos.symbol[0]}</Text>
          </View>
          <View>
            <Text style={pc.symbol}>{pos.symbol}</Text>
            <Text style={pc.desc} numberOfLines={1}>{pos.description ?? pos.type ?? 'Asset'}</Text>
          </View>
        </View>

        {/* Right: value + pnl */}
        <View style={pc.right}>
          <Text style={pc.value}>{fmtCurrency(value, pos.currency)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <MiniBar value={pnl} max={maxValue * 0.1} color={pnlColor(pnl)} />
            <Text style={[pc.pnl, { color: pnlColor(pnl) }]}>
              {pnlPrefix(pnl)}{fmt(pnlPct, 2)}%
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const pc = StyleSheet.create({
  card:       { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 8, justifyContent: 'space-between' },
  left:       { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  symbolWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: GOLD_DIM, borderWidth: 1, borderColor: GOLD_BDR, alignItems: 'center', justifyContent: 'center' },
  symbolLetter:{ color: GOLD_LIGHT, fontSize: 16, fontWeight: '700', fontFamily: serif },
  symbol:     { color: TXT, fontSize: 14, fontWeight: '700', fontFamily: serif },
  desc:       { color: MUTED, fontSize: 11, marginTop: 2, maxWidth: 120 },
  right:      { alignItems: 'flex-end' },
  value:      { color: TXT, fontSize: 14, fontWeight: '700' },
  pnl:        { fontSize: 11, fontWeight: '600' },
});

// ─── Balance card ─────────────────────────────────────────────────────────────
const BalanceCard: React.FC<{ label: string; value: number; currency: string; icon: string }> = ({ label, value, currency, icon }) => (
  <View style={bc.card}>
    <Text style={{ fontSize: 20, marginBottom: 8 }}>{icon}</Text>
    <Text style={bc.value}>{fmtCurrency(value, currency)}</Text>
    <Text style={bc.label}>{label}</Text>
  </View>
);
const bc = StyleSheet.create({
  card:  { flex: 1, backgroundColor: CARD2, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16, alignItems: 'center' },
  value: { color: TXT, fontSize: 18, fontWeight: '700', fontFamily: serif, marginBottom: 4 },
  label: { color: MUTED, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
});

// ─── Allocation bar ───────────────────────────────────────────────────────────
const AllocationBar: React.FC<{ positions: Position[] }> = ({ positions }) => {
  const total  = positions.reduce((s, p) => s + p.quantity * p.price, 0);
  if (total === 0) return null;

  // Group into top 5 + "Other"
  const sorted  = [...positions].sort((a, b) => (b.quantity * b.price) - (a.quantity * a.price));
  const top5    = sorted.slice(0, 5);
  const otherVal= sorted.slice(5).reduce((s, p) => s + p.quantity * p.price, 0);

  const COLORS  = [GOLD, BLUE, '#A855F7', '#14B8A6', '#F97316', MUTED];
  const items   = [...top5.map((p, i) => ({ label: p.symbol, value: p.quantity * p.price, color: COLORS[i] }))];
  if (otherVal > 0) items.push({ label: 'Other', value: otherVal, color: MUTED });

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 800, delay: 300, useNativeDriver: false }).start();
  }, []);

  return (
    <View style={ab.wrap}>
      <Text style={ab.heading}>Allocation</Text>
      {/* Bar */}
      <View style={ab.bar}>
        {items.map((item, i) => {
          const pct = (item.value / total) * 100;
          return (
            <Animated.View
              key={i}
              style={{
                width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${pct}%`] }),
                height: '100%',
                backgroundColor: item.color,
                borderRadius: i === 0 ? 4 : i === items.length - 1 ? 4 : 0,
              }}
            />
          );
        })}
      </View>
      {/* Legend */}
      <View style={ab.legend}>
        {items.map((item, i) => (
          <View key={i} style={ab.legendItem}>
            <View style={[ab.dot, { backgroundColor: item.color }]} />
            <Text style={ab.legendLabel}>{item.label}</Text>
            <Text style={ab.legendPct}>{((item.value / total) * 100).toFixed(1)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
};
const ab = StyleSheet.create({
  wrap:        { backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: BORDER, padding: 18, marginBottom: 16 },
  heading:     { color: MUTED, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontFamily: sans, marginBottom: 14 },
  bar:         { height: 8, borderRadius: 4, flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 16 },
  legend:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot:         { width: 7, height: 7, borderRadius: 3.5 },
  legendLabel: { color: SUB, fontSize: 11 },
  legendPct:   { color: TXT, fontSize: 11, fontWeight: '700', marginLeft: 2 },
});

// ─── Summary header card ──────────────────────────────────────────────────────
const SummaryCard: React.FC<{ totalValue: number; totalPnl: number; positions: number; currency: string }> = ({ totalValue, totalPnl, positions, currency }) => {
  const fade  = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.97)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start();
  }, [totalValue]);

  const pnlPct = totalValue > 0 ? (totalPnl / (totalValue - totalPnl)) * 100 : 0;

  return (
    <Animated.View style={[sc.card, { opacity: fade, transform: [{ scale }] }]}>
      <Text style={sc.label}>TOTAL PORTFOLIO VALUE</Text>
      <Text style={sc.total}>{fmtCurrency(totalValue, currency)}</Text>
      <View style={sc.pnlRow}>
        <View style={[sc.pnlBadge, { backgroundColor: totalPnl >= 0 ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.1)' }]}>
          <Text style={[sc.pnlTxt, { color: pnlColor(totalPnl) }]}>
            {pnlPrefix(totalPnl)}{fmtCurrency(totalPnl, currency)}  ({pnlPrefix(pnlPct)}{fmt(pnlPct, 2)}%)
          </Text>
        </View>
        <Text style={sc.positions}>{positions} positions</Text>
      </View>
    </Animated.View>
  );
};
const sc = StyleSheet.create({
  card:     { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: GOLD_BDR, padding: 24, marginBottom: 16, alignItems: 'center', shadowColor: GOLD, shadowOpacity: 0.08, shadowRadius: 24, elevation: 8 },
  label:    { color: GOLD, fontSize: 9, letterSpacing: 3, fontFamily: sans, marginBottom: 10 },
  total:    { color: TXT, fontSize: 36, fontWeight: '700', fontFamily: serif, letterSpacing: 0.5, marginBottom: 10 },
  pnlRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pnlBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  pnlTxt:   { fontSize: 13, fontWeight: '700' },
  positions:{ color: MUTED, fontSize: 12 },
});

// ─── Empty state ──────────────────────────────────────────────────────────────
const EmptyState: React.FC<{ onConnect: () => void }> = ({ onConnect }) => (
  <View style={em.wrap}>
    <Text style={em.icon}>📡</Text>
    <Text style={em.title}>No Data Yet</Text>
    <Text style={em.sub}>Connect your Binance account from the Profile screen to see live holdings here.</Text>
    <TouchableOpacity style={em.btn} onPress={onConnect}>
      <Text style={em.btnTxt}>Go to Profile</Text>
    </TouchableOpacity>
  </View>
);
const em = StyleSheet.create({
  wrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  icon:   { fontSize: 48, marginBottom: 16 },
  title:  { color: TXT, fontSize: 20, fontWeight: '700', fontFamily: serif, marginBottom: 8 },
  sub:    { color: MUTED, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btn:    { backgroundColor: GOLD_DIM, borderWidth: 1, borderColor: GOLD_BDR, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  btnTxt: { color: GOLD_LIGHT, fontSize: 14, fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function PortfolioScreen() {
  const [holdings,    setHoldings]    = useState<HoldingsData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [connected,   setConnected]   = useState(false);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check if brokerage is connected
    const { data: conn } = await supabase
      .from('snaptrade_connections')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!conn?.account_id) {
      setConnected(false);
      setLoading(false);
      return;
    }
    setConnected(true);

    // Try to load the latest snapshot from DB first (instant)
    const { data: snap } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot, captured_at')
      .eq('user_id', user.id)
      .order('captured_at', { ascending: false })
      .limit(1)
      .single();

    if (snap?.snapshot) {
      setHoldings(snap.snapshot);
      setLastUpdated(new Date(snap.captured_at));
    }

    setLoading(false);

    // Then fetch fresh data in background
    fetchFreshHoldings(user.id);
  };

  const fetchFreshHoldings = async (userId: string) => {
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('exchange-plaid-token', {
        body: { action: 'snaptrade_get_holdings', user_id: userId },
      });

      if (fnErr || !data?.holdings) {
        console.log('Holdings fetch error:', fnErr);
        return;
      }

      setHoldings(data.holdings);
      setLastUpdated(new Date());
    } catch (e) {
      console.log('Holdings fetch failed:', e);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await fetchFreshHoldings(user.id);
    setRefreshing(false);
  }, []);

  // Subscribe to real-time snapshot inserts
  useEffect(() => {
    const sub = supabase
      .channel('portfolio_realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'portfolio_snapshots',
      }, payload => {
        if (payload.new?.snapshot) {
          setHoldings(payload.new.snapshot);
          setLastUpdated(new Date(payload.new.captured_at));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, []);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const positions: Position[] = holdings?.positions ?? [];
  const balances              = holdings?.balances ?? [];
  const totalValue            = positions.reduce((s, p) => s + p.quantity * p.price, 0);
  const totalPnl              = positions.reduce((s, p) => s + (p.open_pnl ?? 0), 0);
  const currency              = balances[0]?.currency ?? 'USD';
  const cash                  = balances.reduce((s, b) => s + (b.cash ?? 0), 0);
  const buyingPower           = balances.reduce((s, b) => s + (b.buying_power ?? 0), 0);
  const maxPositionValue      = positions.reduce((m, p) => Math.max(m, p.quantity * p.price), 0);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.glow1} />
      <View style={s.glow2} />

      {/* ── Top nav bar ── */}
      <View style={s.navBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>‹</Text>
          <Text style={s.backLabel}>Profile</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>Portfolio</Text>
        <TouchableOpacity style={s.refreshBtn} onPress={onRefresh}>
          <Text style={{ fontSize: 16 }}>⟳</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={GOLD} size="large" />
          <Text style={s.loadingTxt}>Loading your portfolio…</Text>
        </View>
      ) : !connected ? (
        <EmptyState onConnect={() => router.back()} />
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
        >
          {/* Last updated */}
          {lastUpdated && (
            <Text style={s.updated}>
              Updated {lastUpdated.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}

          {/* ── Total value card ── */}
          <SummaryCard
            totalValue={totalValue + cash}
            totalPnl={totalPnl}
            positions={positions.length}
            currency={currency}
          />

          {/* ── Cash balances ── */}
          {balances.length > 0 && (
            <>
              <Text style={s.sectionLabel}>BALANCES</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <BalanceCard label="Cash"          value={cash}         currency={currency} icon="💵" />
                <BalanceCard label="Buying Power"  value={buyingPower}  currency={currency} icon="⚡" />
              </View>
            </>
          )}

          {/* ── Allocation chart ── */}
          {positions.length > 0 && <AllocationBar positions={positions} />}

          {/* ── Positions list ── */}
          {positions.length > 0 ? (
            <>
              <Text style={s.sectionLabel}>POSITIONS</Text>
              {positions.map((pos, i) => (
                <PositionCard key={`${pos.symbol}-${i}`} pos={pos} maxValue={maxPositionValue} index={i} />
              ))}
            </>
          ) : (
            <View style={s.noPositions}>
              <Text style={s.noPositionsTxt}>No positions found in this account.</Text>
              <Text style={[s.noPositionsTxt, { fontSize: 11, marginTop: 4 }]}>Pull down to refresh.</Text>
            </View>
          )}

          {/* ── Navigate to investment profile ── */}
          <TouchableOpacity style={s.profileLink} onPress={() => router.push('/two')}>
            <Text style={s.profileLinkIcon}>🎯</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.profileLinkTitle}>Investment Profile</Text>
              <Text style={s.profileLinkSub}>Manage exchanges, risk & asset classes</Text>
            </View>
            <Text style={s.profileLinkArrow}>›</Text>
          </TouchableOpacity>

          <View style={s.wordmark}>
            <Text style={s.wordmarkTxt}>◈ VESTARA · LIVE DATA</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: BG },
  glow1:       { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(201,168,76,0.04)', top: -60, right: -60 },
  glow2:       { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(59,130,246,0.03)', bottom: 80, left: -60 },

  navBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: Platform.OS === 'ios' ? 58 : 36, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backArrow:   { color: GOLD, fontSize: 26, lineHeight: 28 },
  backLabel:   { color: GOLD, fontSize: 15, fontWeight: '600' },
  navTitle:    { color: TXT, fontSize: 17, fontWeight: '700', fontFamily: serif },
  refreshBtn:  { padding: 4 },

  scroll:      { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 48 },
  updated:     { color: MUTED, fontSize: 11, textAlign: 'center', marginBottom: 12 },
  sectionLabel:{ color: MUTED, fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase', fontFamily: sans, marginBottom: 10 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingTxt:  { color: MUTED, fontSize: 14 },

  noPositions:    { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16 },
  noPositionsTxt: { color: MUTED, fontSize: 13, textAlign: 'center' },

  profileLink:      { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)', padding: 16, gap: 12, marginTop: 8, marginBottom: 16 },
  profileLinkIcon:  { fontSize: 20 },
  profileLinkTitle: { color: TXT, fontSize: 14, fontWeight: '700', fontFamily: serif },
  profileLinkSub:   { color: MUTED, fontSize: 11, marginTop: 2 },
  profileLinkArrow: { color: BLUE, fontSize: 22 },

  wordmark:    { alignItems: 'center', marginTop: 16 },
  wordmarkTxt: { color: 'rgba(201,168,76,0.2)', fontSize: 10, letterSpacing: 3, fontFamily: serif },
});
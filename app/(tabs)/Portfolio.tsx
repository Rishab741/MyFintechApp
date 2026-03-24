import { supabase } from '@/src/lib/supabase';
import { useConnectionStore } from '@/src/store/useConnectionStore';
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

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG      = '#0B0F1A';
const CARD    = '#131929';
const CARD2   = '#0F1520';
const BORDER  = 'rgba(255,255,255,0.07)';
const GOLD    = '#C9A84C';
const GOLD_L  = '#E5C97A';
const GOLD_D  = 'rgba(201,168,76,0.12)';
const GOLD_B  = 'rgba(201,168,76,0.3)';
const BLUE    = '#3B82F6';
const BLUE_D  = 'rgba(59,130,246,0.15)';
const GREEN   = '#22C55E';
const GREEN_D = 'rgba(34,197,94,0.12)';
const RED     = '#EF4444';
const RED_D   = 'rgba(239,68,68,0.1)';
const TXT     = '#F0EDE6';
const MUTED   = '#5A6070';
const SUB     = '#8A94A6';

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const sans  = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SnapTradeSymbol {
    id?: string;
    raw_symbol?: string;
    symbol?: any;
    description?: string;
    currency?: any;
    [key: string]: any;
}

interface Position {
    symbol: string | SnapTradeSymbol;
    units?: number;
    quantity?: number;
    price?: number;
    open_pnl?: number;
    fractional_units?: number;
    currency?: any;
    description?: string;
    type?: string;
}

interface Balance {
    currency?: any;
    cash?: number;
    buying_power?: number;
}

interface HoldingsData {
    account?: { name?: string; number?: string };
    positions?: Position[];
    balances?: Balance[];
}

interface Snapshot {
    snapshot: HoldingsData;
    captured_at: string;
}

// ─── Data helpers ─────────────────────────────────────────────────────────────
const getUnits = (p: Position) => p.units ?? p.quantity ?? 0;

const getTicker = (symbol: any): string => {
    if (!symbol) return '???';
    if (typeof symbol === 'string') return symbol;
    if (typeof symbol === 'object') {
        if (typeof symbol.raw_symbol === 'string' && symbol.raw_symbol) return symbol.raw_symbol;
        if (typeof symbol.symbol === 'string' && symbol.symbol) return symbol.symbol;
        if (typeof symbol.symbol === 'object') return getTicker(symbol.symbol);
        if (typeof symbol.id === 'string') return symbol.id;
    }
    return 'Asset';
};

const getCurrency = (raw: any): string => {
    if (!raw) return 'USD';
    if (typeof raw === 'string') return raw.length >= 3 ? raw : 'USD';
    if (typeof raw === 'object') return raw.code || raw.id || 'USD';
    return 'USD';
};

const fmtCurrency = (n: number, currency: any = 'USD') => {
    let c = getCurrency(currency).toUpperCase();
    if (c === 'USDT' || c === 'USDC') c = 'USD';
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(n);
    } catch {
        return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
};

const fmt2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sign = (n: number) => (n >= 0 ? '+' : '');

// ─── Mini SVG-style line chart (pure RN, no dependencies) ────────────────────
const TrendLine: React.FC<{ values: number[]; color: string; width?: number; height?: number }> = ({
    values, color, width: w = 280, height: h = 80,
}) => {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: false }).start();
    }, [values.length]);

    if (values.length < 2) {
        return <View style={{ width: w, height: h, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: MUTED, fontSize: 11 }}>Not enough data yet</Text>
        </View>;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = 8;

    const points = values.map((v, i) => ({
        x: pad + (i / (values.length - 1)) * (w - pad * 2),
        y: h - pad - ((v - min) / range) * (h - pad * 2),
    }));

    // Render connected line segments as thin rotated views
    const segments = points.slice(0, -1).map((p1, i) => {
        const p2 = points[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return { x: p1.x, y: p1.y, len, angle };
    });

    return (
        <View style={{ width: w, height: h }}>
            {segments.map((seg, i) => (
                <View
                    key={i}
                    style={{
                        position: 'absolute',
                        left: seg.x,
                        top: seg.y - 1,
                        width: seg.len,
                        height: 2,
                        backgroundColor: color,
                        borderRadius: 1,
                        transform: [{ rotate: `${seg.angle}deg` }, { translateX: seg.len / 2 - seg.len / 2 }],
                        transformOrigin: '0 50%',
                        opacity: 0.9,
                    }}
                />
            ))}
            {/* End dot */}
            <View style={{
                position: 'absolute',
                left: points[points.length - 1].x - 4,
                top: points[points.length - 1].y - 4,
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: color,
                shadowColor: color, shadowOpacity: 0.8, shadowRadius: 6,
            }} />
        </View>
    );
};

// ─── X-axis labels for chart ──────────────────────────────────────────────────
const ChartAxisLabels: React.FC<{ labels: string[] }> = ({ labels }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginTop: 6 }}>
        {labels.map((l, i) => <Text key={i} style={{ color: MUTED, fontSize: 10, fontFamily: sans }}>{l}</Text>)}
    </View>
);

// ─── Holding row card ─────────────────────────────────────────────────────────
const HoldingCard: React.FC<{ pos: Position; totalValue: number; index: number }> = ({ pos, totalValue, index }) => {
    const fade  = useRef(new Animated.Value(0)).current;
    const slide = useRef(new Animated.Value(16)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade,  { toValue: 1, duration: 400, delay: index * 70, useNativeDriver: true }),
            Animated.spring(slide, { toValue: 0, tension: 80, friction: 9, delay: index * 70, useNativeDriver: true } as any),
        ]).start();
    }, []);

    const ticker   = getTicker(pos.symbol);
    const units    = getUnits(pos);
    const price    = pos.price ?? 0;
    const value    = units * price;
    const pnl      = pos.open_pnl ?? 0;
    const allocPct = totalValue > 0 ? (value / totalValue) * 100 : 0;
    // Use open_pnl % if available, otherwise show allocation %
    const hasPnl   = pnl !== 0;
    const displayPct = hasPnl
        ? (value > 0 ? (pnl / (value - pnl)) * 100 : 0)
        : allocPct;
    const pctColor = hasPnl ? (pnl >= 0 ? GREEN : RED) : GOLD;
    const pctLabel = hasPnl ? `${sign(displayPct)}${fmt2(displayPct)}%` : `${fmt2(allocPct)}% of portfolio`;

    // Category icon color
    const TICKER_COLORS: Record<string, string> = {
        BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF', BNB: '#F3BA2F',
        ADA: '#0033AD', XRP: '#346AA9', DOGE: '#C3A634', DOT: '#E6007A',
        MATIC: '#8247E5', AVAX: '#E84142',
    };
    const iconColor = TICKER_COLORS[ticker] ?? GOLD;

    return (
        <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
            <View style={hc.card}>
                <View style={[hc.iconWrap, { backgroundColor: iconColor + '22', borderColor: iconColor + '44' }]}>
                    <Text style={[hc.iconTxt, { color: iconColor }]}>{ticker[0]}</Text>
                </View>
                <View style={hc.mid}>
                    <Text style={hc.ticker}>{ticker}</Text>
                    <Text style={hc.sub}>{units.toFixed(units < 1 ? 6 : 4)} units · {fmtCurrency(price, pos.currency)}</Text>
                </View>
                <View style={hc.right}>
                    <Text style={hc.value}>{fmtCurrency(value, pos.currency)}</Text>
                    <View style={[hc.badge, { backgroundColor: hasPnl ? (pnl >= 0 ? GREEN_D : RED_D) : GOLD_D }]}>
                        <Text style={[hc.pct, { color: pctColor }]}>{pctLabel}</Text>
                    </View>
                </View>
            </View>
        </Animated.View>
    );
};

const hc = StyleSheet.create({
    card:    { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 10, gap: 12 },
    iconWrap:{ width: 46, height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    iconTxt: { fontSize: 18, fontWeight: '700', fontFamily: serif },
    mid:     { flex: 1 },
    ticker:  { color: TXT, fontSize: 15, fontWeight: '700', fontFamily: serif },
    sub:     { color: MUTED, fontSize: 11, marginTop: 3 },
    right:   { alignItems: 'flex-end', gap: 5 },
    value:   { color: TXT, fontSize: 15, fontWeight: '700' },
    badge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    pct:     { fontSize: 11, fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function PortfolioScreen() {
    const [holdings,     setHoldings]     = useState<HoldingsData | null>(null);
    const [snapshots,    setSnapshots]    = useState<Snapshot[]>([]);
    const [loading,      setLoading]      = useState(true);
    const [refreshing,   setRefreshing]   = useState(false);
    const [connected,    setConnected]    = useState(false);
    const [userName,     setUserName]     = useState('');
    const [lastUpdated,  setLastUpdated]  = useState<Date | null>(null);

    const { brokerageConnected } = useConnectionStore();

    const init = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Display name from metadata or email prefix
        const meta = user.user_metadata;
        setUserName(meta?.full_name ?? meta?.name ?? user.email?.split('@')[0] ?? 'Investor');

        const { data: conn } = await supabase
            .from('snaptrade_connections')
            .select('account_id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (!conn?.account_id) { setConnected(false); setLoading(false); return; }
        setConnected(true);

        // Load latest snapshot from DB instantly
        const { data: latestSnap } = await supabase
            .from('portfolio_snapshots')
            .select('snapshot, captured_at')
            .eq('user_id', user.id)
            .order('captured_at', { ascending: false })
            .limit(1)
            .single();

        if (latestSnap?.snapshot) {
            setHoldings(latestSnap.snapshot as HoldingsData);
            setLastUpdated(new Date(latestSnap.captured_at));
        }

        // Load last 20 snapshots for performance chart
        const { data: histSnaps } = await supabase
            .from('portfolio_snapshots')
            .select('snapshot, captured_at')
            .eq('user_id', user.id)
            .order('captured_at', { ascending: true })
            .limit(20);

        if (histSnaps) setSnapshots(histSnaps as Snapshot[]);

        setLoading(false);

        // Fetch fresh live data in background
        fetchFreshHoldings(user.id);
    }, []);

    useEffect(() => { init(); }, [init]);
    useEffect(() => { if (brokerageConnected && !connected) init(); }, [brokerageConnected]);

    const fetchFreshHoldings = async (userId: string) => {
        try {
            const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
                body: { action: 'snaptrade_get_holdings', user_id: userId },
            });
            if (!error && data?.holdings) {
                setHoldings(data.holdings);
                setLastUpdated(new Date());
            }
        } catch (e) { console.log('Holdings fetch failed:', e); }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await fetchFreshHoldings(user.id);
        setRefreshing(false);
    }, []);

    // Real-time snapshot updates
    useEffect(() => {
        const sub = supabase
            .channel('portfolio_rt')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portfolio_snapshots' }, payload => {
                if (payload.new?.snapshot) {
                    setHoldings(payload.new.snapshot as HoldingsData);
                    setLastUpdated(new Date(payload.new.captured_at));
                    setSnapshots(prev => [...prev.slice(-19), payload.new as Snapshot]);
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(sub); };
    }, []);

    // 5-minute background refresh
    useEffect(() => {
        if (!connected) return;
        const poll = setInterval(async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) fetchFreshHoldings(user.id);
        }, 5 * 60 * 1000);
        return () => clearInterval(poll);
    }, [connected]);

    // ── Derived data ──────────────────────────────────────────────────────────
    const positions: Position[] = holdings?.positions ?? [];
    const balances:  Balance[]  = holdings?.balances  ?? [];
    const currency = getCurrency(balances[0]?.currency);
    const cash     = balances.reduce((s, b) => s + (b.cash ?? 0), 0);

    const totalPositionsValue = positions.reduce((s, p) => s + getUnits(p) * (p.price ?? 0), 0);
    const totalValue = totalPositionsValue + cash;
    const totalPnl   = positions.reduce((s, p) => s + (p.open_pnl ?? 0), 0);

    // Performance chart values (total value per snapshot)
    const chartValues = snapshots.map(s => {
        const pos = s.snapshot?.positions ?? [];
        const bal = s.snapshot?.balances  ?? [];
        const posVal = pos.reduce((sum, p) => sum + getUnits(p) * (p.price ?? 0), 0);
        const cashVal = bal.reduce((sum, b) => sum + (b.cash ?? 0), 0);
        return posVal + cashVal;
    }).filter(v => v > 0);

    // Chart axis month labels
    const chartLabels = (() => {
        if (snapshots.length < 2) return [];
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const first = new Date(snapshots[0].captured_at);
        const last  = new Date(snapshots[snapshots.length - 1].captured_at);
        const mid   = new Date((first.getTime() + last.getTime()) / 2);
        return [months[first.getMonth()], months[mid.getMonth()], months[last.getMonth()]];
    })();

    // Today's change (last snapshot vs previous)
    const todayChange = chartValues.length >= 2
        ? chartValues[chartValues.length - 1] - chartValues[chartValues.length - 2]
        : 0;
    const todayChangePct = chartValues.length >= 2 && chartValues[chartValues.length - 2] > 0
        ? (todayChange / chartValues[chartValues.length - 2]) * 100
        : 0;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />

            {/* ── Header ── */}
            <View style={s.header}>
                <View style={s.avatarWrap}>
                    <Text style={s.avatarTxt}>{(userName[0] ?? 'U').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={s.premiumLabel}>PREMIUM MEMBER</Text>
                    <Text style={s.userName}>{userName}</Text>
                </View>
                <TouchableOpacity style={s.iconBtn} onPress={onRefresh}>
                    <Text style={{ fontSize: 18, color: SUB }}>⟳</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={s.loadingWrap}>
                    <ActivityIndicator color={GOLD} size="large" />
                    <Text style={s.loadingTxt}>Loading portfolio…</Text>
                </View>
            ) : !connected ? (
                <View style={s.emptyWrap}>
                    <Text style={{ fontSize: 48, marginBottom: 16 }}>📡</Text>
                    <Text style={s.emptyTitle}>No Account Connected</Text>
                    <Text style={s.emptySub}>Connect your Binance or brokerage account from the Profile screen.</Text>
                    <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()}>
                        <Text style={s.emptyBtnTxt}>Go to Profile</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={s.scroll}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
                >
                    {/* ── Net Worth Card ── */}
                    <View style={s.netWorthCard}>
                        <View style={s.netWorthTop}>
                            <Text style={s.netWorthLabel}>Total Net Worth</Text>
                            <View style={[s.changeBadge, { backgroundColor: todayChangePct >= 0 ? GREEN_D : RED_D }]}>
                                <Text style={[s.changeBadgeTxt, { color: todayChangePct >= 0 ? GREEN : RED }]}>
                                    {todayChangePct >= 0 ? '↗' : '↘'} {sign(todayChangePct)}{fmt2(Math.abs(todayChangePct))}%
                                </Text>
                            </View>
                        </View>
                        <Text style={s.netWorthValue}>{fmtCurrency(totalValue, currency)}</Text>
                        <View style={s.netWorthBottom}>
                            <Text style={[s.todayChange, { color: todayChange >= 0 ? GREEN : RED }]}>
                                {sign(todayChange)}{fmtCurrency(Math.abs(todayChange), currency)} today
                            </Text>
                            <TouchableOpacity style={s.detailsBtn} onPress={() => router.push('/(tabs)/two' as any)}>
                                <Text style={s.detailsBtnTxt}>View Details</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ── Performance Chart ── */}
                    <View style={s.chartCard}>
                        <View style={s.chartHeader}>
                            <Text style={s.chartTitle}>Performance Trend</Text>
                            {lastUpdated && (
                                <Text style={s.chartSub}>
                                    Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            )}
                        </View>
                        {chartValues.length >= 2 ? (
                            <>
                                <Text style={s.chartPct}>
                                    <Text style={{ color: todayChangePct >= 0 ? GREEN : RED }}>
                                        {sign(todayChangePct)}{fmt2(todayChangePct)}%
                                    </Text>
                                    <Text style={{ color: MUTED, fontSize: 12 }}> vs last snapshot</Text>
                                </Text>
                                <TrendLine
                                    values={chartValues}
                                    color={todayChangePct >= 0 ? GREEN : RED}
                                    width={width - 72}
                                    height={90}
                                />
                                {chartLabels.length > 0 && <ChartAxisLabels labels={chartLabels} />}
                            </>
                        ) : (
                            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                                <Text style={{ color: MUTED, fontSize: 12 }}>Chart builds up after a few refreshes</Text>
                            </View>
                        )}
                    </View>

                    {/* ── Holdings ── */}
                    <View style={s.sectionHeader}>
                        <Text style={s.sectionTitle}>Holdings</Text>
                        <Text style={s.sectionCount}>{positions.length} assets</Text>
                    </View>

                    {positions.length > 0 ? (
                        positions.map((pos, i) => (
                            <HoldingCard
                                key={`${getTicker(pos.symbol)}-${i}`}
                                pos={pos}
                                totalValue={totalPositionsValue}
                                index={i}
                            />
                        ))
                    ) : (
                        <View style={s.noPositions}>
                            <Text style={{ color: MUTED, fontSize: 13, textAlign: 'center' }}>
                                No positions found. Pull to refresh.
                            </Text>
                        </View>
                    )}

                    {/* ── Cash Balance ── */}
                    {cash > 0 && (
                        <View style={s.cashCard}>
                            <Text style={{ fontSize: 20 }}>💵</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={s.cashLabel}>Cash Balance</Text>
                                <Text style={s.cashSub}>Available in account</Text>
                            </View>
                            <Text style={s.cashValue}>{fmtCurrency(cash, currency)}</Text>
                        </View>
                    )}

                    {/* ── P&L Summary (only when PnL data is available) ── */}
                    {totalPnl !== 0 && (
                        <View style={[s.pnlBanner, { backgroundColor: totalPnl >= 0 ? GREEN_D : RED_D, borderColor: totalPnl >= 0 ? GREEN + '33' : RED + '33' }]}>
                            <Text style={[s.pnlBannerTxt, { color: totalPnl >= 0 ? GREEN : RED }]}>
                                Open P&L  {sign(totalPnl)}{fmtCurrency(totalPnl, currency)}
                            </Text>
                        </View>
                    )}

                    <View style={s.wordmark}>
                        <Text style={s.wordmarkTxt}>◈ VESTARA · LIVE DATA</Text>
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root:        { flex: 1, backgroundColor: BG },

    header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 58 : 42, paddingBottom: 16, gap: 12 },
    avatarWrap:  { width: 44, height: 44, borderRadius: 22, backgroundColor: BLUE_D, borderWidth: 1.5, borderColor: BLUE + '66', alignItems: 'center', justifyContent: 'center' },
    avatarTxt:   { color: BLUE, fontSize: 18, fontWeight: '700', fontFamily: serif },
    premiumLabel:{ color: GOLD, fontSize: 9, letterSpacing: 2, fontFamily: sans, marginBottom: 2 },
    userName:    { color: TXT, fontSize: 16, fontWeight: '700', fontFamily: serif },
    iconBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },

    scroll:      { paddingHorizontal: 20, paddingBottom: 40 },

    // Net Worth
    netWorthCard: { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: GOLD_B, padding: 22, marginBottom: 16, shadowColor: GOLD, shadowOpacity: 0.06, shadowRadius: 20, elevation: 6 },
    netWorthTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    netWorthLabel:{ color: SUB, fontSize: 13, fontFamily: sans },
    changeBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    changeBadgeTxt:{ fontSize: 12, fontWeight: '700' },
    netWorthValue:{ color: TXT, fontSize: 34, fontWeight: '700', fontFamily: serif, letterSpacing: 0.5, marginBottom: 12 },
    netWorthBottom:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    todayChange:  { fontSize: 13, fontWeight: '600' },
    detailsBtn:   { backgroundColor: BLUE, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
    detailsBtnTxt:{ color: '#fff', fontSize: 13, fontWeight: '700' },

    // Chart
    chartCard:   { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 20, marginBottom: 16 },
    chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    chartTitle:  { color: TXT, fontSize: 15, fontWeight: '700', fontFamily: serif },
    chartSub:    { color: MUTED, fontSize: 11 },
    chartPct:    { fontSize: 22, fontWeight: '700', fontFamily: serif, marginBottom: 14 },

    // Section
    sectionHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 4 },
    sectionTitle: { color: TXT, fontSize: 16, fontWeight: '700', fontFamily: serif },
    sectionCount: { color: MUTED, fontSize: 12 },

    noPositions:  { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 12 },

    // Cash
    cashCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 12, marginBottom: 12 },
    cashLabel:   { color: TXT, fontSize: 14, fontWeight: '700' },
    cashSub:     { color: MUTED, fontSize: 11, marginTop: 2 },
    cashValue:   { color: TXT, fontSize: 15, fontWeight: '700' },

    // P&L banner
    pnlBanner:   { borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', marginBottom: 12 },
    pnlBannerTxt:{ fontSize: 14, fontWeight: '700' },

    // Loading / empty
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
    loadingTxt:  { color: MUTED, fontSize: 14 },
    emptyWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
    emptyTitle:  { color: TXT, fontSize: 20, fontWeight: '700', fontFamily: serif },
    emptySub:    { color: MUTED, fontSize: 13, textAlign: 'center', lineHeight: 20, marginVertical: 8 },
    emptyBtn:    { backgroundColor: GOLD_D, borderWidth: 1, borderColor: GOLD_B, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
    emptyBtnTxt: { color: GOLD_L, fontSize: 14, fontWeight: '700' },

    wordmark:    { alignItems: 'center', marginTop: 20 },
    wordmarkTxt: { color: 'rgba(201,168,76,0.2)', fontSize: 10, letterSpacing: 3, fontFamily: serif },
});

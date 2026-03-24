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
interface SnapTradeSymbol {
    id?: string;
    type?: string;
    symbol?: string;
    raw_symbol?: string;
    currency?: any;
    exchange?: any;
    logo_url?: string;
    description?: string;
    [key: string]: any; // Catch-all for remaining keys in the error log
}

interface Position {
    symbol: string | SnapTradeSymbol;
    description?: string;
    units?: number;       // SnapTrade's actual field name
    quantity?: number;    // fallback
    price: number;
    open_pnl?: number;
    fractional_units?: number;
    currency?: string;
    type?: string;
}

// SnapTrade uses "units" not "quantity"
const getUnits = (pos: Position): number => pos.units ?? pos.quantity ?? 0;

interface Balance {
    currency?: string;
    cash?: number;
    buying_power?: number;
}

interface HoldingsData {
    account?: { name?: string; number?: string };
    positions?: Position[];
    balances?: Balance[];
    option_positions?: any[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number, decimals = 2) =>
    n.toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const pnlPrefix = (value: number): string => value >= 0 ? '+' : '';

const pnlColor = (value: number): string => {
    if (value > 0) return GREEN;
    if (value < 0) return RED;
    return MUTED;
};

/**
 * ✅ CRITICAL FIX: The "React Child Object" Error
 * This function extracts a safe string from the symbol data.
 */
const getTicker = (symbol: any): string => {
    if (!symbol) return '???';
    if (typeof symbol === 'string') return symbol;
    if (typeof symbol === 'object') {
        // raw_symbol is always a plain string in SnapTrade's response
        if (typeof symbol.raw_symbol === 'string' && symbol.raw_symbol) return symbol.raw_symbol;
        // symbol.symbol can be a nested object — recurse once
        if (typeof symbol.symbol === 'string' && symbol.symbol) return symbol.symbol;
        if (typeof symbol.symbol === 'object') return getTicker(symbol.symbol);
        if (typeof symbol.id === 'string' && symbol.id) return symbol.id;
    }
    return 'Asset';
};

const getCurrency = (raw: any): string => {
    if (!raw) return 'USD';
    if (typeof raw === 'string') return raw;
    // SnapTrade currency object: { id: "USD", code: "USD", ... }
    if (typeof raw === 'object') return raw.code || raw.id || 'USD';
    return 'USD';
};

const fmtCurrency = (n: number, currency: any = 'USD') => {
    let safeCurrency = getCurrency(currency).toUpperCase();
    if (safeCurrency === 'USDT' || safeCurrency === 'USDC') safeCurrency = 'USD';

    try {
        return new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency: safeCurrency,
            maximumFractionDigits: 2
        }).format(n);
    } catch (e) {
        return `${safeCurrency} ${n.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
    }
};

// ─── UI Components ───────────────────────────────────────────────────────────
const MiniBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => {
    const barWidth = max > 0 ? Math.min(Math.abs(value) / max * 100, 100) : 0;
    return (
        <View style={{ width: 30, height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ width: `${barWidth}%`, height: '100%', backgroundColor: color }} />
        </View>
    );
};

const PositionCard: React.FC<{ pos: Position; maxValue: number; index: number }> = ({ pos, maxValue, index }) => {
    const fade  = useRef(new Animated.Value(0)).current;
    const slide = useRef(new Animated.Value(12)).current;
    const scale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade,  { toValue: 1, duration: 400, delay: index * 40, useNativeDriver: true }),
            Animated.spring(slide, { toValue: 0, tension: 80, friction: 9, delay: index * 40, useNativeDriver: true }),
        ]).start();
    }, [index]);

    const ticker = getTicker(pos.symbol);
    const value  = getUnits(pos) * (pos.price || 0);
    const pnl    = pos.open_pnl ?? 0;
    const cost   = value - pnl;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;

    return (
        <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }, { scale }] }}>
            <TouchableOpacity
                style={pc.card}
                onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start()}
                onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
                activeOpacity={1}
            >
                <View style={pc.left}>
                    <View style={pc.symbolWrap}>
                        <Text style={pc.symbolLetter}>{ticker[0]}</Text>
                    </View>
                    <View>
                        <Text style={pc.symbol}>{ticker}</Text>
                        <Text style={pc.desc} numberOfLines={1}>{pos.description ?? pos.type ?? 'Asset'}</Text>
                    </View>
                </View>

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

const AllocationBar: React.FC<{ positions: Position[] }> = ({ positions }) => {
    const total = positions.reduce((s, p) => s + (getUnits(p) * p.price), 0);
    if (total <= 0) return null;

    const sorted  = [...positions].sort((a, b) => ((getUnits(b) * b.price) - (getUnits(a) * a.price)));
    const top5    = sorted.slice(0, 5);
    const otherVal= sorted.slice(5).reduce((s, p) => s + (getUnits(p) * p.price), 0);

    const COLORS  = [GOLD, BLUE, '#A855F7', '#14B8A6', '#F97316', MUTED];
    const items   = [...top5.map((p, i) => ({ label: getTicker(p.symbol), value: getUnits(p) * p.price, color: COLORS[i] }))];
    if (otherVal > 0) items.push({ label: 'Other', value: otherVal, color: MUTED });

    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(anim, { toValue: 1, duration: 800, delay: 300, useNativeDriver: false }).start();
    }, []);

    return (
        <View style={ab.wrap}>
            <Text style={ab.heading}>Allocation</Text>
            <View style={ab.bar}>
                {items.map((item, i) => {
                    const rawPct = (item.value / total) * 100;
                    const pct = isFinite(rawPct) ? rawPct : 0;
                    return (
                        <Animated.View
                            key={`bar-${i}`}
                            style={{
                                width: anim.interpolate({ 
                                    inputRange: [0, 1], 
                                    outputRange: ['0%', `${pct}%`] 
                                }),
                                height: '100%',
                                backgroundColor: item.color,
                            }}
                        />
                    );
                })}
            </View>
            <View style={ab.legend}>
                {items.map((item, i) => (
                    <View key={`leg-${i}`} style={ab.legendItem}>
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
    wrap:         { backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: BORDER, padding: 18, marginBottom: 16 },
    heading:      { color: MUTED, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontFamily: sans, marginBottom: 14 },
    bar:          { height: 8, borderRadius: 4, flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 16 },
    legend:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot:          { width: 7, height: 7, borderRadius: 3.5 },
    legendLabel:  { color: SUB, fontSize: 11 },
    legendPct:    { color: TXT, fontSize: 11, fontWeight: '700', marginLeft: 2 },
});

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
    card:     { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: GOLD_BDR, padding: 24, marginBottom: 16, alignItems: 'center' },
    label:    { color: GOLD, fontSize: 9, letterSpacing: 3, fontFamily: sans, marginBottom: 10 },
    total:    { color: TXT, fontSize: 36, fontWeight: '700', fontFamily: serif, letterSpacing: 0.5, marginBottom: 10 },
    pnlRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
    pnlBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
    pnlTxt:   { fontSize: 13, fontWeight: '700' },
    positions:{ color: MUTED, fontSize: 12 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function PortfolioScreen() {
    const [holdings,    setHoldings]    = useState<HoldingsData | null>(null);
    const [loading,     setLoading]     = useState(true);
    const [refreshing,  setRefreshing]  = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [connected,   setConnected]   = useState(false);

    const { brokerageConnected } = useConnectionStore();
    
    const init = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

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

        const { data: snap } = await supabase
            .from('portfolio_snapshots')
            .select('snapshot, captured_at')
            .eq('user_id', user.id)
            .order('captured_at', { ascending: false })
            .limit(1)
            .single();

        if (snap?.snapshot) {
            setHoldings(snap.snapshot as HoldingsData);
            setLastUpdated(new Date(snap.captured_at));
        }

        setLoading(false);
        fetchFreshHoldings(user.id);
    }, []);

    useEffect(() => {
        if (brokerageConnected && !connected) init();
    }, [brokerageConnected, connected, init]);

    useEffect(() => { init(); }, [init]);

    const fetchFreshHoldings = async (userId: string) => {
        try {
            const { data, error: fnErr } = await supabase.functions.invoke('exchange-plaid-token', {
                body: { action: 'snaptrade_get_holdings', user_id: userId },
            });

            if (!fnErr && data?.holdings) {
                setHoldings(data.holdings);
                setLastUpdated(new Date());
            }
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

    useEffect(() => {
        const sub = supabase
            .channel('portfolio_realtime')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'portfolio_snapshots',
            }, payload => {
                if (payload.new?.snapshot) {
                    setHoldings(payload.new.snapshot as HoldingsData);
                    setLastUpdated(new Date(payload.new.captured_at));
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(sub); };
    }, []);

    const positions: Position[] = holdings?.positions ?? [];
    const balances: Balance[]   = holdings?.balances ?? [];
    const totalValue            = positions.reduce((s, p) => s + (getUnits(p) * p.price), 0);
    const totalPnl              = positions.reduce((s, p) => s + (p.open_pnl ?? 0), 0);
    
    const currency = getCurrency(balances[0]?.currency);

    const cash                  = balances.reduce((s, b) => s + (b.cash ?? 0), 0);
    const buyingPower           = balances.reduce((s, b) => s + (b.buying_power ?? 0), 0);
    const maxPositionValue      = positions.reduce((m, p) => Math.max(m, getUnits(p) * p.price), 0);

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={s.navBar}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Text style={s.backArrow}>‹</Text>
                    <Text style={s.backLabel}>Profile</Text>
                </TouchableOpacity>
                <Text style={s.navTitle}>Portfolio</Text>
                <TouchableOpacity style={s.refreshBtn} onPress={onRefresh}>
                    <Text style={{ fontSize: 16, color: GOLD }}>⟳</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={s.loadingWrap}>
                    <ActivityIndicator color={GOLD} size="large" />
                </View>
            ) : !connected ? (
                <View style={s.emptyWrap}>
                    <Text style={s.emptyTitle}>No Connection</Text>
                    <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()}>
                        <Text style={s.emptyBtnTxt}>Connect Account</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView 
                    contentContainerStyle={s.scroll}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
                >
                    <SummaryCard totalValue={totalValue + cash} totalPnl={totalPnl} positions={positions.length} currency={currency} />
                    
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                        <BalanceCard label="Cash" value={cash} currency={currency} icon="💵" />
                        <BalanceCard label="Power" value={buyingPower} currency={currency} icon="⚡" />
                    </View>

                    {positions.length > 0 && <AllocationBar positions={positions} />}

                    {positions.length > 0 ? (
                        positions.map((pos, i) => (
                            <PositionCard key={`${getTicker(pos.symbol)}-${i}`} pos={pos} maxValue={maxPositionValue} index={i} />
                        ))
                    ) : (
                        <Text style={{ color: MUTED, textAlign: 'center', marginTop: 20 }}>No positions found.</Text>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root:         { flex: 1, backgroundColor: BG },
    navBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 50, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
    backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
    backArrow:    { color: GOLD, fontSize: 26 },
    backLabel:    { color: GOLD, fontSize: 15, fontWeight: '600' },
    navTitle:     { color: TXT, fontSize: 17, fontWeight: '700', fontFamily: serif },
    refreshBtn:   { padding: 4 },
    scroll:       { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 48 },
    loadingWrap:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyWrap:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptyTitle:   { color: TXT, fontSize: 18, marginBottom: 20 },
    emptyBtn:     { backgroundColor: GOLD, padding: 12, borderRadius: 10 },
    emptyBtnTxt:  { color: BG, fontWeight: '700' },
});
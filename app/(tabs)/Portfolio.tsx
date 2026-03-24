/**
 * portfolio.tsx — Vestara Portfolio Dashboard
 * Aesthetic: Luxury Terminal — obsidian depth, gold hairlines, monospaced data, serif headlines
 * Charts: Pure RN SVG-via-View (no external libs) — Pie, Line, Histogram, Allocation Bar
 */

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
const CHART_W   = width - 48;

// ─── Design tokens — Luxury Terminal ─────────────────────────────────────────
const BG       = '#080B12';        // deep obsidian
const BG2      = '#0C1018';        // slightly lifted
const CARD     = '#0F1520';        // card surface
const CARD2    = '#131C2B';        // raised card
const GLASS    = 'rgba(255,255,255,0.025)';
const BORDER   = 'rgba(255,255,255,0.06)';
const BORDER2  = 'rgba(255,255,255,0.1)';
const GOLD     = '#C9A84C';
const GOLD_L   = '#E8CC7A';
const GOLD_D   = 'rgba(201,168,76,0.1)';
const GOLD_B   = 'rgba(201,168,76,0.25)';
const GOLD_G   = 'rgba(201,168,76,0.06)';  // subtle gold glow bg
const BLUE     = '#4F9EF8';
const BLUE_D   = 'rgba(79,158,248,0.12)';
const GREEN    = '#34D399';
const GREEN_D  = 'rgba(52,211,153,0.1)';
const RED      = '#F87171';
const RED_D    = 'rgba(248,113,113,0.1)';
const PURPLE   = '#C084FC';
const PURPLE_D = 'rgba(192,132,252,0.12)';
const ORANGE   = '#FB923C';
const ORANGE_D = 'rgba(251,146,60,0.1)';
const TEAL     = '#2DD4BF';
const TXT      = '#EEE8DC';
const TXT2     = '#B8B2A8';
const MUTED    = '#4A5468';
const SUB      = '#7A8494';

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const mono  = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
const sans  = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Position {
    symbol: any; units?: number; quantity?: number;
    price?: number; open_pnl?: number; currency?: any;
    description?: string; type?: string;
}
interface Balance { currency?: any; cash?: number; buying_power?: number; }
interface HoldingsData {
    account?: { name?: string; number?: string };
    positions?: Position[]; balances?: Balance[];
}
interface Snapshot { snapshot: HoldingsData; captured_at: string; }
type Period = '1W' | '1M' | '3M' | 'ALL';

// ─── S&P 500 reference data ───────────────────────────────────────────────────
const SP500: Record<string, number> = {
    '2023-10': 4194, '2023-11': 4568, '2023-12': 4769,
    '2024-01': 4845, '2024-02': 5137, '2024-03': 5254, '2024-04': 5035,
    '2024-05': 5277, '2024-06': 5460, '2024-07': 5522, '2024-08': 5648,
    '2024-09': 5762, '2024-10': 5705, '2024-11': 6032, '2024-12': 5882,
    '2025-01': 6059, '2025-02': 5954, '2025-03': 5600,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getUnits    = (p: Position) => p.units ?? p.quantity ?? 0;
const getTicker   = (symbol: any): string => {
    if (!symbol) return '???';
    if (typeof symbol === 'string') return symbol;
    if (typeof symbol === 'object') {
        if (symbol.raw_symbol) return String(symbol.raw_symbol);
        if (symbol.symbol)     return getTicker(symbol.symbol);
        if (symbol.id)         return String(symbol.id);
    }
    return 'Asset';
};
const getCurrency = (raw: any): string => {
    if (!raw) return 'USD';
    if (typeof raw === 'string') return raw.length >= 3 ? raw : 'USD';
    if (typeof raw === 'object') return raw.code ?? raw.id ?? 'USD';
    return 'USD';
};
const fmtCurrency = (n: number, currency: any = 'USD') => {
    let c = getCurrency(currency).toUpperCase();
    if (c === 'USDT' || c === 'USDC') c = 'USD';
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(n);
    } catch { return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
};
const fmt2    = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4    = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const sign    = (n: number) => (n >= 0 ? '+' : '');
const clamp   = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const CRYPTO_SET = new Set(['BTC','ETH','SOL','BNB','ADA','XRP','DOGE','DOT','MATIC','AVAX','USDT','USDC','LTC','LINK','UNI','ATOM','FTM','ALGO','SHIB','CRO','NEAR','ICP','FIL','VET','HBAR','CAKE','AAVE','COMP','MKR','YFI','CRV','TRX']);
const ETF_SET   = new Set(['SPY','QQQ','IWM','VTI','VOO','GLD','SLV','XLK','XLF','XLE','ARKK','DIA','EEM','VEA']);
const TICKER_PALETTE: Record<string, string> = {
    BTC:'#F7931A', ETH:'#627EEA', SOL:'#9945FF', BNB:'#F3BA2F',
    ADA:'#0033AD', XRP:'#346AA9', DOGE:'#C3A634', DOT:'#E6007A',
    MATIC:'#8247E5', AVAX:'#E84142', LINK:'#2A5ADA', UNI:'#FF007A',
};
const tickerColor = (t: string) => TICKER_PALETTE[t.toUpperCase()] ?? GOLD;
const getCategory = (t: string): 'crypto'|'etf'|'equity' => {
    const u = t.toUpperCase();
    if (CRYPTO_SET.has(u)) return 'crypto';
    if (ETF_SET.has(u))    return 'etf';
    return 'equity';
};
const normalize100 = (vals: number[]) => {
    if (!vals.length || !vals[0]) return vals;
    const b = vals[0]; return vals.map(v => (v / b) * 100);
};
const filterByPeriod = (snaps: Snapshot[], p: Period) => {
    if (p === 'ALL' || snaps.length < 2) return snaps;
    const days = ({ '1W': 7, '1M': 30, '3M': 90 } as any)[p];
    const cutoff = Date.now() - days * 864e5;
    const f = snaps.filter(s => new Date(s.captured_at).getTime() >= cutoff);
    return f.length >= 2 ? f : snaps;
};

// ─── CHART PRIMITIVES (pure RN, zero dependencies) ───────────────────────────

/**
 * SVG-like line chart using absolute-positioned Views.
 * Each segment is a thin rotated rectangle.
 */
const LineChart: React.FC<{
    series: { values: number[]; color: string; width?: number; opacity?: number }[];
    w?: number; h?: number; padding?: number;
}> = ({ series, w = CHART_W, h = 120, padding = 10 }) => {
    const anim   = useRef(new Animated.Value(0)).current;
    const allVals = series.flatMap(s => s.values);
    useEffect(() => {
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }).start();
    }, [JSON.stringify(allVals)]);

    if (allVals.length < 2) return (
        <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: MUTED, fontSize: 11, fontFamily: mono }}>AWAITING DATA</Text>
        </View>
    );

    const min = Math.min(...allVals); const max = Math.max(...allVals);
    const range = max - min || 1;
    const inner_w = w - padding * 2; const inner_h = h - padding * 2;

    const toXY = (vals: number[]) => vals.map((v, i) => ({
        x: padding + (i / (vals.length - 1)) * inner_w,
        y: padding + inner_h - ((v - min) / range) * inner_h,
    }));

    // Horizontal grid lines
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
        y: padding + inner_h * (1 - pct),
        val: min + range * pct,
    }));

    return (
        <View style={{ width: w, height: h }}>
            {/* Grid */}
            {gridLines.map((g, i) => (
                <View key={i} style={{
                    position: 'absolute', left: 0, top: g.y, right: 0,
                    height: 1, backgroundColor: i === 2 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                }} />
            ))}

            {/* Series */}
            {series.map((s, si) => {
                if (s.values.length < 2) return null;
                const pts = toXY(s.values);
                return pts.slice(0, -1).map((p1, i) => {
                    const p2  = pts[i + 1];
                    const dx  = p2.x - p1.x; const dy = p2.y - p1.y;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    const deg = Math.atan2(dy, dx) * (180 / Math.PI);
                    const lw  = s.width ?? 2;
                    return (
                        <View key={`${si}-${i}`} style={{
                            position: 'absolute',
                            left: p1.x, top: p1.y - lw / 2,
                            width: len, height: lw,
                            backgroundColor: s.color,
                            borderRadius: lw / 2,
                            opacity: s.opacity ?? 0.9,
                            transform: [{ rotate: `${deg}deg` }],
                            transformOrigin: '0 50%',
                        } as any} />
                    );
                });
            })}

            {/* End dots */}
            {series.map((s, si) => {
                if (!s.values.length) return null;
                const pts = toXY(s.values);
                const last = pts[pts.length - 1];
                const r = (s.width ?? 2) + 2;
                return (
                    <View key={`dot-${si}`} style={{
                        position: 'absolute',
                        left: last.x - r, top: last.y - r,
                        width: r * 2, height: r * 2, borderRadius: r,
                        backgroundColor: s.color,
                        shadowColor: s.color, shadowOpacity: 1, shadowRadius: 8,
                    }} />
                );
            })}
        </View>
    );
};

/**
 * Donut/Pie chart using absolute-positioned arc-segment views.
 * Pure RN: each segment is a clipped circular view rotated appropriately.
 * For simplicity and reliability we render as a bar + legend hybrid ("donut bar").
 * This is a deliberate design choice — more readable on small screens.
 */
const DonutChart: React.FC<{
    segments: { label: string; value: number; color: string; pct: number }[];
    total: number; currency: string;
    size?: number;
}> = ({ segments, total, currency, size = 180 }) => {
    const anim  = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: false }).start();
        Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1.04, duration: 2200, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1.00, duration: 2200, useNativeDriver: true }),
        ])).start();
    }, []);

    const nonZero = segments.filter(s => s.pct > 0.5);
    const r = size / 2;
    const cx = r; const cy = r;
    const strokeW = 28;
    const R = r - strokeW / 2 - 4;
    const circum = 2 * Math.PI * R;

    // Arc segments using strokeDasharray trick via absolute border Views
    // We implement a real-looking ring via conic-gradient simulation with Views
    // Since RN has no SVG, we render ring as stacked rotated half-discs
    let cumAngle = -90; // start at top
    const arcViews = nonZero.map((seg, i) => {
        const sweepDeg = (seg.pct / 100) * 360;
        const startDeg = cumAngle;
        cumAngle += sweepDeg;

        // Each arc is approximated by thin rect slices for smooth appearance
        const slices = Math.ceil(sweepDeg / 4);
        const slice  = sweepDeg / slices;
        return Array.from({ length: slices }).map((_, j) => {
            const deg = startDeg + j * slice + slice / 2;
            const rad = (deg * Math.PI) / 180;
            const x   = cx + R * Math.cos(rad);
            const y   = cy + R * Math.sin(rad);
            return (
                <View key={`${i}-${j}`} style={{
                    position: 'absolute',
                    left: x - strokeW / 2, top: y - 2,
                    width: strokeW, height: 4,
                    backgroundColor: seg.color,
                    borderRadius: 2,
                    transform: [{ rotate: `${deg + 90}deg` }],
                    opacity: 0.95,
                } as any} />
            );
        });
    });

    return (
        <View style={{ alignItems: 'center' }}>
            {/* Ring */}
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
                <View style={{ width: size, height: size, position: 'relative' }}>
                    {/* Background ring */}
                    <View style={{
                        position: 'absolute',
                        left: 4, top: 4, right: 4, bottom: 4,
                        borderRadius: (size - 8) / 2,
                        borderWidth: strokeW,
                        borderColor: 'rgba(255,255,255,0.04)',
                    }} />
                    {/* Arc segments */}
                    {arcViews}
                    {/* Center label */}
                    <View style={{
                        position: 'absolute',
                        left: strokeW + 8, top: strokeW + 8,
                        right: strokeW + 8, bottom: strokeW + 8,
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Text style={{ color: MUTED, fontSize: 9, fontFamily: sans, letterSpacing: 1.5, marginBottom: 4 }}>
                            TOTAL
                        </Text>
                        <Text style={{ color: TXT, fontSize: 14, fontWeight: '700', fontFamily: serif, textAlign: 'center' }}>
                            {fmtCurrency(total, currency)}
                        </Text>
                    </View>
                </View>
            </Animated.View>

            {/* Legend */}
            <View style={{ width: '100%', marginTop: 16, gap: 8 }}>
                {nonZero.map((seg, i) => (
                    <View key={i} style={d_s.legendRow}>
                        <View style={[d_s.dot, { backgroundColor: seg.color }]} />
                        <Text style={d_s.legendLabel}>{seg.label}</Text>
                        <View style={d_s.legendBar}>
                            <Animated.View style={{
                                width: anim.interpolate({ inputRange: [0,1], outputRange: ['0%', `${seg.pct}%`] }),
                                height: '100%', backgroundColor: seg.color, borderRadius: 2, opacity: 0.6,
                            }} />
                        </View>
                        <Text style={[d_s.legendPct, { color: seg.color }]}>{fmt2(seg.pct)}%</Text>
                    </View>
                ))}
            </View>
        </View>
    );
};
const d_s = StyleSheet.create({
    legendRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot:         { width: 7, height: 7, borderRadius: 3.5 },
    legendLabel: { color: TXT2, fontSize: 11, width: 68 },
    legendBar:   { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' },
    legendPct:   { fontSize: 11, fontWeight: '700', fontFamily: mono, width: 44, textAlign: 'right' },
});

/**
 * Returns Histogram — shows distribution of daily returns as vertical bars.
 * Bins: -5%, -4%…+5%. Bar height = frequency.
 */
const ReturnsHistogram: React.FC<{
    returns: number[];  // array of daily % returns
    w?: number; h?: number;
}> = ({ returns, w = CHART_W, h = 100 }) => {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: false }).start();
    }, [returns.length]);

    if (returns.length < 3) return (
        <View style={{ height: h, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: MUTED, fontSize: 11, fontFamily: mono }}>NEED MORE SNAPSHOTS</Text>
        </View>
    );

    const MIN_BIN  = -6; const MAX_BIN = 6; const BIN_W = 1;
    const bins: number[] = Array.from({ length: (MAX_BIN - MIN_BIN) / BIN_W }, () => 0);
    returns.forEach(r => {
        const idx = clamp(Math.floor((r - MIN_BIN) / BIN_W), 0, bins.length - 1);
        bins[idx]++;
    });
    const maxFreq = Math.max(...bins, 1);
    const barW    = (w - 2) / bins.length;
    const mean    = returns.reduce((a,b) => a+b, 0) / returns.length;
    const meanX   = ((mean - MIN_BIN) / (MAX_BIN - MIN_BIN)) * w;

    return (
        <View style={{ width: w }}>
            <View style={{ width: w, height: h, flexDirection: 'row', alignItems: 'flex-end' }}>
                {bins.map((freq, i) => {
                    const binMid  = MIN_BIN + (i + 0.5) * BIN_W;
                    const isGreen = binMid >= 0;
                    const pct     = freq / maxFreq;
                    return (
                        <View key={i} style={{ width: barW - 1, marginRight: 1, height: h, justifyContent: 'flex-end' }}>
                            <Animated.View style={{
                                width: '100%',
                                height: anim.interpolate({ inputRange: [0,1], outputRange: [0, Math.max(pct * (h - 16), freq > 0 ? 4 : 0)] }),
                                backgroundColor: isGreen ? GREEN : RED,
                                opacity: 0.7 + pct * 0.3,
                                borderRadius: 2,
                            }} />
                        </View>
                    );
                })}
                {/* Mean line */}
                <View style={{ position: 'absolute', left: meanX, top: 0, bottom: 0, width: 1.5, backgroundColor: GOLD, opacity: 0.8 }} />
            </View>
            {/* X axis labels */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                {['-6%', '-3%', '0%', '+3%', '+6%'].map((l, i) => (
                    <Text key={i} style={{ color: MUTED, fontSize: 9, fontFamily: mono }}>{l}</Text>
                ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 2, backgroundColor: GOLD }} />
                    <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>Mean {sign(mean)}{fmt2(mean)}%</Text>
                </View>
                <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>n={returns.length} sessions</Text>
            </View>
        </View>
    );
};

/**
 * Drawdown chart — underwater curve showing % below peak.
 */
const DrawdownChart: React.FC<{ values: number[]; w?: number; h?: number }> = ({ values, w = CHART_W, h = 80 }) => {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: false }).start();
    }, [values.length]);

    if (values.length < 2) return null;

    // Compute drawdown series
    let peak = values[0];
    const dd = values.map(v => { peak = Math.max(peak, v); return ((v - peak) / peak) * 100; });
    const minDD  = Math.min(...dd);
    const maxDD  = 0;
    const range  = maxDD - minDD || 1;
    const pad    = 8;
    const iw     = w - pad * 2;
    const ih     = h - pad * 2;

    const pts = dd.map((v, i) => ({
        x: pad + (i / (dd.length - 1)) * iw,
        y: pad + ih - ((v - minDD) / range) * ih,
    }));

    // Render as filled area using thin horizontal slices
    const segments = pts.slice(0, -1).map((p1, i) => {
        const p2  = pts[i + 1];
        const dx  = p2.x - p1.x; const dy = p2.y - p1.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        const deg = Math.atan2(dy, dx) * (180 / Math.PI);
        return { p1, len, deg };
    });

    const maxDDVal = Math.min(...dd);

    return (
        <View>
            <View style={{ width: w, height: h }}>
                <View style={{ position: 'absolute', bottom: pad, left: pad, right: pad, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                {segments.map((seg, i) => (
                    <View key={i} style={{
                        position: 'absolute',
                        left: seg.p1.x, top: seg.p1.y - 1,
                        width: seg.len, height: 2,
                        backgroundColor: RED,
                        borderRadius: 1, opacity: 0.75,
                        transform: [{ rotate: `${seg.deg}deg` }],
                        transformOrigin: '0 50%',
                    } as any} />
                ))}
                {/* Fill down to baseline */}
                {segments.map((seg, i) => (
                    <View key={`fill-${i}`} style={{
                        position: 'absolute',
                        left: seg.p1.x, top: seg.p1.y,
                        width: seg.len, height: h - pad - seg.p1.y,
                        backgroundColor: RED_D,
                        opacity: 0.5,
                    }} />
                ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>
                    Max drawdown: <Text style={{ color: RED }}>{fmt2(maxDDVal)}%</Text>
                </Text>
                <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>
                    Current: <Text style={{ color: dd[dd.length-1] < -0.5 ? RED : GREEN }}>{fmt2(dd[dd.length-1])}%</Text>
                </Text>
            </View>
        </View>
    );
};

// ─── Stat metric display ──────────────────────────────────────────────────────
const Metric: React.FC<{ label: string; value: string; color?: string; sub?: string }> = ({ label, value, color = TXT, sub }) => (
    <View style={mt.wrap}>
        <Text style={mt.label}>{label}</Text>
        <Text style={[mt.value, { color }]}>{value}</Text>
        {sub && <Text style={mt.sub}>{sub}</Text>}
    </View>
);
const mt = StyleSheet.create({
    wrap:  { flex: 1 },
    label: { color: MUTED, fontSize: 9, fontFamily: sans, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5 },
    value: { fontSize: 20, fontWeight: '700', fontFamily: serif },
    sub:   { color: MUTED, fontSize: 10, fontFamily: mono, marginTop: 3 },
});

// ─── Period selector ──────────────────────────────────────────────────────────
const PeriodTabs: React.FC<{ selected: Period; onChange: (p: Period) => void }> = ({ selected, onChange }) => (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 18 }}>
        {(['1W','1M','3M','ALL'] as Period[]).map(p => (
            <TouchableOpacity key={p} onPress={() => onChange(p)} style={[
                pt.tab,
                selected === p && { backgroundColor: BLUE, borderColor: BLUE },
            ]}>
                <Text style={[pt.txt, selected === p && { color: '#fff' }]}>{p}</Text>
            </TouchableOpacity>
        ))}
    </View>
);
const pt = StyleSheet.create({
    tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8, backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER },
    txt: { color: MUTED, fontSize: 11, fontWeight: '700', fontFamily: mono },
});

// ─── Section heading ──────────────────────────────────────────────────────────
const SHead: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 3, height: 14, backgroundColor: GOLD, borderRadius: 2 }} />
            <Text style={{ color: TXT, fontSize: 14, fontWeight: '700', fontFamily: serif }}>{title}</Text>
        </View>
        {right}
    </View>
);

// ─── Card wrapper ─────────────────────────────────────────────────────────────
const Card: React.FC<{ children: React.ReactNode; style?: any; glow?: string }> = ({ children, style, glow }) => (
    <View style={[{
        backgroundColor: CARD,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: glow ? `${glow}22` : BORDER,
        padding: 20,
        marginBottom: 14,
        shadowColor: glow ?? '#000',
        shadowOpacity: glow ? 0.08 : 0.3,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    }, style]}>
        {children}
    </View>
);

// ─── Holding row ──────────────────────────────────────────────────────────────
const HoldingRow: React.FC<{ pos: Position; totalValue: number; index: number }> = ({ pos, totalValue, index }) => {
    const fade  = useRef(new Animated.Value(0)).current;
    const slide = useRef(new Animated.Value(20)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade,  { toValue: 1, duration: 450, delay: index * 80, useNativeDriver: true }),
            Animated.spring(slide, { toValue: 0, tension: 70, friction: 10, delay: index * 80, useNativeDriver: true } as any),
        ]).start();
    }, []);

    const ticker    = getTicker(pos.symbol);
    const units     = getUnits(pos);
    const price     = pos.price ?? 0;
    const value     = units * price;
    const pnl       = pos.open_pnl ?? 0;
    const allocPct  = totalValue > 0 ? (value / totalValue) * 100 : 0;
    const pnlPct    = pnl !== 0 && (value - pnl) > 0 ? (pnl / (value - pnl)) * 100 : 0;
    const hasPnl    = pnl !== 0;
    const accent    = tickerColor(ticker);
    const pnlColor2 = hasPnl ? (pnl >= 0 ? GREEN : RED) : GOLD;

    return (
        <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
            <View style={hr.card}>
                {/* Accent bar */}
                <View style={[hr.accentBar, { backgroundColor: accent }]} />

                <View style={[hr.iconWrap, { backgroundColor: accent + '1A', borderColor: accent + '40' }]}>
                    <Text style={[hr.iconTxt, { color: accent }]}>{ticker[0]}</Text>
                </View>

                <View style={hr.mid}>
                    <Text style={hr.ticker}>{ticker}</Text>
                    <Text style={hr.units}>{units < 1 ? fmt4(units) : fmt2(units)} @ {fmtCurrency(price, pos.currency)}</Text>
                    {/* Allocation mini bar */}
                    <View style={hr.allocBar}>
                        <View style={[hr.allocFill, { width: `${Math.min(allocPct, 100)}%`, backgroundColor: accent }]} />
                    </View>
                </View>

                <View style={hr.right}>
                    <Text style={hr.value}>{fmtCurrency(value, pos.currency)}</Text>
                    {hasPnl ? (
                        <View style={[hr.badge, { backgroundColor: pnl >= 0 ? GREEN_D : RED_D }]}>
                            <Text style={[hr.pct, { color: pnlColor2 }]}>
                                {sign(pnlPct)}{fmt2(Math.abs(pnlPct))}%
                            </Text>
                        </View>
                    ) : (
                        <Text style={[hr.pct, { color: MUTED }]}>{fmt2(allocPct)}% alloc</Text>
                    )}
                </View>
            </View>
        </Animated.View>
    );
};
const hr = StyleSheet.create({
    card:      { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD2, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 8, gap: 12, overflow: 'hidden' },
    accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
    iconWrap:  { width: 46, height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    iconTxt:   { fontSize: 18, fontWeight: '700', fontFamily: serif },
    mid:       { flex: 1, gap: 3 },
    ticker:    { color: TXT, fontSize: 15, fontWeight: '700', fontFamily: serif },
    units:     { color: MUTED, fontSize: 10, fontFamily: mono },
    allocBar:  { height: 2, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden', marginTop: 2 },
    allocFill: { height: '100%', borderRadius: 1, opacity: 0.6 },
    right:     { alignItems: 'flex-end', gap: 5 },
    value:     { color: TXT, fontSize: 14, fontWeight: '700', fontFamily: mono },
    badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
    pct:       { fontSize: 11, fontWeight: '700', fontFamily: mono },
});

// ─── Risk metrics ─────────────────────────────────────────────────────────────
const computeRiskMetrics = (returns: number[]) => {
    if (returns.length < 3) return null;
    const mean   = returns.reduce((a,b) => a+b, 0) / returns.length;
    const vari   = returns.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const stddev = Math.sqrt(vari);
    const annStd = stddev * Math.sqrt(252); // annualised (daily returns)
    const sharpe = stddev > 0 ? (mean / stddev) * Math.sqrt(252) : 0;
    const sorted = [...returns].sort((a,b) => a - b);
    const var95  = sorted[Math.floor(returns.length * 0.05)] ?? 0; // 5th percentile VaR
    const pos    = returns.filter(r => r >= 0).length;
    const winRate = (pos / returns.length) * 100;
    return { mean, stddev, annStd, sharpe, var95, winRate };
};

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function PortfolioScreen() {
    const [holdings,   setHoldings]   = useState<HoldingsData | null>(null);
    const [snapshots,  setSnapshots]  = useState<Snapshot[]>([]);
    const [loading,    setLoading]    = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [connected,  setConnected]  = useState(false);
    const [userName,   setUserName]   = useState('');
    const [lastUpdated,setLastUpdated]= useState<Date | null>(null);
    const [period,     setPeriod]     = useState<Period>('ALL');

    const { brokerageConnected } = useConnectionStore();

    const headerAnim = useRef(new Animated.Value(0)).current;

    const init = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const meta = user.user_metadata;
        setUserName(meta?.full_name ?? meta?.name ?? user.email?.split('@')[0] ?? 'Investor');

        const { data: conn } = await supabase
            .from('snaptrade_connections').select('account_id').eq('user_id', user.id).maybeSingle();
        if (!conn?.account_id) { setConnected(false); setLoading(false); return; }
        setConnected(true);

        const { data: latestSnap } = await supabase
            .from('portfolio_snapshots').select('snapshot, captured_at')
            .eq('user_id', user.id).order('captured_at', { ascending: false }).limit(1).single();
        if (latestSnap?.snapshot) {
            setHoldings(latestSnap.snapshot as HoldingsData);
            setLastUpdated(new Date(latestSnap.captured_at));
        }

        const { data: histSnaps } = await supabase
            .from('portfolio_snapshots').select('snapshot, captured_at')
            .eq('user_id', user.id).order('captured_at', { ascending: true }).limit(90);
        if (histSnaps) setSnapshots(histSnaps as Snapshot[]);

        setLoading(false);
        Animated.timing(headerAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
        fetchFresh(user.id);
    }, []);

    useEffect(() => { init(); }, [init]);
    useEffect(() => { if (brokerageConnected && !connected) init(); }, [brokerageConnected]);

    const fetchFresh = async (userId: string) => {
        try {
            const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
                body: { action: 'snaptrade_get_holdings', user_id: userId },
            });
            if (!error && data?.holdings) { setHoldings(data.holdings); setLastUpdated(new Date()); }
        } catch {}
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await fetchFresh(user.id);
        setRefreshing(false);
    }, []);

    // Real-time subscription
    useEffect(() => {
        const sub = supabase.channel('portfolio_rt')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portfolio_snapshots' }, p => {
                if (p.new?.snapshot) {
                    setHoldings(p.new.snapshot as HoldingsData);
                    setLastUpdated(new Date(p.new.captured_at));
                    setSnapshots(prev => [...prev.slice(-89), p.new as Snapshot]);
                }
            }).subscribe();
        return () => { supabase.removeChannel(sub); };
    }, []);

    // 5-min background poll
    useEffect(() => {
        if (!connected) return;
        const poll = setInterval(async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) fetchFresh(user.id);
        }, 5 * 60 * 1000);
        return () => clearInterval(poll);
    }, [connected]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const positions = holdings?.positions ?? [];
    const balances  = holdings?.balances  ?? [];
    const currency  = getCurrency(balances[0]?.currency);
    const cash      = balances.reduce((s,b) => s + (b.cash ?? 0), 0);
    const totalPos  = positions.reduce((s,p) => s + getUnits(p) * (p.price ?? 0), 0);
    const totalVal  = totalPos + cash;
    const totalPnl  = positions.reduce((s,p) => s + (p.open_pnl ?? 0), 0);

    // Period-filtered snapshots
    const filteredSnaps = filterByPeriod(snapshots, period);

    // Portfolio value series for each snapshot
    const snapValues = filteredSnaps.map(s => {
        const pos = s.snapshot?.positions ?? [];
        const bal = s.snapshot?.balances  ?? [];
        return pos.reduce((sum,p) => sum + getUnits(p) * (p.price ?? 0), 0)
             + bal.reduce((sum,b) => sum + (b.cash ?? 0), 0);
    }).filter(v => v > 0);

    // S&P benchmark values aligned to same snapshots
    const benchValues = filteredSnaps.map(s => {
        const d   = new Date(s.captured_at);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        return SP500[key] ?? SP500['2025-03'];
    });

    const chartPortfolio = normalize100(snapValues);
    const chartBench     = normalize100(benchValues);

    const periodReturn = chartPortfolio.length >= 2
        ? chartPortfolio[chartPortfolio.length-1] - chartPortfolio[0] : 0;
    const sp500Return  = chartBench.length >= 2
        ? chartBench[chartBench.length-1] - chartBench[0] : 0;
    const vsMarket     = periodReturn - sp500Return;

    // Daily returns for histogram & risk metrics
    const dailyReturns: number[] = snapValues.length >= 2
        ? snapValues.slice(1).map((v,i) => snapValues[i] > 0 ? ((v - snapValues[i]) / snapValues[i]) * 100 : 0)
        : [];

    const todayChange    = snapValues.length >= 2 ? snapValues[snapValues.length-1] - snapValues[snapValues.length-2] : 0;
    const todayChangePct = snapValues.length >= 2 && snapValues[snapValues.length-2] > 0
        ? (todayChange / snapValues[snapValues.length-2]) * 100 : 0;

    // Allocation buckets
    const allocSegs = (() => {
        const b: Record<string,number> = { crypto:0, equity:0, etf:0 };
        positions.forEach(p => { const cat = getCategory(getTicker(p.symbol)); b[cat] += getUnits(p)*(p.price??0); });
        const t = totalVal || 1;
        return [
            { label:'Crypto',   value:b.crypto, color:PURPLE, pct:(b.crypto/t)*100 },
            { label:'Equities', value:b.equity, color:BLUE,   pct:(b.equity/t)*100 },
            { label:'ETFs',     value:b.etf,    color:ORANGE, pct:(b.etf/t)*100    },
            { label:'Cash',     value:cash,     color:TEAL,   pct:(cash/t)*100     },
        ].filter(s => s.pct > 0.1);
    })();

    // Performers
    const performers = (() => {
        if (snapshots.length < 2) return { top: [], bottom: [] };
        const first: Record<string,number> = {};
        (snapshots[0].snapshot?.positions ?? []).forEach(p => { first[getTicker(p.symbol)] = p.price ?? 0; });
        const items = positions.map(p => {
            const ticker = getTicker(p.symbol);
            const fp     = first[ticker] ?? 0;
            const cp     = p.price ?? 0;
            const pct    = fp > 0 && cp > 0 ? ((cp-fp)/fp)*100
                : (p.open_pnl && getUnits(p)*cp > 0 ? (p.open_pnl/(getUnits(p)*cp - p.open_pnl))*100 : 0);
            return { ticker, pct, value: getUnits(p)*cp, currency: p.currency };
        }).filter(p => p.value > 0);
        const sorted = [...items].sort((a,b) => b.pct - a.pct);
        return {
            top:    sorted.slice(0,3).filter(p => p.pct >= 0),
            bottom: [...sorted].reverse().slice(0,3).filter(p => p.pct < 0),
        };
    })();

    const risk = computeRiskMetrics(dailyReturns);

    // Chart labels
    const chartLabels = (() => {
        if (filteredSnaps.length < 2) return ['','',''];
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const f = new Date(filteredSnaps[0].captured_at);
        const l = new Date(filteredSnaps[filteredSnaps.length-1].captured_at);
        const m = new Date((f.getTime()+l.getTime())/2);
        return [MONTHS[f.getMonth()], MONTHS[m.getMonth()], MONTHS[l.getMonth()]];
    })();

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />

            {/* Background glows */}
            <View style={s.glow1} />
            <View style={s.glow2} />
            <View style={s.glow3} />

            {/* ── Nav ── */}
            <Animated.View style={[s.nav, { opacity: headerAnim }]}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Text style={s.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.navLabel}>PORTFOLIO</Text>
                    <Text style={s.navTitle}>{userName}</Text>
                </View>
                <TouchableOpacity style={s.refreshBtn} onPress={onRefresh}>
                    <Text style={{ fontSize: 18, color: SUB }}>⟳</Text>
                </TouchableOpacity>
            </Animated.View>

            {loading ? (
                <View style={s.loadingWrap}>
                    <ActivityIndicator color={GOLD} size="large" />
                    <Text style={s.loadingTxt}>Syncing portfolio…</Text>
                </View>
            ) : !connected ? (
                <View style={s.emptyWrap}>
                    <Text style={{ fontSize: 52, marginBottom: 20 }}>📡</Text>
                    <Text style={s.emptyTitle}>No Account Connected</Text>
                    <Text style={s.emptySub}>Connect your Binance or brokerage from the Profile screen to see live data here.</Text>
                    <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()}>
                        <Text style={s.emptyBtnTxt}>→  Go to Profile</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={s.scroll}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
                >
                    {/* ── Hero Net Worth ── */}
                    <Card glow={GOLD} style={{ marginBottom: 14 }}>
                        <View style={s.heroTop}>
                            <Text style={s.heroLabel}>TOTAL NET WORTH</Text>
                            <View style={[s.liveDot, { backgroundColor: todayChangePct >= 0 ? GREEN : RED }]}>
                                <Text style={[s.liveTxt, { color: todayChangePct >= 0 ? GREEN : RED }]}>
                                    LIVE
                                </Text>
                            </View>
                        </View>
                        <Text style={s.heroValue}>{fmtCurrency(totalVal, currency)}</Text>

                        <View style={s.heroMeta}>
                            <View style={[s.changePill, { backgroundColor: todayChangePct >= 0 ? GREEN_D : RED_D, borderColor: todayChangePct >= 0 ? GREEN+'44' : RED+'44' }]}>
                                <Text style={[s.changePillTxt, { color: todayChangePct >= 0 ? GREEN : RED }]}>
                                    {todayChangePct >= 0 ? '▲' : '▼'} {sign(todayChangePct)}{fmt2(Math.abs(todayChangePct))}%
                                </Text>
                            </View>
                            <Text style={s.heroSub}>
                                {sign(todayChange)}{fmtCurrency(Math.abs(todayChange), currency)} today
                                {totalPnl !== 0 ? `  ·  P&L ${sign(totalPnl)}${fmtCurrency(Math.abs(totalPnl), currency)}` : ''}
                            </Text>
                        </View>

                        {/* Quick stats */}
                        <View style={s.quickStats}>
                            <View style={s.quickStat}>
                                <Text style={s.qLabel}>POSITIONS</Text>
                                <Text style={s.qValue}>{positions.length}</Text>
                            </View>
                            <View style={s.qDivider} />
                            <View style={s.quickStat}>
                                <Text style={s.qLabel}>CASH</Text>
                                <Text style={s.qValue}>{fmtCurrency(cash, currency)}</Text>
                            </View>
                            <View style={s.qDivider} />
                            <View style={s.quickStat}>
                                <Text style={s.qLabel}>INVESTED</Text>
                                <Text style={s.qValue}>{fmtCurrency(totalPos, currency)}</Text>
                            </View>
                        </View>

                        {lastUpdated && (
                            <Text style={s.updatedTxt}>
                                ● LIVE · {lastUpdated.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: true })}
                            </Text>
                        )}
                    </Card>

                    {/* ── Performance Chart ── */}
                    <Card>
                        <SHead title="Performance" right={
                            <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>vs S&P 500</Text>
                        } />
                        <PeriodTabs selected={period} onChange={setPeriod} />

                        {/* Return metrics row */}
                        <View style={s.returnRow}>
                            <Metric
                                label="Your Return"
                                value={`${sign(periodReturn)}${fmt2(periodReturn)}%`}
                                color={periodReturn >= 0 ? GREEN : RED}
                            />
                            <View style={s.returnDivider} />
                            <Metric
                                label="S&P 500"
                                value={`${sign(sp500Return)}${fmt2(sp500Return)}%`}
                                color={SUB}
                            />
                            <View style={s.returnDivider} />
                            <Metric
                                label="Alpha"
                                value={`${sign(vsMarket)}${fmt2(vsMarket)}%`}
                                color={vsMarket >= 0 ? GREEN : RED}
                                sub={vsMarket >= 0 ? 'outperforming' : 'lagging'}
                            />
                        </View>

                        <LineChart
                            series={[
                                { values: chartPortfolio, color: periodReturn >= 0 ? GREEN : RED, width: 2.5 },
                                { values: chartBench,     color: MUTED, width: 1.5, opacity: 0.35 },
                            ]}
                            w={CHART_W} h={130}
                        />

                        {chartLabels[0] && (
                            <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop: 6 }}>
                                {chartLabels.map((l,i) => (
                                    <Text key={i} style={{ color: MUTED, fontSize: 9, fontFamily: mono }}>{l}</Text>
                                ))}
                            </View>
                        )}

                        <View style={s.legendRow}>
                            <View style={s.legendItem}>
                                <View style={[s.legendDot, { backgroundColor: periodReturn >= 0 ? GREEN : RED }]} />
                                <Text style={s.legendTxt}>Portfolio</Text>
                            </View>
                            <View style={s.legendItem}>
                                <View style={[s.legendDash, { backgroundColor: MUTED }]} />
                                <Text style={s.legendTxt}>S&P 500 (ref)</Text>
                            </View>
                        </View>
                    </Card>

                    {/* ── Asset Allocation Donut ── */}
                    {allocSegs.length > 0 && (
                        <Card>
                            <SHead title="Asset Allocation" />
                            <DonutChart
                                segments={allocSegs}
                                total={totalVal}
                                currency={currency}
                                size={Math.min(CHART_W * 0.6, 200)}
                            />
                        </Card>
                    )}

                    {/* ── Returns Distribution Histogram ── */}
                    <Card>
                        <SHead title="Returns Distribution" right={
                            <View style={[s.tagPill, { backgroundColor: PURPLE_D, borderColor: PURPLE+'44' }]}>
                                <Text style={{ color: PURPLE, fontSize: 9, fontWeight: '700', fontFamily: mono }}>HISTOGRAM</Text>
                            </View>
                        } />
                        <ReturnsHistogram returns={dailyReturns} w={CHART_W} h={90} />
                    </Card>

                    {/* ── Drawdown Chart ── */}
                    {snapValues.length >= 3 && (
                        <Card>
                            <SHead title="Drawdown Analysis" right={
                                <View style={[s.tagPill, { backgroundColor: RED_D, borderColor: RED+'44' }]}>
                                    <Text style={{ color: RED, fontSize: 9, fontWeight: '700', fontFamily: mono }}>UNDERWATER</Text>
                                </View>
                            } />
                            <DrawdownChart values={snapValues} w={CHART_W} h={90} />
                        </Card>
                    )}

                    {/* ── Risk Metrics ── */}
                    {risk && (
                        <Card>
                            <SHead title="Risk Analysis" />
                            <View style={s.riskGrid}>
                                <View style={[s.riskCell, { borderColor: BLUE_D }]}>
                                    <Text style={s.riskLabel}>SHARPE RATIO</Text>
                                    <Text style={[s.riskVal, { color: risk.sharpe >= 1 ? GREEN : risk.sharpe >= 0 ? GOLD : RED }]}>
                                        {fmt2(risk.sharpe)}
                                    </Text>
                                    <Text style={s.riskSub}>{risk.sharpe >= 1 ? 'Good' : risk.sharpe >= 0.5 ? 'Moderate' : 'Poor'}</Text>
                                </View>
                                <View style={[s.riskCell, { borderColor: PURPLE_D }]}>
                                    <Text style={s.riskLabel}>ANN. VOLATILITY</Text>
                                    <Text style={[s.riskVal, { color: TXT2 }]}>{fmt2(risk.annStd)}%</Text>
                                    <Text style={s.riskSub}>annualised</Text>
                                </View>
                                <View style={[s.riskCell, { borderColor: RED_D }]}>
                                    <Text style={s.riskLabel}>VAR 95%</Text>
                                    <Text style={[s.riskVal, { color: RED }]}>{fmt2(risk.var95)}%</Text>
                                    <Text style={s.riskSub}>daily tail risk</Text>
                                </View>
                                <View style={[s.riskCell, { borderColor: GREEN_D }]}>
                                    <Text style={s.riskLabel}>WIN RATE</Text>
                                    <Text style={[s.riskVal, { color: risk.winRate >= 50 ? GREEN : RED }]}>
                                        {fmt2(risk.winRate)}%
                                    </Text>
                                    <Text style={s.riskSub}>positive days</Text>
                                </View>
                            </View>
                        </Card>
                    )}

                    {/* ── Top Performers ── */}
                    {performers.top.length > 0 && (
                        <Card>
                            <SHead title="Top Performers" right={
                                <View style={[s.tagPill, { backgroundColor: GREEN_D, borderColor: GREEN+'44' }]}>
                                    <Text style={{ color: GREEN, fontSize: 9, fontWeight: '700', fontFamily: mono }}>↑ GAINERS</Text>
                                </View>
                            } />
                            {performers.top.map((p, i) => {
                                const accent = tickerColor(p.ticker);
                                return (
                                    <View key={i} style={[perf.row, i < performers.top.length-1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                                        <View style={[perf.icon, { backgroundColor: accent+'22', borderColor: accent+'44' }]}>
                                            <Text style={[perf.iconTxt, { color: accent }]}>{p.ticker[0]}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={perf.ticker}>{p.ticker}</Text>
                                            <Text style={perf.val}>{fmtCurrency(p.value, p.currency)}</Text>
                                        </View>
                                        <View style={[perf.badge, { backgroundColor: GREEN_D }]}>
                                            <Text style={[perf.pct, { color: GREEN }]}>
                                                +{fmt2(p.pct)}%
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </Card>
                    )}

                    {/* ── Underperformers ── */}
                    {performers.bottom.length > 0 && (
                        <Card>
                            <SHead title="Underperformers" right={
                                <View style={[s.tagPill, { backgroundColor: RED_D, borderColor: RED+'44' }]}>
                                    <Text style={{ color: RED, fontSize: 9, fontWeight: '700', fontFamily: mono }}>↓ LAGGING</Text>
                                </View>
                            } />
                            {performers.bottom.map((p, i) => {
                                const accent = tickerColor(p.ticker);
                                return (
                                    <View key={i} style={[perf.row, i < performers.bottom.length-1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                                        <View style={[perf.icon, { backgroundColor: accent+'22', borderColor: accent+'44' }]}>
                                            <Text style={[perf.iconTxt, { color: accent }]}>{p.ticker[0]}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={perf.ticker}>{p.ticker}</Text>
                                            <Text style={perf.val}>{fmtCurrency(p.value, p.currency)}</Text>
                                        </View>
                                        <View style={[perf.badge, { backgroundColor: RED_D }]}>
                                            <Text style={[perf.pct, { color: RED }]}>{fmt2(p.pct)}%</Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </Card>
                    )}

                    {/* ── Holdings ── */}
                    <SHead title={`Holdings · ${positions.length} assets`} right={
                        <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>
                            {fmtCurrency(totalPos, currency)}
                        </Text>
                    } />

                    {positions.length > 0 ? positions.map((pos, i) => (
                        <HoldingRow key={`${getTicker(pos.symbol)}-${i}`} pos={pos} totalValue={totalPos} index={i} />
                    )) : (
                        <Card>
                            <Text style={{ color: MUTED, fontSize: 13, textAlign: 'center', fontFamily: mono }}>
                                NO POSITIONS · PULL TO REFRESH
                            </Text>
                        </Card>
                    )}

                    <View style={s.wordmark}>
                        <View style={s.wordmarkLine} />
                        <Text style={s.wordmarkTxt}>◈  VESTARA  ·  LIVE DATA  ·  SNAPTRADE</Text>
                        <View style={s.wordmarkLine} />
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

const perf = StyleSheet.create({
    row:     { flexDirection:'row', alignItems:'center', paddingVertical: 12, gap: 12 },
    icon:    { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems:'center', justifyContent:'center' },
    iconTxt: { fontSize: 15, fontWeight:'700', fontFamily: serif },
    ticker:  { color: TXT, fontSize: 13, fontWeight:'700', fontFamily: serif },
    val:     { color: MUTED, fontSize: 11, marginTop: 2, fontFamily: mono },
    badge:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    pct:     { fontSize: 13, fontWeight:'700', fontFamily: mono },
});

const s = StyleSheet.create({
    root:  { flex: 1, backgroundColor: BG },
    glow1: { position:'absolute', width:320, height:320, borderRadius:160, backgroundColor:'rgba(201,168,76,0.03)', top:-80, right:-80 },
    glow2: { position:'absolute', width:250, height:250, borderRadius:125, backgroundColor:'rgba(79,158,248,0.03)', top:300, left:-80 },
    glow3: { position:'absolute', width:200, height:200, borderRadius:100, backgroundColor:'rgba(52,211,153,0.02)', bottom:100, right:-60 },

    nav:        { flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingTop: Platform.OS==='ios'?58:40, paddingBottom:16, borderBottomWidth:1, borderBottomColor:BORDER, gap:12 },
    backBtn:    { width:36, height:36, borderRadius:18, backgroundColor:GLASS, borderWidth:1, borderColor:BORDER, alignItems:'center', justifyContent:'center' },
    backArrow:  { color:GOLD, fontSize:22, lineHeight:24, marginTop:-2 },
    navLabel:   { color:GOLD, fontSize:9, letterSpacing:2.5, fontFamily:sans },
    navTitle:   { color:TXT, fontSize:16, fontWeight:'700', fontFamily:serif },
    refreshBtn: { width:36, height:36, borderRadius:18, backgroundColor:GLASS, borderWidth:1, borderColor:BORDER, alignItems:'center', justifyContent:'center' },

    scroll:    { paddingHorizontal:20, paddingTop:20, paddingBottom:48 },

    // Hero
    heroTop:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
    heroLabel:    { color:MUTED, fontSize:9, letterSpacing:2.5, fontFamily:sans },
    liveDot:      { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:3, borderRadius:6 },
    liveTxt:      { fontSize:9, fontWeight:'800', fontFamily:mono, letterSpacing:1 },
    heroValue:    { color:TXT, fontSize:38, fontWeight:'700', fontFamily:serif, letterSpacing:0.5, marginBottom:12 },
    heroMeta:     { flexDirection:'row', alignItems:'center', gap:10, marginBottom:18 },
    changePill:   { paddingHorizontal:10, paddingVertical:5, borderRadius:10, borderWidth:1 },
    changePillTxt:{ fontSize:13, fontWeight:'700', fontFamily:mono },
    heroSub:      { color:SUB, fontSize:12 },
    quickStats:   { flexDirection:'row', backgroundColor:GLASS, borderRadius:12, padding:14, borderWidth:1, borderColor:BORDER, marginBottom:12 },
    quickStat:    { flex:1, alignItems:'center' },
    qLabel:       { color:MUTED, fontSize:8, letterSpacing:1.5, fontFamily:sans, marginBottom:5 },
    qValue:       { color:TXT2, fontSize:12, fontWeight:'700', fontFamily:mono },
    qDivider:     { width:1, backgroundColor:BORDER, marginHorizontal:8, alignSelf:'stretch' },
    updatedTxt:   { color:MUTED, fontSize:9, fontFamily:mono, letterSpacing:0.5 },

    // Chart
    returnRow:     { flexDirection:'row', marginBottom:18 },
    returnDivider: { width:1, backgroundColor:BORDER, marginHorizontal:14, alignSelf:'stretch' },
    legendRow:     { flexDirection:'row', gap:16, marginTop:12 },
    legendItem:    { flexDirection:'row', alignItems:'center', gap:6 },
    legendDot:     { width:8, height:8, borderRadius:4 },
    legendDash:    { width:14, height:1.5, borderRadius:1 },
    legendTxt:     { color:MUTED, fontSize:10, fontFamily:sans },

    // Risk grid
    riskGrid: { flexDirection:'row', flexWrap:'wrap', gap:8 },
    riskCell: { flex:1, minWidth:'45%', backgroundColor:GLASS, borderRadius:12, borderWidth:1, padding:14, gap:4 },
    riskLabel:{ color:MUTED, fontSize:8, letterSpacing:1.5, fontFamily:sans },
    riskVal:  { fontSize:22, fontWeight:'700', fontFamily:serif },
    riskSub:  { color:MUTED, fontSize:9, fontFamily:mono },

    // Tag pills
    tagPill: { paddingHorizontal:8, paddingVertical:3, borderRadius:6, borderWidth:1 },

    // Loading / empty
    loadingWrap: { flex:1, alignItems:'center', justifyContent:'center', gap:14 },
    loadingTxt:  { color:MUTED, fontSize:12, fontFamily:mono, letterSpacing:1 },
    emptyWrap:   { flex:1, alignItems:'center', justifyContent:'center', paddingHorizontal:36, gap:8 },
    emptyTitle:  { color:TXT, fontSize:22, fontWeight:'700', fontFamily:serif, marginBottom:4 },
    emptySub:    { color:MUTED, fontSize:13, textAlign:'center', lineHeight:22 },
    emptyBtn:    { marginTop:20, backgroundColor:GOLD_D, borderWidth:1, borderColor:GOLD_B, borderRadius:14, paddingHorizontal:28, paddingVertical:14 },
    emptyBtnTxt: { color:GOLD_L, fontSize:15, fontWeight:'700', fontFamily:mono },

    wordmark:    { flexDirection:'row', alignItems:'center', gap:10, marginTop:24, marginBottom:8 },
    wordmarkLine:{ flex:1, height:1, backgroundColor:BORDER },
    wordmarkTxt: { color:'rgba(201,168,76,0.18)', fontSize:9, letterSpacing:2.5, fontFamily:mono },
});
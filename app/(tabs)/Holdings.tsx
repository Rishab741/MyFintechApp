/**
 * Holdings.tsx — Vestara Asset Analytics
 * Real-time per-asset visualization: sparklines, value timeline, delta bars.
 * Data & real-time updates sourced entirely from usePortfolioData (Supabase RT + 5-min poll).
 */

import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated, Platform, RefreshControl, ScrollView, StatusBar,
    StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';

import { usePortfolioData } from '@/src/portfolio/hooks/usePortfolioData';
import { LineChart, DonutChart } from '@/src/portfolio/charts';
import { PeriodTabs, SHead, Card } from '@/src/portfolio/components';
import {
    BG, CARD, CARD2, BORDER, BORDER2,
    GOLD, GOLD_D, GOLD_B,
    GREEN, GREEN_D, RED, RED_D,
    BLUE, ORANGE,
    TXT, TXT2, MUTED,
    sans, mono, CHART_W,
} from '@/src/portfolio/tokens';
import { fmtCurrency, fmt2, sign, getTicker, getUnits } from '@/src/portfolio/helpers';

// ─── Palette (8 distinct neon accents) ───────────────────────────────────────
const PALETTE = [GOLD, BLUE, ORANGE, GREEN, '#ff9f43', '#a29bfe', '#fd79a8', '#55efc4'];

// ─── Sparkline ────────────────────────────────────────────────────────────────
const Sparkline: React.FC<{ values: number[]; color: string; w?: number; h?: number }> =
    ({ values, color, w = 68, h = 34 }) => {
    if (values.length < 2) return <View style={{ width: w, height: h }} />;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => ({
        x: (i / (values.length - 1)) * w,
        y: h - ((v - min) / range) * (h - 6) - 3,
    }));
    return (
        <View style={{ width: w, height: h }}>
            {pts.slice(0, -1).map((p1, i) => {
                const p2  = pts[i + 1];
                const dx  = p2.x - p1.x; const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                const deg = Math.atan2(dy, dx) * (180 / Math.PI);
                return (
                    <View key={i} style={{
                        position: 'absolute', left: p1.x, top: p1.y - 0.75,
                        width: len, height: 1.5, backgroundColor: color,
                        borderRadius: 1, opacity: 0.9,
                        transform: [{ rotate: `${deg}deg` }],
                        transformOrigin: '0 50%',
                    } as any} />
                );
            })}
            <View style={{
                position: 'absolute',
                left: pts[pts.length - 1].x - 3,
                top:  pts[pts.length - 1].y - 3,
                width: 6, height: 6, borderRadius: 3,
                backgroundColor: color,
                shadowColor: color, shadowOpacity: 1, shadowRadius: 8,
            }} />
        </View>
    );
};

// ─── Asset card ───────────────────────────────────────────────────────────────
const AssetCard: React.FC<{
    ticker: string; value: number; currency: string;
    pct: number; hist: number[]; color: string; index: number;
}> = ({ ticker, value, currency, pct, hist, color, index }) => {
    const fade  = useRef(new Animated.Value(0)).current;
    const slide = useRef(new Animated.Value(18)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade,  { toValue: 1, duration: 400, delay: index * 55, useNativeDriver: true }),
            Animated.spring(slide, { toValue: 0, tension: 80, friction: 11, delay: index * 55, useNativeDriver: true } as any),
        ]).start();
    }, []);
    const up = pct >= 0;
    return (
        <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
            <View style={[ac.card, { borderColor: `${color}28`, borderTopColor: `${color}55` }]}>
                <View style={[ac.accentBar, { backgroundColor: color }]} />
                <View style={[ac.icon, { backgroundColor: `${color}18`, borderColor: `${color}35` }]}>
                    <Text style={[ac.iconTxt, { color }]}>{ticker[0]}</Text>
                </View>
                <View style={ac.mid}>
                    <Text style={ac.ticker}>{ticker}</Text>
                    <Text style={ac.val}>{fmtCurrency(value, currency)}</Text>
                </View>
                <Sparkline values={hist} color={color} />
                <View style={[ac.badge, { backgroundColor: up ? GREEN_D : RED_D }]}>
                    <Text style={[ac.pct, { color: up ? GREEN : RED }]}>
                        {sign(pct)}{fmt2(Math.abs(pct))}%
                    </Text>
                </View>
            </View>
        </Animated.View>
    );
};
const ac = StyleSheet.create({
    card:      { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD2,
                 borderRadius: 6, borderWidth: 1, padding: 13, marginBottom: 8,
                 gap: 11, overflow: 'hidden' },
    accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
    icon:      { width: 40, height: 40, borderRadius: 6, borderWidth: 1,
                 alignItems: 'center', justifyContent: 'center' },
    iconTxt:   { fontSize: 16, fontWeight: '700', fontFamily: sans },
    mid:       { flex: 1, gap: 3 },
    ticker:    { color: TXT, fontSize: 13, fontWeight: '700', fontFamily: sans, letterSpacing: 0.2 },
    val:       { color: MUTED, fontSize: 11, fontFamily: mono },
    badge:     { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 3 },
    pct:       { fontSize: 12, fontWeight: '700', fontFamily: mono },
});

// ─── Delta bar (bidirectional centered) ──────────────────────────────────────
const DeltaBar: React.FC<{ ticker: string; pct: number; maxAbs: number; index: number }> =
    ({ ticker, pct, maxAbs, index }) => {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(anim, { toValue: 1, duration: 600, delay: index * 40, useNativeDriver: false }).start();
    }, [pct]);
    const up     = pct >= 0;
    const frac   = maxAbs > 0 ? Math.abs(pct) / maxAbs : 0;
    const fillPct = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${frac * 50}%` as any] });
    return (
        <View style={db.row}>
            <Text style={db.label}>{ticker}</Text>
            <View style={db.track}>
                <Animated.View style={[db.fill, {
                    width: fillPct,
                    backgroundColor: up ? GREEN : RED,
                    ...(up ? { left: '50%' } : { right: '50%' }),
                }]} />
                <View style={db.zeroline} />
            </View>
            <Text style={[db.pctTxt, { color: up ? GREEN : RED }]}>
                {sign(pct)}{fmt2(Math.abs(pct))}%
            </Text>
        </View>
    );
};
const db = StyleSheet.create({
    row:     { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
    label:   { color: TXT2, fontSize: 11, fontWeight: '700', fontFamily: sans, width: 52, letterSpacing: 0.3 },
    track:   { flex: 1, height: 8, backgroundColor: 'rgba(65,72,87,0.5)',
               borderRadius: 4, overflow: 'hidden', position: 'relative' },
    fill:    { position: 'absolute', top: 0, bottom: 0, opacity: 0.78 },
    zeroline:{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: BORDER },
    pctTxt:  { width: 52, fontSize: 11, fontWeight: '700', fontFamily: mono, textAlign: 'right' },
});

// ─── Live pulse dot ───────────────────────────────────────────────────────────
const LiveDot: React.FC = () => {
    const pulse   = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(0.9)).current;
    useEffect(() => {
        Animated.loop(Animated.parallel([
            Animated.sequence([
                Animated.timing(pulse,   { toValue: 1.9, duration: 900, useNativeDriver: true }),
                Animated.timing(pulse,   { toValue: 1.0, duration: 900, useNativeDriver: true }),
            ]),
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0.15, duration: 900, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0.9,  duration: 900, useNativeDriver: true }),
            ]),
        ])).start();
    }, []);
    return (
        <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{
                position: 'absolute', width: 14, height: 14, borderRadius: 7,
                backgroundColor: GREEN, opacity,
                transform: [{ scale: pulse }],
            }} />
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: GREEN,
                           shadowColor: GREEN, shadowOpacity: 1, shadowRadius: 6 }} />
        </View>
    );
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function HoldingsScreen() {
    const {
        loading, refreshing, connected, lastUpdated, onRefresh,
        period, setPeriod,
        positions, currency, cash, totalVal, todayChange, todayChangePct,
        filteredSnaps, allocSegs, fetchError,
    } = usePortfolioData();

    const isUp = todayChangePct >= 0;

    // ── Fade-in on load ───────────────────────────────────────────────────────
    const fadeIn = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!loading) {
            Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        }
    }, [loading]);

    // ── Per-asset history from filteredSnaps ─────────────────────────────────
    const assetHistory = useMemo<Record<string, number[]>>(() => {
        const map: Record<string, number[]> = {};
        filteredSnaps.forEach(snap => {
            (snap.snapshot?.positions ?? []).forEach(p => {
                const t = getTicker(p.symbol);
                if (!map[t]) map[t] = [];
                map[t].push(getUnits(p) * (p.price ?? 0));
            });
        });
        return map;
    }, [filteredSnaps]);

    // ── Asset list (sorted by current value) ─────────────────────────────────
    const assetList = useMemo(() => {
        return [...positions]
            .map(p => {
                const ticker = getTicker(p.symbol);
                const value  = getUnits(p) * (p.price ?? 0);
                const hist   = assetHistory[ticker] ?? [value];
                const pct    = hist.length >= 2
                    ? ((hist[hist.length - 1] - hist[0]) / hist[0]) * 100
                    : (p.open_pnl && (value - (p.open_pnl ?? 0)) > 0
                        ? (p.open_pnl / (value - p.open_pnl)) * 100 : 0);
                return { ticker, value, currency: p.currency ?? currency, pct, hist };
            })
            .filter(a => a.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [positions, assetHistory, currency]);

    // ── Multi-series chart (top 5 or top 8) ──────────────────────────────────
    const [showMore, setShowMore] = useState(false);
    const chartSeries = useMemo(() => {
        return assetList.slice(0, showMore ? 8 : 5).map((a, i) => ({
            values: a.hist,
            color:  PALETTE[i % PALETTE.length],
            width:  2,
        }));
    }, [assetList, showMore]);

    // ── Delta bars (sorted by |pct|) ─────────────────────────────────────────
    const deltaItems = useMemo(() =>
        [...assetList].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 8),
        [assetList]);
    const maxAbsDelta = useMemo(() =>
        Math.max(...deltaItems.map(a => Math.abs(a.pct)), 1), [deltaItems]);

    // ─────────────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={[s.root, s.center]}>
                <StatusBar barStyle="light-content" backgroundColor={BG} />
                <View style={s.loadingPill}>
                    <LiveDot />
                    <Text style={s.loadingTxt}>Syncing holdings…</Text>
                </View>
            </View>
        );
    }

    if (!connected) {
        return (
            <View style={[s.root, s.center, { paddingHorizontal: 36 }]}>
                <StatusBar barStyle="light-content" backgroundColor={BG} />
                <Text style={{ fontSize: 40, marginBottom: 16 }}>📡</Text>
                <Text style={s.emptyTitle}>No Account Connected</Text>
                <Text style={s.emptySub}>
                    Connect your brokerage from the Profile tab to see live data.
                </Text>
                <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()}>
                    <Text style={s.emptyBtnTxt}>Go to Profile →</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" backgroundColor={BG} />

            {/* Ambient glows */}
            <View style={s.glow1} />
            <View style={s.glow2} />

            {/* ── Nav ── */}
            <View style={s.nav}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Text style={s.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.navSup}>VESTARA</Text>
                    <Text style={s.navTitle}>Holdings</Text>
                </View>
                <View style={s.liveWrap}>
                    <LiveDot />
                    <Text style={s.liveLabel}>LIVE</Text>
                    {lastUpdated && (
                        <Text style={s.navTime}>
                            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    )}
                </View>
            </View>

            {/* Error banner */}
            {fetchError && (
                <View style={s.errorBanner}>
                    <Text style={s.errorTxt}>⚠ {fetchError}</Text>
                </View>
            )}

            <ScrollView
                contentContainerStyle={s.scroll}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing} onRefresh={onRefresh}
                        tintColor={GOLD} colors={[GOLD]} progressBackgroundColor={CARD}
                    />
                }
            >
                <Animated.View style={{ opacity: fadeIn }}>

                    {/* ── Hero ── */}
                    <View style={s.hero}>
                        <Text style={s.heroLabel}>TOTAL VALUE</Text>
                        <Text style={s.heroValue}>{fmtCurrency(totalVal, currency)}</Text>
                        <View style={s.heroRow}>
                            <View style={[s.changePill, {
                                backgroundColor: isUp ? GREEN_D : RED_D,
                                borderColor: isUp ? `${GREEN}40` : `${RED}40`,
                            }]}>
                                <Text style={[s.changeAmt, { color: isUp ? GREEN : RED }]}>
                                    {sign(todayChange)}{fmtCurrency(Math.abs(todayChange), currency)}
                                </Text>
                                <View style={s.changeDivider} />
                                <Text style={[s.changePct, { color: isUp ? GREEN : RED }]}>
                                    {isUp ? '▲' : '▼'} {fmt2(Math.abs(todayChangePct))}%
                                </Text>
                            </View>
                            <Text style={s.heroSub}>{assetList.length} positions</Text>
                        </View>
                    </View>

                    {/* Period selector */}
                    <PeriodTabs selected={period} onChange={setPeriod} />

                    {/* ── Asset value timeline (multi-line) ── */}
                    {chartSeries.length > 0 && (
                        <Card>
                            <SHead
                                title="Asset Value Timeline"
                                right={
                                    <TouchableOpacity onPress={() => setShowMore(v => !v)}>
                                        <Text style={s.moreBtn}>{showMore ? 'LESS' : 'MORE'}</Text>
                                    </TouchableOpacity>
                                }
                            />
                            <LineChart series={chartSeries} w={CHART_W - 36} h={150} />
                            {/* Legend */}
                            <View style={s.legend}>
                                {assetList.slice(0, showMore ? 8 : 5).map((a, i) => (
                                    <View key={a.ticker} style={s.legendItem}>
                                        <View style={[s.legendDot, { backgroundColor: PALETTE[i % PALETTE.length] }]} />
                                        <Text style={s.legendTxt}>{a.ticker}</Text>
                                    </View>
                                ))}
                            </View>
                        </Card>
                    )}

                    {/* ── Position cards with sparklines ── */}
                    <Card>
                        <SHead
                            title="Positions"
                            right={<Text style={s.posCount}>{assetList.length} ASSETS</Text>}
                        />
                        {assetList.map((a, i) => (
                            <AssetCard
                                key={a.ticker}
                                ticker={a.ticker}
                                value={a.value}
                                currency={a.currency}
                                pct={a.pct}
                                hist={a.hist}
                                color={PALETTE[i % PALETTE.length]}
                                index={i}
                            />
                        ))}
                        {/* Cash row */}
                        {cash > 0 && (
                            <View style={[ac.card, { borderColor: `${GOLD}25`, borderTopColor: `${GOLD}45` }]}>
                                <View style={[ac.accentBar, { backgroundColor: GOLD }]} />
                                <View style={[ac.icon, { backgroundColor: `${GOLD}15`, borderColor: `${GOLD}30` }]}>
                                    <Text style={[ac.iconTxt, { color: GOLD }]}>$</Text>
                                </View>
                                <View style={ac.mid}>
                                    <Text style={ac.ticker}>CASH</Text>
                                    <Text style={ac.val}>{fmtCurrency(cash, currency)}</Text>
                                </View>
                                <Text style={[ac.pct, { color: MUTED }]}>
                                    {fmt2((cash / (totalVal || 1)) * 100)}% alloc
                                </Text>
                            </View>
                        )}
                    </Card>

                    {/* ── Period performance delta bars ── */}
                    {deltaItems.length > 0 && (
                        <Card>
                            <SHead title="Period Performance" />
                            {deltaItems.map((a, i) => (
                                <DeltaBar
                                    key={a.ticker}
                                    ticker={a.ticker}
                                    pct={a.pct}
                                    maxAbs={maxAbsDelta}
                                    index={i}
                                />
                            ))}
                        </Card>
                    )}

                    {/* ── Allocation donut ── */}
                    {allocSegs.length > 0 && (
                        <Card>
                            <SHead title="Allocation Breakdown" />
                            <DonutChart
                                segments={allocSegs.map((seg, i) => ({
                                    ...seg,
                                    color: PALETTE[i % PALETTE.length],
                                }))}
                                total={totalVal}
                                currency={currency}
                            />
                        </Card>
                    )}

                    <View style={{ height: 40 }} />
                </Animated.View>
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root:  { flex: 1, backgroundColor: BG },
    center:{ alignItems: 'center', justifyContent: 'center' },

    glow1: { position: 'absolute', top: -100, left: -80, width: 320, height: 320,
             borderRadius: 160, backgroundColor: 'rgba(143,245,255,0.04)', pointerEvents: 'none' },
    glow2: { position: 'absolute', top: 200, right: -100, width: 260, height: 260,
             borderRadius: 130, backgroundColor: 'rgba(172,137,255,0.04)', pointerEvents: 'none' },

    // Nav
    nav:       { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 44,
                 paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
    backBtn:   { width: 36, height: 36, borderRadius: 6, backgroundColor: CARD2,
                 borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    backArrow: { color: TXT, fontSize: 22, marginTop: -2 },
    navSup:    { color: MUTED, fontSize: 9, fontFamily: mono, letterSpacing: 2.5 },
    navTitle:  { color: TXT, fontSize: 20, fontWeight: '700', fontFamily: sans, letterSpacing: -0.3 },
    liveWrap:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
    liveLabel: { color: GREEN, fontSize: 9, fontWeight: '700', fontFamily: mono, letterSpacing: 1.5 },
    navTime:   { color: MUTED, fontSize: 9, fontFamily: mono },

    // Error
    errorBanner:{ marginHorizontal: 16, marginBottom: 4, backgroundColor: 'rgba(255,113,108,0.10)',
                  borderWidth: 1, borderColor: 'rgba(255,113,108,0.30)', borderRadius: 4, padding: 10 },
    errorTxt:   { color: '#ff716c', fontSize: 11, fontFamily: mono },

    scroll: { paddingHorizontal: 16, paddingTop: 4 },

    // Hero
    hero:       { marginBottom: 20, gap: 6 },
    heroLabel:  { color: MUTED, fontSize: 9, fontFamily: mono, letterSpacing: 2.5 },
    heroValue:  { color: TXT, fontSize: 36, fontWeight: '800', fontFamily: sans, letterSpacing: -1 },
    heroRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
    heroSub:    { color: MUTED, fontSize: 11, fontFamily: mono },
    changePill: { flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 12, paddingVertical: 7,
                  borderRadius: 4, borderWidth: 1 },
    changeAmt:  { fontSize: 13, fontWeight: '700', fontFamily: mono },
    changeDivider: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.12)' },
    changePct:  { fontSize: 12, fontWeight: '700', fontFamily: mono },

    // Chart controls
    moreBtn:  { color: GOLD, fontSize: 9, fontWeight: '700', fontFamily: mono, letterSpacing: 1.5 },
    posCount: { color: MUTED, fontSize: 9, fontFamily: mono, letterSpacing: 1.5 },

    // Chart legend
    legend:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot:  { width: 7, height: 7, borderRadius: 3.5 },
    legendTxt:  { color: TXT2, fontSize: 10, fontFamily: mono },

    // Loading / empty
    loadingPill: { flexDirection: 'row', alignItems: 'center', gap: 10,
                   backgroundColor: CARD, borderRadius: 6, borderWidth: 1,
                   borderColor: BORDER, paddingHorizontal: 20, paddingVertical: 14 },
    loadingTxt:  { color: MUTED, fontSize: 12, fontFamily: mono, letterSpacing: 1 },
    emptyTitle:  { color: TXT, fontSize: 20, fontWeight: '700', fontFamily: sans, marginBottom: 8 },
    emptySub:    { color: MUTED, fontSize: 13, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
    emptyBtn:    { backgroundColor: GOLD_D, borderWidth: 1, borderColor: GOLD_B,
                   borderRadius: 4, paddingHorizontal: 28, paddingVertical: 14 },
    emptyBtnTxt: { color: GOLD, fontSize: 13, fontWeight: '700', fontFamily: sans },
});

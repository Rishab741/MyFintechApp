import React, { useCallback, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    LayoutAnimation,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';

if (Platform.OS === 'android') {
    UIManager.setLayoutAnimationEnabledExperimental?.(true);
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePortfolioData } from '@/src/portfolio/hooks/usePortfolioData';
import { usePerformanceMetrics } from '@/src/portfolio/hooks/usePerformanceMetrics';
import type { Period as EnginePeriod } from '@/src/services/engineClient';

import OverviewTab    from '@/src/portfolio/components/tabs/OverviewTab';
import PerformanceTab from '@/src/portfolio/components/tabs/PerformanceTab';
import RiskTab        from '@/src/portfolio/components/tabs/RiskTab';
import PositionsTab   from '@/src/portfolio/components/tabs/PositionsTab';

import {
    BG, CARD, CARD2,
    GOLD, GOLD_D,
    GREEN, GREEN_D, RED, RED_D,
    MUTED, TXT,
    sans, mono,
} from '@/src/portfolio/tokens';
import { fmtCurrency, fmt2, sign, getTicker, getUnits } from '@/src/portfolio/helpers';
import type { AllocSeg } from '@/src/portfolio/types';

// ─── Tokens aligned to Quantum Ledger ────────────────────────────────────────
const CYAN   = GOLD;
const CYAN_D = GOLD_D;

// ─── Tab definitions ──────────────────────────────────────────────────────────
type InternalTab = 'overview' | 'performance' | 'risk' | 'positions' | 'holdings';
const TABS: { key: InternalTab; label: string }[] = [
    { key: 'overview',    label: 'Overview'    },
    { key: 'performance', label: 'Performance' },
    { key: 'risk',        label: 'Risk'        },
    { key: 'positions',   label: 'Positions'   },
    { key: 'holdings',    label: 'Holdings'    },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard({ lines = 3 }: { lines?: number }) {
    const pulse = useRef(new Animated.Value(0.4)).current;
    React.useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 0.85, duration: 850, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
                Animated.timing(pulse, { toValue: 0.40, duration: 850, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
            ]),
        ).start();
    }, []);
    return (
        <Animated.View style={[sk.card, { opacity: pulse }]}>
            <View style={sk.title} />
            {Array.from({ length: lines }).map((_, i) => (
                <View key={i} style={[sk.line, { width: i === lines - 1 ? '55%' : '100%' }]} />
            ))}
        </Animated.View>
    );
}
const sk = StyleSheet.create({
    card:  { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16, marginBottom: 12 },
    title: { height: 12, width: '38%', backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 4, marginBottom: 14 },
    line:  { height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 10 },
});

// ─── Expandable holding row ───────────────────────────────────────────────────
function HoldingRow({ pos, currency, totalPos }: { pos: any; currency: string; totalPos: number }) {
    const [expanded, setExpanded] = useState(false);
    const chevronAnim = useRef(new Animated.Value(0)).current;

    const ticker   = getTicker(pos.symbol);
    const units    = getUnits(pos);
    const price    = pos.price ?? 0;
    const value    = units * price;
    const pnl      = pos.open_pnl ?? 0;
    const pnlPct   = value > 0 ? (pnl / (value - pnl)) * 100 : 0;
    const allocPct = totalPos > 0 ? (value / totalPos) * 100 : 0;
    const up       = pnl >= 0;

    const toggle = () => {
        LayoutAnimation.configureNext({
            duration: 240,
            create: { type: 'easeInEaseOut', property: 'opacity' },
            update: { type: 'easeInEaseOut' },
            delete: { type: 'easeInEaseOut', property: 'opacity' },
        });
        const next = !expanded;
        setExpanded(next);
        Animated.timing(chevronAnim, { toValue: next ? 1 : 0, duration: 220, useNativeDriver: true }).start();
    };

    const chevronDeg = chevronAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

    return (
        <Pressable
            onPress={toggle}
            style={[s.holdingRow, expanded && s.holdingRowOpen]}
            android_ripple={{ color: 'rgba(255,255,255,0.04)' }}
        >
            <View style={s.holdingRowMain}>
                <View style={s.holdingAvatar}>
                    <Text style={s.holdingAvatarTxt}>{ticker.slice(0, 2)}</Text>
                </View>
                <View style={s.holdingInfo}>
                    <Text style={s.holdingTicker}>{ticker}</Text>
                    <Text style={s.holdingUnits}>{units.toLocaleString('en-US', { maximumFractionDigits: 4 })} units</Text>
                </View>
                <View style={s.holdingRight}>
                    <Text style={s.holdingValue}>{fmtCurrency(value, currency)}</Text>
                    <Text style={[s.holdingPnl, { color: up ? GREEN : RED }]}>
                        {sign(pnlPct)}{Math.abs(pnlPct).toFixed(2)}%
                    </Text>
                </View>
                <Animated.Text style={[s.holdingChevron, { transform: [{ rotate: chevronDeg }] }]}>▾</Animated.Text>
            </View>

            {expanded && (
                <View style={s.holdingDetail}>
                    <View style={s.holdingDetailItem}>
                        <Text style={s.holdingDetailLbl}>PRICE</Text>
                        <Text style={s.holdingDetailVal}>{fmtCurrency(price, currency)}</Text>
                    </View>
                    <View style={s.holdingDetailDivider} />
                    <View style={s.holdingDetailItem}>
                        <Text style={s.holdingDetailLbl}>P&L</Text>
                        <Text style={[s.holdingDetailVal, { color: up ? GREEN : RED }]}>
                            {sign(pnl)}{fmtCurrency(Math.abs(pnl), currency)}
                        </Text>
                    </View>
                    <View style={s.holdingDetailDivider} />
                    <View style={s.holdingDetailItem}>
                        <Text style={s.holdingDetailLbl}>ALLOC</Text>
                        <Text style={s.holdingDetailVal}>{allocPct.toFixed(1)}%</Text>
                    </View>
                </View>
            )}
        </Pressable>
    );
}

// ─── Quick stat cell ──────────────────────────────────────────────────────────
const QuickCell: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = TXT }) => (
    <View style={s.quickCell}>
        <Text style={s.qLabel}>{label}</Text>
        <Text style={[s.qVal, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</Text>
    </View>
);

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PortfolioScreen() {
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = useState<InternalTab>('overview');
    const tabAnim   = useRef(new Animated.Value(1)).current;
    const slideAnim = useRef(new Animated.Value(0)).current;

    const switchTab = useCallback((next: InternalTab) => {
        if (next === activeTab) return;
        Animated.parallel([
            Animated.timing(tabAnim,   { toValue: 0, duration: 110, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 10, duration: 110, useNativeDriver: true }),
        ]).start(() => {
            setActiveTab(next);
            slideAnim.setValue(-10);
            Animated.parallel([
                Animated.timing(tabAnim,   { toValue: 1, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
                Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.back(1.1)) }),
            ]).start();
        });
    }, [activeTab]);

    const {
        loading, refreshing, connected, userName, lastUpdated, onRefresh,
        period, setPeriod, headerAnim,
        positions, currency, cash, totalPos, totalVal, totalPnl,
        snapValues, chartPortfolio, chartBench,
        periodReturn, sp500Return, vsMarket, dailyReturns,
        todayChange, todayChangePct, allocSegs, performers, risk, chartLabels,
        fetchError,
    } = usePortfolioData();

    const { data: metrics, source: metricsSource } = usePerformanceMetrics(period as EnginePeriod);

    const displayReturn = metrics ? metrics.twr * 100              : periodReturn;
    const displayBench  = metrics ? metrics.benchmark_return * 100 : sp500Return;
    const displayAlpha  = metrics ? metrics.alpha * 100            : vsMarket;

    const isUp = todayChangePct >= 0;

    const allocSegsWithPct: AllocSeg[] = allocSegs.map(seg => ({
        ...seg,
        pct: totalVal > 0 ? (seg.value / totalVal) * 100 : 0,
    }));

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={BG} />

            {/* ── Header ── */}
            <Animated.View style={[s.header, { opacity: headerAnim }]}>
                <View>
                    <Text style={s.headerSup}>VAULT</Text>
                    <Text style={s.headerTitle}>{userName}</Text>
                </View>
                <View style={s.headerRight}>
                    {lastUpdated && (
                        <View style={s.liveChip}>
                            <View style={s.liveDot} />
                            <Text style={s.liveTxt}>
                                {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </Text>
                        </View>
                    )}
                    <TouchableOpacity style={s.refreshBtn} onPress={onRefresh} hitSlop={8}>
                        <Text style={s.refreshIcon}>↺</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>

            {fetchError && (
                <View style={s.errorBanner}>
                    <Text style={s.errorTxt}>⚠  {fetchError}</Text>
                </View>
            )}

            {/* ── Loading ── */}
            {loading ? (
                <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                    <SkeletonCard lines={4} />
                    <SkeletonCard lines={3} />
                    <SkeletonCard lines={5} />
                </ScrollView>

            ) : !connected ? (
                <View style={s.empty}>
                    <Text style={s.emptyIcon}>📡</Text>
                    <Text style={s.emptyTitle}>No Account Connected</Text>
                    <Text style={s.emptySub}>Connect your brokerage from the Profile tab to see live portfolio data here.</Text>
                </View>

            ) : (
                <ScrollView
                    contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 80 }]}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CYAN} colors={[CYAN]} />
                    }
                >
                    {/* ── Hero ── */}
                    <View style={s.hero}>
                        <Text style={s.heroLabel}>Total Portfolio Value</Text>
                        <Text style={s.heroValue}>{fmtCurrency(totalVal, currency)}</Text>

                        <View style={[s.changePill, { backgroundColor: isUp ? GREEN_D : RED_D, borderColor: isUp ? `${GREEN}40` : `${RED}40` }]}>
                            <Text style={[s.changeTxt, { color: isUp ? GREEN : RED }]}>
                                {isUp ? '▲' : '▼'}  {sign(todayChangePct)}{fmt2(Math.abs(todayChangePct))}%
                            </Text>
                            <Text style={[s.changeSub, { color: isUp ? GREEN : RED }]}>
                                {sign(todayChange)}{fmtCurrency(Math.abs(todayChange), currency)}  ·  today
                            </Text>
                        </View>
                    </View>

                    {/* ── Quick stats row ── */}
                    <View style={s.statsRow}>
                        <QuickCell label="POSITIONS"  value={String(positions.length)} />
                        <View style={s.statDivider} />
                        <QuickCell label="CASH"       value={fmtCurrency(cash, currency)} />
                        <View style={s.statDivider} />
                        <QuickCell label="INVESTED"   value={fmtCurrency(totalPos, currency)} />
                        {totalPnl !== 0 && (
                            <>
                                <View style={s.statDivider} />
                                <QuickCell
                                    label="P&L"
                                    value={`${sign(totalPnl)}${fmtCurrency(Math.abs(totalPnl), currency)}`}
                                    color={totalPnl >= 0 ? GREEN : RED}
                                />
                            </>
                        )}
                    </View>

                    {/* ── Pill segmented control ── */}
                    <View style={s.segTrack}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={s.segScroll}
                        >
                            {TABS.map(tab => {
                                const active = activeTab === tab.key;
                                return (
                                    <TouchableOpacity
                                        key={tab.key}
                                        style={[s.segItem, active && s.segItemActive]}
                                        onPress={() => switchTab(tab.key)}
                                        activeOpacity={0.75}
                                    >
                                        <Text style={[s.segTxt, active && s.segTxtActive]}>
                                            {tab.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* ── Tab content ── */}
                    <Animated.View style={{ opacity: tabAnim, transform: [{ translateY: slideAnim }] }}>

                        {activeTab === 'overview' && (
                            <OverviewTab
                                totalVal={totalVal}
                                totalPos={totalPos}
                                totalPnl={totalPnl}
                                cash={cash}
                                currency={currency}
                                positions={positions}
                                allocSegs={allocSegsWithPct}
                            />
                        )}

                        {activeTab === 'performance' && (
                            <PerformanceTab
                                period={period}
                                onPeriodChange={setPeriod}
                                chartPortfolio={chartPortfolio}
                                chartBench={chartBench}
                                chartLabels={chartLabels}
                                dailyReturns={dailyReturns}
                                displayReturn={displayReturn}
                                displayBench={displayBench}
                                displayAlpha={displayAlpha}
                                metrics={metrics}
                                metricsSource={metricsSource}
                            />
                        )}

                        {activeTab === 'risk' && (
                            <RiskTab
                                risk={risk}
                                metrics={metrics}
                                snapValues={snapValues}
                                displayAlpha={displayAlpha}
                            />
                        )}

                        {activeTab === 'positions' && (
                            <PositionsTab
                                positions={positions}
                                performers={performers}
                                totalPos={totalPos}
                                currency={currency}
                            />
                        )}

                        {activeTab === 'holdings' && (
                            <View style={s.holdingsWrap}>
                                {positions.length === 0 ? (
                                    <Text style={s.holdingsEmpty}>No positions found.</Text>
                                ) : (
                                    positions.map((pos, i) => {
                                        const ticker = getTicker(pos.symbol);
                                        return (
                                            <HoldingRow
                                                key={`${ticker}-${i}`}
                                                pos={pos}
                                                currency={currency}
                                                totalPos={totalPos}
                                            />
                                        );
                                    })
                                )}
                            </View>
                        )}

                        <View style={s.footer}>
                            <View style={s.footerLine} />
                            <Text style={s.footerTxt}>PLATSTOCK · LIVE DATA</Text>
                            <View style={s.footerLine} />
                        </View>
                    </Animated.View>
                </ScrollView>
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 18, paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(30,51,71,0.8)',
    },
    headerSup:   { color: MUTED, fontSize: 9, fontFamily: mono, letterSpacing: 3, marginBottom: 2 },
    headerTitle: { color: TXT, fontSize: 17, fontWeight: '700', fontFamily: sans, letterSpacing: -0.3 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    liveChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: GREEN_D, borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth, borderColor: `${GREEN}40`,
        paddingHorizontal: 8, paddingVertical: 5,
    },
    liveDot: {
        width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN,
    },
    liveTxt:    { color: GREEN, fontSize: 10, fontFamily: mono, letterSpacing: 0.5 },
    refreshBtn: {
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: CARD2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(65,72,87,0.6)',
        alignItems: 'center', justifyContent: 'center',
    },
    refreshIcon: { color: MUTED, fontSize: 16, lineHeight: 20 },

    // Error
    errorBanner: {
        marginHorizontal: 16, marginTop: 6,
        backgroundColor: 'rgba(255,113,108,0.10)', borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,113,108,0.30)',
        paddingHorizontal: 12, paddingVertical: 8,
    },
    errorTxt: { color: '#ff716c', fontSize: 11, fontFamily: mono },

    // Scroll
    scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 0 },

    // Hero
    hero: {
        backgroundColor: CARD, borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(65,72,87,0.8)',
        padding: 20, marginBottom: 10,
    },
    heroLabel: { color: MUTED, fontSize: 10, fontFamily: mono, letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' },
    heroValue: { color: TXT, fontSize: 36, fontWeight: '800', fontFamily: sans, letterSpacing: -1, marginBottom: 12 },
    changePill: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 12, paddingVertical: 7,
        borderRadius: 8, borderWidth: StyleSheet.hairlineWidth,
        alignSelf: 'flex-start',
    },
    changeTxt: { fontSize: 13, fontWeight: '700', fontFamily: mono },
    changeSub: { fontSize: 11, fontFamily: sans },

    // Stats row
    statsRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: CARD, borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(65,72,87,0.8)',
        paddingVertical: 14, paddingHorizontal: 12,
        marginBottom: 16,
    },
    quickCell:   { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
    qLabel:      { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 1.5, marginBottom: 4, textTransform: 'uppercase' },
    qVal:        { fontSize: 12, fontWeight: '700', fontFamily: mono, color: TXT },
    statDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: 'rgba(65,72,87,0.6)' },

    // Pill segmented control
    segTrack: {
        backgroundColor: CARD2,
        borderRadius: 10,
        padding: 3,
        marginBottom: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(65,72,87,0.5)',
    },
    segScroll: {
        gap: 2,
    },
    segItem: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
    },
    segItemActive: {
        backgroundColor: CYAN_D,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: `${CYAN}30`,
    },
    segTxt: {
        color: MUTED, fontSize: 12, fontWeight: '600', fontFamily: sans,
        letterSpacing: 0.1,
    },
    segTxtActive: { color: CYAN, fontWeight: '700' },

    // Empty state
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 12 },
    emptyIcon:  { fontSize: 44 },
    emptyTitle: { color: TXT, fontSize: 18, fontWeight: '700', fontFamily: sans, textAlign: 'center' },
    emptySub:   { color: MUTED, fontSize: 13, fontFamily: sans, textAlign: 'center', lineHeight: 20 },

    // Footer
    footer:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 8 },
    footerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(65,72,87,0.5)' },
    footerTxt:  { color: MUTED, fontSize: 9, letterSpacing: 2, fontFamily: mono },

    // Holdings tab
    holdingsWrap:  { paddingTop: 4 },
    holdingsEmpty: { color: MUTED, fontSize: 13, fontFamily: sans, textAlign: 'center', paddingVertical: 32 },

    holdingRow: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(65,72,87,0.5)',
        paddingVertical: 4,
    },
    holdingRowOpen: {
        backgroundColor: 'rgba(14,165,233,0.04)',
        borderBottomColor: `${CYAN}25`,
    },
    holdingRowMain: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 10, paddingHorizontal: 2,
    },
    holdingAvatar: {
        width: 38, height: 38, borderRadius: 10,
        backgroundColor: CYAN_D,
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    holdingAvatarTxt: { color: CYAN, fontSize: 12, fontWeight: '700', fontFamily: mono },
    holdingInfo:      { flex: 1, minWidth: 0 },
    holdingTicker:    { color: TXT,  fontSize: 14, fontWeight: '700', fontFamily: sans },
    holdingUnits:     { color: MUTED, fontSize: 11, fontFamily: mono, marginTop: 2 },
    holdingRight:     { alignItems: 'flex-end' },
    holdingValue:     { color: TXT,  fontSize: 14, fontWeight: '600', fontFamily: mono },
    holdingPnl:       { fontSize: 11, fontFamily: mono, marginTop: 2 },
    holdingChevron:   { color: MUTED, fontSize: 14, lineHeight: 18, flexShrink: 0 },

    holdingDetail: {
        flexDirection: 'row',
        paddingHorizontal: 50,
        paddingBottom: 12,
        gap: 0,
    },
    holdingDetailItem: {
        flex: 1,
        backgroundColor: CARD2,
        borderRadius: 7,
        paddingVertical: 8,
        paddingHorizontal: 10,
        alignItems: 'center',
    },
    holdingDetailLbl: {
        color: MUTED, fontSize: 8, fontFamily: mono,
        letterSpacing: 1.2, marginBottom: 3, textTransform: 'uppercase',
    },
    holdingDetailVal: {
        color: TXT, fontSize: 12, fontWeight: '700', fontFamily: mono,
    },
    holdingDetailDivider: { width: 4 },
});

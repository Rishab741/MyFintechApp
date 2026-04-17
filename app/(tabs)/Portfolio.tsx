/**
 * Portfolio.tsx — Vestara Quantum Dashboard (orchestrator)
 * Sticky net-worth hero + internal tab bar (Overview | Performance | Risk | Positions)
 */

import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { usePortfolioData } from '@/src/portfolio/hooks/usePortfolioData';
import { usePerformanceMetrics } from '@/src/portfolio/hooks/usePerformanceMetrics';
import type { Period as EnginePeriod } from '@/src/services/engineClient';

import OverviewTab     from '@/src/portfolio/components/tabs/OverviewTab';
import PerformanceTab  from '@/src/portfolio/components/tabs/PerformanceTab';
import RiskTab         from '@/src/portfolio/components/tabs/RiskTab';
import PositionsTab    from '@/src/portfolio/components/tabs/PositionsTab';

import Card from '@/src/portfolio/components/Card';
import {
    BG, CARD2, BORDER,
    GOLD, GOLD_D, GOLD_B, GOLD_L,
    GREEN, GREEN_D, RED, RED_D,
    MUTED, SUB, TXT, TXT2,
    sans, mono,
} from '@/src/portfolio/tokens';
import { fmtCurrency, fmt2, sign } from '@/src/portfolio/helpers';
import type { AllocSeg } from '@/src/portfolio/types';

// ─── Internal tab definition ──────────────────────────────────────────────────
type InternalTab = 'overview' | 'performance' | 'risk' | 'positions';
const TABS: { key: InternalTab; label: string }[] = [
    { key: 'overview',     label: 'Overview'    },
    { key: 'performance',  label: 'Performance' },
    { key: 'risk',         label: 'Risk'        },
    { key: 'positions',    label: 'Positions'   },
];

export default function PortfolioScreen() {
    const [activeTab, setActiveTab] = useState<InternalTab>('overview');

    const {
        loading, refreshing, connected, userName, lastUpdated,
        period, setPeriod, headerAnim, onRefresh,
        positions, currency, cash, totalPos, totalVal, totalPnl,
        snapValues, chartPortfolio, chartBench,
        periodReturn, sp500Return, vsMarket, dailyReturns,
        todayChange, todayChangePct, allocSegs, performers, risk, chartLabels,
        fetchError,
    } = usePortfolioData();

    const { data: metrics, source: metricsSource } = usePerformanceMetrics(period as EnginePeriod);

    const displayReturn  = metrics ? metrics.twr * 100              : periodReturn;
    const displayBench   = metrics ? metrics.benchmark_return * 100 : sp500Return;
    const displayAlpha   = metrics ? metrics.alpha * 100            : vsMarket;

    const isUp = todayChangePct >= 0;

    // Build AllocSeg list with pct for OverviewTab
    const allocSegsWithPct: AllocSeg[] = allocSegs.map(seg => ({
        ...seg,
        pct: totalVal > 0 ? (seg.value / totalVal) * 100 : 0,
    }));

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" backgroundColor={BG} />

            {/* Ambient glows */}
            <View style={s.glow1} />
            <View style={s.glow2} />

            {/* ── Nav bar ── */}
            <Animated.View style={[s.nav, { opacity: headerAnim }]}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Text style={s.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.navSup}>PORTFOLIO</Text>
                    <Text style={s.navTitle}>{userName}</Text>
                </View>
                {lastUpdated && (
                    <View style={s.liveChip}>
                        <View style={s.liveDot} />
                        <Text style={s.liveTxt}>
                            {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </Text>
                    </View>
                )}
                <TouchableOpacity style={s.refreshBtn} onPress={onRefresh}>
                    <Text style={{ fontSize: 18, color: SUB }}>⟳</Text>
                </TouchableOpacity>
            </Animated.View>

            {fetchError && (
                <View style={s.errorBanner}>
                    <Text style={s.errorBannerTxt}>⚠ {fetchError}</Text>
                </View>
            )}

            {/* ── Loading ── */}
            {loading ? (
                <View style={s.centred}>
                    <ActivityIndicator color={GOLD} size="large" />
                    <Text style={s.loadingTxt}>Syncing portfolio…</Text>
                </View>

            ) : !connected ? (
                <View style={s.centred}>
                    <Text style={{ fontSize: 48, marginBottom: 18 }}>📡</Text>
                    <Text style={s.emptyTitle}>No Account Connected</Text>
                    <Text style={s.emptySub}>
                        Connect your brokerage from the Profile tab to see live data here.
                    </Text>
                    <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()}>
                        <Text style={s.emptyBtnTxt}>Go to Profile  →</Text>
                    </TouchableOpacity>
                </View>

            ) : (
                <ScrollView
                    contentContainerStyle={s.scroll}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />
                    }
                >
                    {/* ── Net Worth hero card ── */}
                    <Card glow={GOLD} style={s.heroCard}>
                        <Text style={s.heroLabel}>NET WORTH VALUE</Text>
                        <Text style={s.heroValue}>{fmtCurrency(totalVal, currency)}</Text>

                        <View style={s.heroRow}>
                            <View style={[s.changePill,
                                { backgroundColor: isUp ? GREEN_D : RED_D,
                                  borderColor: isUp ? `${GREEN}40` : `${RED}40` }]}>
                                <Text style={[s.changeTxt, { color: isUp ? GREEN : RED }]}>
                                    {isUp ? '▲' : '▼'}  {sign(todayChangePct)}{fmt2(Math.abs(todayChangePct))}%
                                </Text>
                            </View>
                            <Text style={s.heroSub}>
                                {sign(todayChange)}{fmtCurrency(Math.abs(todayChange), currency)}  ·  Last 30 days
                            </Text>
                        </View>

                        <View style={s.quickRow}>
                            <QuickCell label="POSITIONS" value={String(positions.length)} />
                            <View style={s.qDiv} />
                            <QuickCell label="CASH"      value={fmtCurrency(cash, currency)} />
                            <View style={s.qDiv} />
                            <QuickCell label="INVESTED"  value={fmtCurrency(totalPos, currency)} />
                            {totalPnl !== 0 && <>
                                <View style={s.qDiv} />
                                <QuickCell
                                    label="TOTAL P&L"
                                    value={`${sign(totalPnl)}${fmtCurrency(Math.abs(totalPnl), currency)}`}
                                    color={totalPnl >= 0 ? GREEN : RED}
                                />
                            </>}
                        </View>
                    </Card>

                    {/* ── Internal tab bar ── */}
                    <View style={s.tabBar}>
                        {TABS.map(tab => {
                            const active = activeTab === tab.key;
                            return (
                                <TouchableOpacity
                                    key={tab.key}
                                    style={[s.tabBtn, active && s.tabBtnActive]}
                                    onPress={() => setActiveTab(tab.key)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[s.tabTxt, active && s.tabTxtActive]}>
                                        {tab.label}
                                    </Text>
                                    {active && <View style={s.tabIndicator} />}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* ── Active tab content ── */}
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

                    {/* ── Footer ── */}
                    <View style={s.footer}>
                        <View style={s.footerLine} />
                        <Text style={s.footerTxt}>VESTARA  ·  LIVE DATA  ·  SNAPTRADE</Text>
                        <View style={s.footerLine} />
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

const QuickCell: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = TXT2 }) => (
    <View style={s.quickCell}>
        <Text style={s.qLabel}>{label}</Text>
        <Text style={[s.qVal, { color }]}>{value}</Text>
    </View>
);

const s = StyleSheet.create({
    root:   { flex: 1, backgroundColor: BG },
    glow1:  { position: 'absolute', top: -100, right: -100, width: 300, height: 300,
               borderRadius: 150, backgroundColor: 'rgba(143,245,255,0.05)' },
    glow2:  { position: 'absolute', top: 340, left: -80, width: 220, height: 220,
               borderRadius: 110, backgroundColor: 'rgba(172,137,255,0.05)' },

    // Nav
    nav:        { flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 18, paddingTop: Platform.OS === 'ios' ? 58 : 40,
                  paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
    backBtn:    { width: 36, height: 36, borderRadius: 4, backgroundColor: CARD2,
                  borderWidth: 1, borderColor: BORDER,
                  shadowColor: GOLD, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
                  alignItems: 'center', justifyContent: 'center' },
    backArrow:  { color: GOLD, fontSize: 22, lineHeight: 24, marginTop: -2 },
    navSup:     { color: MUTED, fontSize: 9, fontFamily: mono, letterSpacing: 3, marginBottom: 2 },
    navTitle:   { color: TXT, fontSize: 16, fontWeight: '800', fontFamily: sans, letterSpacing: -0.3 },
    liveChip:   { flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: GREEN_D, borderRadius: 4, borderWidth: 1,
                  borderColor: `${GREEN}35`, paddingHorizontal: 8, paddingVertical: 4 },
    liveDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN,
                  shadowColor: GREEN, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
    liveTxt:    { color: GREEN, fontSize: 9, fontFamily: mono, letterSpacing: 1 },
    refreshBtn: { width: 36, height: 36, borderRadius: 4, backgroundColor: CARD2,
                  borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },

    errorBanner:    { marginHorizontal: 16, marginTop: 8, backgroundColor: 'rgba(255,113,108,0.12)',
                      borderWidth: 1, borderColor: 'rgba(255,113,108,0.35)', borderRadius: 4, padding: 10 },
    errorBannerTxt: { color: '#ff716c', fontSize: 11, fontFamily: mono, letterSpacing: 0.3 },

    scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 52 },

    // Hero card
    heroCard:   { borderTopWidth: 1, borderTopColor: `${GOLD}60` },
    heroLabel:  { color: MUTED, fontSize: 9, fontFamily: mono, letterSpacing: 3.5, marginBottom: 8 },
    heroValue:  { color: TXT, fontSize: 38, fontWeight: '800', fontFamily: sans,
                  letterSpacing: -1, marginBottom: 14 },
    heroRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
    changePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
                  paddingVertical: 6, borderRadius: 4, borderWidth: 1 },
    changeTxt:  { fontSize: 13, fontWeight: '700', fontFamily: mono },
    heroSub:    { color: MUTED, fontSize: 12, fontFamily: sans },
    quickRow:   { flexDirection: 'row', backgroundColor: CARD2, borderRadius: 4,
                  borderWidth: 1, borderColor: BORDER, padding: 14 },
    quickCell:  { flex: 1, alignItems: 'center' },
    qLabel:     { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 2, marginBottom: 5 },
    qVal:       { fontSize: 12, fontWeight: '700', fontFamily: mono },
    qDiv:       { width: 1, backgroundColor: 'rgba(65,72,87,0.6)', marginHorizontal: 6, alignSelf: 'stretch' },

    // Internal tab bar
    tabBar:         { flexDirection: 'row', marginBottom: 16, backgroundColor: CARD2,
                      borderRadius: 6, borderWidth: 1, borderColor: BORDER, padding: 3, gap: 2 },
    tabBtn:         { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 4,
                      position: 'relative' },
    tabBtnActive:   { backgroundColor: GOLD_D, borderWidth: 1, borderColor: GOLD_B },
    tabTxt:         { color: MUTED, fontSize: 10, fontWeight: '600', fontFamily: mono, letterSpacing: 0.5 },
    tabTxtActive:   { color: GOLD },
    tabIndicator:   { position: 'absolute', bottom: 0, left: '20%', right: '20%',
                      height: 2, backgroundColor: GOLD, borderRadius: 1 },

    // Loading / empty
    centred:     { flex: 1, alignItems: 'center', justifyContent: 'center',
                   paddingHorizontal: 36, gap: 10 },
    loadingTxt:  { color: MUTED, fontSize: 12, fontFamily: mono, letterSpacing: 1, marginTop: 10 },
    emptyTitle:  { color: TXT, fontSize: 20, fontWeight: '700', fontFamily: sans },
    emptySub:    { color: MUTED, fontSize: 13, textAlign: 'center', lineHeight: 22 },
    emptyBtn:    { marginTop: 20, backgroundColor: GOLD_D, borderWidth: 1, borderColor: GOLD_B,
                   borderRadius: 4, paddingHorizontal: 28, paddingVertical: 14 },
    emptyBtnTxt: { color: GOLD_L, fontSize: 14, fontWeight: '700', fontFamily: sans },

    // Footer
    footer:     { flexDirection: 'row', alignItems: 'center', gap: 10,
                  marginTop: 20, marginBottom: 8 },
    footerLine: { flex: 1, height: 1, backgroundColor: 'rgba(65,72,87,0.5)' },
    footerTxt:  { color: MUTED, fontSize: 9, letterSpacing: 2.5, fontFamily: mono },
});

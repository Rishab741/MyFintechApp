/**
 * Portfolio.tsx — Vestara Quantum Dashboard
 * Theme: Deep navy · Electric cyan · Sharp-but-refined cards
 */

import { router } from 'expo-router';
import React from 'react';
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
import { LineChart, DonutChart, ReturnsHistogram, DrawdownChart } from '@/src/portfolio/charts';
import {
    Metric, PeriodTabs, SHead, Card, HoldingRow,
    PerformersSection, RiskGrid,
} from '@/src/portfolio/components';
import {
    BG, CARD, CARD2, BORDER, BORDER2,
    GOLD, GOLD_L, GOLD_D, GOLD_B,
    GREEN, GREEN_D, RED, RED_D,
    BLUE, BLUE_D, PURPLE, PURPLE_D,
    TXT, TXT2, MUTED, SUB,
    sans, mono, CHART_W,
} from '@/src/portfolio/tokens';
import { fmtCurrency, fmt2, sign, getTicker } from '@/src/portfolio/helpers';

// ─── Allocation bar row ────────────────────────────────────────────────────────
const ALLOC_COLORS = ['#00E5FF', '#6366F1', '#A78BFA', '#14B8A6', '#FB923C', '#F472B6'];

const AllocRow: React.FC<{ label: string; pct: number; color: string; value: string }> =
    ({ label, pct, color, value }) => (
    <View style={al.row}>
        <Text style={al.label}>{label.toUpperCase()}</Text>
        <View style={al.track}>
            <View style={[al.fill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
        </View>
        <Text style={[al.pct, { color }]}>{fmt2(pct)}%</Text>
    </View>
);
const al = StyleSheet.create({
    row:   { marginBottom: 12 },
    label: { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 2, marginBottom: 6 },
    track: { height: 5, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3,
             overflow: 'hidden', marginBottom: 4 },
    fill:  { height: '100%', borderRadius: 3, opacity: 0.85 },
    pct:   { fontSize: 11, fontWeight: '700', fontFamily: mono },
});

// ─── Insight alert banner ──────────────────────────────────────────────────────
const InsightBanner: React.FC<{ title: string; body: string }> = ({ title, body }) => (
    <View style={ib.wrap}>
        <View style={ib.dot} />
        <View style={{ flex: 1 }}>
            <Text style={ib.title}>{title}</Text>
            <Text style={ib.body}>{body}</Text>
        </View>
    </View>
);
const ib = StyleSheet.create({
    wrap:  { backgroundColor: `${GOLD}0A`, borderWidth: 1, borderColor: `${GOLD}22`,
             borderRadius: 10, padding: 12, flexDirection: 'row', gap: 10, marginBottom: 16 },
    dot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD, marginTop: 4 },
    title: { color: GOLD_L, fontSize: 12, fontWeight: '700', fontFamily: sans, marginBottom: 3 },
    body:  { color: TXT2, fontSize: 11, lineHeight: 17 },
});

// ─── Hex risk score ────────────────────────────────────────────────────────────
const RiskScore: React.FC<{ score: number; label: string }> = ({ score, label }) => {
    const color = score >= 75 ? RED : score >= 50 ? GOLD : GREEN;
    return (
        <View style={rs.wrap}>
            <View style={[rs.hex, { borderColor: `${color}40`, backgroundColor: `${color}10` }]}>
                <Text style={[rs.num, { color }]}>{score}</Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={rs.scoreLabel}>RISK SCORE</Text>
                <Text style={[rs.riskName, { color }]}>{label}</Text>
                <Text style={rs.updated}>UPDATED 2M AGO</Text>
            </View>
        </View>
    );
};
const rs = StyleSheet.create({
    wrap:       { flexDirection: 'row', alignItems: 'center', gap: 14 },
    hex:        { width: 64, height: 64, borderRadius: 12, borderWidth: 2,
                  alignItems: 'center', justifyContent: 'center' },
    num:        { fontSize: 26, fontWeight: '800', fontFamily: sans },
    scoreLabel: { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 2, marginBottom: 2 },
    riskName:   { fontSize: 14, fontWeight: '700', fontFamily: sans, marginBottom: 3 },
    updated:    { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 1 },
});

// ─── Stat pair ─────────────────────────────────────────────────────────────────
const StatPair: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = TXT }) => (
    <View style={{ flex: 1 }}>
        <Text style={{ color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 2, marginBottom: 4 }}>{label}</Text>
        <Text style={{ color, fontSize: 18, fontWeight: '700', fontFamily: sans }}>{value}</Text>
    </View>
);

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function PortfolioScreen() {
    const {
        loading, refreshing, connected, userName, lastUpdated,
        period, setPeriod, headerAnim, onRefresh,
        positions, currency, cash, totalPos, totalVal, totalPnl,
        snapValues, chartPortfolio, chartBench,
        periodReturn, sp500Return, vsMarket, dailyReturns,
        todayChange, todayChangePct, allocSegs, performers, risk, chartLabels,
    } = usePortfolioData();

    const isUp = todayChangePct >= 0;

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

            {/* ── Loading ── */}
            {loading ? (
                <View style={s.centred}>
                    <ActivityIndicator color={GOLD} size="large" />
                    <Text style={s.loadingTxt}>Syncing portfolio…</Text>
                </View>

            /* ── Not connected ── */
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

            /* ── Dashboard ── */
            ) : (
                <ScrollView
                    contentContainerStyle={s.scroll}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />
                    }
                >

                    {/* ── Net Worth ── */}
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

                        {/* Quick stats row */}
                        <View style={s.quickRow}>
                            <View style={s.quickCell}>
                                <Text style={s.qLabel}>POSITIONS</Text>
                                <Text style={s.qVal}>{positions.length}</Text>
                            </View>
                            <View style={s.qDiv} />
                            <View style={s.quickCell}>
                                <Text style={s.qLabel}>CASH</Text>
                                <Text style={s.qVal}>{fmtCurrency(cash, currency)}</Text>
                            </View>
                            <View style={s.qDiv} />
                            <View style={s.quickCell}>
                                <Text style={s.qLabel}>INVESTED</Text>
                                <Text style={s.qVal}>{fmtCurrency(totalPos, currency)}</Text>
                            </View>
                            {totalPnl !== 0 && <>
                                <View style={s.qDiv} />
                                <View style={s.quickCell}>
                                    <Text style={s.qLabel}>TOTAL P&L</Text>
                                    <Text style={[s.qVal, { color: totalPnl >= 0 ? GREEN : RED }]}>
                                        {sign(totalPnl)}{fmtCurrency(Math.abs(totalPnl), currency)}
                                    </Text>
                                </View>
                            </>}
                        </View>
                    </Card>

                    {/* ── Asset Allocation (bars) ── */}
                    {allocSegs.length > 0 && (
                        <Card>
                            <SHead title="Asset Allocation" />
                            {allocSegs.map((seg, i) => (
                                <AllocRow
                                    key={i}
                                    label={seg.label}
                                    pct={(seg.value / totalVal) * 100}
                                    color={ALLOC_COLORS[i % ALLOC_COLORS.length]}
                                    value={fmtCurrency(seg.value, currency)}
                                />
                            ))}
                            <TouchableOpacity style={s.rebalanceBtn}>
                                <Text style={s.rebalanceTxt}>REBALANCE PORTFOLIO</Text>
                            </TouchableOpacity>
                        </Card>
                    )}

                    {/* ── Historical Performance ── */}
                    <Card>
                        <SHead
                            title="Historical Performance"
                            right={<Text style={s.tagMuted}>vs S&P 500</Text>}
                        />
                        <Text style={s.chartSub}>Simulated real-time tracking of aggregate assets</Text>

                        <PeriodTabs selected={period} onChange={setPeriod} />

                        <View style={s.returnRow}>
                            <Metric
                                label="Your Return"
                                value={`${sign(periodReturn)}${fmt2(periodReturn)}%`}
                                color={periodReturn >= 0 ? GREEN : RED}
                            />
                            <View style={s.returnDiv} />
                            <Metric
                                label="S&P 500"
                                value={`${sign(sp500Return)}${fmt2(sp500Return)}%`}
                                color={SUB}
                            />
                            <View style={s.returnDiv} />
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
                                { values: chartBench, color: MUTED, width: 1.5, opacity: 0.35 },
                            ]}
                            w={CHART_W} h={130}
                        />

                        {chartLabels[0] && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                                {chartLabels.map((l, i) => (
                                    <Text key={i} style={s.chartLabel}>{l}</Text>
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

                    {/* ── Top Holdings ── */}
                    <Card>
                        <SHead
                            title="Top Holdings"
                            right={
                                <View style={[s.tagPill, { backgroundColor: GOLD_D, borderColor: `${GOLD}35` }]}>
                                    <Text style={{ color: GOLD, fontSize: 10 }}>⚡</Text>
                                </View>
                            }
                        />
                        {positions.length > 0
                            ? positions.slice(0, 4).map((pos, i) => (
                                <HoldingRow key={`${getTicker(pos.symbol)}-${i}`} pos={pos} totalValue={totalPos} index={i} />
                            ))
                            : <Text style={s.emptyMsg}>No positions · pull to refresh</Text>
                        }
                        {positions.length > 4 && (
                            <TouchableOpacity style={s.viewAllBtn}>
                                <Text style={s.viewAllTxt}>VIEW ALL HOLDINGS  →</Text>
                            </TouchableOpacity>
                        )}
                    </Card>

                    {/* ── Quantum Insights ── */}
                    <Card>
                        <SHead title="Quantum Insights" />

                        <InsightBanner
                            title="Exposure Alert"
                            body={
                                allocSegs.length > 0
                                    ? `Your portfolio is concentrated in ${allocSegs[0]?.label ?? 'one asset class'}. Consider rebalancing towards diversified holdings.`
                                    : 'Connect your brokerage to receive AI-powered portfolio insights.'
                            }
                        />

                        {risk && (
                            <>
                                <RiskScore
                                    score={Math.round(Math.min(Math.max((risk.annStd / 40) * 100, 10), 99))}
                                    label={risk.annStd > 30 ? 'Aggressive' : risk.annStd > 15 ? 'Moderate' : 'Conservative'}
                                />

                                <View style={s.insightDivider} />

                                <View style={{ flexDirection: 'row' }}>
                                    <StatPair
                                        label="SHARPE RATIO"
                                        value={fmt2(risk.sharpe)}
                                        color={risk.sharpe >= 1 ? GREEN : risk.sharpe >= 0 ? GOLD : RED}
                                    />
                                    <View style={s.returnDiv} />
                                    <StatPair
                                        label="ALPHA YTD"
                                        value={`${sign(vsMarket)}${fmt2(vsMarket)}%`}
                                        color={vsMarket >= 0 ? GREEN : RED}
                                    />
                                </View>
                            </>
                        )}
                    </Card>

                    {/* ── Returns Histogram ── */}
                    <Card>
                        <SHead
                            title="Returns Distribution"
                            right={
                                <View style={[s.tagPill, { backgroundColor: PURPLE_D, borderColor: `${PURPLE}35` }]}>
                                    <Text style={{ color: PURPLE, fontSize: 9, fontWeight: '700', fontFamily: mono }}>HISTOGRAM</Text>
                                </View>
                            }
                        />
                        <ReturnsHistogram returns={dailyReturns} w={CHART_W} h={90} />
                    </Card>

                    {/* ── Drawdown ── */}
                    {snapValues.length >= 3 && (
                        <Card>
                            <SHead
                                title="Drawdown Analysis"
                                right={
                                    <View style={[s.tagPill, { backgroundColor: RED_D, borderColor: `${RED}35` }]}>
                                        <Text style={{ color: RED, fontSize: 9, fontWeight: '700', fontFamily: mono }}>UNDERWATER</Text>
                                    </View>
                                }
                            />
                            <DrawdownChart values={snapValues} w={CHART_W} h={90} />
                        </Card>
                    )}

                    {/* ── Risk Metrics ── */}
                    {risk && (
                        <Card>
                            <SHead title="Risk Analysis" />
                            <RiskGrid risk={risk} />
                        </Card>
                    )}

                    {/* ── All Performers ── */}
                    <PerformersSection top={performers.top} bottom={performers.bottom} />

                    {/* ── All Holdings ── */}
                    {positions.length > 4 && (
                        <>
                            <SHead
                                title={`All Holdings · ${positions.length} assets`}
                                right={
                                    <Text style={s.tagMuted}>{fmtCurrency(totalPos, currency)}</Text>
                                }
                            />
                            {positions.slice(4).map((pos, i) => (
                                <HoldingRow key={`${getTicker(pos.symbol)}-extra-${i}`} pos={pos} totalValue={totalPos} index={i + 4} />
                            ))}
                        </>
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

const s = StyleSheet.create({
    root:   { flex: 1, backgroundColor: BG },
    glow1:  { position: 'absolute', top: -80, right: -80, width: 280, height: 280,
               borderRadius: 140, backgroundColor: 'rgba(0,229,255,0.04)' },
    glow2:  { position: 'absolute', top: 320, left: -80, width: 220, height: 220,
               borderRadius: 110, backgroundColor: 'rgba(99,102,241,0.05)' },

    // Nav
    nav:        { flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 18, paddingTop: Platform.OS === 'ios' ? 58 : 40,
                  paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
    backBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: CARD2,
                  borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    backArrow:  { color: GOLD, fontSize: 22, lineHeight: 24, marginTop: -2 },
    navSup:     { color: MUTED, fontSize: 9, fontFamily: mono, letterSpacing: 2.5, marginBottom: 2 },
    navTitle:   { color: TXT, fontSize: 15, fontWeight: '700', fontFamily: sans },
    liveChip:   { flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: GREEN_D, borderRadius: 8, borderWidth: 1,
                  borderColor: `${GREEN}35`, paddingHorizontal: 8, paddingVertical: 4 },
    liveDot:    { width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN },
    liveTxt:    { color: GREEN, fontSize: 9, fontFamily: mono, letterSpacing: 0.5 },
    refreshBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: CARD2,
                  borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },

    scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 52 },

    // Hero card
    heroCard:   { borderTopWidth: 2, borderTopColor: `${GOLD}50` },
    heroLabel:  { color: MUTED, fontSize: 9, fontFamily: mono, letterSpacing: 3, marginBottom: 8 },
    heroValue:  { color: TXT, fontSize: 36, fontWeight: '800', fontFamily: sans,
                  letterSpacing: -0.5, marginBottom: 14 },
    heroRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
    changePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
                  paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
    changeTxt:  { fontSize: 13, fontWeight: '700', fontFamily: sans },
    heroSub:    { color: SUB, fontSize: 12, fontFamily: sans },
    quickRow:   { flexDirection: 'row', backgroundColor: `${CARD2}`, borderRadius: 12,
                  borderWidth: 1, borderColor: BORDER, padding: 14 },
    quickCell:  { flex: 1, alignItems: 'center' },
    qLabel:     { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 1.5, marginBottom: 5 },
    qVal:       { color: TXT2, fontSize: 12, fontWeight: '700', fontFamily: mono },
    qDiv:       { width: 1, backgroundColor: BORDER, marginHorizontal: 6, alignSelf: 'stretch' },

    // Rebalance button
    rebalanceBtn: { marginTop: 4, borderWidth: 1, borderColor: `${GOLD}30`,
                    borderRadius: 8, paddingVertical: 12, alignItems: 'center',
                    backgroundColor: GOLD_D },
    rebalanceTxt: { color: GOLD, fontSize: 11, fontWeight: '700', fontFamily: mono, letterSpacing: 2 },

    // Chart
    chartSub:  { color: MUTED, fontSize: 11, fontFamily: sans, marginBottom: 14, marginTop: -8 },
    returnRow: { flexDirection: 'row', marginBottom: 18 },
    returnDiv: { width: 1, backgroundColor: BORDER, marginHorizontal: 12, alignSelf: 'stretch' },
    chartLabel:{ color: MUTED, fontSize: 9, fontFamily: mono },
    legendRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
    legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendDash:{ width: 14, height: 1.5, borderRadius: 1 },
    legendTxt: { color: MUTED, fontSize: 10, fontFamily: sans },

    // Holdings
    viewAllBtn: { marginTop: 6, paddingVertical: 12, alignItems: 'center',
                  borderTopWidth: 1, borderTopColor: BORDER },
    viewAllTxt: { color: GOLD, fontSize: 11, fontWeight: '700', fontFamily: mono, letterSpacing: 1.5 },
    emptyMsg:   { color: MUTED, fontSize: 12, fontFamily: mono, textAlign: 'center',
                  paddingVertical: 16, letterSpacing: 0.5 },

    // Insights
    insightDivider: { height: 1, backgroundColor: BORDER, marginVertical: 16 },

    // Tags
    tagPill:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    tagMuted: { color: MUTED, fontSize: 10, fontFamily: mono },

    // Loading / empty
    centred:    { flex: 1, alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 36, gap: 10 },
    loadingTxt: { color: MUTED, fontSize: 12, fontFamily: mono, letterSpacing: 1, marginTop: 10 },
    emptyTitle: { color: TXT, fontSize: 20, fontWeight: '700', fontFamily: sans },
    emptySub:   { color: SUB, fontSize: 13, textAlign: 'center', lineHeight: 22 },
    emptyBtn:   { marginTop: 20, backgroundColor: GOLD_D, borderWidth: 1, borderColor: GOLD_B,
                  borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
    emptyBtnTxt:{ color: GOLD_L, fontSize: 14, fontWeight: '700', fontFamily: sans },

    // Footer
    footer:     { flexDirection: 'row', alignItems: 'center', gap: 10,
                  marginTop: 20, marginBottom: 8 },
    footerLine: { flex: 1, height: 1, backgroundColor: BORDER },
    footerTxt:  { color: MUTED, fontSize: 9, letterSpacing: 2, fontFamily: mono },
});

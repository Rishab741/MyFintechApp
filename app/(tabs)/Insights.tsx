/**
 * Insights.tsx — Vestara AI Insights & Portfolio Analytics
 * Aesthetic: Luxury Terminal — obsidian depth, gold hairlines, monospaced data, serif headlines
 */

import React from 'react';
import {
    ActivityIndicator,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { useInsights } from '@/src/insights/useInsights';
import { InsightSignal, InsightSeverity, InsightCategory } from '@/src/services/mlPipeline';
import {
    BG, CARD, CARD2, BORDER, BORDER2,
    GOLD, GOLD_L, GOLD_D, GOLD_B,
    GREEN, GREEN_D, RED, RED_D,
    ORANGE, ORANGE_D, BLUE, BLUE_D,
    TXT, TXT2, MUTED, SUB,
    serif, mono, sans,
} from '@/src/portfolio/tokens';

// ─── Design constants ──────────────────────────────────────────────────────────
const PURPLE   = '#C084FC';
const PURPLE_D = 'rgba(192,132,252,0.1)';

// ─── Severity → colour mapping ────────────────────────────────────────────────
const SEV_COLOR: Record<InsightSeverity, string> = {
    critical: RED,
    warning:  ORANGE,
    positive: GREEN,
    neutral:  BLUE,
};
const SEV_BG: Record<InsightSeverity, string> = {
    critical: RED_D,
    warning:  ORANGE_D,
    positive: GREEN_D,
    neutral:  BLUE_D,
};
const SEV_LABEL: Record<InsightSeverity, string> = {
    critical: 'CRITICAL',
    warning:  'WARNING',
    positive: 'POSITIVE',
    neutral:  'INFO',
};

// ─── Category → label ─────────────────────────────────────────────────────────
const CAT_LABEL: Record<InsightCategory, string> = {
    risk:       'RISK',
    momentum:   'MOMENTUM',
    allocation: 'ALLOCATION',
    benchmark:  'BENCHMARK',
    strategy:   'STRATEGY',
};
const CAT_COLOR: Record<InsightCategory, string> = {
    risk:       RED,
    momentum:   PURPLE,
    allocation: GOLD,
    benchmark:  BLUE,
    strategy:   GREEN,
};

// ─── Health score → colour ────────────────────────────────────────────────────
function scoreColor(score: number): string {
    if (score >= 80) return GREEN;
    if (score >= 65) return GOLD;
    if (score >= 50) return ORANGE;
    if (score >= 35) return RED;
    return RED;
}

function fmt(v: number, decimals = 2, prefix = ''): string {
    const sign = v > 0 ? '+' : '';
    return `${prefix}${sign}${v.toFixed(decimals)}`;
}
function fmtPct(v: number, decimals = 1): string { return `${v > 0 ? '+' : ''}${v.toFixed(decimals)}%`; }

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ title: string; right?: string }> = ({ title, right }) => (
    <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{title}</Text>
        {right && <Text style={s.sectionRight}>{right}</Text>}
    </View>
);

const Divider = () => <View style={s.divider} />;

// ── Health Score Ring ──────────────────────────────────────────────────────────
const HealthRing: React.FC<{ score: number; label: string; tagline: string }> = ({ score, label, tagline }) => {
    const color = scoreColor(score);
    return (
        <View style={s.healthWrap}>
            <View style={[s.healthRingOuter, { borderColor: `${color}22` }]}>
                <View style={[s.healthRingInner, { borderColor: color }]}>
                    <Text style={[s.healthScore, { color }]}>{score}</Text>
                    <Text style={s.healthUnit}>/ 100</Text>
                </View>
            </View>
            <Text style={[s.healthLabel, { color }]}>{label.toUpperCase()}</Text>
            <Text style={s.healthTagline}>{tagline}</Text>
        </View>
    );
};

// ── Quick Metric Tile ──────────────────────────────────────────────────────────
const MetricTile: React.FC<{ label: string; value: string; color?: string; sub?: string }> = ({
    label, value, color = TXT, sub,
}) => (
    <View style={s.metricTile}>
        <Text style={[s.metricValue, { color }]}>{value}</Text>
        {sub && <Text style={s.metricSub}>{sub}</Text>}
        <Text style={s.metricLabel}>{label}</Text>
    </View>
);

// ── Signal Card ────────────────────────────────────────────────────────────────
const SignalCard: React.FC<{ signal: InsightSignal }> = ({ signal }) => {
    const color   = SEV_COLOR[signal.severity];
    const bg      = SEV_BG[signal.severity];
    const catCol  = CAT_COLOR[signal.category];
    return (
        <View style={[s.signalCard, { borderLeftColor: color }]}>
            {/* Header row */}
            <View style={s.signalHeader}>
                <View style={[s.catBadge, { backgroundColor: `${catCol}18` }]}>
                    <Text style={[s.catBadgeText, { color: catCol }]}>{CAT_LABEL[signal.category]}</Text>
                </View>
                <View style={[s.sevBadge, { backgroundColor: bg }]}>
                    <Text style={[s.sevBadgeText, { color }]}>{SEV_LABEL[signal.severity]}</Text>
                </View>
            </View>

            {/* Title + value */}
            <View style={s.signalTitleRow}>
                <Text style={s.signalTitle}>{signal.title}</Text>
                {signal.value && (
                    <View style={[s.valuePill, { borderColor: `${color}40` }]}>
                        <Text style={[s.valuePillText, { color }]}>{signal.value}</Text>
                    </View>
                )}
            </View>

            {/* Body */}
            <Text style={s.signalBody}>{signal.body}</Text>

            {/* Action */}
            <View style={s.signalActionRow}>
                <Text style={s.signalActionLabel}>ACTION  </Text>
                <Text style={s.signalAction}>{signal.action}</Text>
            </View>
        </View>
    );
};

// ── Top Position Row ───────────────────────────────────────────────────────────
const PositionRow: React.FC<{
    ticker: string; alloc_pct: number; pnl_pct: number; value: number; maxAlloc: number;
}> = ({ ticker, alloc_pct, pnl_pct, value, maxAlloc }) => {
    const pnlColor = pnl_pct >= 0 ? GREEN : RED;
    const barWidth = maxAlloc > 0 ? `${(alloc_pct / maxAlloc) * 100}%` as any : '0%';
    return (
        <View style={s.posRow}>
            <Text style={s.posTicker}>{ticker}</Text>
            <View style={s.posBarWrap}>
                <View style={[s.posBar, { width: barWidth }]} />
            </View>
            <Text style={s.posAlloc}>{alloc_pct.toFixed(1)}%</Text>
            <Text style={[s.posPnl, { color: pnlColor }]}>{fmtPct(pnl_pct)}</Text>
        </View>
    );
};

// ─── Empty / No-dataset state ─────────────────────────────────────────────────
const EmptyState: React.FC<{ onGenerate: () => void; loading: boolean }> = ({ onGenerate, loading }) => (
    <View style={s.emptyWrap}>
        <Text style={s.emptyIcon}>◈</Text>
        <Text style={s.emptyTitle}>No Analytics Yet</Text>
        <Text style={s.emptyBody}>
            Generate your portfolio dataset to unlock AI-powered insights, risk signals, and investment recommendations.
        </Text>
        <TouchableOpacity style={s.generateBtn} onPress={onGenerate} disabled={loading}>
            {loading
                ? <ActivityIndicator color="#0A0D14" />
                : <Text style={s.generateBtnText}>Generate Insights</Text>}
        </TouchableOpacity>
    </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function InsightsScreen() {
    const { data, loading, refreshing, error, noDataset, onRefresh, generateAndFetch } = useInsights();

    // ── Loading ──
    if (loading) {
        return (
            <View style={s.center}>
                <StatusBar barStyle="light-content" />
                <ActivityIndicator color={GOLD} size="large" />
                <Text style={s.loadingText}>Analysing portfolio…</Text>
            </View>
        );
    }

    // ── No dataset ──
    if (noDataset) {
        return (
            <View style={s.root}>
                <StatusBar barStyle="light-content" />
                <View style={s.glow1} />
                <View style={s.glow2} />
                <View style={s.nav}>
                    <Text style={s.navTitle}>VESTARA INSIGHTS</Text>
                    <Text style={s.navSub}>AI-POWERED ANALYTICS</Text>
                </View>
                <EmptyState onGenerate={generateAndFetch} loading={false} />
            </View>
        );
    }

    // ── Error ──
    if (error && !data) {
        return (
            <View style={s.center}>
                <StatusBar barStyle="light-content" />
                <Text style={[s.emptyIcon, { color: RED }]}>⚠</Text>
                <Text style={[s.emptyTitle, { color: RED }]}>Failed to Load</Text>
                <Text style={s.emptyBody}>{error}</Text>
                <TouchableOpacity style={s.generateBtn} onPress={() => onRefresh()}>
                    <Text style={s.generateBtnText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!data) return null;

    const { health_score, health_label, health_tagline, signals, summary, top_positions, generated_at } = data;
    const maxAlloc = top_positions.reduce((m, p) => Math.max(m, p.alloc_pct), 0);
    const genDate  = new Date(generated_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const criticalCount = signals.filter(s => s.severity === 'critical').length;
    const warningCount  = signals.filter(s => s.severity === 'warning').length;
    const positiveCount = signals.filter(s => s.severity === 'positive').length;

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />

            {/* Background glows */}
            <View style={s.glow1} />
            <View style={s.glow2} />
            <View style={s.glow3} />

            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={GOLD}
                        colors={[GOLD]}
                    />
                }
            >
                {/* ── Nav ── */}
                <View style={s.nav}>
                    <View>
                        <Text style={s.navTitle}>VESTARA INSIGHTS</Text>
                        <Text style={s.navSub}>UPDATED {genDate.toUpperCase()}</Text>
                    </View>
                    <TouchableOpacity style={s.refreshBtn} onPress={onRefresh} disabled={refreshing}>
                        <Text style={s.refreshBtnText}>↺</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Health Score ── */}
                <View style={s.card}>
                    <HealthRing
                        score={health_score}
                        label={health_label}
                        tagline={health_tagline}
                    />

                    {/* Signal summary pills */}
                    <View style={s.signalSummaryRow}>
                        {criticalCount > 0 && (
                            <View style={[s.summaryPill, { backgroundColor: RED_D, borderColor: `${RED}30` }]}>
                                <Text style={[s.summaryPillText, { color: RED }]}>{criticalCount} Critical</Text>
                            </View>
                        )}
                        {warningCount > 0 && (
                            <View style={[s.summaryPill, { backgroundColor: ORANGE_D, borderColor: `${ORANGE}30` }]}>
                                <Text style={[s.summaryPillText, { color: ORANGE }]}>{warningCount} Warning</Text>
                            </View>
                        )}
                        {positiveCount > 0 && (
                            <View style={[s.summaryPill, { backgroundColor: GREEN_D, borderColor: `${GREEN}30` }]}>
                                <Text style={[s.summaryPillText, { color: GREEN }]}>{positiveCount} Positive</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* ── Key Metrics Strip ── */}
                <View style={[s.card, s.metricsRow]}>
                    <MetricTile
                        label="SHARPE"
                        value={summary.sharpe.toFixed(2)}
                        color={summary.sharpe >= 1 ? GREEN : summary.sharpe < 0 ? RED : GOLD}
                    />
                    <View style={s.metricDivider} />
                    <MetricTile
                        label="WIN RATE"
                        value={`${summary.win_rate.toFixed(0)}%`}
                        color={summary.win_rate >= 55 ? GREEN : summary.win_rate < 40 ? RED : TXT2}
                    />
                    <View style={s.metricDivider} />
                    <MetricTile
                        label="TOTAL RETURN"
                        value={fmtPct(summary.total_return)}
                        color={summary.total_return >= 0 ? GREEN : RED}
                    />
                    <View style={s.metricDivider} />
                    <MetricTile
                        label="MAX DRAWDOWN"
                        value={`${summary.max_drawdown.toFixed(1)}%`}
                        color={summary.max_drawdown > -10 ? GREEN : summary.max_drawdown < -25 ? RED : ORANGE}
                    />
                </View>

                {/* ── Second Metrics Row ── */}
                <View style={[s.card, s.metricsRow]}>
                    <MetricTile
                        label="ALPHA (DAILY)"
                        value={fmt(summary.alpha) + '%'}
                        color={summary.alpha >= 0 ? GREEN : RED}
                    />
                    <View style={s.metricDivider} />
                    <MetricTile
                        label="ANN. VOL"
                        value={`${summary.ann_vol.toFixed(1)}%`}
                        color={summary.ann_vol < 15 ? GREEN : summary.ann_vol > 30 ? RED : ORANGE}
                    />
                    <View style={s.metricDivider} />
                    <MetricTile
                        label="VAR (95%)"
                        value={`${summary.var95.toFixed(2)}%`}
                        color={summary.var95 > -2 ? GREEN : summary.var95 < -4 ? RED : ORANGE}
                    />
                    <View style={s.metricDivider} />
                    <MetricTile
                        label="VOL REGIME"
                        value={summary.volatility_regime.toUpperCase()}
                        color={summary.volatility_regime === 'low' ? GREEN : summary.volatility_regime === 'high' ? RED : GOLD}
                    />
                </View>

                {/* ── Signals ── */}
                <SectionHeader
                    title="INVESTMENT SIGNALS"
                    right={`${signals.length} signal${signals.length !== 1 ? 's' : ''}`}
                />

                {signals.length === 0 ? (
                    <View style={[s.card, { alignItems: 'center', paddingVertical: 32 }]}>
                        <Text style={{ color: GREEN, fontSize: 28, marginBottom: 8 }}>✓</Text>
                        <Text style={[s.emptyTitle, { color: GREEN }]}>No Issues Detected</Text>
                        <Text style={[s.emptyBody, { textAlign: 'center' }]}>
                            Your portfolio is within all healthy thresholds. Keep up the disciplined approach.
                        </Text>
                    </View>
                ) : (
                    signals.map(signal => <SignalCard key={signal.id} signal={signal} />)
                )}

                {/* ── Benchmark Comparison ── */}
                <SectionHeader title="BENCHMARK COMPARISON" />
                <View style={s.card}>
                    <View style={s.benchRow}>
                        <View style={s.benchItem}>
                            <Text style={s.benchLabel}>YOUR PORTFOLIO</Text>
                            <Text style={[s.benchValue, { color: summary.cumulative_return >= 0 ? GREEN : RED }]}>
                                {fmtPct(summary.cumulative_return)}
                            </Text>
                        </View>
                        <View style={s.benchVs}>
                            <Text style={s.benchVsText}>VS</Text>
                        </View>
                        <View style={[s.benchItem, { alignItems: 'flex-end' }]}>
                            <Text style={s.benchLabel}>S&P 500</Text>
                            <Text style={[s.benchValue, { color: summary.benchmark_return >= 0 ? GREEN : RED }]}>
                                {fmtPct(summary.benchmark_return)}
                            </Text>
                        </View>
                    </View>
                    <Divider />
                    <View style={s.alphaSummaryRow}>
                        <Text style={s.alphaSummaryLabel}>NET ALPHA</Text>
                        <Text style={[
                            s.alphaSummaryValue,
                            { color: (summary.cumulative_return - summary.benchmark_return) >= 0 ? GREEN : RED },
                        ]}>
                            {fmtPct(summary.cumulative_return - summary.benchmark_return)}
                        </Text>
                    </View>
                </View>

                {/* ── Top Holdings ── */}
                {top_positions.length > 0 && (
                    <>
                        <SectionHeader
                            title="TOP HOLDINGS"
                            right={`${summary.positions_count} total positions`}
                        />
                        <View style={s.card}>
                            <View style={s.posHeader}>
                                <Text style={[s.posHeaderText, { flex: 2 }]}>TICKER</Text>
                                <Text style={[s.posHeaderText, { flex: 4 }]}>ALLOCATION</Text>
                                <Text style={[s.posHeaderText, { width: 44, textAlign: 'right' }]}>ALLOC</Text>
                                <Text style={[s.posHeaderText, { width: 52, textAlign: 'right' }]}>P&L</Text>
                            </View>
                            <Divider />
                            {top_positions.map((pos, i) => (
                                <React.Fragment key={pos.ticker}>
                                    <PositionRow {...pos} maxAlloc={maxAlloc} />
                                    {i < top_positions.length - 1 && <View style={s.posRowDivider} />}
                                </React.Fragment>
                            ))}
                        </View>
                    </>
                )}

                {/* ── Momentum & Strategy ── */}
                <SectionHeader title="MOMENTUM & RISK SNAPSHOT" />
                <View style={s.card}>
                    <View style={[s.metricsRow, { paddingHorizontal: 0 }]}>
                        <MetricTile
                            label="5-DAY MOM"
                            value={fmtPct(summary.momentum_5)}
                            color={summary.momentum_5 >= 0 ? GREEN : RED}
                        />
                        <View style={s.metricDivider} />
                        <MetricTile
                            label="CASH"
                            value={`${summary.cash_pct.toFixed(1)}%`}
                            color={summary.cash_pct >= 5 && summary.cash_pct <= 30 ? GREEN : ORANGE}
                        />
                        <View style={s.metricDivider} />
                        <MetricTile
                            label="POSITIONS"
                            value={`${summary.positions_count}`}
                            color={summary.positions_count >= 5 && summary.positions_count <= 20 ? GREEN : ORANGE}
                        />
                        <View style={s.metricDivider} />
                        <MetricTile
                            label="VS MARKET"
                            value={fmtPct(summary.cumulative_return - summary.benchmark_return)}
                            color={(summary.cumulative_return - summary.benchmark_return) >= 0 ? GREEN : RED}
                        />
                    </View>
                </View>

                {/* ── Disclaimer ── */}
                <Text style={s.disclaimer}>
                    Signals are generated using rule-based financial thresholds and historical portfolio data. Not financial advice. Past performance is not indicative of future results.
                </Text>

                <View style={{ height: 32 }} />
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ORANGE_D_LOCAL = 'rgba(251,146,60,0.1)';

const s = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: BG,
    },
    center: {
        flex: 1,
        backgroundColor: BG,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 24 },

    // ── Glows ──
    glow1: {
        position: 'absolute', width: 300, height: 300, borderRadius: 150,
        backgroundColor: 'rgba(201,168,76,0.04)', top: -80, right: -60,
    },
    glow2: {
        position: 'absolute', width: 250, height: 250, borderRadius: 125,
        backgroundColor: 'rgba(52,211,153,0.03)', bottom: 200, left: -80,
    },
    glow3: {
        position: 'absolute', width: 200, height: 200, borderRadius: 100,
        backgroundColor: 'rgba(79,158,248,0.03)', top: 400, right: -40,
    },

    // ── Nav ──
    nav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 58 : 20,
        paddingBottom: 12,
    },
    navTitle: {
        color: TXT,
        fontSize: 16,
        fontFamily: mono,
        letterSpacing: 2,
    },
    navSub: {
        color: MUTED,
        fontSize: 10,
        fontFamily: mono,
        letterSpacing: 1.5,
        marginTop: 2,
    },
    refreshBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: BORDER2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: CARD2,
    },
    refreshBtnText: { color: GOLD, fontSize: 18 },

    // ── Card ──
    card: {
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },

    // ── Section header ──
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 8,
        marginTop: 4,
    },
    sectionTitle: {
        color: MUTED,
        fontSize: 11,
        fontFamily: mono,
        letterSpacing: 2,
    },
    sectionRight: {
        color: MUTED,
        fontSize: 11,
        fontFamily: mono,
    },
    divider: {
        height: 1,
        backgroundColor: BORDER,
        marginVertical: 14,
    },

    // ── Health ring ──
    healthWrap: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    healthRingOuter: {
        width: 144,
        height: 144,
        borderRadius: 72,
        borderWidth: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    healthRingInner: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 3,
        alignItems: 'center',
        justifyContent: 'center',
    },
    healthScore: {
        fontSize: 42,
        fontFamily: mono,
        fontWeight: '700',
        lineHeight: 48,
    },
    healthUnit: {
        color: MUTED,
        fontSize: 11,
        fontFamily: mono,
        marginTop: -2,
    },
    healthLabel: {
        fontSize: 14,
        fontFamily: mono,
        letterSpacing: 3,
        fontWeight: '700',
        marginBottom: 6,
    },
    healthTagline: {
        color: SUB,
        fontSize: 13,
        fontFamily: sans,
        textAlign: 'center',
        lineHeight: 18,
        maxWidth: 260,
    },

    // ── Signal summary pills ──
    signalSummaryRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
        flexWrap: 'wrap',
    },
    summaryPill: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
    },
    summaryPillText: {
        fontSize: 12,
        fontFamily: mono,
        fontWeight: '700',
    },

    // ── Metrics strip ──
    metricsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metricTile: {
        flex: 1,
        alignItems: 'center',
    },
    metricValue: {
        fontSize: 18,
        fontFamily: mono,
        fontWeight: '700',
        color: TXT,
    },
    metricSub: {
        fontSize: 10,
        fontFamily: mono,
        color: MUTED,
        marginTop: 1,
    },
    metricLabel: {
        fontSize: 9,
        fontFamily: mono,
        color: MUTED,
        letterSpacing: 1,
        marginTop: 4,
    },
    metricDivider: {
        width: 1,
        height: 36,
        backgroundColor: BORDER,
    },

    // ── Signal card ──
    signalCard: {
        backgroundColor: CARD,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: BORDER,
        borderLeftWidth: 4,
        marginHorizontal: 16,
        marginBottom: 10,
        padding: 16,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
    },
    signalHeader: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 10,
    },
    catBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    catBadgeText: {
        fontSize: 9,
        fontFamily: mono,
        fontWeight: '700',
        letterSpacing: 1,
    },
    sevBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    sevBadgeText: {
        fontSize: 9,
        fontFamily: mono,
        fontWeight: '700',
        letterSpacing: 1,
    },
    signalTitleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 8,
    },
    signalTitle: {
        color: TXT,
        fontSize: 15,
        fontFamily: serif,
        fontWeight: '700',
        flex: 1,
        lineHeight: 20,
    },
    valuePill: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginTop: 2,
        flexShrink: 0,
    },
    valuePillText: {
        fontSize: 11,
        fontFamily: mono,
        fontWeight: '700',
    },
    signalBody: {
        color: TXT2,
        fontSize: 13,
        fontFamily: sans,
        lineHeight: 19,
        marginBottom: 12,
    },
    signalActionRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: GOLD_D,
        borderRadius: 8,
        padding: 10,
    },
    signalActionLabel: {
        color: GOLD,
        fontSize: 10,
        fontFamily: mono,
        fontWeight: '700',
        letterSpacing: 1,
        marginTop: 1,
        flexShrink: 0,
    },
    signalAction: {
        color: GOLD_L,
        fontSize: 12,
        fontFamily: sans,
        lineHeight: 17,
        flex: 1,
    },

    // ── Benchmark ──
    benchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    benchItem: { flex: 1 },
    benchLabel: {
        color: MUTED,
        fontSize: 10,
        fontFamily: mono,
        letterSpacing: 1.5,
        marginBottom: 6,
    },
    benchValue: {
        fontSize: 28,
        fontFamily: mono,
        fontWeight: '700',
    },
    benchVs: {
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    benchVsText: {
        color: MUTED,
        fontSize: 12,
        fontFamily: mono,
        letterSpacing: 2,
    },
    alphaSummaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    alphaSummaryLabel: {
        color: MUTED,
        fontSize: 11,
        fontFamily: mono,
        letterSpacing: 1.5,
    },
    alphaSummaryValue: {
        fontSize: 18,
        fontFamily: mono,
        fontWeight: '700',
    },

    // ── Top positions ──
    posHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    posHeaderText: {
        color: MUTED,
        fontSize: 9,
        fontFamily: mono,
        letterSpacing: 1,
    },
    posRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
    },
    posTicker: {
        color: TXT,
        fontSize: 13,
        fontFamily: mono,
        fontWeight: '700',
        flex: 2,
        letterSpacing: 0.5,
    },
    posBarWrap: {
        flex: 4,
        height: 5,
        backgroundColor: BORDER,
        borderRadius: 3,
        overflow: 'hidden',
        marginRight: 8,
    },
    posBar: {
        height: '100%',
        backgroundColor: GOLD,
        borderRadius: 3,
    },
    posAlloc: {
        color: TXT2,
        fontSize: 12,
        fontFamily: mono,
        width: 44,
        textAlign: 'right',
    },
    posPnl: {
        fontSize: 12,
        fontFamily: mono,
        fontWeight: '700',
        width: 52,
        textAlign: 'right',
    },
    posRowDivider: {
        height: 1,
        backgroundColor: BORDER,
    },

    // ── Loading / empty ──
    loadingText: {
        color: MUTED,
        fontSize: 13,
        fontFamily: mono,
        letterSpacing: 1,
        marginTop: 16,
    },
    emptyWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    emptyIcon: {
        fontSize: 48,
        color: GOLD,
        marginBottom: 16,
    },
    emptyTitle: {
        color: TXT,
        fontSize: 20,
        fontFamily: serif,
        fontWeight: '700',
        marginBottom: 12,
        textAlign: 'center',
    },
    emptyBody: {
        color: SUB,
        fontSize: 14,
        fontFamily: sans,
        lineHeight: 21,
        textAlign: 'center',
        marginBottom: 28,
        maxWidth: 280,
    },
    generateBtn: {
        backgroundColor: GOLD,
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 14,
        alignItems: 'center',
        shadowColor: GOLD,
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
    },
    generateBtnText: {
        color: '#0A0D14',
        fontSize: 15,
        fontFamily: sans,
        fontWeight: '800',
        letterSpacing: 0.5,
    },

    // ── Disclaimer ──
    disclaimer: {
        color: MUTED,
        fontSize: 11,
        fontFamily: sans,
        lineHeight: 16,
        textAlign: 'center',
        marginHorizontal: 24,
        marginTop: 8,
        opacity: 0.7,
    },
});

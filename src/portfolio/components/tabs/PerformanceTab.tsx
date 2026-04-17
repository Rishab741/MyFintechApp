import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import SHead from '../SHead';
import Metric from '../Metric';
import PeriodTabs from '../PeriodTabs';
import { LineChart, ReturnsHistogram } from '../../charts';
import {
    GOLD, GOLD_D, GREEN, GREEN_D, RED, PURPLE, PURPLE_D,
    MUTED, SUB,
    sans, mono, CHART_W,
} from '../../tokens';
import { fmt2, sign } from '../../helpers';
import type { Period } from '../../types';
import type { PerformanceMetrics } from '@/src/services/engineClient';

interface Props {
    period:         Period;
    onPeriodChange: (p: Period) => void;
    chartPortfolio: number[];
    chartBench:     number[];
    chartLabels:    string[];
    dailyReturns:   number[];
    displayReturn:  number;
    displayBench:   number;
    displayAlpha:   number;
    metrics:        PerformanceMetrics | null | undefined;
    metricsSource:  'cache' | 'engine' | null | undefined;
}

const ReturnDiv = () => <View style={s.div} />;

export default function PerformanceTab({
    period, onPeriodChange,
    chartPortfolio, chartBench, chartLabels,
    dailyReturns,
    displayReturn, displayBench, displayAlpha,
    metrics, metricsSource,
}: Props) {
    const lineColor = displayReturn >= 0 ? GREEN : RED;

    return (
        <>
            {/* ── Historical chart card ── */}
            <Card>
                <SHead
                    title="Historical Performance"
                    right={
                        <View style={s.badgeRow}>
                            {metricsSource && (
                                <View style={[s.badge, {
                                    backgroundColor: metricsSource === 'cache' ? GREEN_D : GOLD_D,
                                    borderColor: metricsSource === 'cache' ? `${GREEN}35` : `${GOLD}35`,
                                }]}>
                                    <Text style={[s.badgeTxt, { color: metricsSource === 'cache' ? GREEN : GOLD }]}>
                                        {metricsSource === 'cache' ? '⚡ CACHE' : '⚙ ENGINE'}
                                    </Text>
                                </View>
                            )}
                            <Text style={s.vsLabel}>vs S&P 500</Text>
                        </View>
                    }
                />
                <Text style={s.chartSub}>
                    {metrics ? 'Engine-computed · TWR method' : 'Simulated real-time tracking'}
                </Text>

                <PeriodTabs selected={period} onChange={onPeriodChange} />

                <View style={s.metricsRow}>
                    <Metric
                        label={metrics ? 'TWR' : 'Your Return'}
                        value={`${sign(displayReturn)}${fmt2(Math.abs(displayReturn))}%`}
                        color={displayReturn >= 0 ? GREEN : RED}
                    />
                    <ReturnDiv />
                    <Metric
                        label={metrics?.benchmark_symbol ?? 'S&P 500'}
                        value={`${sign(displayBench)}${fmt2(Math.abs(displayBench))}%`}
                        color={SUB}
                    />
                    <ReturnDiv />
                    <Metric
                        label="Alpha"
                        value={`${sign(displayAlpha)}${fmt2(Math.abs(displayAlpha))}%`}
                        color={displayAlpha >= 0 ? GREEN : RED}
                        sub={displayAlpha >= 0 ? 'outperforming' : 'lagging'}
                    />
                </View>

                <LineChart
                    series={[
                        { values: chartPortfolio, color: lineColor, width: 2.5 },
                        { values: chartBench, color: MUTED, width: 1.5, opacity: 0.35 },
                    ]}
                    w={CHART_W} h={130}
                />

                {chartLabels[0] && (
                    <View style={s.labelsRow}>
                        {chartLabels.map((l, i) => (
                            <Text key={i} style={s.chartLabel}>{l}</Text>
                        ))}
                    </View>
                )}

                <View style={s.legendRow}>
                    <View style={s.legendItem}>
                        <View style={[s.legendDot, { backgroundColor: lineColor }]} />
                        <Text style={s.legendTxt}>Portfolio</Text>
                    </View>
                    <View style={s.legendItem}>
                        <View style={[s.legendDash, { backgroundColor: MUTED }]} />
                        <Text style={s.legendTxt}>{metrics?.benchmark_symbol ?? 'S&P 500'} (ref)</Text>
                    </View>
                </View>
            </Card>

            {/* ── Returns distribution ── */}
            <Card>
                <SHead
                    title="Returns Distribution"
                    right={
                        <View style={[s.badge, { backgroundColor: PURPLE_D, borderColor: `${PURPLE}35` }]}>
                            <Text style={[s.badgeTxt, { color: PURPLE }]}>HISTOGRAM</Text>
                        </View>
                    }
                />
                <ReturnsHistogram returns={dailyReturns} w={CHART_W} h={90} />
            </Card>

            {/* ── Engine detail metrics (when available) ── */}
            {metrics && (
                <Card>
                    <SHead title="Return Detail" />
                    <View style={s.detailGrid}>
                        <DetailCell label="CAGR"         value={`${sign(metrics.cagr * 100)}${fmt2(Math.abs(metrics.cagr * 100))}%`} />
                        <DetailCell label="DAILY AVG"    value={`${sign(metrics.daily_return_avg * 100)}${fmt2(Math.abs(metrics.daily_return_avg * 100))}%`} />
                        <DetailCell label="CORRELATION"  value={fmt2(metrics.correlation)} />
                        <DetailCell label="DATA POINTS"  value={String(metrics.data_points)} />
                    </View>
                </Card>
            )}
        </>
    );
}

const DetailCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={s.detailCell}>
        <Text style={s.detailLabel}>{label}</Text>
        <Text style={s.detailValue}>{value}</Text>
    </View>
);

const s = StyleSheet.create({
    badgeRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3, borderWidth: 1 },
    badgeTxt:    { fontSize: 8, fontFamily: mono, letterSpacing: 1 },
    vsLabel:     { color: MUTED, fontSize: 10, fontFamily: mono },

    chartSub:    { color: MUTED, fontSize: 11, fontFamily: sans, marginBottom: 14, marginTop: -8 },

    metricsRow:  { flexDirection: 'row', marginBottom: 18 },
    div:         { width: 1, backgroundColor: 'rgba(65,72,87,0.6)', marginHorizontal: 12, alignSelf: 'stretch' },

    labelsRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    chartLabel:  { color: MUTED, fontSize: 9, fontFamily: mono },

    legendRow:   { flexDirection: 'row', gap: 16, marginTop: 12 },
    legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot:   { width: 7, height: 7, borderRadius: 3 },
    legendDash:  { width: 14, height: 1.5, borderRadius: 1 },
    legendTxt:   { color: MUTED, fontSize: 10, fontFamily: sans },

    detailGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 1,
                   backgroundColor: 'rgba(65,72,87,0.3)', borderRadius: 4, overflow: 'hidden' },
    detailCell:  { flex: 1, minWidth: '48%', backgroundColor: 'rgba(17,25,42,0.95)',
                   padding: 14, gap: 6 },
    detailLabel: { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 2 },
    detailValue: { color: '#e2e8fb', fontSize: 16, fontWeight: '700', fontFamily: mono },
});

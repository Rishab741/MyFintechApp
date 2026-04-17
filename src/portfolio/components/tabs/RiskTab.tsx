import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import SHead from '../SHead';
import RiskGrid from '../RiskGrid';
import { DrawdownChart } from '../../charts';
import {
    GOLD, GOLD_D, GREEN, RED, RED_D,
    MUTED, TXT, TXT2,
    sans, mono, CHART_W,
} from '../../tokens';
import { fmt2, sign } from '../../helpers';
import type { RiskMetrics } from '../../types';
import type { PerformanceMetrics } from '@/src/services/engineClient';

interface Props {
    risk:          RiskMetrics | null;
    metrics:       PerformanceMetrics | null | undefined;
    snapValues:    number[];
    displayAlpha:  number;
}

const RiskScore: React.FC<{ score: number; label: string }> = ({ score, label }) => {
    const color = score >= 75 ? RED : score >= 50 ? GOLD : GREEN;
    return (
        <View style={s.scoreWrap}>
            <View style={[s.scoreHex, { borderColor: `${color}40`, backgroundColor: `${color}10` }]}>
                <Text style={[s.scoreNum, { color }]}>{score}</Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={s.scoreCaption}>RISK SCORE</Text>
                <Text style={[s.scoreName, { color }]}>{label}</Text>
                <Text style={s.scoreUpdated}>UPDATED 2M AGO</Text>
            </View>
        </View>
    );
};

const InsightBanner: React.FC<{ title: string; body: string }> = ({ title, body }) => (
    <View style={s.banner}>
        <View style={s.bannerDot} />
        <View style={{ flex: 1 }}>
            <Text style={s.bannerTitle}>{title}</Text>
            <Text style={s.bannerBody}>{body}</Text>
        </View>
    </View>
);

export default function RiskTab({ risk, metrics, snapValues, displayAlpha }: Props) {
    const vol    = metrics ? metrics.volatility * 100 : risk?.annStd ?? 0;
    const sharpe = metrics ? metrics.sharpe_ratio      : risk?.sharpe ?? 0;

    const riskScore = Math.round(Math.min(Math.max((vol / 40) * 100, 10), 99));
    const riskLabel = vol > 30 ? 'Aggressive' : vol > 15 ? 'Moderate' : 'Conservative';

    const safeRisk: RiskMetrics = risk ?? { mean: 0, stddev: 0, annStd: 0, sharpe: 0, var95: 0, winRate: 0 };

    return (
        <>
            {/* ── Risk overview ── */}
            {(risk || metrics) && (
                <Card>
                    <SHead title="Quantum Insights" />

                    <InsightBanner
                        title="Exposure Alert"
                        body="Monitor your sector concentration. Diversification across uncorrelated assets reduces drawdown risk."
                    />

                    <RiskScore score={riskScore} label={riskLabel} />

                    <View style={s.divider} />

                    <View style={s.statRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.statLabel}>SHARPE RATIO</Text>
                            <Text style={[s.statValue, { color: sharpe >= 1 ? GREEN : sharpe >= 0 ? GOLD : RED }]}>
                                {fmt2(sharpe)}
                            </Text>
                        </View>
                        <View style={s.statSep} />
                        <View style={{ flex: 1 }}>
                            <Text style={s.statLabel}>ALPHA</Text>
                            <Text style={[s.statValue, { color: displayAlpha >= 0 ? GREEN : RED }]}>
                                {sign(displayAlpha)}{fmt2(Math.abs(displayAlpha))}%
                            </Text>
                        </View>
                    </View>
                </Card>
            )}

            {/* ── Full risk metrics grid ── */}
            {(risk || metrics) && (
                <Card>
                    <SHead
                        title="Risk Analysis"
                        right={metrics && (
                            <View style={[s.badge, { backgroundColor: GOLD_D, borderColor: `${GOLD}35` }]}>
                                <Text style={[s.badgeTxt, { color: GOLD }]}>ENGINE</Text>
                            </View>
                        )}
                    />
                    <RiskGrid risk={safeRisk} engineMetrics={metrics} />
                </Card>
            )}

            {/* ── Drawdown chart ── */}
            {snapValues.length >= 3 && (
                <Card>
                    <SHead
                        title="Drawdown Analysis"
                        right={
                            <View style={[s.badge, { backgroundColor: RED_D, borderColor: `${RED}35` }]}>
                                <Text style={[s.badgeTxt, { color: RED }]}>UNDERWATER</Text>
                            </View>
                        }
                    />
                    <DrawdownChart values={snapValues} w={CHART_W} h={90} />
                </Card>
            )}
        </>
    );
}

const s = StyleSheet.create({
    scoreWrap:    { flexDirection: 'row', alignItems: 'center', gap: 14 },
    scoreHex:     { width: 64, height: 64, borderRadius: 6, borderWidth: 1,
                    alignItems: 'center', justifyContent: 'center' },
    scoreNum:     { fontSize: 26, fontWeight: '800', fontFamily: sans },
    scoreCaption: { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 2.5, marginBottom: 2 },
    scoreName:    { fontSize: 14, fontWeight: '700', fontFamily: sans, marginBottom: 3 },
    scoreUpdated: { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 1 },

    banner:       { backgroundColor: `${GOLD}0A`, borderWidth: 1, borderColor: `${GOLD}22`,
                    borderLeftWidth: 3, borderLeftColor: GOLD,
                    borderRadius: 4, padding: 12, flexDirection: 'row', gap: 10, marginBottom: 16 },
    bannerDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD, marginTop: 4,
                    shadowColor: GOLD, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
    bannerTitle:  { color: '#b5f9ff', fontSize: 12, fontWeight: '700', fontFamily: sans, marginBottom: 3, letterSpacing: 0.1 },
    bannerBody:   { color: TXT2, fontSize: 11, lineHeight: 17 },

    divider:      { height: 1, backgroundColor: 'rgba(65,72,87,0.6)', marginVertical: 16 },

    statRow:      { flexDirection: 'row' },
    statLabel:    { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 2, marginBottom: 4 },
    statValue:    { fontSize: 18, fontWeight: '700', fontFamily: sans },
    statSep:      { width: 1, backgroundColor: 'rgba(65,72,87,0.6)', marginHorizontal: 16, alignSelf: 'stretch' },

    badge:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3, borderWidth: 1 },
    badgeTxt:     { fontSize: 9, fontWeight: '700', fontFamily: mono },
});

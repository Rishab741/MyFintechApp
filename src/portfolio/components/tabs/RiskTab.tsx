import React, { useMemo } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import SHead from '../SHead';
import RiskGrid from '../RiskGrid';
import { DrawdownChart } from '../../charts';
import {
    GOLD, GOLD_D, GREEN, RED, RED_D,
    MUTED, TXT, TXT2,
    sans, mono,
} from '../../tokens';
import { fmt2, sign } from '../../helpers';
import type { RiskMetrics } from '../../types';
import type { PerformanceMetrics } from '@/src/services/engineClient';
import { computePortfolioScore, type ScoreInsight } from '../../scoring';

interface Props {
    risk:          RiskMetrics | null;
    metrics:       PerformanceMetrics | null | undefined;
    snapValues:    number[];
    displayAlpha:  number;
}

// ── Score dial ────────────────────────────────────────────────────────────────
const ScoreDial: React.FC<{ score: number; grade: string; label: string; color: string }> = ({
    score, grade, label, color,
}) => (
    <View style={s.dialRow}>
        <View style={[s.dial, { borderColor: `${color}50`, backgroundColor: `${color}10` }]}>
            <Text style={[s.dialGrade, { color }]}>{grade}</Text>
            <Text style={[s.dialScore, { color }]}>{score}</Text>
            <Text style={s.dialOf}>/100</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.dialCaption}>RISK SCORE</Text>
            <Text style={[s.dialLabel, { color }]}>{label}</Text>
            <Text style={s.dialSub}>Multi-factor · updates with each sync</Text>
        </View>
    </View>
);

// ── Factor bar ────────────────────────────────────────────────────────────────
const FactorBar: React.FC<{ label: string; score: number; weight: string }> = ({
    label, score, weight,
}) => {
    const color = score >= 70 ? RED : score >= 45 ? GOLD : GREEN;
    return (
        <View style={s.factor}>
            <View style={s.factorHeader}>
                <Text style={s.factorLabel}>{label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={s.factorWeight}>{weight}</Text>
                    <Text style={[s.factorScore, { color }]}>{score}</Text>
                </View>
            </View>
            <View style={s.factorTrack}>
                <View style={[s.factorFill, { width: `${score}%`, backgroundColor: color }]} />
            </View>
        </View>
    );
};

// ── Insight banner ────────────────────────────────────────────────────────────
const InsightBanner: React.FC<ScoreInsight> = ({ type, title, body }) => {
    const accent = type === 'positive' ? GREEN : type === 'warning' ? GOLD : MUTED;
    return (
        <View style={[s.banner, { borderLeftColor: accent, backgroundColor: `${accent}08` }]}>
            <View style={[s.bannerDot, { backgroundColor: accent }]} />
            <View style={{ flex: 1 }}>
                <Text style={[s.bannerTitle, { color: type === 'positive' ? GREEN : type === 'warning' ? GOLD : TXT2 }]}>
                    {title}
                </Text>
                <Text style={s.bannerBody}>{body}</Text>
            </View>
        </View>
    );
};

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function RiskTab({ risk, metrics, snapValues, displayAlpha }: Props) {
    const vol    = metrics ? metrics.volatility * 100 : risk?.annStd ?? 0;
    const sharpe = metrics ? metrics.sharpe_ratio      : risk?.sharpe  ?? 0;

    const portfolioScore = useMemo(() => computePortfolioScore({
        vol,
        sharpe,
        maxDrawdown: metrics?.max_drawdown != null ? metrics.max_drawdown * 100
                   : snapValues.length >= 3 ? computeRawDrawdown(snapValues)
                   : 0,
        var95:    risk?.var95   ?? 0,
        winRate:  risk?.winRate ?? 50,
        alpha:    displayAlpha,
    }), [vol, sharpe, displayAlpha, risk, metrics, snapValues]);

    const safeRisk: RiskMetrics = risk ?? { mean: 0, stddev: 0, annStd: 0, sharpe: 0, var95: 0, winRate: 0 };
    const hasData = !!(risk || metrics);

    return (
        <>
            {/* ── Score card ── */}
            {hasData && (
                <Card>
                    <SHead title="Portfolio Risk Score" />

                    <ScoreDial
                        score={portfolioScore.score}
                        grade={portfolioScore.grade}
                        label={portfolioScore.label}
                        color={portfolioScore.color}
                    />

                    <View style={s.divider} />

                    {/* Factor breakdown bars */}
                    <View style={s.factors}>
                        <FactorBar label="Volatility"   score={portfolioScore.breakdown.volatility} weight="30%" />
                        <FactorBar label="Max Drawdown" score={portfolioScore.breakdown.drawdown}   weight="25%" />
                        <FactorBar label="Sharpe Ratio" score={portfolioScore.breakdown.sharpe}     weight="20%" />
                        <FactorBar label="Win Rate"     score={portfolioScore.breakdown.winRate}    weight="10%" />
                        <FactorBar label="VaR (95%)"    score={portfolioScore.breakdown.var95}      weight="10%" />
                        <FactorBar label="Alpha"        score={portfolioScore.breakdown.alpha}      weight=" 5%" />
                    </View>
                </Card>
            )}

            {/* ── Dynamic insights ── */}
            {hasData && portfolioScore.insights.length > 0 && (
                <Card>
                    <SHead title="AI Insights" />
                    {portfolioScore.insights.map((ins, i) => (
                        <InsightBanner key={i} {...ins} />
                    ))}
                </Card>
            )}

            {/* ── Full risk metrics grid ── */}
            {hasData && (
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
            {snapValues.length >= 3 && (() => {
                let pk = snapValues[0];
                const ddNow = snapValues.map(v => {
                    pk = Math.max(pk, v);
                    return pk > 0 ? ((v - pk) / pk) * 100 : 0;
                });
                const currentDD = ddNow[ddNow.length - 1];
                const underwater = currentDD < -0.5;
                return (
                    <Card glow={underwater ? RED : undefined}>
                        <SHead
                            title="Drawdown Analysis"
                            right={
                                <View style={[s.badge, {
                                    backgroundColor: underwater ? `${RED}15` : `${GREEN}12`,
                                    borderColor: underwater ? `${RED}40` : `${GREEN}35`,
                                }]}>
                                    <Text style={[s.badgeTxt, { color: underwater ? RED : GREEN }]}>
                                        {underwater ? 'UNDERWATER' : 'RECOVERED'}
                                    </Text>
                                </View>
                            }
                        />
                        <DrawdownChart values={snapValues} />
                    </Card>
                );
            })()}
        </>
    );
}

// ── Helper: compute max drawdown from snapshot values ────────────────────────
function computeRawDrawdown(vals: number[]): number {
    let peak = vals[0];
    let maxDD = 0;
    for (const v of vals) {
        if (v > peak) peak = v;
        const dd = peak > 0 ? ((v - peak) / peak) * 100 : 0;
        if (dd < maxDD) maxDD = dd;
    }
    return maxDD;
}

const s = StyleSheet.create({
    // Score dial
    dialRow:    { flexDirection: 'row', alignItems: 'center', gap: 16 },
    dial:       { width: 84, height: 84, borderRadius: 8, borderWidth: 2,
                  alignItems: 'center', justifyContent: 'center' },
    dialGrade:  { fontSize: 11, fontWeight: '900', fontFamily: mono, letterSpacing: 1 },
    dialScore:  { fontSize: 28, fontWeight: '900', fontFamily: sans, lineHeight: 32 },
    dialOf:     { color: MUTED, fontSize: 10, fontFamily: mono },
    dialCaption:{ color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 2.5 },
    dialLabel:  { fontSize: 15, fontWeight: '700', fontFamily: sans },
    dialSub:    { color: MUTED, fontSize: 10, lineHeight: 14 },

    // Factor bars
    factors:       { gap: 10 },
    factor:        { gap: 5 },
    factorHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    factorLabel:   { color: TXT2, fontSize: 11, fontFamily: mono },
    factorWeight:  { color: MUTED, fontSize: 9, fontFamily: mono },
    factorScore:   { fontSize: 11, fontWeight: '700', fontFamily: mono, width: 24, textAlign: 'right' },
    factorTrack:   { height: 5, backgroundColor: 'rgba(65,72,87,0.5)', borderRadius: 3, overflow: 'hidden' },
    factorFill:    { height: '100%', borderRadius: 3, opacity: 0.85 },

    // Insight banners
    banner:        { backgroundColor: `${GOLD}0A`, borderWidth: 1, borderColor: `${GOLD}22`,
                     borderLeftWidth: 3, borderRadius: 4, padding: 12,
                     flexDirection: 'row', gap: 10, marginBottom: 10 },
    bannerDot:     { width: 6, height: 6, borderRadius: 3, marginTop: 4,
                     shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
    bannerTitle:   { fontSize: 12, fontWeight: '700', fontFamily: sans, marginBottom: 3, letterSpacing: 0.1 },
    bannerBody:    { color: TXT2, fontSize: 11, lineHeight: 17 },

    divider:       { height: 1, backgroundColor: 'rgba(65,72,87,0.6)', marginVertical: 16 },

    badge:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3, borderWidth: 1 },
    badgeTxt:      { fontSize: 9, fontWeight: '700', fontFamily: mono },
});

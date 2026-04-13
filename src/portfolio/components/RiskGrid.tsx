import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BLUE_D, PURPLE_D, RED_D, GREEN_D, GOLD_D, MUTED, TXT2, GREEN, RED, GOLD, PURPLE, sans, mono } from '../tokens';
import type { PerformanceMetrics } from '@/src/services/engineClient';
import { RiskMetrics } from '../types';
import { fmt2 } from '../helpers';

interface Props {
    risk: RiskMetrics;
    engineMetrics?: PerformanceMetrics | null;
}

const RiskCell: React.FC<{ label: string; value: string; sub: string; color: string; bg: string }> =
    ({ label, value, sub, color, bg }) => (
    <View style={[rg.cell, { borderColor: bg, backgroundColor: `${bg}` }]}>
        <Text style={rg.label}>{label}</Text>
        <Text style={[rg.val, { color }]}>{value}</Text>
        <Text style={rg.sub}>{sub}</Text>
    </View>
);

const RiskGrid: React.FC<Props> = ({ risk, engineMetrics }) => {
    // When engine metrics are available, prefer them (more accurate, server-computed)
    const sharpe   = engineMetrics ? engineMetrics.sharpe_ratio              : risk.sharpe;
    const vol      = engineMetrics ? engineMetrics.volatility * 100          : risk.annStd;
    const var95    = engineMetrics ? Math.abs(engineMetrics.var_95) * 100    : Math.abs(risk.var95);
    const winRate  = engineMetrics ? engineMetrics.win_rate * 100            : risk.winRate;

    return (
        <View style={rg.grid}>
            <RiskCell
                label="SHARPE RATIO"
                value={fmt2(sharpe)}
                sub={sharpe >= 1 ? 'Good' : sharpe >= 0.5 ? 'Moderate' : 'Poor'}
                color={sharpe >= 1 ? GREEN : sharpe >= 0 ? GOLD : RED}
                bg={BLUE_D}
            />
            <RiskCell
                label="ANN. VOLATILITY"
                value={`${fmt2(vol)}%`}
                sub="annualised std dev"
                color={TXT2}
                bg={PURPLE_D}
            />
            <RiskCell
                label="VAR 95%"
                value={`${fmt2(var95)}%`}
                sub="daily tail risk"
                color={RED}
                bg={RED_D}
            />
            <RiskCell
                label="WIN RATE"
                value={`${fmt2(winRate)}%`}
                sub="positive days"
                color={winRate >= 50 ? GREEN : RED}
                bg={GREEN_D}
            />

            {/* Engine-only metrics — only shown when server data is available */}
            {engineMetrics && <>
                <RiskCell
                    label="CAGR"
                    value={`${fmt2(engineMetrics.cagr * 100)}%`}
                    sub="compound annual growth"
                    color={engineMetrics.cagr >= 0 ? GREEN : RED}
                    bg={GREEN_D}
                />
                <RiskCell
                    label="SORTINO RATIO"
                    value={fmt2(engineMetrics.sortino_ratio)}
                    sub={engineMetrics.sortino_ratio >= 2 ? 'Excellent' : engineMetrics.sortino_ratio >= 1 ? 'Good' : 'Poor'}
                    color={engineMetrics.sortino_ratio >= 2 ? GREEN : engineMetrics.sortino_ratio >= 1 ? GOLD : RED}
                    bg={BLUE_D}
                />
                <RiskCell
                    label="BETA"
                    value={fmt2(engineMetrics.beta)}
                    sub={engineMetrics.beta > 1.2 ? 'Aggressive' : engineMetrics.beta < 0.8 ? 'Defensive' : 'Market-like'}
                    color={PURPLE}
                    bg={PURPLE_D}
                />
                <RiskCell
                    label="MAX DRAWDOWN"
                    value={`${fmt2(Math.abs(engineMetrics.max_drawdown) * 100)}%`}
                    sub={`${engineMetrics.drawdown_days}d peak-to-trough`}
                    color={RED}
                    bg={RED_D}
                />
                <RiskCell
                    label="CALMAR RATIO"
                    value={fmt2(engineMetrics.calmar_ratio)}
                    sub="return per drawdown unit"
                    color={engineMetrics.calmar_ratio >= 1 ? GREEN : GOLD}
                    bg={GOLD_D}
                />
                <RiskCell
                    label="CVAR 95%"
                    value={`${fmt2(Math.abs(engineMetrics.cvar_95) * 100)}%`}
                    sub="expected shortfall"
                    color={RED}
                    bg={RED_D}
                />
            </>}
        </View>
    );
};

export const rg = StyleSheet.create({
    grid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cell:  { flex: 1, minWidth: '45%', borderRadius: 4, borderWidth: 1, padding: 14, gap: 5 },
    label: { color: MUTED, fontSize: 8, letterSpacing: 2, fontFamily: mono },
    val:   { fontSize: 22, fontWeight: '800', fontFamily: sans },
    sub:   { color: MUTED, fontSize: 9, fontFamily: mono, letterSpacing: 0.5 },
});

export default RiskGrid;

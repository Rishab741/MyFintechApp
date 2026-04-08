import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BLUE_D, PURPLE_D, RED_D, GREEN_D, MUTED, TXT2, GREEN, RED, GOLD, sans, mono } from '../tokens';
import { RiskMetrics } from '../types';
import { fmt2 } from '../helpers';

interface Props { risk: RiskMetrics; }

const RiskCell: React.FC<{ label: string; value: string; sub: string; color: string; bg: string }> =
    ({ label, value, sub, color, bg }) => (
    <View style={[rg.cell, { borderColor: bg, backgroundColor: `${bg}` }]}>
        <Text style={rg.label}>{label}</Text>
        <Text style={[rg.val, { color }]}>{value}</Text>
        <Text style={rg.sub}>{sub}</Text>
    </View>
);

const RiskGrid: React.FC<Props> = ({ risk }) => (
    <View style={rg.grid}>
        <RiskCell
            label="SHARPE RATIO"
            value={fmt2(risk.sharpe)}
            sub={risk.sharpe >= 1 ? 'Good' : risk.sharpe >= 0.5 ? 'Moderate' : 'Poor'}
            color={risk.sharpe >= 1 ? GREEN : risk.sharpe >= 0 ? GOLD : RED}
            bg={BLUE_D}
        />
        <RiskCell
            label="ANN. VOLATILITY"
            value={`${fmt2(risk.annStd)}%`}
            sub="annualised"
            color={TXT2}
            bg={PURPLE_D}
        />
        <RiskCell
            label="VAR 95%"
            value={`${fmt2(risk.var95)}%`}
            sub="daily tail risk"
            color={RED}
            bg={RED_D}
        />
        <RiskCell
            label="WIN RATE"
            value={`${fmt2(risk.winRate)}%`}
            sub="positive days"
            color={risk.winRate >= 50 ? GREEN : RED}
            bg={GREEN_D}
        />
    </View>
);

export const rg = StyleSheet.create({
    grid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cell:  { flex: 1, minWidth: '45%', borderRadius: 4, borderWidth: 1, padding: 14, gap: 5 },
    label: { color: MUTED, fontSize: 8, letterSpacing: 2, fontFamily: mono },
    val:   { fontSize: 22, fontWeight: '800', fontFamily: sans },
    sub:   { color: MUTED, fontSize: 9, fontFamily: mono, letterSpacing: 0.5 },
});

export default RiskGrid;

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GLASS, BORDER, BLUE_D, PURPLE_D, RED_D, GREEN_D, MUTED, TXT2, GREEN, RED, GOLD, serif, sans, mono } from '../tokens';
import { RiskMetrics } from '../types';
import { fmt2 } from '../helpers';

interface Props {
    risk: RiskMetrics;
}

const RiskGrid: React.FC<Props> = ({ risk }) => (
    <View style={rg.riskGrid}>
        <View style={[rg.riskCell, { borderColor: BLUE_D }]}>
            <Text style={rg.riskLabel}>SHARPE RATIO</Text>
            <Text style={[rg.riskVal, { color: risk.sharpe >= 1 ? GREEN : risk.sharpe >= 0 ? GOLD : RED }]}>
                {fmt2(risk.sharpe)}
            </Text>
            <Text style={rg.riskSub}>{risk.sharpe >= 1 ? 'Good' : risk.sharpe >= 0.5 ? 'Moderate' : 'Poor'}</Text>
        </View>
        <View style={[rg.riskCell, { borderColor: PURPLE_D }]}>
            <Text style={rg.riskLabel}>ANN. VOLATILITY</Text>
            <Text style={[rg.riskVal, { color: TXT2 }]}>{fmt2(risk.annStd)}%</Text>
            <Text style={rg.riskSub}>annualised</Text>
        </View>
        <View style={[rg.riskCell, { borderColor: RED_D }]}>
            <Text style={rg.riskLabel}>VAR 95%</Text>
            <Text style={[rg.riskVal, { color: RED }]}>{fmt2(risk.var95)}%</Text>
            <Text style={rg.riskSub}>daily tail risk</Text>
        </View>
        <View style={[rg.riskCell, { borderColor: GREEN_D }]}>
            <Text style={rg.riskLabel}>WIN RATE</Text>
            <Text style={[rg.riskVal, { color: risk.winRate >= 50 ? GREEN : RED }]}>
                {fmt2(risk.winRate)}%
            </Text>
            <Text style={rg.riskSub}>positive days</Text>
        </View>
    </View>
);

export const rg = StyleSheet.create({
    riskGrid: { flexDirection:'row', flexWrap:'wrap', gap:8 },
    riskCell: { flex:1, minWidth:'45%', backgroundColor: GLASS, borderRadius:12, borderWidth:1, padding:14, gap:4 },
    riskLabel:{ color: MUTED, fontSize:8, letterSpacing:1.5, fontFamily: sans },
    riskVal:  { fontSize:22, fontWeight:'700', fontFamily: serif },
    riskSub:  { color: MUTED, fontSize:9, fontFamily: mono },
});

export default RiskGrid;

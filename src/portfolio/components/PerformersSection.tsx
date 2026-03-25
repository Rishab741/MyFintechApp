import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BORDER, GREEN, GREEN_D, RED, RED_D, MUTED, TXT, serif, mono } from '../tokens';
import { PerformerItem } from '../types';
import { tickerColor, fmtCurrency, fmt2 } from '../helpers';
import Card from './Card';
import SHead from './SHead';

interface Props {
    top: PerformerItem[];
    bottom: PerformerItem[];
}

const PerformersSection: React.FC<Props> = ({ top, bottom }) => (
    <>
        {top.length > 0 && (
            <Card>
                <SHead title="Top Performers" right={
                    <View style={[perf.tagPill, { backgroundColor: GREEN_D, borderColor: GREEN+'44' }]}>
                        <Text style={{ color: GREEN, fontSize: 9, fontWeight: '700', fontFamily: mono }}>↑ GAINERS</Text>
                    </View>
                } />
                {top.map((p, i) => {
                    const accent = tickerColor(p.ticker);
                    return (
                        <View key={i} style={[perf.row, i < top.length-1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                            <View style={[perf.icon, { backgroundColor: accent+'22', borderColor: accent+'44' }]}>
                                <Text style={[perf.iconTxt, { color: accent }]}>{p.ticker[0]}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={perf.ticker}>{p.ticker}</Text>
                                <Text style={perf.val}>{fmtCurrency(p.value, p.currency)}</Text>
                            </View>
                            <View style={[perf.badge, { backgroundColor: GREEN_D }]}>
                                <Text style={[perf.pct, { color: GREEN }]}>
                                    +{fmt2(p.pct)}%
                                </Text>
                            </View>
                        </View>
                    );
                })}
            </Card>
        )}

        {bottom.length > 0 && (
            <Card>
                <SHead title="Underperformers" right={
                    <View style={[perf.tagPill, { backgroundColor: RED_D, borderColor: RED+'44' }]}>
                        <Text style={{ color: RED, fontSize: 9, fontWeight: '700', fontFamily: mono }}>↓ LAGGING</Text>
                    </View>
                } />
                {bottom.map((p, i) => {
                    const accent = tickerColor(p.ticker);
                    return (
                        <View key={i} style={[perf.row, i < bottom.length-1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                            <View style={[perf.icon, { backgroundColor: accent+'22', borderColor: accent+'44' }]}>
                                <Text style={[perf.iconTxt, { color: accent }]}>{p.ticker[0]}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={perf.ticker}>{p.ticker}</Text>
                                <Text style={perf.val}>{fmtCurrency(p.value, p.currency)}</Text>
                            </View>
                            <View style={[perf.badge, { backgroundColor: RED_D }]}>
                                <Text style={[perf.pct, { color: RED }]}>{fmt2(p.pct)}%</Text>
                            </View>
                        </View>
                    );
                })}
            </Card>
        )}
    </>
);

export const perf = StyleSheet.create({
    row:     { flexDirection:'row', alignItems:'center', paddingVertical: 12, gap: 12 },
    icon:    { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems:'center', justifyContent:'center' },
    iconTxt: { fontSize: 15, fontWeight:'700', fontFamily: serif },
    ticker:  { color: TXT, fontSize: 13, fontWeight:'700', fontFamily: serif },
    val:     { color: MUTED, fontSize: 11, marginTop: 2, fontFamily: mono },
    badge:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    pct:     { fontSize: 13, fontWeight:'700', fontFamily: mono },
    tagPill: { paddingHorizontal:8, paddingVertical:3, borderRadius:6, borderWidth:1 },
});

export default PerformersSection;

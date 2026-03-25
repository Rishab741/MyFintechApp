import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { CARD2, BORDER, MUTED, TXT, GREEN, GREEN_D, RED, RED_D, GOLD, serif, mono } from '../tokens';
import { Position } from '../types';
import { getUnits, getTicker, fmtCurrency, fmt2, fmt4, sign, tickerColor } from '../helpers';

const HoldingRow: React.FC<{ pos: Position; totalValue: number; index: number }> = ({ pos, totalValue, index }) => {
    const fade  = useRef(new Animated.Value(0)).current;
    const slide = useRef(new Animated.Value(20)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade,  { toValue: 1, duration: 450, delay: index * 80, useNativeDriver: true }),
            Animated.spring(slide, { toValue: 0, tension: 70, friction: 10, delay: index * 80, useNativeDriver: true } as any),
        ]).start();
    }, []);

    const ticker    = getTicker(pos.symbol);
    const units     = getUnits(pos);
    const price     = pos.price ?? 0;
    const value     = units * price;
    const pnl       = pos.open_pnl ?? 0;
    const allocPct  = totalValue > 0 ? (value / totalValue) * 100 : 0;
    const pnlPct    = pnl !== 0 && (value - pnl) > 0 ? (pnl / (value - pnl)) * 100 : 0;
    const hasPnl    = pnl !== 0;
    const accent    = tickerColor(ticker);
    const pnlColor2 = hasPnl ? (pnl >= 0 ? GREEN : RED) : GOLD;

    return (
        <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
            <View style={hr.card}>
                {/* Accent bar */}
                <View style={[hr.accentBar, { backgroundColor: accent }]} />

                <View style={[hr.iconWrap, { backgroundColor: accent + '1A', borderColor: accent + '40' }]}>
                    <Text style={[hr.iconTxt, { color: accent }]}>{ticker[0]}</Text>
                </View>

                <View style={hr.mid}>
                    <Text style={hr.ticker}>{ticker}</Text>
                    <Text style={hr.units}>{units < 1 ? fmt4(units) : fmt2(units)} @ {fmtCurrency(price, pos.currency)}</Text>
                    {/* Allocation mini bar */}
                    <View style={hr.allocBar}>
                        <View style={[hr.allocFill, { width: `${Math.min(allocPct, 100)}%`, backgroundColor: accent }]} />
                    </View>
                </View>

                <View style={hr.right}>
                    <Text style={hr.value}>{fmtCurrency(value, pos.currency)}</Text>
                    {hasPnl ? (
                        <View style={[hr.badge, { backgroundColor: pnl >= 0 ? GREEN_D : RED_D }]}>
                            <Text style={[hr.pct, { color: pnlColor2 }]}>
                                {sign(pnlPct)}{fmt2(Math.abs(pnlPct))}%
                            </Text>
                        </View>
                    ) : (
                        <Text style={[hr.pct, { color: MUTED }]}>{fmt2(allocPct)}% alloc</Text>
                    )}
                </View>
            </View>
        </Animated.View>
    );
};

export const hr = StyleSheet.create({
    card:      { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD2, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 8, gap: 12, overflow: 'hidden' },
    accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
    iconWrap:  { width: 46, height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    iconTxt:   { fontSize: 18, fontWeight: '700', fontFamily: serif },
    mid:       { flex: 1, gap: 3 },
    ticker:    { color: TXT, fontSize: 15, fontWeight: '700', fontFamily: serif },
    units:     { color: MUTED, fontSize: 10, fontFamily: mono },
    allocBar:  { height: 2, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden', marginTop: 2 },
    allocFill: { height: '100%', borderRadius: 1, opacity: 0.6 },
    right:     { alignItems: 'flex-end', gap: 5 },
    value:     { color: TXT, fontSize: 14, fontWeight: '700', fontFamily: mono },
    badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
    pct:       { fontSize: 11, fontWeight: '700', fontFamily: mono },
});

export default HoldingRow;

import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { CHART_W, MUTED, GREEN, RED, GOLD, mono } from '../tokens';
import { clamp, fmt2, sign } from '../helpers';

const ReturnsHistogram: React.FC<{
    returns: number[];
    w?: number; h?: number;
}> = ({ returns, w = CHART_W, h = 150 }) => {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: false }).start();
    }, [returns.length]);

    if (returns.length < 3) return (
        <View style={{ height: h, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: MUTED, fontSize: 11, fontFamily: mono }}>NEED MORE SNAPSHOTS</Text>
        </View>
    );

    const MIN_BIN = -6; const MAX_BIN = 6; const BIN_W = 1;
    const bins: number[] = Array.from({ length: (MAX_BIN - MIN_BIN) / BIN_W }, () => 0);
    returns.forEach(r => {
        const idx = clamp(Math.floor((r - MIN_BIN) / BIN_W), 0, bins.length - 1);
        bins[idx]++;
    });

    const maxFreq = Math.max(...bins, 1);
    const barW    = (w - 2) / bins.length;
    const mean    = returns.reduce((a, b) => a + b, 0) / returns.length;
    const meanX   = ((mean - MIN_BIN) / (MAX_BIN - MIN_BIN)) * w;
    const zeroX   = ((0 - MIN_BIN) / (MAX_BIN - MIN_BIN)) * w;

    return (
        <View style={{ width: w }}>
            {/* Chart */}
            <View style={{ width: w, height: h, flexDirection: 'row', alignItems: 'flex-end', position: 'relative' }}>
                {/* Zero baseline emphasis */}
                <View style={{
                    position: 'absolute', left: zeroX - 0.5, top: 0, bottom: 0,
                    width: 1.5, backgroundColor: 'rgba(255,255,255,0.12)',
                }} />

                {/* Bars */}
                {bins.map((freq, i) => {
                    const binMid  = MIN_BIN + (i + 0.5) * BIN_W;
                    const isGreen = binMid >= 0;
                    const pct     = freq / maxFreq;
                    const color   = isGreen ? GREEN : RED;
                    return (
                        <View key={i} style={{ width: barW - 1.5, marginRight: 1.5, height: h, justifyContent: 'flex-end' }}>
                            <Animated.View style={{
                                width: '100%',
                                height: anim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, Math.max(pct * (h - 20), freq > 0 ? 5 : 0)],
                                }),
                                backgroundColor: color,
                                opacity: anim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, 0.55 + pct * 0.45],
                                }),
                                borderRadius: 3,
                            }} />
                        </View>
                    );
                })}

                {/* Mean line */}
                <View style={{
                    position: 'absolute', left: meanX, top: 0, bottom: 0,
                    width: 2, backgroundColor: GOLD, opacity: 0.9,
                    shadowColor: GOLD, shadowOpacity: 0.6, shadowRadius: 6,
                }} />
            </View>

            {/* X axis labels */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                {['-6%', '-3%', '0%', '+3%', '+6%'].map((l, i) => (
                    <Text key={i} style={{ color: MUTED, fontSize: 9, fontFamily: mono }}>{l}</Text>
                ))}
            </View>

            {/* Legend */}
            <View style={{ flexDirection: 'row', gap: 20, marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 12, height: 2, backgroundColor: GOLD, borderRadius: 1, shadowColor: GOLD, shadowOpacity: 0.8, shadowRadius: 4 }} />
                    <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>
                        Mean {sign(mean)}{fmt2(mean)}%
                    </Text>
                </View>
                <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>n={returns.length} sessions</Text>
            </View>
        </View>
    );
};

export default ReturnsHistogram;

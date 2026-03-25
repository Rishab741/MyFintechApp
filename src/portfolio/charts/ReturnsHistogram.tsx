import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { CHART_W, MUTED, GREEN, RED, GOLD, mono } from '../tokens';
import { clamp, fmt2, sign } from '../helpers';

/**
 * Returns Histogram — shows distribution of daily returns as vertical bars.
 * Bins: -5%, -4%…+5%. Bar height = frequency.
 */
const ReturnsHistogram: React.FC<{
    returns: number[];  // array of daily % returns
    w?: number; h?: number;
}> = ({ returns, w = CHART_W, h = 100 }) => {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: false }).start();
    }, [returns.length]);

    if (returns.length < 3) return (
        <View style={{ height: h, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: MUTED, fontSize: 11, fontFamily: mono }}>NEED MORE SNAPSHOTS</Text>
        </View>
    );

    const MIN_BIN  = -6; const MAX_BIN = 6; const BIN_W = 1;
    const bins: number[] = Array.from({ length: (MAX_BIN - MIN_BIN) / BIN_W }, () => 0);
    returns.forEach(r => {
        const idx = clamp(Math.floor((r - MIN_BIN) / BIN_W), 0, bins.length - 1);
        bins[idx]++;
    });
    const maxFreq = Math.max(...bins, 1);
    const barW    = (w - 2) / bins.length;
    const mean    = returns.reduce((a,b) => a+b, 0) / returns.length;
    const meanX   = ((mean - MIN_BIN) / (MAX_BIN - MIN_BIN)) * w;

    return (
        <View style={{ width: w }}>
            <View style={{ width: w, height: h, flexDirection: 'row', alignItems: 'flex-end' }}>
                {bins.map((freq, i) => {
                    const binMid  = MIN_BIN + (i + 0.5) * BIN_W;
                    const isGreen = binMid >= 0;
                    const pct     = freq / maxFreq;
                    return (
                        <View key={i} style={{ width: barW - 1, marginRight: 1, height: h, justifyContent: 'flex-end' }}>
                            <Animated.View style={{
                                width: '100%',
                                height: anim.interpolate({ inputRange: [0,1], outputRange: [0, Math.max(pct * (h - 16), freq > 0 ? 4 : 0)] }),
                                backgroundColor: isGreen ? GREEN : RED,
                                opacity: 0.7 + pct * 0.3,
                                borderRadius: 2,
                            }} />
                        </View>
                    );
                })}
                {/* Mean line */}
                <View style={{ position: 'absolute', left: meanX, top: 0, bottom: 0, width: 1.5, backgroundColor: GOLD, opacity: 0.8 }} />
            </View>
            {/* X axis labels */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                {['-6%', '-3%', '0%', '+3%', '+6%'].map((l, i) => (
                    <Text key={i} style={{ color: MUTED, fontSize: 9, fontFamily: mono }}>{l}</Text>
                ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 2, backgroundColor: GOLD }} />
                    <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>Mean {sign(mean)}{fmt2(mean)}%</Text>
                </View>
                <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>n={returns.length} sessions</Text>
            </View>
        </View>
    );
};

export default ReturnsHistogram;

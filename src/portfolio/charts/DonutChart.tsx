import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { MUTED, TXT, sans, serif, mono } from '../tokens';
import { fmt2, fmtCurrency } from '../helpers';

const DonutChart: React.FC<{
    segments: { label: string; value: number; color: string; pct: number }[];
    total: number; currency: string;
    size?: number;
}> = ({ segments, total, currency, size = 220 }) => {
    const anim  = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.timing(anim, { toValue: 1, duration: 1100, useNativeDriver: false }).start();
        Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1.03, duration: 2400, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1.00, duration: 2400, useNativeDriver: true }),
        ])).start();
    }, []);

    const nonZero = segments.filter(s => s.pct > 0.5);
    const r       = size / 2;
    const cx = r; const cy = r;
    const strokeW = 34;
    const R = r - strokeW / 2 - 4;

    let cumAngle = -90;
    const arcViews = nonZero.map((seg, i) => {
        const sweepDeg = (seg.pct / 100) * 360;
        const startDeg = cumAngle;
        cumAngle += sweepDeg;

        const slices = Math.ceil(sweepDeg / 3);
        const slice  = sweepDeg / slices;
        return Array.from({ length: slices }).map((_, j) => {
            const deg = startDeg + j * slice + slice / 2;
            const rad = (deg * Math.PI) / 180;
            const x   = cx + R * Math.cos(rad);
            const y   = cy + R * Math.sin(rad);
            return (
                <View key={`${i}-${j}`} style={{
                    position: 'absolute',
                    left: x - strokeW / 2, top: y - 2.5,
                    width: strokeW, height: 5,
                    backgroundColor: seg.color,
                    borderRadius: 2.5,
                    transform: [{ rotate: `${deg + 90}deg` }],
                    opacity: 0.95,
                } as any} />
            );
        });
    });

    return (
        <View style={{ alignItems: 'center' }}>
            {/* Ring */}
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
                <View style={{ width: size, height: size, position: 'relative' }}>
                    {/* Background ring */}
                    <View style={{
                        position: 'absolute',
                        left: 4, top: 4, right: 4, bottom: 4,
                        borderRadius: (size - 8) / 2,
                        borderWidth: strokeW,
                        borderColor: 'rgba(255,255,255,0.04)',
                    }} />
                    {/* Arc segments */}
                    {arcViews}
                    {/* Center label */}
                    <View style={{
                        position: 'absolute',
                        left: strokeW + 10, top: strokeW + 10,
                        right: strokeW + 10, bottom: strokeW + 10,
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Text style={{ color: MUTED, fontSize: 9, fontFamily: sans, letterSpacing: 1.8, marginBottom: 6 }}>
                            TOTAL
                        </Text>
                        <Text style={{ color: TXT, fontSize: 17, fontWeight: '700', fontFamily: serif, textAlign: 'center', lineHeight: 22 }}>
                            {fmtCurrency(total, currency)}
                        </Text>
                    </View>
                </View>
            </Animated.View>

            {/* Legend */}
            <View style={{ width: '100%', marginTop: 20, gap: 10 }}>
                {nonZero.map((seg, i) => (
                    <View key={i} style={d_s.legendRow}>
                        <View style={[d_s.dot, { backgroundColor: seg.color }]} />
                        <Text style={d_s.legendLabel}>{seg.label}</Text>
                        <View style={d_s.legendBar}>
                            <Animated.View style={{
                                width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${seg.pct}%`] }),
                                height: '100%',
                                backgroundColor: seg.color,
                                borderRadius: 3,
                                opacity: 0.7,
                                shadowColor: seg.color,
                                shadowOpacity: 0.4,
                                shadowRadius: 4,
                            }} />
                        </View>
                        <Text style={[d_s.legendPct, { color: seg.color }]}>{fmt2(seg.pct)}%</Text>
                    </View>
                ))}
            </View>
        </View>
    );
};

export const d_s = StyleSheet.create({
    legendRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dot:         { width: 8, height: 8, borderRadius: 4 },
    legendLabel: { color: '#B8B2A8', fontSize: 12, width: 72 },
    legendBar:   { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' },
    legendPct:   { fontSize: 12, fontWeight: '700', fontFamily: mono, width: 46, textAlign: 'right' },
});

export default DonutChart;

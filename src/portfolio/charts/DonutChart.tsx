import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { MUTED, TXT, sans, serif, mono } from '../tokens';
import { fmt2, fmtCurrency } from '../helpers';

/**
 * Donut/Pie chart using absolute-positioned arc-segment views.
 * Pure RN: each segment is a clipped circular view rotated appropriately.
 * For simplicity and reliability we render as a bar + legend hybrid ("donut bar").
 * This is a deliberate design choice — more readable on small screens.
 */
const DonutChart: React.FC<{
    segments: { label: string; value: number; color: string; pct: number }[];
    total: number; currency: string;
    size?: number;
}> = ({ segments, total, currency, size = 180 }) => {
    const anim  = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: false }).start();
        Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1.04, duration: 2200, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1.00, duration: 2200, useNativeDriver: true }),
        ])).start();
    }, []);

    const nonZero = segments.filter(s => s.pct > 0.5);
    const r = size / 2;
    const cx = r; const cy = r;
    const strokeW = 28;
    const R = r - strokeW / 2 - 4;

    // Arc segments using strokeDasharray trick via absolute border Views
    // We implement a real-looking ring via conic-gradient simulation with Views
    // Since RN has no SVG, we render ring as stacked rotated half-discs
    let cumAngle = -90; // start at top
    const arcViews = nonZero.map((seg, i) => {
        const sweepDeg = (seg.pct / 100) * 360;
        const startDeg = cumAngle;
        cumAngle += sweepDeg;

        // Each arc is approximated by thin rect slices for smooth appearance
        const slices = Math.ceil(sweepDeg / 4);
        const slice  = sweepDeg / slices;
        return Array.from({ length: slices }).map((_, j) => {
            const deg = startDeg + j * slice + slice / 2;
            const rad = (deg * Math.PI) / 180;
            const x   = cx + R * Math.cos(rad);
            const y   = cy + R * Math.sin(rad);
            return (
                <View key={`${i}-${j}`} style={{
                    position: 'absolute',
                    left: x - strokeW / 2, top: y - 2,
                    width: strokeW, height: 4,
                    backgroundColor: seg.color,
                    borderRadius: 2,
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
                        left: strokeW + 8, top: strokeW + 8,
                        right: strokeW + 8, bottom: strokeW + 8,
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Text style={{ color: MUTED, fontSize: 9, fontFamily: sans, letterSpacing: 1.5, marginBottom: 4 }}>
                            TOTAL
                        </Text>
                        <Text style={{ color: TXT, fontSize: 14, fontWeight: '700', fontFamily: serif, textAlign: 'center' }}>
                            {fmtCurrency(total, currency)}
                        </Text>
                    </View>
                </View>
            </Animated.View>

            {/* Legend */}
            <View style={{ width: '100%', marginTop: 16, gap: 8 }}>
                {nonZero.map((seg, i) => (
                    <View key={i} style={d_s.legendRow}>
                        <View style={[d_s.dot, { backgroundColor: seg.color }]} />
                        <Text style={d_s.legendLabel}>{seg.label}</Text>
                        <View style={d_s.legendBar}>
                            <Animated.View style={{
                                width: anim.interpolate({ inputRange: [0,1], outputRange: ['0%', `${seg.pct}%`] }),
                                height: '100%', backgroundColor: seg.color, borderRadius: 2, opacity: 0.6,
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
    legendRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot:         { width: 7, height: 7, borderRadius: 3.5 },
    legendLabel: { color: '#B8B2A8', fontSize: 11, width: 68 },
    legendBar:   { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' },
    legendPct:   { fontSize: 11, fontWeight: '700', fontFamily: mono, width: 44, textAlign: 'right' },
});

export default DonutChart;

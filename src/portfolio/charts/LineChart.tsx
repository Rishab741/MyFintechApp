import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { CHART_W, MUTED, mono } from '../tokens';

/**
 * SVG-like line chart using absolute-positioned Views.
 * Each segment is a thin rotated rectangle.
 */
const LineChart: React.FC<{
    series: { values: number[]; color: string; width?: number; opacity?: number }[];
    w?: number; h?: number; padding?: number;
}> = ({ series, w = CHART_W, h = 120, padding = 10 }) => {
    const anim   = useRef(new Animated.Value(0)).current;
    const allVals = series.flatMap(s => s.values);
    useEffect(() => {
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }).start();
    }, [JSON.stringify(allVals)]);

    if (allVals.length < 2) return (
        <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: MUTED, fontSize: 11, fontFamily: mono }}>AWAITING DATA</Text>
        </View>
    );

    const min = Math.min(...allVals); const max = Math.max(...allVals);
    const range = max - min || 1;
    const inner_w = w - padding * 2; const inner_h = h - padding * 2;

    const toXY = (vals: number[]) => vals.map((v, i) => ({
        x: padding + (i / (vals.length - 1)) * inner_w,
        y: padding + inner_h - ((v - min) / range) * inner_h,
    }));

    // Horizontal grid lines
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
        y: padding + inner_h * (1 - pct),
        val: min + range * pct,
    }));

    return (
        <View style={{ width: w, height: h }}>
            {/* Grid */}
            {gridLines.map((g, i) => (
                <View key={i} style={{
                    position: 'absolute', left: 0, top: g.y, right: 0,
                    height: 1, backgroundColor: i === 2 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                }} />
            ))}

            {/* Series */}
            {series.map((s, si) => {
                if (s.values.length < 2) return null;
                const pts = toXY(s.values);
                return pts.slice(0, -1).map((p1, i) => {
                    const p2  = pts[i + 1];
                    const dx  = p2.x - p1.x; const dy = p2.y - p1.y;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    const deg = Math.atan2(dy, dx) * (180 / Math.PI);
                    const lw  = s.width ?? 2;
                    return (
                        <View key={`${si}-${i}`} style={{
                            position: 'absolute',
                            left: p1.x, top: p1.y - lw / 2,
                            width: len, height: lw,
                            backgroundColor: s.color,
                            borderRadius: lw / 2,
                            opacity: s.opacity ?? 0.9,
                            transform: [{ rotate: `${deg}deg` }],
                            transformOrigin: '0 50%',
                        } as any} />
                    );
                });
            })}

            {/* End dots */}
            {series.map((s, si) => {
                if (!s.values.length) return null;
                const pts = toXY(s.values);
                const last = pts[pts.length - 1];
                const r = (s.width ?? 2) + 2;
                return (
                    <View key={`dot-${si}`} style={{
                        position: 'absolute',
                        left: last.x - r, top: last.y - r,
                        width: r * 2, height: r * 2, borderRadius: r,
                        backgroundColor: s.color,
                        shadowColor: s.color, shadowOpacity: 1, shadowRadius: 8,
                    }} />
                );
            })}
        </View>
    );
};

export default LineChart;

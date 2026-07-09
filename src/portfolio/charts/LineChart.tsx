import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { CHART_W, MUTED, mono } from '../tokens';

/**
 * SVG-like line chart using absolute-positioned Views.
 * Includes animated area fill below each series.
 */
const LineChart: React.FC<{
    series: { values: number[]; color: string; width?: number; opacity?: number; fill?: boolean }[];
    w?: number; h?: number; padding?: number;
}> = ({ series, w = CHART_W, h = 180, padding = 12 }) => {
    const anim   = useRef(new Animated.Value(0)).current;
    const allVals = series.flatMap(s => s.values);

    useEffect(() => {
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: false }).start();
    }, [JSON.stringify(allVals)]);

    if (allVals.length < 2) return (
        <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: MUTED, fontSize: 11, fontFamily: mono }}>AWAITING DATA</Text>
        </View>
    );

    const min    = Math.min(...allVals);
    const max    = Math.max(...allVals);
    const range  = max - min || 1;
    const innerW = w - padding * 2;
    const innerH = h - padding * 2;

    const toXY = (vals: number[]) => vals.map((v, i) => ({
        x: padding + (i / (vals.length - 1)) * innerW,
        y: padding + innerH - ((v - min) / range) * innerH,
    }));

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
        y: padding + innerH * (1 - pct),
        isMid: pct === 0.5,
    }));

    return (
        <View style={{ width: w, height: h }}>
            {/* Grid lines */}
            {gridLines.map((g, i) => (
                <View key={i} style={{
                    position: 'absolute', left: 0, top: g.y, right: 0, height: 1,
                    backgroundColor: g.isMid
                        ? 'rgba(255,255,255,0.10)'
                        : 'rgba(255,255,255,0.04)',
                }} />
            ))}

            {/* Area fills (first series only, behind lines) */}
            {series.map((s, si) => {
                const doFill = s.fill !== false && si === 0;
                if (!doFill || s.values.length < 2) return null;
                const pts = toXY(s.values);
                const bottom = padding + innerH;
                return pts.slice(0, -1).map((p1, i) => {
                    const p2   = pts[i + 1];
                    const midX = (p1.x + p2.x) / 2;
                    const topY = Math.min(p1.y, p2.y);
                    const colH = bottom - topY;
                    return (
                        <Animated.View key={`fill-${si}-${i}`} style={{
                            position: 'absolute',
                            left: p1.x, top: topY,
                            width: p2.x - p1.x + 1,
                            height: anim.interpolate({
                                inputRange: [0, 1], outputRange: [0, colH],
                            }),
                            backgroundColor: s.color,
                            opacity: 0.06,
                        }} />
                    );
                });
            })}

            {/* Line segments */}
            {series.map((s, si) => {
                if (s.values.length < 2) return null;
                const pts = toXY(s.values);
                const lw  = s.width ?? 2.5;
                return pts.slice(0, -1).map((p1, i) => {
                    const p2  = pts[i + 1];
                    const dx  = p2.x - p1.x;
                    const dy  = p2.y - p1.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const deg = Math.atan2(dy, dx) * (180 / Math.PI);
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

            {/* Glowing end dots */}
            {series.map((s, si) => {
                if (!s.values.length) return null;
                const pts  = toXY(s.values);
                const last = pts[pts.length - 1];
                const r    = (s.width ?? 2.5) + 2;
                return (
                    <React.Fragment key={`dot-${si}`}>
                        {/* Outer glow */}
                        <View style={{
                            position: 'absolute',
                            left: last.x - r * 2.5, top: last.y - r * 2.5,
                            width: r * 5, height: r * 5, borderRadius: r * 2.5,
                            backgroundColor: s.color,
                            opacity: 0.12,
                        }} />
                        {/* Inner dot */}
                        <View style={{
                            position: 'absolute',
                            left: last.x - r, top: last.y - r,
                            width: r * 2, height: r * 2, borderRadius: r,
                            backgroundColor: s.color,
                            shadowColor: s.color, shadowOpacity: 1, shadowRadius: 8,
                        }} />
                    </React.Fragment>
                );
            })}
        </View>
    );
};

export default LineChart;

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { CHART_W, RED, RED_D, GREEN, GOLD, MUTED, CARD2, BORDER, mono, sans } from '../tokens';
import { fmt2 } from '../helpers';

const N_COLS   = 64;
const Y_LABELS = 4;
const LABEL_W  = 44;

const sample = (arr: number[], n: number): number[] =>
    Array.from({ length: n }, (_, i) => {
        const idx = Math.round((i / (n - 1)) * (arr.length - 1));
        return arr[Math.min(idx, arr.length - 1)];
    });

const Chip: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
    <View style={chip.wrap}>
        <Text style={chip.label}>{label}</Text>
        <Text style={[chip.value, { color }]}>{value}</Text>
    </View>
);
const chip = StyleSheet.create({
    wrap:  {
        flex: 1, backgroundColor: CARD2, borderRadius: 12,
        borderWidth: 1, borderColor: BORDER,
        paddingVertical: 14, paddingHorizontal: 14, gap: 6,
    },
    label: { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 1.8, textTransform: 'uppercase' },
    value: { fontSize: 16, fontWeight: '700', fontFamily: sans },
});

const DrawdownChart: React.FC<{ values: number[]; w?: number; h?: number }> =
    ({ values, w = CHART_W, h = 160 }) => {

    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: false }).start();
    }, [values.length]);

    if (values.length < 2) return null;

    let peak = values[0];
    const dd = values.map(v => {
        peak = Math.max(peak, v);
        return peak > 0 ? ((v - peak) / peak) * 100 : 0;
    });

    const minDD     = Math.min(...dd);
    const currentDD = dd[dd.length - 1];
    const range     = Math.abs(minDD) || 1;
    const recovered = currentDD >= -0.5;

    const cols  = sample(dd, N_COLS);
    const chartW = w - LABEL_W;
    const colW   = chartW / N_COLS;
    const barW   = Math.max(colW - 1.5, 1);

    const gridLevels = Array.from({ length: Y_LABELS }, (_, i) =>
        (minDD * (i + 1)) / Y_LABELS
    );

    return (
        <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                {/* Y-axis labels */}
                <View style={{ width: LABEL_W, height: h, position: 'relative' }}>
                    <Text style={[s.yLabel, { top: -6 }]}>0%</Text>
                    {gridLevels.map((lvl, i) => {
                        const yPos = (Math.abs(lvl) / range) * h - 6;
                        return (
                            <Text key={i} style={[s.yLabel, { top: yPos }]}>
                                {fmt2(lvl)}%
                            </Text>
                        );
                    })}
                </View>

                {/* Bars */}
                <View style={[s.chartArea, { width: chartW, height: h }]}>
                    {/* Grid lines */}
                    {gridLevels.map((lvl, i) => {
                        const yPos = (Math.abs(lvl) / range) * h;
                        return <View key={i} style={[s.gridLine, { top: yPos }]} />;
                    })}

                    {/* Baseline */}
                    <View style={s.baseline} />

                    {/* Bars */}
                    {cols.map((v, i) => {
                        const depth  = Math.abs(v) / range;
                        const barH   = anim.interpolate({
                            inputRange: [0, 1], outputRange: [0, depth * h],
                        });
                        const barColor = depth > 0.65 ? RED : depth > 0.35 ? '#D94060' : '#A83050';
                        const fillOpacity = anim.interpolate({
                            inputRange: [0, 1], outputRange: [0, 0.18 + depth * 0.28],
                        });

                        return (
                            <View key={i} style={[s.colWrap, { left: i * colW, width: barW, height: h }]}>
                                <Animated.View style={[s.barFill, {
                                    height: barH, backgroundColor: RED_D, opacity: fillOpacity,
                                }]} />
                                <Animated.View style={[s.barLine, {
                                    height: barH,
                                    borderTopWidth: depth > 0.02 ? 1.5 : 0,
                                    borderTopColor: barColor,
                                }]} />
                            </View>
                        );
                    })}

                    {/* Current level indicator */}
                    {currentDD < -0.5 && (
                        <View style={[s.currentLine, {
                            top: (Math.abs(currentDD) / range) * h,
                            borderColor: recovered ? `${GREEN}60` : `${GOLD}50`,
                        }]}>
                            <View style={[s.currentDot, { backgroundColor: recovered ? GREEN : GOLD }]} />
                        </View>
                    )}
                </View>
            </View>

            {/* Stat chips */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
                <Chip label="Max Drawdown" value={`${fmt2(minDD)}%`}     color={RED} />
                <Chip label="Current"      value={`${fmt2(currentDD)}%`} color={currentDD < -2 ? RED : currentDD < -0.5 ? GOLD : GREEN} />
                <Chip label="Status"       value={recovered ? 'Recovered' : 'Underwater'} color={recovered ? GREEN : GOLD} />
            </View>
        </View>
    );
};

const s = StyleSheet.create({
    yLabel:    { position: 'absolute', right: 4, color: MUTED, fontSize: 8, fontFamily: mono, textAlign: 'right' },
    chartArea: { overflow: 'hidden', position: 'relative' },
    gridLine:  { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
    baseline:  { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, backgroundColor: `rgba(201,162,75,0.25)` },
    colWrap:   { position: 'absolute', top: 0, overflow: 'hidden', justifyContent: 'flex-start' },
    barFill:   { width: '100%' },
    barLine:   { position: 'absolute', top: 0, width: '100%' },
    currentLine: {
        position: 'absolute', left: 0, right: 0, height: 1,
        borderWidth: 0, borderTopWidth: 1, borderStyle: 'dashed',
        flexDirection: 'row', alignItems: 'center',
    },
    currentDot: { width: 7, height: 7, borderRadius: 3.5, position: 'absolute', right: 0 },
});

export default DrawdownChart;

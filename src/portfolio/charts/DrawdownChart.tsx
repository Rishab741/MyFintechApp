import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { CHART_W, RED, RED_D, GREEN, GOLD, MUTED, CARD2, BORDER, mono, sans } from '../tokens';
import { fmt2 } from '../helpers';

// ─── Config ───────────────────────────────────────────────────────────────────
const N_COLS   = 52;   // number of vertical bars
const Y_LABELS = 4;    // number of grid lines / y-axis labels
const LABEL_W  = 38;   // reserved width for y-axis labels

// ─── Helper: sample an array to exactly N points ──────────────────────────────
const sample = (arr: number[], n: number): number[] =>
    Array.from({ length: n }, (_, i) => {
        const idx = Math.round((i / (n - 1)) * (arr.length - 1));
        return arr[Math.min(idx, arr.length - 1)];
    });

// ─── Stat chip ────────────────────────────────────────────────────────────────
const Chip: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
    <View style={chip.wrap}>
        <Text style={chip.label}>{label}</Text>
        <Text style={[chip.value, { color }]}>{value}</Text>
    </View>
);
const chip = StyleSheet.create({
    wrap:  { flex: 1, backgroundColor: CARD2, borderRadius: 10, borderWidth: 1,
             borderColor: BORDER, paddingVertical: 10, paddingHorizontal: 12, gap: 4 },
    label: { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 1.8,
             textTransform: 'uppercase' },
    value: { fontSize: 13, fontWeight: '700', fontFamily: sans },
});

// ─── DrawdownChart ────────────────────────────────────────────────────────────
const DrawdownChart: React.FC<{ values: number[]; w?: number; h?: number }> =
    ({ values, w = CHART_W, h = 110 }) => {

    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        anim.setValue(0);
        Animated.timing(anim, {
            toValue: 1, duration: 900, useNativeDriver: false,
        }).start();
    }, [values.length]);

    if (values.length < 2) return null;

    // ── Compute drawdown series ──────────────────────────────────────────────
    let peak = values[0];
    const dd = values.map(v => {
        peak = Math.max(peak, v);
        return peak > 0 ? ((v - peak) / peak) * 100 : 0;
    });

    const minDD     = Math.min(...dd);          // most negative = worst drawdown
    const currentDD = dd[dd.length - 1];
    const range     = Math.abs(minDD) || 1;
    const recovered = currentDD >= -0.5;

    // ── Downsample ───────────────────────────────────────────────────────────
    const cols = sample(dd, N_COLS);

    // ── Layout ───────────────────────────────────────────────────────────────
    const chartW   = w - LABEL_W;              // chart area (excl. y-axis labels)
    const colW     = chartW / N_COLS;
    const barW     = Math.max(colW - 1.5, 1);  // bar width with gap

    // Y-axis grid levels (evenly spaced between 0 and minDD)
    const gridLevels = Array.from({ length: Y_LABELS }, (_, i) =>
        (minDD * (i + 1)) / Y_LABELS
    );

    return (
        <View style={{ gap: 12 }}>

            {/* ── Chart area ─────────────────────────────────────────────── */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>

                {/* Y-axis labels */}
                <View style={{ width: LABEL_W, height: h, position: 'relative' }}>
                    {/* 0% label at top */}
                    <Text style={[s.yLabel, { top: -6 }]}>0%</Text>
                    {/* Grid level labels */}
                    {gridLevels.map((lvl, i) => {
                        const yPos = (Math.abs(lvl) / range) * h - 6;
                        return (
                            <Text key={i} style={[s.yLabel, { top: yPos }]}>
                                {fmt2(lvl)}%
                            </Text>
                        );
                    })}
                </View>

                {/* Bars + grid */}
                <View style={[s.chartArea, { width: chartW, height: h }]}>

                    {/* Horizontal grid lines */}
                    {gridLevels.map((lvl, i) => {
                        const yPos = (Math.abs(lvl) / range) * h;
                        return (
                            <View key={i} style={[s.gridLine, { top: yPos }]} />
                        );
                    })}

                    {/* Baseline — 0% line */}
                    <View style={s.baseline} />

                    {/* Drawdown bars */}
                    {cols.map((v, i) => {
                        const depth    = Math.abs(v) / range;         // 0–1
                        const barH     = anim.interpolate({
                            inputRange:  [0, 1],
                            outputRange: [0, depth * h],
                        });
                        // Shade: brighter red for deeper drawdowns
                        const barColor = depth > 0.65
                            ? RED
                            : depth > 0.35
                                ? '#D94060'
                                : '#A83050';
                        const fillOpacity = anim.interpolate({
                            inputRange:  [0, 1],
                            outputRange: [0, 0.18 + depth * 0.25],
                        });

                        return (
                            <View
                                key={i}
                                style={[s.colWrap, {
                                    left:  i * colW,
                                    width: barW,
                                    height: h,
                                }]}
                            >
                                {/* Fill area */}
                                <Animated.View style={[s.barFill, {
                                    height: barH,
                                    backgroundColor: RED_D,
                                    opacity: fillOpacity,
                                }]} />
                                {/* Top line accent */}
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
                            <View style={[s.currentDot, {
                                backgroundColor: recovered ? GREEN : GOLD,
                            }]} />
                        </View>
                    )}
                </View>
            </View>

            {/* ── Stat chips ─────────────────────────────────────────────── */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip
                    label="Max Drawdown"
                    value={`${fmt2(minDD)}%`}
                    color={RED}
                />
                <Chip
                    label="Current"
                    value={`${fmt2(currentDD)}%`}
                    color={currentDD < -2 ? RED : currentDD < -0.5 ? GOLD : GREEN}
                />
                <Chip
                    label="Status"
                    value={recovered ? 'Recovered' : 'Underwater'}
                    color={recovered ? GREEN : GOLD}
                />
            </View>
        </View>
    );
};

const s = StyleSheet.create({
    yLabel:    { position: 'absolute', right: 4, color: MUTED,
                 fontSize: 8, fontFamily: mono, textAlign: 'right' },

    chartArea: { overflow: 'hidden', position: 'relative' },

    gridLine:  { position: 'absolute', left: 0, right: 0, height: 1,
                 backgroundColor: 'rgba(255,255,255,0.04)' },

    baseline:  { position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                 backgroundColor: 'rgba(0,229,255,0.20)' },

    colWrap:   { position: 'absolute', top: 0, overflow: 'hidden',
                 justifyContent: 'flex-start' },
    barFill:   { width: '100%' },
    barLine:   { position: 'absolute', top: 0, width: '100%' },

    currentLine: { position: 'absolute', left: 0, right: 0, height: 1,
                   borderWidth: 0, borderTopWidth: 1, borderStyle: 'dashed',
                   flexDirection: 'row', alignItems: 'center' },
    currentDot:  { width: 6, height: 6, borderRadius: 3, position: 'absolute', right: 0 },
});

export default DrawdownChart;

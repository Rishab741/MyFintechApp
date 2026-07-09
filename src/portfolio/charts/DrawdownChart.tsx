import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, {
    Circle, Defs, Line, LinearGradient, Path,
    Stop, Text as SvgText,
} from 'react-native-svg';
import { RED, GREEN, GOLD, MUTED, mono, sans } from '../tokens';
import { fmt2 } from '../helpers';

// ── Stat chip ─────────────────────────────────────────────────────────────────
const Chip: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
    <View style={[chip.wrap, { borderColor: `${color}30`, backgroundColor: `${color}08` }]}>
        <Text style={chip.label}>{label}</Text>
        <Text style={[chip.value, { color }]}>{value}</Text>
    </View>
);
const chip = StyleSheet.create({
    wrap:  {
        flex: 1, borderRadius: 14, borderWidth: 1,
        paddingVertical: 14, paddingHorizontal: 14, gap: 5,
    },
    label: { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 1.8, textTransform: 'uppercase' },
    value: { fontSize: 18, fontWeight: '800', fontFamily: sans },
});

// ── SVG area chart ────────────────────────────────────────────────────────────
const CHART_H  = 180;
const PAD      = { top: 20, right: 44, bottom: 20, left: 4 };
const Y_TICKS  = 3;

function DrawdownSvg({ values, w }: { values: number[]; w: number }) {
    const h   = CHART_H;
    const IW  = w - PAD.left - PAD.right;
    const IH  = h - PAD.top - PAD.bottom;

    // Compute drawdown series
    let peak = values[0];
    const dd = values.map(v => {
        peak = Math.max(peak, v);
        return peak > 0 ? ((v - peak) / peak) * 100 : 0;
    });

    const minDD     = Math.min(...dd);          // most negative (worst)
    const currentDD = dd[dd.length - 1];
    const range     = Math.abs(minDD) || 1;
    const recovered = currentDD >= -0.5;

    // Map drawdown % → pixel y (0% at top = PAD.top, minDD at bottom = PAD.top + IH)
    const py = (pct: number) => PAD.top + (Math.abs(pct) / range) * IH;
    const px = (i: number)   => PAD.left + (i / (dd.length - 1)) * IW;

    // Smooth bezier path
    const pts = dd.map((v, i) => ({ x: px(i), y: py(v) }));
    let line = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
        const cp1x = (pts[i - 1].x + pts[i].x) / 2;
        const cp2x = cp1x;
        line += ` C ${cp1x} ${pts[i - 1].y} ${cp2x} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
    }
    // Close area
    const area = `${line} L ${pts[pts.length - 1].x} ${PAD.top} L ${pts[0].x} ${PAD.top} Z`;

    // Y-axis ticks (evenly spaced from 0 to minDD)
    const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, i) => {
        const pct = (minDD * i) / Y_TICKS;
        return { pct, y: py(pct), label: i === 0 ? '0%' : `${fmt2(pct)}%` };
    });

    // Worst-DD point
    const worstIdx  = dd.indexOf(minDD);
    const worstPt   = pts[worstIdx];
    const currentPt = pts[pts.length - 1];

    return (
        <Svg width={w} height={h}>
            <Defs>
                <LinearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0"    stopColor={RED} stopOpacity="0.35" />
                    <Stop offset="0.7"  stopColor={RED} stopOpacity="0.08" />
                    <Stop offset="1"    stopColor={RED} stopOpacity="0" />
                </LinearGradient>
            </Defs>

            {/* Y-axis grid lines + labels */}
            {yTicks.map((t, i) => (
                <React.Fragment key={i}>
                    <Line
                        x1={PAD.left} y1={t.y}
                        x2={PAD.left + IW} y2={t.y}
                        stroke={i === 0 ? `${GOLD}40` : 'rgba(255,255,255,0.06)'}
                        strokeWidth={i === 0 ? 1.5 : 1}
                        strokeDasharray={i > 0 ? '3,5' : undefined}
                    />
                    <SvgText
                        x={PAD.left + IW + 6} y={t.y + 4}
                        fill={i === 0 ? GOLD : MUTED}
                        fontSize={8} fontFamily={mono}
                    >
                        {t.label}
                    </SvgText>
                </React.Fragment>
            ))}

            {/* Worst-drawdown reference dashed line */}
            <Line
                x1={PAD.left} y1={worstPt.y}
                x2={PAD.left + IW} y2={worstPt.y}
                stroke={`${RED}50`}
                strokeWidth={1}
                strokeDasharray="4,4"
            />

            {/* Area fill */}
            <Path d={area} fill="url(#ddGrad)" />

            {/* Main line */}
            <Path
                d={line} fill="none"
                stroke={RED} strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round"
            />

            {/* Worst drawdown dot */}
            <Circle cx={worstPt.x} cy={worstPt.y} r={6}   fill={RED} opacity={0.15} />
            <Circle cx={worstPt.x} cy={worstPt.y} r={3.5} fill={RED} />
            <SvgText
                x={Math.min(worstPt.x + 6, PAD.left + IW - 30)}
                y={worstPt.y - 6}
                fill={RED} fontSize={8} fontFamily={mono}
            >
                {fmt2(minDD)}%
            </SvgText>

            {/* Current position dot */}
            {!recovered && currentDD < -0.5 && (
                <>
                    <Circle cx={currentPt.x} cy={currentPt.y} r={5} fill={GOLD} opacity={0.2} />
                    <Circle cx={currentPt.x} cy={currentPt.y} r={3} fill={GOLD} />
                </>
            )}
            {recovered && (
                <>
                    <Circle cx={currentPt.x} cy={currentPt.y} r={5} fill={GREEN} opacity={0.2} />
                    <Circle cx={currentPt.x} cy={currentPt.y} r={3} fill={GREEN} />
                </>
            )}
        </Svg>
    );
}

// ── Main export ───────────────────────────────────────────────────────────────
const DrawdownChart: React.FC<{ values: number[]; w?: number; h?: number }> = ({ values }) => {
    const [chartW, setChartW] = useState(0);

    const onLayout = (e: LayoutChangeEvent) => setChartW(e.nativeEvent.layout.width);

    if (values.length < 2) return null;

    let peak = values[0];
    const dd = values.map(v => {
        peak = Math.max(peak, v);
        return peak > 0 ? ((v - peak) / peak) * 100 : 0;
    });
    const minDD     = Math.min(...dd);
    const currentDD = dd[dd.length - 1];
    const recovered = currentDD >= -0.5;

    return (
        <View style={s.root}>
            {/* SVG chart — fills full container width */}
            <View style={s.chartWrap} onLayout={onLayout}>
                {chartW > 0 && <DrawdownSvg values={values} w={chartW} />}
            </View>

            {/* Stat chips */}
            <View style={s.chips}>
                <Chip
                    label="Max Drawdown"
                    value={`${fmt2(minDD)}%`}
                    color={RED}
                />
                <Chip
                    label="Current DD"
                    value={`${fmt2(currentDD)}%`}
                    color={currentDD < -5 ? RED : currentDD < -0.5 ? GOLD : GREEN}
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
    root:      { gap: 16 },
    chartWrap: { width: '100%', minHeight: CHART_H },
    chips:     { flexDirection: 'row', gap: 8 },
});

export { DrawdownChart };
export default DrawdownChart;

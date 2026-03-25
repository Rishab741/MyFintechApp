import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { CHART_W, RED, RED_D, MUTED, GREEN, mono } from '../tokens';
import { fmt2 } from '../helpers';

/**
 * Drawdown chart — underwater curve showing % below peak.
 */
const DrawdownChart: React.FC<{ values: number[]; w?: number; h?: number }> = ({ values, w = CHART_W, h = 80 }) => {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: false }).start();
    }, [values.length]);

    if (values.length < 2) return null;

    // Compute drawdown series
    let peak = values[0];
    const dd = values.map(v => { peak = Math.max(peak, v); return ((v - peak) / peak) * 100; });
    const minDD  = Math.min(...dd);
    const maxDD  = 0;
    const range  = maxDD - minDD || 1;
    const pad    = 8;
    const iw     = w - pad * 2;
    const ih     = h - pad * 2;

    const pts = dd.map((v, i) => ({
        x: pad + (i / (dd.length - 1)) * iw,
        y: pad + ih - ((v - minDD) / range) * ih,
    }));

    // Render as filled area using thin horizontal slices
    const segments = pts.slice(0, -1).map((p1, i) => {
        const p2  = pts[i + 1];
        const dx  = p2.x - p1.x; const dy = p2.y - p1.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        const deg = Math.atan2(dy, dx) * (180 / Math.PI);
        return { p1, len, deg };
    });

    const maxDDVal = Math.min(...dd);

    return (
        <View>
            <View style={{ width: w, height: h }}>
                <View style={{ position: 'absolute', bottom: pad, left: pad, right: pad, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                {segments.map((seg, i) => (
                    <View key={i} style={{
                        position: 'absolute',
                        left: seg.p1.x, top: seg.p1.y - 1,
                        width: seg.len, height: 2,
                        backgroundColor: RED,
                        borderRadius: 1, opacity: 0.75,
                        transform: [{ rotate: `${seg.deg}deg` }],
                        transformOrigin: '0 50%',
                    } as any} />
                ))}
                {/* Fill down to baseline */}
                {segments.map((seg, i) => (
                    <View key={`fill-${i}`} style={{
                        position: 'absolute',
                        left: seg.p1.x, top: seg.p1.y,
                        width: seg.len, height: h - pad - seg.p1.y,
                        backgroundColor: RED_D,
                        opacity: 0.5,
                    }} />
                ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>
                    Max drawdown: <Text style={{ color: RED }}>{fmt2(maxDDVal)}%</Text>
                </Text>
                <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>
                    Current: <Text style={{ color: dd[dd.length-1] < -0.5 ? RED : GREEN }}>{fmt2(dd[dd.length-1])}%</Text>
                </Text>
            </View>
        </View>
    );
};

export default DrawdownChart;

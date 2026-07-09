import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import {
  BG, BORDER, CARD, GOLD, GOLD_D, GREEN, MUTED, mono, RED, TXT, TXT2, width,
} from '@/src/market/tokens';
import type { ChartPoint, MarketIndex, Period } from '../types';

interface Props {
  index: MarketIndex | undefined;
  chartData: ChartPoint[];
  loading: boolean;
  period: Period;
}

const PERIODS: Period[] = ['1D', '1W', '1M', '3M', '1Y'];
const CHART_H = 280;
const GRID_N  = 4;

function PeriodTab({ label, active, onPress }: { label: Period; active: boolean; onPress: () => void }) {
  return (
    <Text onPress={onPress} style={[styles.periodTab, active && styles.periodTabActive]}>
      {label}
    </Text>
  );
}

function SvgLineChart({
  data, color, w, h = CHART_H, gradId = 'mktGrad',
}: { data: ChartPoint[]; color: string; w: number; h?: number; gradId?: string }) {
  const computed = useMemo(() => {
    if (data.length < 2) return null;
    const PAD = { top: 16, right: 52, bottom: 8, left: 4 };
    const IW = w - PAD.left - PAD.right;
    const IH = h - PAD.top - PAD.bottom;
    const vals = data.map(d => d.value);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    const px = (i: number) => PAD.left + (i / (data.length - 1)) * IW;
    const py = (v: number) => PAD.top + IH - ((v - minV) / range) * IH;
    const pts = data.map((d, i) => ({ x: px(i), y: py(d.value) }));
    const last = pts[pts.length - 1];

    let line = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cp1x = (pts[i - 1].x + pts[i].x) / 2;
      const cp2x = cp1x;
      line += ` C ${cp1x} ${pts[i - 1].y} ${cp2x} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
    }
    const fill = `${line} L ${pts[pts.length - 1].x} ${PAD.top + IH} L ${pts[0].x} ${PAD.top + IH} Z`;

    const gridLabels = Array.from({ length: GRID_N + 1 }, (_, i) => {
      const frac = i / GRID_N;
      const val  = minV + range * frac;
      const y    = PAD.top + IH - frac * IH;
      const label = val >= 10000
        ? val.toLocaleString('en-US', { maximumFractionDigits: 0 })
        : val >= 1000 ? val.toFixed(0) : val.toFixed(2);
      return { y, label, lineX1: PAD.left, lineX2: PAD.left + IW, labelX: PAD.left + IW + 6 };
    });

    return { line, fill, last, gridLabels, PAD, IH };
  }, [data, w, h]);

  if (!computed) return null;
  const { line, fill, last, gridLabels } = computed;

  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor={color} stopOpacity="0.38" />
          <Stop offset="0.65" stopColor={color} stopOpacity="0.06" />
          <Stop offset="1"   stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* Horizontal grid lines + Y labels */}
      {gridLabels.map((g, i) => (
        <React.Fragment key={i}>
          <Line
            x1={g.lineX1} y1={g.y} x2={g.lineX2} y2={g.y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
            strokeDasharray={i > 0 ? '3,5' : undefined}
          />
          <SvgText
            x={g.labelX} y={g.y + 3}
            fill={MUTED} fontSize={8} fontFamily={mono}
          >
            {g.label}
          </SvgText>
        </React.Fragment>
      ))}

      {/* Area fill */}
      <Path d={fill} fill={`url(#${gradId})`} />

      {/* Line */}
      <Path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Glowing endpoint */}
      <Circle cx={last.x} cy={last.y} r={8}  fill={color} opacity={0.15} />
      <Circle cx={last.x} cy={last.y} r={4}  fill={color} opacity={0.4}  />
      <Circle cx={last.x} cy={last.y} r={2.5} fill={color} />
    </Svg>
  );
}

export function MarketChart({
  index, chartData, loading, period, onPeriodChange,
}: Props & { onPeriodChange: (p: Period) => void }) {
  const q = index?.quote;
  const up = (q?.changePct ?? 0) >= 0;
  const lineColor = up ? GREEN : RED;

  const lastPoint = chartData[chartData.length - 1];
  const lastTs = lastPoint
    ? new Date(lastPoint.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const changeAbsStr = q ? `${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)}` : '';
  const changePctStr = q ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%` : '';

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.indexName}>{index?.label ?? '—'}</Text>
          {q && (
            <Text style={styles.price}>
              {q.price >= 10000
                ? q.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : q.price.toFixed(2)}
            </Text>
          )}
        </View>
        {q && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.change, { color: lineColor }]}>{changeAbsStr}</Text>
            <Text style={[styles.changePct, { color: lineColor }]}>{changePctStr}</Text>
            <View style={[styles.periodPill, { backgroundColor: `${lineColor}18`, borderColor: `${lineColor}30` }]}>
              <Text style={[styles.periodPillTxt, { color: lineColor }]}>{period}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Day range */}
      {q && q.dayHigh > 0 && (
        <View style={styles.rangeRow}>
          <Text style={styles.rangeLabel}>L {q.dayLow.toFixed(2)}</Text>
          <View style={styles.rangeBar}>
            <View style={[styles.rangeFill, {
              width: `${Math.max(5, Math.min(95, ((q.price - q.dayLow) / (q.dayHigh - q.dayLow || 1)) * 100))}%`,
              backgroundColor: lineColor,
            }]} />
          </View>
          <Text style={styles.rangeLabel}>H {q.dayHigh.toFixed(2)}</Text>
        </View>
      )}

      {/* Chart */}
      <View style={styles.chartArea}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={GOLD} size="small" />
            <Text style={styles.loadingTxt}>Loading chart…</Text>
          </View>
        ) : chartData.length > 1 ? (
          <SvgLineChart data={chartData} color={lineColor} w={width - 32} h={CHART_H} gradId="mktChartGrad" />
        ) : (
          <View style={styles.loadingBox}>
            <Text style={styles.loadingTxt}>No data available</Text>
          </View>
        )}
      </View>

      {/* Footer */}
      {chartData.length > 1 && (
        <View style={styles.chartFooter}>
          <Text style={{ color: MUTED, fontFamily: mono, fontSize: 10 }}>{lastTs}</Text>
          <Text style={{ color: TXT2, fontFamily: mono, fontSize: 11 }}>
            {lastPoint ? lastPoint.value.toFixed(2) : ''}
          </Text>
        </View>
      )}

      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map(p => (
          <PeriodTab key={p} label={p} active={period === p} onPress={() => onPeriodChange(p)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: GOLD,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 12,
  },
  indexName: {
    fontFamily: mono,
    fontSize: 9,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 6,
  },
  price: {
    fontFamily: mono,
    fontSize: 34,
    color: TXT,
    fontWeight: '800',
    letterSpacing: -1,
  },
  change:        { fontFamily: mono, fontSize: 16, fontWeight: '700' },
  changePct:     { fontFamily: mono, fontSize: 13, marginTop: 2 },
  periodPill:    { marginTop: 8, alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  periodPillTxt: { fontFamily: mono, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
    gap: 10,
  },
  rangeLabel: { fontFamily: mono, fontSize: 9, color: MUTED, minWidth: 56 },
  rangeBar:   { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' },
  rangeFill:  { height: '100%', borderRadius: 2, opacity: 0.75 },
  chartArea:  { paddingHorizontal: 0 },
  loadingBox: { height: CHART_H, justifyContent: 'center', alignItems: 'center', gap: 8 },
  loadingTxt: { fontFamily: mono, fontSize: 11, color: MUTED },
  chartFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  periodTab: {
    fontFamily: mono,
    fontSize: 12,
    color: MUTED,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  periodTabActive: {
    color: GOLD,
    backgroundColor: GOLD_D,
    shadowColor: GOLD,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});

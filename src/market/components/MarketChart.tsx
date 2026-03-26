import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-wagmi-charts';
import {
  BG, BORDER, CARD, GOLD, GOLD_D, GREEN, MUTED, mono, RED, sans, TXT, TXT2,
} from '@/src/portfolio/tokens';
import { width } from '@/src/portfolio/tokens';
import type { ChartPoint, MarketIndex, Period } from '../types';

interface Props {
  index: MarketIndex | undefined;
  chartData: ChartPoint[];
  loading: boolean;
  period: Period;
}

const PERIODS: Period[] = ['1D', '1W', '1M', '3M', '1Y'];
const CHART_H = 200;

function PeriodTab({
  label,
  active,
  onPress,
}: {
  label: Period;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Text
      onPress={onPress}
      style={[styles.periodTab, active && styles.periodTabActive]}
    >
      {label}
    </Text>
  );
}

export function MarketChart({
  index,
  chartData,
  loading,
  period,
  onPeriodChange,
}: Props & { onPeriodChange: (p: Period) => void }) {
  const q = index?.quote;
  const up = (q?.changePct ?? 0) >= 0;
  const lineColor = up ? GREEN : RED;

  // Wagmi-charts needs { timestamp, value }
  const wagmiData = useMemo(
    () => chartData.map(p => ({ timestamp: p.timestamp, value: p.value })),
    [chartData],
  );

  const changeAbsStr = q
    ? `${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)}`
    : '';
  const changePctStr = q
    ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%`
    : '';

  return (
    <View style={styles.wrapper}>
      {/* Header row */}
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
            <Text style={styles.periodLabel}>{period}</Text>
          </View>
        )}
      </View>

      {/* Day range bar */}
      {q && q.dayHigh > 0 && (
        <View style={styles.rangeRow}>
          <Text style={styles.rangeLabel}>L {q.dayLow.toFixed(2)}</Text>
          <View style={styles.rangeBar}>
            <View
              style={[
                styles.rangeFill,
                {
                  width: `${Math.max(5, Math.min(95, ((q.price - q.dayLow) / (q.dayHigh - q.dayLow || 1)) * 100))}%`,
                  backgroundColor: lineColor,
                },
              ]}
            />
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
        ) : wagmiData.length > 1 ? (
          <LineChart.Provider data={wagmiData}>
            <LineChart height={CHART_H} width={width - 48}>
              <LineChart.Path color={lineColor} width={2} />
              <LineChart.Gradient color={lineColor} />
              <LineChart.CursorCrosshair color={lineColor}>
                <LineChart.Tooltip
                  style={{
                    backgroundColor: CARD,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: BORDER,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                  textStyle={{ color: TXT, fontFamily: mono, fontSize: 12 }}
                />
              </LineChart.CursorCrosshair>
            </LineChart>
            <View style={styles.chartFooter}>
              <LineChart.DatetimeText
                style={{ color: MUTED, fontFamily: mono, fontSize: 10 }}
              />
              <LineChart.PriceText
                style={{ color: TXT2, fontFamily: mono, fontSize: 11 }}
              />
            </View>
          </LineChart.Provider>
        ) : (
          <View style={styles.loadingBox}>
            <Text style={styles.loadingTxt}>No data available</Text>
          </View>
        )}
      </View>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map(p => (
          <PeriodTab
            key={p}
            label={p}
            active={period === p}
            onPress={() => onPeriodChange(p)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 8,
  },
  indexName: {
    fontFamily: sans,
    fontSize: 11,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  price: {
    fontFamily: mono,
    fontSize: 26,
    color: TXT,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  change: {
    fontFamily: mono,
    fontSize: 14,
    fontWeight: '700',
  },
  changePct: {
    fontFamily: mono,
    fontSize: 12,
  },
  periodLabel: {
    fontFamily: mono,
    fontSize: 9,
    color: MUTED,
    marginTop: 2,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  rangeLabel: {
    fontFamily: mono,
    fontSize: 9,
    color: MUTED,
    minWidth: 52,
  },
  rangeBar: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  rangeFill: {
    height: '100%',
    borderRadius: 2,
    opacity: 0.7,
  },
  chartArea: {
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  loadingBox: {
    height: CHART_H,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  loadingTxt: {
    fontFamily: mono,
    fontSize: 11,
    color: MUTED,
  },
  chartFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: BORDER,
  },
  periodTab: {
    fontFamily: mono,
    fontSize: 12,
    color: MUTED,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  periodTabActive: {
    color: GOLD,
    backgroundColor: GOLD_D,
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BORDER, CARD, GOLD, MUTED, mono, sans, TXT } from '@/src/portfolio/tokens';
import type { Sector } from '../types';

// Color-codes a % change: deep red → neutral → deep green
function heatColor(pct: number): string {
  const clamped = Math.max(-3, Math.min(3, pct));
  if (clamped >= 0) {
    const t = clamped / 3;
    const r = Math.round(20  + (52  - 20)  * t);
    const g = Math.round(100 + (211 - 100) * t);
    const b = Math.round(60  + (153 - 60)  * t);
    return `rgba(${r},${g},${b},${0.15 + t * 0.25})`;
  } else {
    const t = -clamped / 3;
    const r = Math.round(100 + (248 - 100) * t);
    const g = Math.round(40  + (113 - 40)  * t);
    const b = Math.round(40  + (113 - 40)  * t);
    return `rgba(${r},${g},${b},${0.15 + t * 0.25})`;
  }
}

function textColor(pct: number): string {
  if (pct > 0.3)  return '#34D399';
  if (pct < -0.3) return '#F87171';
  return '#B8B2A8';
}

function SectorCell({ sector }: { sector: Sector }) {
  const bg    = heatColor(sector.changePct);
  const color = textColor(sector.changePct);
  const up    = sector.changePct >= 0;

  return (
    <View style={[styles.cell, { backgroundColor: bg }]}>
      <Text style={styles.cellName} numberOfLines={1}>{sector.name}</Text>
      <Text style={[styles.cellPct, { color }]}>
        {up ? '+' : ''}{sector.changePct.toFixed(2)}%
      </Text>
    </View>
  );
}

export function SectorGrid({ sectors }: { sectors: Sector[] }) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.sectionHeader}>
        <View style={styles.goldBar} />
        <Text style={styles.sectionTitle}>Sector Performance</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#34D399' }]} />
            <Text style={styles.legendTxt}>Bullish</Text>
          </View>
          <Text style={styles.legendSub}>Today's performance by GICS sector</Text>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#F87171' }]} />
            <Text style={styles.legendTxt}>Bearish</Text>
          </View>
        </View>

        <View style={styles.grid}>
          {sectors.map(s => (
            <SectorCell key={s.etf} sector={s} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  goldBar: {
    width: 3,
    height: 18,
    backgroundColor: GOLD,
    borderRadius: 2,
  },
  sectionTitle: {
    fontFamily: 'Georgia',
    fontSize: 16,
    color: '#EEE8DC',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendTxt: { fontFamily: mono, fontSize: 10, color: MUTED },
  legendSub: { fontFamily: sans, fontSize: 9, color: MUTED, flex: 1, textAlign: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cell: {
    width: '30%',
    flexGrow: 1,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cellName: {
    fontFamily: sans,
    fontSize: 9,
    color: TXT,
    textAlign: 'center',
    marginBottom: 4,
  },
  cellPct: {
    fontFamily: mono,
    fontSize: 11,
    fontWeight: '700',
  },
});

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import {
  BORDER, CARD, CARD2, GOLD, GREEN, GREEN_D, MUTED, mono, RED, RED_D, sans, TXT, TXT2,
} from '@/src/portfolio/tokens';
import type { Mover } from '../types';

function MoverRow({ item, index, up }: { item: Mover; index: number; up: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;
  const color = up ? GREEN : RED;
  const bg    = up ? GREEN_D : RED_D;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      delay: index * 60,
      useNativeDriver: true,
    }).start();
  }, []);

  const fmtVol = (v: number) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return `${v}`;
  };

  return (
    <Animated.View
      style={[
        styles.row,
        {
          opacity: anim,
          transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        },
      ]}
    >
      {/* Ticker + name */}
      <View style={{ flex: 1 }}>
        <Text style={styles.ticker}>{item.symbol}</Text>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
      </View>

      {/* Vol */}
      <View style={{ alignItems: 'flex-end', marginRight: 12 }}>
        <Text style={styles.volLabel}>VOL</Text>
        <Text style={styles.vol}>{fmtVol(item.volume)}</Text>
      </View>

      {/* Price + change */}
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.price}>{item.price.toFixed(2)}</Text>
        <View style={[styles.badge, { backgroundColor: bg }]}>
          <Text style={[styles.pct, { color }]}>
            {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function MoversCard({
  title,
  items,
  up,
}: {
  title: string;
  items: Mover[];
  up: boolean;
}) {
  const accentColor = up ? GREEN : RED;
  return (
    <View style={[styles.card, { borderTopColor: accentColor }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.dot, { backgroundColor: accentColor }]} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {items.length === 0 ? (
        <Text style={styles.empty}>No data</Text>
      ) : (
        items.map((item, i) => (
          <MoverRow key={item.symbol} item={item} index={i} up={up} />
        ))
      )}
    </View>
  );
}

export function MoversSection({
  gainers,
  losers,
}: {
  gainers: Mover[];
  losers: Mover[];
}) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.sectionHeader}>
        <View style={styles.goldBar} />
        <Text style={styles.sectionTitle}>Market Movers</Text>
      </View>
      <MoversCard title="TOP GAINERS" items={gainers} up={true} />
      <MoversCard title="TOP LOSERS"  items={losers}  up={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 20 },
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
    borderTopWidth: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  cardTitle: {
    fontFamily: mono,
    fontSize: 10,
    color: TXT2,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  ticker: {
    fontFamily: mono,
    fontSize: 13,
    color: TXT,
    fontWeight: '700',
  },
  name: {
    fontFamily: sans,
    fontSize: 10,
    color: MUTED,
    marginTop: 1,
  },
  volLabel: {
    fontFamily: mono,
    fontSize: 8,
    color: MUTED,
    letterSpacing: 1,
  },
  vol: {
    fontFamily: mono,
    fontSize: 11,
    color: TXT2,
  },
  price: {
    fontFamily: mono,
    fontSize: 13,
    color: TXT,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  pct: {
    fontFamily: mono,
    fontSize: 10,
    fontWeight: '700',
  },
  empty: {
    fontFamily: mono,
    fontSize: 11,
    color: MUTED,
    padding: 16,
    textAlign: 'center',
  },
});

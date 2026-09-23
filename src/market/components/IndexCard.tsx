import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BORDER, BORDER_HI, CARD, CARD2, GOLD, GOLD_B, GREEN, GREEN_D,
  MUTED, mono, RED, RED_D, sans, TXT, TXT2,
} from '@/src/market/tokens';
import type { MarketIndex } from '../types';

interface Props {
  item: MarketIndex;
  active: boolean;
  onPress: () => void;
  isLive?: boolean;
}

// Tiny inline sparkline using segments
function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return null;
  const W = 60, H = 24;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const color = up ? GREEN : RED;

  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((v - min) / range) * H,
  }));

  return (
    <View style={{ width: W, height: H, overflow: 'hidden' }}>
      {pts.slice(1).map((pt, i) => {
        const prev = pts[i];
        const dx = pt.x - prev.x;
        const dy = pt.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: prev.x,
              top: prev.y - 0.75,
              width: len,
              height: 1.5,
              backgroundColor: color,
              opacity: 0.85,
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: '0 50%',
            } as any}
          />
        );
      })}
    </View>
  );
}

export function IndexCard({ item, active, onPress, isLive }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const [flashColor, setFlashColor] = useState<string>(GREEN);
  const prevPrice = useRef(item.quote?.price);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: active ? 1.03 : 1, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.timing(glowAnim,  { toValue: active ? 1 : 0, duration: 200, useNativeDriver: false }),
    ]).start();
  }, [active]);

  // Flash the card on a live price tick — same acknowledgment the web
  // markets page gives (animate-flash-green/red), so users can see a
  // Binance-fed price actually changed instead of it silently swapping.
  useEffect(() => {
    const price = item.quote?.price;
    if (price === undefined || prevPrice.current === undefined || price === prevPrice.current) {
      prevPrice.current = price;
      return;
    }
    setFlashColor(price > prevPrice.current ? GREEN : RED);
    prevPrice.current = price;
    flashAnim.setValue(1);
    Animated.timing(flashAnim, { toValue: 0, duration: 600, useNativeDriver: false }).start();
  }, [item.quote?.price]); // eslint-disable-line react-hooks/exhaustive-deps -- flashAnim is a stable ref (useRef), never changes identity

  const q = item.quote;
  const up = (q?.changePct ?? 0) >= 0;
  const color = up ? GREEN : RED;
  const bgColor = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [CARD, CARD2] });
  const borderColor = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [BORDER, GOLD_B] });
  const borderTopColor = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [BORDER_HI, GOLD_B] });
  const flashOpacity = flashAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.25] });

  const sparkValues = item.chartData.length > 1
    ? item.chartData.map(p => p.value)
    : [];

  return (
    <Pressable onPress={onPress} style={{ marginRight: 10 }}>
      <Animated.View style={[styles.card, { backgroundColor: bgColor, borderColor, borderTopColor }]}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: flashColor, opacity: flashOpacity, borderRadius: 6 }]}
        />
        {/* Region pill */}
        <View style={styles.regionRow}>
          <Text style={[styles.region, active && { color: GOLD }]}>{item.region}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {isLive && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveTxt}>LIVE</Text>
              </View>
            )}
            {active && <View style={styles.activeDot} />}
          </View>
        </View>

        {/* Label */}
        <Text style={styles.label} numberOfLines={1}>{item.shortLabel}</Text>
        <Text style={styles.fullName} numberOfLines={1}>{item.label}</Text>

        {/* Price */}
        {q ? (
          <>
            <Text style={styles.price}>
              {q.price >= 1000
                ? q.price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                : q.price.toFixed(2)}
            </Text>
            <View style={[styles.changeBadge, { backgroundColor: up ? GREEN_D : RED_D }]}>
              <Text style={[styles.changeTxt, { color }]}>
                {up ? '+' : ''}{q.changePct.toFixed(2)}%
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.skeleton} />
        )}

        {/* Sparkline */}
        {sparkValues.length > 1 && (
          <View style={{ marginTop: 8 }}>
            <Sparkline data={sparkValues} up={up} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 122,
    borderRadius: 6,
    borderWidth: 1,
    borderTopWidth: 1,
    padding: 12,
    shadowColor: GOLD,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  region: {
    fontFamily: mono,
    fontSize: 9,
    color: MUTED,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: GREEN,
  },
  liveTxt: {
    fontFamily: mono,
    fontSize: 7,
    fontWeight: '700',
    color: GREEN,
    letterSpacing: 0.5,
  },
  label: {
    fontFamily: mono,
    fontSize: 15,
    color: TXT,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  fullName: {
    fontFamily: sans,
    fontSize: 9,
    color: TXT2,
    marginTop: 1,
    marginBottom: 6,
  },
  price: {
    fontFamily: mono,
    fontSize: 13,
    color: TXT,
    fontWeight: '600',
    marginBottom: 4,
  },
  changeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  changeTxt: {
    fontFamily: mono,
    fontSize: 10,
    fontWeight: '700',
  },
  skeleton: {
    height: 12,
    width: 60,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginTop: 4,
  },
});

import React, { useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
  ViewStyle,
} from 'react-native';
import { QL } from '@/constants/Colors';

// LayoutAnimation requires this flag on Android
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export interface ExpandableCardProps {
  title: string;
  subtitle?: string;
  /** Left-side icon element (e.g. an emoji Text or MaterialCommunityIcons) */
  icon?: React.ReactNode;
  /** Content revealed when the card expands */
  children: React.ReactNode;
  defaultExpanded?: boolean;
  /** Tints the left border — used for severity stripes on signal cards */
  accentColor?: string;
  style?: ViewStyle;
  /** Override the header's right-side content (e.g. a value + unit stack) */
  headerRight?: React.ReactNode;
}

export function ExpandableCard({
  title,
  subtitle,
  icon,
  children,
  defaultExpanded = false,
  accentColor,
  style,
  headerRight,
}: ExpandableCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const chevronAnim = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.975, useNativeDriver: true, speed: 40 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40 }).start();
  };

  const toggle = () => {
    LayoutAnimation.configureNext({
      duration: 260,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    const next = !expanded;
    setExpanded(next);
    Animated.timing(chevronAnim, {
      toValue: next ? 1 : 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  };

  const chevronDeg = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <Pressable
        onPress={toggle}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.card,
          accentColor && { borderLeftColor: accentColor, borderLeftWidth: 3 },
        ]}
        android_ripple={{ color: 'rgba(255,255,255,0.04)', borderless: false }}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          {icon !== undefined && (
            <View style={styles.iconWrap}>{icon}</View>
          )}
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
            {subtitle !== undefined && (
              <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
            )}
          </View>
          {headerRight !== undefined ? (
            <View style={styles.headerRight}>{headerRight}</View>
          ) : null}
          <Animated.Text style={[styles.chevron, { transform: [{ rotate: chevronDeg }] }]}>
            ▾
          </Animated.Text>
        </View>

        {/* ── Body — rendered by LayoutAnimation, not absolute height ── */}
        {expanded && (
          <View style={styles.body}>
            <View style={styles.divider} />
            {children}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ── Metric row helper — place inside ExpandableCard body ─────────────────────
export function MetricRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.metricRow}>{children}</View>;
}

export function Metric({
  value,
  label,
  color = QL.TXT,
}: {
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricVal, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.metricLbl}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: QL.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: QL.BORDER,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 11,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: QL.GOLD_D,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: QL.GOLD_B,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: QL.TXT,
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 11,
    color: QL.TXT2,
    marginTop: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  chevron: {
    fontSize: 16,
    color: QL.MUTED,
    flexShrink: 0,
    lineHeight: 20,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 13,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: QL.BORDER,
    marginBottom: 12,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metric: {
    flex: 1,
    backgroundColor: QL.CARD2,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  metricVal: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  metricLbl: {
    fontSize: 9,
    color: QL.MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});

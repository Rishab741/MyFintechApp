import { mono, QL, RADIUS, sans, serif, SP } from '@/constants/Colors';
import { useInsights } from '@/src/insights/hooks/useInsights';
import { fmtCurrency, sign } from '@/src/portfolio/helpers';
import { usePortfolioData } from '@/src/portfolio/hooks/usePortfolioData';
import type { Period } from '@/src/portfolio/types';
import { InsightSeverity } from '@/src/services/mlPipeline';
import { useAuthStore } from '@/src/store/useAuthStore';
import { NavMenuButton } from '@/components/NavMenuButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Defs, Line, LinearGradient, Path, Stop, Svg } from 'react-native-svg';

// ─── Tokens ─────────────────────────────────────────────────────────────────
const BG     = QL.BG;
const CARD   = QL.CARD;
const BORDER = QL.BORDER;
const GOLD   = QL.GOLD;
const GOLD_L = QL.GOLD_L;
const INDIGO = QL.BLUE;
const GREEN  = QL.GREEN;
const CORAL  = QL.RED;
const AMBER  = QL.AMBER;
const TXT    = QL.TXT;
const TXT2   = QL.TXT2;
const MUTED  = QL.MUTED;

const SCREEN_W = Dimensions.get('window').width;
const CHART_W  = SCREEN_W - SP.LG * 2;
const CHART_H  = 190;

const RANGES: Period[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

// ─── Chart ──────────────────────────────────────────────────────────────────
function PerformanceChart({ values }: { values: number[] }) {
  const { linePath, areaPath, guideYs } = useMemo(() => {
    if (values.length < 2) return { linePath: '', areaPath: '', guideYs: [] as number[] };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = 10;
    const pts = values.map((v, i) => ({
      x: (i / (values.length - 1)) * CHART_W,
      y: CHART_H - ((v - min) / range) * (CHART_H - pad * 2) - pad,
    }));
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L${CHART_W.toFixed(1)},${CHART_H} L0,${CHART_H} Z`;
    return { linePath: line, areaPath: area, guideYs: [CHART_H * 0.25, CHART_H * 0.5, CHART_H * 0.75] };
  }, [values]);

  if (!linePath) {
    return <View style={{ height: CHART_H, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={GOLD} />
    </View>;
  }

  return (
    <Svg width={CHART_W} height={CHART_H}>
      <Defs>
        <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={GOLD} stopOpacity={0.22} />
          <Stop offset="100%" stopColor={GOLD} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {guideYs.map((y) => (
        <Line key={y} x1={0} x2={CHART_W} y1={y} y2={y} stroke={BORDER} strokeWidth={1} />
      ))}
      <Path d={areaPath} fill="url(#chartGrad)" />
      <Path d={linePath} stroke={GOLD} strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function RangeTabs({ value, onChange }: { value: Period; onChange: (r: Period) => void }) {
  return (
    <View style={styles.rangeRow}>
      {RANGES.map((r) => (
        <Pressable key={r} onPress={() => onChange(r)} style={styles.rangeTab} hitSlop={6}>
          <Text style={[styles.rangeTxt, value === r && styles.rangeTxtActive]}>{r}</Text>
          {value === r && <View style={styles.rangeUnderline} />}
        </Pressable>
      ))}
    </View>
  );
}

// ─── Severity ───────────────────────────────────────────────────────────────
const SEVERITY_COLOR: Record<InsightSeverity, string> = {
  critical: CORAL,
  warning:  AMBER,
  positive: GREEN,
  neutral:  MUTED,
};
const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  critical: 'Critical',
  warning:  'Warning',
  positive: 'Positive',
  neutral:  'Neutral',
};

// ─── Sub-components ─────────────────────────────────────────────────────────

// Hairline stat — replaces the old boxed StatChip. Numbers separated by
// dividers instead of cards; reads closer to a ticker strip than a dashboard.
function StatRail({ items }: { items: { label: string; value: string; color?: string }[] }) {
  return (
    <View style={styles.statRail}>
      {items.map((it, i) => (
        <React.Fragment key={it.label}>
          {i > 0 && <View style={styles.statDivider} />}
          <View style={styles.statItem}>
            <Text style={[styles.statValue, it.color ? { color: it.color } : null]} numberOfLines={1}>{it.value}</Text>
            <Text style={styles.statLabel}>{it.label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function SignalPill({ severity, title, body, onPress }: { severity: InsightSeverity; title: string; body: string; onPress: () => void }) {
  const color = SEVERITY_COLOR[severity];
  return (
    <Pressable onPress={onPress} style={[styles.signalPill, { borderLeftColor: color }]}>
      <Text style={[styles.signalBadge, { color }]}>{SEVERITY_LABEL[severity]}</Text>
      <Text style={styles.signalTitle} numberOfLines={2}>{title}</Text>
      <Text style={styles.signalBody} numberOfLines={2}>{body}</Text>
    </Pressable>
  );
}

function MoverCard({ ticker, pct }: { ticker: string; pct: number }) {
  const up = pct >= 0;
  return (
    <View style={styles.moverCard}>
      <Text style={styles.moverTicker}>{ticker}</Text>
      <View style={[styles.moverPill, { backgroundColor: up ? `${GREEN}18` : `${CORAL}18` }]}>
        <MaterialCommunityIcons name={up ? 'trending-up' : 'trending-down'} size={11} color={up ? GREEN : CORAL} />
        <Text style={[styles.moverPct, { color: up ? GREEN : CORAL }]}>{sign(pct)}{Math.abs(pct).toFixed(1)}%</Text>
      </View>
    </View>
  );
}

function ActionButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}>
      <View style={styles.actionCircle}>
        <MaterialCommunityIcons name={icon as any} size={19} color={GOLD} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();

  const firstName = (() => {
    const meta = session?.user?.user_metadata;
    const full = meta?.full_name ?? meta?.name ?? session?.user?.email?.split('@')[0] ?? 'Investor';
    return full.split(' ')[0];
  })();

  const {
    totalVal, todayChange, todayChangePct, cash, positions,
    performers, currency, loading: portfolioLoading, onRefresh,
    refreshing, snapValues, period, setPeriod,
  } = usePortfolioData();

  const { data: insightsData, loading: insightsLoading } = useInsights();

  const isLoading = portfolioLoading && !totalVal;

  const topSignals = useMemo(() => {
    if (!insightsData?.signals) return [];
    const order: InsightSeverity[] = ['critical', 'warning', 'positive', 'neutral'];
    return [...insightsData.signals]
      .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
      .slice(0, 4);
  }, [insightsData?.signals]);

  const topMovers = performers.top?.slice(0, 6) ?? [];
  const bestPerformer = performers.top?.[0];
  const positionCount = positions.length;
  const todayUp = todayChange >= 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* ── Top bar — kept deliberately quiet so the chart below is the first real focal point ── */}
      <View style={styles.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <NavMenuButton />
          <Text style={styles.topBarGreeting}>{greeting}, {firstName}</Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/index')} hitSlop={12}>
          <MaterialCommunityIcons name="bell-outline" size={19} color={TXT2} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} colors={[GOLD]} />}
      >
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={GOLD} size="large" />
          </View>
        ) : (
          <>
            {/* ── Hero: value + chart, full width, no card border ── */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Portfolio Value</Text>
              <View style={styles.heroValueRow}>
                <Text style={styles.heroValue}>{totalVal > 0 ? fmtCurrency(totalVal, currency) : '—'}</Text>
              </View>
              {totalVal > 0 && (
                <Text style={styles.heroChange}>
                  <Text style={{ color: todayUp ? GREEN : CORAL }}>
                    {sign(todayChange)}{fmtCurrency(Math.abs(todayChange), currency)}  {sign(todayChangePct)}{todayChangePct.toFixed(2)}%
                  </Text>
                  <Text style={{ color: MUTED }}>  today</Text>
                </Text>
              )}
            </View>

            <View style={styles.chartWrap}>
              <PerformanceChart values={snapValues} />
            </View>
            <RangeTabs value={period} onChange={setPeriod} />

            <StatRail
              items={[
                { label: "Day's gain", value: todayChange !== 0 ? `${sign(todayChange)}${fmtCurrency(Math.abs(todayChange), currency)}` : '—', color: todayUp ? GREEN : CORAL },
                { label: 'Positions', value: positionCount > 0 ? `${positionCount}` : '—' },
                { label: 'Best today', value: bestPerformer ? `${bestPerformer.ticker} +${bestPerformer.pct.toFixed(1)}%` : '—', color: GREEN },
                { label: 'Cash', value: cash > 0 ? fmtCurrency(cash, currency) : '—' },
              ]}
            />

            {/* ── Top movers — the thing a portfolio app should show and wasn't ── */}
            {topMovers.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Top movers</Text>
                  <Pressable onPress={() => router.push('/(tabs)/Portfolio')}>
                    <Text style={styles.sectionLink}>See all →</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moverRow}>
                  {topMovers.map((p) => <MoverCard key={p.ticker} ticker={p.ticker} pct={p.pct} />)}
                </ScrollView>
              </View>
            )}

            {/* ── Signals — swipeable rail instead of a stacked list ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Signals</Text>
                {insightsLoading ? (
                  <ActivityIndicator color={INDIGO} size="small" />
                ) : topSignals.length > 0 ? (
                  <Pressable onPress={() => router.push('/(tabs)/Insights')}>
                    <Text style={styles.sectionLink}>{topSignals.length} active →</Text>
                  </Pressable>
                ) : null}
              </View>

              {topSignals.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.signalRow}>
                  {topSignals.map((s) => (
                    <SignalPill key={s.id} severity={s.severity} title={s.title} body={s.body} onPress={() => router.push('/(tabs)/Insights')} />
                  ))}
                </ScrollView>
              ) : !insightsLoading ? (
                <View style={styles.emptySignals}>
                  <MaterialCommunityIcons name="brain" size={24} color={MUTED} />
                  <Text style={styles.emptyTxt}>
                    {totalVal > 0 ? 'Connect more data to generate signals' : 'Connect a brokerage to get signals'}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* ── Quick actions — slim icon row, not bordered rectangles ── */}
            <View style={[styles.section, { marginBottom: 8 }]}>
              <Text style={styles.sectionTitle}>Quick actions</Text>
              <View style={styles.actionRow}>
                <ActionButton icon="chart-line" label="Markets" onPress={() => router.push('/(tabs)/Market')} />
                <ActionButton icon="safe-square-outline" label="Vault" onPress={() => router.push('/(tabs)/Portfolio')} />
                <ActionButton icon="chart-multiple" label="Compare" onPress={() => router.push('/(tabs)/Compare')} />
                <ActionButton icon="download-circle-outline" label="Reports" onPress={() => router.push('/(tabs)/Reports')} />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SP.LG,
    paddingTop: SP.SM,
    paddingBottom: SP.SM,
  },
  topBarGreeting: { fontSize: 12.5, color: TXT2, fontFamily: sans },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },

  // Hero — no border, no card. The number and chart carry the page.
  hero: { paddingHorizontal: SP.LG, marginTop: SP.SM, marginBottom: SP.MD },
  heroLabel: { fontSize: 10.5, color: MUTED, fontFamily: mono, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6 },
  heroValueRow: { flexDirection: 'row', alignItems: 'flex-end' },
  heroValue: { fontSize: 42, color: TXT, fontFamily: serif, fontWeight: '500', letterSpacing: -0.8 },
  heroChange: { fontSize: 13, fontFamily: mono, marginTop: 6 },

  chartWrap: { paddingHorizontal: SP.LG, marginBottom: SP.SM },

  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SP.LG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    marginBottom: SP.XL,
  },
  rangeTab: { alignItems: 'center', paddingVertical: SP.SM, flex: 1 },
  rangeTxt: { fontSize: 11, fontFamily: mono, color: MUTED, letterSpacing: 0.4 },
  rangeTxtActive: { color: GOLD_L, fontWeight: '600' },
  rangeUnderline: { height: 2, width: 20, backgroundColor: GOLD, borderRadius: 1, marginTop: 6 },

  // Stat rail — hairline-divided, not boxed
  statRail: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SP.LG,
    marginBottom: SP.XXL,
  },
  statItem: { flex: 1, alignItems: 'flex-start' },
  statDivider: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: BORDER, marginHorizontal: SP.SM },
  statValue: { fontSize: 13, fontFamily: mono, fontWeight: '500', color: TXT, marginBottom: 3 },
  statLabel: { fontSize: 9, color: MUTED, fontFamily: sans, textTransform: 'uppercase', letterSpacing: 0.5 },

  section: { marginBottom: SP.XXL, paddingHorizontal: SP.LG },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP.MD },
  sectionTitle: { fontSize: 12, color: TXT, fontFamily: mono, fontWeight: '500', letterSpacing: 1, textTransform: 'uppercase' },
  sectionLink: { fontSize: 11.5, color: GOLD_L, fontFamily: mono },

  // Top movers
  moverRow: { gap: SP.SM, paddingRight: SP.LG },
  moverCard: {
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    borderRadius: RADIUS.LG,
    paddingHorizontal: SP.MD,
    paddingVertical: SP.MD,
    minWidth: 96,
    gap: 8,
  },
  moverTicker: { fontSize: 13, color: TXT, fontFamily: mono, fontWeight: '600' },
  moverPill: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.XS },
  moverPct: { fontSize: 10.5, fontFamily: mono, fontWeight: '600' },

  // Signals — swipeable pills
  signalRow: { gap: SP.SM, paddingRight: SP.LG },
  signalPill: {
    width: SCREEN_W * 0.72,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    borderLeftWidth: 2,
    borderRadius: RADIUS.LG,
    padding: SP.MD,
  },
  signalBadge: { fontSize: 9, fontWeight: '600', fontFamily: mono, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  signalTitle: { fontSize: 13, color: TXT, fontFamily: sans, fontWeight: '600', marginBottom: 4 },
  signalBody:  { fontSize: 11.5, color: TXT2, fontFamily: sans, lineHeight: 16 },

  emptySignals: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyTxt: { fontSize: 12.5, color: MUTED, fontFamily: sans, textAlign: 'center' },

  // Quick actions — circular, minimal
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SP.MD },
  actionBtn: { alignItems: 'center', gap: 7 },
  actionCircle: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth, borderColor: QL.BORDER_HI,
    backgroundColor: QL.GOLD_D,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: 10, color: TXT2, fontFamily: mono, letterSpacing: 0.3 },
});
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Path, Svg } from 'react-native-svg';
import { useInsights } from '@/src/insights/hooks/useInsights';
import { usePortfolioData } from '@/src/portfolio/hooks/usePortfolioData';
import { fmtCurrency, sign, getTicker, getUnits } from '@/src/portfolio/helpers';
import { InsightSeverity } from '@/src/services/mlPipeline';
import { useAuthStore } from '@/src/store/useAuthStore';

// ─── Tokens ───────────────────────────────────────────────────────────────────
const BG      = '#060E1F';
const CARD    = '#0E1D35';
const BORDER  = '#1E3347';
const CYAN    = '#0EA5E9';
const INDIGO  = '#818CF8';
const GREEN   = '#10B981';
const CORAL   = '#FF716C';
const AMBER   = '#F59E0B';
const TXT     = '#E8F4FD';
const TXT2    = '#7C9AB5';
const MUTED   = '#607A93';
const sans    = Platform.OS === 'ios' ? 'SF Pro Text' : 'sans-serif';

const SCREEN_W = Dimensions.get('window').width;
const SPARK_W  = SCREEN_W - 48;
const SPARK_H  = 56;

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ values }: { values: number[] }) {
  const path = useMemo(() => {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => ({
      x: (i / (values.length - 1)) * SPARK_W,
      y: SPARK_H - ((v - min) / range) * (SPARK_H - 8) - 4,
    }));
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
  }, [values]);

  if (!path) return null;
  return (
    <Svg width={SPARK_W} height={SPARK_H} style={styles.sparkline}>
      <Path d={path} stroke={CYAN} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Signal severity helpers ──────────────────────────────────────────────────
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

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({
  label, value, icon, color = TXT,
}: {
  label: string; value: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color?: string;
}) {
  return (
    <View style={styles.statCard}>
      <MaterialCommunityIcons name={icon} size={16} color={MUTED} style={{ marginBottom: 8 }} />
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SignalCard({ severity, title, body }: { severity: InsightSeverity; title: string; body: string }) {
  const color = SEVERITY_COLOR[severity];
  return (
    <View style={[styles.signalCard, { borderLeftColor: color }]}>
      <View style={styles.signalHeader}>
        <Text style={[styles.signalBadge, { color, backgroundColor: `${color}18` }]}>
          {SEVERITY_LABEL[severity]}
        </Text>
      </View>
      <Text style={styles.signalTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.signalBody} numberOfLines={2}>{body}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
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
    refreshing, snapValues,
  } = usePortfolioData();

  const { data: insightsData, loading: insightsLoading } = useInsights();

  const isLoading = portfolioLoading && !totalVal;

  const topSignals = useMemo(() => {
    if (!insightsData?.signals) return [];
    const order: InsightSeverity[] = ['critical', 'warning', 'positive', 'neutral'];
    return [...insightsData.signals]
      .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
      .slice(0, 3);
  }, [insightsData?.signals]);

  const bestPerformer = performers.top[0];
  const positionCount = positions.length;

  const todayUp = todayChange >= 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>{greeting},</Text>
          <Text style={styles.greetingName}>{firstName}</Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/index')} hitSlop={12}>
          <MaterialCommunityIcons name="bell-outline" size={22} color={TXT2} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={CYAN}
            colors={[CYAN]}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={CYAN} size="large" />
          </View>
        ) : (
          <>
            {/* ── Net-worth hero ── */}
            <View style={styles.heroWrap}>
              <Text style={styles.heroLabel}>Total Portfolio Value</Text>
              <Text style={styles.heroValue}>
                {totalVal > 0 ? fmtCurrency(totalVal, currency) : '—'}
              </Text>
              {totalVal > 0 && (
                <View style={[styles.changePill, { backgroundColor: todayUp ? `${GREEN}18` : `${CORAL}18` }]}>
                  <MaterialCommunityIcons
                    name={todayUp ? 'trending-up' : 'trending-down'}
                    size={13}
                    color={todayUp ? GREEN : CORAL}
                  />
                  <Text style={[styles.changePillTxt, { color: todayUp ? GREEN : CORAL }]}>
                    {sign(todayChange)}{fmtCurrency(Math.abs(todayChange), currency)}
                    {'  '}
                    {sign(todayChangePct)}{todayChangePct.toFixed(2)}% today
                  </Text>
                </View>
              )}
              {snapValues.length >= 2 && (
                <View style={styles.sparkWrap}>
                  <Sparkline values={snapValues} />
                </View>
              )}
            </View>

            {/* ── Quick stats grid ── */}
            <View style={styles.statsGrid}>
              <StatCard
                label="Day's Gain"
                value={todayChange !== 0 ? `${sign(todayChange)}${fmtCurrency(Math.abs(todayChange), currency)}` : '—'}
                icon="trending-up"
              />
              <StatCard
                label="Positions"
                value={positionCount > 0 ? `${positionCount} assets` : '—'}
                icon="briefcase-outline"
              />
              <StatCard
                label="Best Performer"
                value={bestPerformer ? `${bestPerformer.ticker} ${sign(bestPerformer.pct)}${bestPerformer.pct.toFixed(1)}%` : '—'}
                icon="star-outline"
                color={GREEN}
              />
              <StatCard
                label="Cash Available"
                value={cash > 0 ? fmtCurrency(cash, currency) : '—'}
                icon="wallet-outline"
              />
            </View>

            {/* ── AI Signals ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>AI Signals</Text>
                {insightsLoading ? (
                  <ActivityIndicator color={INDIGO} size="small" />
                ) : topSignals.length > 0 ? (
                  <Pressable
                    onPress={() => router.push('/(tabs)/Insights')}
                    style={styles.signalChip}
                  >
                    <Text style={styles.signalChipTxt}>{topSignals.length} active  →</Text>
                  </Pressable>
                ) : null}
              </View>

              {topSignals.length > 0 ? (
                topSignals.map(s => (
                  <Pressable key={s.id} onPress={() => router.push('/(tabs)/Insights')}>
                    <SignalCard severity={s.severity} title={s.title} body={s.body} />
                  </Pressable>
                ))
              ) : !insightsLoading ? (
                <View style={styles.emptySignals}>
                  <MaterialCommunityIcons name="brain" size={28} color={MUTED} />
                  <Text style={styles.emptyTxt}>
                    {totalVal > 0
                      ? 'Connect more data to generate signals'
                      : 'Connect a brokerage to get AI signals'}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* ── Quick navigation shortcuts ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <View style={styles.quickRow}>
                {([
                  { label: 'Markets',   icon: 'chart-line',          route: '/(tabs)/Market'    },
                  { label: 'Vault',     icon: 'safe-square-outline',  route: '/(tabs)/Portfolio' },
                  { label: 'Compare',   icon: 'chart-multiple',       route: '/(tabs)/Compare'   },
                  { label: 'Reports',   icon: 'download-circle-outline', route: '/(tabs)/Reports' },
                ] as const).map(item => (
                  <Pressable
                    key={item.label}
                    style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => router.push(item.route as any)}
                  >
                    <MaterialCommunityIcons name={item.icon as any} size={20} color={CYAN} />
                    <Text style={styles.quickBtnTxt}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG },
  scroll:       { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  greeting:     { fontSize: 12, color: TXT2, fontFamily: sans },
  greetingName: { fontSize: 18, color: TXT,  fontFamily: sans, fontWeight: '700' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },

  // Hero
  heroWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 20,
  },
  heroLabel: {
    fontSize: 11,
    color: MUTED,
    fontFamily: sans,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroValue: {
    fontSize: 38,
    color: TXT,
    fontFamily: sans,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 16,
  },
  changePillTxt: { fontSize: 12, fontFamily: sans, fontWeight: '600' },
  sparkWrap:    { width: SPARK_W, height: SPARK_H },
  sparkline:    {},

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
  },
  statValue: {
    fontSize: 14,
    color: TXT,
    fontFamily: sans,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    color: MUTED,
    fontFamily: sans,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Section
  section:       { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:  { fontSize: 13, color: TXT, fontFamily: sans, fontWeight: '700', letterSpacing: 0.3 },
  signalChip: {
    backgroundColor: `${INDIGO}18`,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  signalChipTxt: { fontSize: 11, color: INDIGO, fontFamily: sans, fontWeight: '600' },

  // Signal card
  signalCard: {
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    borderLeftWidth: 3,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  signalHeader: { marginBottom: 6 },
  signalBadge: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: sans,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  signalTitle: { fontSize: 13, color: TXT,  fontFamily: sans, fontWeight: '600', marginBottom: 3 },
  signalBody:  { fontSize: 12, color: TXT2, fontFamily: sans, lineHeight: 17 },

  emptySignals: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  emptyTxt:     { fontSize: 13, color: MUTED, fontFamily: sans, textAlign: 'center' },

  // Quick actions
  quickRow: { flexDirection: 'row', gap: 8 },
  quickBtn: {
    flex: 1,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  quickBtnTxt: { fontSize: 10, color: TXT2, fontFamily: sans, fontWeight: '500' },
});

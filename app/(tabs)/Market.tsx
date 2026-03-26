import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ScrollView as HScrollView,
} from 'react-native';
import {
  BG, BORDER, CARD, GOLD, GOLD_D, MUTED, mono, sans, TXT, TXT2,
} from '@/src/portfolio/tokens';
import { useMarketData } from '@/src/market/hooks/useMarketData';
import {
  IndexCard,
  MarketChart,
  MoversSection,
  SectorGrid,
} from '@/src/market/components';

// ─── Live clock ───────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const et = time.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return <Text style={styles.clock}>{et} ET</Text>;
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonPulse({ w, h, r = 6 }: { w: number | string; h: number; r?: number }) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.9, duration: 800, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: false }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View
      style={{
        width: w as any,
        height: h,
        borderRadius: r,
        backgroundColor: 'rgba(255,255,255,0.06)',
        opacity: anim,
      }}
    />
  );
}

function LoadingSkeleton() {
  return (
    <View style={{ padding: 24, gap: 20 }}>
      {/* Indices row */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[0, 1, 2].map(i => (
          <View key={i} style={{ width: 120, gap: 8, padding: 12, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER }}>
            <SkeletonPulse w={30} h={8} />
            <SkeletonPulse w={50} h={18} />
            <SkeletonPulse w={70} h={10} />
            <SkeletonPulse w={40} h={14} />
            <SkeletonPulse w={60} h={12} />
          </View>
        ))}
      </View>
      {/* Chart */}
      <View style={{ backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 12 }}>
        <SkeletonPulse w="50%" h={28} />
        <SkeletonPulse w="100%" h={200} r={8} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {['1D','1W','1M','3M','1Y'].map(p => <SkeletonPulse key={p} w={30} h={14} />)}
        </View>
      </View>
      {/* Sectors */}
      <View style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 12 }}>
        <SkeletonPulse w="40%" h={16} r={4} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {Array(11).fill(0).map((_, i) => (
            <SkeletonPulse key={i} w="30%" h={48} r={8} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Market Stats Bar ─────────────────────────────────────────────────────────
function StatBadge({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statBadge}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MarketScreen() {
  const {
    indices,
    selectedIdx,
    setSelectedIdx,
    period,
    setPeriod,
    chartData,
    chartLoading,
    gainers,
    losers,
    sectors,
    loading,
    refreshing,
    marketStatus,
    lastUpdated,
    error,
    refresh,
  } = useMarketData();

  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!loading) {
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
  }, [loading]);

  const selectedIndex = indices[selectedIdx];

  // Stats from S&P 500 + VIX if available
  const spx   = indices.find(i => i.symbol === '^GSPC');
  const vix   = indices.find(i => i.symbol === '^VIX');
  const btc   = indices.find(i => i.symbol === 'BTC-USD');
  const spxUp = (spx?.quote?.changePct ?? 0) >= 0;

  return (
    <View style={styles.root}>
      {/* ── Fixed Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>GLOBAL MARKETS</Text>
          <LiveClock />
        </View>
        <View style={[styles.statusBadge, { borderColor: marketStatus.color }]}>
          <View style={[styles.statusDot, { backgroundColor: marketStatus.color }]} />
          <Text style={[styles.statusTxt, { color: marketStatus.color }]}>
            {marketStatus.label}
          </Text>
        </View>
      </View>

      {/* ── Quick stats strip ────────────────────────────────────────── */}
      {!loading && (
        <Animated.View style={[styles.statsStrip, { opacity: headerAnim }]}>
          {spx?.quote && (
            <StatBadge
              label="S&P 500"
              value={`${spxUp ? '+' : ''}${spx.quote.changePct.toFixed(2)}%`}
              color={spxUp ? '#34D399' : '#F87171'}
            />
          )}
          {btc?.quote && (
            <StatBadge
              label="BTC"
              value={`$${btc.quote.price >= 10000
                ? btc.quote.price.toLocaleString('en-US', { maximumFractionDigits: 0 })
                : btc.quote.price.toFixed(0)}`}
            />
          )}
          {lastUpdated && (
            <StatBadge
              label="UPDATED"
              value={lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
            />
          )}
        </Animated.View>
      )}

      {/* ── Content ─────────────────────────────────────────────────── */}
      {loading ? (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <LoadingSkeleton />
        </ScrollView>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.errorTitle}>Failed to load market data</Text>
          <Text style={styles.errorSub}>{error}</Text>
          <Text style={styles.retryBtn} onPress={refresh}>Tap to retry</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={GOLD}
              colors={[GOLD]}
            />
          }
        >
          {/* ── Index Cards ───────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <View style={styles.goldBar} />
            <Text style={styles.sectionTitle}>Major Indices</Text>
          </View>
          <HScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardsRow}
          >
            {indices.map((item, i) => (
              <IndexCard
                key={item.symbol}
                item={item}
                active={selectedIdx === i}
                onPress={() => setSelectedIdx(i)}
              />
            ))}
          </HScrollView>

          {/* ── Main Chart ────────────────────────────────────────────── */}
          <MarketChart
            index={selectedIndex}
            chartData={chartData}
            loading={chartLoading}
            period={period}
            onPeriodChange={setPeriod}
          />

          {/* ── 52-Week Range ─────────────────────────────────────────── */}
          {selectedIndex?.quote?.fiftyTwoWeekHigh != null && (
            <View style={styles.weekRangeCard}>
              <Text style={styles.weekRangeTitle}>52-WEEK RANGE</Text>
              <View style={styles.weekRangeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.weekLabel}>LOW</Text>
                  <Text style={styles.weekVal}>{selectedIndex.quote.fiftyTwoWeekLow?.toFixed(2)}</Text>
                </View>
                <View style={{ flex: 3, paddingHorizontal: 12 }}>
                  {(() => {
                    const lo = selectedIndex.quote!.fiftyTwoWeekLow!;
                    const hi = selectedIndex.quote!.fiftyTwoWeekHigh!;
                    const p  = selectedIndex.quote!.price;
                    const pct = Math.max(2, Math.min(98, ((p - lo) / (hi - lo || 1)) * 100));
                    return (
                      <View>
                        <View style={styles.weekBar}>
                          <View style={[styles.weekFill, { width: `${pct}%` }]} />
                          <View style={[styles.weekThumb, { left: `${pct}%` as any }]} />
                        </View>
                        <Text style={[styles.weekLabel, { textAlign: 'center', marginTop: 4 }]}>
                          {pct.toFixed(0)}th percentile
                        </Text>
                      </View>
                    );
                  })()}
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.weekLabel}>HIGH</Text>
                  <Text style={styles.weekVal}>{selectedIndex.quote.fiftyTwoWeekHigh?.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Sector Heatmap ─────────────────────────────────────────── */}
          {sectors.length > 0 && <SectorGrid sectors={sectors} />}

          {/* ── Market Movers ─────────────────────────────────────────── */}
          {(gainers.length > 0 || losers.length > 0) && (
            <MoversSection gainers={gainers} losers={losers} />
          )}

          {/* ── Footer ────────────────────────────────────────────────── */}
          <Text style={styles.footer}>
            Data via Yahoo Finance · {marketStatus.isOpen ? 'Live' : 'Delayed'} · Not financial advice
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: BG,
  },
  screenTitle: {
    fontFamily: mono,
    fontSize: 18,
    color: GOLD,
    letterSpacing: 3,
    fontWeight: '700',
  },
  clock: {
    fontFamily: mono,
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
    letterSpacing: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusTxt: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  statsStrip: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: 'rgba(15,21,32,0.95)',
  },
  statBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statLabel: { fontFamily: mono, fontSize: 9, color: MUTED, letterSpacing: 1 },
  statValue: { fontFamily: mono, fontSize: 11, color: TXT, fontWeight: '600' },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
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
  cardsRow: {
    paddingRight: 20,
    marginBottom: 20,
  },
  weekRangeCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 20,
  },
  weekRangeTitle: {
    fontFamily: mono,
    fontSize: 9,
    color: MUTED,
    letterSpacing: 2,
    marginBottom: 12,
  },
  weekRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekLabel: {
    fontFamily: mono,
    fontSize: 9,
    color: MUTED,
    letterSpacing: 1,
  },
  weekVal: {
    fontFamily: mono,
    fontSize: 13,
    color: TXT,
    fontWeight: '600',
    marginTop: 2,
  },
  weekBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  weekFill: {
    height: '100%',
    backgroundColor: GOLD,
    borderRadius: 2,
    opacity: 0.6,
  },
  weekThumb: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GOLD,
    marginLeft: -6,
    borderWidth: 2,
    borderColor: BG,
  },
  errorBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  errorIcon: { fontSize: 32 },
  errorTitle: { fontFamily: 'Georgia', fontSize: 16, color: TXT, textAlign: 'center' },
  errorSub: { fontFamily: mono, fontSize: 11, color: MUTED, textAlign: 'center' },
  retryBtn: {
    fontFamily: mono,
    fontSize: 12,
    color: GOLD,
    borderWidth: 1,
    borderColor: GOLD,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  footer: {
    fontFamily: mono,
    fontSize: 9,
    color: MUTED,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 8,
  },
});

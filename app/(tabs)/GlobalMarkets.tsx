import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart } from 'react-native-wagmi-charts';
import Svg, { Polyline } from 'react-native-svg';
import {
  useStockExplorer,
  SECTOR_KEYS,
  type SectorKey,
} from '@/src/market/hooks/useStockExplorer';
import { fetchQuotes } from '@/src/market/service';
import type { ChartPoint, DetailedQuote, Period, Quote } from '@/src/market/types';
import {
  BG, BORDER, CARD, CARD2, CARD3,
  GOLD, GOLD_D, GOLD_B,
  GREEN, GREEN_D, RED, RED_D,
  AMBER, PURPLE,
  TXT, TXT2, MUTED,
  mono, sans,
} from '@/src/market/tokens';

const { width: W } = Dimensions.get('window');
const PERIODS = ['1D', '1W', '1M', '3M', '1Y'] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtPrice(n: number): string {
  if (n >= 10000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toFixed(2);
}
function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
function fmtVol(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}
function fmtMktCap(n: number | undefined): string {
  if (!n) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}

// ─── Mini sparkline from chart points ────────────────────────────────────────
function Sparkline({ data, color, w = 64, h = 28 }: { data: ChartPoint[]; color: string; w?: number; h?: number }) {
  if (data.length < 2) return <View style={{ width: w, height: h }} />;
  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h * 0.85 - 2}`)
    .join(' ');
  return (
    <Svg width={w} height={h}>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Market status ────────────────────────────────────────────────────────────
function getMarketStatus(): { label: string; color: string; isOpen: boolean } {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const year = now.getUTCFullYear();
  const dstStart = new Date(Date.UTC(year, 2, 1));
  dstStart.setUTCDate(8 - (dstStart.getUTCDay() || 7));
  const dstEnd = new Date(Date.UTC(year, 10, 1));
  dstEnd.setUTCDate(1 + ((7 - dstEnd.getUTCDay()) % 7));
  const isDST = utcMs >= dstStart.getTime() && utcMs < dstEnd.getTime();
  const etMs = utcMs - (isDST ? 4 : 5) * 3_600_000;
  const etDate = new Date(etMs);
  const day = etDate.getUTCDay();
  const mins = etDate.getUTCHours() * 60 + etDate.getUTCMinutes();
  if (day === 0 || day === 6)     return { label: 'CLOSED',       color: MUTED,    isOpen: false };
  if (mins >= 240 && mins < 570)  return { label: 'PRE-MARKET',   color: AMBER,    isOpen: false };
  if (mins >= 570 && mins < 960)  return { label: 'MARKET OPEN',  color: GREEN,    isOpen: true  };
  if (mins >= 960 && mins < 1200) return { label: 'AFTER-HOURS',  color: PURPLE,   isOpen: false };
  return { label: 'CLOSED', color: MUTED, isOpen: false };
}

// ─── Ticker item ─────────────────────────────────────────────────────────────
function TickerItem({ quote, label }: { quote: Quote | null; label: string }) {
  if (!quote) return null;
  const up = quote.changePct >= 0;
  const col = up ? GREEN : RED;
  return (
    <View style={s.tickerItem}>
      <Text style={s.tickerLabel}>{label}</Text>
      <Text style={[s.tickerPrice, { color: col }]}>{fmtPrice(quote.price)}</Text>
      <View style={[s.pctBadge, { backgroundColor: up ? GREEN_D : RED_D }]}>
        <Text style={[s.pctBadgeTxt, { color: col }]}>{fmtPct(quote.changePct)}</Text>
      </View>
    </View>
  );
}

// ─── Stock row ────────────────────────────────────────────────────────────────
interface StockRowProps {
  symbol: string;
  name: string;
  quote: Quote | undefined;
  chartData?: ChartPoint[];
  onPress: () => void;
}
function StockRow({ symbol, name, quote, chartData, onPress }: StockRowProps) {
  const up = (quote?.changePct ?? 0) >= 0;
  const col = up ? GREEN : RED;
  const loading = !quote;
  return (
    <TouchableOpacity style={s.stockRow} onPress={onPress} activeOpacity={0.7}>
      {/* Avatar / ticker badge */}
      <View style={[s.tickerBadge, { borderColor: `${col}40` }]}>
        <Text style={[s.tickerBadgeTxt, { color: col }]}>{symbol.replace('-USD', '').slice(0, 4)}</Text>
      </View>
      {/* Name */}
      <View style={s.stockMid}>
        <Text style={s.stockSymbol}>{symbol.replace('-USD', '')}</Text>
        <Text style={s.stockName} numberOfLines={1}>{name}</Text>
      </View>
      {/* Sparkline */}
      {chartData && chartData.length > 1 && (
        <Sparkline data={chartData} color={col} />
      )}
      {/* Price */}
      <View style={s.stockRight}>
        {loading ? (
          <ActivityIndicator size="small" color={MUTED} />
        ) : (
          <>
            <Text style={s.stockPrice}>{fmtPrice(quote!.price)}</Text>
            <View style={[s.pctBadge, { backgroundColor: up ? GREEN_D : RED_D, marginTop: 4 }]}>
              <Text style={[s.pctBadgeTxt, { color: col }]}>{fmtPct(quote!.changePct)}</Text>
            </View>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Mover row ────────────────────────────────────────────────────────────────
function MoverRow({ symbol, name, price, changePct, volume, onPress }: {
  symbol: string; name: string; price: number;
  changePct: number; volume: number; onPress: () => void;
}) {
  const up = changePct >= 0;
  const col = up ? GREEN : RED;
  return (
    <TouchableOpacity style={s.moverRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.tickerBadge, { borderColor: `${col}40`, width: 44, height: 44 }]}>
        <Text style={[s.tickerBadgeTxt, { color: col }]}>{symbol.slice(0, 4)}</Text>
      </View>
      <View style={s.stockMid}>
        <Text style={s.stockSymbol}>{symbol}</Text>
        <Text style={s.stockName} numberOfLines={1}>{name}</Text>
        <Text style={[s.stockName, { color: MUTED, marginTop: 1 }]}>Vol {fmtVol(volume)}</Text>
      </View>
      <View style={s.stockRight}>
        <Text style={s.stockPrice}>{fmtPrice(price)}</Text>
        <View style={[s.pctBadge, { backgroundColor: up ? GREEN_D : RED_D, marginTop: 4 }]}>
          <Text style={[s.pctBadgeTxt, { color: col }]}>{fmtPct(changePct)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Sector grid row ──────────────────────────────────────────────────────────
function SectorCard({ name, etf, price, changePct }: {
  name: string; etf: string; price: number; changePct: number;
}) {
  const up = changePct >= 0;
  const col = up ? GREEN : RED;
  const barW = Math.min(Math.abs(changePct) * 8, 100);
  return (
    <View style={s.sectorCard}>
      <View style={s.sectorTop}>
        <Text style={s.sectorEtf}>{etf}</Text>
        <View style={[s.pctBadge, { backgroundColor: up ? GREEN_D : RED_D }]}>
          <Text style={[s.pctBadgeTxt, { color: col }]}>{fmtPct(changePct)}</Text>
        </View>
      </View>
      <Text style={s.sectorName} numberOfLines={1}>{name}</Text>
      <Text style={s.sectorPrice}>${fmtPrice(price)}</Text>
      <View style={s.sectorBar}>
        <View style={[s.sectorFill, { width: `${barW}%` as `${number}%`, backgroundColor: col }]} />
      </View>
    </View>
  );
}

// ─── Range bar ────────────────────────────────────────────────────────────────
function RangeBar({ low, high, current, label }: { low: number; high: number; current: number; label: string }) {
  const pct = high > low ? ((current - low) / (high - low)) * 100 : 50;
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={s.detailStatLbl}>{label}</Text>
        <Text style={[s.detailStatLbl, { color: TXT2 }]}>{fmtPrice(current)}</Text>
      </View>
      <View style={s.rangeTrack}>
        <View style={[s.rangeFill, { width: `${Math.max(2, Math.min(98, pct))}%` as `${number}%` }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={s.rangeEndLbl}>{fmtPrice(low)}</Text>
        <Text style={s.rangeEndLbl}>{fmtPrice(high)}</Text>
      </View>
    </View>
  );
}

// ─── Stat grid cell ───────────────────────────────────────────────────────────
function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.statCell}>
      <Text style={s.statCellLbl}>{label}</Text>
      <Text style={[s.statCellVal, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

// ─── Stock Detail Modal ───────────────────────────────────────────────────────
interface DetailModalProps {
  symbol: string | null;
  detail: DetailedQuote | null;
  chartData: ChartPoint[];
  period: Period;
  chartLoading: boolean;
  rsi: number | null;
  onClose: () => void;
  onPeriodChange: (p: Period) => void;
}
function StockDetailModal({ symbol, detail, chartData, period, chartLoading, rsi, onClose, onPeriodChange }: DetailModalProps) {
  const up = (detail?.changePct ?? 0) >= 0;
  const col = up ? GREEN : RED;
  const wagmiData = chartData.map(p => ({ timestamp: p.timestamp, value: p.value }));
  const chartW = W - 32;

  return (
    <Modal visible={!!symbol} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <StatusBar barStyle="light-content" backgroundColor={BG} />
        {/* Header */}
        <View style={s.modalHeader}>
          <View>
            <Text style={s.modalSymbol}>{symbol?.replace('-USD', '')}</Text>
            <Text style={s.modalName}>{detail?.longName ?? detail?.shortName ?? symbol}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={s.closeBtnTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          {/* Price block */}
          <View style={s.modalPriceBlock}>
            <Text style={s.modalPrice}>{detail ? fmtPrice(detail.price) : '—'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <Text style={[s.modalChange, { color: col }]}>
                {detail ? `${detail.change >= 0 ? '+' : ''}${detail.change.toFixed(2)}` : '—'}
              </Text>
              <View style={[s.pctBadge, { backgroundColor: up ? GREEN_D : RED_D, paddingHorizontal: 10, paddingVertical: 4 }]}>
                <Text style={[s.pctBadgeTxt, { color: col, fontSize: 13 }]}>
                  {detail ? fmtPct(detail.changePct) : '—'}
                </Text>
              </View>
            </View>
          </View>

          {/* Chart */}
          <View style={s.chartBox}>
            {chartLoading ? (
              <View style={s.chartPlaceholder}>
                <ActivityIndicator color={GOLD} size="large" />
                <Text style={s.chartLoadTxt}>Loading chart…</Text>
              </View>
            ) : wagmiData.length > 1 ? (
              <LineChart.Provider data={wagmiData}>
                <LineChart height={200} width={chartW}>
                  <LineChart.Path color={col} width={2} />
                  <LineChart.Gradient color={col} />
                  <LineChart.CursorCrosshair color={col}>
                    <LineChart.Tooltip
                      style={{ backgroundColor: CARD2, borderRadius: 6, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 8, paddingVertical: 4 }}
                      textStyle={{ color: TXT, fontFamily: mono, fontSize: 12 }}
                    />
                  </LineChart.CursorCrosshair>
                </LineChart>
                <View style={s.chartFooterRow}>
                  <LineChart.DatetimeText style={{ color: MUTED, fontFamily: mono, fontSize: 10 }} />
                  <LineChart.PriceText style={{ color: TXT2, fontFamily: mono, fontSize: 11 }} />
                </View>
              </LineChart.Provider>
            ) : (
              <View style={s.chartPlaceholder}>
                <Text style={s.chartLoadTxt}>No chart data available</Text>
              </View>
            )}
          </View>

          {/* Period selector */}
          <View style={s.periodRow}>
            {PERIODS.map(p => (
              <TouchableOpacity key={p} style={[s.periodBtn, period === p && s.periodBtnActive]} onPress={() => onPeriodChange(p)}>
                <Text style={[s.periodTxt, period === p && s.periodTxtActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {detail && (
            <>
              {/* RSI badge */}
              {rsi !== null && (
                <View style={s.rsiBadge}>
                  <Text style={s.rsiLbl}>RSI (14)</Text>
                  <Text style={[s.rsiVal, { color: rsi > 70 ? RED : rsi < 30 ? GREEN : GOLD }]}>
                    {rsi.toFixed(1)}
                  </Text>
                  <Text style={[s.rsiStatus, { color: rsi > 70 ? RED : rsi < 30 ? GREEN : TXT2 }]}>
                    {rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : 'NEUTRAL'}
                  </Text>
                </View>
              )}

              {/* Day range */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>DAY RANGE</Text>
                <RangeBar low={detail.dayLow} high={detail.dayHigh} current={detail.price} label="Today" />
                {detail.fiftyTwoWeekLow !== undefined && detail.fiftyTwoWeekHigh !== undefined && (
                  <RangeBar low={detail.fiftyTwoWeekLow} high={detail.fiftyTwoWeekHigh} current={detail.price} label="52-Week" />
                )}
              </View>

              {/* Key stats grid */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>KEY STATISTICS</Text>
                <View style={s.statGrid}>
                  <StatCell label="MARKET CAP" value={fmtMktCap(detail.marketCap)} />
                  <StatCell label="VOLUME" value={fmtVol(detail.volume)} />
                  <StatCell label="AVG VOL (3M)" value={detail.averageDailyVolume3Month ? fmtVol(detail.averageDailyVolume3Month) : '—'} />
                  <StatCell label="PREV CLOSE" value={`$${fmtPrice(detail.previousClose)}`} />
                  <StatCell label="TRAILING P/E" value={detail.trailingPE ? detail.trailingPE.toFixed(2) : '—'} />
                  <StatCell label="FORWARD P/E" value={detail.forwardPE ? detail.forwardPE.toFixed(2) : '—'} />
                  <StatCell label="EPS (TTM)" value={detail.trailingEps ? `$${detail.trailingEps.toFixed(2)}` : '—'} />
                  <StatCell label="BETA" value={detail.beta ? detail.beta.toFixed(2) : '—'} />
                  <StatCell label="DIV YIELD" value={detail.dividendYield ? `${detail.dividendYield.toFixed(2)}%` : '—'} />
                  <StatCell label="P/BOOK" value={detail.priceToBook ? detail.priceToBook.toFixed(2) : '—'} />
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GlobalMarketsScreen() {
  const {
    activeSector, setActiveSector,
    activeTab, setActiveTab,
    search, setSearch,
    visibleStocks,
    quotesCache,
    quotesLoading,
    selectedSymbol, setSelectedSymbol,
    detailQuote,
    chartData,
    period, setPeriod,
    chartLoading,
    rsi,
    gainers, losers, moversLoading,
    sectorStats, sectorStatsLoading,
  } = useStockExplorer();

  const [moversView, setMoversView] = useState<'gainers' | 'losers'>('gainers');
  const [tickerQuotes, setTickerQuotes] = useState<Record<string, Quote>>({});
  const [refreshing, setRefreshing] = useState(false);
  const marketStatus = getMarketStatus();
  const searchRef = useRef<TextInput>(null);

  // Load ticker strip quotes on mount
  useEffect(() => {
    const syms = ['^GSPC', '^IXIC', '^DJI', 'BTC-USD', 'ETH-USD'];
    fetchQuotes(syms)
      .then(qs => {
        const map: Record<string, Quote> = {};
        qs.forEach(q => { map[q.symbol] = q; });
        setTickerQuotes(map);
      })
      .catch(() => {});
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const syms = ['^GSPC', '^IXIC', '^DJI', 'BTC-USD', 'ETH-USD'];
    fetchQuotes(syms)
      .then(qs => {
        const map: Record<string, Quote> = {};
        qs.forEach(q => { map[q.symbol] = q; });
        setTickerQuotes(map);
      })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, []);

  const handleStockPress = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
  }, [setSelectedSymbol]);

  const TICKER_ITEMS = [
    { sym: '^GSPC',   label: 'S&P 500' },
    { sym: '^IXIC',   label: 'NASDAQ'  },
    { sym: '^DJI',    label: 'DOW'     },
    { sym: 'BTC-USD', label: 'BTC'     },
    { sym: 'ETH-USD', label: 'ETH'     },
  ];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* ─── Fixed Header ──────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.screenTitle}>MARKETS</Text>
            <View style={s.statusRow}>
              <View style={[s.statusDot, { backgroundColor: marketStatus.color }]} />
              <Text style={[s.statusTxt, { color: marketStatus.color }]}>{marketStatus.label}</Text>
            </View>
          </View>
          <View style={[s.statusPill, { borderColor: `${marketStatus.color}44` }]}>
            <Text style={[s.statusPillTxt, { color: marketStatus.color }]}>{marketStatus.isOpen ? 'LIVE' : 'OFFLINE'}</Text>
          </View>
        </View>

        {/* Search bar */}
        <View style={s.searchBar}>
          <Text style={s.searchIcon}>⌕</Text>
          <TextInput
            ref={searchRef}
            style={s.searchInput}
            placeholder="Search stocks, ETFs, crypto…"
            placeholderTextColor={MUTED}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Index ticker strip ─────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tickerStrip} contentContainerStyle={s.tickerContent}>
        {TICKER_ITEMS.map(({ sym, label }) => (
          <TickerItem key={sym} quote={tickerQuotes[sym] ?? null} label={label} />
        ))}
      </ScrollView>

      {/* ─── Main tabs ──────────────────────────────────────────── */}
      <View style={s.tabBar}>
        {(['stocks', 'movers', 'sectors'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[s.tab, activeTab === tab && s.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[s.tabTxt, activeTab === tab && s.tabTxtActive]}>
              {tab === 'stocks' ? 'STOCKS' : tab === 'movers' ? 'MOVERS' : 'SECTORS'}
            </Text>
            {activeTab === tab && <View style={s.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* ─── Content ────────────────────────────────────────────── */}
      {activeTab === 'stocks' && (
        <>
          {/* Sector filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipStrip} contentContainerStyle={s.chipContent}>
            {SECTOR_KEYS.filter(k => k !== 'All').map(key => (
              <TouchableOpacity
                key={key}
                style={[s.chip, activeSector === key && s.chipActive]}
                onPress={() => setActiveSector(key as SectorKey)}
              >
                <Text style={[s.chipTxt, activeSector === key && s.chipTxtActive]}>{key.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Stock list */}
          <FlatList
            data={visibleStocks}
            keyExtractor={item => item.symbol}
            renderItem={({ item }) => (
              <StockRow
                symbol={item.symbol}
                name={item.name}
                quote={quotesCache[item.symbol]}
                onPress={() => handleStockPress(item.symbol)}
              />
            )}
            ItemSeparatorComponent={() => <View style={s.divider} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} colors={[GOLD]} />}
            ListFooterComponent={() => quotesLoading ? (
              <View style={s.loadingRow}>
                <ActivityIndicator color={GOLD} size="small" />
                <Text style={s.loadingTxt}>Loading quotes…</Text>
              </View>
            ) : null}
          />
        </>
      )}

      {activeTab === 'movers' && (
        <View style={{ flex: 1 }}>
          {/* Gainers / Losers toggle */}
          <View style={s.moversToggle}>
            <TouchableOpacity
              style={[s.moversBtn, moversView === 'gainers' && { backgroundColor: GREEN_D, borderColor: `${GREEN}44` }]}
              onPress={() => setMoversView('gainers')}
            >
              <Text style={[s.moversBtnTxt, moversView === 'gainers' && { color: GREEN }]}>▲  TOP GAINERS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.moversBtn, moversView === 'losers' && { backgroundColor: RED_D, borderColor: `${RED}44` }]}
              onPress={() => setMoversView('losers')}
            >
              <Text style={[s.moversBtnTxt, moversView === 'losers' && { color: RED }]}>▼  TOP LOSERS</Text>
            </TouchableOpacity>
          </View>

          {moversLoading ? (
            <View style={s.centeredLoader}>
              <ActivityIndicator color={GOLD} size="large" />
              <Text style={s.loadingTxt}>Fetching movers…</Text>
            </View>
          ) : (
            <FlatList
              data={moversView === 'gainers' ? gainers : losers}
              keyExtractor={item => item.symbol}
              renderItem={({ item }) => (
                <MoverRow
                  symbol={item.symbol}
                  name={item.name}
                  price={item.price}
                  changePct={item.changePct}
                  volume={item.volume}
                  onPress={() => handleStockPress(item.symbol)}
                />
              )}
              ItemSeparatorComponent={() => <View style={s.divider} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.listContent}
              ListEmptyComponent={() => (
                <View style={s.emptyBox}>
                  <Text style={s.emptyTxt}>No data available</Text>
                </View>
              )}
            />
          )}
        </View>
      )}

      {activeTab === 'sectors' && (
        sectorStatsLoading ? (
          <View style={s.centeredLoader}>
            <ActivityIndicator color={GOLD} size="large" />
            <Text style={s.loadingTxt}>Loading sectors…</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sectorGrid}>
            {sectorStats.map(sec => (
              <SectorCard key={sec.etf} name={sec.name} etf={sec.etf} price={sec.price} changePct={sec.changePct} />
            ))}
          </ScrollView>
        )
      )}

      {/* ─── Stock Detail Modal ─────────────────────────────────── */}
      <StockDetailModal
        symbol={selectedSymbol}
        detail={detailQuote}
        chartData={chartData}
        period={period}
        chartLoading={chartLoading}
        rsi={rsi}
        onClose={() => setSelectedSymbol(null)}
        onPeriodChange={setPeriod}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 58 : 28,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: BG,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  screenTitle: { color: TXT, fontSize: 22, fontFamily: sans, fontWeight: '800', letterSpacing: -0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusTxt: { fontSize: 9, fontFamily: mono, fontWeight: '700', letterSpacing: 1.5 },
  statusPill: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 9, paddingVertical: 4 },
  statusPillTxt: { fontSize: 9, fontFamily: mono, fontWeight: '800', letterSpacing: 2 },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD2, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, height: 42, gap: 8,
  },
  searchIcon: { color: MUTED, fontSize: 18 },
  searchInput: {
    flex: 1, color: TXT, fontSize: 14, fontFamily: sans,
    paddingVertical: 0,
  },
  searchClear: { color: MUTED, fontSize: 14, paddingLeft: 4 },

  // Ticker strip
  tickerStrip: { flexGrow: 0, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER },
  tickerContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  tickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CARD2, borderRadius: 8, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 7, marginRight: 6,
  },
  tickerLabel: { color: MUTED, fontSize: 10, fontFamily: mono, fontWeight: '700', letterSpacing: 1 },
  tickerPrice: { fontSize: 12, fontFamily: mono, fontWeight: '800' },

  // Tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: CARD,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 13, position: 'relative' },
  tabActive: {},
  tabTxt: { color: MUTED, fontSize: 11, fontFamily: mono, fontWeight: '700', letterSpacing: 1.5 },
  tabTxtActive: { color: GOLD },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: '15%', right: '15%',
    height: 2, backgroundColor: GOLD, borderRadius: 1,
  },

  // Sector chips
  chipStrip: { flexGrow: 0, backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: BORDER },
  chipContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: CARD2, borderWidth: 1, borderColor: BORDER, marginRight: 6,
  },
  chipActive: { backgroundColor: GOLD_D, borderColor: GOLD_B },
  chipTxt: { color: MUTED, fontSize: 10.5, fontFamily: mono, fontWeight: '700', letterSpacing: 0.8 },
  chipTxtActive: { color: GOLD },

  // List content
  listContent: { paddingBottom: 100, paddingTop: 4 },

  // Stock row
  stockRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, backgroundColor: BG, gap: 12,
  },
  tickerBadge: {
    width: 42, height: 42, borderRadius: 10,
    borderWidth: 1, backgroundColor: CARD2,
    alignItems: 'center', justifyContent: 'center',
  },
  tickerBadgeTxt: { fontSize: 10, fontFamily: mono, fontWeight: '900', letterSpacing: 0.5 },
  stockMid: { flex: 1 },
  stockSymbol: { color: TXT, fontSize: 14, fontFamily: mono, fontWeight: '800', letterSpacing: 0.3 },
  stockName: { color: TXT2, fontSize: 11.5, fontFamily: sans, marginTop: 2 },
  stockRight: { alignItems: 'flex-end', minWidth: 80 },
  stockPrice: { color: TXT, fontSize: 15, fontFamily: mono, fontWeight: '800' },

  // Pct badge
  pctBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  pctBadgeTxt: { fontSize: 11, fontFamily: mono, fontWeight: '800', letterSpacing: 0.3 },

  // Mover row (same as stock row but slightly bigger badge)
  moverRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: BG, gap: 12,
  },

  // Movers toggle
  moversToggle: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  moversBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    backgroundColor: CARD2, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center',
  },
  moversBtnTxt: { color: MUTED, fontSize: 11, fontFamily: mono, fontWeight: '800', letterSpacing: 1 },

  // Sectors grid
  sectorGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    padding: 12, gap: 10, paddingBottom: 100,
  },
  sectorCard: {
    width: (W - 34) / 2,
    backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    padding: 14,
  },
  sectorTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sectorEtf: { color: TXT, fontSize: 13, fontFamily: mono, fontWeight: '900' },
  sectorName: { color: MUTED, fontSize: 10.5, fontFamily: sans, marginBottom: 6 },
  sectorPrice: { color: TXT2, fontSize: 13, fontFamily: mono, fontWeight: '700', marginBottom: 8 },
  sectorBar: { height: 3, backgroundColor: CARD2, borderRadius: 2, overflow: 'hidden' },
  sectorFill: { height: '100%', borderRadius: 2, opacity: 0.8 },

  // Divider
  divider: { height: 1, backgroundColor: 'rgba(65,72,87,0.5)', marginLeft: 70 },

  // Loaders
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 20 },
  loadingTxt: { color: MUTED, fontSize: 11.5, fontFamily: mono },
  centeredLoader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyTxt: { color: MUTED, fontFamily: mono, fontSize: 12, letterSpacing: 0.5 },

  // ── Modal ─────────────────────────────────────────────────────
  modalRoot: { flex: 1, backgroundColor: BG },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 22 : 18, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  modalSymbol: { color: TXT, fontSize: 22, fontFamily: mono, fontWeight: '900', letterSpacing: 1 },
  modalName: { color: TXT2, fontSize: 12.5, fontFamily: sans, marginTop: 3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: CARD2, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnTxt: { color: MUTED, fontSize: 14, fontWeight: '700' },

  modalPriceBlock: { paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: BORDER },
  modalPrice: { color: TXT, fontSize: 34, fontFamily: mono, fontWeight: '900', letterSpacing: -0.5 },
  modalChange: { fontSize: 16, fontFamily: mono, fontWeight: '700' },

  chartBox: {
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  chartPlaceholder: { height: 200, alignItems: 'center', justifyContent: 'center', gap: 10 },
  chartLoadTxt: { color: MUTED, fontFamily: mono, fontSize: 12 },
  chartFooterRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: BG,
  },

  // Period selector
  periodRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  periodBtnActive: { backgroundColor: GOLD_D },
  periodTxt: { color: MUTED, fontSize: 12.5, fontFamily: mono, fontWeight: '700' },
  periodTxtActive: { color: GOLD },

  // RSI badge
  rsiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginVertical: 14,
    backgroundColor: CARD2, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    padding: 14,
  },
  rsiLbl: { color: MUTED, fontSize: 10, fontFamily: mono, letterSpacing: 1.5, flex: 1 },
  rsiVal: { fontSize: 18, fontFamily: mono, fontWeight: '900' },
  rsiStatus: { fontSize: 10, fontFamily: mono, fontWeight: '700', letterSpacing: 1 },

  // Sections
  section: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  sectionTitle: { color: MUTED, fontSize: 9.5, fontFamily: mono, fontWeight: '800', letterSpacing: 2, marginBottom: 14 },

  // Range bar
  rangeTrack: { height: 4, backgroundColor: CARD3, borderRadius: 2, overflow: 'hidden' },
  rangeFill: { height: '100%', backgroundColor: GOLD, borderRadius: 2, opacity: 0.85 },
  rangeEndLbl: { color: MUTED, fontSize: 10, fontFamily: mono },

  // Stat grid
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1, backgroundColor: BORDER, borderRadius: 10, overflow: 'hidden' },
  statCell: { width: (W - 34) / 2, backgroundColor: CARD2, padding: 14 },
  statCellLbl: { color: MUTED, fontSize: 9, fontFamily: mono, letterSpacing: 1.5, marginBottom: 5 },
  statCellVal: { color: TXT, fontSize: 14, fontFamily: mono, fontWeight: '800' },
  detailStatLbl: { color: MUTED, fontSize: 9.5, fontFamily: mono, letterSpacing: 1.5 },
});

/**
 * Compare.tsx — Platstock Counterfactual Intelligence Engine (VCIE)
 * Scenario builder, multi-series chart, Decision Impact Tree, Behavioral Profile, TOI
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Polyline, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBehavioralProfile } from '@/src/comparison/hooks/useBehavioralProfile';
import { useScenario } from '@/src/comparison/hooks/useScenario';
import { searchAssets } from '@/src/comparison/service';
import {
  ASSET_CLASS_COLORS,
  REBALANCING_LABELS,
  SERIES_COLORS,
  type AssetMetrics,
  type BehavioralProfile,
  type ComparisonAsset,
  type MonteCarloFan,
  type RebalancingStrategy,
  type ScenarioResults,
  type TimeseriesPoint,
} from '@/src/comparison/types';

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG     = '#060E1F';
const CARD   = '#0E1D35';
const CARD2  = '#122040';
const CYAN   = '#0EA5E9';
const GREEN  = '#10B981';
const RED    = '#FF716C';
const PURPLE = '#AC89FF';
const AMBER  = '#F59E0B';
const BORDER = 'rgba(14,165,233,0.12)';
const TXT    = '#E8F4FD';
const MUTED  = '#607A93';
const SUB    = '#7C9AB5';
const mono   = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const sans   = Platform.OS === 'ios' ? 'SF Pro Text' : 'sans-serif';

// ── Internal tabs ──────────────────────────────────────────────────────────────
type InternalTab = 'builder' | 'results' | 'decisions' | 'profile';
const TABS: { key: InternalTab; label: string; icon: string }[] = [
  { key: 'builder',   label: 'Scenario',  icon: 'tune-variant'      },
  { key: 'results',   label: 'Results',   icon: 'chart-multiple'    },
  { key: 'decisions', label: 'Decisions', icon: 'sitemap'           },
  { key: 'profile',   label: 'Behavior',  icon: 'brain'             },
];

// ── Period presets ─────────────────────────────────────────────────────────────
const PERIOD_PRESETS = [
  { label: '1Y', months: 12 },
  { label: '3Y', months: 36 },
  { label: '5Y', months: 60 },
  { label: '10Y', months: 120 },
  { label: 'Max', months: 0 },
];

// ── Helper ─────────────────────────────────────────────────────────────────────
function fmt(n: number, decimals = 2) { return n.toFixed(decimals); }
function fmtPct(n: number) { return `${n >= 0 ? '+' : ''}${fmt(n)}%`; }
function fmtNum(n: number) {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${fmt(n)}`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

// ── Multi-series line chart ────────────────────────────────────────────────────
interface ChartProps {
  timeseries: TimeseriesPoint[];
  seriesKeys: string[]; // e.g. ['actual', 'SPY_perfect', 'SPY_realistic']
  width: number;
  height?: number;
}

function ComparisonChart({ timeseries, seriesKeys, width, height = 220 }: ChartProps) {
  const PAD = { top: 16, right: 8, bottom: 32, left: 52 };
  const W   = width - PAD.left - PAD.right;
  const H   = height - PAD.top - PAD.bottom;

  if (!timeseries.length || !seriesKeys.length) return null;

  // Index all series to 100 at start
  const base: Record<string, number> = {};
  seriesKeys.forEach(k => {
    const first = timeseries.find(p => typeof p[k] === 'number' && p[k] as number > 0);
    base[k] = first ? (first[k] as number) : 1;
  });

  const indexed = timeseries.map(pt => {
    const row: Record<string, number> = {};
    seriesKeys.forEach(k => {
      const v = typeof pt[k] === 'number' ? (pt[k] as number) : 0;
      row[k] = base[k] > 0 ? (v / base[k]) * 100 : 100;
    });
    return row;
  });

  const allValues = indexed.flatMap(row => seriesKeys.map(k => row[k]));
  const minV = Math.min(...allValues) * 0.97;
  const maxV = Math.max(...allValues) * 1.03;
  const range = maxV - minV || 1;

  const x = (i: number) => (i / (timeseries.length - 1)) * W;
  const y = (v: number) => H - ((v - minV) / range) * H;

  // Y-axis labels
  const yTicks = [minV, (minV + maxV) / 2, maxV];

  // X-axis labels (start, mid, end)
  const xTicks = [0, Math.floor(timeseries.length / 2), timeseries.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i,
  );

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="grad0" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={CYAN} stopOpacity="0.15" />
          <Stop offset="1" stopColor={CYAN} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* Grid lines */}
      {yTicks.map((v, i) => (
        <React.Fragment key={i}>
          <Line
            x1={PAD.left} y1={PAD.top + y(v)}
            x2={PAD.left + W} y2={PAD.top + y(v)}
            stroke="rgba(255,255,255,0.06)" strokeWidth={1}
          />
          <SvgText
            x={PAD.left - 6} y={PAD.top + y(v) + 4}
            fontSize={9} fill={MUTED} textAnchor="end" fontFamily={mono}
          >
            {fmt(v, 0)}
          </SvgText>
        </React.Fragment>
      ))}

      {/* X-axis labels */}
      {xTicks.map(i => (
        <SvgText
          key={i}
          x={PAD.left + x(i)} y={height - 6}
          fontSize={9} fill={MUTED} textAnchor="middle" fontFamily={mono}
        >
          {timeseries[i]?.date?.slice(0, 7) ?? ''}
        </SvgText>
      ))}

      {/* Series lines */}
      {seriesKeys.map((key, si) => {
        const pts = indexed
          .map((row, i) => `${PAD.left + x(i)},${PAD.top + y(row[key])}`)
          .join(' ');
        return (
          <Polyline
            key={key}
            points={pts}
            fill="none"
            stroke={SERIES_COLORS[si] ?? MUTED}
            strokeWidth={si === 0 ? 2.5 : 1.8}
            strokeOpacity={si === 0 ? 1 : 0.8}
          />
        );
      })}
    </Svg>
  );
}

// ── Monte Carlo fan chart ──────────────────────────────────────────────────────
interface FanChartProps {
  data:   MonteCarloFan;
  color:  string;
  width:  number;
  height?: number;
}

function MonteCarloFanChart({ data, color, width, height = 150 }: FanChartProps) {
  const PAD = { top: 12, right: 8, bottom: 24, left: 50 };
  const W   = width - PAD.left - PAD.right;
  const H   = height - PAD.top - PAD.bottom;
  const n   = data.p50.length;

  if (n < 2) return null;

  const all = [...data.p10, ...data.p90].filter(v => v != null && v > 0);
  if (!all.length) return null;

  const minV  = Math.min(...all) * 0.97;
  const maxV  = Math.max(...all) * 1.03;
  const range = maxV - minV || 1;

  const xp = (i: number) => PAD.left + (i / (n - 1)) * W;
  const yp = (v: number) => PAD.top + H - ((v - minV) / range) * H;

  // Build a closed SVG path for a filled band between top[] and bot[]
  const bandPath = (top: number[], bot: number[]): string => {
    const fwd = top.map((v, i) => `${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(' L ');
    const rev = [...bot]
      .reverse()
      .map((v, i) => `${xp(n - 1 - i).toFixed(1)},${yp(v).toFixed(1)}`)
      .join(' L ');
    return `M ${fwd} L ${rev} Z`;
  };

  const linePts = (vals: number[]) =>
    vals.map((v, i) => `${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(' ');

  const yTicks = [minV, (minV + maxV) / 2, maxV];
  const xTick  = [0, Math.floor(n / 2), n - 1];
  const xLabel = ['Now', 'Mid', 'End'];

  return (
    <Svg width={width} height={height}>
      {/* Grid */}
      {yTicks.map((v, i) => (
        <React.Fragment key={i}>
          <Line
            x1={PAD.left} y1={yp(v)}
            x2={PAD.left + W} y2={yp(v)}
            stroke="rgba(255,255,255,0.05)" strokeWidth={1}
          />
          <SvgText x={PAD.left - 4} y={yp(v) + 4} fontSize={8} fill={MUTED} textAnchor="end" fontFamily={mono}>
            {Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v.toFixed(0)}
          </SvgText>
        </React.Fragment>
      ))}

      {/* Outer band p10–p90 */}
      <Path d={bandPath(data.p90, data.p10)} fill={color} fillOpacity={0.07} stroke="none" />
      {/* Inner band p25–p75 */}
      <Path d={bandPath(data.p75, data.p25)} fill={color} fillOpacity={0.15} stroke="none" />
      {/* Median line p50 */}
      <Polyline points={linePts(data.p50)} fill="none" stroke={color} strokeWidth={1.8} />

      {/* X labels */}
      {xTick.map((ti, li) => (
        <SvgText key={li} x={xp(ti)} y={height - 5} fontSize={8} fill={MUTED} textAnchor="middle" fontFamily={mono}>
          {xLabel[li]}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Asset chip ────────────────────────────────────────────────────────────────
function AssetChip({
  asset,
  onRemove,
}: {
  asset: ComparisonAsset;
  onRemove: () => void;
}) {
  return (
    <View style={ch.chip}>
      <View style={[ch.dot, { backgroundColor: ASSET_CLASS_COLORS[asset.asset_class] }]} />
      <Text style={ch.sym}>{asset.symbol}</Text>
      <Pressable onPress={onRemove} hitSlop={8}>
        <MaterialCommunityIcons name="close-circle" size={14} color={MUTED} />
      </Pressable>
    </View>
  );
}

const ch = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CARD2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: BORDER,
  },
  dot:  { width: 6, height: 6, borderRadius: 3 },
  sym:  { color: TXT, fontSize: 13, fontWeight: '700', fontFamily: mono },
});

// ── Metric cell ───────────────────────────────────────────────────────────────
function MetricRow({
  label,
  values,
  format = 'pct',
  lowerIsBetter = false,
}: {
  label: string;
  values: (number | undefined)[];
  format?: 'pct' | 'num' | 'raw';
  lowerIsBetter?: boolean;
}) {
  const defined = values.filter((v): v is number => v !== undefined);
  const best = defined.length
    ? lowerIsBetter
      ? Math.min(...defined)
      : Math.max(...defined)
    : undefined;

  const display = (v: number | undefined) => {
    if (v === undefined) return '—';
    if (format === 'pct') return fmtPct(v);
    if (format === 'num') return fmtNum(v);
    return fmt(v, 2);
  };

  return (
    <View style={mr.row}>
      <Text style={mr.label}>{label}</Text>
      {values.map((v, i) => {
        const isBest = v !== undefined && v === best;
        return (
          <Text
            key={i}
            style={[mr.val, { color: SERIES_COLORS[i] ?? TXT }, isBest && mr.best]}
          >
            {display(v)}
          </Text>
        );
      })}
    </View>
  );
}

const mr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  label: { flex: 1.4, fontSize: 12, color: MUTED, fontFamily: mono },
  val:   { flex: 1, textAlign: 'right', fontSize: 12, fontFamily: mono },
  best:  { fontWeight: '700' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function CompareScreen() {
  const insets = useSafeAreaInsets();

  const {
    scenarios, isLoadingList, activeRun, isRunning, runError,
    create, remove, run, clearRun, refreshList,
  } = useScenario();

  const { profile, isLoading: profileLoading, rebuild: rebuildProfile } = useBehavioralProfile();

  const [activeTab, setActiveTab] = useState<InternalTab>('builder');

  // ── Builder form state ────────────────────────────────────────────────────
  const [scenarioName,    setScenarioName]   = useState('My Scenario');
  const [selectedAssets,  setSelectedAssets] = useState<ComparisonAsset[]>([]);
  const [assetSearch,     setAssetSearch]    = useState('');
  const [searchResults,   setSearchResults]  = useState<ComparisonAsset[]>([]);
  const [isSearching,     setIsSearching]    = useState(false);
  const [showSearch,      setShowSearch]     = useState(false);

  const [periodMonths,    setPeriodMonths]   = useState(36);
  const [rebalancing,     setRebalancing]    = useState<RebalancingStrategy>('hold');
  const [applyBehavioral, setApplyBehavioral] = useState(true);
  const [applyDividends,  setApplyDividends]  = useState(true);
  const [runMonteCarlo,   setRunMonteCarlo]   = useState(false);
  const [monthlySavings,  setMonthlySavings]  = useState('1000');

  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Asset search ──────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    setIsSearching(true);
    try { setSearchResults(await searchAssets(q)); }
    catch { setSearchResults([]); }
    finally { setIsSearching(false); }
  }, []);

  const onSearchChange = (q: string) => {
    setAssetSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(q), 350);
  };

  // Load featured assets the moment the search box opens
  const openSearch = () => {
    setShowSearch(true);
    if (searchResults.length === 0 && !assetSearch) doSearch('');
  };

  const pickAsset = (asset: ComparisonAsset) => {
    if (selectedAssets.length >= 5) {
      Alert.alert('Limit reached', 'You can compare up to 5 assets at a time.');
      return;
    }
    if (!selectedAssets.find(a => a.symbol === asset.symbol)) {
      setSelectedAssets(prev => [...prev, asset]);
    }
    // Keep search open so the user can immediately add the next asset
    setAssetSearch('');
    setSearchResults([]);
  };

  const removeAsset = (symbol: string) => {
    setSelectedAssets(prev => prev.filter(a => a.symbol !== symbol));
  };

  // ── Run scenario ──────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (!selectedAssets.length) {
      Alert.alert('No assets', 'Pick at least one comparison asset.');
      return;
    }

    clearRun();

    const now     = new Date();
    const pStart  = periodMonths > 0 ? isoDate(addMonths(now, -periodMonths)) : null;
    const pEnd    = isoDate(now);

    try {
      const scenario = await create({
        name:                       scenarioName || 'Unnamed Scenario',
        description:                null,
        comparison_assets:          selectedAssets.map(a => a.symbol),
        period_start:               pStart,
        period_end:                 pEnd,
        initial_capital:            null,
        currency:                   'USD',
        rebalancing_strategy:       rebalancing,
        apply_behavioral_adjustment: applyBehavioral,
        apply_dividend_reinvestment: applyDividends,
        apply_tax_simulation:       false,
        run_monte_carlo:            runMonteCarlo,
        is_bookmarked:              false,
      });

      setActiveScenarioId(scenario.id);
      setActiveTab('results');
      await run(scenario.id, Number(monthlySavings) || 1000);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create scenario');
    }
  }, [selectedAssets, scenarioName, periodMonths, rebalancing, applyBehavioral, applyDividends, runMonteCarlo, monthlySavings, create, run, clearRun]);

  // ── Results data ──────────────────────────────────────────────────────────
  const results: ScenarioResults | null = activeRun?.results ?? null;

  const seriesKeys = useMemo(() => {
    if (!results?.timeseries?.length) return [];
    const pt = results.timeseries[0];
    return Object.keys(pt).filter(k => k !== 'date') as string[];
  }, [results]);

  const metricKeys = useMemo(() => {
    if (!results?.metrics) return [];
    return Object.keys(results.metrics);
  }, [results]);

  // ── Rebalancing picker ────────────────────────────────────────────────────
  const REBAL_OPTIONS = Object.entries(REBALANCING_LABELS) as [RebalancingStrategy, string][];

  // ── Layout dims (lazy) ────────────────────────────────────────────────────
  const [chartWidth, setChartWidth] = useState(320);

  // ── Render tabs ───────────────────────────────────────────────────────────
  const renderBuilder = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={sc.scrollContent} showsVerticalScrollIndicator={false}>

      {/* Scenario name */}
      <View style={sc.formGroup}>
        <Text style={sc.label}>Scenario Name</Text>
        <TextInput
          style={sc.input}
          value={scenarioName}
          onChangeText={setScenarioName}
          placeholder="e.g. What if I bought QQQ?"
          placeholderTextColor={MUTED}
        />
      </View>

      {/* Asset picker */}
      <View style={sc.formGroup}>
        <View style={sc.rowBetween}>
          <Text style={sc.label}>Compare Against ({selectedAssets.length}/5)</Text>
          <Pressable onPress={showSearch ? () => { setShowSearch(false); setSearchResults([]); setAssetSearch(''); } : openSearch} style={sc.addBtn}>
            <MaterialCommunityIcons name={showSearch ? 'close' : 'plus'} size={16} color={CYAN} />
            <Text style={sc.addBtnTxt}>{showSearch ? 'Cancel' : 'Add'}</Text>
          </Pressable>
        </View>

        {showSearch && (
          <View style={sc.searchBox}>
            <MaterialCommunityIcons name="magnify" size={16} color={MUTED} style={{ marginRight: 8 }} />
            <TextInput
              style={sc.searchInput}
              value={assetSearch}
              onChangeText={onSearchChange}
              placeholder="Search symbol or name…"
              placeholderTextColor={MUTED}
              autoFocus
            />
            {isSearching && <ActivityIndicator size="small" color={CYAN} />}
          </View>
        )}

        {searchResults.length > 0 && (
          <View style={sc.searchResults}>
            {searchResults.slice(0, 8).map(a => (
              <Pressable key={a.symbol} style={sc.searchRow} onPress={() => pickAsset(a)}>
                <View style={[sc.classTag, { backgroundColor: ASSET_CLASS_COLORS[a.asset_class] + '22', borderColor: ASSET_CLASS_COLORS[a.asset_class] + '55' }]}>
                  <Text style={[sc.classTagTxt, { color: ASSET_CLASS_COLORS[a.asset_class] }]}>{a.asset_class}</Text>
                </View>
                <Text style={sc.searchSym}>{a.symbol}</Text>
                <Text style={sc.searchName} numberOfLines={1}>{a.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={sc.chips}>
          {selectedAssets.map(a => (
            <AssetChip key={a.symbol} asset={a} onRemove={() => removeAsset(a.symbol)} />
          ))}
          {selectedAssets.length === 0 && (
            <Text style={sc.placeholder}>No assets selected — tap Add to search</Text>
          )}
        </View>
      </View>

      {/* Period */}
      <View style={sc.formGroup}>
        <Text style={sc.label}>Lookback Period</Text>
        <View style={sc.periodRow}>
          {PERIOD_PRESETS.map(p => (
            <Pressable
              key={p.label}
              style={[sc.periodBtn, periodMonths === p.months && sc.periodBtnActive]}
              onPress={() => setPeriodMonths(p.months)}
            >
              <Text style={[sc.periodBtnTxt, periodMonths === p.months && sc.periodBtnTxtActive]}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Rebalancing */}
      <View style={sc.formGroup}>
        <Text style={sc.label}>Rebalancing Strategy</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {REBAL_OPTIONS.map(([key, lbl]) => (
              <Pressable
                key={key}
                style={[sc.rebalBtn, rebalancing === key && sc.rebalBtnActive]}
                onPress={() => setRebalancing(key)}
              >
                <Text style={[sc.rebalBtnTxt, rebalancing === key && sc.rebalBtnTxtActive]}>
                  {lbl}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Toggles */}
      <View style={sc.formGroup}>
        <Text style={sc.label}>Simulation Settings</Text>
        {([
          ['Behavioral Adjustment (BACS)', applyBehavioral, setApplyBehavioral],
          ['Dividend Reinvestment', applyDividends, setApplyDividends],
          ['Monte Carlo Simulation', runMonteCarlo, setRunMonteCarlo],
        ] as [string, boolean, React.Dispatch<React.SetStateAction<boolean>>][]).map(([lbl, val, setter]) => (
          <View key={lbl} style={sc.toggleRow}>
            <Text style={sc.toggleLabel}>{lbl}</Text>
            <Switch
              value={val}
              onValueChange={setter}
              trackColor={{ false: CARD2, true: CYAN + '55' }}
              thumbColor={val ? CYAN : MUTED}
            />
          </View>
        ))}
        <View style={sc.formGroup}>
          <Text style={sc.label}>Monthly Savings Assumption (USD)</Text>
          <TextInput
            style={sc.input}
            value={monthlySavings}
            onChangeText={setMonthlySavings}
            keyboardType="numeric"
            placeholder="1000"
            placeholderTextColor={MUTED}
          />
        </View>
      </View>

      {/* Run button */}
      <Pressable
        style={({ pressed }) => [sc.runBtn, pressed && sc.runBtnPressed, isRunning && sc.runBtnDisabled]}
        onPress={handleRun}
        disabled={isRunning}
      >
        {isRunning ? (
          <ActivityIndicator color={BG} />
        ) : (
          <>
            <MaterialCommunityIcons name="play-circle" size={20} color={BG} />
            <Text style={sc.runBtnTxt}>Run Simulation</Text>
          </>
        )}
      </Pressable>

      {/* Saved scenarios */}
      {scenarios.length > 0 && (
        <View style={sc.formGroup}>
          <Text style={sc.label}>Saved Scenarios</Text>
          {scenarios.map(s => (
            <View key={s.id} style={sc.savedRow}>
              <View style={{ flex: 1 }}>
                <Text style={sc.savedName}>{s.name}</Text>
                <Text style={sc.savedSub}>{s.comparison_assets.join(', ')}</Text>
              </View>
              <Pressable
                style={sc.savedRunBtn}
                onPress={async () => {
                  setActiveScenarioId(s.id);
                  setActiveTab('results');
                  clearRun();
                  await run(s.id, 1000);
                }}
              >
                <MaterialCommunityIcons name="play" size={16} color={CYAN} />
              </Pressable>
              <Pressable onPress={() => remove(s.id)} hitSlop={8} style={{ marginLeft: 8 }}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color={MUTED} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 120 }} />
    </ScrollView>
  );

  const renderResults = () => {
    if (!activeRun && !isRunning) {
      return (
        <View style={sc.empty}>
          <MaterialCommunityIcons name="chart-multiple" size={48} color={MUTED} />
          <Text style={sc.emptyTxt}>Run a scenario to see results</Text>
        </View>
      );
    }

    if (isRunning && !results) {
      return (
        <View style={sc.empty}>
          <ActivityIndicator size="large" color={CYAN} />
          <Text style={sc.emptyTxt}>
            {activeRun?.status === 'queued' ? 'Queued…' : 'Simulating…'}
          </Text>
          <Text style={sc.emptySubTxt}>This may take 10–30 seconds</Text>
        </View>
      );
    }

    if (runError) {
      return (
        <View style={sc.empty}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color={RED} />
          <Text style={[sc.emptyTxt, { color: RED }]}>{runError}</Text>
        </View>
      );
    }

    if (!results) return null;

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={sc.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Data quality */}
        <View style={sc.qualityRow}>
          <MaterialCommunityIcons name="shield-check" size={14} color={GREEN} />
          <Text style={sc.qualityTxt}>
            Data quality: {(results.data_quality_score * 100).toFixed(0)}% ·{' '}
            {results.computation_ms}ms
          </Text>
        </View>

        {/* Legend */}
        <View style={sc.legend}>
          {seriesKeys.map((key, i) => (
            <View key={key} style={sc.legendItem}>
              <View style={[sc.legendDot, { backgroundColor: SERIES_COLORS[i] ?? MUTED }]} />
              <Text style={sc.legendTxt}>{key === 'actual' ? 'Your Portfolio' : key.replace(/_/g, ' ')}</Text>
            </View>
          ))}
        </View>

        {/* Chart */}
        <View
          style={sc.chartWrap}
          onLayout={e => setChartWidth(e.nativeEvent.layout.width)}
        >
          <ComparisonChart
            timeseries={results.timeseries}
            seriesKeys={seriesKeys}
            width={chartWidth}
            height={240}
          />
        </View>

        {/* Metrics table */}
        <View style={sc.metricsCard}>
          {/* Header row */}
          <View style={mr.row}>
            <Text style={[mr.label, { color: TXT, fontWeight: '700' }]}>Metric</Text>
            {metricKeys.map((k, i) => (
              <Text key={k} style={[mr.val, { color: SERIES_COLORS[i] ?? TXT, fontWeight: '700' }]}>
                {k === 'actual' ? 'Portfolio' : k.split('_')[0]}
              </Text>
            ))}
          </View>

          {([
            ['Total Return',   'total_return',  'pct', false],
            ['CAGR',          'cagr',          'pct', false],
            ['Volatility',    'volatility',    'pct', true ],
            ['Sharpe',        'sharpe',        'raw', false],
            ['Sortino',       'sortino',       'raw', false],
            ['Max Drawdown',  'max_drawdown',  'pct', true ],
            ['VaR 95%',       'var_95',        'pct', true ],
            ['Win Rate',      'win_rate',      'pct', false],
            ['End Value',     'end_value',     'num', false],
          ] as [string, keyof AssetMetrics, 'pct' | 'num' | 'raw', boolean][]).map(([lbl, key, fmt, lower]) => (
            <MetricRow
              key={key}
              label={lbl}
              values={metricKeys.map(mk => results.metrics[mk]?.[key] as number | undefined)}
              format={fmt}
              lowerIsBetter={lower}
            />
          ))}
        </View>

        {/* TOI banner */}
        {results.temporal_opportunity && (
          <View style={sc.toiCard}>
            <View style={sc.toiHeader}>
              <MaterialCommunityIcons name="clock-fast" size={18} color={PURPLE} />
              <Text style={sc.toiTitle}>Temporal Opportunity Index</Text>
            </View>
            {results.temporal_opportunity.best_alternative && (
              <View style={sc.toiBest}>
                <Text style={sc.toiBestLbl}>Best Alternative</Text>
                <Text style={sc.toiBestVal}>{results.temporal_opportunity.best_alternative}</Text>
              </View>
            )}
            <View style={sc.toiRow}>
              <View style={sc.toiStat}>
                <Text style={sc.toiStatVal}>{fmtNum(results.temporal_opportunity.best_dollar_gap)}</Text>
                <Text style={sc.toiStatLbl}>Dollar Gap</Text>
              </View>
              {Object.entries(results.temporal_opportunity.alternatives).slice(0, 3).map(([sym, alt]) => (
                <View key={sym} style={sc.toiStat}>
                  <Text style={[sc.toiStatVal, { color: alt.outperformed ? RED : GREEN }]}>
                    {alt.months_to_recover > 0 ? `${alt.months_to_recover}mo` : '—'}
                  </Text>
                  <Text style={sc.toiStatLbl}>{sym} recover</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Monte Carlo fan charts */}
        {results.monte_carlo && Object.keys(results.monte_carlo).length > 0 && (
          <View style={sc.mcCard}>
            <View style={sc.mcHeader}>
              <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={18} color={AMBER} />
              <Text style={sc.mcTitle}>Monte Carlo Projection</Text>
            </View>
            <Text style={sc.mcSub}>
              Shaded bands show the 10th–90th (outer) and 25th–75th (inner) percentile
              range of simulated outcomes. The solid line is the median (p50).
            </Text>

            {Object.entries(results.monte_carlo).map(([key, fan], si) => {
              const color  = SERIES_COLORS[si] ?? MUTED;
              const label  = key === 'actual' ? 'Your Portfolio' : key.replace(/_/g, ' ');
              const endP10 = fan.p10[fan.p10.length - 1];
              const endP50 = fan.p50[fan.p50.length - 1];
              const endP90 = fan.p90[fan.p90.length - 1];
              return (
                <View key={key} style={sc.mcAsset}>
                  {/* Asset label + colour dot */}
                  <View style={sc.mcAssetHeader}>
                    <View style={[sc.mcDot, { backgroundColor: color }]} />
                    <Text style={[sc.mcAssetLabel, { color }]}>{label}</Text>
                  </View>

                  {/* Fan chart */}
                  <View
                    style={sc.mcChartWrap}
                    onLayout={e => setChartWidth(e.nativeEvent.layout.width)}
                  >
                    <MonteCarloFanChart data={fan} color={color} width={chartWidth - 32} />
                  </View>

                  {/* End-value percentile row */}
                  <View style={sc.mcEndRow}>
                    {([['p10', endP10, RED], ['p50', endP50, color], ['p90', endP90, GREEN]] as [string, number, string][]).map(
                      ([pct, val, clr]) => (
                        <View key={pct} style={sc.mcEndCell}>
                          <Text style={[sc.mcEndVal, { color: clr }]}>{fmtNum(val)}</Text>
                          <Text style={sc.mcEndLbl}>{pct.toUpperCase()}</Text>
                        </View>
                      ),
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    );
  };

  const renderDecisions = () => {
    const inflections = results?.inflection_points;

    if (!inflections?.length) {
      return (
        <View style={sc.empty}>
          <MaterialCommunityIcons name="sitemap" size={48} color={MUTED} />
          <Text style={sc.emptyTxt}>
            {results ? 'No significant decision nodes found' : 'Run a scenario first'}
          </Text>
        </View>
      );
    }

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={sc.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={sc.sectionTitle}>Top Decision Impact Nodes</Text>
        <Text style={sc.sectionSub}>
          Each node shows a real trade and what would have happened in each alternative asset over 30 days.
        </Text>

        {inflections.map((node, i) => {
          const isBuy  = node.transaction_type === 'buy';
          const impact = node.impact_score;
          return (
            <View key={i} style={sc.decisionCard}>
              <View style={sc.decisionTop}>
                <View style={[sc.decisionTypePill, { backgroundColor: isBuy ? GREEN + '22' : RED + '22' }]}>
                  <MaterialCommunityIcons
                    name={isBuy ? 'arrow-up-circle' : 'arrow-down-circle'}
                    size={14}
                    color={isBuy ? GREEN : RED}
                  />
                  <Text style={[sc.decisionType, { color: isBuy ? GREEN : RED }]}>
                    {node.transaction_type.toUpperCase()}
                  </Text>
                </View>
                <Text style={sc.decisionSym}>{node.symbol}</Text>
                <Text style={sc.decisionDate}>{node.date?.slice(0, 10)}</Text>
                <View style={sc.impactBadge}>
                  <Text style={sc.impactTxt}>Impact {fmt(impact, 1)}</Text>
                </View>
              </View>

              <View style={sc.decisionDeltas}>
                <View style={sc.deltaItem}>
                  <Text style={sc.deltaLbl}>Actual 30d</Text>
                  <Text style={[sc.deltaVal, { color: node.actual_delta_30d >= 0 ? GREEN : RED }]}>
                    {fmtPct(node.actual_delta_30d)}
                  </Text>
                </View>
                {Object.entries(node.alt_deltas_30d).slice(0, 4).map(([sym, delta]) => (
                  <View key={sym} style={sc.deltaItem}>
                    <Text style={sc.deltaLbl}>{sym}</Text>
                    <Text style={[sc.deltaVal, { color: delta >= 0 ? GREEN : RED }]}>
                      {fmtPct(delta)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <View style={{ height: 120 }} />
      </ScrollView>
    );
  };

  const renderProfile = () => {
    if (profileLoading) {
      return <View style={sc.empty}><ActivityIndicator color={CYAN} /></View>;
    }

    if (!profile) {
      return (
        <View style={sc.empty}>
          <MaterialCommunityIcons name="brain" size={48} color={MUTED} />
          <Text style={sc.emptyTxt}>No behavioral profile yet</Text>
          <Text style={sc.emptySubTxt}>Connect an account and add transactions to build your profile</Text>
          <Pressable style={sc.buildBtn} onPress={rebuildProfile}>
            <Text style={sc.buildBtnTxt}>Build Profile</Text>
          </Pressable>
        </View>
      );
    }

    const p = profile;
    const confidenceColor: Record<string, string> = {
      high: GREEN, medium: CYAN, low: AMBER, insufficient: MUTED,
    };

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={sc.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={sc.profileHeader}>
          <View>
            <Text style={sc.profileTitle}>Behavioral Transaction Fingerprint</Text>
            <Text style={sc.profileSub}>Derived from your actual trade history — no questionnaire</Text>
          </View>
          <View style={[sc.confidencePill, { borderColor: confidenceColor[p.profile_confidence] + '55' }]}>
            <Text style={[sc.confidenceTxt, { color: confidenceColor[p.profile_confidence] }]}>
              {p.profile_confidence.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Score meters */}
        <View style={sc.metersGrid}>
          {([
            ['Loss Aversion',    p.loss_aversion_score,    0, 1,  RED,    'Higher = more loss averse'],
            ['Timing Quality',   p.timing_quality_score,   -1, 1, GREEN,  'Positive = good timing'],
            ['Concentration',    p.concentration_score,    0, 1,  AMBER,  'Higher = more concentrated'],
          ] as [string, number, number, number, string, string][]).map(([lbl, val, min, max, clr, hint]) => {
            const pct = Math.max(0, Math.min(1, (val - min) / (max - min))) * 100;
            return (
              <View key={lbl} style={sc.meter}>
                <Text style={sc.meterLabel}>{lbl}</Text>
                <View style={sc.meterBar}>
                  <View style={[sc.meterFill, { width: `${pct}%` as any, backgroundColor: clr }]} />
                </View>
                <Text style={[sc.meterVal, { color: clr }]}>{fmt(val, 2)}</Text>
                <Text style={sc.meterHint}>{hint}</Text>
              </View>
            );
          })}
        </View>

        {/* Stats */}
        <View style={sc.statsGrid}>
          {([
            ['Avg Hold',       p.avg_holding_days != null ? `${Math.round(p.avg_holding_days)}d` : '—'],
            ['Median Hold',    p.median_holding_days != null ? `${Math.round(p.median_holding_days)}d` : '—'],
            ['Panic Sell 10%', `${(p.panic_sell_probability_10 * 100).toFixed(0)}%`],
            ['Panic Sell 20%', `${(p.panic_sell_probability_20 * 100).toFixed(0)}%`],
            ['Buy the Dip',    `${(p.buy_dip_probability * 100).toFixed(0)}%`],
            ['# Trades',       String(p.transaction_count)],
          ] as [string, string][]).map(([lbl, val]) => (
            <View key={lbl} style={sc.statCard}>
              <Text style={sc.statVal}>{val}</Text>
              <Text style={sc.statLbl}>{lbl}</Text>
            </View>
          ))}
        </View>

        <Pressable style={sc.rebuildBtn} onPress={rebuildProfile}>
          <MaterialCommunityIcons name="refresh" size={16} color={CYAN} />
          <Text style={sc.rebuildBtnTxt}>Rebuild Profile</Text>
        </Pressable>

        {/* TOI from results */}
        {results?.temporal_opportunity && (
          <>
            <Text style={[sc.sectionTitle, { marginTop: 24 }]}>Temporal Opportunity Index</Text>
            {Object.entries(results.temporal_opportunity.alternatives).map(([sym, alt]) => (
              <View key={sym} style={sc.toiAltRow}>
                <Text style={sc.toiAltSym}>{sym}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[sc.toiAltDelta, { color: alt.outperformed ? RED : GREEN }]}>
                    {fmtPct(alt.pct_gap)} gap
                  </Text>
                  <Text style={sc.toiAltRecover}>
                    {alt.months_to_recover > 0 ? `${alt.months_to_recover} months to recover` : 'Already ahead'}
                  </Text>
                </View>
                <Text style={sc.toiAltDollar}>{fmtNum(alt.dollar_gap)}</Text>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[sc.root, { paddingTop: insets.top }]}
    >
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Header */}
      <View style={sc.header}>
        <View>
          <Text style={sc.headerTitle}>COMPARE</Text>
          <Text style={sc.headerSub}>Counterfactual Intelligence Engine</Text>
        </View>
        {isRunning && (
          <View style={sc.runningPill}>
            <ActivityIndicator size="small" color={CYAN} />
            <Text style={sc.runningTxt}>Simulating…</Text>
          </View>
        )}
      </View>

      {/* Tab bar */}
      <View style={sc.tabBar}>
        {TABS.map(t => {
          const active = activeTab === t.key;
          const hasData =
            (t.key === 'results' && !!results) ||
            (t.key === 'decisions' && !!results?.inflection_points?.length) ||
            (t.key === 'profile' && !!profile) ||
            t.key === 'builder';
          return (
            <Pressable
              key={t.key}
              style={[sc.tabItem, active && sc.tabItemActive]}
              onPress={() => setActiveTab(t.key)}
            >
              <MaterialCommunityIcons
                name={t.icon as any}
                size={16}
                color={active ? CYAN : MUTED}
              />
              <Text style={[sc.tabLabel, active && sc.tabLabelActive]}>{t.label}</Text>
              {hasData && t.key !== 'builder' && !active && (
                <View style={sc.tabDot} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'builder'   && renderBuilder()}
        {activeTab === 'results'   && renderResults()}
        {activeTab === 'decisions' && renderDecisions()}
        {activeTab === 'profile'   && renderProfile()}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  root:  { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  headerTitle: { color: CYAN,  fontSize: 18, fontWeight: '900', fontFamily: mono, letterSpacing: 2 },
  headerSub:   { color: MUTED, fontSize: 11, fontFamily: mono, marginTop: 2 },

  runningPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CARD2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: CYAN + '33',
  },
  runningTxt: { color: CYAN, fontSize: 12, fontFamily: mono },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  tabItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 3, position: 'relative',
  },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: CYAN },
  tabLabel:      { fontSize: 10, color: MUTED, fontFamily: mono },
  tabLabelActive: { color: CYAN },
  tabDot: {
    position: 'absolute', top: 6, right: '30%',
    width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN,
  },

  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  formGroup: { marginBottom: 20 },
  label:     { color: MUTED, fontSize: 11, fontFamily: mono, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  input: {
    backgroundColor: CARD, color: TXT, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontFamily: mono,
    borderWidth: 1, borderColor: BORDER,
  },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CYAN + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  addBtnTxt:  { color: CYAN, fontSize: 13, fontFamily: mono },

  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: BORDER, marginBottom: 8,
  },
  searchInput: { flex: 1, color: TXT, fontSize: 14, fontFamily: mono },
  searchResults: {
    backgroundColor: CARD2, borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: BORDER, marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  classTag: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2 },
  classTagTxt: { fontSize: 9, fontFamily: mono, fontWeight: '700' },
  searchSym:  { color: TXT, fontSize: 13, fontWeight: '700', fontFamily: mono, width: 50 },
  searchName: { flex: 1, color: MUTED, fontSize: 12 },

  chips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  placeholder: { color: MUTED, fontSize: 13, fontStyle: 'italic' },

  periodRow: { flexDirection: 'row', gap: 8 },
  periodBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
  },
  periodBtnActive: { backgroundColor: CYAN + '20', borderColor: CYAN },
  periodBtnTxt:    { color: MUTED, fontSize: 13, fontFamily: mono },
  periodBtnTxtActive: { color: CYAN, fontWeight: '700' },

  rebalBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
  },
  rebalBtnActive: { backgroundColor: CYAN + '20', borderColor: CYAN },
  rebalBtnTxt: { color: MUTED, fontSize: 11, fontFamily: mono },
  rebalBtnTxtActive: { color: CYAN },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  toggleLabel: { color: TXT, fontSize: 14, flex: 1 },

  runBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: CYAN, borderRadius: 14, paddingVertical: 16,
    marginBottom: 24,
  },
  runBtnPressed:  { opacity: 0.8 },
  runBtnDisabled: { opacity: 0.5 },
  runBtnTxt: { color: BG, fontSize: 16, fontWeight: '800', fontFamily: mono },

  savedRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: BORDER,
  },
  savedName: { color: TXT, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  savedSub:  { color: MUTED, fontSize: 12, fontFamily: mono },
  savedRunBtn: {
    backgroundColor: CYAN + '20', borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: CYAN + '44',
  },

  // Results
  qualityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 12,
  },
  qualityTxt: { color: MUTED, fontSize: 12, fontFamily: mono },

  legend:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendTxt:  { color: MUTED, fontSize: 11, fontFamily: mono },

  chartWrap: {
    backgroundColor: CARD, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: BORDER, marginBottom: 16, padding: 8,
  },

  metricsCard: {
    backgroundColor: CARD, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, padding: 16,
    marginBottom: 16,
  },

  toiCard: {
    backgroundColor: PURPLE + '10', borderRadius: 14,
    borderWidth: 1, borderColor: PURPLE + '30', padding: 16, marginBottom: 16,
  },
  toiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  toiTitle:  { color: PURPLE, fontSize: 14, fontWeight: '700', fontFamily: mono },
  toiBest:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  toiBestLbl: { color: MUTED, fontSize: 12 },
  toiBestVal: { color: TXT, fontSize: 14, fontWeight: '700', fontFamily: mono },
  toiRow:    { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  toiStat:   { alignItems: 'center' },
  toiStatVal: { color: TXT, fontSize: 16, fontWeight: '800', fontFamily: mono },
  toiStatLbl: { color: MUTED, fontSize: 10, marginTop: 2 },

  // Decisions
  sectionTitle: { color: TXT, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  sectionSub:   { color: MUTED, fontSize: 12, marginBottom: 16 },

  decisionCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: BORDER,
  },
  decisionTop:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  decisionTypePill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  decisionType:    { fontSize: 11, fontWeight: '700', fontFamily: mono },
  decisionSym:     { color: TXT, fontSize: 14, fontWeight: '700', fontFamily: mono, flex: 1 },
  decisionDate:    { color: MUTED, fontSize: 11, fontFamily: mono },
  impactBadge: {
    backgroundColor: AMBER + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: AMBER + '44',
  },
  impactTxt: { color: AMBER, fontSize: 10, fontFamily: mono, fontWeight: '700' },

  decisionDeltas: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  deltaItem:      { alignItems: 'center', minWidth: 56 },
  deltaLbl:       { color: MUTED, fontSize: 10, fontFamily: mono, marginBottom: 2 },
  deltaVal:       { fontSize: 13, fontWeight: '700', fontFamily: mono },

  // Behavioral profile
  profileHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 20,
  },
  profileTitle: { color: TXT,  fontSize: 15, fontWeight: '700', flex: 1, marginRight: 12 },
  profileSub:   { color: MUTED, fontSize: 12, marginTop: 3 },
  confidencePill: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  confidenceTxt: { fontSize: 10, fontWeight: '800', fontFamily: mono },

  metersGrid: { gap: 14, marginBottom: 20 },
  meter:      { backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER },
  meterLabel: { color: MUTED, fontSize: 11, fontFamily: mono, marginBottom: 8 },
  meterBar:   { height: 6, backgroundColor: CARD2, borderRadius: 3, marginBottom: 6, overflow: 'hidden' },
  meterFill:  { height: '100%', borderRadius: 3 },
  meterVal:   { fontSize: 18, fontWeight: '800', fontFamily: mono, marginBottom: 2 },
  meterHint:  { color: MUTED, fontSize: 10 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    backgroundColor: CARD, borderRadius: 12, padding: 14, minWidth: '30%', flex: 1,
    borderWidth: 1, borderColor: BORDER, alignItems: 'center',
  },
  statVal: { color: CYAN, fontSize: 20, fontWeight: '800', fontFamily: mono, marginBottom: 2 },
  statLbl: { color: MUTED, fontSize: 10, fontFamily: mono, textAlign: 'center' },

  rebuildBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: CYAN + '15', borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: CYAN + '33', marginBottom: 24,
  },
  rebuildBtnTxt: { color: CYAN, fontSize: 14, fontFamily: mono },

  buildBtn: {
    backgroundColor: CYAN, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28,
    marginTop: 20,
  },
  buildBtnTxt: { color: BG, fontSize: 14, fontWeight: '800', fontFamily: mono, textAlign: 'center' },

  toiAltRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: BORDER,
  },
  toiAltSym:     { color: TXT, fontSize: 14, fontWeight: '700', fontFamily: mono, width: 60 },
  toiAltDelta:   { fontSize: 13, fontWeight: '700', fontFamily: mono },
  toiAltRecover: { color: MUTED, fontSize: 11, marginTop: 2 },
  toiAltDollar:  { color: TXT, fontSize: 14, fontFamily: mono, fontWeight: '600' },

  // Monte Carlo
  mcCard: {
    backgroundColor: AMBER + '0D', borderRadius: 14,
    borderWidth: 1, borderColor: AMBER + '30', padding: 16, marginBottom: 16,
  },
  mcHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  mcTitle:  { color: AMBER, fontSize: 14, fontWeight: '700', fontFamily: mono },
  mcSub:    { color: MUTED, fontSize: 11, marginBottom: 16, lineHeight: 16 },

  mcAsset:       { marginBottom: 20 },
  mcAssetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  mcDot:         { width: 8, height: 8, borderRadius: 4 },
  mcAssetLabel:  { fontSize: 12, fontWeight: '700', fontFamily: mono },
  mcChartWrap:   { marginBottom: 8 },

  mcEndRow:  { flexDirection: 'row', gap: 8 },
  mcEndCell: {
    flex: 1, alignItems: 'center',
    backgroundColor: CARD2, borderRadius: 8, paddingVertical: 8,
    borderWidth: 1, borderColor: BORDER,
  },
  mcEndVal: { fontSize: 13, fontWeight: '800', fontFamily: mono },
  mcEndLbl: { color: MUTED, fontSize: 9, fontFamily: mono, marginTop: 2 },

  // Empty states
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40,
  },
  emptyTxt:    { color: MUTED, fontSize: 15, textAlign: 'center' },
  emptySubTxt: { color: MUTED, fontSize: 12, textAlign: 'center' },
});

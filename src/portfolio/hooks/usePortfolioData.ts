import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useConnectionStore } from '@/src/store/useConnectionStore';
import { autoTriggerDataset } from '@/src/services/mlPipeline';
import {
  SP500, getUnits, getTicker, getCurrency, getCategory,
  filterByPeriod, normalize100, computeRiskMetrics,
} from '../helpers';
import { HoldingsData, Snapshot, Period, AllocSeg, PerformerItem } from '../types';
import { PURPLE, BLUE, ORANGE, TEAL } from '../tokens';

export interface PortfolioDataResult {
  holdings: HoldingsData | null;
  snapshots: Snapshot[];
  loading: boolean;
  refreshing: boolean;
  connected: boolean;
  userName: string;
  lastUpdated: Date | null;
  period: Period;
  setPeriod: (p: Period) => void;
  headerAnim: Animated.Value;
  onRefresh: () => Promise<void>;
  positions: NonNullable<HoldingsData['positions']>;
  balances: NonNullable<HoldingsData['balances']>;
  currency: string;
  cash: number;
  totalPos: number;
  totalVal: number;
  totalPnl: number;
  filteredSnaps: Snapshot[];
  snapValues: number[];
  benchValues: number[];
  chartPortfolio: number[];
  chartBench: number[];
  periodReturn: number;
  sp500Return: number;
  vsMarket: number;
  dailyReturns: number[];
  todayChange: number;
  todayChangePct: number;
  allocSegs: AllocSeg[];
  performers: { top: PerformerItem[]; bottom: PerformerItem[] };
  risk: ReturnType<typeof computeRiskMetrics>;
  chartLabels: string[];
  fetchError: string | null;
}

// ── Query key factory ─────────────────────────────────────────────────────────
export const portfolioKeys = {
  connections: (uid: string) => ['portfolio', uid, 'connections']  as const,
  snapshots:   (uid: string) => ['portfolio', uid, 'snapshots']    as const,
  manual:      (uid: string) => ['portfolio', uid, 'manual']       as const,
};

// ── Types for query return values ─────────────────────────────────────────────
interface ConnectionSources {
  hasSnaptrade: boolean;
  hasExchange:  boolean;
  hasManual:    boolean;
}

interface SnapshotData {
  latest:      HoldingsData | null;
  history:     Snapshot[];
  lastUpdated: Date | null;
}

// ── Pure fetch functions (called by React Query) ──────────────────────────────

async function fetchConnections(userId: string): Promise<ConnectionSources> {
  const [snapRes, exchRes, posRes] = await Promise.all([
    supabase
      .from('snaptrade_connections')
      .select('account_id')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('exchange_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('user_positions')
      .select('id', { count: 'exact', head: true }),
  ]);
  return {
    hasSnaptrade: !!snapRes.data?.account_id,
    hasExchange:  !!exchRes.data?.id,
    hasManual:    (posRes.count ?? 0) > 0,
  };
}

async function fetchSnapshots(userId: string): Promise<SnapshotData> {
  const [latestRes, histRes] = await Promise.all([
    supabase
      .from('portfolio_snapshots')
      .select('snapshot, captured_at')
      .eq('user_id', userId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('portfolio_snapshots')
      .select('snapshot, captured_at')
      .eq('user_id', userId)
      .order('captured_at', { ascending: true })
      .limit(90),
  ]);
  return {
    latest:      (latestRes.data?.snapshot as HoldingsData) ?? null,
    history:     (histRes.data as Snapshot[]) ?? [],
    lastUpdated: latestRes.data ? new Date(latestRes.data.captured_at) : null,
  };
}

async function fetchManualHoldings(): Promise<HoldingsData | null> {
  const { data } = await supabase
    .from('user_positions')
    .select('symbol, name, quantity, avg_cost, asset_class')
    .order('created_at', { ascending: true });

  if (!data?.length) return null;
  return {
    account: { name: 'Manual Portfolio' },
    positions: data.map((p: any) => ({
      symbol:      p.symbol,
      description: p.name ?? p.symbol,
      units:       p.quantity,
      quantity:    p.quantity,
      price:       p.avg_cost ?? 0,
      currency:    'USD',
      type:        p.asset_class ?? 'stock',
      open_pnl:    0,
    })),
    balances: [],
  };
}

// ── Sync trigger (mutation) ───────────────────────────────────────────────────
async function triggerSync(sources: ConnectionSources): Promise<void> {
  if (sources.hasSnaptrade) {
    await supabase.functions.invoke('exchange-plaid-token', {
      body: { action: 'snaptrade_get_holdings' },
    });
  } else if (sources.hasExchange) {
    await supabase.functions.invoke('sync-exchange', {});
  }
  // Manual-only needs no network call — _buildManualHoldings reads the DB directly
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePortfolioData(): PortfolioDataResult {
  const [period,     setPeriod]     = useState<Period>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const headerAnim = useRef(new Animated.Value(0)).current;
  const hasAnimated = useRef(false);

  const { session }            = useAuthStore();
  const { brokerageConnected } = useConnectionStore();
  const userId                 = session?.user?.id ?? null;
  const userName               = (() => {
    const meta = session?.user?.user_metadata;
    return meta?.full_name ?? meta?.name ?? session?.user?.email?.split('@')[0] ?? 'Investor';
  })();

  const queryClient = useQueryClient();

  // ── Query 1: connection sources ───────────────────────────────────────────
  const connectionsQuery = useQuery({
    queryKey: portfolioKeys.connections(userId ?? ''),
    queryFn:  () => fetchConnections(userId!),
    enabled:  !!userId,
    staleTime: 60_000,    // re-check connections every minute
  });

  const sources  = connectionsQuery.data;
  const connected = !!(sources?.hasSnaptrade || sources?.hasExchange || sources?.hasManual);

  // ── Query 2: snapshot history (only when a source exists) ─────────────────
  const snapshotsQuery = useQuery({
    queryKey: portfolioKeys.snapshots(userId ?? ''),
    queryFn:  () => fetchSnapshots(userId!),
    enabled:  !!userId && connected,
    staleTime: 4 * 60_000,
    refetchInterval: connected ? 5 * 60_000 : false,
    // Show previous data while a background refetch is running
    placeholderData: (prev) => prev,
  });

  // ── Query 3: manual holdings (only when manual-only) ─────────────────────
  const manualQuery = useQuery({
    queryKey: portfolioKeys.manual(userId ?? ''),
    queryFn:  fetchManualHoldings,
    enabled:  !!userId && !!(sources?.hasManual && !sources?.hasSnaptrade && !sources?.hasExchange),
    staleTime: 2 * 60_000,
  });

  // ── Sync mutation: triggered when no snapshot exists yet ──────────────────
  const syncMutation = useMutation({
    mutationFn: (src: ConnectionSources) => triggerSync(src),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portfolioKeys.snapshots(userId ?? '') });
      if (userId) autoTriggerDataset(userId);
    },
  });

  // ── Auto-sync on first connection (no snapshot yet) ───────────────────────
  useEffect(() => {
    if (!sources || !userId) return;
    if (!connected) return;
    if (snapshotsQuery.isLoading) return;
    if (snapshotsQuery.data?.latest !== null) return;  // already have data
    if (syncMutation.isPending) return;
    if (sources.hasManual && !sources.hasSnaptrade && !sources.hasExchange) return; // manual needs no sync

    syncMutation.mutate(sources);
  }, [
    connected,
    sources,
    snapshotsQuery.isLoading,
    snapshotsQuery.data?.latest,
    syncMutation.isPending,
    userId,
  ]);

  // ── Header animation: fire once when data arrives ─────────────────────────
  useEffect(() => {
    if (!hasAnimated.current && (snapshotsQuery.data?.latest || manualQuery.data)) {
      hasAnimated.current = true;
      Animated.timing(headerAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }
  }, [snapshotsQuery.data?.latest, manualQuery.data]);

  // ── Re-fetch when SnapTrade brokerage is confirmed connected ──────────────
  useEffect(() => {
    if (brokerageConnected && userId) {
      queryClient.invalidateQueries({ queryKey: portfolioKeys.connections(userId) });
      queryClient.invalidateQueries({ queryKey: portfolioKeys.snapshots(userId) });
    }
  }, [brokerageConnected, userId]);

  // ── Realtime: invalidate snapshot query when a new row is inserted ─────────
  useEffect(() => {
    if (!userId || !connected) return;
    const channel = supabase
      .channel(`portfolio_rt_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'portfolio_snapshots' },
        () => {
          queryClient.invalidateQueries({ queryKey: portfolioKeys.snapshots(userId) });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, connected]);

  // ── Pull-to-refresh ───────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: portfolioKeys.connections(userId ?? '') }),
      queryClient.invalidateQueries({ queryKey: portfolioKeys.snapshots(userId ?? '') }),
      queryClient.invalidateQueries({ queryKey: portfolioKeys.manual(userId ?? '') }),
    ]);
    setRefreshing(false);
  }, [userId, queryClient]);

  // ── Resolve final data ────────────────────────────────────────────────────
  // Priority: snapshot history > manual holdings > null
  const snapshotData = snapshotsQuery.data;
  const holdings: HoldingsData | null =
    snapshotData?.latest ?? manualQuery.data ?? null;
  const snapshots: Snapshot[] = snapshotData?.history ?? [];
  const lastUpdated = snapshotData?.lastUpdated ?? null;

  const fetchError: string | null = (() => {
    if (syncMutation.error) {
      return syncMutation.error instanceof Error
        ? syncMutation.error.message : String(syncMutation.error);
    }
    if (snapshotsQuery.error) {
      return snapshotsQuery.error instanceof Error
        ? snapshotsQuery.error.message : String(snapshotsQuery.error);
    }
    return null;
  })();

  const loading =
    connectionsQuery.isLoading ||
    (connected && snapshotsQuery.isLoading) ||
    syncMutation.isPending;

  // ── Derived calculations (unchanged logic) ────────────────────────────────
  const positions = holdings?.positions ?? [];
  const balances  = holdings?.balances  ?? [];
  const currency  = getCurrency(balances[0]?.currency);
  const cash      = balances.reduce((s, b) => s + (b.cash ?? 0), 0);
  const totalPos  = positions.reduce((s, p) => s + getUnits(p) * (p.price ?? 0), 0);
  const totalVal  = totalPos + cash;
  const totalPnl  = positions.reduce((s, p) => s + (p.open_pnl ?? 0), 0);

  const filteredSnaps = filterByPeriod(snapshots, period);

  const snapValues = filteredSnaps.map(s => {
    const pos = s.snapshot?.positions ?? [];
    const bal = s.snapshot?.balances  ?? [];
    return pos.reduce((sum, p) => sum + getUnits(p) * (p.price ?? 0), 0)
         + bal.reduce((sum, b) => sum + (b.cash ?? 0), 0);
  }).filter(v => v > 0);

  const benchValues = filteredSnaps.map(s => {
    const d   = new Date(s.captured_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return SP500[key] ?? SP500['2025-03'];
  });

  const chartPortfolio = normalize100(snapValues);
  const chartBench     = normalize100(benchValues);

  const periodReturn = chartPortfolio.length >= 2
    ? chartPortfolio[chartPortfolio.length - 1] - chartPortfolio[0] : 0;
  const sp500Return  = chartBench.length >= 2
    ? chartBench[chartBench.length - 1] - chartBench[0] : 0;
  const vsMarket     = periodReturn - sp500Return;

  const dailyReturns: number[] = snapValues.length >= 2
    ? snapValues.slice(1).map((v, i) =>
        snapValues[i] > 0 ? ((v - snapValues[i]) / snapValues[i]) * 100 : 0)
    : [];

  const todayChange    = snapValues.length >= 2
    ? snapValues[snapValues.length - 1] - snapValues[snapValues.length - 2] : 0;
  const todayChangePct = snapValues.length >= 2 && snapValues[snapValues.length - 2] > 0
    ? (todayChange / snapValues[snapValues.length - 2]) * 100 : 0;

  const allocSegs: AllocSeg[] = (() => {
    const b: Record<string, number> = { crypto: 0, equity: 0, etf: 0 };
    positions.forEach(p => {
      const cat = getCategory(getTicker(p.symbol));
      b[cat] += getUnits(p) * (p.price ?? 0);
    });
    const t = totalVal || 1;
    return [
      { label: 'Crypto',   value: b.crypto, color: PURPLE, pct: (b.crypto / t) * 100 },
      { label: 'Equities', value: b.equity, color: BLUE,   pct: (b.equity / t) * 100 },
      { label: 'ETFs',     value: b.etf,    color: ORANGE, pct: (b.etf    / t) * 100 },
      { label: 'Cash',     value: cash,     color: TEAL,   pct: (cash     / t) * 100 },
    ].filter(s => s.pct > 0.1);
  })();

  const performers = (() => {
    if (snapshots.length < 2) return { top: [] as PerformerItem[], bottom: [] as PerformerItem[] };
    const first: Record<string, number> = {};
    (snapshots[0].snapshot?.positions ?? []).forEach(p => {
      first[getTicker(p.symbol)] = p.price ?? 0;
    });
    const items = positions.map(p => {
      const ticker = getTicker(p.symbol);
      const fp     = first[ticker] ?? 0;
      const cp     = p.price ?? 0;
      const pct    = fp > 0 && cp > 0
        ? ((cp - fp) / fp) * 100
        : (p.open_pnl && getUnits(p) * cp > 0
            ? (p.open_pnl / (getUnits(p) * cp - p.open_pnl)) * 100
            : 0);
      return { ticker, pct, value: getUnits(p) * cp, currency: p.currency };
    }).filter(p => p.value > 0);
    const sorted = [...items].sort((a, b) => b.pct - a.pct);
    return {
      top:    sorted.slice(0, 3).filter(p => p.pct >= 0),
      bottom: [...sorted].reverse().slice(0, 3).filter(p => p.pct < 0),
    };
  })();

  const risk = computeRiskMetrics(dailyReturns);

  const chartLabels = (() => {
    if (filteredSnaps.length < 2) return ['', '', ''];
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const f = new Date(filteredSnaps[0].captured_at);
    const l = new Date(filteredSnaps[filteredSnaps.length - 1].captured_at);
    const m = new Date((f.getTime() + l.getTime()) / 2);
    return [MONTHS[f.getMonth()], MONTHS[m.getMonth()], MONTHS[l.getMonth()]];
  })();

  return {
    holdings, snapshots, loading, refreshing, connected, userName, lastUpdated,
    period, setPeriod, headerAnim, onRefresh,
    positions, balances, currency, cash, totalPos, totalVal, totalPnl,
    filteredSnaps, snapValues, benchValues, chartPortfolio, chartBench,
    periodReturn, sp500Return, vsMarket, dailyReturns, todayChange, todayChangePct,
    allocSegs, performers, risk, chartLabels, fetchError,
  };
}

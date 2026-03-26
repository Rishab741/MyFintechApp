import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchChartData,
  fetchGainers,
  fetchLosers,
  fetchQuotes,
  INDEX_CONFIG,
  SECTOR_ETFS,
} from '../service';
import type { ChartPoint, MarketIndex, MarketStatus, Mover, Period, Quote, Sector } from '../types';
import { GREEN, RED } from '@/src/portfolio/tokens';

// ─── Market status based on NYSE hours (ET = UTC-5 / UTC-4 DST) ──────────────
function getMarketStatus(): MarketStatus {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun, 6=Sat
  const h = et.getHours();
  const m = et.getMinutes();
  const mins = h * 60 + m;

  if (day === 0 || day === 6) {
    return { label: 'CLOSED', isOpen: false, color: '#4A5468' };
  }
  if (mins >= 240 && mins < 570)  return { label: 'PRE-MARKET',   isOpen: false, color: '#C9A84C' };
  if (mins >= 570 && mins < 960)  return { label: 'MARKET OPEN',  isOpen: true,  color: GREEN     };
  if (mins >= 960 && mins < 1200) return { label: 'AFTER-HOURS',  isOpen: false, color: '#C084FC' };
  return { label: 'CLOSED', isOpen: false, color: '#4A5468' };
}

const INDEX_SYMBOLS  = INDEX_CONFIG.map(c => c.symbol);
const SECTOR_SYMBOLS = SECTOR_ETFS.map(s => s.etf);

export function useMarketData() {
  const [indices,       setIndices]       = useState<MarketIndex[]>([]);
  const [selectedIdx,   setSelectedIdx]   = useState(0);   // active index card
  const [period,        setPeriod]        = useState<Period>('1D');
  const [chartData,     setChartData]     = useState<ChartPoint[]>([]);
  const [chartLoading,  setChartLoading]  = useState(false);
  const [gainers,       setGainers]       = useState<Mover[]>([]);
  const [losers,        setLosers]        = useState<Mover[]>([]);
  const [sectors,       setSectors]       = useState<Sector[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [marketStatus,  setMarketStatus]  = useState<MarketStatus>(getMarketStatus);
  const [lastUpdated,   setLastUpdated]   = useState<Date | null>(null);
  const [error,         setError]         = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Build initial index list (quotes only, no chart) ──────────────────────
  const loadIndexQuotes = useCallback(async (): Promise<MarketIndex[]> => {
    const quotes = await fetchQuotes(INDEX_SYMBOLS);
    const quoteMap = new Map<string, Quote>(quotes.map(q => [q.symbol, q]));
    return INDEX_CONFIG.map(cfg => ({
      ...cfg,
      quote:     quoteMap.get(cfg.symbol) ?? null,
      chartData: [],
    }));
  }, []);

  // ── Load sector performance ────────────────────────────────────────────────
  const loadSectors = useCallback(async () => {
    const quotes = await fetchQuotes(SECTOR_SYMBOLS);
    const quoteMap = new Map(quotes.map(q => [q.symbol, q]));
    const s: Sector[] = SECTOR_ETFS.map(({ name, etf }) => {
      const q = quoteMap.get(etf);
      return { name, etf, change: q?.change ?? 0, changePct: q?.changePct ?? 0 };
    });
    setSectors(s);
  }, []);

  // ── Load movers ────────────────────────────────────────────────────────────
  const loadMovers = useCallback(async () => {
    const [g, l] = await Promise.allSettled([fetchGainers(6), fetchLosers(6)]);
    if (g.status === 'fulfilled') setGainers(g.value);
    if (l.status === 'fulfilled') setLosers(l.value);
  }, []);

  // ── Load chart for selected index + period ─────────────────────────────────
  const loadChart = useCallback(async (symIdx: number, p: Period) => {
    const sym = INDEX_CONFIG[symIdx]?.symbol;
    if (!sym) return;
    setChartLoading(true);
    try {
      const data = await fetchChartData(sym, p);
      setChartData(data);
    } catch {
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, []);

  // ── Full refresh ───────────────────────────────────────────────────────────
  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setError(null);
    try {
      const [idxList] = await Promise.all([
        loadIndexQuotes(),
        loadSectors(),
        loadMovers(),
      ]);
      setIndices(idxList);
      setMarketStatus(getMarketStatus());
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load market data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadIndexQuotes, loadSectors, loadMovers]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    refresh(true);
  }, []);

  // ── Auto-refresh every 30s when market is open, 5min otherwise ────────────
  useEffect(() => {
    const interval = marketStatus.isOpen ? 30_000 : 300_000;
    timerRef.current = setInterval(() => refresh(true), interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [marketStatus.isOpen, refresh]);

  // ── Reload chart when selected index or period changes ────────────────────
  useEffect(() => {
    loadChart(selectedIdx, period);
  }, [selectedIdx, period]);

  return {
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
    refresh: () => refresh(false),
  };
}

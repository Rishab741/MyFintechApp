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
import { GREEN } from '@/src/portfolio/tokens';
import { supabase } from '@/src/lib/supabase';

// ─── Market status based on NYSE hours (ET = UTC-5 / UTC-4 DST) ──────────────
// Avoids toLocaleString(timeZone) which is unreliable on Android < 10.
// Instead, compute ET offset manually: ET = UTC-5 (EST) or UTC-4 (EDT).
function getEasternMinutes(): { dayOfWeek: number; minutesInDay: number } {
  const now     = new Date();
  const utcMs   = now.getTime() + now.getTimezoneOffset() * 60_000; // to UTC ms
  // Determine DST: EDT (UTC-4) is active from 2nd Sun in March → 1st Sun in November
  const year = now.getUTCFullYear();
  const dstStart = new Date(Date.UTC(year, 2,  1)); // 1 Mar UTC
  dstStart.setUTCDate(8 - (dstStart.getUTCDay() || 7)); // 2nd Sunday in March (UTC)
  const dstEnd   = new Date(Date.UTC(year, 10, 1)); // 1 Nov UTC
  dstEnd.setUTCDate(1 + ((7 - dstEnd.getUTCDay()) % 7));  // 1st Sunday in November (UTC)

  const isDST    = utcMs >= dstStart.getTime() && utcMs < dstEnd.getTime();
  const etMs     = utcMs - (isDST ? 4 : 5) * 3_600_000;
  const etDate   = new Date(etMs);
  return { dayOfWeek: etDate.getUTCDay(), minutesInDay: etDate.getUTCHours() * 60 + etDate.getUTCMinutes() };
}

function getMarketStatus(): MarketStatus {
  const { dayOfWeek: day, minutesInDay: mins } = getEasternMinutes();

  if (day === 0 || day === 6)      return { label: 'CLOSED',       isOpen: false, color: '#4A5468' };
  if (mins >= 240 && mins < 570)   return { label: 'PRE-MARKET',   isOpen: false, color: '#C9A84C' };
  if (mins >= 570 && mins < 960)   return { label: 'MARKET OPEN',  isOpen: true,  color: GREEN     };
  if (mins >= 960 && mins < 1200)  return { label: 'AFTER-HOURS',  isOpen: false, color: '#C084FC' };
  return { label: 'CLOSED', isOpen: false, color: '#4A5468' };
}

const INDEX_SYMBOLS = INDEX_CONFIG.map(c => c.symbol);

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

  // ── Load sector performance via edge function (avoids Yahoo Finance client-side block) ──
  // Falls back to 0% placeholders if the edge function fails so the grid stays visible.
  const loadSectors = useCallback(async () => {
    const fallback: Sector[] = SECTOR_ETFS.map(({ name, etf }) => ({ name, etf, change: 0, changePct: 0 }));
    try {
      const { data, error } = await supabase.functions.invoke('market-intelligence', {
        body: { action: 'sectors_only' },
      });
      if (!error && Array.isArray(data?.sectors) && data.sectors.length > 0) {
        setSectors(data.sectors.map((sec: { name: string; etf: string; changePct: number }) => ({
          name: sec.name, etf: sec.etf, change: 0, changePct: sec.changePct ?? 0,
        })));
      } else {
        setSectors(fallback);
      }
    } catch {
      setSectors(fallback);
    }
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

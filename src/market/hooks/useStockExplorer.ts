import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartPoint, DetailedQuote, Mover, Period, Quote } from '../types';
import {
  SECTOR_ETFS, STOCK_UNIVERSE, computeRSI, fetchChartData,
  fetchDetailedQuote, fetchGainers, fetchLosers, fetchQuotes,
} from '../service';

export type SectorKey = 'All' | 'Technology' | 'Financials' | 'Healthcare' | 'Energy' | 'Consumer' | 'Industrials' | 'Crypto';
export const SECTOR_KEYS: SectorKey[] = ['All', 'Technology', 'Financials', 'Healthcare', 'Energy', 'Consumer', 'Industrials', 'Crypto'];

export interface SectorStat {
  name: string;
  etf: string;
  price: number;
  change: number;
  changePct: number;
}

export function useStockExplorer() {
  const [activeSector, setActiveSector] = useState<SectorKey>('Technology');
  const [activeTab, setActiveTab] = useState<'stocks' | 'movers' | 'sectors'>('stocks');
  const [search, setSearch] = useState('');

  const [quotesCache, setQuotesCache] = useState<Record<string, Quote>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);

  // Stock detail
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [detailQuote, setDetailQuote] = useState<DetailedQuote | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [period, setPeriod] = useState<Period>('1M');
  const [chartLoading, setChartLoading] = useState(false);
  const rsi = useMemo(() => computeRSI(chartData), [chartData]);

  // Movers
  const [gainers, setGainers] = useState<Mover[]>([]);
  const [losers, setLosers] = useState<Mover[]>([]);
  const [moversLoading, setMoversLoading] = useState(false);
  const moversLoadedRef = useRef(false);

  // Sector ETF quotes
  const [sectorStats, setSectorStats] = useState<SectorStat[]>([]);
  const [sectorStatsLoading, setSectorStatsLoading] = useState(false);
  const sectorsLoadedRef = useRef(false);

  // Market context (S&P 500 for header)
  const [spx, setSpx] = useState<Quote | null>(null);

  // Load sector stock quotes
  useEffect(() => {
    const symbols = activeSector === 'All'
      ? Object.values(STOCK_UNIVERSE).flat().map(s => s.symbol)
      : (STOCK_UNIVERSE[activeSector] ?? []).map(s => s.symbol);
    if (!symbols.length) return;

    setQuotesLoading(true);
    fetchQuotes(symbols)
      .then(results => {
        setQuotesCache(prev => {
          const next = { ...prev };
          results.forEach(q => { next[q.symbol] = q; });
          return next;
        });
      })
      .catch(() => {})
      .finally(() => setQuotesLoading(false));
  }, [activeSector]);

  // Load S&P 500 context on mount
  useEffect(() => {
    fetchQuotes(['^GSPC'])
      .then(qs => { if (qs[0]) setSpx(qs[0]); })
      .catch(() => {});
  }, []);

  // Load stock detail when symbol or period changes
  useEffect(() => {
    if (!selectedSymbol) return;
    setDetailQuote(null);
    setChartData([]);
    setChartLoading(true);
    Promise.all([
      fetchDetailedQuote(selectedSymbol),
      fetchChartData(selectedSymbol, period),
    ])
      .then(([detail, chart]) => {
        setDetailQuote(detail);
        setChartData(chart);
      })
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }, [selectedSymbol, period]);

  // Load movers when movers tab first selected
  const loadMovers = useCallback(() => {
    if (moversLoadedRef.current) return;
    setMoversLoading(true);
    Promise.all([fetchGainers(10), fetchLosers(10)])
      .then(([g, l]) => {
        setGainers(g);
        setLosers(l);
        moversLoadedRef.current = true;
      })
      .catch(() => {})
      .finally(() => setMoversLoading(false));
  }, []);

  // Load sector ETF stats when sectors tab first selected
  const loadSectorStats = useCallback(() => {
    if (sectorsLoadedRef.current) return;
    setSectorStatsLoading(true);
    fetchQuotes(SECTOR_ETFS.map(s => s.etf))
      .then(quotes => {
        const qMap = new Map(quotes.map(q => [q.symbol, q]));
        setSectorStats(SECTOR_ETFS.map(s => {
          const q = qMap.get(s.etf);
          return { name: s.name, etf: s.etf, price: q?.price ?? 0, change: q?.change ?? 0, changePct: q?.changePct ?? 0 };
        }));
        sectorsLoadedRef.current = true;
      })
      .catch(() => {})
      .finally(() => setSectorStatsLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'movers') loadMovers();
    if (activeTab === 'sectors') loadSectorStats();
  }, [activeTab]);

  // Filtered + ordered visible stocks
  const visibleStocks = useMemo(() => {
    const q = search.toLowerCase();
    const pool = q
      ? Object.entries(STOCK_UNIVERSE).flatMap(([sec, stocks]) =>
          stocks.map(s => ({ ...s, sector: sec }))
        ).filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      : activeSector === 'All'
        ? Object.entries(STOCK_UNIVERSE).flatMap(([sec, stocks]) =>
            stocks.map(s => ({ ...s, sector: sec }))
          )
        : (STOCK_UNIVERSE[activeSector] ?? []).map(s => ({ ...s, sector: activeSector as string }));
    return pool;
  }, [activeSector, search]);

  return {
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
    spx,
  };
}

import type { ChartPoint, Mover, Quote, Period } from './types';

const BASE1 = 'https://query1.finance.yahoo.com';
const BASE2 = 'https://query2.finance.yahoo.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
};

// ─── Period → interval/range params ──────────────────────────────────────────
const PERIOD_PARAMS: Record<Period, { interval: string; range: string }> = {
  '1D': { interval: '5m',  range: '1d'  },
  '1W': { interval: '1h',  range: '5d'  },
  '1M': { interval: '1d',  range: '1mo' },
  '3M': { interval: '1d',  range: '3mo' },
  '1Y': { interval: '1wk', range: '1y'  },
};

// ─── Batch quotes for multiple symbols ───────────────────────────────────────
export async function fetchQuotes(symbols: string[]): Promise<Quote[]> {
  const encoded = symbols.map(encodeURIComponent).join(',');
  const url = `${BASE1}/v7/finance/quote?symbols=${encoded}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,marketCap,shortName,fiftyTwoWeekHigh,fiftyTwoWeekLow,regularMarketPreviousClose`;

  const res = await fetch(url, { headers: HEADERS });
  const json = await res.json();
  const results: any[] = json?.quoteResponse?.result ?? [];

  return results.map((r): Quote => ({
    symbol:             r.symbol ?? '',
    shortName:          r.shortName ?? r.symbol ?? '',
    price:              r.regularMarketPrice ?? 0,
    change:             r.regularMarketChange ?? 0,
    changePct:          r.regularMarketChangePercent ?? 0,
    dayHigh:            r.regularMarketDayHigh ?? 0,
    dayLow:             r.regularMarketDayLow ?? 0,
    volume:             r.regularMarketVolume ?? 0,
    marketCap:          r.marketCap,
    fiftyTwoWeekHigh:   r.fiftyTwoWeekHigh,
    fiftyTwoWeekLow:    r.fiftyTwoWeekLow,
    previousClose:      r.regularMarketPreviousClose ?? 0,
  }));
}

// ─── OHLCV chart data for a single symbol ────────────────────────────────────
export async function fetchChartData(symbol: string, period: Period): Promise<ChartPoint[]> {
  const { interval, range } = PERIOD_PARAMS[period];
  const url = `${BASE2}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;

  const res = await fetch(url, { headers: HEADERS });
  const json = await res.json();

  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

  const points: ChartPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const v = closes[i];
    if (v != null && isFinite(v)) {
      points.push({ timestamp: timestamps[i] * 1000, value: v });
    }
  }
  return points;
}

// ─── Top gainers from Yahoo Finance screener ─────────────────────────────────
export async function fetchGainers(count = 6): Promise<Mover[]> {
  return fetchScreener('day_gainers', count);
}

export async function fetchLosers(count = 6): Promise<Mover[]> {
  return fetchScreener('day_losers', count);
}

async function fetchScreener(scrId: string, count: number): Promise<Mover[]> {
  const url = `${BASE1}/v1/finance/screener/predefined/saved?count=${count}&scrIds=${scrId}`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    const json = await res.json();
    const quotes: any[] = json?.finance?.result?.[0]?.quotes ?? [];
    return quotes.map((q): Mover => ({
      symbol:    q.symbol ?? '',
      name:      q.shortName ?? q.symbol ?? '',
      price:     q.regularMarketPrice ?? 0,
      change:    q.regularMarketChange ?? 0,
      changePct: q.regularMarketChangePercent ?? 0,
      volume:    q.regularMarketVolume ?? 0,
    }));
  } catch {
    return [];
  }
}

// ─── Sector ETFs used as proxies ──────────────────────────────────────────────
export const SECTOR_ETFS = [
  { name: 'Technology',    etf: 'XLK'  },
  { name: 'Financials',    etf: 'XLF'  },
  { name: 'Healthcare',    etf: 'XLV'  },
  { name: 'Energy',        etf: 'XLE'  },
  { name: 'Industrials',   etf: 'XLI'  },
  { name: 'Cons. Disc.',   etf: 'XLY'  },
  { name: 'Cons. Staples', etf: 'XLP'  },
  { name: 'Real Estate',   etf: 'XLRE' },
  { name: 'Materials',     etf: 'XLB'  },
  { name: 'Utilities',     etf: 'XLU'  },
  { name: 'Comm. Svcs',    etf: 'XLC'  },
];

// ─── Major indices ────────────────────────────────────────────────────────────
export const INDEX_CONFIG = [
  { symbol: '^GSPC',  label: 'S&P 500',    shortLabel: 'SPX',    region: 'US'    },
  { symbol: '^IXIC',  label: 'NASDAQ',     shortLabel: 'NDX',    region: 'US'    },
  { symbol: '^DJI',   label: 'Dow Jones',  shortLabel: 'DJI',    region: 'US'    },
  { symbol: '^RUT',   label: 'Russell 2K', shortLabel: 'RUT',    region: 'US'    },
  { symbol: '^FTSE',  label: 'FTSE 100',   shortLabel: 'FTSE',   region: 'UK'    },
  { symbol: '^N225',  label: 'Nikkei 225', shortLabel: 'NKY',    region: 'JP'    },
  { symbol: '^HSI',   label: 'Hang Seng',  shortLabel: 'HSI',    region: 'HK'    },
  { symbol: 'BTC-USD',label: 'Bitcoin',    shortLabel: 'BTC',    region: 'CRYPTO'},
  { symbol: 'ETH-USD',label: 'Ethereum',   shortLabel: 'ETH',    region: 'CRYPTO'},
];

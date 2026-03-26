export type Period = '1D' | '1W' | '1M' | '3M' | '1Y';

export interface Quote {
  symbol: string;
  shortName: string;
  price: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  previousClose: number;
}

export interface ChartPoint {
  timestamp: number;  // ms
  value: number;
}

export interface MarketIndex {
  symbol: string;
  label: string;
  shortLabel: string;
  region: string;
  quote: Quote | null;
  chartData: ChartPoint[];
}

export interface Mover {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
}

export interface Sector {
  name: string;
  etf: string;     // ETF used as proxy
  change: number;
  changePct: number;
}

export interface MarketStatus {
  label: string;             // 'PRE-MARKET' | 'OPEN' | 'AFTER-HOURS' | 'CLOSED'
  isOpen: boolean;
  color: string;
}

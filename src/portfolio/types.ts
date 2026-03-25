export interface Position {
    symbol: any; units?: number; quantity?: number;
    price?: number; open_pnl?: number; currency?: any;
    description?: string; type?: string;
}
export interface Balance { currency?: any; cash?: number; buying_power?: number; }
export interface HoldingsData {
    account?: { name?: string; number?: string };
    positions?: Position[]; balances?: Balance[];
}
export interface Snapshot { snapshot: HoldingsData; captured_at: string; }
export type Period = '1W' | '1M' | '3M' | 'ALL';
export interface AllocSeg { label: string; value: number; color: string; pct: number; }
export interface PerformerItem { ticker: string; pct: number; value: number; currency: any; }
export interface RiskMetrics {
    mean: number; stddev: number; annStd: number;
    sharpe: number; var95: number; winRate: number;
}

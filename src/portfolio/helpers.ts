import { Position, Snapshot, Period } from './types';

// ─── S&P 500 reference data ───────────────────────────────────────────────────
export const SP500: Record<string, number> = {
    '2023-10': 4194, '2023-11': 4568, '2023-12': 4769,
    '2024-01': 4845, '2024-02': 5137, '2024-03': 5254, '2024-04': 5035,
    '2024-05': 5277, '2024-06': 5460, '2024-07': 5522, '2024-08': 5648,
    '2024-09': 5762, '2024-10': 5705, '2024-11': 6032, '2024-12': 5882,
    '2025-01': 6059, '2025-02': 5954, '2025-03': 5600,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const getUnits    = (p: Position) => p.units ?? p.quantity ?? 0;
export const getTicker   = (symbol: any): string => {
    if (!symbol) return '???';
    if (typeof symbol === 'string') return symbol;
    if (typeof symbol === 'object') {
        if (symbol.raw_symbol) return String(symbol.raw_symbol);
        if (symbol.symbol)     return getTicker(symbol.symbol);
        if (symbol.id)         return String(symbol.id);
    }
    return 'Asset';
};
export const getCurrency = (raw: any): string => {
    if (!raw) return 'USD';
    if (typeof raw === 'string') return raw.length >= 3 ? raw : 'USD';
    if (typeof raw === 'object') return raw.code ?? raw.id ?? 'USD';
    return 'USD';
};
export const fmtCurrency = (n: number, currency: any = 'USD') => {
    let c = getCurrency(currency).toUpperCase();
    if (c === 'USDT' || c === 'USDC') c = 'USD';
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(n);
    } catch { return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
};
export const fmt2    = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt4    = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
export const sign    = (n: number) => (n >= 0 ? '+' : '');
export const clamp   = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const CRYPTO_SET = new Set(['BTC','ETH','SOL','BNB','ADA','XRP','DOGE','DOT','MATIC','AVAX','USDT','USDC','LTC','LINK','UNI','ATOM','FTM','ALGO','SHIB','CRO','NEAR','ICP','FIL','VET','HBAR','CAKE','AAVE','COMP','MKR','YFI','CRV','TRX']);
export const ETF_SET   = new Set(['SPY','QQQ','IWM','VTI','VOO','GLD','SLV','XLK','XLF','XLE','ARKK','DIA','EEM','VEA']);
export const TICKER_PALETTE: Record<string, string> = {
    BTC:'#F7931A', ETH:'#627EEA', SOL:'#9945FF', BNB:'#F3BA2F',
    ADA:'#0033AD', XRP:'#346AA9', DOGE:'#C3A634', DOT:'#E6007A',
    MATIC:'#8247E5', AVAX:'#E84142', LINK:'#2A5ADA', UNI:'#FF007A',
};
export const tickerColor = (t: string) => TICKER_PALETTE[t.toUpperCase()] ?? '#C9A84C';
export const getCategory = (t: string): 'crypto'|'etf'|'equity' => {
    const u = t.toUpperCase();
    if (CRYPTO_SET.has(u)) return 'crypto';
    if (ETF_SET.has(u))    return 'etf';
    return 'equity';
};
export const normalize100 = (vals: number[]) => {
    if (!vals.length || !vals[0]) return vals;
    const b = vals[0]; return vals.map(v => (v / b) * 100);
};
export const filterByPeriod = (snaps: Snapshot[], p: Period) => {
    if (p === 'ALL' || snaps.length < 2) return snaps;
    const days = ({ '1W': 7, '1M': 30, '3M': 90 } as any)[p];
    const cutoff = Date.now() - days * 864e5;
    const f = snaps.filter(s => new Date(s.captured_at).getTime() >= cutoff);
    return f.length >= 2 ? f : snaps;
};

// ─── Risk metrics ─────────────────────────────────────────────────────────────
export const computeRiskMetrics = (returns: number[]) => {
    if (returns.length < 3) return null;
    const mean   = returns.reduce((a,b) => a+b, 0) / returns.length;
    const vari   = returns.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const stddev = Math.sqrt(vari);
    const annStd = stddev * Math.sqrt(252); // annualised (daily returns)
    const sharpe = stddev > 0 ? (mean / stddev) * Math.sqrt(252) : 0;
    const sorted = [...returns].sort((a,b) => a - b);
    const var95  = sorted[Math.floor(returns.length * 0.05)] ?? 0; // 5th percentile VaR
    const pos    = returns.filter(r => r >= 0).length;
    const winRate = (pos / returns.length) * 100;
    return { mean, stddev, annStd, sharpe, var95, winRate };
};

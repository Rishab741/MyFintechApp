/**
 * Vestara Portfolio Engine — TypeScript client
 *
 * Typed wrapper around the FastAPI service.
 * All requests attach the user's Supabase JWT as the Bearer token,
 * so the engine can authenticate and extract the user_id server-side.
 *
 * Usage:
 *   const client = createEngineClient(session.access_token);
 *   const metrics = await client.getMetrics('1M');
 */

import { supabase } from '@/src/lib/supabase';

// ── Base URL ──────────────────────────────────────────────────────────────────
// Set EXPO_PUBLIC_ENGINE_URL in your .env file.
// Falls back to localhost for local development.
const ENGINE_BASE_URL =
  process.env.EXPO_PUBLIC_ENGINE_URL ?? 'http://localhost:8000';

// ── Types (mirrors models/portfolio.py) ───────────────────────────────────────
export type Period = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

export interface PerformanceMetrics {
  period:           Period;
  total_return:     number;
  twr:              number;
  cagr:             number;
  daily_return_avg: number;
  sharpe_ratio:     number;
  sortino_ratio:    number;
  calmar_ratio:     number;
  max_drawdown:     number;
  drawdown_days:    number;
  volatility:       number;
  var_95:           number;
  cvar_95:          number;
  win_rate:         number;
  benchmark_symbol: string;
  benchmark_return: number;
  alpha:            number;
  beta:             number;
  correlation:      number;
  total_value:      number;
  position_count:   number;
  cash_pct:         number;
  computed_at:      string;
  data_points:      number;
}

export interface AssetClassSegment {
  asset_class:    string;
  market_value:   number;
  allocation_pct: number;
  position_count: number;
}

export interface ConcentrationRisk {
  top_10_pct:       number;
  top_3_pct:        number;
  herfindahl_index: number;
  effective_n:      number;
  largest_position: { symbol: string; allocation_pct: number; market_value: number } | null;
}

export interface ExposureReport {
  by_asset_class: AssetClassSegment[];
  by_sector:      { sector: string; market_value: number; allocation_pct: number }[];
  by_currency:    { currency: string; market_value: number; allocation_pct: number }[];
  concentration:  ConcentrationRisk;
  position_count: number;
  total_value:    number;
  cash_value:     number;
  invested_value: number;
  cash_pct:       number;
}

export interface NavPoint {
  time:            string;
  total_value:     number;
  cash_value:      number;
  invested_value:  number;
  daily_return:    number | null;
  benchmark_value: number | null;
}

export interface PortfolioHistory {
  period:           Period;
  nav_series:       NavPoint[];
  benchmark_symbol: string;
  data_points:      number;
}

// ── Engine client ─────────────────────────────────────────────────────────────
class EngineClient {
  private readonly baseUrl: string;
  private readonly token:   string;

  constructor(token: string, baseUrl: string = ENGINE_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token   = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(
        `Engine error ${res.status}: ${err.detail ?? err.error ?? res.statusText}`,
      );
    }

    return res.json() as Promise<T>;
  }

  /** Full risk/return metrics for a given period. */
  getMetrics(period: Period = 'ALL'): Promise<PerformanceMetrics> {
    return this.request<PerformanceMetrics>(
      `/portfolio/metrics?period=${period}`,
    );
  }

  /** Asset class, sector, currency, and concentration breakdown. */
  getExposure(): Promise<ExposureReport> {
    return this.request<ExposureReport>('/portfolio/exposure');
  }

  /** NAV time series for charting. */
  getHistory(period: Period = '3M'): Promise<PortfolioHistory> {
    return this.request<PortfolioHistory>(
      `/portfolio/history?period=${period}`,
    );
  }

  /** Check engine health. */
  health(): Promise<{ status: string }> {
    return this.request('/health');
  }
}

// ── Factory: auto-attach the current Supabase session token ──────────────────
export async function createEngineClient(): Promise<EngineClient | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return new EngineClient(session.access_token);
}

/** Synchronous factory — use when you already have the token. */
export function createEngineClientWithToken(token: string): EngineClient {
  return new EngineClient(token);
}

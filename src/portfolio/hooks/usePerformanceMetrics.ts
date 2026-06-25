/**
 * usePerformanceMetrics — React Query edition
 *
 * Reads pre-computed risk/return metrics from two sources in priority order:
 *   1. performance_cache table (Supabase — no engine call, fastest)
 *   2. FastAPI engine /portfolio/metrics (live computation fallback)
 *
 * React Query handles caching, deduplication, background refetch, and
 * error/loading states — no manual useState / useEffect chains needed.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/store/useAuthStore';
import {
  createEngineClientWithToken,
  type PerformanceMetrics,
  type Period,
} from '@/src/services/engineClient';

// ── Cache TTL ─────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 6 * 60 * 60_000;   // 6 hours — matches engine write cadence

// ── Query key factory ─────────────────────────────────────────────────────────
export const metricsKeys = {
  all:    (userId: string)                => ['metrics', userId]           as const,
  period: (userId: string, period: Period) => ['metrics', userId, period]  as const,
};

// ── Fetch function ────────────────────────────────────────────────────────────
async function fetchMetrics(
  userId: string,
  token: string,
  period: Period,
): Promise<PerformanceMetrics & { source: 'cache' | 'engine' }> {
  // 1. Try performance_cache — fresh within 6 hours means no engine call
  const { data: cacheRows } = await supabase
    .from('performance_cache')
    .select('*')
    .eq('user_id', userId)
    .eq('period', period)
    .limit(1);

  if (cacheRows?.length) {
    const row      = cacheRows[0];
    const ageMs    = Date.now() - new Date(row.computed_at).getTime();
    if (ageMs < CACHE_TTL_MS) {
      return {
        source:           'cache',
        period:           row.period,
        total_return:     row.total_return     ?? 0,
        twr:              row.total_return     ?? 0,
        cagr:             row.cagr             ?? 0,
        daily_return_avg: row.daily_return_avg ?? 0,
        sharpe_ratio:     row.sharpe_ratio     ?? 0,
        sortino_ratio:    row.sortino_ratio    ?? 0,
        calmar_ratio:     row.cagr && row.max_drawdown
          ? row.cagr / Math.abs(row.max_drawdown) : 0,
        max_drawdown:     row.max_drawdown     ?? 0,
        drawdown_days:    row.drawdown_days    ?? 0,
        volatility:       row.volatility       ?? 0,
        var_95:           row.var_95           ?? 0,
        cvar_95:          0,
        win_rate:         row.win_rate         ?? 0,
        benchmark_symbol: row.benchmark_symbol ?? 'SPY',
        benchmark_return: row.benchmark_return ?? 0,
        alpha:            row.alpha            ?? 0,
        beta:             row.beta             ?? 1,
        correlation:      0,
        total_value:      row.total_value      ?? 0,
        position_count:   row.position_count   ?? 0,
        cash_pct:         row.cash_pct         ?? 0,
        computed_at:      row.computed_at,
        data_points:      0,
      };
    }
  }

  // 2. Cache miss or stale — call the engine for live computation
  const client  = createEngineClientWithToken(token);
  const metrics = await client.getMetrics(period);
  return { ...metrics, source: 'engine' };
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePerformanceMetrics(period: Period = 'ALL') {
  const { session }  = useAuthStore();
  const userId       = session?.user?.id   ?? null;
  const token        = session?.access_token ?? null;
  const queryClient  = useQueryClient();

  const query = useQuery({
    queryKey: metricsKeys.period(userId ?? '', period),
    queryFn:  () => fetchMetrics(userId!, token!, period),
    enabled:  !!userId && !!token,
    // Re-use React Query's staleTime to shadow the 6-hour cache TTL.
    // The query refetches in the background after staleTime elapses.
    staleTime: CACHE_TTL_MS,
    // Keep stale data visible while a background refetch runs.
    placeholderData: (prev) => prev,
  });

  const onRefresh = () =>
    queryClient.invalidateQueries({ queryKey: metricsKeys.period(userId ?? '', period) });

  return {
    data:       query.data   ?? null,
    loading:    query.isLoading,
    refreshing: query.isFetching && !query.isLoading,
    error:      query.error instanceof Error ? query.error.message : (query.error ? String(query.error) : null),
    source:     query.data?.source ?? null,
    onRefresh,
  };
}

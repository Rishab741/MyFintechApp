/**
 * usePerformanceMetrics
 *
 * Reads pre-computed risk/return metrics from two sources, in priority order:
 *
 *   1. performance_cache table (via Supabase — fastest, no engine required)
 *   2. FastAPI engine /portfolio/metrics (live computation — fallback)
 *
 * The cache is written by the engine's /sync/compute endpoint after each
 * portfolio snapshot.  For most users, the cache will be fresh (<6 hours old)
 * and no engine call is needed.
 *
 * Returns data in the same shape as PerformanceMetrics from engineClient.ts
 * so the UI only needs one data contract.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/store/useAuthStore';
import {
  createEngineClientWithToken,
  type PerformanceMetrics,
  type Period,
} from '@/src/services/engineClient';

interface MetricsState {
  data:       PerformanceMetrics | null;
  loading:    boolean;
  refreshing: boolean;
  error:      string | null;
  source:     'cache' | 'engine' | null;
}

const CACHE_TTL_HOURS = 6;

export function usePerformanceMetrics(period: Period = 'ALL') {
  const { session } = useAuthStore();
  const userId      = session?.user?.id ?? null;
  const token       = session?.access_token ?? null;

  const [state, setState] = useState<MetricsState>({
    data:       null,
    loading:    true,
    refreshing: false,
    error:      null,
    source:     null,
  });

  const mounted = useRef(true);
  useEffect(() => { return () => { mounted.current = false; }; }, []);

  const fetchMetrics = useCallback(async (isRefresh = false) => {
    if (!userId || !token) return;
    if (!mounted.current) return;

    setState(s => ({
      ...s,
      loading:    !isRefresh,
      refreshing: isRefresh,
      error:      null,
    }));

    // ── 1. Try performance_cache ────────────────────────────────────────────
    try {
      const { data: cacheRows } = await supabase
        .from('performance_cache')
        .select('*')
        .eq('user_id', userId)
        .eq('period', period)
        .limit(1);

      if (cacheRows && cacheRows.length > 0) {
        const row = cacheRows[0];
        const computedAt = new Date(row.computed_at);
        const ageHours   = (Date.now() - computedAt.getTime()) / 3_600_000;

        if (ageHours < CACHE_TTL_HOURS) {
          // Cache is fresh — transform DB row to PerformanceMetrics shape
          const metrics: PerformanceMetrics = {
            period:           row.period,
            total_return:     row.total_return    ?? 0,
            twr:              row.total_return    ?? 0,
            cagr:             row.cagr            ?? 0,
            daily_return_avg: row.daily_return_avg ?? 0,
            sharpe_ratio:     row.sharpe_ratio    ?? 0,
            sortino_ratio:    row.sortino_ratio   ?? 0,
            calmar_ratio:     row.cagr && row.max_drawdown
              ? row.cagr / Math.abs(row.max_drawdown)
              : 0,
            max_drawdown:     row.max_drawdown    ?? 0,
            drawdown_days:    row.drawdown_days   ?? 0,
            volatility:       row.volatility      ?? 0,
            var_95:           row.var_95          ?? 0,
            cvar_95:          0,
            win_rate:         row.win_rate        ?? 0,
            benchmark_symbol: row.benchmark_symbol ?? 'SPY',
            benchmark_return: row.benchmark_return ?? 0,
            alpha:            row.alpha           ?? 0,
            beta:             row.beta            ?? 1,
            correlation:      0,
            total_value:      row.total_value     ?? 0,
            position_count:   row.position_count  ?? 0,
            cash_pct:         row.cash_pct        ?? 0,
            computed_at:      row.computed_at,
            data_points:      0,
          };

          if (mounted.current) {
            setState({ data: metrics, loading: false, refreshing: false, error: null, source: 'cache' });
          }
          return;
        }
      }
    } catch (cacheErr) {
      // Cache read failed — fall through to engine
      console.warn('[usePerformanceMetrics] cache read failed:', cacheErr);
    }

    // ── 2. Fall back to engine ──────────────────────────────────────────────
    try {
      const client  = createEngineClientWithToken(token);
      const metrics = await client.getMetrics(period);

      if (mounted.current) {
        setState({ data: metrics, loading: false, refreshing: false, error: null, source: 'engine' });
      }
    } catch (engineErr: unknown) {
      const msg = engineErr instanceof Error ? engineErr.message : 'Failed to load metrics';
      if (mounted.current) {
        setState(s => ({ ...s, loading: false, refreshing: false, error: msg }));
      }
    }
  }, [userId, token, period]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  const onRefresh = useCallback(() => fetchMetrics(true), [fetchMetrics]);

  return { ...state, onRefresh };
}

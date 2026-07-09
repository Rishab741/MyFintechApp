/**
 * useConnectionHealth — single source of truth for brokerage connection state.
 *
 * Validates against the DB on:
 *   - Mount
 *   - App foreground (AppState change)
 *   - After any sync attempt via markSyncResult()
 *
 * Status transitions:
 *   unknown → (checking) → healthy | stale | expired | disconnected
 *   healthy  → stale  (if lastSyncAt > STALE_THRESHOLD_H hours ago)
 *   healthy  → expired   (if edge fn returns brokerage_auth_expired)
 *   expired  → healthy   (after user reconnects)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useConnectionStore } from '@/src/store/useConnectionStore';

export type ConnectionStatus =
  | 'unknown'
  | 'healthy'
  | 'stale'       // connected but last snapshot > STALE_THRESHOLD_H hours old
  | 'expired'     // brokerage auth revoked — must reconnect portal
  | 'disconnected'; // no row in snaptrade_connections at all

export interface ConnectionHealth {
  status: ConnectionStatus;
  lastSyncAt: Date | null;
  lastCheckedAt: Date | null;
  isChecking: boolean;
  /** Call after a holdings fetch to update status based on the response. */
  markSyncResult: (result: 'ok' | 'brokerage_auth_expired' | 'error') => void;
  /** Force a re-check against the DB right now. */
  recheck: () => Promise<void>;
}

const STALE_THRESHOLD_H = 24;

export function useConnectionHealth(): ConnectionHealth {
  const { session } = useAuthStore();
  const { setBrokerageConnected } = useConnectionStore();
  const userId = session?.user?.id ?? null;

  const [status,        setStatus]        = useState<ConnectionStatus>('unknown');
  const [lastSyncAt,    setLastSyncAt]    = useState<Date | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [isChecking,    setIsChecking]    = useState(false);

  const checkInFlight = useRef(false);

  const validate = useCallback(async () => {
    if (!userId || checkInFlight.current) return;
    checkInFlight.current = true;
    setIsChecking(true);

    try {
      const { data: conn } = await supabase
        .from('snaptrade_connections')
        .select('account_id, connected_at')
        .eq('user_id', userId)
        .maybeSingle();

      const now = new Date();
      setLastCheckedAt(now);

      if (!conn?.account_id) {
        // No DB row — connection is gone regardless of what the store says
        setStatus('disconnected');
        setBrokerageConnected(false);
        return;
      }

      // Row exists — check freshness via latest snapshot
      const { data: snap } = await supabase
        .from('portfolio_snapshots')
        .select('captured_at')
        .eq('user_id', userId)
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (snap?.captured_at) {
        const last = new Date(snap.captured_at);
        setLastSyncAt(last);
        const ageH = (now.getTime() - last.getTime()) / 3_600_000;
        setStatus(ageH > STALE_THRESHOLD_H ? 'stale' : 'healthy');
      } else {
        // Connection row exists but no snapshot yet (first sync pending)
        setStatus('stale');
      }

      setBrokerageConnected(true);
    } catch {
      // Network error — don't change existing status, just stop checking
    } finally {
      setIsChecking(false);
      checkInFlight.current = false;
    }
  }, [userId, setBrokerageConnected]);

  // Validate on mount and when userId becomes available
  useEffect(() => { validate(); }, [validate]);

  // Re-validate when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') validate();
    });
    return () => sub.remove();
  }, [validate]);

  const markSyncResult = useCallback(
    (result: 'ok' | 'brokerage_auth_expired' | 'error') => {
      if (result === 'brokerage_auth_expired') {
        setStatus('expired');
        setBrokerageConnected(false);
      } else if (result === 'ok') {
        setLastSyncAt(new Date());
        setStatus('healthy');
        setBrokerageConnected(true);
      }
      // 'error' — leave status unchanged; transient failures don't flip the flag
    },
    [setBrokerageConnected],
  );

  return {
    status,
    lastSyncAt,
    lastCheckedAt,
    isChecking,
    markSyncResult,
    recheck: validate,
  };
}

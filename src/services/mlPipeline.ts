import { supabase } from '@/src/lib/supabase';

// ── Auto-trigger debounce state ───────────────────────────────────────────────
// Keyed by userId. Prevents hammering the edge function more than once per window.
const _lastTriggered: Record<string, number> = {};
const _INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours between auto-generates

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DatasetSummary {
    total_snapshots: number;
    portfolio_feature_rows: number;
    position_feature_rows: number;
    date_range: { from: string; to: string } | null;
    risk: {
        sharpe: number;
        ann_vol: number;
        var95: number;
        win_rate: number;
    } | null;
    total_return: number | null;
    max_drawdown: number | null;
    feature_columns: string[];
    position_columns: string[];
}

export interface DatasetInfo {
    id: number;
    generated_at: string;
    total_snapshots: number;
    date_range: { from: string; to: string } | null;
    portfolio_feature_rows: number;
    position_feature_rows: number;
    feature_columns: string[];
    position_columns: string[];
    risk: {
        sharpe: number;
        ann_vol: number;
        var95: number;
        win_rate: number;
    } | null;
    total_return: number | null;
    max_drawdown: number | null;
}

// ── Service calls ─────────────────────────────────────────────────────────────

/**
 * Generates (or regenerates) the ML feature dataset for the given user.
 * Fetches up to 200 portfolio snapshots, computes portfolio-level and
 * position-level features plus forward labels, and persists to ml_datasets.
 */
export async function generateDataset(userId: string): Promise<DatasetSummary> {
    const { data, error } = await supabase.functions.invoke('ml-pipeline', {
        body: { action: 'generate_dataset', user_id: userId },
    });
    if (error) throw new Error(`generateDataset failed: ${error.message}`);
    if (data?.error) throw new Error(data.error);
    return data.summary as DatasetSummary;
}

/**
 * Fetches the latest ml_datasets row for the user and returns the
 * portfolio-level feature matrix as a CSV string.
 * Throws if no dataset has been generated yet.
 */
export async function exportPortfolioCSV(userId: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('ml-pipeline', {
        body: { action: 'export_csv', user_id: userId },
    });
    if (error) throw new Error(`exportPortfolioCSV failed: ${error.message}`);
    if (typeof data === 'string') return data;
    // The edge function returns a raw CSV Response; the Supabase client may
    // already deserialise it as text.
    if (data?.error) throw new Error(data.error);
    return String(data);
}

/**
 * Fetches the latest ml_datasets row for the user and returns the
 * position-level feature matrix as a CSV string.
 * Throws if no dataset has been generated yet.
 */
export async function exportPositionsCSV(userId: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('ml-pipeline', {
        body: { action: 'export_positions_csv', user_id: userId },
    });
    if (error) throw new Error(`exportPositionsCSV failed: ${error.message}`);
    if (typeof data === 'string') return data;
    if (data?.error) throw new Error(data.error);
    return String(data);
}

/**
 * Returns metadata about the latest generated dataset for the user
 * (row counts, date range, feature column names, risk summary).
 * Throws if no dataset has been generated yet.
 */
export async function getDatasetInfo(userId: string): Promise<DatasetInfo> {
    const { data, error } = await supabase.functions.invoke('ml-pipeline', {
        body: { action: 'get_dataset_info', user_id: userId },
    });
    if (error) throw new Error(`getDatasetInfo failed: ${error.message}`);
    if (data?.error) throw new Error(data.error);
    return data as DatasetInfo;
}

// ── Auto-trigger ──────────────────────────────────────────────────────────────

/**
 * Fire-and-forget dataset generation with a 6-hour in-memory debounce.
 * Safe to call after every holdings fetch — it will silently skip if the
 * dataset was already regenerated within the debounce window.
 *
 * The DB trigger (migration 20260325000002) also fires on every snapshot
 * INSERT, so this call is a safety-net for when the DB trigger is not yet
 * configured or the user opens the app between cron runs.
 */
export function autoTriggerDataset(userId: string): void {
    const now  = Date.now();
    const last = _lastTriggered[userId] ?? 0;

    if (now - last < _INTERVAL_MS) return; // too recent — skip

    // Mark immediately so concurrent calls in the same tick are deduplicated
    _lastTriggered[userId] = now;

    generateDataset(userId)
        .then(summary => {
            console.log(
                `[ML] Dataset generated: ${summary.portfolio_feature_rows} portfolio rows, ` +
                `${summary.position_feature_rows} position rows`
            );
        })
        .catch(err => {
            // Reset timestamp so the next holdings fetch will retry
            delete _lastTriggered[userId];
            console.warn('[ML] autoTriggerDataset failed (will retry next cycle):', err.message);
        });
}

/**
 * Starts a periodic background interval that regenerates the dataset every
 * `intervalMs` milliseconds while the app is in the foreground.
 * Returns a cleanup function — call it in a useEffect return.
 *
 * Usage:
 *   useEffect(() => schedulePeriodicRefresh(userId, 6 * 3600_000), [userId]);
 */
export function schedulePeriodicRefresh(
    userId: string,
    intervalMs = _INTERVAL_MS
): () => void {
    // Trigger once immediately (respects debounce)
    autoTriggerDataset(userId);

    const handle = setInterval(() => {
        autoTriggerDataset(userId);
    }, intervalMs);

    return () => clearInterval(handle);
}

import { supabase } from '@/src/lib/supabase';

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

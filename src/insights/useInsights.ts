import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/src/store/useAuthStore';
import { getInsights, generateDataset, PortfolioInsights } from '@/src/services/mlPipeline';

interface InsightsState {
    data:       PortfolioInsights | null;
    loading:    boolean;
    refreshing: boolean;
    error:      string | null;
    /** true when no dataset has been generated yet */
    noDataset:  boolean;
}

export function useInsights() {
    const { session } = useAuthStore();
    const userId = session?.user?.id ?? null;

    const [state, setState] = useState<InsightsState>({
        data:       null,
        loading:    true,
        refreshing: false,
        error:      null,
        noDataset:  false,
    });

    // Prevent state updates after unmount
    const mounted = useRef(true);
    useEffect(() => { return () => { mounted.current = false; }; }, []);

    const fetchInsights = useCallback(async (isRefresh = false) => {
        if (!userId) return;
        if (!mounted.current) return;

        setState(s => ({ ...s, loading: !isRefresh, refreshing: isRefresh, error: null, noDataset: false }));

        try {
            const insights = await getInsights(userId);
            if (mounted.current) setState(s => ({ ...s, data: insights, loading: false, refreshing: false }));
        } catch (err: any) {
            const msg: string = err.message ?? 'Unknown error';
            // No dataset yet — offer to generate one
            if (msg.includes('No dataset') || msg.includes('generate_dataset')) {
                if (mounted.current) setState(s => ({ ...s, loading: false, refreshing: false, noDataset: true, error: null }));
            } else {
                if (mounted.current) setState(s => ({ ...s, loading: false, refreshing: false, error: msg }));
            }
        }
    }, [userId]);

    // Generate a fresh dataset then re-fetch insights
    const generateAndFetch = useCallback(async () => {
        if (!userId) return;
        setState(s => ({ ...s, loading: true, error: null, noDataset: false }));
        try {
            await generateDataset(userId);
            await fetchInsights(false);
        } catch (err: any) {
            if (mounted.current)
                setState(s => ({ ...s, loading: false, error: err.message ?? 'Failed to generate dataset' }));
        }
    }, [userId, fetchInsights]);

    const onRefresh = useCallback(() => fetchInsights(true), [fetchInsights]);

    useEffect(() => { fetchInsights(); }, [fetchInsights]);

    return { ...state, onRefresh, generateAndFetch };
}

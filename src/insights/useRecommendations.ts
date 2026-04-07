import { useCallback, useRef, useState } from 'react';
import { useAuthStore } from '@/src/store/useAuthStore';
import { getRecommendations, RecommendationsResult } from '@/src/services/mlPipeline';

interface RecommendationsState {
    data:     RecommendationsResult | null;
    loading:  boolean;
    error:    string | null;
}

export function useRecommendations() {
    const { session } = useAuthStore();
    const userId = session?.user?.id ?? null;

    const [state, setState] = useState<RecommendationsState>({
        data:    null,
        loading: false,
        error:   null,
    });

    const mounted = useRef(true);

    const fetchRecommendations = useCallback(async () => {
        if (!userId) return;
        if (!mounted.current) return;

        setState({ data: null, loading: true, error: null });

        try {
            const result = await getRecommendations(userId);
            if (mounted.current) setState({ data: result, loading: false, error: null });
        } catch (err: any) {
            const msg: string = err.message ?? 'Failed to generate recommendations';
            if (mounted.current) setState({ data: null, loading: false, error: msg });
        }
    }, [userId]);

    return { ...state, fetch: fetchRecommendations };
}

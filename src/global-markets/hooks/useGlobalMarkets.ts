import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/src/lib/supabase';
import type { GlobalIntelligence, LiveSector } from '../types';

// Sectors are now returned by the edge function (server-side Yahoo Finance call).
// This avoids client-side rate-limiting and IP blocks that cause 0% for all sectors.
async function getGlobalIntelligence(): Promise<GlobalIntelligence> {
    const { data, error } = await supabase.functions.invoke('market-intelligence', {});
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data as GlobalIntelligence;
}

export function useGlobalMarkets() {
    const [intelligence, setIntelligence] = useState<GlobalIntelligence | null>(null);
    const [sectors,      setSectors]      = useState<LiveSector[]>([]);
    const [loading,      setLoading]      = useState(true);
    const [refreshing,   setRefreshing]   = useState(false);
    const [error,        setError]        = useState<string | null>(null);
    const [needsSetup,   setNeedsSetup]   = useState(false);

    const mounted = useRef(true);
    useEffect(() => { return () => { mounted.current = false; }; }, []);

    const fetchAll = useCallback(async (isRefresh = false) => {
        if (!mounted.current) return;

        if (isRefresh) setRefreshing(true);
        else           setLoading(true);
        setError(null);
        setNeedsSetup(false);

        try {
            const intel = await getGlobalIntelligence();
            if (!mounted.current) return;

            if (intel.needs_setup) {
                setNeedsSetup(true);
                // sectors may still be present even when FRED key is missing
                if (intel.sectors?.length) setSectors(intel.sectors);
            } else {
                setIntelligence(intel);
                setSectors(intel.sectors ?? []);
            }
        } catch (e) {
            if (!mounted.current) return;
            setError(e instanceof Error ? e.message : 'Failed to load macro intelligence');
        }

        if (!mounted.current) return;
        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const onRefresh = useCallback(() => fetchAll(true), [fetchAll]);

    return { intelligence, sectors, loading, refreshing, error, needsSetup, onRefresh };
}

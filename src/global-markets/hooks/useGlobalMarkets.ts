import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/src/lib/supabase';
import { fetchQuotes, SECTOR_ETFS } from '@/src/market/service';
import type { GlobalIntelligence, LiveSector } from '../types';

async function getGlobalIntelligence(): Promise<GlobalIntelligence> {
    const { data, error } = await supabase.functions.invoke('market-intelligence', {});
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data as GlobalIntelligence;
}

async function getLiveSectors(): Promise<LiveSector[]> {
    const symbols   = SECTOR_ETFS.map(s => s.etf);
    const quotes    = await fetchQuotes(symbols);
    const quoteMap  = new Map(quotes.map(q => [q.symbol, q]));
    return SECTOR_ETFS.map(({ name, etf }) => {
        const q = quoteMap.get(etf);
        return { name, etf, changePct: q?.changePct ?? 0, price: q?.price ?? 0 };
    }).sort((a, b) => b.changePct - a.changePct);
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

        const [macroResult, sectorResult] = await Promise.allSettled([
            getGlobalIntelligence(),
            getLiveSectors(),
        ]);

        if (!mounted.current) return;

        if (macroResult.status === 'fulfilled') {
            const intel = macroResult.value;
            if (intel.needs_setup) {
                setNeedsSetup(true);
            } else {
                setIntelligence(intel);
            }
        } else {
            setError(macroResult.reason instanceof Error ? macroResult.reason.message : 'Failed to load macro intelligence');
        }

        if (sectorResult.status === 'fulfilled') {
            setSectors(sectorResult.value);
        }

        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const onRefresh = useCallback(() => fetchAll(true), [fetchAll]);

    return { intelligence, sectors, loading, refreshing, error, needsSetup, onRefresh };
}

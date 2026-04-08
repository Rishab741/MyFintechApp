import { supabase } from '@/src/lib/supabase';
import { useConnectionStore } from '@/src/store/useConnectionStore';
import { autoTriggerDataset } from '@/src/services/mlPipeline';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { SP500, getUnits, getTicker, getCurrency, getCategory, filterByPeriod, normalize100, computeRiskMetrics } from '../helpers';
import { HoldingsData, Snapshot, Period, AllocSeg, PerformerItem } from '../types';
import { PURPLE, BLUE, ORANGE, TEAL } from '../tokens';

export interface PortfolioDataResult {
    // state
    holdings: HoldingsData | null;
    snapshots: Snapshot[];
    loading: boolean;
    refreshing: boolean;
    connected: boolean;
    userName: string;
    lastUpdated: Date | null;
    period: Period;
    setPeriod: (p: Period) => void;
    headerAnim: Animated.Value;
    onRefresh: () => Promise<void>;
    // derived
    positions: NonNullable<HoldingsData['positions']>;
    balances: NonNullable<HoldingsData['balances']>;
    currency: string;
    cash: number;
    totalPos: number;
    totalVal: number;
    totalPnl: number;
    filteredSnaps: Snapshot[];
    snapValues: number[];
    benchValues: number[];
    chartPortfolio: number[];
    chartBench: number[];
    periodReturn: number;
    sp500Return: number;
    vsMarket: number;
    dailyReturns: number[];
    todayChange: number;
    todayChangePct: number;
    allocSegs: AllocSeg[];
    performers: { top: PerformerItem[]; bottom: PerformerItem[] };
    risk: ReturnType<typeof computeRiskMetrics>;
    chartLabels: string[];
    fetchError: string | null;
}

export function usePortfolioData(): PortfolioDataResult {
    const [holdings,    setHoldings]    = useState<HoldingsData | null>(null);
    const [snapshots,   setSnapshots]   = useState<Snapshot[]>([]);
    const [loading,     setLoading]     = useState(true);
    const [refreshing,  setRefreshing]  = useState(false);
    const [connected,   setConnected]   = useState(false);
    const [userName,    setUserName]    = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [period,      setPeriod]      = useState<Period>('ALL');
    const [fetchError,  setFetchError]  = useState<string | null>(null);

    const { brokerageConnected } = useConnectionStore();
    const headerAnim = useRef(new Animated.Value(0)).current;

    const init = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const meta = user.user_metadata;
        setUserName(meta?.full_name ?? meta?.name ?? user.email?.split('@')[0] ?? 'Investor');

        const { data: conn } = await supabase
            .from('snaptrade_connections').select('account_id').eq('user_id', user.id).maybeSingle();
        if (!conn?.account_id) { setConnected(false); setLoading(false); return; }
        setConnected(true);

        const { data: latestSnap } = await supabase
            .from('portfolio_snapshots').select('snapshot, captured_at')
            .eq('user_id', user.id).order('captured_at', { ascending: false }).limit(1).single();
        if (latestSnap?.snapshot) {
            setHoldings(latestSnap.snapshot as HoldingsData);
            setLastUpdated(new Date(latestSnap.captured_at));
        }

        const { data: histSnaps } = await supabase
            .from('portfolio_snapshots').select('snapshot, captured_at')
            .eq('user_id', user.id).order('captured_at', { ascending: true }).limit(90);
        if (histSnaps) setSnapshots(histSnaps as Snapshot[]);

        setLoading(false);
        Animated.timing(headerAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
        fetchFresh(user.id);
    }, []);

    useEffect(() => { init(); }, [init]);
    useEffect(() => { if (brokerageConnected && !connected) init(); }, [brokerageConnected]);

    const fetchFresh = async (userId: string) => {
        try {
            const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
                body: { action: 'snaptrade_get_holdings', user_id: userId },
            });
            if (error) {
                setFetchError(error.message ?? 'Failed to refresh holdings');
                return;
            }
            if (data?.error === 'brokerage_auth_expired') {
                // Authorization expired — edge function already cleared the DB row.
                // Reset local state so the UI shows the reconnect prompt.
                setConnected(false);
                setHoldings(null);
                setFetchError(data.message ?? 'Brokerage authorization expired. Please reconnect.');
                return;
            }
            if (data?.holdings) {
                setHoldings(data.holdings);
                setLastUpdated(new Date());
                setFetchError(null);
                // Fire-and-forget: regenerate ML dataset (debounced to once per 6 h)
                autoTriggerDataset(userId);
            } else if (data?.error) {
                setFetchError(data.message ?? data.error);
            }
        } catch (e: any) {
            setFetchError(e?.message ?? 'Failed to refresh holdings');
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await fetchFresh(user.id);
        setRefreshing(false);
    }, []);

    // Real-time subscription
    useEffect(() => {
        const sub = supabase.channel('portfolio_rt')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portfolio_snapshots' }, p => {
                if (p.new?.snapshot) {
                    setHoldings(p.new.snapshot as HoldingsData);
                    setLastUpdated(new Date(p.new.captured_at));
                    setSnapshots(prev => [...prev.slice(-89), p.new as Snapshot]);
                }
            }).subscribe();
        return () => { supabase.removeChannel(sub); };
    }, []);

    // 5-min background poll
    useEffect(() => {
        if (!connected) return;
        const poll = setInterval(async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) fetchFresh(user.id);
        }, 5 * 60 * 1000);
        return () => clearInterval(poll);
    }, [connected]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const positions = holdings?.positions ?? [];
    const balances  = holdings?.balances  ?? [];
    const currency  = getCurrency(balances[0]?.currency);
    const cash      = balances.reduce((s,b) => s + (b.cash ?? 0), 0);
    const totalPos  = positions.reduce((s,p) => s + getUnits(p) * (p.price ?? 0), 0);
    const totalVal  = totalPos + cash;
    const totalPnl  = positions.reduce((s,p) => s + (p.open_pnl ?? 0), 0);

    const filteredSnaps = filterByPeriod(snapshots, period);

    const snapValues = filteredSnaps.map(s => {
        const pos = s.snapshot?.positions ?? [];
        const bal = s.snapshot?.balances  ?? [];
        return pos.reduce((sum,p) => sum + getUnits(p) * (p.price ?? 0), 0)
             + bal.reduce((sum,b) => sum + (b.cash ?? 0), 0);
    }).filter(v => v > 0);

    const benchValues = filteredSnaps.map(s => {
        const d   = new Date(s.captured_at);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        return SP500[key] ?? SP500['2025-03'];
    });

    const chartPortfolio = normalize100(snapValues);
    const chartBench     = normalize100(benchValues);

    const periodReturn = chartPortfolio.length >= 2
        ? chartPortfolio[chartPortfolio.length-1] - chartPortfolio[0] : 0;
    const sp500Return  = chartBench.length >= 2
        ? chartBench[chartBench.length-1] - chartBench[0] : 0;
    const vsMarket     = periodReturn - sp500Return;

    const dailyReturns: number[] = snapValues.length >= 2
        ? snapValues.slice(1).map((v,i) => snapValues[i] > 0 ? ((v - snapValues[i]) / snapValues[i]) * 100 : 0)
        : [];

    const todayChange    = snapValues.length >= 2 ? snapValues[snapValues.length-1] - snapValues[snapValues.length-2] : 0;
    const todayChangePct = snapValues.length >= 2 && snapValues[snapValues.length-2] > 0
        ? (todayChange / snapValues[snapValues.length-2]) * 100 : 0;

    const allocSegs: AllocSeg[] = (() => {
        const b: Record<string,number> = { crypto:0, equity:0, etf:0 };
        positions.forEach(p => { const cat = getCategory(getTicker(p.symbol)); b[cat] += getUnits(p)*(p.price??0); });
        const t = totalVal || 1;
        return [
            { label:'Crypto',   value:b.crypto, color:PURPLE, pct:(b.crypto/t)*100 },
            { label:'Equities', value:b.equity, color:BLUE,   pct:(b.equity/t)*100 },
            { label:'ETFs',     value:b.etf,    color:ORANGE, pct:(b.etf/t)*100    },
            { label:'Cash',     value:cash,     color:TEAL,   pct:(cash/t)*100     },
        ].filter(s => s.pct > 0.1);
    })();

    const performers = (() => {
        if (snapshots.length < 2) return { top: [] as PerformerItem[], bottom: [] as PerformerItem[] };
        const first: Record<string,number> = {};
        (snapshots[0].snapshot?.positions ?? []).forEach(p => { first[getTicker(p.symbol)] = p.price ?? 0; });
        const items = positions.map(p => {
            const ticker = getTicker(p.symbol);
            const fp     = first[ticker] ?? 0;
            const cp     = p.price ?? 0;
            const pct    = fp > 0 && cp > 0 ? ((cp-fp)/fp)*100
                : (p.open_pnl && getUnits(p)*cp > 0 ? (p.open_pnl/(getUnits(p)*cp - p.open_pnl))*100 : 0);
            return { ticker, pct, value: getUnits(p)*cp, currency: p.currency };
        }).filter(p => p.value > 0);
        const sorted = [...items].sort((a,b) => b.pct - a.pct);
        return {
            top:    sorted.slice(0,3).filter(p => p.pct >= 0),
            bottom: [...sorted].reverse().slice(0,3).filter(p => p.pct < 0),
        };
    })();

    const risk = computeRiskMetrics(dailyReturns);

    const chartLabels = (() => {
        if (filteredSnaps.length < 2) return ['','',''];
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const f = new Date(filteredSnaps[0].captured_at);
        const l = new Date(filteredSnaps[filteredSnaps.length-1].captured_at);
        const m = new Date((f.getTime()+l.getTime())/2);
        return [MONTHS[f.getMonth()], MONTHS[m.getMonth()], MONTHS[l.getMonth()]];
    })();

    return {
        holdings, snapshots, loading, refreshing, connected, userName, lastUpdated,
        period, setPeriod, headerAnim, onRefresh,
        positions, balances, currency, cash, totalPos, totalVal, totalPnl,
        filteredSnaps, snapValues, benchValues, chartPortfolio, chartBench,
        periodReturn, sp500Return, vsMarket, dailyReturns, todayChange, todayChangePct,
        allocSegs, performers, risk, chartLabels, fetchError,
    };
}

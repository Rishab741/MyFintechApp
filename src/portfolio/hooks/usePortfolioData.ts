import { supabase } from '@/src/lib/supabase';
import { useConnectionStore } from '@/src/store/useConnectionStore';
import { autoTriggerDataset } from '@/src/services/mlPipeline';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { create } from 'zustand';
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

// ── Shared state store ────────────────────────────────────────────────────────
interface SharedState {
    holdings:    HoldingsData | null;
    snapshots:   Snapshot[];
    loading:     boolean;
    connected:   boolean;
    userName:    string;
    lastUpdated: Date | null;
    fetchError:  string | null;
    setHoldings:    (v: HoldingsData | null) => void;
    setSnapshots:   (v: Snapshot[]) => void;
    setLoading:     (v: boolean) => void;
    setConnected:   (v: boolean) => void;
    setUserName:    (v: string) => void;
    setLastUpdated: (v: Date | null) => void;
    setFetchError:  (v: string | null) => void;
}

const useShared = create<SharedState>((set) => ({
    holdings:    null,
    snapshots:   [],
    loading:     true,
    connected:   false,
    userName:    '',
    lastUpdated: null,
    fetchError:  null,
    setHoldings:    (holdings)    => set({ holdings }),
    setSnapshots:   (snapshots)   => set({ snapshots }),
    setLoading:     (loading)     => set({ loading }),
    setConnected:   (connected)   => set({ connected }),
    setUserName:    (userName)    => set({ userName }),
    setLastUpdated: (lastUpdated) => set({ lastUpdated }),
    setFetchError:  (fetchError)  => set({ fetchError }),
}));

// ── Module-level lifecycle guards ─────────────────────────────────────────────
let _subscriberCount = 0;
let _fetchInFlight   = false;
let _initGen         = 0;
let _cleanupRT: (() => void) | null = null;
let _pollTimer: ReturnType<typeof setInterval> | null = null;

// ── Connection type detection ─────────────────────────────────────────────────
// Returns which data source(s) the user has configured.
async function _detectSources(userId: string): Promise<{
    hasSnaptrade: boolean;
    hasExchange:  boolean;
    hasManual:    boolean;
}> {
    const [snapRes, exchRes, posRes] = await Promise.all([
        supabase
            .from('snaptrade_connections')
            .select('account_id')
            .eq('user_id', userId)
            .maybeSingle(),
        supabase
            .from('exchange_connections')
            .select('id')
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle(),
        supabase
            .from('user_positions')
            .select('id', { count: 'exact', head: true }),
    ]);
    return {
        hasSnaptrade: !!snapRes.data?.account_id,
        hasExchange:  !!exchRes.data?.id,
        hasManual:    (posRes.count ?? 0) > 0,
    };
}

// ── Build HoldingsData from manual user_positions (no live prices) ────────────
async function _buildManualHoldings(): Promise<HoldingsData | null> {
    const { data: positions } = await supabase
        .from('user_positions')
        .select('symbol, name, quantity, avg_cost, asset_class')
        .order('created_at', { ascending: true });

    if (!positions?.length) return null;

    return {
        account: { name: 'Manual Portfolio' },
        positions: positions.map((p: any) => ({
            symbol:      p.symbol,
            description: p.name ?? p.symbol,
            units:       p.quantity,
            quantity:    p.quantity,
            // avg_cost is the best proxy for "price" when no live feed is connected.
            // PnL will show as 0 until a live sync updates these values.
            price:       p.avg_cost ?? 0,
            currency:    'USD',
            type:        p.asset_class ?? 'stock',
            open_pnl:    0,
        })),
        balances: [],
    };
}

// ── Fetch fresh data from the right source ────────────────────────────────────
async function _fetchFresh(userId: string) {
    if (_fetchInFlight) return;
    _fetchInFlight = true;

    const {
        setHoldings, setLastUpdated, setFetchError, setConnected,
    } = useShared.getState();

    try {
        const { hasSnaptrade, hasExchange, hasManual } = await _detectSources(userId);

        if (hasSnaptrade) {
            // ── SnapTrade path ────────────────────────────────────────────────
            const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
                body: { action: 'snaptrade_get_holdings' },
            });
            if (error) { setFetchError(error.message ?? 'Failed to refresh holdings'); return; }

            if (data?.error === 'brokerage_auth_expired') {
                setConnected(false);
                setHoldings(null);
                setFetchError(data.message ?? 'Brokerage authorization expired. Please reconnect.');
                return;
            }
            if (data?.holdings) {
                setHoldings(data.holdings);
                setLastUpdated(new Date());
                setFetchError(null);
                autoTriggerDataset(userId);
            } else if (data?.error) {
                setFetchError(data.message ?? data.error);
            }

        } else if (hasExchange) {
            // ── Exchange API key path ─────────────────────────────────────────
            const { data, error } = await supabase.functions.invoke('sync-exchange', {});
            if (error) { setFetchError(error.message ?? 'Failed to sync exchange'); return; }

            if (data?.synced === false) {
                setFetchError(data.message ?? (data.errors?.[0] ?? 'Sync failed'));
                return;
            }
            // Snapshot was saved by the function — read it back so the hook
            // and the real-time subscription both reflect the same row.
            const { data: snap } = await supabase
                .from('portfolio_snapshots')
                .select('snapshot, captured_at')
                .eq('user_id', userId)
                .order('captured_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (snap?.snapshot) {
                setHoldings(snap.snapshot as HoldingsData);
                setLastUpdated(new Date(snap.captured_at));
                setFetchError(null);
                autoTriggerDataset(userId);
            }

        } else if (hasManual) {
            // ── Manual positions path ─────────────────────────────────────────
            const holdings = await _buildManualHoldings();
            if (holdings) {
                setHoldings(holdings);
                setLastUpdated(new Date());
                setFetchError(null);
            }
        }
    } catch (e: any) {
        setFetchError(e?.message ?? 'Failed to refresh portfolio');
    } finally {
        _fetchInFlight = false;
    }
}

async function _init(headerAnim: Animated.Value) {
    const gen = ++_initGen;
    const {
        setHoldings, setSnapshots, setLoading, setConnected, setUserName,
        setLastUpdated, setFetchError,
    } = useShared.getState();

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (gen !== _initGen) return;
        if (!user) { setLoading(false); return; }

        const meta = user.user_metadata;
        setUserName(meta?.full_name ?? meta?.name ?? user.email?.split('@')[0] ?? 'Investor');

        // Check all connection sources in parallel
        const { hasSnaptrade, hasExchange, hasManual } = await _detectSources(user.id);
        if (gen !== _initGen) return;

        if (!hasSnaptrade && !hasExchange && !hasManual) {
            setConnected(false);
            setLoading(false);
            return;
        }
        setConnected(true);

        // Load snapshot history (shared across all connection types)
        const [latestSnapRes, histSnapsRes] = await Promise.all([
            supabase
                .from('portfolio_snapshots')
                .select('snapshot, captured_at')
                .eq('user_id', user.id)
                .order('captured_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            supabase
                .from('portfolio_snapshots')
                .select('snapshot, captured_at')
                .eq('user_id', user.id)
                .order('captured_at', { ascending: true })
                .limit(90),
        ]);
        if (gen !== _initGen) return;

        if (latestSnapRes.data?.snapshot) {
            setHoldings(latestSnapRes.data.snapshot as HoldingsData);
            setLastUpdated(new Date(latestSnapRes.data.captured_at));
        }
        if (histSnapsRes.data) setSnapshots(histSnapsRes.data as Snapshot[]);

        setLoading(false);
        Animated.timing(headerAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();

        // If no snapshot yet (first connection), trigger a full sync immediately
        // so the user sees their data right away rather than waiting for the poll.
        if (!latestSnapRes.data) {
            if (hasManual && !hasSnaptrade && !hasExchange) {
                // Manual only — build from DB without a network call
                const holdings = await _buildManualHoldings();
                if (holdings && gen === _initGen) {
                    setHoldings(holdings);
                    setLastUpdated(new Date());
                }
            } else {
                await _fetchFresh(user.id);
            }
        } else {
            // Snapshot exists — refresh in background to pick up any changes
            await _fetchFresh(user.id);
        }
    } catch (e: any) {
        if (gen !== _initGen) return;
        setFetchError(e?.message ?? 'Failed to load portfolio');
        setLoading(false);
    }
}

function _startSubscription() {
    const channelName = `portfolio_rt_${Math.random().toString(36).slice(2)}`;
    const sub = supabase.channel(channelName)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portfolio_snapshots' }, p => {
            if (p.new?.snapshot) {
                const { setHoldings, setLastUpdated, setSnapshots, snapshots } = useShared.getState();
                setHoldings(p.new.snapshot as HoldingsData);
                setLastUpdated(new Date(p.new.captured_at));
                setSnapshots([...snapshots.slice(-89), p.new as Snapshot]);
            }
        }).subscribe();
    _cleanupRT = () => { supabase.removeChannel(sub); };
}

function _startPoll(userId: string) {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(() => { _fetchFresh(userId); }, 5 * 60 * 1000);
}

// ── Public hook ───────────────────────────────────────────────────────────────

export function usePortfolioData(): PortfolioDataResult {
    const [period,     setPeriod]     = useState<Period>('ALL');
    const [refreshing, setRefreshing] = useState(false);
    const headerAnim = useRef(new Animated.Value(0)).current;

    const {
        holdings, snapshots, loading, connected, userName, lastUpdated, fetchError,
    } = useShared();

    const { brokerageConnected } = useConnectionStore();

    useEffect(() => {
        _subscriberCount++;
        if (_subscriberCount === 1) {
            _init(headerAnim);
            _startSubscription();
        }
        return () => {
            _subscriberCount--;
            if (_subscriberCount === 0) {
                _cleanupRT?.();
                _cleanupRT = null;
                if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
            }
        };
    }, []);

    // Re-init when brokerage becomes connected (e.g. just finished SnapTrade portal)
    useEffect(() => {
        if (brokerageConnected && !connected) _init(headerAnim);
    }, [brokerageConnected]);

    // Start poll once connected (only from the first subscriber)
    useEffect(() => {
        if (!connected || _subscriberCount !== 1) return;
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) _startPoll(user.id);
        });
    }, [connected]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await _fetchFresh(user.id);
        setRefreshing(false);
    }, []);

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

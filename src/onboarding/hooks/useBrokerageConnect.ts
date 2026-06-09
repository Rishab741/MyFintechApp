import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  disconnectAccount,
  fetchBrokerageCatalogue,
  getBrokerageSummary,
  getSnapTradePortalUrl,
  listBrokerageAccounts,
  saveSnapTradeConnection,
  syncSnapTradeHoldings,
} from "../service";
import type { BrokerageAccount, BrokerageCatalogueItem, BrokerageSummary, PortalResult } from "../types";

interface UseBrokerageConnectReturn {
  // Catalogue
  catalogue:        BrokerageCatalogueItem[];
  isCatalogueLoading: boolean;
  searchQuery:      string;
  setSearchQuery:   (q: string) => void;
  filteredCatalogue: BrokerageCatalogueItem[];

  // Connected accounts
  accounts:         BrokerageAccount[];
  summary:          BrokerageSummary | null;
  isAccountsLoading: boolean;
  refreshAccounts:  () => Promise<void>;
  disconnect:       (accountId: string) => Promise<void>;

  // Portal flow
  isConnecting:     boolean;
  lastPortalResult: PortalResult | null;
  openPortal:       () => Promise<void>;
  syncHoldings:     () => Promise<void>;
  isSyncing:        boolean;
}

const CALLBACK_SCHEME = "myfintechapp://snaptrade-callback";

export function useBrokerageConnect(): UseBrokerageConnectReturn {
  const [catalogue,          setCatalogue]          = useState<BrokerageCatalogueItem[]>([]);
  const [isCatalogueLoading, setIsCatalogueLoading] = useState(false);
  const [searchQuery,        setSearchQuery]        = useState("");

  const [accounts,           setAccounts]           = useState<BrokerageAccount[]>([]);
  const [summary,            setSummary]            = useState<BrokerageSummary | null>(null);
  const [isAccountsLoading,  setIsAccountsLoading]  = useState(false);

  const [isConnecting,       setIsConnecting]       = useState(false);
  const [isSyncing,          setIsSyncing]          = useState(false);
  const [lastPortalResult,   setLastPortalResult]   = useState<PortalResult | null>(null);

  const pendingConnection = useRef(false);

  // ── Load catalogue ─────────────────────────────────────────────────────────
  useEffect(() => {
    setIsCatalogueLoading(true);
    fetchBrokerageCatalogue()
      .then(setCatalogue)
      .catch(() => {})
      .finally(() => setIsCatalogueLoading(false));
  }, []);

  const filteredCatalogue = catalogue.filter(b => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q);
  });

  // ── Load accounts ──────────────────────────────────────────────────────────
  const refreshAccounts = useCallback(async () => {
    setIsAccountsLoading(true);
    try {
      const [accts, summ] = await Promise.all([listBrokerageAccounts(), getBrokerageSummary()]);
      setAccounts(accts);
      setSummary(summ);
    } catch { /* swallow */ }
    finally { setIsAccountsLoading(false); }
  }, []);

  useEffect(() => { refreshAccounts(); }, [refreshAccounts]);

  const disconnect = useCallback(async (accountId: string) => {
    await disconnectAccount(accountId);
    setAccounts(prev => prev.filter(a => a.id !== accountId));
    refreshAccounts();
  }, [refreshAccounts]);

  // ── Deep-link callback handler ─────────────────────────────────────────────
  useEffect(() => {
    const sub = Linking.addEventListener("url", async ({ url }) => {
      if (!url.includes("snaptrade-callback") || !pendingConnection.current) return;
      pendingConnection.current = false;

      const parsed = new URL(url.replace("myfintechapp://", "https://platstock.app/"));
      const status = parsed.searchParams.get("status");
      const authId = parsed.searchParams.get("brokerage_authorization_id") ??
                     parsed.searchParams.get("authorizationId") ?? null;

      if (status !== "success") {
        setIsConnecting(false);
        setLastPortalResult({ status: "cancelled", accounts_connected: 0 });
        return;
      }

      try {
        const { accounts_connected } = await saveSnapTradeConnection(authId);
        await refreshAccounts();
        setLastPortalResult({ status: "connected", accounts_connected });
      } catch (e) {
        setLastPortalResult({
          status: "error",
          accounts_connected: 0,
          error: e instanceof Error ? e.message : "Connection failed",
        });
      } finally {
        setIsConnecting(false);
      }
    });
    return () => sub.remove();
  }, [refreshAccounts]);

  // ── Open SnapTrade portal ──────────────────────────────────────────────────
  const openPortal = useCallback(async () => {
    setIsConnecting(true);
    setLastPortalResult(null);
    try {
      const portalUrl = await getSnapTradePortalUrl();
      pendingConnection.current = true;
      // WebBrowser handles the redirect back to the app via deep link
      const result = await WebBrowser.openAuthSessionAsync(portalUrl, CALLBACK_SCHEME);
      if (result.type !== "success") {
        pendingConnection.current = false;
        setIsConnecting(false);
        setLastPortalResult({ status: "cancelled", accounts_connected: 0 });
      }
      // Success handled by deep-link listener above
    } catch (e) {
      pendingConnection.current = false;
      setIsConnecting(false);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "ALREADY_CONNECTED") {
        // User already connected — just refresh the list
        await refreshAccounts();
        setLastPortalResult({ status: "connected", accounts_connected: 0 });
      } else {
        setLastPortalResult({ status: "error", accounts_connected: 0, error: msg });
      }
    }
  }, [refreshAccounts]);

  // ── Sync holdings ──────────────────────────────────────────────────────────
  const syncHoldings = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncSnapTradeHoldings();
      await refreshAccounts();
    } catch { /* swallow */ }
    finally { setIsSyncing(false); }
  }, [refreshAccounts]);

  return {
    catalogue,
    isCatalogueLoading,
    searchQuery,
    setSearchQuery,
    filteredCatalogue,
    accounts,
    summary,
    isAccountsLoading,
    refreshAccounts,
    disconnect,
    isConnecting,
    lastPortalResult,
    openPortal,
    syncHoldings,
    isSyncing,
  };
}

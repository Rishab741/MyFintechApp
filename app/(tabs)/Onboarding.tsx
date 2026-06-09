/**
 * Onboarding.tsx — Platstock Connection Hub
 *
 * The universal brokerage onboarding screen. Users connect ANY of 150+
 * brokerages (Schwab, Fidelity, Robinhood, Coinbase, Questrade, etc.)
 * through SnapTrade's hosted portal — no OAuth code, no API keys.
 *
 * Sections:
 *   1. Connected accounts dashboard (status, last sync, reconnect prompts)
 *   2. Brokerage discovery grid (searchable, 150+ institutions)
 *   3. Add another account CTA
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBrokerageConnect } from "@/src/onboarding/hooks/useBrokerageConnect";
import type { BrokerageAccount, BrokerageCatalogueItem } from "@/src/onboarding/types";

// ── Tokens ────────────────────────────────────────────────────────────────────
const BG     = "#04070F";
const CARD   = "#0C1525";
const CARD2  = "#111E33";
const CYAN   = "#8FF5FF";
const GREEN  = "#00E09A";
const RED    = "#FF716C";
const AMBER  = "#F59E0B";
const PURPLE = "#AC89FF";
const BORDER = "rgba(143,245,255,0.10)";
const TXT    = "#F8FAFC";
const MUTED  = "#64748B";
const SUB    = "#94A3B8";
const mono   = Platform.OS === "ios" ? "Menlo" : "monospace";

// ── Brokerage logo tile ───────────────────────────────────────────────────────
function BrokerageTile({
  brokerage,
  onPress,
  connected,
}: {
  brokerage:  BrokerageCatalogueItem;
  onPress:    () => void;
  connected:  boolean;
}) {
  const color = brokerage.primary_color ?? (brokerage.is_crypto ? "#F59E0B" : CYAN);
  return (
    <Pressable
      style={[bt.tile, connected && bt.tileConnected]}
      onPress={onPress}
      android_ripple={{ color: CYAN + "22" }}
    >
      {brokerage.logo_url ? (
        <Image source={{ uri: brokerage.logo_url }} style={bt.logo} resizeMode="contain" />
      ) : (
        <View style={[bt.logoFallback, { backgroundColor: color + "20" }]}>
          <Text style={[bt.logoLetter, { color }]}>{brokerage.name[0]}</Text>
        </View>
      )}
      <Text style={bt.name} numberOfLines={2}>{brokerage.name}</Text>
      {brokerage.is_crypto && (
        <View style={bt.cryptoBadge}>
          <Text style={bt.cryptoBadgeTxt}>CRYPTO</Text>
        </View>
      )}
      {connected && (
        <View style={bt.checkBadge}>
          <MaterialCommunityIcons name="check-circle" size={14} color={GREEN} />
        </View>
      )}
    </Pressable>
  );
}

const bt = StyleSheet.create({
  tile: {
    width: "31%", alignItems: "center", padding: 12,
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    marginBottom: 10, position: "relative",
  },
  tileConnected: { borderColor: GREEN + "44", backgroundColor: GREEN + "08" },
  logo:          { width: 44, height: 44, marginBottom: 6, borderRadius: 8 },
  logoFallback:  { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  logoLetter:    { fontSize: 20, fontWeight: "800" },
  name:          { color: TXT, fontSize: 11, textAlign: "center", lineHeight: 15 },
  cryptoBadge:   { position: "absolute", top: 6, left: 6, backgroundColor: AMBER + "22", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  cryptoBadgeTxt:{ color: AMBER, fontSize: 8, fontFamily: mono, fontWeight: "700" },
  checkBadge:    { position: "absolute", top: 6, right: 6 },
});

// ── Connected account row ─────────────────────────────────────────────────────
function AccountRow({
  account,
  onDisconnect,
  onReconnect,
}: {
  account:     BrokerageAccount;
  onDisconnect: () => void;
  onReconnect:  () => void;
}) {
  const needsReconnect = account.reconnect_required;
  const statusColor    = needsReconnect ? AMBER : GREEN;
  const lastSync       = account.last_synced_at
    ? new Date(account.last_synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Never";

  return (
    <View style={[ar.row, needsReconnect && ar.rowWarn]}>
      {/* Logo */}
      {account.brokerage_logo_url ? (
        <Image source={{ uri: account.brokerage_logo_url }} style={ar.logo} resizeMode="contain" />
      ) : (
        <View style={ar.logoFallback}>
          <Text style={ar.logoLetter}>{(account.brokerage_name ?? "?")[0]}</Text>
        </View>
      )}

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={ar.name}>{account.brokerage_name ?? "Unknown"}</Text>
        <Text style={ar.sub}>
          {account.account_type ?? account.account_name ?? "Account"}
          {account.account_number ? ` · ${account.account_number}` : ""}
        </Text>
        <Text style={[ar.sync, { color: statusColor }]}>
          {needsReconnect ? "⚠ Reconnection required" : `Synced ${lastSync}`}
        </Text>
        {account.sync_error && (
          <Text style={ar.syncErr} numberOfLines={1}>{account.sync_error}</Text>
        )}
      </View>

      {/* Actions */}
      <View style={ar.actions}>
        {needsReconnect && (
          <Pressable style={ar.reconnectBtn} onPress={onReconnect}>
            <Text style={ar.reconnectTxt}>Reconnect</Text>
          </Pressable>
        )}
        <Pressable onPress={onDisconnect} hitSlop={10}>
          <MaterialCommunityIcons name="close-circle-outline" size={20} color={MUTED} />
        </Pressable>
      </View>
    </View>
  );
}

const ar = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: BORDER },
  rowWarn:   { borderColor: AMBER + "44", backgroundColor: AMBER + "06" },
  logo:      { width: 40, height: 40, borderRadius: 10 },
  logoFallback: { width: 40, height: 40, borderRadius: 10, backgroundColor: CARD2, alignItems: "center", justifyContent: "center" },
  logoLetter:{ color: CYAN, fontSize: 18, fontWeight: "800" },
  name:      { color: TXT, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  sub:       { color: MUTED, fontSize: 12, fontFamily: mono },
  sync:      { fontSize: 11, marginTop: 2 },
  syncErr:   { color: RED, fontSize: 10, marginTop: 1 },
  actions:   { flexDirection: "row", alignItems: "center", gap: 8 },
  reconnectBtn: { backgroundColor: AMBER + "20", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: AMBER + "44" },
  reconnectTxt: { color: AMBER, fontSize: 11, fontFamily: mono, fontWeight: "700" },
});

// ── Binance / manual API-key fallback (hidden by default) ────────────────────
// Only surfaced when user explicitly taps "Platform not listed?"
// Kept out of the primary flow so it never creates friction for 95% of users.
function BinanceFallback() {
  const [open,       setOpen]       = useState(false);
  const [exchange,   setExchange]   = useState<"binance" | "binance_us">("binance");
  const [apiKey,     setApiKey]     = useState("");
  const [apiSecret,  setApiSecret]  = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [done,       setDone]       = useState(false);

  const submit = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) { setError("Both fields are required."); return; }
    setLoading(true); setError(null);
    try {
      const { connectBinanceKey } = await import("@/src/import/service");
      await connectBinanceKey(apiKey.trim(), apiSecret.trim(), exchange);
      setDone(true); setApiKey(""); setApiSecret("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed — check your keys and try again.");
    } finally { setLoading(false); }
  };

  if (done) {
    return (
      <View style={bf.doneBox}>
        <MaterialCommunityIcons name="check-circle" size={18} color={GREEN} />
        <Text style={bf.doneTxt}>Binance connected successfully</Text>
      </View>
    );
  }

  return (
    <View style={bf.wrap}>
      <Pressable style={bf.toggle} onPress={() => setOpen(v => !v)}>
        <MaterialCommunityIcons name="help-circle-outline" size={16} color={MUTED} />
        <Text style={bf.toggleTxt}>Platform not listed? Connect manually</Text>
        <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={16} color={MUTED} />
      </Pressable>

      {open && (
        <View style={bf.panel}>
          <Text style={bf.panelTitle}>Manual API Key Connection</Text>
          <Text style={bf.panelSub}>
            For platforms not covered by the portal (primarily Binance).
            Create a <Text style={{ color: AMBER, fontWeight: "700" }}>read-only</Text> API key
            on your exchange — never enable trading or withdrawal permissions.
          </Text>

          {/* Exchange selector */}
          <View style={bf.segRow}>
            {(["binance", "binance_us"] as const).map(ex => (
              <Pressable
                key={ex}
                style={[bf.seg, exchange === ex && bf.segActive]}
                onPress={() => setExchange(ex)}
              >
                <Text style={[bf.segTxt, exchange === ex && bf.segTxtActive]}>
                  {ex === "binance" ? "Binance" : "Binance.US"}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={bf.inputLabel}>API Key</Text>
          <TextInput
            style={bf.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="Paste your API key"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={bf.secretHeader}>
            <Text style={bf.inputLabel}>Secret Key</Text>
            <Pressable onPress={() => setShowSecret(v => !v)}>
              <Text style={{ color: CYAN, fontSize: 12, fontFamily: mono }}>{showSecret ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
          <TextInput
            style={bf.input}
            value={apiSecret}
            onChangeText={setApiSecret}
            placeholder="Paste your secret key"
            placeholderTextColor={MUTED}
            secureTextEntry={!showSecret}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {error && (
            <View style={bf.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={14} color={RED} />
              <Text style={bf.errorTxt}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[bf.submitBtn, (loading || !apiKey || !apiSecret) && { opacity: 0.5 }]}
            onPress={submit}
            disabled={loading || !apiKey.trim() || !apiSecret.trim()}
          >
            {loading
              ? <ActivityIndicator color={BG} size="small" />
              : <Text style={bf.submitTxt}>Validate & Connect</Text>
            }
          </Pressable>
        </View>
      )}
    </View>
  );
}

const bf = StyleSheet.create({
  wrap:       { marginTop: 8, marginBottom: 4 },
  toggle:     { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 },
  toggleTxt:  { flex: 1, color: MUTED, fontSize: 13 },
  panel:      { backgroundColor: CARD2, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  panelTitle: { color: TXT, fontSize: 14, fontWeight: "700", marginBottom: 6 },
  panelSub:   { color: MUTED, fontSize: 12, lineHeight: 18, marginBottom: 16 },
  segRow:     { flexDirection: "row", backgroundColor: CARD, borderRadius: 10, padding: 3, marginBottom: 14 },
  seg:        { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  segActive:  { backgroundColor: CARD2 },
  segTxt:     { color: MUTED, fontSize: 13, fontFamily: mono },
  segTxtActive:{ color: TXT, fontWeight: "700" },
  inputLabel: { color: MUTED, fontSize: 10, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  input:      { backgroundColor: CARD, color: TXT, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 13, fontFamily: mono, borderWidth: 1, borderColor: BORDER, marginBottom: 10 },
  secretHeader:{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  errorBox:   { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: RED + "15", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: RED + "33", marginBottom: 10 },
  errorTxt:   { flex: 1, color: RED, fontSize: 12 },
  submitBtn:  { backgroundColor: "#F3BA2F", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  submitTxt:  { color: BG, fontSize: 14, fontWeight: "800" },
  doneBox:    { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: GREEN + "12", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: GREEN + "33", marginBottom: 8 },
  doneTxt:    { color: GREEN, fontSize: 13 },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();

  const {
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
  } = useBrokerageConnect();

  const [refreshing, setRefreshing] = useState(false);
  const [showAll,    setShowAll]    = useState(false);

  const connectedSlugs = new Set(accounts.map(a => a.brokerage_slug).filter(Boolean) as string[]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAccounts();
    setRefreshing(false);
  }, [refreshAccounts]);

  const handleConnectTile = (brokerage: BrokerageCatalogueItem) => {
    if (connectedSlugs.has(brokerage.slug)) {
      Alert.alert(
        `${brokerage.name} connected`,
        "This brokerage is already linked. You can add another account type or disconnect it.",
        [
          { text: "Add Another Account", onPress: openPortal },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return;
    }
    Alert.alert(
      `Connect ${brokerage.name}`,
      `You'll be taken to ${brokerage.name}'s official sign-in page via the SnapTrade portal. Platstock receives read-only access — no trading permissions.`,
      [
        { text: "Connect", onPress: openPortal },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const handleDisconnect = (account: BrokerageAccount) => {
    Alert.alert(
      `Disconnect ${account.brokerage_name ?? "account"}?`,
      "Your historical data stays in Platstock but live sync will stop.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => disconnect(account.id),
        },
      ],
    );
  };

  const featuredBrokerages = filteredCatalogue.filter(b => b.is_featured);
  const otherBrokerages    = filteredCatalogue.filter(b => !b.is_featured);
  const visibleOthers      = showAll ? otherBrokerages : otherBrokerages.slice(0, 12);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>CONNECT</Text>
          <Text style={s.headerSub}>150+ brokerages · no API keys needed</Text>
        </View>
        <Pressable onPress={syncHoldings} disabled={isSyncing} style={s.syncBtn}>
          {isSyncing
            ? <ActivityIndicator size="small" color={CYAN} />
            : <MaterialCommunityIcons name="refresh" size={20} color={CYAN} />
          }
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CYAN} />
        }
      >

        {/* Portal result banner */}
        {lastPortalResult && (
          <View style={[
            s.resultBanner,
            lastPortalResult.status === "connected" ? s.resultBannerGreen :
            lastPortalResult.status === "cancelled" ? s.resultBannerMuted :
            s.resultBannerRed,
          ]}>
            <MaterialCommunityIcons
              name={lastPortalResult.status === "connected" ? "check-circle" : "alert-circle-outline"}
              size={18}
              color={lastPortalResult.status === "connected" ? GREEN : lastPortalResult.status === "cancelled" ? MUTED : RED}
            />
            <Text style={s.resultBannerTxt}>
              {lastPortalResult.status === "connected"
                ? `${lastPortalResult.accounts_connected > 0 ? `${lastPortalResult.accounts_connected} account(s) connected` : "Already connected"} ✓`
                : lastPortalResult.status === "cancelled"
                ? "Connection cancelled"
                : lastPortalResult.error ?? "Connection failed"}
            </Text>
          </View>
        )}

        {/* Summary strip */}
        {summary && summary.total_accounts > 0 && (
          <View style={s.summaryStrip}>
            <View style={s.summaryItem}>
              <Text style={[s.summaryVal, { color: GREEN }]}>{summary.healthy_accounts}</Text>
              <Text style={s.summaryLbl}>Active</Text>
            </View>
            <View style={s.summarySep} />
            {summary.needs_reconnect > 0 && (
              <>
                <View style={s.summaryItem}>
                  <Text style={[s.summaryVal, { color: AMBER }]}>{summary.needs_reconnect}</Text>
                  <Text style={s.summaryLbl}>Need Reconnect</Text>
                </View>
                <View style={s.summarySep} />
              </>
            )}
            <View style={s.summaryItem}>
              <Text style={s.summaryVal}>{summary.total_accounts}</Text>
              <Text style={s.summaryLbl}>Total Accounts</Text>
            </View>
          </View>
        )}

        {/* Connected accounts */}
        {accounts.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Connected Accounts</Text>
            {accounts.map(acc => (
              <AccountRow
                key={acc.id}
                account={acc}
                onDisconnect={() => handleDisconnect(acc)}
                onReconnect={openPortal}
              />
            ))}
          </>
        )}

        {/* Primary CTA */}
        <Pressable
          style={[s.ctaBtn, isConnecting && s.ctaBtnLoading]}
          onPress={openPortal}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <>
              <ActivityIndicator color={BG} size="small" />
              <Text style={s.ctaBtnTxt}>Opening secure portal…</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="link-variant-plus" size={20} color={BG} />
              <Text style={s.ctaBtnTxt}>
                {accounts.length === 0 ? "Connect Your First Account" : "Add Another Account"}
              </Text>
            </>
          )}
        </Pressable>

        {/* How it works */}
        {accounts.length === 0 && (
          <View style={s.howItWorksCard}>
            <Text style={s.howTitle}>How it works</Text>
            {[
              ["1", "Tap Connect",        "We open the secure SnapTrade portal in your browser"],
              ["2", "Pick your brokerage","Choose from 150+ institutions — Schwab, Robinhood, Coinbase…"],
              ["3", "Sign in normally",   "You log in on your brokerage's official page, not ours"],
              ["4", "Read-only access",   "Platstock sees your positions and history. Zero trading permissions"],
            ].map(([n, title, desc]) => (
              <View key={n} style={s.howStep}>
                <View style={s.howNum}><Text style={s.howNumTxt}>{n}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.howStepTitle}>{title}</Text>
                  <Text style={s.howStepDesc}>{desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Brokerage discovery grid */}
        <Text style={[s.sectionTitle, { marginTop: 24 }]}>Browse All Brokerages</Text>
        <View style={s.searchBox}>
          <MaterialCommunityIcons name="magnify" size={16} color={MUTED} />
          <TextInput
            style={s.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search Schwab, Coinbase, Questrade…"
            placeholderTextColor={MUTED}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={16} color={MUTED} />
            </Pressable>
          )}
        </View>

        {isCatalogueLoading ? (
          <View style={s.catalogueLoading}>
            <ActivityIndicator color={CYAN} />
            <Text style={s.loadingTxt}>Loading brokerages…</Text>
          </View>
        ) : (
          <>
            {/* Featured */}
            {featuredBrokerages.length > 0 && !searchQuery && (
              <>
                <Text style={s.gridLabel}>Popular</Text>
                <View style={s.grid}>
                  {featuredBrokerages.map(b => (
                    <BrokerageTile
                      key={b.slug}
                      brokerage={b}
                      connected={connectedSlugs.has(b.slug)}
                      onPress={() => handleConnectTile(b)}
                    />
                  ))}
                </View>
              </>
            )}

            {/* All others */}
            {(searchQuery ? filteredCatalogue : otherBrokerages).length > 0 && (
              <>
                {!searchQuery && <Text style={s.gridLabel}>All Institutions</Text>}
                <View style={s.grid}>
                  {(searchQuery ? filteredCatalogue : visibleOthers).map(b => (
                    <BrokerageTile
                      key={b.slug}
                      brokerage={b}
                      connected={connectedSlugs.has(b.slug)}
                      onPress={() => handleConnectTile(b)}
                    />
                  ))}
                </View>
                {!searchQuery && !showAll && otherBrokerages.length > 12 && (
                  <Pressable style={s.showMoreBtn} onPress={() => setShowAll(true)}>
                    <Text style={s.showMoreTxt}>
                      Show {otherBrokerages.length - 12} more institutions
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={16} color={CYAN} />
                  </Pressable>
                )}
              </>
            )}

            {filteredCatalogue.length === 0 && searchQuery.length > 0 && (
              <View style={s.noResults}>
                <MaterialCommunityIcons name="bank-off-outline" size={36} color={MUTED} />
                <Text style={s.noResultsTxt}>No match for "{searchQuery}"</Text>
                <Text style={s.noResultsSub}>
                  Try the CSV Import tab to upload a statement from any platform.
                </Text>
              </View>
            )}
          </>
        )}

        {/* Platform not listed? — Binance & unsupported exchanges manual fallback */}
        <BinanceFallback />

        {/* Security footnote */}
        <View style={s.securityNote}>
          <MaterialCommunityIcons name="shield-lock-outline" size={14} color={MUTED} />
          <Text style={s.securityTxt}>
            Powered by SnapTrade. Platstock never sees your brokerage credentials.
            All connections are read-only — Platstock cannot place trades or withdraw funds.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG },
  scrollContent:{ paddingHorizontal: 16, paddingTop: 8 },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  headerTitle: { color: CYAN, fontSize: 16, fontWeight: "900", fontFamily: mono, letterSpacing: 2 },
  headerSub:   { color: MUTED, fontSize: 10, fontFamily: mono, marginTop: 1 },
  syncBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: CYAN + "15", alignItems: "center", justifyContent: "center" },

  // Result banner
  resultBanner:     { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1 },
  resultBannerGreen:{ backgroundColor: GREEN + "12", borderColor: GREEN + "33" },
  resultBannerMuted:{ backgroundColor: CARD, borderColor: BORDER },
  resultBannerRed:  { backgroundColor: RED + "12", borderColor: RED + "33" },
  resultBannerTxt:  { flex: 1, color: TXT, fontSize: 13 },

  // Summary strip
  summaryStrip: { flexDirection: "row", backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: BORDER },
  summaryItem:  { flex: 1, alignItems: "center" },
  summaryVal:   { color: TXT, fontSize: 22, fontWeight: "800", fontFamily: mono },
  summaryLbl:   { color: MUTED, fontSize: 10, fontFamily: mono, marginTop: 2 },
  summarySep:   { width: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginHorizontal: 8 },

  sectionTitle: { color: TXT, fontSize: 15, fontWeight: "700", marginBottom: 12 },

  // CTA
  ctaBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: CYAN, borderRadius: 16, paddingVertical: 17, marginBottom: 16 },
  ctaBtnLoading: { opacity: 0.7 },
  ctaBtnTxt:     { color: BG, fontSize: 16, fontWeight: "800" },

  // How it works
  howItWorksCard: { backgroundColor: CARD, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: BORDER, marginBottom: 8 },
  howTitle:       { color: TXT, fontSize: 14, fontWeight: "700", marginBottom: 16 },
  howStep:        { flexDirection: "row", gap: 14, marginBottom: 14, alignItems: "flex-start" },
  howNum:         { width: 26, height: 26, borderRadius: 13, backgroundColor: CYAN + "20", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CYAN + "44" },
  howNumTxt:      { color: CYAN, fontSize: 12, fontWeight: "800", fontFamily: mono },
  howStepTitle:   { color: TXT, fontSize: 13, fontWeight: "600", marginBottom: 2 },
  howStepDesc:    { color: MUTED, fontSize: 12, lineHeight: 18 },

  // Search
  searchBox:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: CARD2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: BORDER, marginBottom: 16 },
  searchInput: { flex: 1, color: TXT, fontSize: 14, fontFamily: mono },

  // Grid
  gridLabel: { color: MUTED, fontSize: 11, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  grid:      { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 0 },

  catalogueLoading: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingTxt:       { color: MUTED, fontSize: 13, fontFamily: mono },

  showMoreBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, marginBottom: 8 },
  showMoreTxt: { color: CYAN, fontSize: 13, fontFamily: mono },

  noResults:    { alignItems: "center", paddingVertical: 32, gap: 10 },
  noResultsTxt: { color: MUTED, fontSize: 15 },
  noResultsSub: { color: MUTED, fontSize: 12, textAlign: "center", paddingHorizontal: 20 },

  // Security
  securityNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: CARD2, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER, marginTop: 16 },
  securityTxt:  { flex: 1, color: MUTED, fontSize: 11, lineHeight: 18 },
});

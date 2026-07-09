/**
 * Connect.tsx — Platstock Exchange Connectivity
 *
 * Two connection paths:
 *   1. Coinbase — OAuth 2.0 (one-tap, no API keys shown to user)
 *   2. Binance / Binance.US — Guided API key entry with step-by-step instructions
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  buildCoinbaseAuthUrl,
  connectBinanceKey,
  disconnectExchange,
  exchangeCoinbaseCode,
  listConnections,
} from "@/src/import/service";
import { EXCHANGE_META, type ExchangeConnection, type ExchangeSlug } from "@/src/import/types";

import { QL, sans, mono } from "@/constants/Colors";
// ── Tokens ────────────────────────────────────────────────────────────────────
const BG     = QL.BG;
const CARD   = QL.CARD;
const CARD2  = QL.CARD2;
const GOLD   = QL.GOLD;
const GOLD_D = QL.GOLD_D;
const GREEN  = QL.GREEN;
const RED    = QL.RED;
const AMBER  = QL.AMBER;
const BORDER = QL.BORDER;
const TXT    = QL.TXT;
const MUTED  = QL.MUTED;
const SUB    = QL.TXT2;
const COINBASE_BLUE  = "#0052FF";
const BINANCE_YELLOW = "#F3BA2F";

// ── Deep-link redirect for Coinbase OAuth ─────────────────────────────────────
// Must be registered in app.json scheme and Coinbase dashboard.
const REDIRECT_URI = "myfintechapp://coinbase-callback";

// ── Connected exchange card ───────────────────────────────────────────────────
function ConnectedCard({
  conn,
  onDisconnect,
}: {
  conn: ExchangeConnection;
  onDisconnect: () => void;
}) {
  const meta    = EXCHANGE_META[conn.exchange] ?? { name: conn.label, color: GOLD, icon: "bank" };
  const expired = conn.token_expires_at ? new Date(conn.token_expires_at) < new Date() : false;

  return (
    <View style={cc.card}>
      <View style={[cc.icon, { backgroundColor: meta.color + "20" }]}>
        <MaterialCommunityIcons name={meta.icon as any} size={22} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={cc.name}>{conn.label}</Text>
        <Text style={cc.type}>{conn.connection_type === "oauth" ? "OAuth 2.0" : "API Key"}</Text>
        {conn.last_synced_at && (
          <Text style={cc.synced}>
            Last synced {new Date(conn.last_synced_at).toLocaleDateString()}
          </Text>
        )}
        {expired && <Text style={[cc.synced, { color: AMBER }]}>Token expired — reconnect</Text>}
        {conn.sync_error && <Text style={[cc.synced, { color: RED }]}>{conn.sync_error}</Text>}
      </View>
      <View style={[cc.statusDot, { backgroundColor: expired ? AMBER : GREEN }]} />
      <Pressable onPress={onDisconnect} style={cc.disconnectBtn} hitSlop={10}>
        <MaterialCommunityIcons name="link-variant-off" size={16} color={MUTED} />
      </Pressable>
    </View>
  );
}

const cc = StyleSheet.create({
  card:         { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER, marginBottom: 10 },
  icon:         { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name:         { color: TXT, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  type:         { color: MUTED, fontSize: 11, fontFamily: mono },
  synced:       { color: MUTED, fontSize: 11, marginTop: 2 },
  statusDot:    { width: 8, height: 8, borderRadius: 4 },
  disconnectBtn:{ width: 32, height: 32, borderRadius: 8, backgroundColor: CARD2, alignItems: "center", justifyContent: "center" },
});

// ── OAuth trust badge ─────────────────────────────────────────────────────────
function TrustBadge({ items }: { items: string[] }) {
  return (
    <View style={tb.wrap}>
      {items.map(item => (
        <View key={item} style={tb.row}>
          <MaterialCommunityIcons name="check-circle" size={14} color={GREEN} />
          <Text style={tb.txt}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const tb = StyleSheet.create({
  wrap: { backgroundColor: GREEN + "08", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: GREEN + "22", marginBottom: 16 },
  row:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  txt:  { color: SUB, fontSize: 12 },
});

// ── Binance guided steps ──────────────────────────────────────────────────────
const BINANCE_STEPS = [
  { n: "1", title: "Open Binance", body: 'Log into your Binance account and go to Profile → API Management (or search "API Management" in the top bar).' },
  { n: "2", title: "Create an API Key", body: 'Click "Create API" and choose "System-generated". Give it a name like "Platstock Read-Only".' },
  { n: "3", title: "Set permissions", body: 'Under "API restrictions", enable only "Enable Reading". Do NOT enable trading, withdrawals, or transfers.' },
  { n: "4", title: "Copy your keys", body: "Copy both the API Key and Secret Key. The Secret Key is only shown once — paste it below immediately." },
];

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ConnectScreen() {
  const insets = useSafeAreaInsets();

  const [connections,     setConnections]     = useState<ExchangeConnection[]>([]);
  const [isLoading,       setIsLoading]       = useState(true);
  const [activeFlow,      setActiveFlow]      = useState<"coinbase" | "binance" | "binance_us" | null>(null);

  // Coinbase OAuth state
  const [coinbaseLoading, setCoinbaseLoading] = useState(false);
  const [coinbaseError,   setCoinbaseError]   = useState<string | null>(null);

  // Binance key state
  const [binanceApiKey,    setBinanceApiKey]    = useState("");
  const [binanceApiSecret, setBinanceApiSecret] = useState("");
  const [binanceLoading,   setBinanceLoading]   = useState(false);
  const [binanceError,     setBinanceError]     = useState<string | null>(null);
  const [showSecret,       setShowSecret]       = useState(false);

  const loadConnections = useCallback(async () => {
    setIsLoading(true);
    try { setConnections(await listConnections()); }
    catch { /* swallow */ }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  // ── Handle Coinbase deep-link callback ────────────────────────────────────
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (!url.includes("coinbase-callback")) return;
      const parsed = new URL(url);
      const code   = parsed.searchParams.get("code");
      const error  = parsed.searchParams.get("error");
      if (error) {
        setCoinbaseError(error === "access_denied" ? "You denied access — tap Connect to try again." : error);
        setCoinbaseLoading(false);
        return;
      }
      if (code) {
        exchangeCoinbaseCode(code, REDIRECT_URI)
          .then(() => { setCoinbaseLoading(false); setActiveFlow(null); loadConnections(); })
          .catch(e => { setCoinbaseError(e.message); setCoinbaseLoading(false); });
      }
    });
    return () => sub.remove();
  }, [loadConnections]);

  // ── Coinbase OAuth initiation ─────────────────────────────────────────────
  const startCoinbaseOAuth = async () => {
    setCoinbaseError(null);
    setCoinbaseLoading(true);
    const authUrl = buildCoinbaseAuthUrl(REDIRECT_URI);
    const result  = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);
    if (result.type === "cancel" || result.type === "dismiss") {
      setCoinbaseLoading(false);
    }
    // Success handled by deep-link listener above
  };

  // ── Binance key submission ────────────────────────────────────────────────
  const submitBinanceKey = async () => {
    if (!binanceApiKey.trim() || !binanceApiSecret.trim()) {
      setBinanceError("Both API Key and Secret Key are required.");
      return;
    }
    setBinanceLoading(true);
    setBinanceError(null);
    try {
      const exchange = activeFlow as "binance" | "binance_us";
      await connectBinanceKey(binanceApiKey.trim(), binanceApiSecret.trim(), exchange);
      setBinanceApiKey("");
      setBinanceApiSecret("");
      setActiveFlow(null);
      loadConnections();
    } catch (e) {
      setBinanceError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setBinanceLoading(false);
    }
  };

  // ── Disconnect ────────────────────────────────────────────────────────────
  const handleDisconnect = (conn: ExchangeConnection) => {
    Alert.alert(
      `Disconnect ${conn.label}?`,
      "Your historical data stays in Platstock but we will stop syncing from this exchange.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              await disconnectExchange(conn.id);
              loadConnections();
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to disconnect");
            }
          },
        },
      ],
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Header */}
      <View style={s.header}>
        {activeFlow ? (
          <Pressable onPress={() => { setActiveFlow(null); setCoinbaseError(null); setBinanceError(null); }} hitSlop={12}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={TXT} />
          </Pressable>
        ) : <View style={{ width: 22 }} />}
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>CONNECT</Text>
          <Text style={s.headerSub}>Exchange Integrations</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      {/* ── Default view: exchange list + connected ── */}
      {!activeFlow && (
        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Connected exchanges */}
          {isLoading ? (
            <ActivityIndicator color={GOLD} style={{ marginTop: 24 }} />
          ) : connections.length > 0 ? (
            <>
              <Text style={s.sectionTitle}>Connected</Text>
              {connections.map(conn => (
                <ConnectedCard key={conn.id} conn={conn} onDisconnect={() => handleDisconnect(conn)} />
              ))}
            </>
          ) : null}

          {/* Add exchange */}
          <Text style={[s.sectionTitle, { marginTop: 20 }]}>Add Exchange</Text>
          <Text style={s.sectionSub}>
            Connect your exchange account to automatically sync your portfolio and transaction history.
          </Text>

          {/* Coinbase card */}
          <Pressable style={s.exchangeCard} onPress={() => setActiveFlow("coinbase")}>
            <View style={[s.exchangeIcon, { backgroundColor: COINBASE_BLUE + "20" }]}>
              <MaterialCommunityIcons name="bank" size={26} color={COINBASE_BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.exchangeName}>Coinbase</Text>
              <Text style={s.exchangeDesc}>Sign in with Coinbase — no API keys needed</Text>
            </View>
            <View style={s.oauthBadge}>
              <MaterialCommunityIcons name="shield-check" size={12} color={GREEN} />
              <Text style={s.oauthBadgeTxt}>OAuth 2.0</Text>
            </View>
          </Pressable>

          {/* Binance card */}
          <Pressable style={s.exchangeCard} onPress={() => setActiveFlow("binance")}>
            <View style={[s.exchangeIcon, { backgroundColor: BINANCE_YELLOW + "20" }]}>
              <MaterialCommunityIcons name="currency-btc" size={26} color={BINANCE_YELLOW} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.exchangeName}>Binance</Text>
              <Text style={s.exchangeDesc}>Connect via read-only API key</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={MUTED} />
          </Pressable>

          {/* Binance.US card */}
          <Pressable style={s.exchangeCard} onPress={() => setActiveFlow("binance_us")}>
            <View style={[s.exchangeIcon, { backgroundColor: BINANCE_YELLOW + "20" }]}>
              <MaterialCommunityIcons name="currency-btc" size={26} color={BINANCE_YELLOW} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.exchangeName}>Binance.US</Text>
              <Text style={s.exchangeDesc}>For US users — connect via read-only API key</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={MUTED} />
          </Pressable>

          {/* CSV fallback hint */}
          <View style={s.csvHint}>
            <MaterialCommunityIcons name="file-upload-outline" size={16} color={MUTED} />
            <Text style={s.csvHintTxt}>
              Don't see your exchange? Use the{" "}
              <Text style={{ color: GOLD }}>Import</Text>{" "}
              tab to upload a CSV or Excel export directly.
            </Text>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ── Coinbase OAuth flow ── */}
      {activeFlow === "coinbase" && (
        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          <View style={[s.exchangeHero, { backgroundColor: COINBASE_BLUE + "15" }]}>
            <MaterialCommunityIcons name="bank" size={40} color={COINBASE_BLUE} />
            <Text style={s.heroTitle}>Connect Coinbase</Text>
            <Text style={s.heroSub}>You'll be taken to Coinbase to approve read-only access, then brought straight back.</Text>
          </View>

          <TrustBadge items={[
            "Read-only — Platstock cannot trade or withdraw",
            "Your Coinbase credentials never touch our servers",
            "Revoke access from Coinbase at any time",
            "Token auto-refreshed — no need to reconnect",
          ]} />

          {coinbaseError && (
            <View style={s.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={RED} />
              <Text style={s.errorTxt}>{coinbaseError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.oauthBtn, { backgroundColor: COINBASE_BLUE }, coinbaseLoading && { opacity: 0.6 }]}
            onPress={startCoinbaseOAuth}
            disabled={coinbaseLoading}
            activeOpacity={0.8}
          >
            {coinbaseLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="bank" size={20} color="#fff" />
                <Text style={s.oauthBtnTxt}>Continue with Coinbase</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={s.legalTxt}>
            By connecting, you agree to Coinbase's Terms and grant Platstock read-only OAuth access to your account data.
          </Text>

          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      {/* ── Binance / Binance.US API key flow ── */}
      {(activeFlow === "binance" || activeFlow === "binance_us") && (
        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <View style={[s.exchangeHero, { backgroundColor: BINANCE_YELLOW + "15" }]}>
            <MaterialCommunityIcons name="currency-btc" size={40} color={BINANCE_YELLOW} />
            <Text style={s.heroTitle}>
              Connect {activeFlow === "binance_us" ? "Binance.US" : "Binance"}
            </Text>
            <Text style={s.heroSub}>Follow the steps below to create a read-only API key and paste it here.</Text>
          </View>

          {/* Step-by-step guide */}
          <Text style={s.sectionTitle}>How to get your API key</Text>
          {BINANCE_STEPS.map(step => (
            <View key={step.n} style={s.guideStep}>
              <View style={s.guideNum}>
                <Text style={s.guideNumTxt}>{step.n}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.guideTitle}>{step.title}</Text>
                <Text style={s.guideBody}>{step.body}</Text>
              </View>
            </View>
          ))}

          <TrustBadge items={[
            "Read-only — Platstock cannot trade or withdraw",
            "Restrict the key to Read permission only",
            "You can delete the key on Binance at any time",
          ]} />

          {/* Key inputs */}
          <Text style={s.inputLabel}>API Key</Text>
          <TextInput
            style={s.input}
            value={binanceApiKey}
            onChangeText={setBinanceApiKey}
            placeholder="Paste your Binance API key here"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={s.secretRow}>
            <Text style={s.inputLabel}>Secret Key</Text>
            <Pressable onPress={() => setShowSecret(v => !v)}>
              <Text style={s.showTxt}>{showSecret ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
          <TextInput
            style={s.input}
            value={binanceApiSecret}
            onChangeText={setBinanceApiSecret}
            placeholder="Paste your Binance Secret key here"
            placeholderTextColor={MUTED}
            secureTextEntry={!showSecret}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {binanceError && (
            <View style={s.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={RED} />
              <Text style={s.errorTxt}>{binanceError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.oauthBtn, { backgroundColor: BINANCE_YELLOW }, (binanceLoading || !binanceApiKey || !binanceApiSecret) && { opacity: 0.5 }]}
            onPress={submitBinanceKey}
            disabled={binanceLoading || !binanceApiKey.trim() || !binanceApiSecret.trim()}
            activeOpacity={0.8}
          >
            {binanceLoading ? (
              <ActivityIndicator color={BG} />
            ) : (
              <>
                <MaterialCommunityIcons name="shield-check" size={20} color={BG} />
                <Text style={[s.oauthBtnTxt, { color: BG }]}>Validate & Connect</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={s.legalTxt}>
            Keys are encrypted at rest. Platstock only uses them to read your portfolio data.
          </Text>

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG },
  scrollContent:{ paddingHorizontal: 16, paddingTop: 8 },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  headerTitle:{ color: GOLD, fontSize: 16, fontWeight: "900", fontFamily: mono, letterSpacing: 2 },
  headerSub:  { color: MUTED, fontSize: 10, fontFamily: mono, marginTop: 1 },

  sectionTitle: { color: TXT, fontSize: 15, fontWeight: "700", marginBottom: 4 },
  sectionSub:   { color: MUTED, fontSize: 13, lineHeight: 20, marginBottom: 16 },

  exchangeCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER, marginBottom: 10,
  },
  exchangeIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  exchangeName: { color: TXT, fontSize: 15, fontWeight: "700", marginBottom: 3 },
  exchangeDesc: { color: MUTED, fontSize: 12 },

  oauthBadge:   { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: GREEN + "15", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: GREEN + "33" },
  oauthBadgeTxt:{ color: GREEN, fontSize: 10, fontFamily: mono, fontWeight: "700" },

  csvHint: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: CARD2, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: BORDER, marginTop: 12,
  },
  csvHintTxt: { flex: 1, color: MUTED, fontSize: 13, lineHeight: 20 },

  exchangeHero: {
    alignItems: "center", borderRadius: 20, padding: 28,
    marginBottom: 20, gap: 10,
  },
  heroTitle: { color: TXT, fontSize: 20, fontWeight: "800", textAlign: "center" },
  heroSub:   { color: SUB, fontSize: 14, textAlign: "center", lineHeight: 22 },

  oauthBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 16, paddingVertical: 17, marginTop: 8, marginBottom: 12,
  },
  oauthBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },

  legalTxt: { color: MUTED, fontSize: 11, textAlign: "center", lineHeight: 18, paddingHorizontal: 16 },

  // Binance steps
  guideStep: { flexDirection: "row", gap: 14, marginBottom: 16 },
  guideNum:  { width: 28, height: 28, borderRadius: 14, backgroundColor: BINANCE_YELLOW + "20", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: BINANCE_YELLOW + "44", marginTop: 2 },
  guideNumTxt:{ color: BINANCE_YELLOW, fontSize: 13, fontWeight: "800", fontFamily: mono },
  guideTitle:{ color: TXT, fontSize: 14, fontWeight: "600", marginBottom: 4 },
  guideBody: { color: SUB, fontSize: 13, lineHeight: 20 },

  // Inputs
  inputLabel: { color: MUTED, fontSize: 11, fontFamily: mono, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase", marginTop: 12 },
  input: {
    backgroundColor: CARD2, color: TXT, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 13, fontFamily: mono,
    borderWidth: 1, borderColor: BORDER, marginBottom: 4,
  },
  secretRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  showTxt:   { color: GOLD, fontSize: 12, fontFamily: mono },

  errorBox:  { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: RED + "15", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: RED + "33", marginTop: 8, marginBottom: 4 },
  errorTxt:  { flex: 1, color: RED, fontSize: 13 },
});

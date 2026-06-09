/**
 * onboard.tsx — Platstock First-Run Experience
 *
 * Shown once: when a user has signed in but has zero brokerage accounts.
 * After they connect (or skip), they land on the main dashboard and never
 * see this screen again unless they disconnect everything.
 *
 * Steps:
 *   1. Welcome  — value proposition, brand moment
 *   2. Connect  — SnapTrade portal CTA (primary) + CSV upload (secondary)
 *   3. Syncing  — animated "building your dashboard" wait screen
 *   4. Done     — celebration, route to /(tabs)
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getSnapTradePortalUrl,
  saveSnapTradeConnection,
  syncSnapTradeHoldings,
} from "@/src/onboarding/service";

// ── Tokens ────────────────────────────────────────────────────────────────────
const BG    = "#04070F";
const CYAN  = "#8FF5FF";
const GREEN = "#00E09A";
const MUTED = "#64748B";
const SUB   = "#94A3B8";
const TXT   = "#F8FAFC";
const mono  = Platform.OS === "ios" ? "Menlo" : "monospace";
const { width: W, height: H } = Dimensions.get("window");

type Step = "welcome" | "connect" | "syncing" | "done";

// ── Animated gradient blob (pure RN, no native deps) ─────────────────────────
function FloatingBlob({ color, size, x, y, delay = 0 }: {
  color: string; size: number; x: number; y: number; delay?: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 3000, delay, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(anim, { toValue: 0, duration: 3000, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ]),
    ).start();
  }, []);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const opacity    = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.12, 0.22, 0.12] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: x, top: y,
        width: size, height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }],
      }}
    />
  );
}

// ── Step dot indicator ────────────────────────────────────────────────────────
function StepDots({ current, steps }: { current: Step; steps: Step[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
      {steps.map(s => (
        <View
          key={s}
          style={{
            width:  s === current ? 20 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: s === current ? CYAN : MUTED + "55",
          }}
        />
      ))}
    </View>
  );
}

// ── Syncing animation ─────────────────────────────────────────────────────────
const SYNC_MESSAGES = [
  "Connecting to your brokerage…",
  "Fetching your positions…",
  "Calculating performance…",
  "Building your analytics…",
  "Almost ready…",
];

function SyncingScreen({ onDone }: { onDone: () => void }) {
  const [msgIdx, setMsgIdx]   = useState(0);
  const [pct, setPct]         = useState(0);
  const barAnim               = useRef(new Animated.Value(0)).current;
  const fadeAnim              = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Progress bar animation
    Animated.timing(barAnim, {
      toValue: 1, duration: 4500,
      useNativeDriver: false, easing: Easing.out(Easing.quad),
    }).start(() => setTimeout(onDone, 400));

    // Message rotation
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i < SYNC_MESSAGES.length) {
        setMsgIdx(i);
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      } else {
        clearInterval(interval);
      }
    }, 900);

    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    return () => clearInterval(interval);
  }, []);

  const barW = barAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View style={sy.root}>
      <FloatingBlob color={CYAN}  size={260} x={-80}  y={80}  delay={0} />
      <FloatingBlob color={GREEN} size={180} x={W - 120} y={200} delay={1500} />

      <View style={sy.content}>
        {/* Animated ring */}
        <View style={sy.ringWrap}>
          <View style={sy.ring}>
            <MaterialCommunityIcons name="chart-arc" size={48} color={CYAN} />
          </View>
        </View>

        <Text style={sy.title}>Building your dashboard</Text>

        <Animated.Text style={[sy.msg, { opacity: fadeAnim }]}>
          {SYNC_MESSAGES[msgIdx]}
        </Animated.Text>

        {/* Progress bar */}
        <View style={sy.barTrack}>
          <Animated.View style={[sy.barFill, { width: barW }]} />
        </View>
      </View>
    </View>
  );
}

const sy = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" },
  content: { alignItems: "center", paddingHorizontal: 40, width: "100%" },
  ringWrap:{ marginBottom: 32 },
  ring:    { width: 96, height: 96, borderRadius: 48, backgroundColor: CYAN + "15", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: CYAN + "33" },
  title:   { color: TXT, fontSize: 22, fontWeight: "800", textAlign: "center", marginBottom: 14 },
  msg:     { color: MUTED, fontSize: 14, fontFamily: mono, textAlign: "center", marginBottom: 32 },
  barTrack:{ width: "100%", height: 4, backgroundColor: CYAN + "20", borderRadius: 2, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: CYAN, borderRadius: 2 },
});

// ── Main wizard ───────────────────────────────────────────────────────────────
export default function OnboardScreen() {
  const insets  = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("welcome");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError,  setConnectError]  = useState<string | null>(null);

  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const pendingRef = useRef(false);

  // ── Deep-link handler for SnapTrade callback ────────────────────────────────
  useEffect(() => {
    const sub = Linking.addEventListener("url", async ({ url }) => {
      if (!url.includes("snaptrade-callback") || !pendingRef.current) return;
      pendingRef.current = false;

      const parsed = new URL(url.replace("myfintechapp://", "https://x.com/"));
      const status = parsed.searchParams.get("status");
      const authId = parsed.searchParams.get("brokerage_authorization_id")
                  ?? parsed.searchParams.get("authorizationId")
                  ?? null;

      if (status !== "success") {
        setIsConnecting(false);
        setConnectError("Connection was cancelled. Tap Connect to try again.");
        return;
      }

      transitionTo("syncing");
      try {
        await saveSnapTradeConnection(authId);
        await syncSnapTradeHoldings();
      } catch { /* handled by syncing screen timing */ }
    });
    return () => sub.remove();
  }, []);

  const transitionTo = (next: Step) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setStep(next);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 80, useNativeDriver: true }),
      ]).start();
    });
    slideAnim.setValue(30);
  };

  const startPortal = async () => {
    setConnectError(null);
    setIsConnecting(true);
    try {
      const url = await getSnapTradePortalUrl();
      pendingRef.current = true;
      const res = await WebBrowser.openAuthSessionAsync(url, "myfintechapp://snaptrade-callback");
      if (res.type !== "success") {
        pendingRef.current = false;
        setIsConnecting(false);
      }
      // success handled by deep-link listener
    } catch (e) {
      pendingRef.current = false;
      setIsConnecting(false);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "ALREADY_CONNECTED") {
        transitionTo("syncing");
      } else {
        setConnectError("Couldn't open the connection portal. Check your internet and try again.");
      }
    }
  };

  const skipToApp = () => router.replace("/(tabs)");

  const WIZARD_STEPS: Step[] = ["welcome", "connect", "syncing", "done"];

  // ── Syncing step is special ───────────────────────────────────────────────
  if (step === "syncing") {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={BG} />
        <SyncingScreen onDone={() => transitionTo("done")} />
      </>
    );
  }

  return (
    <View style={[w.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Ambient blobs */}
      <FloatingBlob color={CYAN}  size={320} x={-100} y={-60}  delay={0} />
      <FloatingBlob color={GREEN} size={200} x={W - 140} y={H * 0.3} delay={800} />
      <FloatingBlob color={CYAN}  size={160} x={W * 0.2} y={H * 0.7} delay={1600} />

      <Animated.View style={[w.slide, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        {/* ── WELCOME ── */}
        {step === "welcome" && (
          <ScrollView contentContainerStyle={w.stepContent} showsVerticalScrollIndicator={false}>
            <View style={w.badge}>
              <Text style={w.badgeTxt}>PLATSTOCK</Text>
            </View>

            <Text style={w.hero}>Your wealth,{"\n"}finally unified.</Text>

            <Text style={w.sub}>
              Connect every account you invest in — stocks, ETFs, crypto, super —
              and see your complete financial picture in one intelligent dashboard.
            </Text>

            {/* Value props */}
            <View style={w.props}>
              {[
                ["chart-line",       CYAN,   "Live portfolio analytics across every account"],
                ["brain",            "#AC89FF", "AI insights that find patterns in your behavior"],
                ["shield-lock",      GREEN,  "Read-only access — Platstock cannot trade or withdraw"],
                ["lightning-bolt",   "#F59E0B", "Connect in 30 seconds via your brokerage's own login"],
              ].map(([icon, color, txt]) => (
                <View key={txt as string} style={w.propRow}>
                  <View style={[w.propIcon, { backgroundColor: (color as string) + "20" }]}>
                    <MaterialCommunityIcons name={icon as any} size={18} color={color as string} />
                  </View>
                  <Text style={w.propTxt}>{txt as string}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={w.primaryBtn}
              onPress={() => transitionTo("connect")}
            >
              <Text style={w.primaryBtnTxt}>Get started</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color={BG} />
            </Pressable>

            <Pressable onPress={skipToApp} style={w.skipBtn}>
              <Text style={w.skipTxt}>I'll do this later</Text>
            </Pressable>
          </ScrollView>
        )}

        {/* ── CONNECT ── */}
        {step === "connect" && (
          <ScrollView contentContainerStyle={w.stepContent} showsVerticalScrollIndicator={false}>

            <Text style={w.stepLabel}>STEP 1 OF 1</Text>
            <Text style={w.hero}>Connect your{"\n"}first account</Text>
            <Text style={w.sub}>
              We work with 150+ brokerages. You sign in on your brokerage's real website
              — Platstock never sees your password.
            </Text>

            {/* Primary CTA */}
            <Pressable
              style={[w.primaryBtn, isConnecting && w.primaryBtnLoading]}
              onPress={startPortal}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <>
                  <View style={w.spinnerDot} />
                  <Text style={w.primaryBtnTxt}>Opening portal…</Text>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons name="bank-outline" size={20} color={BG} />
                  <Text style={w.primaryBtnTxt}>Connect brokerage account</Text>
                </>
              )}
            </Pressable>

            {connectError && (
              <View style={w.errorBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#FF716C" />
                <Text style={w.errorTxt}>{connectError}</Text>
              </View>
            )}

            {/* Supported logos strip */}
            <View style={w.logosRow}>
              {["Schwab", "Fidelity", "Robinhood", "Coinbase", "IBKR", "Questrade"].map(name => (
                <View key={name} style={w.logoChip}>
                  <Text style={w.logoChipTxt}>{name}</Text>
                </View>
              ))}
              <View style={w.logoChip}>
                <Text style={w.logoChipTxt}>+144 more</Text>
              </View>
            </View>

            {/* Divider */}
            <View style={w.dividerRow}>
              <View style={w.dividerLine} />
              <Text style={w.dividerTxt}>or</Text>
              <View style={w.dividerLine} />
            </View>

            {/* CSV fallback */}
            <Pressable
              style={w.secondaryBtn}
              onPress={() => { router.replace("/(tabs)"); setTimeout(() => router.push("/(tabs)/Import" as any), 300); }}
            >
              <MaterialCommunityIcons name="file-upload-outline" size={18} color={CYAN} />
              <Text style={w.secondaryBtnTxt}>Upload a CSV or Excel statement</Text>
            </Pressable>

            <Text style={w.csvNote}>
              Use this if your platform isn't in the portal (e.g. Binance, some pension funds).
              Import your transaction history directly from a file export.
            </Text>

            {/* Trust */}
            <View style={w.trustRow}>
              <MaterialCommunityIcons name="shield-check" size={14} color={GREEN} />
              <Text style={w.trustTxt}>
                Powered by SnapTrade · Read-only · No trading permissions · Cancel anytime
              </Text>
            </View>

            <Pressable onPress={skipToApp} style={w.skipBtn}>
              <Text style={w.skipTxt}>Skip for now</Text>
            </Pressable>
          </ScrollView>
        )}

        {/* ── DONE ── */}
        {step === "done" && (
          <View style={[w.stepContent, { alignItems: "center", flex: 1, justifyContent: "center" }]}>

            <View style={w.successIcon}>
              <MaterialCommunityIcons name="check" size={48} color={GREEN} />
            </View>

            <Text style={[w.hero, { textAlign: "center", marginTop: 24 }]}>
              You're all set.
            </Text>
            <Text style={[w.sub, { textAlign: "center" }]}>
              Your portfolio is syncing. Data will be ready in your dashboard.
            </Text>

            <Pressable style={[w.primaryBtn, { marginTop: 32, backgroundColor: GREEN }]} onPress={skipToApp}>
              <Text style={w.primaryBtnTxt}>Open my dashboard</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color={BG} />
            </Pressable>

            <Pressable
              style={[w.secondaryBtn, { marginTop: 12 }]}
              onPress={() => transitionTo("connect")}
            >
              <MaterialCommunityIcons name="plus" size={18} color={CYAN} />
              <Text style={w.secondaryBtnTxt}>Add another account</Text>
            </Pressable>
          </View>
        )}

      </Animated.View>

      {/* Bottom dots — not shown on syncing/done */}
      {(step === "welcome" || step === "connect") && (
        <View style={w.dotsRow}>
          <StepDots current={step} steps={["welcome", "connect"]} />
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const w = StyleSheet.create({
  root:  { flex: 1, backgroundColor: BG },
  slide: { flex: 1 },

  stepContent: { paddingHorizontal: 28, paddingTop: 32, paddingBottom: 24, flexGrow: 1 },

  badge:    { alignSelf: "flex-start", backgroundColor: CYAN + "18", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: CYAN + "33", marginBottom: 28 },
  badgeTxt: { color: CYAN, fontSize: 11, fontFamily: mono, fontWeight: "800", letterSpacing: 2 },

  stepLabel: { color: MUTED, fontSize: 11, fontFamily: mono, letterSpacing: 1.5, marginBottom: 16 },

  hero: { color: TXT, fontSize: 38, fontWeight: "900", lineHeight: 46, marginBottom: 18, letterSpacing: -0.5 },
  sub:  { color: SUB, fontSize: 16, lineHeight: 26, marginBottom: 32 },

  // Value props
  props:   { gap: 14, marginBottom: 36 },
  propRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  propIcon:{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  propTxt: { flex: 1, color: TXT, fontSize: 14, lineHeight: 22, paddingTop: 6 },

  // Buttons
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, backgroundColor: CYAN, borderRadius: 18,
    paddingVertical: 18, marginBottom: 12,
  },
  primaryBtnLoading: { opacity: 0.7 },
  primaryBtnTxt: { color: BG, fontSize: 17, fontWeight: "800" },

  spinnerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BG, opacity: 0.7 },

  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: "transparent", borderRadius: 16,
    paddingVertical: 15, borderWidth: 1.5, borderColor: CYAN + "44",
    marginBottom: 12,
  },
  secondaryBtnTxt: { color: CYAN, fontSize: 15, fontWeight: "700" },

  skipBtn: { alignItems: "center", paddingVertical: 14 },
  skipTxt: { color: MUTED, fontSize: 14 },

  // Error
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FF716C18", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#FF716C33", marginBottom: 16 },
  errorTxt: { flex: 1, color: "#FF716C", fontSize: 13 },

  // Logos strip
  logosRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 24 },
  logoChip: { backgroundColor: "#ffffff08", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#ffffff12" },
  logoChipTxt: { color: MUTED, fontSize: 11, fontFamily: mono },

  // Divider
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  dividerLine:{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#ffffff15" },
  dividerTxt: { color: MUTED, fontSize: 13 },

  // CSV note
  csvNote: { color: MUTED, fontSize: 12, lineHeight: 18, textAlign: "center", marginBottom: 20, paddingHorizontal: 8 },

  // Trust strip
  trustRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12 },
  trustTxt: { color: MUTED, fontSize: 11, textAlign: "center", flex: 1 },

  // Success
  successIcon: { width: 104, height: 104, borderRadius: 52, backgroundColor: GREEN + "20", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: GREEN + "44" },

  dotsRow: { alignItems: "center", paddingBottom: 8 },
});

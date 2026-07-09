/**
 * onboard.tsx — Platstock First-Run Experience
 *
 * Connection methods (all free, unlimited users):
 *   1. Coinbase OAuth  — live sync, 1-click login via Coinbase
 *   2. Binance API Key — live sync, paste a read-only key from Binance settings
 *   3. CSV Import      — one-off or periodic, works for every broker on earth
 *   4. Manual entry    — search any ticker and type how many shares you own
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/src/lib/supabase';
import { searchAssets } from '@/src/comparison/service';
import type { ComparisonAsset } from '@/src/comparison/types';
import { addPosition, markOnboarded } from '@/src/portfolio/positionsService';
import { QL } from '@/constants/Colors';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = QL.BG;
const CARD   = QL.CARD;
const CARD2  = QL.CARD2;
const CYAN   = QL.GOLD;
const GREEN  = QL.GREEN;
const AMBER  = QL.AMBER;
const VIOLET = QL.AMBER;
const MUTED  = QL.MUTED;
const SUB    = QL.TXT2;
const TXT    = QL.TXT;
const RED    = QL.RED;
const BORDER = QL.BORDER;
const mono   = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const { width: W, height: H } = Dimensions.get('window');

// Module-level constant so it's read at build time (Babel substitution)
const FUNCTIONS_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/functions/v1';

type Step = 'welcome' | 'connect' | 'binance' | 'manual' | 'done';
type BinanceNet = 'binance' | 'binance_us' | 'kraken' | 'kucoin';

interface PendingPosition {
  symbol: string; name: string; asset_class: string;
  quantity: string; avg_cost: string;
}

// ── Ambient blob ──────────────────────────────────────────────────────────────
function FloatingBlob({ color, size, x, y, delay = 0 }: {
  color: string; size: number; x: number; y: number; delay?: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 3200, delay, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      Animated.timing(anim, { toValue: 0, duration: 3200,          useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
    ])).start();
  }, []);
  const ty = anim.interpolate({ inputRange: [0,1], outputRange: [0,-16] });
  const op = anim.interpolate({ inputRange: [0,0.5,1], outputRange: [0.09,0.18,0.09] });
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', left: x, top: y, width: size, height: size,
      borderRadius: size/2, backgroundColor: color, opacity: op, transform: [{ translateY: ty }],
    }} />
  );
}

// ── Platform card ─────────────────────────────────────────────────────────────
function PlatCard({
  icon, label, sublabel, accent, badge, onPress, loading, disabled,
}: {
  icon: any; label: string; sublabel: string; accent: string;
  badge?: string; onPress: () => void; loading?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable
      style={[pc.card, { borderColor: accent + '33' }, disabled && { opacity: 0.45 }]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      <View style={[pc.iconWrap, { backgroundColor: accent + '1A' }]}>
        <MaterialCommunityIcons name={icon} size={28} color={accent} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={pc.label}>{label}</Text>
          {badge && (
            <View style={[pc.badge, { backgroundColor: accent + '22' }]}>
              <Text style={[pc.badgeTxt, { color: accent }]}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={pc.sub}>{sublabel}</Text>
      </View>
      {loading
        ? <ActivityIndicator size="small" color={accent} />
        : <MaterialCommunityIcons name="chevron-right" size={20} color={MUTED} />
      }
    </Pressable>
  );
}
const pc = StyleSheet.create({
  card:    { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 18, padding: 16, borderWidth: 1, marginBottom: 12 },
  iconWrap:{ width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label:   { color: TXT,  fontSize: 15, fontWeight: '700' },
  sub:     { color: MUTED, fontSize: 12, marginTop: 3, lineHeight: 17 },
  badge:   { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeTxt:{ fontSize: 10, fontWeight: '700', fontFamily: mono },
});

// ── Main ──────────────────────────────────────────────────────────────────────
export default function OnboardScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('welcome');
  const [connectedPlatform, setConnectedPlatform] = useState<string | null>(null);
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // ── Exchange API key state ─────────────────────────────────────────────────
  const [bnKey,        setBnKey]        = useState('');
  const [bnSecret,     setBnSecret]     = useState('');
  const [bnPassphrase, setBnPassphrase] = useState('');  // KuCoin only
  const [bnNet,        setBnNet]        = useState<BinanceNet>('binance');
  const [bnLoading,    setBnLoading]    = useState(false);
  const [bnError,      setBnError]      = useState<string | null>(null);

  // ── Manual entry state ─────────────────────────────────────────────────────
  const [query,     setQuery]    = useState('');
  const [results,   setResults]  = useState<ComparisonAsset[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected,  setSelected] = useState<ComparisonAsset | null>(null);
  const [qtyInput,  setQtyInput] = useState('');
  const [costInput, setCostInput] = useState('');
  const [pending,   setPending]  = useState<PendingPosition[]>([]);
  const [mnLoading, setMnLoading] = useState(false);
  const [mnError,   setMnError]  = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preload featured assets when entering manual step
  const loadFeatured = useCallback(() => {
    searchAssets('').then(setResults).catch(() => {});
  }, []);

  const EXCHANGE_LABELS: Record<BinanceNet, string> = {
    binance:    'Binance',
    binance_us: 'Binance.US',
    kraken:     'Kraken',
    kucoin:     'KuCoin',
  };

  const handleExchangeConnect = async () => {
    if (!bnKey.trim() || !bnSecret.trim()) {
      setBnError('Both API Key and Secret are required.');
      return;
    }
    if (bnNet === 'kucoin' && !bnPassphrase.trim()) {
      setBnError('KuCoin also requires an API Passphrase — set one when you created the key.');
      return;
    }
    setBnLoading(true);
    setBnError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // KuCoin: encode secret as "secret|passphrase" so the edge function can split them
      const apiSecret = bnNet === 'kucoin'
        ? `${bnSecret.trim()}|${bnPassphrase.trim()}`
        : bnSecret.trim();

      const res = await fetch(`${FUNCTIONS_URL}/coinbase-oauth/binance-key`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ api_key: bnKey.trim(), api_secret: apiSecret, exchange: bnNet }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not save your API key. Please try again.');

      await markOnboarded();
      setConnectedPlatform(EXCHANGE_LABELS[bnNet]);
      transitionTo('done');
    } catch (e) {
      setBnError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setBnLoading(false);
    }
  };

  // ── Manual entry handlers ──────────────────────────────────────────────────
  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchAssets(q)); } catch { /* keep prev */ }
      finally { setSearching(false); }
    }, 280);
  }, []);

  const handleAddPending = () => {
    if (!selected) return;
    const qty = parseFloat(qtyInput);
    if (isNaN(qty) || qty <= 0) return;
    setPending(prev => {
      const exists = prev.find(p => p.symbol === selected.symbol);
      if (exists) return prev.map(p => p.symbol === selected.symbol ? { ...p, quantity: qtyInput, avg_cost: costInput } : p);
      return [...prev, { symbol: selected.symbol, name: selected.name, asset_class: selected.asset_class ?? 'stock', quantity: qtyInput, avg_cost: costInput }];
    });
    setSelected(null);
    setQuery('');
    loadFeatured();
  };

  const handleFinishManual = async () => {
    setMnLoading(true);
    setMnError(null);
    try {
      for (const pos of pending) {
        await addPosition({ symbol: pos.symbol, name: pos.name, quantity: parseFloat(pos.quantity), avg_cost: pos.avg_cost ? parseFloat(pos.avg_cost) : null, asset_class: pos.asset_class });
      }
      await markOnboarded();
      setConnectedPlatform(pending.length > 0 ? `${pending.length} position${pending.length > 1 ? 's' : ''}` : null);
      transitionTo('done');
    } catch (e) {
      setMnError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setMnLoading(false);
    }
  };

  const handleSkip = async () => {
    await markOnboarded().catch(() => {});
    router.replace('/(tabs)');
  };

  const handleImportCSV = async () => {
    await markOnboarded().catch(() => {});
    router.replace('/(tabs)');
    setTimeout(() => router.push('/(tabs)/Import' as any), 350);
  };

  // ── Step transition ────────────────────────────────────────────────────────
  const transitionTo = (next: Step) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      if (next === 'manual') loadFeatured();
      setStep(next);
      slideAnim.setValue(24);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 80, useNativeDriver: true }),
      ]).start();
    });
  };

  const addedSymbols = new Set(pending.map(p => p.symbol));

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <FloatingBlob color={CYAN}  size={300} x={-90}   y={-50}      delay={0}    />
      <FloatingBlob color={GREEN} size={180} x={W-120}  y={H * 0.35} delay={900}  />
      <FloatingBlob color={CYAN}  size={140} x={W*0.15} y={H * 0.72} delay={1700} />

      <Animated.View style={[s.slide, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        {/* ══ WELCOME ══════════════════════════════════════════════════════════ */}
        {step === 'welcome' && (
          <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
            <View style={s.badge}><Text style={s.badgeTxt}>PLATSTOCK</Text></View>
            <Text style={s.hero}>Your wealth,{'\n'}finally unified.</Text>
            <Text style={s.sub}>
              Connect every account you invest in — stocks, ETFs, crypto — and see your
              complete picture in one intelligent dashboard.
            </Text>
            <View style={s.propList}>
              {([
                ['chart-line',   CYAN,   'Live portfolio analytics across all your positions'],
                ['brain',        VIOLET, 'AI insights that find patterns in your behaviour'],
                ['clock-fast',   GREEN,  'Set up in 60 seconds. No full bank login needed.'],
                ['shield-lock',  AMBER,  'Read-only access — Platstock can never trade or withdraw'],
              ] as const).map(([icon, color, txt]) => (
                <View key={txt} style={s.propRow}>
                  <View style={[s.propIcon, { backgroundColor: color + '1C' }]}>
                    <MaterialCommunityIcons name={icon as any} size={18} color={color} />
                  </View>
                  <Text style={s.propTxt}>{txt}</Text>
                </View>
              ))}
            </View>
            <Pressable style={s.primary} onPress={() => transitionTo('connect')}>
              <Text style={s.primaryTxt}>Get started</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color={BG} />
            </Pressable>
            <Pressable onPress={handleSkip} style={s.skip}>
              <Text style={s.skipTxt}>I'll do this later</Text>
            </Pressable>
          </ScrollView>
        )}

        {/* ══ CONNECT ══════════════════════════════════════════════════════════ */}
        {step === 'connect' && (
          <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
            <Text style={s.stepLabel}>CONNECT YOUR ACCOUNTS</Text>
            <Text style={[s.hero, { fontSize: 28, marginBottom: 8 }]}>How would you{'\n'}like to connect?</Text>
            <Text style={[s.sub, { marginBottom: 24 }]}>
              All options are free and work for unlimited users. You can add more accounts anytime from the Portfolio tab.
            </Text>

            {/* Section: Live sync via API key */}
            <Text style={s.sectionLabel}>LIVE SYNC — CRYPTO EXCHANGES</Text>

            <PlatCard
              icon="swap-horizontal"
              label="Binance / Binance.US / Kraken / KuCoin"
              sublabel="Generate a free read-only API key in your exchange settings. No developer account needed."
              accent={AMBER}
              badge="LIVE SYNC"
              onPress={() => { setBnNet('binance'); setBnKey(''); setBnSecret(''); setBnError(null); transitionTo('binance'); }}
            />

            {/* Divider */}
            <View style={s.divRow}>
              <View style={s.divLine} />
              <Text style={s.divTxt}>or</Text>
              <View style={s.divLine} />
            </View>

            {/* Section: Import / manual */}
            <Text style={s.sectionLabel}>TRADITIONAL BROKERS & STOCKS</Text>

            <PlatCard
              icon="file-upload-outline"
              label="Import from CSV"
              sublabel="Works with every broker — Schwab, Fidelity, Robinhood, IBKR, Vanguard. Just export a CSV from your broker's app."
              accent={GREEN}
              onPress={handleImportCSV}
            />

            <PlatCard
              icon="pencil-outline"
              label="Add holdings manually"
              sublabel="Search any stock, ETF, or crypto ticker and type how many you own. Quick and simple."
              accent={CYAN}
              onPress={() => transitionTo('manual')}
            />

            <Pressable onPress={handleSkip} style={s.skip}>
              <Text style={s.skipTxt}>Skip for now</Text>
            </Pressable>
          </ScrollView>
        )}

        {/* ══ EXCHANGE API KEY ══════════════════════════════════════════════════ */}
        {step === 'binance' && (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
              <Pressable onPress={() => transitionTo('connect')} style={s.backRow}>
                <MaterialCommunityIcons name="arrow-left" size={18} color={MUTED} />
                <Text style={s.backTxt}>Back</Text>
              </Pressable>

              <Text style={s.stepLabel}>EXCHANGE API KEY</Text>
              <Text style={[s.hero, { fontSize: 26, marginBottom: 8 }]}>Connect your{'\n'}exchange</Text>
              <Text style={[s.sub, { marginBottom: 20 }]}>
                Go to your exchange's <Text style={{ color: TXT, fontWeight: '700' }}>API Management</Text> settings and create
                a <Text style={{ color: TXT, fontWeight: '700' }}>read-only</Text> key. Platstock cannot trade or withdraw.
              </Text>

              {/* Exchange picker */}
              <Text style={s.fieldLabel}>SELECT EXCHANGE</Text>
              <View style={s.exchangeGrid}>
                {([
                  ['binance',    'Binance'],
                  ['binance_us', 'Binance.US'],
                  ['kraken',     'Kraken'],
                  ['kucoin',     'KuCoin'],
                ] as [BinanceNet, string][]).map(([net, label]) => (
                  <Pressable
                    key={net}
                    style={[s.exchangeBtn, bnNet === net && s.exchangeBtnActive]}
                    onPress={() => { setBnNet(net); setBnPassphrase(''); }}
                  >
                    <Text style={[s.exchangeBtnTxt, bnNet === net && { color: BG }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>API KEY</Text>
              <TextInput
                style={s.field}
                placeholder={`Paste your ${EXCHANGE_LABELS[bnNet]} API key…`}
                placeholderTextColor={MUTED}
                value={bnKey}
                onChangeText={setBnKey}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={[s.fieldLabel, { marginTop: 12 }]}>API SECRET</Text>
              <TextInput
                style={s.field}
                placeholder={`Paste your ${EXCHANGE_LABELS[bnNet]} API secret…`}
                placeholderTextColor={MUTED}
                value={bnSecret}
                onChangeText={setBnSecret}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />

              {bnNet === 'kucoin' && (
                <>
                  <Text style={[s.fieldLabel, { marginTop: 12 }]}>API PASSPHRASE</Text>
                  <TextInput
                    style={s.field}
                    placeholder="Passphrase you set when creating the key…"
                    placeholderTextColor={MUTED}
                    value={bnPassphrase}
                    onChangeText={setBnPassphrase}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />
                </>
              )}

              {bnError && <ErrorNote msg={bnError} />}

              <View style={[s.infoBox, { marginTop: 14 }]}>
                <MaterialCommunityIcons name="shield-check-outline" size={15} color={GREEN} />
                <Text style={s.infoTxt}>
                  Only enable <Text style={{ color: TXT }}>Read</Text> / <Text style={{ color: TXT }}>View</Text> permissions.
                  Never enable withdrawal or trading permissions. Your keys are stored encrypted.
                </Text>
              </View>

              <Pressable
                style={[s.primary, { marginTop: 20 }, bnLoading && { opacity: 0.6 }]}
                onPress={handleExchangeConnect}
                disabled={bnLoading}
              >
                {bnLoading
                  ? <ActivityIndicator color={BG} />
                  : <><MaterialCommunityIcons name="link" size={18} color={BG} /><Text style={s.primaryTxt}>Connect {EXCHANGE_LABELS[bnNet]}</Text></>
                }
              </Pressable>

              <Pressable onPress={() => transitionTo('connect')} style={s.skip}>
                <Text style={s.skipTxt}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* ══ MANUAL ENTRY ══════════════════════════════════════════════════════ */}
        {step === 'manual' && (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.top}>
            <View style={{ flex: 1 }}>
              <View style={s.manualHeader}>
                <Pressable onPress={() => transitionTo('connect')} style={s.backRow}>
                  <MaterialCommunityIcons name="arrow-left" size={18} color={MUTED} />
                  <Text style={s.backTxt}>Back</Text>
                </Pressable>
                <Text style={s.stepLabel}>ADD HOLDINGS MANUALLY</Text>
                <Text style={[s.hero, { fontSize: 24, marginBottom: 4 }]}>Search & add{'\n'}your positions</Text>
                <Text style={[s.sub, { marginBottom: 0, fontSize: 13 }]}>
                  Enter the tickers you own and how many shares or coins you hold.
                </Text>
              </View>

              {/* Search */}
              <View style={s.searchRow}>
                <MaterialCommunityIcons name="magnify" size={18} color={MUTED} style={{ marginLeft: 12 }} />
                <TextInput
                  style={s.searchInput}
                  placeholder="AAPL, Bitcoin, S&P 500…"
                  placeholderTextColor={MUTED}
                  value={query}
                  onChangeText={q => { setQuery(q); doSearch(q); setSelected(null); }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                {searching
                  ? <ActivityIndicator size="small" color={CYAN} style={{ marginRight: 12 }} />
                  : query.length > 0 && (
                    <Pressable onPress={() => { setQuery(''); setSelected(null); loadFeatured(); }} style={{ marginRight: 12 }}>
                      <MaterialCommunityIcons name="close-circle" size={16} color={MUTED} />
                    </Pressable>
                  )
                }
              </View>

              {/* Inline qty form */}
              {selected && (
                <View style={s.inlineForm}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.inlineSymbol}>{selected.symbol}</Text>
                    <Text style={s.inlineName} numberOfLines={1}>{selected.name}</Text>
                  </View>
                  <TextInput style={s.inlineInput} placeholder="Qty" placeholderTextColor={MUTED} value={qtyInput} onChangeText={setQtyInput} keyboardType="decimal-pad" returnKeyType="next" />
                  <TextInput style={s.inlineInput} placeholder="Avg $" placeholderTextColor={MUTED} value={costInput} onChangeText={setCostInput} keyboardType="decimal-pad" returnKeyType="done" onSubmitEditing={handleAddPending} />
                  <Pressable style={[s.inlineAdd, (!qtyInput || parseFloat(qtyInput) <= 0) && { opacity: 0.4 }]} onPress={handleAddPending} disabled={!qtyInput || parseFloat(qtyInput) <= 0}>
                    <MaterialCommunityIcons name="plus" size={18} color={BG} />
                  </Pressable>
                  <Pressable style={s.inlineCancel} onPress={() => setSelected(null)}>
                    <MaterialCommunityIcons name="close" size={16} color={MUTED} />
                  </Pressable>
                </View>
              )}

              {/* Results */}
              {!selected && results.length > 0 && (
                <FlatList
                  data={results.filter(r => !addedSymbols.has(r.symbol)).slice(0, 10)}
                  keyExtractor={i => i.symbol}
                  style={s.resultsList}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable style={s.resultRow} onPress={() => { setSelected(item); setQtyInput(''); setCostInput(''); }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.resultSymbol}>{item.symbol}</Text>
                        <Text style={s.resultName} numberOfLines={1}>{item.name}</Text>
                      </View>
                      <View style={[s.assetChip, { backgroundColor: assetColor(item.asset_class) + '22' }]}>
                        <Text style={[s.assetChipTxt, { color: assetColor(item.asset_class) }]}>{(item.asset_class ?? 'STOCK').toUpperCase()}</Text>
                      </View>
                    </Pressable>
                  )}
                  ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
                />
              )}

              {/* Added */}
              {pending.length > 0 && (
                <View style={s.pendingBox}>
                  <Text style={s.pendingTitle}>Added ({pending.length})</Text>
                  {pending.map(pos => (
                    <View key={pos.symbol} style={s.pendingRow}>
                      <Text style={s.pendingSymbol}>{pos.symbol}</Text>
                      <Text style={s.pendingDetail}>{pos.quantity}{pos.avg_cost ? ` × $${pos.avg_cost}` : ''}</Text>
                      <Pressable onPress={() => setPending(p => p.filter(x => x.symbol !== pos.symbol))} style={{ padding: 4 }}>
                        <MaterialCommunityIcons name="close" size={14} color={RED} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {mnError && <ErrorNote msg={mnError} />}

              <View style={s.manualFooter}>
                <Pressable style={[s.primary, mnLoading && { opacity: 0.6 }]} onPress={handleFinishManual} disabled={mnLoading}>
                  {mnLoading
                    ? <ActivityIndicator color={BG} />
                    : <Text style={s.primaryTxt}>{pending.length > 0 ? `Save ${pending.length} position${pending.length > 1 ? 's' : ''} →` : 'Skip — go to dashboard →'}</Text>
                  }
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* ══ DONE ══════════════════════════════════════════════════════════════ */}
        {step === 'done' && (
          <View style={[s.page, { alignItems: 'center', justifyContent: 'center', flex: 1 }]}>
            <View style={s.successRing}>
              <MaterialCommunityIcons name="check" size={48} color={GREEN} />
            </View>
            <Text style={[s.hero, { textAlign: 'center', marginTop: 24 }]}>You're all set.</Text>
            <Text style={[s.sub, { textAlign: 'center' }]}>
              {connectedPlatform
                ? `${connectedPlatform} connected. Your dashboard is syncing now.`
                : 'Your dashboard is ready. Add more accounts anytime from the Portfolio tab.'}
            </Text>
            <Pressable style={[s.primary, { marginTop: 32, backgroundColor: GREEN }]} onPress={() => router.replace('/(tabs)')}>
              <Text style={s.primaryTxt}>Open my dashboard</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color={BG} />
            </Pressable>
            <Pressable style={[s.secondary, { marginTop: 10 }]} onPress={() => transitionTo('connect')}>
              <MaterialCommunityIcons name="plus" size={16} color={CYAN} />
              <Text style={s.secondaryTxt}>Connect another account</Text>
            </Pressable>
          </View>
        )}

      </Animated.View>
    </View>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function ErrorNote({ msg }: { msg: string }) {
  return (
    <View style={s.errorBox}>
      <MaterialCommunityIcons name="alert-circle-outline" size={14} color={RED} />
      <Text style={s.errorTxt}>{msg}</Text>
    </View>
  );
}

function assetColor(cls?: string): string {
  switch ((cls ?? '').toLowerCase()) {
    case 'crypto': return AMBER;
    case 'etf':    return GREEN;
    case 'fund':   return VIOLET;
    default:       return CYAN;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: BG },
  slide: { flex: 1 },
  page:  { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, flexGrow: 1 },

  badge:    { alignSelf: 'flex-start', backgroundColor: CYAN + '18', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: CYAN + '33', marginBottom: 26 },
  badgeTxt: { color: CYAN, fontSize: 11, fontFamily: mono, fontWeight: '800', letterSpacing: 2 },
  stepLabel:{ color: MUTED, fontSize: 10, fontFamily: mono, letterSpacing: 1.8, marginBottom: 10 },
  hero:     { color: TXT, fontSize: 34, fontWeight: '900', lineHeight: 42, marginBottom: 14, letterSpacing: -0.5 },
  sub:      { color: SUB, fontSize: 15, lineHeight: 24, marginBottom: 28 },

  propList: { gap: 14, marginBottom: 32 },
  propRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  propIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  propTxt:  { flex: 1, color: TXT, fontSize: 14, lineHeight: 22, paddingTop: 6 },

  primary:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: CYAN, borderRadius: 16, paddingVertical: 17, marginBottom: 12 },
  primaryTxt: { color: BG, fontSize: 16, fontWeight: '800' },
  secondary:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, borderWidth: 1.5, borderColor: CYAN + '44' },
  secondaryTxt:{ color: CYAN, fontSize: 14, fontWeight: '700' },
  skip:       { alignItems: 'center', paddingVertical: 14 },
  skipTxt:    { color: MUTED, fontSize: 14 },

  divRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  divLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  divTxt:  { color: MUTED, fontSize: 12, fontFamily: mono },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backTxt: { color: MUTED, fontSize: 14 },

  sectionLabel: { color: MUTED, fontSize: 10, fontFamily: mono, letterSpacing: 1.6, fontWeight: '700', marginBottom: 10, marginTop: 4 },

  // Exchange picker grid
  exchangeGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  exchangeBtn:       { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  exchangeBtnActive: { backgroundColor: AMBER, borderColor: AMBER },
  exchangeBtnTxt:    { color: MUTED, fontSize: 13, fontWeight: '700' },
  fieldLabel:   { color: MUTED, fontSize: 11, fontFamily: mono, letterSpacing: 1, marginBottom: 6 },
  field:        { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, color: TXT, fontSize: 14, fontFamily: mono, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 4 },
  infoBox:      { flexDirection: 'row', gap: 8, backgroundColor: AMBER + '12', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: AMBER + '28' },
  infoTxt:      { flex: 1, color: SUB, fontSize: 12, lineHeight: 18 },

  // Manual header/footer
  manualHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  manualFooter: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },

  // Search
  searchRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, marginHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 8 },
  searchInput: { flex: 1, color: TXT, fontSize: 15, paddingVertical: 13, paddingHorizontal: 10 },

  // Inline form
  inlineForm:   { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD2, marginHorizontal: 16, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: CYAN + '33', padding: 10, gap: 8 },
  inlineSymbol: { color: TXT, fontSize: 14, fontWeight: '700', fontFamily: mono },
  inlineName:   { color: MUTED, fontSize: 11, marginTop: 2 },
  inlineInput:  { width: 72, color: TXT, fontSize: 14, fontFamily: mono, backgroundColor: BG, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: BORDER },
  inlineAdd:    { backgroundColor: GREEN, borderRadius: 8, padding: 8, alignItems: 'center', justifyContent: 'center' },
  inlineCancel: { padding: 6 },

  // Results
  resultsList:   { flex: 1, marginHorizontal: 16 },
  resultRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: CARD, borderRadius: 12, marginVertical: 2 },
  resultSymbol:  { color: TXT,  fontSize: 14, fontWeight: '700', fontFamily: mono },
  resultName:    { color: MUTED, fontSize: 12, marginTop: 2 },
  assetChip:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  assetChipTxt:  { fontSize: 10, fontFamily: mono, fontWeight: '700' },

  // Pending
  pendingBox:    { marginHorizontal: 16, marginTop: 6, marginBottom: 4, backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: GREEN + '33' },
  pendingTitle:  { color: GREEN, fontSize: 10, fontFamily: mono, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  pendingRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  pendingSymbol: { color: TXT,  fontSize: 13, fontWeight: '700', fontFamily: mono, width: 64 },
  pendingDetail: { flex: 1, color: SUB, fontSize: 12, fontFamily: mono },

  // Error
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: RED + '12', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: RED + '30', marginHorizontal: 16, marginVertical: 6 },
  errorTxt: { flex: 1, color: RED, fontSize: 12, lineHeight: 18 },

  // Done
  successRing: { width: 100, height: 100, borderRadius: 50, backgroundColor: GREEN + '1E', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: GREEN + '44' },
});

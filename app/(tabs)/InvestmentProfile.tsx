import { useInvestmentProfile } from '@/src/investment-profile/hooks/useInvestmentProfile';
import type { AssetClass, InvestmentProfile, RiskLevel } from '@/src/investment-profile/types';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');

// ─── Design Tokens ────────────────────────────────────────────────────────────
const BG          = '#0D0F1A';
const SURFACE     = '#141726';
const SURFACE_2   = '#1A1F32';
const BORDER      = 'rgba(255,255,255,0.07)';
const GOLD        = '#C9A84C';
const GOLD_LIGHT  = '#E5C97A';
const GOLD_DIM    = 'rgba(201,168,76,0.10)';
const GOLD_BDR    = 'rgba(201,168,76,0.28)';
const PURPLE      = '#8B5CF6';
const PURPLE_DIM  = 'rgba(139,92,246,0.12)';
const PURPLE_BDR  = 'rgba(139,92,246,0.30)';
const TXT         = '#EEEAF3';
const TXT_2       = '#A8A4B8';
const TXT_3       = '#5A5670';
const GREEN       = '#22C55E';
const RED         = '#EF4444';
const BLUE        = '#3B82F6';
const ORANGE      = '#F97316';
const TEAL        = '#14B8A6';

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const sans  = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';

// ─── Static data ─────────────────────────────────────────────────────────────
const EXCHANGES = [
  { id: 'binance',  name: 'Binance',   region: 'Global',         flag: '🌐', color: '#F3BA2F', assetClasses: ['crypto'],                    description: "World's largest crypto exchange",       hours: '24 / 7',        currency: 'USD / USDT', popular: true  },
  { id: 'nyse',     name: 'NYSE',      region: 'United States',  flag: '🇺🇸', color: BLUE,       assetClasses: ['equities','etfs','bonds'],    description: "World's largest stock exchange",        hours: '9:30–16:00 ET', currency: 'USD',        popular: true  },
  { id: 'nasdaq',   name: 'NASDAQ',    region: 'United States',  flag: '🇺🇸', color: '#818CF8',  assetClasses: ['equities','etfs'],            description: 'Tech-heavy electronic marketplace',    hours: '9:30–16:00 ET', currency: 'USD',        popular: true  },
  { id: 'asx',      name: 'ASX',       region: 'Australia',      flag: '🇦🇺', color: '#FACC15',  assetClasses: ['equities','etfs','bonds'],    description: 'Primary Australian securities exchange',hours: '10:00–16:00 AE',currency: 'AUD',        popular: true  },
  { id: 'lse',      name: 'LSE',       region: 'United Kingdom', flag: '🇬🇧', color: TEAL,       assetClasses: ['equities','etfs','bonds'],    description: 'Oldest exchange in Europe',             hours: '8:00–16:30 GMT',currency: 'GBP'                        },
  { id: 'tse',      name: 'TSE',       region: 'Japan',          flag: '🇯🇵', color: '#F43F5E',  assetClasses: ['equities','etfs'],            description: "Asia's largest stock exchange",         hours: '9:00–15:30 JST',currency: 'JPY'                        },
  { id: 'coinbase', name: 'Coinbase',  region: 'United States',  flag: '🇺🇸', color: '#1652F0',  assetClasses: ['crypto'],                    description: 'Regulated US crypto exchange',          hours: '24 / 7',        currency: 'USD'                        },
  { id: 'kraken',   name: 'Kraken',    region: 'Global',         flag: '🌐', color: '#7C3AED',  assetClasses: ['crypto','forex'],             description: 'Institutional-grade crypto & FX',      hours: '24 / 7',        currency: 'USD / EUR'                  },
  { id: 'cme',      name: 'CME',       region: 'United States',  flag: '🇺🇸', color: ORANGE,     assetClasses: ['commodities','forex','bonds'], description: "World's largest derivatives exchange",  hours: '23 / 5',        currency: 'USD'                        },
];

const ASSET_CLASSES = [
  { id: 'equities'    as AssetClass, label: 'Equities',    icon: '📈', color: BLUE,   description: 'Stocks & shares'      },
  { id: 'crypto'      as AssetClass, label: 'Crypto',      icon: '₿',  color: GOLD,   description: 'Digital assets'       },
  { id: 'etfs'        as AssetClass, label: 'ETFs',        icon: '🗂️', color: TEAL,   description: 'Exchange-traded funds' },
  { id: 'forex'       as AssetClass, label: 'Forex',       icon: '💱', color: GREEN,  description: 'Currency pairs'       },
  { id: 'commodities' as AssetClass, label: 'Commodities', icon: '🛢️', color: ORANGE, description: 'Gold, oil & more'     },
  { id: 'bonds'       as AssetClass, label: 'Bonds',       icon: '🏦', color: PURPLE, description: 'Fixed income'         },
];

const RISK_LEVELS = [
  { id: 'conservative' as RiskLevel, label: 'Conservative', desc: 'Capital preservation',      color: TEAL,   icon: '🛡️' },
  { id: 'moderate'     as RiskLevel, label: 'Moderate',     desc: 'Balanced growth',            color: BLUE,   icon: '⚖️' },
  { id: 'aggressive'   as RiskLevel, label: 'Aggressive',   desc: 'High growth, elevated risk', color: ORANGE, icon: '🚀' },
  { id: 'speculative'  as RiskLevel, label: 'Speculative',  desc: 'Maximum risk & upside',      color: RED,    icon: '⚡' },
];

const CURRENCIES  = ['AUD', 'USD', 'GBP', 'EUR', 'JPY', 'HKD'];
const FILTER_TABS = ['All', 'Crypto', 'Equities', 'Forex', 'Commodities'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const Divider = () => (
  <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 32 }} />
);

const SectionHead: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => (
  <View style={{ marginBottom: 20 }}>
    <Text style={{ color: TXT_3, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', fontFamily: sans, fontWeight: '700', marginBottom: sub ? 6 : 0 }}>
      {title}
    </Text>
    {sub && <Text style={{ color: TXT_2, fontSize: 13, lineHeight: 20 }}>{sub}</Text>}
  </View>
);

// ─── Exchange Card ────────────────────────────────────────────────────────────
const ExchangeCard: React.FC<{ ex: typeof EXCHANGES[0]; selected: boolean; onToggle: () => void; index: number }> = ({ ex, selected, onToggle, index }) => {
  const fade  = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 300, delay: index * 40, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{ opacity: fade, transform: [{ scale }] }}>
      <TouchableOpacity
        style={[xc.card, selected && { borderColor: `${ex.color}45`, backgroundColor: `${ex.color}09` }]}
        onPress={onToggle}
        onPressIn={() => Animated.spring(scale, { toValue: 0.985, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        activeOpacity={1}
      >
        {selected && <View style={[xc.stripe, { backgroundColor: ex.color }]} />}
        <View style={xc.top}>
          <View style={[xc.icon, { backgroundColor: `${ex.color}18` }]}>
            <Text style={{ fontSize: 22 }}>{ex.flag}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <Text style={xc.name}>{ex.name}</Text>
              {ex.popular && <View style={xc.badge}><Text style={xc.badgeTxt}>POPULAR</Text></View>}
            </View>
            <Text style={xc.region}>{ex.region}</Text>
          </View>
          <View style={[xc.box, selected && { backgroundColor: ex.color, borderColor: ex.color }]}>
            {selected && <Text style={xc.tick}>✓</Text>}
          </View>
        </View>
        <Text style={xc.desc}>{ex.description}</Text>
        <View style={xc.meta}>
          <View style={xc.pill}><Text style={xc.pillTxt}>🕐  {ex.hours}</Text></View>
          <View style={xc.pill}><Text style={xc.pillTxt}>💱  {ex.currency}</Text></View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};
const xc = StyleSheet.create({
  card:    { backgroundColor: SURFACE, borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 18, marginBottom: 12, overflow: 'hidden' },
  stripe:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
  top:     { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  icon:    { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  name:    { color: TXT, fontSize: 16, fontWeight: '700', fontFamily: serif },
  region:  { color: TXT_3, fontSize: 11 },
  badge:   { backgroundColor: GOLD_DIM, borderWidth: 1, borderColor: GOLD_BDR, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt:{ color: GOLD, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  box:     { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  tick:    { color: BG, fontSize: 11, fontWeight: '900' },
  desc:    { color: TXT_2, fontSize: 12.5, lineHeight: 19, marginBottom: 14 },
  meta:    { flexDirection: 'row', gap: 8 },
  pill:    { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  pillTxt: { color: TXT_3, fontSize: 11 },
});

// ─── Asset Toggle ─────────────────────────────────────────────────────────────
const AssetToggle: React.FC<{ def: typeof ASSET_CLASSES[0]; selected: boolean; onToggle: () => void }> = ({ def, selected, onToggle }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const tileW = (width - 56) / 3;
  return (
    <Animated.View style={{ transform: [{ scale }], width: tileW }}>
      <TouchableOpacity
        style={[at.tile, selected && { borderColor: `${def.color}50`, backgroundColor: `${def.color}12` }]}
        onPress={onToggle}
        onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        activeOpacity={1}
      >
        {selected && <View style={[at.dot, { backgroundColor: def.color }]} />}
        <Text style={{ fontSize: 26, marginBottom: 8 }}>{def.icon}</Text>
        <Text style={[at.label, selected && { color: def.color }]}>{def.label}</Text>
        <Text style={at.sub}>{def.description}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};
const at = StyleSheet.create({
  tile:  { backgroundColor: SURFACE, borderRadius: 18, borderWidth: 1, borderColor: BORDER, paddingVertical: 18, paddingHorizontal: 8, alignItems: 'center', marginBottom: 8, minHeight: 108, justifyContent: 'center', position: 'relative' },
  dot:   { position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: 3.5 },
  label: { color: TXT, fontSize: 12, fontWeight: '700', marginBottom: 3, textAlign: 'center' },
  sub:   { color: TXT_3, fontSize: 9.5, textAlign: 'center', lineHeight: 13 },
});

// ─── Risk Card ────────────────────────────────────────────────────────────────
const RiskCard: React.FC<{ item: typeof RISK_LEVELS[0]; selected: boolean; onPress: () => void }> = ({ item, selected, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[rc.row, selected && { borderColor: `${item.color}50`, backgroundColor: `${item.color}0D` }]}
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.985, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        activeOpacity={1}
      >
        {selected && <View style={[rc.stripe, { backgroundColor: item.color }]} />}
        <View style={[rc.iconWrap, { backgroundColor: selected ? `${item.color}20` : 'rgba(255,255,255,0.05)' }]}>
          <Text style={{ fontSize: 20 }}>{item.icon}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={[rc.label, selected && { color: item.color }]}>{item.label}</Text>
          <Text style={rc.desc}>{item.desc}</Text>
        </View>
        <View style={[rc.radio, selected && { borderColor: item.color }]}>
          {selected && <View style={[rc.radioDot, { backgroundColor: item.color }]} />}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};
const rc = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 18, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 10, overflow: 'hidden' },
  stripe:   { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderTopLeftRadius: 18, borderBottomLeftRadius: 18 },
  iconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  label:    { color: TXT, fontSize: 15, fontWeight: '700', fontFamily: serif, marginBottom: 3 },
  desc:     { color: TXT_2, fontSize: 12, lineHeight: 17 },
  radio:    { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});

// ─── Summary pill ─────────────────────────────────────────────────────────────
const Summary: React.FC<{ profile: InvestmentProfile }> = ({ profile }) => {
  const n  = profile.selectedExchanges.length;
  const ac = profile.selectedAssetClasses.length;
  if (!n && !ac && !profile.riskLevel) return null;
  const parts = [
    n  > 0 ? `${n} exchange${n > 1 ? 's' : ''}` : '',
    ac > 0 ? `${ac} asset class${ac > 1 ? 'es' : ''}` : '',
    profile.riskLevel || '',
  ].filter(Boolean);
  return (
    <View style={su.wrap}>
      <View style={su.dot} />
      <Text style={su.txt}>{parts.join('  ·  ')}</Text>
    </View>
  );
};
const su = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: GOLD_DIM, borderWidth: 1, borderColor: GOLD_BDR, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 4 },
  dot:  { width: 5, height: 5, borderRadius: 2.5, backgroundColor: GOLD },
  txt:  { color: GOLD_LIGHT, fontSize: 12, fontWeight: '600' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function InvestmentProfileScreen() {
  const { profile, isSaving, hasUnsaved, loadProfile, update, toggleExchange, toggleAsset, save } =
    useInvestmentProfile();

  const [activeFilter, setActiveFilter] = useState('All');

  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    loadProfile();
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
    ]).start();
  }, []);

  const filterMap: Record<string, AssetClass> = { Crypto: 'crypto', Equities: 'equities', Forex: 'forex', Commodities: 'commodities' };
  const filteredEx = EXCHANGES.filter(ex => activeFilter === 'All' || ex.assetClasses.includes(filterMap[activeFilter]));

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.blob1} />
      <View style={s.blob2} />

      {/* ── Nav ── */}
      <View style={s.nav}>
        <TouchableOpacity style={s.navBack} onPress={() => router.back()}>
          <Text style={s.navArrow}>‹</Text>
          <Text style={s.navBackTxt}>Profile</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>Investment Profile</Text>
        {hasUnsaved
          ? <TouchableOpacity style={s.navSaveBtn} onPress={save} disabled={isSaving}>
              <Text style={s.navSaveTxt}>{isSaving ? '…' : 'Save'}</Text>
            </TouchableOpacity>
          : <View style={{ width: 52 }} />
        }
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero header ── */}
        <Animated.View style={[s.header, { opacity: fade, transform: [{ translateY: slide }] }]}>
          <Text style={s.overline}>VESTARA · PORTFOLIO</Text>
          <Text style={s.heroTitle}>Investment{'\n'}Profile</Text>
          <Text style={s.heroSub}>Configure the markets you want to track, your risk tolerance, and preferred asset classes.</Text>
          <Summary profile={profile} />
        </Animated.View>

        {/* ── Portfolio link ── */}
        <TouchableOpacity style={s.linkCard} onPress={() => router.push('/(tabs)/Portfolio')}>
          <View style={s.linkIcon}><Text style={{ fontSize: 20 }}>📊</Text></View>
          <Text style={s.linkTxt}>View Portfolio Dashboard</Text>
          <Text style={s.linkArrow}>›</Text>
        </TouchableOpacity>

        <Divider />

        {/* ── Asset Classes ── */}
        <SectionHead title="Asset Classes" sub="Select every asset type you want to monitor" />
        <View style={s.assetGrid}>
          {ASSET_CLASSES.map(def => (
            <AssetToggle key={def.id} def={def} selected={profile.selectedAssetClasses.includes(def.id)} onToggle={() => toggleAsset(def.id)} />
          ))}
        </View>

        <Divider />

        {/* ── Risk Tolerance ── */}
        <SectionHead title="Risk Tolerance" sub="How do you approach investment risk?" />
        <View>
          {RISK_LEVELS.map(item => (
            <RiskCard key={item.id} item={item} selected={profile.riskLevel === item.id} onPress={() => update({ riskLevel: item.id })} />
          ))}
        </View>

        <Divider />

        {/* ── Exchanges ── */}
        <SectionHead title="Exchanges & Markets" sub="Choose the markets you want to connect" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {FILTER_TABS.map(tab => (
            <TouchableOpacity key={tab} onPress={() => setActiveFilter(tab)} style={[s.filterTab, activeFilter === tab && s.filterTabOn]}>
              <Text style={[s.filterTxt, activeFilter === tab && s.filterTxtOn]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ marginTop: 6 }}>
          {filteredEx.map((ex, i) => (
            <ExchangeCard key={ex.id} ex={ex} selected={profile.selectedExchanges.includes(ex.id)} onToggle={() => toggleExchange(ex.id)} index={i} />
          ))}
        </View>

        <Divider />

        {/* ── Base Currency ── */}
        <SectionHead title="Base Currency" sub="All values will be converted to this currency" />
        <View style={s.currRow}>
          {CURRENCIES.map(cur => (
            <TouchableOpacity key={cur} onPress={() => update({ baseCurrency: cur })} style={[s.curChip, profile.baseCurrency === cur && s.curChipOn]}>
              <Text style={[s.curTxt, profile.baseCurrency === cur && s.curTxtOn]}>{cur}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Save ── */}
        <View style={s.saveBlock}>
          {hasUnsaved && (
            <View style={s.unsavedRow}>
              <View style={s.unsavedDot} />
              <Text style={s.unsavedTxt}>Unsaved changes</Text>
            </View>
          )}
          <TouchableOpacity
            style={[s.saveBtn, (!hasUnsaved || isSaving) && s.saveBtnOff]}
            onPress={save}
            disabled={!hasUnsaved || isSaving}
          >
            <Text style={[s.saveBtnTxt, (!hasUnsaved || isSaving) && s.saveBtnTxtOff]}>
              {isSaving ? 'Saving…' : hasUnsaved ? 'Save Investment Profile' : 'Profile Saved  ✓'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={s.wordmark}><Text style={s.wordmarkTxt}>◈  VESTARA PRIVATE MARKETS</Text></View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: BG },
  blob1: { position: 'absolute', width: 380, height: 380, borderRadius: 190, backgroundColor: 'rgba(139,92,246,0.05)', top: -140, right: -120 },
  blob2: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(201,168,76,0.04)', top: 380, left: -100 },

  // Nav
  nav:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: Platform.OS === 'ios' ? 58 : 36, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: BORDER },
  navBack:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navArrow:   { color: GOLD, fontSize: 28, lineHeight: 30, marginTop: -2 },
  navBackTxt: { color: GOLD, fontSize: 15, fontWeight: '600' },
  navTitle:   { color: TXT, fontSize: 15, fontWeight: '700', fontFamily: serif },
  navSaveBtn: { backgroundColor: GOLD_DIM, borderWidth: 1, borderColor: GOLD_BDR, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 7 },
  navSaveTxt: { color: GOLD_LIGHT, fontSize: 13, fontWeight: '700' },

  // Scroll
  scroll: { paddingHorizontal: 22, paddingTop: 32, paddingBottom: 72 },

  // Header
  header:    { marginBottom: 28 },
  overline:  { fontSize: 10, color: GOLD, letterSpacing: 3, fontWeight: '700', marginBottom: 12 },
  heroTitle: { fontSize: 38, fontWeight: '800', color: TXT, fontFamily: serif, letterSpacing: 0.2, lineHeight: 46, marginBottom: 14 },
  heroSub:   { color: TXT_2, fontSize: 14, lineHeight: 22, marginBottom: 20 },

  // Portfolio link
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: SURFACE_2, borderRadius: 18, borderWidth: 1, borderColor: GOLD_BDR, paddingVertical: 16, paddingHorizontal: 18 },
  linkIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: GOLD_DIM, alignItems: 'center', justifyContent: 'center' },
  linkTxt:  { flex: 1, color: GOLD_LIGHT, fontSize: 14, fontWeight: '600' },
  linkArrow:{ color: GOLD, fontSize: 22 },

  // Asset grid
  assetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  // Filter
  filterRow:    { gap: 8, paddingBottom: 14 },
  filterTab:    { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 24, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER },
  filterTabOn:  { backgroundColor: PURPLE_DIM, borderColor: PURPLE_BDR },
  filterTxt:    { color: TXT_3, fontSize: 13, fontWeight: '600' },
  filterTxtOn:  { color: PURPLE },

  // Currency
  currRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  curChip:   { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER },
  curChipOn: { backgroundColor: GOLD_DIM, borderColor: GOLD_BDR },
  curTxt:    { color: TXT_3, fontSize: 13, fontWeight: '700' },
  curTxtOn:  { color: GOLD_LIGHT },

  // Save
  saveBlock:    { marginTop: 40 },
  unsavedRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  unsavedDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: ORANGE },
  unsavedTxt:   { color: ORANGE, fontSize: 12, fontWeight: '600' },
  saveBtn:      { backgroundColor: GOLD, paddingVertical: 19, borderRadius: 18, alignItems: 'center', shadowColor: GOLD, shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  saveBtnOff:   { backgroundColor: 'rgba(201,168,76,0.15)', shadowOpacity: 0 },
  saveBtnTxt:   { color: BG, fontSize: 15, fontWeight: '800', letterSpacing: 0.6 },
  saveBtnTxtOff:{ color: 'rgba(201,168,76,0.4)' },

  // Wordmark
  wordmark:    { alignItems: 'center', marginTop: 48 },
  wordmarkTxt: { color: 'rgba(201,168,76,0.14)', fontSize: 10, letterSpacing: 4, fontFamily: serif },
});

import { supabase } from '@/src/lib/supabase';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
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

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD       = '#C9A84C';
const GOLD_LIGHT = '#E5C97A';
const GOLD_DIM   = 'rgba(201,168,76,0.12)';
const GOLD_BDR   = 'rgba(201,168,76,0.3)';
const BG         = '#0A0D14';
const CARD       = '#12161F';
const BORDER     = 'rgba(255,255,255,0.07)';
const TXT        = '#F0EDE6';
const MUTED      = '#5A6070';
const SUB        = '#8A94A6';
const GREEN      = '#2ECC71';
const RED        = '#E74C3C';
const BLUE       = '#3B82F6';
const ORANGE     = '#F97316';
const PURPLE     = '#A855F7';
const TEAL       = '#14B8A6';

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const sans  = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';

// ─── Types ────────────────────────────────────────────────────────────────────
type AssetClass = 'equities' | 'crypto' | 'etfs' | 'forex' | 'commodities' | 'bonds';
type RiskLevel  = 'conservative' | 'moderate' | 'aggressive' | 'speculative';

interface InvestmentProfile {
  selectedExchanges: string[];
  selectedAssetClasses: AssetClass[];
  riskLevel: RiskLevel | '';
  baseCurrency: string;
}

const defaultProfile: InvestmentProfile = {
  selectedExchanges: [], selectedAssetClasses: [], riskLevel: '', baseCurrency: 'AUD',
};

// ─── Static data ─────────────────────────────────────────────────────────────
const EXCHANGES = [
  { id: 'binance',  name: 'Binance',   region: 'Global',         flag: '🌐', color: '#F3BA2F', assetClasses: ['crypto'],                   description: "World's largest crypto exchange",       hours: '24 / 7',       currency: 'USD / USDT', popular: true  },
  { id: 'nyse',     name: 'NYSE',      region: 'United States',  flag: '🇺🇸', color: BLUE,      assetClasses: ['equities','etfs','bonds'],   description: "World's largest stock exchange",        hours: '9:30–16:00 ET',currency: 'USD',        popular: true  },
  { id: 'nasdaq',   name: 'NASDAQ',    region: 'United States',  flag: '🇺🇸', color: '#6366F1', assetClasses: ['equities','etfs'],           description: 'Tech-heavy electronic marketplace',    hours: '9:30–16:00 ET',currency: 'USD',        popular: true  },
  { id: 'asx',      name: 'ASX',       region: 'Australia',      flag: '🇦🇺', color: '#FACC15', assetClasses: ['equities','etfs','bonds'],   description: 'Primary Australian securities exchange',hours: '10:00–16:00 AE',currency: 'AUD',       popular: true  },
  { id: 'lse',      name: 'LSE',       region: 'United Kingdom', flag: '🇬🇧', color: TEAL,      assetClasses: ['equities','etfs','bonds'],   description: 'Oldest exchange in Europe',             hours: '8:00–16:30 GMT',currency: 'GBP'                        },
  { id: 'tse',      name: 'TSE',       region: 'Japan',          flag: '🇯🇵', color: '#F43F5E', assetClasses: ['equities','etfs'],           description: "Asia's largest stock exchange",         hours: '9:00–15:30 JST',currency: 'JPY'                        },
  { id: 'coinbase', name: 'Coinbase',  region: 'United States',  flag: '🇺🇸', color: '#1652F0', assetClasses: ['crypto'],                   description: 'Regulated US crypto exchange',          hours: '24 / 7',       currency: 'USD'                        },
  { id: 'kraken',   name: 'Kraken',    region: 'Global',         flag: '🌐', color: '#5741D9', assetClasses: ['crypto','forex'],            description: 'Institutional-grade crypto & FX',      hours: '24 / 7',       currency: 'USD / EUR'                  },
  { id: 'cme',      name: 'CME',       region: 'United States',  flag: '🇺🇸', color: ORANGE,    assetClasses: ['commodities','forex','bonds'],description: "World's largest derivatives exchange",  hours: '23 / 5',       currency: 'USD'                        },
];

const ASSET_CLASSES = [
  { id: 'equities' as AssetClass,   label: 'Equities',    icon: '📈', color: BLUE,   description: 'Stocks & shares'     },
  { id: 'crypto'   as AssetClass,   label: 'Crypto',      icon: '₿',  color: GOLD,   description: 'Digital assets'      },
  { id: 'etfs'     as AssetClass,   label: 'ETFs',        icon: '🗂️', color: TEAL,   description: 'Exchange-traded funds'},
  { id: 'forex'    as AssetClass,   label: 'Forex',       icon: '💱', color: GREEN,  description: 'Currency pairs'      },
  { id: 'commodities' as AssetClass,label: 'Commodities', icon: '🛢️', color: ORANGE, description: 'Gold, oil & more'    },
  { id: 'bonds'    as AssetClass,   label: 'Bonds',       icon: '🏦', color: PURPLE, description: 'Fixed income'        },
];

const RISK_LEVELS = [
  { id: 'conservative' as RiskLevel, label: 'Conservative', desc: 'Capital preservation',      color: TEAL,   icon: '🛡️' },
  { id: 'moderate'     as RiskLevel, label: 'Moderate',     desc: 'Balanced growth',            color: BLUE,   icon: '⚖️' },
  { id: 'aggressive'   as RiskLevel, label: 'Aggressive',   desc: 'High growth, elevated risk', color: ORANGE, icon: '🚀' },
  { id: 'speculative'  as RiskLevel, label: 'Speculative',  desc: 'Maximum risk & upside',      color: RED,    icon: '⚡' },
];

const CURRENCIES  = ['AUD', 'USD', 'GBP', 'EUR', 'JPY', 'HKD'];
const FILTER_TABS = ['All', 'Crypto', 'Equities', 'Forex', 'Commodities'];

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionHead: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => (
  <View style={{ marginTop: 28, marginBottom: 12 }}>
    <Text style={{ color: MUTED, fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase', fontFamily: sans }}>{title}</Text>
    {sub && <Text style={{ color: SUB, fontSize: 12, marginTop: 4, lineHeight: 18 }}>{sub}</Text>}
  </View>
);

const ExchangeCard: React.FC<{ ex: typeof EXCHANGES[0]; selected: boolean; onToggle: () => void; index: number }> = ({ ex, selected, onToggle, index }) => {
  const fade  = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 350, delay: index * 50, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fade, transform: [{ scale }] }}>
      <TouchableOpacity
        style={[xc.card, selected && { borderColor: ex.color, backgroundColor: `${ex.color}0D` }]}
        onPress={onToggle}
        onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1,    useNativeDriver: true }).start()}
        activeOpacity={1}
      >
        {selected && <View style={[xc.accentBar, { backgroundColor: ex.color }]} />}

        <View style={xc.top}>
          <View style={[xc.flagWrap, { backgroundColor: `${ex.color}18` }]}>
            <Text style={{ fontSize: 20 }}>{ex.flag}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={xc.name}>{ex.name}</Text>
              {ex.popular && <View style={xc.popBadge}><Text style={xc.popTxt}>POPULAR</Text></View>}
            </View>
            <Text style={xc.region}>{ex.region}</Text>
          </View>
          <View style={[xc.check, selected && { backgroundColor: ex.color, borderColor: ex.color }]}>
            {selected && <Text style={{ color: '#0A0D14', fontSize: 11, fontWeight: '900' }}>✓</Text>}
          </View>
        </View>

        <Text style={xc.desc}>{ex.description}</Text>

        <View style={xc.meta}>
          <Text style={xc.metaItem}>🕐 {ex.hours}</Text>
          <Text style={xc.metaDiv}>·</Text>
          <Text style={xc.metaItem}>💱 {ex.currency}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};
const xc = StyleSheet.create({
  card:     { backgroundColor: CARD, borderRadius: 16, borderWidth: 1.5, borderColor: BORDER, padding: 14, marginBottom: 10, overflow: 'hidden', position: 'relative' },
  accentBar:{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  top:      { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  flagWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  name:     { color: TXT, fontSize: 15, fontWeight: '700', fontFamily: serif },
  region:   { color: MUTED, fontSize: 11, marginTop: 2 },
  popBadge: { backgroundColor: GOLD_DIM, borderWidth: 1, borderColor: GOLD_BDR, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  popTxt:   { color: GOLD, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  check:    { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  desc:     { color: SUB, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  meta:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaItem: { color: MUTED, fontSize: 11 },
  metaDiv:  { color: BORDER, fontSize: 14 },
});

const AssetToggle: React.FC<{ def: typeof ASSET_CLASSES[0]; selected: boolean; onToggle: () => void }> = ({ def, selected, onToggle }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const w     = (width - 52) / 3;

  return (
    <Animated.View style={{ transform: [{ scale }], width: w }}>
      <TouchableOpacity
        style={[at.chip, selected && { borderColor: def.color, backgroundColor: `${def.color}14` }]}
        onPress={onToggle}
        onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1,    useNativeDriver: true }).start()}
        activeOpacity={1}
      >
        {selected && <View style={[at.dot, { backgroundColor: def.color }]} />}
        <Text style={{ fontSize: 22, marginBottom: 5 }}>{def.icon}</Text>
        <Text style={[at.label, selected && { color: def.color }]}>{def.label}</Text>
        <Text style={at.desc}>{def.description}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};
const at = StyleSheet.create({
  chip:  { backgroundColor: CARD, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, padding: 12, alignItems: 'center', marginBottom: 8, minHeight: 95, justifyContent: 'center', position: 'relative' },
  dot:   { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 3.5 },
  label: { color: TXT, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  desc:  { color: MUTED, fontSize: 9, textAlign: 'center', lineHeight: 13 },
});

const RiskCard: React.FC<{ item: typeof RISK_LEVELS[0]; selected: boolean; onPress: () => void }> = ({ item, selected, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const w     = (width - 46) / 2;

  return (
    <Animated.View style={{ transform: [{ scale }], width: w }}>
      <TouchableOpacity
        style={[rc.card, selected && { borderColor: item.color, backgroundColor: `${item.color}10` }]}
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1,    useNativeDriver: true }).start()}
        activeOpacity={1}
      >
        {selected && <View style={[rc.bar, { backgroundColor: item.color }]} />}
        <Text style={{ fontSize: 22, marginBottom: 6 }}>{item.icon}</Text>
        <Text style={[rc.label, selected && { color: item.color }]}>{item.label}</Text>
        <Text style={rc.desc}>{item.desc}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};
const rc = StyleSheet.create({
  card:  { backgroundColor: CARD, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, padding: 14, marginBottom: 8, alignItems: 'center', position: 'relative', overflow: 'hidden' },
  bar:   { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3 },
  label: { color: TXT, fontSize: 13, fontWeight: '700', marginBottom: 3, textAlign: 'center' },
  desc:  { color: MUTED, fontSize: 10, textAlign: 'center', lineHeight: 14 },
});

// ─── Summary bar ──────────────────────────────────────────────────────────────
const Summary: React.FC<{ profile: InvestmentProfile }> = ({ profile }) => {
  const n  = profile.selectedExchanges.length;
  const ac = profile.selectedAssetClasses.length;
  if (!n && !ac) return null;

  const parts = [
    n  > 0 ? `${n} exchange${n > 1 ? 's' : ''}` : '',
    ac > 0 ? `${ac} asset class${ac > 1 ? 'es' : ''}` : '',
    profile.riskLevel ? profile.riskLevel : '',
  ].filter(Boolean);

  return (
    <View style={sm.bar}>
      <Text style={sm.txt}>{parts.join('  ·  ')}</Text>
    </View>
  );
};
const sm = StyleSheet.create({
  bar: { backgroundColor: GOLD_DIM, borderWidth: 1, borderColor: GOLD_BDR, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 4 },
  txt: { color: GOLD_LIGHT, fontSize: 12, fontWeight: '600' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function InvestmentProfileScreen() {
  const [profile,      setProfile]      = useState<InvestmentProfile>(defaultProfile);
  const [activeFilter, setActiveFilter] = useState('All');
  const [isSaving,     setIsSaving]     = useState(false);
  const [hasUnsaved,   setHasUnsaved]   = useState(false);

  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    loadProfile();
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, tension: 70, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  const loadProfile = async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.user_metadata?.investment_profile) {
      setProfile(data.user.user_metadata.investment_profile);
    }
  };

  const update = (updates: Partial<InvestmentProfile>) => {
    setProfile(p => ({ ...p, ...updates }));
    setHasUnsaved(true);
  };

  const toggleExchange = (id: string) =>
    update({ selectedExchanges: profile.selectedExchanges.includes(id)
      ? profile.selectedExchanges.filter(e => e !== id)
      : [...profile.selectedExchanges, id] });

  const toggleAsset = (id: AssetClass) =>
    update({ selectedAssetClasses: profile.selectedAssetClasses.includes(id)
      ? profile.selectedAssetClasses.filter(a => a !== id)
      : [...profile.selectedAssetClasses, id] });

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { investment_profile: profile } });
      if (error) throw error;
      setHasUnsaved(false);
      Alert.alert('Saved ✓', 'Your investment profile has been updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setIsSaving(false); }
  };

  const filterMap: Record<string, AssetClass> = { Crypto: 'crypto', Equities: 'equities', Forex: 'forex', Commodities: 'commodities' };
  const filteredEx = EXCHANGES.filter(ex => activeFilter === 'All' || ex.assetClasses.includes(filterMap[activeFilter]));

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.glow1} /><View style={s.glow2} />

      {/* ── Nav bar ── */}
      <View style={s.navBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>‹</Text>
          <Text style={s.backLabel}>Profile</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>Investment Profile</Text>
        {hasUnsaved
          ? <TouchableOpacity style={s.saveQuick} onPress={save} disabled={isSaving}>
              <Text style={s.saveQuickTxt}>{isSaving ? '…' : 'Save'}</Text>
            </TouchableOpacity>
          : <View style={{ width: 44 }} />}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Page header ── */}
        <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
          <Text style={s.pageLabel}>VESTARA · PORTFOLIO</Text>
          <Text style={s.pageTitle}>Investment{'\n'}Profile</Text>
          <Text style={s.pageSub}>Configure the markets you want to track, your risk tolerance, and preferred asset classes.</Text>
          <Summary profile={profile} />
        </Animated.View>

        {/* ── Quick link to portfolio ── */}
        <TouchableOpacity style={s.portfolioLink} onPress={() => router.push('/(tabs)/Portfolio')}>
          <Text style={{ fontSize: 18 }}>📊</Text>
          <Text style={s.portfolioLinkTxt}>View Portfolio Dashboard</Text>
          <Text style={[s.backArrow, { color: GOLD, fontSize: 20 }]}>›</Text>
        </TouchableOpacity>

        {/* ── Asset classes ── */}
        <SectionHead title="Asset Classes" sub="Select every asset type you want to monitor" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ASSET_CLASSES.map(def => (
            <AssetToggle
              key={def.id}
              def={def}
              selected={profile.selectedAssetClasses.includes(def.id)}
              onToggle={() => toggleAsset(def.id)}
            />
          ))}
        </View>

        {/* ── Risk tolerance ── */}
        <SectionHead title="Risk Tolerance" sub="How do you approach investment risk?" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {RISK_LEVELS.map(item => (
            <RiskCard
              key={item.id}
              item={item}
              selected={profile.riskLevel === item.id}
              onPress={() => update({ riskLevel: item.id })}
            />
          ))}
        </View>

        {/* ── Exchanges ── */}
        <SectionHead title="Exchanges & Markets" sub="Choose the markets you want to connect" />

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {FILTER_TABS.map(tab => (
            <TouchableOpacity key={tab} onPress={() => setActiveFilter(tab)} style={[s.filterTab, activeFilter === tab && s.filterTabActive]}>
              <Text style={[s.filterTxt, activeFilter === tab && s.filterTxtActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredEx.map((ex, i) => (
          <ExchangeCard
            key={ex.id}
            ex={ex}
            selected={profile.selectedExchanges.includes(ex.id)}
            onToggle={() => toggleExchange(ex.id)}
            index={i}
          />
        ))}

        {/* ── Base currency ── */}
        <SectionHead title="Base Currency" sub="All values will be converted to this currency" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {CURRENCIES.map(cur => (
            <TouchableOpacity
              key={cur}
              onPress={() => update({ baseCurrency: cur })}
              style={[s.curChip, profile.baseCurrency === cur && s.curChipActive]}
            >
              <Text style={[s.curTxt, profile.baseCurrency === cur && s.curTxtActive]}>{cur}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Save ── */}
        <View style={{ marginTop: 32 }}>
          {hasUnsaved && <Text style={s.unsaved}>● Unsaved changes</Text>}
          <TouchableOpacity
            style={[s.saveBtn, (!hasUnsaved || isSaving) && s.saveBtnDim]}
            onPress={save}
            disabled={!hasUnsaved || isSaving}
          >
            <Text style={s.saveBtnTxt}>{isSaving ? 'Saving…' : hasUnsaved ? 'Save Investment Profile' : 'Profile Saved ✓'}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.wordmark}>
          <Text style={s.wordmarkTxt}>◈ VESTARA PRIVATE MARKETS</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  glow1:   { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(201,168,76,0.04)', top: -80, right: -60 },
  glow2:   { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(59,130,246,0.03)', top: 300, left: -60 },

  navBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: Platform.OS === 'ios' ? 58 : 36, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backArrow:    { color: GOLD, fontSize: 26, lineHeight: 28 },
  backLabel:    { color: GOLD, fontSize: 15, fontWeight: '600' },
  navTitle:     { color: TXT, fontSize: 16, fontWeight: '700', fontFamily: serif },
  saveQuick:    { backgroundColor: GOLD_DIM, borderWidth: 1, borderColor: GOLD_BDR, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 },
  saveQuickTxt: { color: GOLD_LIGHT, fontSize: 13, fontWeight: '700' },

  scroll:   { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 56 },
  pageLabel:{ fontSize: 10, color: GOLD, letterSpacing: 3, fontFamily: sans, marginBottom: 8 },
  pageTitle:{ fontSize: 32, fontWeight: '700', color: TXT, fontFamily: serif, letterSpacing: 0.3, marginBottom: 10 },
  pageSub:  { color: SUB, fontSize: 13, lineHeight: 20, marginBottom: 16 },

  portfolioLink:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: GOLD_BDR, padding: 14, marginTop: 8 },
  portfolioLinkTxt: { flex: 1, color: GOLD_LIGHT, fontSize: 14, fontWeight: '600' },

  filterRow:    { gap: 8, paddingBottom: 14, paddingTop: 4 },
  filterTab:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  filterTabActive:{ backgroundColor: GOLD_DIM, borderColor: GOLD_BDR },
  filterTxt:    { color: MUTED, fontSize: 12, fontWeight: '600' },
  filterTxtActive:{ color: GOLD_LIGHT },

  curChip:      { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12, backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER },
  curChipActive:{ backgroundColor: GOLD_DIM, borderColor: GOLD_BDR },
  curTxt:       { color: MUTED, fontSize: 13, fontWeight: '700' },
  curTxtActive: { color: GOLD_LIGHT },

  unsaved:   { color: ORANGE, fontSize: 12, fontWeight: '600', marginBottom: 10 },
  saveBtn:   { backgroundColor: GOLD, paddingVertical: 17, borderRadius: 16, alignItems: 'center', shadowColor: GOLD, shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  saveBtnDim:{ backgroundColor: 'rgba(201,168,76,0.25)', shadowOpacity: 0 },
  saveBtnTxt:{ color: '#0A0D14', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

  wordmark:    { alignItems: 'center', marginTop: 36 },
  wordmarkTxt: { color: 'rgba(201,168,76,0.18)', fontSize: 10, letterSpacing: 3, fontFamily: serif },
});
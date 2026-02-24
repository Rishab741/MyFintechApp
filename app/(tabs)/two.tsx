import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/store/useAuthStore';
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
  View
} from 'react-native';

const { width, height } = Dimensions.get('window');

// ─── Design tokens ────────────────────────────────────────────────────────────
const GOLD = '#C9A84C';
const GOLD_LIGHT = '#E5C97A';
const GOLD_DIM = 'rgba(201,168,76,0.12)';
const GOLD_BORDER = 'rgba(201,168,76,0.35)';
const BG = '#0A0D14';
const CARD = '#12161F';
const CARD_RAISED = '#161B26';
const BORDER = 'rgba(255,255,255,0.07)';
const TEXT_PRIMARY = '#F0EDE6';
const TEXT_MUTED = '#5A6070';
const TEXT_SUB = '#8A94A6';
const GREEN = '#2ECC71';
const RED = '#E74C3C';
const BLUE = '#3B82F6';
const ORANGE = '#F97316';
const PURPLE = '#A855F7';
const TEAL = '#14B8A6';

// ─── Data ─────────────────────────────────────────────────────────────────────

type AssetClass = 'equities' | 'crypto' | 'etfs' | 'forex' | 'commodities' | 'bonds';
type RiskLevel = 'conservative' | 'moderate' | 'aggressive' | 'speculative';

interface Exchange {
  id: string;
  name: string;
  fullName: string;
  region: string;
  flag: string;
  color: string;
  assetClasses: AssetClass[];
  description: string;
  hours: string;
  currency: string;
  popular?: boolean;
}

interface AssetClassDef {
  id: AssetClass;
  label: string;
  icon: string;
  color: string;
  description: string;
}

const EXCHANGES: Exchange[] = [
  {
    id: 'binance',
    name: 'Binance',
    fullName: 'Binance Global Exchange',
    region: 'Global',
    flag: '🌐',
    color: '#F3BA2F',
    assetClasses: ['crypto'],
    description: "World's largest crypto exchange by volume",
    hours: '24 / 7',
    currency: 'USD / USDT',
    popular: true,
  },
  {
    id: 'nyse',
    name: 'NYSE',
    fullName: 'New York Stock Exchange',
    region: 'United States',
    flag: '🇺🇸',
    color: '#3B82F6',
    assetClasses: ['equities', 'etfs', 'bonds'],
    description: "World's largest stock exchange by market cap",
    hours: '9:30 – 16:00 ET',
    currency: 'USD',
    popular: true,
  },
  {
    id: 'nasdaq',
    name: 'NASDAQ',
    fullName: 'NASDAQ Stock Market',
    region: 'United States',
    flag: '🇺🇸',
    color: '#6366F1',
    assetClasses: ['equities', 'etfs'],
    description: 'Tech-heavy electronic marketplace',
    hours: '9:30 – 16:00 ET',
    currency: 'USD',
    popular: true,
  },
  {
    id: 'asx',
    name: 'ASX',
    fullName: 'Australian Securities Exchange',
    region: 'Australia',
    flag: '🇦🇺',
    color: '#FACC15',
    assetClasses: ['equities', 'etfs', 'bonds'],
    description: 'Primary exchange for Australian listed securities',
    hours: '10:00 – 16:00 AEST',
    currency: 'AUD',
    popular: true,
  },
  {
    id: 'lse',
    name: 'LSE',
    fullName: 'London Stock Exchange',
    region: 'United Kingdom',
    flag: '🇬🇧',
    color: '#14B8A6',
    assetClasses: ['equities', 'etfs', 'bonds'],
    description: 'Oldest and largest exchange in Europe',
    hours: '8:00 – 16:30 GMT',
    currency: 'GBP',
  },
  {
    id: 'tse',
    name: 'TSE',
    fullName: 'Tokyo Stock Exchange',
    region: 'Japan',
    flag: '🇯🇵',
    color: '#F43F5E',
    assetClasses: ['equities', 'etfs'],
    description: "Asia's largest stock exchange",
    hours: '9:00 – 15:30 JST',
    currency: 'JPY',
  },
  {
    id: 'hkex',
    name: 'HKEX',
    fullName: 'Hong Kong Stock Exchange',
    region: 'Hong Kong',
    flag: '🇭🇰',
    color: '#EF4444',
    assetClasses: ['equities', 'etfs'],
    description: 'Gateway to Chinese capital markets',
    hours: '9:30 – 16:00 HKT',
    currency: 'HKD',
  },
  {
    id: 'sse',
    name: 'SSE',
    fullName: 'Shanghai Stock Exchange',
    region: 'China',
    flag: '🇨🇳',
    color: '#DC2626',
    assetClasses: ['equities', 'bonds'],
    description: "China's largest stock exchange",
    hours: '9:30 – 15:00 CST',
    currency: 'CNY',
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    fullName: 'Coinbase Advanced Trade',
    region: 'United States',
    flag: '🇺🇸',
    color: '#1652F0',
    assetClasses: ['crypto'],
    description: 'Regulated US crypto exchange',
    hours: '24 / 7',
    currency: 'USD',
  },
  {
    id: 'kraken',
    name: 'Kraken',
    fullName: 'Kraken Digital Asset Exchange',
    region: 'Global',
    flag: '🌐',
    color: '#5741D9',
    assetClasses: ['crypto', 'forex'],
    description: 'Institutional-grade crypto & FX',
    hours: '24 / 7',
    currency: 'USD / EUR',
  },
  {
    id: 'forex',
    name: 'FX Markets',
    fullName: 'Global Forex Markets',
    region: 'Global',
    flag: '🌍',
    color: '#10B981',
    assetClasses: ['forex'],
    description: 'Decentralised global currency market',
    hours: '24 / 5',
    currency: 'Multi',
  },
  {
    id: 'cme',
    name: 'CME',
    fullName: 'Chicago Mercantile Exchange',
    region: 'United States',
    flag: '🇺🇸',
    color: '#F97316',
    assetClasses: ['commodities', 'forex', 'bonds'],
    description: "World's largest derivatives exchange",
    hours: '23 / 5',
    currency: 'USD',
  },
];

const ASSET_CLASSES: AssetClassDef[] = [
  { id: 'equities', label: 'Equities', icon: '📈', color: BLUE, description: 'Company shares & stock' },
  { id: 'crypto', label: 'Crypto', icon: '₿', color: GOLD, description: 'Digital assets & tokens' },
  { id: 'etfs', label: 'ETFs', icon: '🗂️', color: TEAL, description: 'Exchange-traded funds' },
  { id: 'forex', label: 'Forex', icon: '💱', color: GREEN, description: 'Currency pairs & FX' },
  { id: 'commodities', label: 'Commodities', icon: '🛢️', color: ORANGE, description: 'Gold, oil, agricultural' },
  { id: 'bonds', label: 'Bonds', icon: '🏦', color: PURPLE, description: 'Fixed income securities' },
];

const RISK_LEVELS: { id: RiskLevel; label: string; desc: string; color: string; icon: string }[] = [
  { id: 'conservative', label: 'Conservative', desc: 'Capital preservation, low volatility', color: TEAL, icon: '🛡️' },
  { id: 'moderate', label: 'Moderate', desc: 'Balanced growth and stability', color: BLUE, icon: '⚖️' },
  { id: 'aggressive', label: 'Aggressive', desc: 'High growth with elevated risk', color: ORANGE, icon: '🚀' },
  { id: 'speculative', label: 'Speculative', desc: 'Maximum risk, maximum upside', color: RED, icon: '⚡' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface InvestmentProfile {
  selectedExchanges: string[];
  selectedAssetClasses: AssetClass[];
  riskLevel: RiskLevel | '';
  baseCurrency: string;
}

const defaultProfile: InvestmentProfile = {
  selectedExchanges: [],
  selectedAssetClasses: [],
  riskLevel: '',
  baseCurrency: 'AUD',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <View style={{ marginTop: 32, marginBottom: 14 }}>
    <Text style={sectionStyles.title}>{title}</Text>
    {subtitle && <Text style={sectionStyles.subtitle}>{subtitle}</Text>}
  </View>
);

const sectionStyles = StyleSheet.create({
  title: {
    fontSize: 11,
    color: TEXT_MUTED,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  },
  subtitle: {
    color: TEXT_MUTED,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
});

const ExchangeCard: React.FC<{
  exchange: Exchange;
  selected: boolean;
  onToggle: () => void;
  delay?: number;
}> = ({ exchange, selected, onToggle, delay = 0 }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.96)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true, delay } as any),
    ]).start();
  }, []);

  const handlePressIn = () =>
    Animated.spring(pressAnim, { toValue: 0.96, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }, { scale: pressAnim }] }}>
      <TouchableOpacity
        onPress={onToggle}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={[
          exchStyles.card,
          selected && { borderColor: exchange.color, backgroundColor: `${exchange.color}10` },
        ]}
      >
        {/* Top row */}
        <View style={exchStyles.topRow}>
          <View style={[exchStyles.flagWrap, { backgroundColor: `${exchange.color}18` }]}>
            <Text style={{ fontSize: 20 }}>{exchange.flag}</Text>
          </View>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={exchStyles.name}>{exchange.name}</Text>
              {exchange.popular && (
                <View style={exchStyles.popularBadge}>
                  <Text style={exchStyles.popularText}>POPULAR</Text>
                </View>
              )}
            </View>
            <Text style={exchStyles.region}>{exchange.region}</Text>
          </View>

          {/* Checkbox */}
          <View style={[exchStyles.checkbox, selected && { backgroundColor: exchange.color, borderColor: exchange.color }]}>
            {selected && <Text style={{ color: '#0A0D14', fontSize: 12, fontWeight: '900' }}>✓</Text>}
          </View>
        </View>

        {/* Description */}
        <Text style={exchStyles.description}>{exchange.description}</Text>

        {/* Meta row */}
        <View style={exchStyles.metaRow}>
          <View style={exchStyles.metaItem}>
            <Text style={exchStyles.metaLabel}>HOURS</Text>
            <Text style={exchStyles.metaValue}>{exchange.hours}</Text>
          </View>
          <View style={exchStyles.metaDivider} />
          <View style={exchStyles.metaItem}>
            <Text style={exchStyles.metaLabel}>CURRENCY</Text>
            <Text style={exchStyles.metaValue}>{exchange.currency}</Text>
          </View>
          <View style={exchStyles.metaDivider} />
          <View style={[exchStyles.metaItem, { flex: 2 }]}>
            <Text style={exchStyles.metaLabel}>ASSETS</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              {exchange.assetClasses.map(ac => {
                const def = ASSET_CLASSES.find(a => a.id === ac);
                return def ? (
                  <Text key={ac} style={{ fontSize: 11, color: def.color }}>{def.icon} {def.label}</Text>
                ) : null;
              })}
            </View>
          </View>
        </View>

        {/* Selected accent bar */}
        {selected && (
          <View style={[exchStyles.accentBar, { backgroundColor: exchange.color }]} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const exchStyles = StyleSheet.create({
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  flagWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  region: { color: TEXT_MUTED, fontSize: 12, marginTop: 2 },
  popularBadge: {
    backgroundColor: 'rgba(201,168,76,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  popularText: { color: GOLD, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: { color: TEXT_SUB, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start' },
  metaItem: { flex: 1 },
  metaDivider: { width: 1, backgroundColor: BORDER, marginHorizontal: 12, alignSelf: 'stretch' },
  metaLabel: { color: TEXT_MUTED, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 },
  metaValue: { color: TEXT_SUB, fontSize: 12, fontWeight: '600' },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: 2 },
});

const AssetClassToggle: React.FC<{
  def: AssetClassDef;
  selected: boolean;
  onToggle: () => void;
}> = ({ def, selected, onToggle }) => {
  const pressAnim = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale: pressAnim }], width: (width - 52) / 3 }}>
      <TouchableOpacity
        onPress={onToggle}
        onPressIn={() => Animated.spring(pressAnim, { toValue: 0.93, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true }).start()}
        activeOpacity={1}
        style={[
          assetStyles.chip,
          selected && { borderColor: def.color, backgroundColor: `${def.color}14` },
        ]}
      >
        <Text style={{ fontSize: 22, marginBottom: 6 }}>{def.icon}</Text>
        <Text style={[assetStyles.label, selected && { color: def.color }]}>{def.label}</Text>
        <Text style={assetStyles.desc}>{def.description}</Text>
        {selected && <View style={[assetStyles.selectedDot, { backgroundColor: def.color }]} />}
      </TouchableOpacity>
    </Animated.View>
  );
};

const assetStyles = StyleSheet.create({
  chip: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
    minHeight: 100,
    justifyContent: 'center',
  },
  label: { color: TEXT_PRIMARY, fontSize: 13, fontWeight: '700', marginBottom: 3 },
  desc: { color: TEXT_MUTED, fontSize: 10, textAlign: 'center', lineHeight: 14 },
  selectedDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

const RiskCard: React.FC<{
  item: typeof RISK_LEVELS[0];
  selected: boolean;
  onPress: () => void;
}> = ({ item, selected, onPress }) => {
  const pressAnim = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => Animated.spring(pressAnim, { toValue: 0.97, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true }).start()}
        activeOpacity={1}
        style={[
          riskStyles.card,
          selected && { borderColor: item.color, backgroundColor: `${item.color}0F` },
        ]}
      >
        <Text style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</Text>
        <Text style={[riskStyles.label, selected && { color: item.color }]}>{item.label}</Text>
        <Text style={riskStyles.desc}>{item.desc}</Text>
        {selected && (
          <View style={[riskStyles.bar, { backgroundColor: item.color }]} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const riskStyles = StyleSheet.create({
  card: {
    width: (width - 52) / 2,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 10,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  label: { color: TEXT_PRIMARY, fontSize: 14, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  desc: { color: TEXT_MUTED, fontSize: 11, textAlign: 'center', lineHeight: 16 },
  bar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, borderRadius: 2 },
});

// ─── Summary pill ─────────────────────────────────────────────────────────────
const SummaryBar: React.FC<{ profile: InvestmentProfile }> = ({ profile }) => {
  const count = profile.selectedExchanges.length;
  const ac = profile.selectedAssetClasses.length;
  if (count === 0 && ac === 0) return null;

  return (
    <View style={summaryStyles.bar}>
      <Text style={summaryStyles.text}>
        {count > 0 && `${count} exchange${count > 1 ? 's' : ''}`}
        {count > 0 && ac > 0 && '  ·  '}
        {ac > 0 && `${ac} asset class${ac > 1 ? 'es' : ''}`}
        {profile.riskLevel ? `  ·  ${profile.riskLevel}` : ''}
      </Text>
    </View>
  );
};

const summaryStyles = StyleSheet.create({
  bar: {
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  text: { color: GOLD_LIGHT, fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
});

// ─── Filter tabs ──────────────────────────────────────────────────────────────
const FILTER_TABS = ['All', 'Crypto', 'Equities', 'Forex', 'Commodities'];

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function InvestmentProfileScreen() {
  const { setLoading, isLoading } = useAuthStore();
  const [profile, setProfile] = useState<InvestmentProfile>(defaultProfile);
  const [activeFilter, setActiveFilter] = useState('All');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    loadProfile();
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(headerSlide, { toValue: 0, tension: 70, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  const loadProfile = async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.user_metadata?.investment_profile) {
      setProfile(data.user.user_metadata.investment_profile);
    }
  };

  const updateProfile = (updates: Partial<InvestmentProfile>) => {
    setProfile(p => ({ ...p, ...updates }));
    setHasUnsaved(true);
  };

  const toggleExchange = (id: string) => {
    const next = profile.selectedExchanges.includes(id)
      ? profile.selectedExchanges.filter(e => e !== id)
      : [...profile.selectedExchanges, id];
    updateProfile({ selectedExchanges: next });
  };

  const toggleAssetClass = (id: AssetClass) => {
    const next = profile.selectedAssetClasses.includes(id)
      ? profile.selectedAssetClasses.filter(a => a !== id)
      : [...profile.selectedAssetClasses, id];
    updateProfile({ selectedAssetClasses: next });
  };

  const saveProfile = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { investment_profile: profile },
      });
      if (error) throw error;
      setHasUnsaved(false);
      Alert.alert('Saved', 'Your investment profile has been updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Filter exchanges
  const filteredExchanges = EXCHANGES.filter(ex => {
    if (activeFilter === 'All') return true;
    const filterMap: Record<string, AssetClass> = {
      Crypto: 'crypto',
      Equities: 'equities',
      Forex: 'forex',
      Commodities: 'commodities',
    };
    return ex.assetClasses.includes(filterMap[activeFilter]);
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Ambient accents */}
      <View style={styles.bgAccent1} />
      <View style={styles.bgAccent2} />
      <View style={styles.bgAccent3} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page header ── */}
        <Animated.View style={{ opacity: headerFade, transform: [{ translateY: headerSlide }] }}>
          <Text style={styles.pageLabel}>VESTARA · PORTFOLIO</Text>
          <Text style={styles.pageTitle}>Investment Profile</Text>
          <Text style={styles.pageSubtitle}>
            Select the markets and exchanges you want access to. Your preferences shape
            your personalised dashboard, alerts, and insights.
          </Text>

          <SummaryBar profile={profile} />
        </Animated.View>

        {/* ── Asset classes ── */}
        <SectionHeader
          title="Asset Classes"
          subtitle="Select every asset type you want to trade or monitor"
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ASSET_CLASSES.map(def => (
            <AssetClassToggle
              key={def.id}
              def={def}
              selected={profile.selectedAssetClasses.includes(def.id)}
              onToggle={() => toggleAssetClass(def.id)}
            />
          ))}
        </View>

        {/* ── Risk profile ── */}
        <SectionHeader
          title="Risk Tolerance"
          subtitle="How do you approach investment risk?"
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {RISK_LEVELS.map(item => (
            <RiskCard
              key={item.id}
              item={item}
              selected={profile.riskLevel === item.id}
              onPress={() => updateProfile({ riskLevel: item.id })}
            />
          ))}
        </View>

        {/* ── Exchanges ── */}
        <SectionHeader
          title="Exchanges & Markets"
          subtitle="Choose the exchanges you want to connect and track"
        />

        {/* Filter tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTER_TABS.map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveFilter(tab)}
              style={[styles.filterTab, activeFilter === tab && styles.filterTabActive]}
            >
              <Text style={[styles.filterTabText, activeFilter === tab && styles.filterTabTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Exchange cards */}
        {filteredExchanges.map((ex, i) => (
          <ExchangeCard
            key={ex.id}
            exchange={ex}
            selected={profile.selectedExchanges.includes(ex.id)}
            onToggle={() => toggleExchange(ex.id)}
            delay={i * 40}
          />
        ))}

        {/* ── Base currency ── */}
        <SectionHeader title="Base Currency" subtitle="All values will be converted to this currency" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {['AUD', 'USD', 'GBP', 'EUR', 'JPY', 'HKD'].map(cur => (
            <TouchableOpacity
              key={cur}
              onPress={() => updateProfile({ baseCurrency: cur })}
              style={[
                styles.currencyChip,
                profile.baseCurrency === cur && styles.currencyChipActive,
              ]}
            >
              <Text style={[styles.currencyText, profile.baseCurrency === cur && styles.currencyTextActive]}>
                {cur}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Save button ── */}
        <View style={{ marginTop: 36 }}>
          {hasUnsaved && (
            <Text style={styles.unsavedNote}>● Unsaved changes</Text>
          )}
          <TouchableOpacity
            style={[styles.saveBtn, (!hasUnsaved || isSaving) && styles.saveBtnDim]}
            onPress={saveProfile}
            disabled={!hasUnsaved || isSaving}
          >
            {isSaving
              ? <Text style={styles.saveBtnText}>Saving…</Text>
              : <Text style={styles.saveBtnText}>{hasUnsaved ? 'Save Investment Profile' : 'Profile Saved ✓'}</Text>}
          </TouchableOpacity>
        </View>

        {/* Wordmark */}
        <View style={styles.wordmark}>
          <Text style={styles.wordmarkText}>◈ VESTARA PRIVATE MARKETS</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  bgAccent1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(201,168,76,0.05)',
    top: -80,
    right: -60,
  },
  bgAccent2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(59,130,246,0.04)',
    top: 300,
    left: -60,
  },
  bgAccent3: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(168,85,247,0.03)',
    bottom: 200,
    right: -40,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 60,
  },

  // Page header
  pageLabel: {
    fontSize: 10,
    color: GOLD,
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    marginBottom: 8,
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  pageSubtitle: {
    color: TEXT_SUB,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 18,
  },

  // Filter tabs
  filterRow: {
    gap: 8,
    paddingBottom: 16,
    paddingTop: 4,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterTabActive: {
    backgroundColor: GOLD_DIM,
    borderColor: GOLD_BORDER,
  },
  filterTabText: { color: TEXT_MUTED, fontSize: 13, fontWeight: '600' },
  filterTabTextActive: { color: GOLD_LIGHT },

  // Currency chips
  currencyChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  currencyChipActive: {
    backgroundColor: GOLD_DIM,
    borderColor: GOLD_BORDER,
  },
  currencyText: { color: TEXT_MUTED, fontSize: 14, fontWeight: '700' },
  currencyTextActive: { color: GOLD_LIGHT },

  // Save button
  unsavedNote: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  saveBtn: {
    backgroundColor: GOLD,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: GOLD,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  saveBtnDim: {
    backgroundColor: 'rgba(201,168,76,0.3)',
    shadowOpacity: 0,
  },
  saveBtnText: {
    color: '#0A0D14',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Wordmark
  wordmark: { alignItems: 'center', marginTop: 40 },
  wordmarkText: {
    color: 'rgba(201,168,76,0.2)',
    fontSize: 11,
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
});
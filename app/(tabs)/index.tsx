import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/store/useAuthStore';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ConnectInvestment from '../../components/ConnectInvestments';

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD       = '#C9A84C';
const GOLD_LIGHT = '#E5C97A';
const GOLD_DIM   = 'rgba(201,168,76,0.12)';
const GOLD_BDR   = 'rgba(201,168,76,0.3)';
const BG         = '#0A0D14';
const CARD       = '#12161F';
const CARD2      = '#0F1319';
const BORDER     = 'rgba(255,255,255,0.07)';
const TXT        = '#F0EDE6';
const MUTED      = '#5A6070';
const SUB        = '#8A94A6';
const GREEN      = '#2ECC71';
const RED        = '#E74C3C';

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const sans  = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getInitials = (name: string) => {
  const p = name.trim().split(' ');
  return p.length === 1
    ? (p[0][0] ?? '?').toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase();
};

const formatType = (t: string) =>
  ({ retail: 'Retail Investor', accredited: 'Accredited Investor', institutional: 'Institutional' }[t] ?? t);

// ─── Avatar ───────────────────────────────────────────────────────────────────
const Avatar: React.FC<{ initials: string }> = ({ initials }) => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 10000, useNativeDriver: true })).start();
  }, []);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={av.wrap}>
      <Animated.View style={[av.ring, { transform: [{ rotate }] }]} />
      <View style={av.circle}>
        <Text style={av.text}>{initials}</Text>
      </View>
    </View>
  );
};
const av = StyleSheet.create({
  wrap:   { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  ring:   { position: 'absolute', width: 92, height: 92, borderRadius: 46, borderWidth: 1.5, borderColor: GOLD, borderStyle: 'dashed', opacity: 0.5 },
  circle: { width: 76, height: 76, borderRadius: 38, backgroundColor: GOLD_DIM, borderWidth: 2, borderColor: GOLD_BDR, alignItems: 'center', justifyContent: 'center' },
  text:   { color: GOLD_LIGHT, fontSize: 26, fontWeight: '700', fontFamily: serif, letterSpacing: 1 },
});

// ─── Stat pill ────────────────────────────────────────────────────────────────
const Stat: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <View style={st.card}>
    <Text style={st.icon}>{icon}</Text>
    <Text style={st.value}>{value}</Text>
    <Text style={st.label}>{label}</Text>
  </View>
);
const st = StyleSheet.create({
  card:  { flex: 1, backgroundColor: CARD2, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 14, alignItems: 'center', gap: 3 },
  icon:  { fontSize: 18, marginBottom: 2 },
  value: { color: TXT, fontSize: 15, fontWeight: '700', fontFamily: serif },
  label: { color: MUTED, fontSize: 10, letterSpacing: 0.5, textAlign: 'center' },
});

// ─── Nav card ─────────────────────────────────────────────────────────────────
const NavCard: React.FC<{ icon: string; title: string; sub: string; onPress: () => void; accent?: string }> = ({ icon, title, sub, onPress, accent = GOLD }) => {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[nc.card, { borderColor: `${accent}30` }]}
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        activeOpacity={1}
      >
        <View style={[nc.icon, { backgroundColor: `${accent}15` }]}>
          <Text style={{ fontSize: 20 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={nc.title}>{title}</Text>
          <Text style={nc.sub}>{sub}</Text>
        </View>
        <Text style={[nc.arrow, { color: accent }]}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};
const nc = StyleSheet.create({
  card:  { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, padding: 16, gap: 14, marginBottom: 10 },
  icon:  { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { color: TXT, fontSize: 15, fontWeight: '700', fontFamily: serif },
  sub:   { color: MUTED, fontSize: 12, marginTop: 2 },
  arrow: { fontSize: 24, marginRight: -4 },
});

// ─── Settings row ─────────────────────────────────────────────────────────────
const Row: React.FC<{ icon: string; label: string; value?: string; onPress?: () => void; danger?: boolean }> = ({ icon, label, value, onPress, danger }) => (
  <TouchableOpacity style={rw.row} onPress={onPress} activeOpacity={0.7}>
    <View style={[rw.iconWrap, danger && { backgroundColor: 'rgba(231,76,60,0.1)' }]}>
      <Text style={{ fontSize: 15 }}>{icon}</Text>
    </View>
    <Text style={[rw.label, danger && { color: RED }]}>{label}</Text>
    <View style={{ flex: 1 }} />
    {value ? <Text style={rw.value}>{value}</Text> : null}
    {!danger && <Text style={rw.chevron}>›</Text>}
  </TouchableOpacity>
);
const rw = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 },
  iconWrap: { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  label:    { color: TXT, fontSize: 14, fontWeight: '500' },
  value:    { color: MUTED, fontSize: 13, marginRight: 6 },
  chevron:  { color: MUTED, fontSize: 20 },
});

const Section: React.FC<{ title: string }> = ({ title }) => (
  <Text style={{ color: MUTED, fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase', marginTop: 28, marginBottom: 8, fontFamily: sans }}>{title}</Text>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { setLoading } = useAuthStore();
  const [user, setUser]         = useState<any>(null);
  const [meta, setMeta]         = useState<any>({});
  const [connected, setConnected] = useState(false);

  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) { setUser(data.user); setMeta(data.user.user_metadata ?? {}); }
    });
    checkBrokerageConnection();
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, tension: 70, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  const checkBrokerageConnection = async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    const { data } = await supabase.from('snaptrade_connections').select('account_id').eq('user_id', u.id).maybeSingle();
    setConnected(!!data?.account_id);
  };

  const handleSignOut = () =>
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        setLoading(true);
        try { await supabase.auth.signOut(); } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); }
      }},
    ]);

  const fullName   = meta.first_name && meta.last_name ? `${meta.first_name} ${meta.last_name}` : user?.email?.split('@')[0] ?? 'Investor';
  const email      = user?.email ?? '—';
  const phone      = meta.phone || '—';
  const type       = meta.investor_type ? formatType(meta.investor_type) : '—';
  const since      = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) : '—';
  const verified   = user?.email_confirmed_at ? 'Verified' : 'Pending';
  const initials   = getInitials(fullName);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.glow1} /><View style={s.glow2} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header card ── */}
        <Animated.View style={[s.headerCard, { opacity: fade, transform: [{ translateY: slide }] }]}>
          {/* Top bar */}
          <View style={s.topBar}>
            <View>
              <Text style={s.screenLabel}>MY PROFILE</Text>
              <Text style={s.brand}>Vestara</Text>
            </View>
            <View style={[s.badge, { backgroundColor: verified === 'Verified' ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.1)' }]}>
              <View style={[s.dot, { backgroundColor: verified === 'Verified' ? GREEN : RED }]} />
              <Text style={[s.badgeTxt, { color: verified === 'Verified' ? GREEN : RED }]}>{verified}</Text>
            </View>
          </View>

          {/* Avatar + info */}
          <View style={s.identity}>
            <Avatar initials={initials} />
            <View style={{ flex: 1, marginLeft: 18 }}>
              <Text style={s.name}>{fullName}</Text>
              <Text style={s.email}>{email}</Text>
              <View style={s.pill}>
                <Text style={s.pillTxt}>{type}</Text>
              </View>
            </View>
          </View>

          {/* Stats */}
          <View style={s.statsRow}>
            <Stat icon="📅" label="Member Since" value={since} />
            <View style={{ width: 8 }} />
            <Stat icon="🔐" label="2FA" value="Off" />
            <View style={{ width: 8 }} />
            <Stat icon="🌐" label="Sessions" value="1 Active" />
          </View>
        </Animated.View>

        {/* ── Navigate to other screens ── */}
        <Section title="My Portfolio" />

        <NavCard
          icon="📊"
          title="Portfolio Dashboard"
          sub={connected ? 'Binance connected · tap to view live data' : 'Connect a brokerage to see your holdings'}
          onPress={() => router.push('/(tabs)/Portfolio')}
          accent={GOLD}
        />
        <NavCard
          icon="🎯"
          title="Investment Profile"
          sub="Exchanges, risk tolerance & asset classes"
          onPress={() => router.push('/two')}
          accent="#3B82F6"
        />

        {/* ── Brokerage connection ── */}
        <Section title="Wealth Aggregation" />
        <View style={s.section}>
          <View style={{ padding: 16, paddingBottom: 8 }}>
            <Text style={s.sectionTitle}>Connect External Accounts</Text>
            <Text style={s.sectionSub}>Sync your holdings for unified AI-driven analysis</Text>
          </View>
          <ConnectInvestment onConnectionChange={setConnected} />
        </View>

        {/* ── Account details ── */}
        <Section title="Account Details" />
        <View style={s.section}>
          <Row icon="✉️" label="Email"         value={email} />
          <Row icon="📱" label="Phone"         value={phone} />
          <Row icon="🏷️" label="Investor Type" value={type}  />
        </View>

        {/* ── Security ── */}
        <Section title="Security" />
        <View style={s.section}>
          <Row icon="🔑" label="Change Password"           onPress={() => Alert.alert('Coming Soon')} />
          <Row icon="🛡️" label="Two-Factor Authentication" value="Off" onPress={() => Alert.alert('Coming Soon')} />
          <Row icon="📋" label="Active Sessions"           onPress={() => Alert.alert('Coming Soon')} />
        </View>

        {/* ── Preferences ── */}
        <Section title="Preferences" />
        <View style={s.section}>
          <Row icon="🔔" label="Notifications" onPress={() => {}} />
          <Row icon="🌙" label="Appearance"    value="Dark"  onPress={() => {}} />
          <Row icon="💱" label="Base Currency" value="AUD"   onPress={() => {}} />
        </View>

        {/* ── Account ── */}
        <Section title="Account" />
        <View style={s.section}>
          <Row icon="🚪" label="Sign Out" onPress={handleSignOut} danger />
        </View>

        <View style={s.wordmark}>
          <Text style={s.wordmarkTxt}>◈ VESTARA · v1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  glow1:   { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(201,168,76,0.04)', top: -80, right: -80 },
  glow2:   { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(59,130,246,0.03)', bottom: 120, left: -60 },
  scroll:  { paddingHorizontal: 18, paddingTop: Platform.OS === 'ios' ? 58 : 36, paddingBottom: 48 },

  headerCard:  { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: BORDER, padding: 20, marginBottom: 4, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  topBar:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  screenLabel: { fontSize: 9, color: GOLD, letterSpacing: 3, fontFamily: sans },
  brand:       { fontSize: 22, fontWeight: '700', color: TXT, fontFamily: serif, letterSpacing: 0.3, marginTop: 2 },
  badge:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 6 },
  dot:         { width: 6, height: 6, borderRadius: 3 },
  badgeTxt:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  identity:    { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  name:        { fontSize: 19, fontWeight: '700', color: TXT, fontFamily: serif, marginBottom: 3 },
  email:       { fontSize: 12, color: MUTED, marginBottom: 8 },
  pill:        { alignSelf: 'flex-start', backgroundColor: GOLD_DIM, borderWidth: 1, borderColor: GOLD_BDR, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  pillTxt:     { color: GOLD_LIGHT, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  statsRow:    { flexDirection: 'row' },

  section:     { backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  sectionTitle:{ color: TXT, fontSize: 15, fontWeight: '700', fontFamily: serif, marginBottom: 4 },
  sectionSub:  { color: SUB, fontSize: 12, lineHeight: 18 },

  wordmark:    { alignItems: 'center', marginTop: 32 },
  wordmarkTxt: { color: 'rgba(201,168,76,0.2)', fontSize: 11, letterSpacing: 3, fontFamily: serif },
});
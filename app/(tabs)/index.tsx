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
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ConnectInvestment from '../../components/ConnectInvestments';

// ─── Palette — Slate Indigo ───────────────────────────────────────────────────
const BG      = '#0C1019';
const CARD    = '#131A27';
const CARD2   = '#1A2235';
const BORDER  = 'rgba(255,255,255,0.07)';
const BORDER2 = 'rgba(255,255,255,0.11)';

const IND     = '#7C6CF0';   // electric violet — primary
const IND_L   = '#A89CF5';
const IND_D   = 'rgba(124,108,240,0.10)';
const IND_B   = 'rgba(124,108,240,0.22)';

const VIO     = '#9B8CF4';   // violet — secondary (lighter shade)
const VIO_L   = '#C4B5FD';
const VIO_D   = 'rgba(155,140,244,0.12)';

const TEAL    = '#0EA5E9';   // sky blue — links / info
const TEAL_D  = 'rgba(14,165,233,0.10)';

const GRN     = '#10B981';   // emerald — success / verified
const GRN_D   = 'rgba(16,185,129,0.10)';

const AMB     = '#F59E0B';   // amber — warnings
const AMB_D   = 'rgba(245,158,11,0.10)';

const RED     = '#EF4444';   // danger
const RED_D   = 'rgba(239,68,68,0.08)';

const T1      = '#F1F5F9';   // primary text
const T2      = '#94A3B8';   // secondary text
const T3      = '#475569';   // muted text
const DIVID   = 'rgba(255,255,255,0.055)';

const sans  = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';
const mono  = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getInitials = (n: string) => {
  const p = n.trim().split(' ');
  return (p.length === 1 ? p[0][0] : p[0][0] + p[p.length - 1][0]).toUpperCase();
};
const fmtType = (t: string) =>
  ({ retail: 'Retail Investor', accredited: 'Accredited Investor', institutional: 'Institutional' }[t] ?? t);

// ─── Avatar ───────────────────────────────────────────────────────────────────
const Avatar: React.FC<{ initials: string; score: number }> = ({ initials, score }) => {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.06, duration: 2600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1.00, duration: 2600, useNativeDriver: true }),
    ])).start();
  }, []);
  const ring = score >= 70 ? GRN : score >= 50 ? IND : AMB;
  return (
    <View style={av.wrap}>
      <Animated.View style={[av.halo, { borderColor: `${ring}30`, transform: [{ scale: pulse }] }]} />
      <View style={[av.ring, { borderColor: ring }]}>
        <View style={av.face}>
          <Text style={av.initials}>{initials}</Text>
        </View>
      </View>
    </View>
  );
};
const av = StyleSheet.create({
  wrap:     { alignItems: 'center', justifyContent: 'center', width: 84, height: 84 },
  halo:     { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 1 },
  ring:     { width: 76, height: 76, borderRadius: 38, borderWidth: 2.5,
              padding: 3, backgroundColor: 'transparent' },
  face:     { flex: 1, borderRadius: 34, backgroundColor: IND_D,
              alignItems: 'center', justifyContent: 'center' },
  initials: { color: IND_L, fontSize: 24, fontWeight: '700', fontFamily: sans, letterSpacing: 1 },
});

// ─── Score bar ────────────────────────────────────────────────────────────────
const ScoreBar: React.FC<{ score: number }> = ({ score }) => {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: score / 100, duration: 1100, useNativeDriver: false }).start();
  }, []);
  const color = score >= 70 ? GRN : score >= 50 ? IND : AMB;
  const label = score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 50 ? 'Fair' : 'Low';
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={bar.lbl}>Trust Score</Text>
        <View style={bar.badge}>
          <Text style={[bar.badgeTxt, { color }]}>{label}</Text>
          <Text style={[bar.score, { color }]}>{score}<Text style={bar.max}>/100</Text></Text>
        </View>
      </View>
      <View style={bar.track}>
        <Animated.View style={[bar.fill, { width: w.interpolate({ inputRange:[0,1], outputRange:['0%','100%'] }), backgroundColor: color }]} />
      </View>
    </View>
  );
};
const bar = StyleSheet.create({
  lbl:      { color: T2, fontSize: 13, fontFamily: sans },
  badge:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badgeTxt: { fontSize: 12, fontFamily: sans },
  score:    { fontSize: 15, fontWeight: '700', fontFamily: sans },
  max:      { fontSize: 11, color: T3 },
  track:    { height: 4, backgroundColor: CARD2, borderRadius: 4, overflow: 'hidden' },
  fill:     { height: '100%', borderRadius: 4 },
});

// ─── Section header ───────────────────────────────────────────────────────────
const SectionHead: React.FC<{ title: string }> = ({ title }) => (
  <Text style={sh.txt}>{title}</Text>
);
const sh = StyleSheet.create({
  txt: { color: T3, fontSize: 11, fontWeight: '600', fontFamily: sans,
         textTransform: 'uppercase', letterSpacing: 1.2,
         marginTop: 28, marginBottom: 10 },
});

// ─── Stat tile ────────────────────────────────────────────────────────────────
const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = T1 }) => (
  <View style={st.tile}>
    <Text style={[st.val, { color }]}>{value}</Text>
    <Text style={st.lbl}>{label}</Text>
  </View>
);
const st = StyleSheet.create({
  tile: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  val:  { fontSize: 14, fontWeight: '700', fontFamily: sans, marginBottom: 3 },
  lbl:  { color: T3, fontSize: 10, fontFamily: sans, textAlign: 'center' },
});

// ─── Nav card ─────────────────────────────────────────────────────────────────
const NavCard: React.FC<{
  icon: string; title: string; sub: string; accent: string;
  onPress: () => void; pill?: string;
}> = ({ icon, title, sub, accent, onPress, pill }) => {
  const sc = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale: sc }] }}>
      <TouchableOpacity
        style={nc.card}
        onPress={onPress}
        onPressIn={() => Animated.spring(sc, { toValue: 0.975, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(sc, { toValue: 1.000, useNativeDriver: true }).start()}
        activeOpacity={1}
      >
        <View style={[nc.icon, { backgroundColor: `${accent}18` }]}>
          <Text style={{ fontSize: 19 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={nc.title}>{title}</Text>
          <Text style={nc.sub}>{sub}</Text>
        </View>
        {pill && (
          <View style={[nc.pill, { backgroundColor: `${accent}15`, borderColor: `${accent}30` }]}>
            <Text style={[nc.pillTxt, { color: accent }]}>{pill}</Text>
          </View>
        )}
        <Text style={[nc.arrow, { color: T3 }]}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};
const nc = StyleSheet.create({
  card:    { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD,
             borderRadius: 14, borderWidth: 1, borderColor: BORDER,
             padding: 14, gap: 13, marginBottom: 8 },
  icon:    { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title:   { color: T1, fontSize: 14, fontWeight: '600', fontFamily: sans, marginBottom: 2 },
  sub:     { color: T2, fontSize: 11, lineHeight: 16 },
  pill:    { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  pillTxt: { fontSize: 9, fontWeight: '700', fontFamily: sans, letterSpacing: 0.5 },
  arrow:   { fontSize: 22, marginLeft: 4 },
});

// ─── Settings group ───────────────────────────────────────────────────────────
const Group: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={grp.wrap}>{children}</View>
);
const grp = StyleSheet.create({
  wrap: { backgroundColor: CARD, borderRadius: 16, borderWidth: 1,
          borderColor: BORDER, overflow: 'hidden' },
});

// ─── Settings row ─────────────────────────────────────────────────────────────
const Row: React.FC<{
  icon: string; iconBg: string; label: string;
  value?: string; onPress?: () => void;
  toggle?: boolean; toggleVal?: boolean; last?: boolean;
}> = ({ icon, iconBg, label, value, onPress, toggle, toggleVal, last }) => (
  <TouchableOpacity
    style={[rw.row, last && rw.rowLast]}
    onPress={onPress}
    activeOpacity={onPress ? 0.6 : 1}
  >
    <View style={[rw.icon, { backgroundColor: iconBg }]}>
      <Text style={{ fontSize: 15 }}>{icon}</Text>
    </View>
    <Text style={rw.label}>{label}</Text>
    <View style={{ flex: 1 }} />
    {toggle ? (
      <Switch
        value={toggleVal ?? false}
        onValueChange={() => Alert.alert('Coming Soon')}
        trackColor={{ false: CARD2, true: VIO }}
        thumbColor={toggleVal ? '#fff' : T2}
        ios_backgroundColor={CARD2}
      />
    ) : (
      <>
        {value && <Text style={rw.value}>{value}</Text>}
        {onPress && <Text style={rw.chevron}>›</Text>}
      </>
    )}
  </TouchableOpacity>
);
const rw = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
              paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: DIVID, gap: 13 },
  rowLast:  { borderBottomWidth: 0 },
  icon:     { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  label:    { color: T1, fontSize: 14, fontFamily: sans },
  value:    { color: T2, fontSize: 13, fontFamily: sans, marginRight: 2 },
  chevron:  { color: T3, fontSize: 20 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { setLoading } = useAuthStore();
  const [user, setUser]           = useState<any>(null);
  const [meta, setMeta]           = useState<any>({});
  const [connected, setConnected] = useState(false);

  const fade  = useRef(new Animated.Value(0)).current;
  const slideA = useRef(new Animated.Value(20)).current;
  const slideB = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) { setUser(data.user); setMeta(data.user.user_metadata ?? {}); }
    });
    checkBrokerageConnection();
    Animated.parallel([
      Animated.timing(fade,   { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(slideA, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      Animated.spring(slideB, { toValue: 0, delay: 80, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  const checkBrokerageConnection = async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    const { data } = await supabase
      .from('snaptrade_connections').select('account_id').eq('user_id', u.id).maybeSingle();
    setConnected(!!data?.account_id);
  };

  const handleSignOut = () =>
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        setLoading(true);
        try { await supabase.auth.signOut(); }
        catch (e: any) { Alert.alert('Error', e.message); }
        finally { setLoading(false); }
      }},
    ]);

  const fullName  = meta.first_name && meta.last_name
    ? `${meta.first_name} ${meta.last_name}`
    : user?.email?.split('@')[0] ?? 'Investor';
  const email     = user?.email ?? '—';
  const phone     = meta.phone  || 'Not set';
  const type      = meta.investor_type ? fmtType(meta.investor_type) : 'Not set';
  const since     = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
    : '—';
  const verified  = !!user?.email_confirmed_at;
  const initials  = getInitials(fullName);
  const score     = verified ? 74 : 40;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Soft background glow */}
      <View style={s.glow} />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ─── Profile Hero ─────────────────────────────────── */}
        <Animated.View style={[s.hero, { opacity: fade, transform: [{ translateY: slideA }] }]}>

          {/* Top row: label + status */}
          <View style={s.heroTop}>
            <Text style={s.screenLabel}>My Profile</Text>
            <View style={[s.statusBadge,
              verified
                ? { backgroundColor: GRN_D, borderColor: `${GRN}35` }
                : { backgroundColor: AMB_D, borderColor: `${AMB}35` }
            ]}>
              <View style={[s.statusDot, { backgroundColor: verified ? GRN : AMB }]} />
              <Text style={[s.statusTxt, { color: verified ? GRN : AMB }]}>
                {verified ? 'Verified' : 'Pending'}
              </Text>
            </View>
          </View>

          {/* Avatar + identity */}
          <View style={s.identity}>
            <Avatar initials={initials} score={score} />
            <View style={s.identityText}>
              <Text style={s.name}>{fullName}</Text>
              <Text style={s.emailTxt}>{email}</Text>
              {meta.investor_type ? (
                <View style={s.rolePill}>
                  <Text style={s.roleTxt}>{type}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Stats strip */}
          <View style={s.statsStrip}>
            <Stat label="Member since" value={since}       color={T1}   />
            <View style={s.statDiv} />
            <Stat label="Trust score"  value={`${score}/100`} color={score >= 65 ? GRN : score >= 50 ? IND_L : AMB} />
            <View style={s.statDiv} />
            <Stat label="Sessions"     value="1 active"    color={IND_L} />
          </View>
        </Animated.View>

        {/* ─── Trust score card ─────────────────────────────── */}
        <Animated.View style={[s.card, { opacity: fade, transform: [{ translateY: slideB }] }]}>
          <ScoreBar score={score} />
        </Animated.View>

        {/* ─── Portfolio ────────────────────────────────────── */}
        <SectionHead title="Portfolio" />
        <NavCard
          icon="📊"
          title="Portfolio Dashboard"
          sub={connected ? 'Account connected · view live holdings' : 'Connect a brokerage to get started'}
          accent={IND}
          onPress={() => router.push('/(tabs)/Portfolio')}
          pill={connected ? 'Live' : 'Connect'}
        />
        <NavCard
          icon="🎯"
          title="Investment Profile"
          sub="Risk tolerance, asset classes & exchanges"
          accent={VIO}
          onPress={() => router.push('/two')}
        />

        {/* ─── Connect accounts ─────────────────────────────── */}
        <SectionHead title="Connected Accounts" />
        <View style={s.connectCard}>
          <View style={s.connectTop}>
            <Text style={s.connectTitle}>Link External Accounts</Text>
            <Text style={s.connectSub}>Sync your brokerage holdings for unified portfolio analysis.</Text>
          </View>
          <ConnectInvestment onConnectionChange={setConnected} />
        </View>

        {/* ─── Account settings ─────────────────────────────── */}
        <SectionHead title="Account Details" />
        <Group>
          <Row icon="✉️" iconBg={IND_D}       label="Email"         value={email}  onPress={() => Alert.alert('Coming Soon')} />
          <Row icon="📱" iconBg={TEAL_D}      label="Phone"         value={phone}  onPress={() => Alert.alert('Coming Soon')} />
          <Row icon="🏷️" iconBg={VIO_D}       label="Investor type" value={type}   onPress={() => Alert.alert('Coming Soon')} />
          <Row icon="🌐" iconBg={`${T3}25`}   label="Region"        value="UTC"    onPress={() => Alert.alert('Coming Soon')} last />
        </Group>

        {/* ─── Security ─────────────────────────────────────── */}
        <SectionHead title="Security" />
        <Group>
          <Row icon="🔑" iconBg={AMB_D}  label="Change password"           onPress={() => Alert.alert('Coming Soon')} />
          <Row icon="🛡️" iconBg={VIO_D}  label="Two-factor authentication" toggle toggleVal={false} />
          <Row icon="📋" iconBg={IND_D}  label="Active sessions"            onPress={() => Alert.alert('Coming Soon')} last />
        </Group>

        {/* ─── Preferences ──────────────────────────────────── */}
        <SectionHead title="Preferences" />
        <Group>
          <Row icon="🔔" iconBg={AMB_D}        label="Notifications"   onPress={() => {}} />
          <Row icon="🌙" iconBg={VIO_D}        label="Appearance"      value="Dark"   onPress={() => {}} />
          <Row icon="💱" iconBg={TEAL_D}       label="Base currency"   value="AUD"    onPress={() => {}} />
          <Row icon="📳" iconBg={`${T3}20`}   label="Haptic feedback" value="On"     onPress={() => {}} last />
        </Group>

        {/* ─── Sign out ─────────────────────────────────────── */}
        <SectionHead title="Account" />
        <Group>
          <Row icon="🚪" iconBg={RED_D} label="Sign out" onPress={handleSignOut} last />
        </Group>

        {/* ─── Footer ───────────────────────────────────────── */}
        <View style={s.footer}>
          <Text style={s.footerTxt}>Vestara · v1.0.0</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  glow:   { position: 'absolute', top: -120, left: '50%', marginLeft: -150,
            width: 300, height: 300, borderRadius: 150,
            backgroundColor: 'rgba(99,102,241,0.06)' },

  scroll: { paddingHorizontal: 18,
            paddingTop: Platform.OS === 'ios' ? 60 : 38,
            paddingBottom: 56 },

  // ── Hero
  hero:        { backgroundColor: CARD, borderRadius: 20, borderWidth: 1,
                 borderColor: BORDER, padding: 20, marginBottom: 10,
                 shadowColor: '#000', shadowOpacity: 0.25,
                 shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  heroTop:     { flexDirection: 'row', justifyContent: 'space-between',
                 alignItems: 'center', marginBottom: 20 },
  screenLabel: { color: T1, fontSize: 18, fontWeight: '700', fontFamily: sans },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6,
                 paddingHorizontal: 11, paddingVertical: 5,
                 borderRadius: 20, borderWidth: 1 },
  statusDot:   { width: 6, height: 6, borderRadius: 3 },
  statusTxt:   { fontSize: 12, fontWeight: '600', fontFamily: sans },

  identity:    { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 22 },
  identityText:{ flex: 1 },
  name:        { color: T1, fontSize: 20, fontWeight: '700', fontFamily: sans,
                 marginBottom: 3, letterSpacing: 0.1 },
  emailTxt:    { color: T2, fontSize: 12, fontFamily: sans, marginBottom: 8 },
  rolePill:    { alignSelf: 'flex-start', backgroundColor: IND_D,
                 borderWidth: 1, borderColor: IND_B,
                 borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  roleTxt:     { color: IND_L, fontSize: 11, fontWeight: '600', fontFamily: sans },

  statsStrip:  { flexDirection: 'row', backgroundColor: CARD2,
                 borderRadius: 14, borderWidth: 1, borderColor: BORDER },
  statDiv:     { width: 1, backgroundColor: BORDER, marginVertical: 12 },

  // ── Score card
  card:        { backgroundColor: CARD, borderRadius: 16, borderWidth: 1,
                 borderColor: BORDER, padding: 18, marginBottom: 4 },

  // ── Connect
  connectCard: { backgroundColor: CARD, borderRadius: 16, borderWidth: 1,
                 borderColor: BORDER, overflow: 'hidden' },
  connectTop:  { padding: 16, paddingBottom: 10 },
  connectTitle:{ color: T1, fontSize: 15, fontWeight: '600', fontFamily: sans, marginBottom: 4 },
  connectSub:  { color: T2, fontSize: 12, lineHeight: 18 },

  // ── Footer
  footer:    { alignItems: 'center', marginTop: 32 },
  footerTxt: { color: T3, fontSize: 11, fontFamily: sans },
});

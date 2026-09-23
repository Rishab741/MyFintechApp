import { NavMenuButton } from '@/components/NavMenuButton';
import { supabase } from '@/src/lib/supabase';
import { queryClient } from '@/src/lib/queryClient';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useConnectionStore } from '@/src/store/useConnectionStore';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ConnectInvestment from '../../components/ConnectInvestments';
import { QL, sans } from '@/constants/Colors';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// ─── Palette — Quantum Ledger (unified) ───────────────────────────────────────
const BG      = QL.BG;
const CARD    = QL.CARD;
const CARD2   = QL.CARD2;
const BORDER  = QL.BORDER;

const IND     = QL.BLUE;
const IND_L   = '#A5B4FC';
const IND_D   = QL.BLUE_D;
const IND_B   = 'rgba(129,140,248,0.22)';

const VIO     = QL.BLUE;
const VIO_D   = QL.BLUE_D;

const TEAL    = QL.GOLD;
const TEAL_D  = QL.GOLD_D;

const GRN     = QL.GREEN;
const GRN_D   = QL.GREEN_D;

const AMB     = QL.AMBER;
const AMB_D   = QL.AMBER_D;

const RED     = QL.RED;
const RED_D   = QL.RED_D;

const T1      = QL.TXT;
const T2      = QL.TXT2;
const T3      = QL.MUTED;
const DIVID   = QL.BORDER;

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
const ScoreBar: React.FC<{ score: number; title: string }> = ({ score, title }) => {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: score / 100, duration: 1100, useNativeDriver: false }).start();
  }, []);
  const color = score >= 70 ? GRN : score >= 50 ? IND : AMB;
  const label = score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 50 ? 'Fair' : 'Low';
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={bar.lbl}>{title}</Text>
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
  icon: IconName; title: string; sub: string; accent: string;
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
          <MaterialCommunityIcons name={icon} size={20} color={accent} />
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
// `soon` marks a row whose backing feature isn't built yet — instead of an
// Alert.alert('Coming Soon') popup on tap (which reads as broken), it shows a
// muted "Soon" pill and isn't interactive.
const Row: React.FC<{
  icon: IconName; iconBg: string; iconColor: string; label: string;
  value?: string; onPress?: () => void;
  toggle?: boolean; toggleVal?: boolean; last?: boolean; soon?: boolean;
}> = ({ icon, iconBg, iconColor, label, value, onPress, toggle, toggleVal, last, soon }) => (
  <TouchableOpacity
    style={[rw.row, last && rw.rowLast]}
    onPress={soon ? undefined : onPress}
    activeOpacity={onPress && !soon ? 0.6 : 1}
    disabled={soon}
  >
    <View style={[rw.icon, { backgroundColor: iconBg }]}>
      <MaterialCommunityIcons name={icon} size={16} color={iconColor} />
    </View>
    <Text style={[rw.label, soon && { color: T3 }]}>{label}</Text>
    <View style={{ flex: 1 }} />
    {soon ? (
      <>
        {value && <Text style={rw.value}>{value}</Text>}
        <View style={rw.soonPill}><Text style={rw.soonTxt}>Soon</Text></View>
      </>
    ) : toggle ? (
      <Switch
        value={toggleVal ?? false}
        onValueChange={onPress}
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
  soonPill: { backgroundColor: CARD2, borderWidth: 1, borderColor: BORDER,
              borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 6 },
  soonTxt:  { color: T3, fontSize: 10, fontWeight: '600', fontFamily: sans, letterSpacing: 0.3 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { setLoading, reset: resetAuth }       = useAuthStore();
  const { reset: resetConnection }              = useConnectionStore();
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
        try {
          await supabase.auth.signOut();
          // Clear all user-specific state so a subsequent login on the same
          // device never sees data from the previous session.
          resetAuth();
          resetConnection();
          queryClient.clear();
        }
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
  // Profile completeness — a real count of filled-in profile fields, not a
  // modeled risk/trust score. Keep this list in sync with the rows below.
  const completenessChecks = [verified, !!meta.phone, !!meta.investor_type, connected];
  const score = Math.round(
    (completenessChecks.filter(Boolean).length / completenessChecks.length) * 100
  );

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <NavMenuButton />
              <Text style={s.screenLabel}>My Profile</Text>
            </View>
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
            <Stat label="Profile"      value={`${score}%`} color={score >= 65 ? GRN : score >= 50 ? IND_L : AMB} />
            <View style={s.statDiv} />
            <Stat label="Sessions"     value="1 active"    color={IND_L} />
          </View>
        </Animated.View>

        {/* ─── Profile completeness card ───────────────────── */}
        <Animated.View style={[s.card, { opacity: fade, transform: [{ translateY: slideB }] }]}>
          <ScoreBar score={score} title="Profile Completeness" />
        </Animated.View>

        {/* ─── Portfolio ────────────────────────────────────── */}
        <SectionHead title="Portfolio" />
        <NavCard
          icon="view-dashboard-outline"
          title="Portfolio Dashboard"
          sub={connected ? 'Account connected · view live holdings' : 'Connect a brokerage to get started'}
          accent={IND}
          onPress={() => router.push('/(tabs)/Portfolio')}
          pill={connected ? 'Live' : 'Connect'}
        />
        <NavCard
          icon="target"
          title="Investment Profile"
          sub="Risk tolerance, asset classes & exchanges"
          accent={VIO}
          onPress={() => router.push('/(tabs)/InvestmentProfile')}
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
          <Row icon="email-outline" iconBg={IND_D}     iconColor={IND}  label="Email"         value={email}  soon />
          <Row icon="cellphone"     iconBg={TEAL_D}     iconColor={TEAL} label="Phone"         value={phone}  soon />
          <Row icon="tag-outline"   iconBg={VIO_D}      iconColor={VIO}  label="Investor type" value={type}   soon />
          <Row icon="earth"         iconBg={`${T3}25`}  iconColor={T3}   label="Region"        value="UTC"    soon last />
        </Group>

        {/* ─── Portfolio Tools ─────────────────────────────── */}
        <SectionHead title="Portfolio Tools" />
        <Group>
          <Row icon="bank"                iconBg={TEAL_D} iconColor={TEAL} label="Connected Accounts" onPress={() => router.navigate('/(tabs)/Onboarding')} />
          <Row icon="tray-arrow-down"     iconBg={IND_D}  iconColor={IND}  label="Import Data"        onPress={() => router.navigate('/(tabs)/Import')} />
          <Row icon="chart-bar"           iconBg={VIO_D}  iconColor={VIO}  label="Reports"            onPress={() => router.navigate('/(tabs)/Reports')} />
          <Row icon="tune-variant"        iconBg={AMB_D}  iconColor={AMB}  label="Investment Profile"  onPress={() => router.navigate('/(tabs)/InvestmentProfile')} last />
        </Group>

        {/* ─── Security ─────────────────────────────────────── */}
        <SectionHead title="Security" />
        <Group>
          <Row icon="key-outline"            iconBg={AMB_D} iconColor={AMB} label="Change password"           soon />
          <Row icon="shield-check-outline"   iconBg={VIO_D} iconColor={VIO} label="Two-factor authentication" toggle toggleVal={false} soon />
          <Row icon="clipboard-list-outline" iconBg={IND_D} iconColor={IND} label="Active sessions"            soon last />
        </Group>

        {/* ─── Preferences ──────────────────────────────────── */}
        <SectionHead title="Preferences" />
        <Group>
          <Row icon="bell-outline"     iconBg={AMB_D}      iconColor={AMB} label="Notifications"   soon />
          <Row icon="weather-night"    iconBg={VIO_D}      iconColor={VIO} label="Appearance"      value="Dark" soon />
          <Row icon="currency-usd"     iconBg={TEAL_D}     iconColor={TEAL} label="Base currency"   value="AUD"  soon />
          <Row icon="vibrate"          iconBg={`${T3}20`}  iconColor={T3}  label="Haptic feedback" value="On"   soon last />
        </Group>

        {/* ─── Sign out ─────────────────────────────────────── */}
        <SectionHead title="Account" />
        <Group>
          <Row icon="logout" iconBg={RED_D} iconColor={RED} label="Sign out" onPress={handleSignOut} last />
        </Group>

        {/* ─── Footer ───────────────────────────────────────── */}
        <View style={s.footer}>
          <Text style={s.footerTxt}>Platstock · v1.0.0</Text>
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

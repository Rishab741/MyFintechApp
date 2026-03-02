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
  View,
} from 'react-native';
// Corrected relative path and filename casing
import ConnectInvestment from '../../components/ConnectInvestments';

const { width } = Dimensions.get('window');

// ─── Colour tokens ──────────────────────────────────────────────────────────
const GOLD = '#C9A84C';
const GOLD_LIGHT = '#E5C97A';
const GOLD_DIM = 'rgba(201,168,76,0.15)';
const BG = '#0A0D14';
const CARD = '#12161F';
const BORDER = 'rgba(255,255,255,0.07)';
const TEXT_PRIMARY = '#F0EDE6';
const TEXT_MUTED = '#5A6070';
const TEXT_SUB = '#8A94A6';
const RED = '#E74C3C';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getInitials = (name: string) => {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatInvestorType = (type: string) => {
  const map: Record<string, string> = {
    retail: 'Retail Investor',
    accredited: 'Accredited Investor',
    institutional: 'Institutional',
  };
  return map[type] ?? type;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const AvatarRing: React.FC<{ initials: string; size?: number }> = ({ initials, size = 84 }) => {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 8000, useNativeDriver: true })
    ).start();
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ width: size + 12, height: size + 12, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size + 12,
          height: size + 12,
          borderRadius: (size + 12) / 2,
          borderWidth: 1.5,
          borderColor: GOLD,
          borderStyle: 'dashed',
          opacity: 0.4,
          transform: [{ rotate }],
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: GOLD_DIM,
          borderWidth: 2,
          borderColor: 'rgba(201,168,76,0.4)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: GOLD_LIGHT,
            fontSize: size * 0.33,
            fontWeight: '700',
            fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
            letterSpacing: 1,
          }}
        >
          {initials}
        </Text>
      </View>
    </View>
  );
};

const StatCard: React.FC<{ icon: string; label: string; value: string; delay?: number }> = ({
  icon,
  label,
  value,
  delay = 0,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, delay, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 8, useNativeDriver: true, delay } as any),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[statStyles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
    >
      <Text style={statStyles.icon}>{icon}</Text>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </Animated.View>
  );
};

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  icon: { fontSize: 20, marginBottom: 4 },
  value: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  label: { color: TEXT_MUTED, fontSize: 11, letterSpacing: 0.5 },
});

const SettingsRow: React.FC<{
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  delay?: number;
}> = ({ icon, label, value, onPress, danger, delay = 0 }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay, useNativeDriver: true }).start();
  }, []);

  const handlePressIn = () => Animated.spring(pressAnim, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () => Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: pressAnim }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
        style={rowStyles.row}
      >
        <View style={[rowStyles.iconWrap, danger && rowStyles.iconWrapDanger]}>
          <Text style={{ fontSize: 16 }}>{icon}</Text>
        </View>
        <Text style={[rowStyles.label, danger && rowStyles.labelDanger]}>{label}</Text>
        <View style={{ flex: 1 }} />
        {value && <Text style={rowStyles.value}>{value}</Text>}
        {!danger && <Text style={rowStyles.chevron}>›</Text>}
      </TouchableOpacity>
    </Animated.View>
  );
};

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDanger: { backgroundColor: 'rgba(231,76,60,0.1)' },
  label: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '500' },
  labelDanger: { color: RED },
  value: { color: TEXT_MUTED, fontSize: 13 },
  chevron: { color: TEXT_MUTED, fontSize: 20, marginRight: -4 },
});

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <Text style={{
    color: TEXT_MUTED,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 8,
    paddingHorizontal: 4,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  }}>
    {title}
  </Text>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TabOneScreen() {
  const { setLoading, isLoading } = useAuthStore();
  const [user, setUser] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>({});

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
        setMetadata(data.user.user_metadata ?? {});
      }
    });

    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(headerSlide, { toValue: 0, tension: 70, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase.auth.signOut();
              if (error) throw error;
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const fullName =
    metadata.first_name && metadata.last_name
      ? `${metadata.first_name} ${metadata.last_name}`
      : user?.email?.split('@')[0] ?? 'Investor';

  const email = user?.email ?? '—';
  const phone = metadata.phone || '—';
  const investorType = metadata.investor_type ? formatInvestorType(metadata.investor_type) : '—';
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
    : '—';
  const verified = user?.email_confirmed_at ? 'Verified' : 'Pending';
  const initials = getInitials(fullName);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Ambient background accents */}
      <View style={styles.bgAccent1} />
      <View style={styles.bgAccent2} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <Animated.View
          style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}
        >
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>My Profile</Text>
              <Text style={styles.greetingSub}>VESTARA PRIVATE MARKETS</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: verified === 'Verified' ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.12)' }]}>
              <View style={[styles.badgeDot, { backgroundColor: verified === 'Verified' ? '#2ECC71' : RED }]} />
              <Text style={[styles.badgeText, { color: verified === 'Verified' ? '#2ECC71' : RED }]}>
                {verified}
              </Text>
            </View>
          </View>

          {/* Avatar + name */}
          <View style={styles.avatarSection}>
            <AvatarRing initials={initials} size={84} />
            <View style={{ marginLeft: 20, flex: 1 }}>
              <Text style={styles.fullName}>{fullName}</Text>
              <Text style={styles.emailText}>{email}</Text>
              {/* FIXED: Replaced div with View */}
              <View style={styles.typePill}>
                <Text style={styles.typePillText}>{investorType}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          <StatCard icon="📅" label="Member Since" value={memberSince} delay={100} />
          <View style={{ width: 10 }} />
          <StatCard icon="🔐" label="2FA Status" value="Off" delay={180} />
          <View style={{ width: 10 }} />
          <StatCard icon="🌐" label="Sessions" value="1 Active" delay={260} />
        </View>

        {/* ── Wealth Aggregation (Plaid Integration) ── */}
        <SectionHeader title="Wealth Aggregation" />
        <View style={styles.section}>
          <View style={styles.plaidContainer}>
            <View style={styles.plaidInfo}>
              <Text style={styles.plaidTitle}>Connect External Brokerage</Text>
              <Text style={styles.plaidSub}>
                Sync your holdings for unified AI-driven growth analysis.
              </Text>
            </View>
            <ConnectInvestment />
          </View>
        </View>

        {/* ── Account Details ── */}
        <SectionHeader title="Account Details" />
        <View style={styles.section}>
          <SettingsRow icon="✉️" label="Email" value={email} delay={200} />
          <SettingsRow icon="📱" label="Phone" value={phone} delay={240} />
          <SettingsRow icon="🏷️" label="Investor Type" value={investorType} delay={280} />
        </View>

        {/* ── Security ── */}
        <SectionHeader title="Security" />
        <View style={styles.section}>
          <SettingsRow icon="🔑" label="Change Password" onPress={() => Alert.alert('Coming Soon', 'Password management is coming in the next update.')} delay={320} />
          <SettingsRow icon="🛡️" label="Two-Factor Authentication" value="Off" onPress={() => Alert.alert('Coming Soon', '2FA setup is coming soon.')} delay={360} />
          <SettingsRow icon="📋" label="Active Sessions" onPress={() => Alert.alert('Coming Soon', 'Session management coming soon.')} delay={400} />
        </View>

        {/* ── Preferences ── */}
        <SectionHeader title="Preferences" />
        <View style={styles.section}>
          <SettingsRow icon="🔔" label="Notifications" onPress={() => {}} delay={440} />
          <SettingsRow icon="🌙" label="Appearance" value="Dark" onPress={() => {}} delay={480} />
          <SettingsRow icon="💱" label="Base Currency" value="AUD" onPress={() => {}} delay={520} />
        </View>

        {/* ── Danger zone ── */}
        <SectionHeader title="Account" />
        <View style={styles.section}>
          <SettingsRow
            icon="🚪"
            label="Sign Out"
            onPress={handleSignOut}
            danger
            delay={560}
          />
        </View>

        {/* Bottom wordmark */}
        <View style={styles.wordmark}>
          <Text style={styles.wordmarkText}>◈ VESTARA</Text>
          <Text style={styles.wordmarkSub}>v1.0.0 · Encrypted Connection</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  bgAccent1: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(201,168,76,0.05)',
    top: -60,
    right: -60,
  },
  bgAccent2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(80,100,255,0.03)',
    bottom: 100,
    left: -40,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 48,
  },

  // Header
  header: {
    marginBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 0.3,
  },
  greetingSub: {
    fontSize: 10,
    color: GOLD,
    letterSpacing: 3,
    marginTop: 3,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Avatar section
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  fullName: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 4,
  },
  emailText: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 10,
  },
  typePill: {
    alignSelf: 'flex-start',
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typePillText: {
    color: GOLD_LIGHT,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },

  // Plaid Container
  plaidContainer: {
    padding: 20,
    backgroundColor: CARD,
    alignItems: 'center',
  },
  plaidInfo: {
    marginBottom: 10,
    alignItems: 'center',
  },
  plaidTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 6,
  },
  plaidSub: {
    color: TEXT_SUB,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },

  // Sections
  section: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },

  // Wordmark
  wordmark: {
    alignItems: 'center',
    marginTop: 36,
    gap: 4,
  },
  wordmarkText: {
    color: 'rgba(201,168,76,0.25)',
    fontSize: 14,
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  wordmarkSub: {
    color: 'rgba(90,96,112,0.6)',
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
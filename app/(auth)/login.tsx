import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/store/useAuthStore';
import { QL } from '../../constants/Colors';
import { haptics } from '../../src/lib/haptics';

// ─── Rate limiting ─────────────────────────────────────────────────────────────
const RATE_KEY = 'platstock_auth_rate';

interface RateData {
  count:       number;
  lockedUntil: number;
}

function getLockDurationMs(count: number): number {
  if (count >= 10) return 30 * 60 * 1_000;
  if (count >= 5)  return  5 * 60 * 1_000;
  if (count >= 3)  return      30 * 1_000;
  return 0;
}

async function readRateData(): Promise<RateData> {
  try {
    const raw = await SecureStore.getItemAsync(RATE_KEY);
    if (raw) return JSON.parse(raw) as RateData;
  } catch {}
  return { count: 0, lockedUntil: 0 };
}

async function recordFailedAttempt(): Promise<RateData> {
  const prev = await readRateData();
  const count = prev.count + 1;
  const lockMs = getLockDurationMs(count);
  const updated: RateData = {
    count,
    lockedUntil: lockMs > 0 ? Date.now() + lockMs : 0,
  };
  await SecureStore.setItemAsync(RATE_KEY, JSON.stringify(updated));
  return updated;
}

async function clearRateData(): Promise<void> {
  await SecureStore.deleteItemAsync(RATE_KEY);
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid email or password'))
    return 'Incorrect email or password. Please try again.';
  if (m.includes('email not confirmed'))
    return 'Please verify your email before signing in. Check your inbox.';
  if (m.includes('too many requests'))
    return 'Too many attempts. Please wait a few minutes and try again.';
  if (m.includes('network'))
    return 'No internet connection. Please check your network and try again.';
  return message;
}

const { height } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────
type AuthMode = 'signin' | 'signup';
type SignUpStep = 1 | 2 | 3;

interface SignUpData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  investorType: 'retail' | 'accredited' | 'institutional' | '';
  agreedToTerms: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const FloatingLabel: React.FC<{
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  editable?: boolean;
  onToggleSecure?: () => void;
  isSecureVisible?: boolean;
}> = ({
  label,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType = 'default',
  autoCapitalize = 'none',
  editable = true,
  onToggleSecure,
  isSecureVisible,
}) => {
  const floatAnim = useRef(new Animated.Value(value ? 1 : 0)).current;
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    Animated.timing(floatAnim, {
      toValue: focused || value ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [focused, value]);

  const labelTop = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 6] });
  const labelSize = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 11] });
  const labelColor = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [QL.MUTED, focused ? QL.GOLD : QL.TXT2],
  });

  return (
    <View style={[inputStyles.wrapper, focused && inputStyles.wrapperFocused]}>
      <Animated.Text style={[inputStyles.floatLabel, { top: labelTop, fontSize: labelSize, color: labelColor }]}>
        {label}
      </Animated.Text>
      <TextInput
        style={inputStyles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry && !isSecureVisible}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor="transparent"
      />
      {onToggleSecure && (
        <TouchableOpacity onPress={onToggleSecure} style={inputStyles.eyeBtn}>
          <MaterialCommunityIcons name={isSecureVisible ? 'eye-off' : 'eye'} size={18} color={QL.TXT2} />
        </TouchableOpacity>
      )}
      <View style={[inputStyles.underline, focused && inputStyles.underlineFocused]} />
    </View>
  );
};

const inputStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: QL.GOLD_D,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 0,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: QL.BORDER,
    position: 'relative',
    minHeight: 62,
    justifyContent: 'flex-end',
  },
  wrapperFocused: {
    backgroundColor: QL.GOLD_D,
    borderColor: QL.BORDER_HI,
  },
  floatLabel: {
    position: 'absolute',
    left: 16,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    letterSpacing: 0.3,
  },
  input: {
    color: QL.TXT,
    fontSize: 16,
    paddingBottom: 10,
    paddingTop: 18,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  },
  eyeBtn: { position: 'absolute', right: 14, bottom: 14 },
  underline: { height: 1, backgroundColor: 'transparent', marginHorizontal: -16 },
  underlineFocused: { backgroundColor: QL.GOLD_B },
});

const InvestorChip: React.FC<{
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}> = ({ label, description, selected, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[chipStyles.chip, selected && chipStyles.chipSelected]}>
    <View style={[chipStyles.dot, selected && chipStyles.dotSelected]} />
    <View style={{ flex: 1 }}>
      <Text style={[chipStyles.label, selected && chipStyles.labelSelected]}>{label}</Text>
      <Text style={chipStyles.desc}>{description}</Text>
    </View>
  </TouchableOpacity>
);

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: QL.GOLD_D,
    borderWidth: 1,
    borderColor: QL.BORDER,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  chipSelected: {
    backgroundColor: QL.GOLD_B,
    borderColor: QL.BORDER_HI,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: QL.MUTED,
  },
  dotSelected: {
    borderColor: QL.GOLD,
    backgroundColor: QL.GOLD,
  },
  label: { color: QL.TXT2, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  labelSelected: { color: QL.TXT },
  desc: { color: QL.MUTED, fontSize: 12 },
});

const StepIndicator: React.FC<{ current: SignUpStep; total: number }> = ({ current, total }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 28 }}>
    {Array.from({ length: total }, (_, i) => i + 1).map((step, idx) => (
      <React.Fragment key={step}>
        <View style={[
          stepStyles.dot,
          step < current && stepStyles.dotDone,
          step === current && stepStyles.dotActive,
        ]}>
          {step < current && <MaterialCommunityIcons name="check" size={14} color={QL.BG} />}
        </View>
        {idx < total - 1 && (
          <View style={[stepStyles.line, step < current && stepStyles.lineDone]} />
        )}
      </React.Fragment>
    ))}
    <Text style={stepStyles.label}>  Step {current} of {total}</Text>
  </View>
);

const stepStyles = StyleSheet.create({
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: QL.BORDER,
    backgroundColor: QL.BG2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { borderColor: QL.GOLD, backgroundColor: QL.GOLD_B },
  dotDone: { borderColor: QL.GOLD, backgroundColor: QL.GOLD },
  line: { flex: 1, height: 2, backgroundColor: QL.BORDER, marginHorizontal: 6 },
  lineDone: { backgroundColor: QL.GOLD },
  label: { color: QL.MUTED, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif' },
});

const PasswordStrength: React.FC<{ password: string }> = ({ password }) => {
  const checks = [
    { label: '8+ characters', pass: password.length >= 8 },
    { label: 'Uppercase', pass: /[A-Z]/.test(password) },
    { label: 'Number', pass: /\d/.test(password) },
    { label: 'Symbol', pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const strength = checks.filter(c => c.pass).length;
  const colors = [QL.RED, QL.ORANGE, QL.AMBER, QL.GREEN];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
        {[0, 1, 2, 3].map(i => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              backgroundColor: i < strength ? colors[strength - 1] : QL.BORDER,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: strength > 0 ? colors[strength - 1] : QL.MUTED, fontSize: 11 }}>
          {strength > 0 ? labels[strength - 1] : 'Enter password'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {checks.map(c => (
            <Text key={c.label} style={{ color: c.pass ? QL.GOLD : QL.BORDER, fontSize: 10 }}>
              {c.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [step, setStep] = useState<SignUpStep>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Sign-in state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [forgotPassword, setForgotPassword] = useState(false);

  // Sign-up state
  const [signUp, setSignUp] = useState<SignUpData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    investorType: '',
    agreedToTerms: false,
  });

  const { isLoading, setLoading } = useAuthStore();

  // ── Rate-limit state ─────────────────────────────────────────────────────
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    readRateData().then(({ lockedUntil }) => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1_000);
      if (remaining > 0) startLockoutTimer(remaining);
    });
    return () => { if (lockTimerRef.current) clearInterval(lockTimerRef.current); };
  }, []);

  const startLockoutTimer = (seconds: number) => {
    setLockSecondsLeft(seconds);
    if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    lockTimerRef.current = setInterval(() => {
      setLockSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(lockTimerRef.current!);
          lockTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);
  };

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 8, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }),
    ]).start();
  }, []);

  const animateTransition = (cb: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      cb();
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 8, useNativeDriver: true }),
      ]).start();
    });
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  const validateStep = (): string | null => {
    if (step === 1) {
      if (!signUp.firstName.trim()) return 'First name is required';
      if (!signUp.lastName.trim()) return 'Last name is required';
      if (!signUp.email.includes('@')) return 'Valid email is required';
      if (signUp.phone && !/^\+?[\d\s\-()]{7,}$/.test(signUp.phone)) return 'Invalid phone number';
    } else if (step === 2) {
      if (signUp.password.length < 8) return 'Password must be at least 8 characters';
      if (signUp.password !== signUp.confirmPassword) return 'Passwords do not match';
    } else if (step === 3) {
      if (!signUp.investorType) return 'Please select your investor type';
      if (!signUp.agreedToTerms) return 'You must agree to the Terms of Service';
    }
    return null;
  };

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleNextStep = () => {
    const err = validateStep();
    if (err) { haptics.warning(); return Alert.alert('Required', err); }
    haptics.tap();
    if (step < 3) animateTransition(() => setStep((s) => (s + 1) as SignUpStep));
    else handleSignUp();
  };

  const handleBackStep = () => {
    if (step > 1) animateTransition(() => setStep((s) => (s - 1) as SignUpStep));
    else animateTransition(() => setMode('signin'));
  };

  const handleSignIn = async () => {
    if (isLoading || lockSecondsLeft > 0) return;
    if (!signInEmail || !signInPassword) { haptics.warning(); return Alert.alert('Required', 'Please fill in all fields'); }
    haptics.tap();

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: signInEmail.trim().toLowerCase(),
        password: signInPassword,
      });
      if (error) {
        haptics.warning();
        const rate = await recordFailedAttempt();
        const lockSecs = Math.ceil((rate.lockedUntil - Date.now()) / 1_000);
        if (lockSecs > 0) startLockoutTimer(lockSecs);
        Alert.alert('Sign In Failed', friendlyAuthError(error.message));
      } else {
        await clearRateData();
      }
    } catch (e: any) {
      haptics.warning();
      Alert.alert('Sign In Failed', friendlyAuthError(e.message ?? 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!signInEmail) return Alert.alert('Required', 'Enter your email address above first');
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(signInEmail);
      if (error) throw error;
      Alert.alert('Email Sent', 'Check your inbox for password reset instructions.');
      setForgotPassword(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (isLoading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: signUp.email,
        password: signUp.password,
        options: {
          data: {
            first_name: signUp.firstName,
            last_name: signUp.lastName,
            phone: signUp.phone,
            investor_type: signUp.investorType,
          },
        },
      });
      if (error) throw error;
      haptics.success();
      Alert.alert(
        'Account Created',
        `Welcome, ${signUp.firstName}! Please check your email to verify your account before signing in.`,
        [{ text: 'Sign In', onPress: () => animateTransition(() => { setMode('signin'); setStep(1); }) }]
      );
    } catch (e: any) {
      haptics.warning();
      Alert.alert('Registration Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const renderSignIn = () => (
    <>
      <Text style={styles.heading}>Welcome Back</Text>
      <Text style={styles.subheading}>Sign in to your portfolio</Text>

      <FloatingLabel
        label="Email Address"
        value={signInEmail}
        onChangeText={setSignInEmail}
        keyboardType="email-address"
        editable={!isLoading}
      />
      <FloatingLabel
        label="Password"
        value={signInPassword}
        onChangeText={setSignInPassword}
        secureTextEntry
        editable={!isLoading}
        onToggleSecure={() => setShowPassword(v => !v)}
        isSecureVisible={showPassword}
      />

      <TouchableOpacity onPress={() => setForgotPassword(true)} style={{ alignSelf: 'flex-end', marginBottom: 24, marginTop: -4 }}>
        <Text style={styles.link}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.primaryBtn, (isLoading || lockSecondsLeft > 0) && styles.primaryBtnDisabled]}
        onPress={handleSignIn}
        disabled={isLoading || lockSecondsLeft > 0}
      >
        {isLoading
          ? <ActivityIndicator color={QL.BG} />
          : lockSecondsLeft > 0
            ? <Text style={styles.primaryBtnText}>Try again in {lockSecondsLeft}s</Text>
            : <Text style={styles.primaryBtnText}>Sign In</Text>}
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => animateTransition(() => { setMode('signup'); setStep(1); })}
        disabled={isLoading}
      >
        <Text style={styles.secondaryBtnText}>Create New Account</Text>
      </TouchableOpacity>
    </>
  );

  const renderSignUpStep1 = () => (
    <>
      <Text style={styles.heading}>Create Account</Text>
      <Text style={styles.subheading}>Personal information</Text>
      <StepIndicator current={step} total={3} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <FloatingLabel label="First Name" value={signUp.firstName} onChangeText={v => setSignUp(s => ({ ...s, firstName: v }))} autoCapitalize="words" editable={!isLoading} />
        </View>
        <View style={{ flex: 1 }}>
          <FloatingLabel label="Last Name" value={signUp.lastName} onChangeText={v => setSignUp(s => ({ ...s, lastName: v }))} autoCapitalize="words" editable={!isLoading} />
        </View>
      </View>
      <FloatingLabel label="Email Address" value={signUp.email} onChangeText={v => setSignUp(s => ({ ...s, email: v }))} keyboardType="email-address" editable={!isLoading} />
      <FloatingLabel label="Phone Number (optional)" value={signUp.phone} onChangeText={v => setSignUp(s => ({ ...s, phone: v }))} keyboardType="phone-pad" editable={!isLoading} />
    </>
  );

  const renderSignUpStep2 = () => (
    <>
      <Text style={styles.heading}>Secure Access</Text>
      <Text style={styles.subheading}>Create a strong password</Text>
      <StepIndicator current={step} total={3} />
      <FloatingLabel
        label="Password"
        value={signUp.password}
        onChangeText={v => setSignUp(s => ({ ...s, password: v }))}
        secureTextEntry
        editable={!isLoading}
        onToggleSecure={() => setShowPassword(v => !v)}
        isSecureVisible={showPassword}
      />
      <PasswordStrength password={signUp.password} />
      <FloatingLabel
        label="Confirm Password"
        value={signUp.confirmPassword}
        onChangeText={v => setSignUp(s => ({ ...s, confirmPassword: v }))}
        secureTextEntry
        editable={!isLoading}
        onToggleSecure={() => setShowConfirm(v => !v)}
        isSecureVisible={showConfirm}
      />
      {signUp.confirmPassword.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -8, marginBottom: 12 }}>
          <MaterialCommunityIcons
            name={signUp.password === signUp.confirmPassword ? 'check-circle' : 'close-circle'}
            size={13}
            color={signUp.password === signUp.confirmPassword ? QL.GREEN : QL.RED}
          />
          <Text style={{ fontSize: 12, color: signUp.password === signUp.confirmPassword ? QL.GREEN : QL.RED }}>
            {signUp.password === signUp.confirmPassword ? 'Passwords match' : 'Passwords do not match'}
          </Text>
        </View>
      )}
    </>
  );

  const renderSignUpStep3 = () => (
    <>
      <Text style={styles.heading}>Investor Profile</Text>
      <Text style={styles.subheading}>Help us personalise your experience</Text>
      <StepIndicator current={step} total={3} />

      <Text style={styles.sectionLabel}>I am a</Text>
      <InvestorChip
        label="Retail Investor"
        description="Individual investing personal funds"
        selected={signUp.investorType === 'retail'}
        onPress={() => setSignUp(s => ({ ...s, investorType: 'retail' }))}
      />
      <InvestorChip
        label="Accredited Investor"
        description="High net-worth individual or qualified purchaser"
        selected={signUp.investorType === 'accredited'}
        onPress={() => setSignUp(s => ({ ...s, investorType: 'accredited' }))}
      />
      <InvestorChip
        label="Institutional"
        description="Fund, endowment, or corporate entity"
        selected={signUp.investorType === 'institutional'}
        onPress={() => setSignUp(s => ({ ...s, investorType: 'institutional' }))}
      />

      <TouchableOpacity
        onPress={() => setSignUp(s => ({ ...s, agreedToTerms: !s.agreedToTerms }))}
        style={styles.termsRow}
      >
        <View style={[styles.checkbox, signUp.agreedToTerms && styles.checkboxChecked]}>
          {signUp.agreedToTerms && <MaterialCommunityIcons name="check" size={14} color={QL.BG} />}
        </View>
        <Text style={styles.termsText}>
          I agree to the{' '}
          <Text style={styles.link}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.link}>Privacy Policy</Text>
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderContent = () => {
    if (mode === 'signin') return renderSignIn();
    if (step === 1) return renderSignUpStep1();
    if (step === 2) return renderSignUpStep2();
    return renderSignUpStep3();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.root}
    >
      <StatusBar barStyle="light-content" />

      {/* Ambient glow — Coinwave-inspired particle light */}
      <View style={styles.bgGlowTop} />
      <View style={styles.bgGlowBottom} />
      <View style={styles.bgGlowMid} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <Animated.View style={[styles.logoWrap, { transform: [{ scale: logoScale }] }]}>
          <View style={styles.logoMark}>
            <MaterialCommunityIcons name="trending-up" size={28} color={QL.GOLD} />
          </View>
          <Text style={styles.logoName}>PLATSTOCK</Text>
          <Text style={styles.logoTagline}>DIGITAL MARKETS</Text>
        </Animated.View>

        {/* Card */}
        <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {renderContent()}

          {/* Navigation */}
          {mode === 'signup' && (
            <View style={styles.navRow}>
              <TouchableOpacity onPress={handleBackStep} style={styles.backBtn} disabled={isLoading}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }, isLoading && styles.primaryBtnDisabled]}
                onPress={handleNextStep}
                disabled={isLoading}
              >
                {isLoading
                  ? <ActivityIndicator color={QL.BG} />
                  : <Text style={styles.primaryBtnText}>{step === 3 ? 'Create Account' : 'Continue'}</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* Security badge */}
          <View style={styles.securityBadge}>
            <MaterialCommunityIcons name="shield-check-outline" size={12} color={QL.MUTED} />
            <Text style={styles.securityText}>256-bit SSL encrypted</Text>
          </View>
        </Animated.View>

        {/* Forgot password modal inline */}
        {forgotPassword && mode === 'signin' && (
          <View style={styles.forgotCard}>
            <Text style={styles.forgotTitle}>Reset Password</Text>
            <Text style={styles.forgotBody}>
              Enter the email address linked to your account and we&apos;ll send reset instructions.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setForgotPassword(false)}>
                <Text style={styles.backBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleForgotPassword} disabled={isLoading}>
                {isLoading
                  ? <ActivityIndicator color={QL.BG} />
                  : <Text style={styles.primaryBtnText}>Send Link</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
// Colors are drawn from QL (Quantum Ledger) — see constants/Colors.ts — so this
// screen matches the ink/gold palette used everywhere else in the app.

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: QL.BG,
  },

  // ── Ambient glow effects ──
  bgGlowTop: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: QL.GOLD_D,
    top: -140,
    right: -130,
  },
  bgGlowBottom: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: QL.GREEN_D,
    bottom: 30,
    left: -90,
  },
  bgGlowMid: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: QL.GOLD_D,
    top: height * 0.38,
    right: -60,
  },

  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    paddingVertical: 50,
  },

  // ── Logo ──
  logoWrap: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: QL.GOLD_B,
    borderWidth: 1.5,
    borderColor: QL.BORDER_HI,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: QL.GOLD,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  logoName: {
    fontSize: 22,
    fontWeight: '800',
    color: QL.TXT,
    letterSpacing: 6,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-medium',
  },
  logoTagline: {
    fontSize: 10,
    color: QL.GOLD,
    letterSpacing: 4,
    marginTop: 5,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    opacity: 0.8,
  },

  // ── Card ──
  card: {
    backgroundColor: QL.CARD,
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: QL.BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: QL.TXT,
    marginBottom: 6,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-medium',
    letterSpacing: 0.2,
  },
  subheading: {
    fontSize: 14,
    color: QL.MUTED,
    marginBottom: 28,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  },
  sectionLabel: {
    fontSize: 11,
    color: QL.TXT2,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // ── Buttons ──
  primaryBtn: {
    backgroundColor: QL.GOLD,
    paddingVertical: 17,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: QL.GOLD,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryBtnDisabled: {
    backgroundColor: QL.GOLD_B,
    shadowOpacity: 0,
  },
  primaryBtnText: {
    color: QL.BG,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.4,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-medium',
  },
  secondaryBtn: {
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: QL.BORDER_HI,
  },
  secondaryBtnText: {
    color: QL.GOLD_L,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  backBtn: {
    paddingVertical: 17,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: QL.BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: QL.TXT2,
    fontWeight: '600',
    fontSize: 15,
  },
  navRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },

  // ── Misc ──
  link: {
    color: QL.GOLD_L,
    fontWeight: '600',
    fontSize: 13,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  dividerText: {
    color: QL.BORDER,
    fontSize: 12,
    letterSpacing: 2,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: QL.BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: QL.GOLD,
    borderColor: QL.GOLD,
  },
  termsText: {
    color: QL.TXT2,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    gap: 6,
  },
  securityText: {
    color: QL.MUTED,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  forgotCard: {
    backgroundColor: QL.CARD,
    borderRadius: 20,
    padding: 24,
    marginTop: 16,
    borderWidth: 1,
    borderColor: QL.BORDER_HI,
  },
  forgotTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: QL.TXT,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-medium',
  },
  forgotBody: {
    color: QL.TXT2,
    fontSize: 13,
    lineHeight: 20,
  },
});

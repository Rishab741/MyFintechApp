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
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/store/useAuthStore';

const { width, height } = Dimensions.get('window');

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
    outputRange: ['#5A6070', focused ? '#C9A84C' : '#8A94A6'],
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
          <Text style={inputStyles.eyeIcon}>{isSecureVisible ? '●' : '○'}</Text>
        </TouchableOpacity>
      )}
      <View style={[inputStyles.underline, focused && inputStyles.underlineFocused]} />
    </View>
  );
};

const inputStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 0,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    minHeight: 62,
    justifyContent: 'flex-end',
  },
  wrapperFocused: {
    backgroundColor: 'rgba(201,168,76,0.05)',
    borderColor: 'rgba(201,168,76,0.35)',
  },
  floatLabel: {
    position: 'absolute',
    left: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 0.3,
  },
  input: {
    color: '#F0EDE6',
    fontSize: 16,
    paddingBottom: 10,
    paddingTop: 18,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  },
  eyeBtn: { position: 'absolute', right: 14, bottom: 14 },
  eyeIcon: { color: '#8A94A6', fontSize: 14 },
  underline: { height: 1, backgroundColor: 'transparent', marginHorizontal: -16 },
  underlineFocused: { backgroundColor: 'rgba(201,168,76,0.4)' },
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
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  chipSelected: {
    backgroundColor: 'rgba(201,168,76,0.1)',
    borderColor: 'rgba(201,168,76,0.5)',
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#5A6070',
  },
  dotSelected: {
    borderColor: '#C9A84C',
    backgroundColor: '#C9A84C',
  },
  label: { color: '#A0A8B4', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  labelSelected: { color: '#F0EDE6' },
  desc: { color: '#5A6070', fontSize: 12 },
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
          {step < current && <Text style={stepStyles.check}>✓</Text>}
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
    borderColor: '#2A2F3A',
    backgroundColor: '#0E1118',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { borderColor: '#C9A84C', backgroundColor: 'rgba(201,168,76,0.15)' },
  dotDone: { borderColor: '#C9A84C', backgroundColor: '#C9A84C' },
  check: { color: '#0E1118', fontSize: 12, fontWeight: '900' },
  line: { flex: 1, height: 2, backgroundColor: '#2A2F3A', marginHorizontal: 6 },
  lineDone: { backgroundColor: '#C9A84C' },
  label: { color: '#5A6070', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif' },
});

const PasswordStrength: React.FC<{ password: string }> = ({ password }) => {
  const checks = [
    { label: '8+ characters', pass: password.length >= 8 },
    { label: 'Uppercase', pass: /[A-Z]/.test(password) },
    { label: 'Number', pass: /\d/.test(password) },
    { label: 'Symbol', pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const strength = checks.filter(c => c.pass).length;
  const colors = ['#E74C3C', '#E67E22', '#F1C40F', '#2ECC71'];
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
              backgroundColor: i < strength ? colors[strength - 1] : '#2A2F3A',
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: strength > 0 ? colors[strength - 1] : '#5A6070', fontSize: 11 }}>
          {strength > 0 ? labels[strength - 1] : 'Enter password'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {checks.map(c => (
            <Text key={c.label} style={{ color: c.pass ? '#C9A84C' : '#3A3F4A', fontSize: 10 }}>
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
    if (err) return Alert.alert('Required', err);
    if (step < 3) animateTransition(() => setStep((s) => (s + 1) as SignUpStep));
    else handleSignUp();
  };

  const handleBackStep = () => {
    if (step > 1) animateTransition(() => setStep((s) => (s - 1) as SignUpStep));
    else animateTransition(() => setMode('signin'));
  };

  const handleSignIn = async () => {
    if (isLoading) return;
    if (!signInEmail || !signInPassword) return Alert.alert('Required', 'Please fill in all fields');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: signInEmail,
        password: signInPassword,
      });
      if (error) throw error;
    } catch (e: any) {
      Alert.alert('Sign In Failed', e.message);
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
      Alert.alert(
        'Account Created',
        `Welcome, ${signUp.firstName}! Please check your email to verify your account before signing in.`,
        [{ text: 'Sign In', onPress: () => animateTransition(() => { setMode('signin'); setStep(1); }) }]
      );
    } catch (e: any) {
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
        style={[styles.primaryBtn, isLoading && styles.primaryBtnDisabled]}
        onPress={handleSignIn}
        disabled={isLoading}
      >
        {isLoading
          ? <ActivityIndicator color="#0E1118" />
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
        <Text style={{ fontSize: 12, color: signUp.password === signUp.confirmPassword ? '#2ECC71' : '#E74C3C', marginTop: -8, marginBottom: 12 }}>
          {signUp.password === signUp.confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
        </Text>
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
          {signUp.agreedToTerms && <Text style={{ color: '#0E1118', fontSize: 12, fontWeight: '900' }}>✓</Text>}
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

      {/* Background geometric accents */}
      <View style={styles.bgAccent1} />
      <View style={styles.bgAccent2} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <Animated.View style={[styles.logoWrap, { transform: [{ scale: logoScale }] }]}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>◈</Text>
          </View>
          <Text style={styles.logoName}>VESTARA</Text>
          <Text style={styles.logoTagline}>PRIVATE MARKETS</Text>
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
                  ? <ActivityIndicator color="#0E1118" />
                  : <Text style={styles.primaryBtnText}>{step === 3 ? 'Create Account' : 'Continue'}</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* Security badge */}
          <View style={styles.securityBadge}>
            <Text style={styles.securityIcon}>🔒</Text>
            <Text style={styles.securityText}>256-bit SSL encrypted · SOC 2 Type II</Text>
          </View>
        </Animated.View>

        {/* Forgot password modal inline */}
        {forgotPassword && mode === 'signin' && (
          <View style={styles.forgotCard}>
            <Text style={styles.forgotTitle}>Reset Password</Text>
            <Text style={styles.forgotBody}>
              Enter the email address linked to your account and we'll send reset instructions.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setForgotPassword(false)}>
                <Text style={styles.backBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleForgotPassword} disabled={isLoading}>
                {isLoading
                  ? <ActivityIndicator color="#0E1118" />
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
const GOLD = '#C9A84C';
const GOLD_LIGHT = '#E5C97A';
const BG = '#0A0D14';
const SURFACE = '#0E1118';
const CARD = '#12161F';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  bgAccent1: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(201,168,76,0.06)',
    top: -80,
    right: -80,
  },
  bgAccent2: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(100,120,255,0.04)',
    bottom: 60,
    left: -60,
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
    marginBottom: 32,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(201,168,76,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoMarkText: {
    fontSize: 26,
    color: GOLD,
  },
  logoName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F0EDE6',
    letterSpacing: 6,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  logoTagline: {
    fontSize: 10,
    color: GOLD,
    letterSpacing: 4,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  },

  // ── Card ──
  card: {
    backgroundColor: CARD,
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 20,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F0EDE6',
    marginBottom: 6,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 0.3,
  },
  subheading: {
    fontSize: 14,
    color: '#5A6070',
    marginBottom: 28,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  },
  sectionLabel: {
    fontSize: 12,
    color: '#8A94A6',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // ── Buttons ──
  primaryBtn: {
    backgroundColor: GOLD,
    paddingVertical: 17,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GOLD,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryBtnDisabled: {
    backgroundColor: 'rgba(201,168,76,0.4)',
    shadowOpacity: 0,
  },
  primaryBtnText: {
    color: '#0A0D14',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  },
  secondaryBtn: {
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(201,168,76,0.3)',
  },
  secondaryBtnText: {
    color: GOLD_LIGHT,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  backBtn: {
    paddingVertical: 17,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: '#8A94A6',
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
    color: GOLD_LIGHT,
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
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  dividerText: {
    color: '#3A3F4A',
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
    borderColor: '#3A3F4A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  termsText: {
    color: '#8A94A6',
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
  securityIcon: { fontSize: 11 },
  securityText: {
    color: '#3A3F4A',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  forgotCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 24,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.15)',
  },
  forgotTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F0EDE6',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  forgotBody: {
    color: '#8A94A6',
    fontSize: 13,
    lineHeight: 20,
  },
});
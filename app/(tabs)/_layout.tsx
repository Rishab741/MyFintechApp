import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG      = '#04070F';
const CYAN    = '#8FF5FF';
const TXT     = '#F8FAFC';
const MUTED   = '#64748B';
const SIDEBAR_COLLAPSED = 62;
const SIDEBAR_EXPANDED  = 210;
const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const sans = Platform.OS === 'ios' ? 'SF Pro Text' : 'sans-serif';

// ─── Nav items ────────────────────────────────────────────────────────────────
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
interface NavItem { name: string; label: string; icon: IconName; iconActive: IconName }

const NAV_ITEMS: NavItem[] = [
  { name: 'index',             label: 'Profile',  icon: 'account-outline',          iconActive: 'account'           },
  { name: 'Market',            label: 'Markets',  icon: 'chart-line',                iconActive: 'chart-line'        },
  { name: 'Portfolio',         label: 'Vault',    icon: 'chart-donut',               iconActive: 'chart-donut'       },
  { name: 'Holdings',          label: 'Assets',   icon: 'view-grid-outline',         iconActive: 'view-grid'         },
  { name: 'Insights',          label: 'AI',       icon: 'brain',                     iconActive: 'brain'             },
  { name: 'GlobalMarkets',     label: 'Macro',    icon: 'earth',                     iconActive: 'earth'             },
  { name: 'Reports',           label: 'Reports',  icon: 'download-circle-outline',   iconActive: 'download-circle'   },
  { name: 'InvestmentProfile', label: 'Setup',    icon: 'tune-variant',              iconActive: 'tune-variant'      },
];

// ─── Single nav row ───────────────────────────────────────────────────────────
function NavRow({
  item, active, expanded, onPress,
}: {
  item: NavItem; active: boolean; expanded: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        nr.row,
        active && nr.rowActive,
        pressed && nr.rowPressed,
      ]}
    >
      <View style={nr.iconWrap}>
        <MaterialCommunityIcons
          name={active ? item.iconActive : item.icon}
          size={21}
          color={active ? CYAN : MUTED}
        />
        {active && <View style={nr.dot} />}
      </View>
      {expanded && (
        <Text
          numberOfLines={1}
          style={[nr.label, active && nr.labelActive]}
        >
          {item.label}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Sidebar component ────────────────────────────────────────────────────────
function Sidebar({ state, navigation }: any) {
  const insets   = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const anim     = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const toValue = open ? 0 : 1;
    Animated.parallel([
      Animated.spring(anim, {
        toValue,
        friction: 7,
        tension: 60,
        useNativeDriver: false,
      }),
      Animated.timing(backdropAnim, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
    setOpen(!open);
  };

  const close = () => {
    Animated.parallel([
      Animated.spring(anim, { toValue: 0, friction: 7, tension: 60, useNativeDriver: false }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
    setOpen(false);
  };

  const sidebarWidth = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED],
  });

  return (
    <>
      {/* Backdrop — dismisses sidebar on tap outside */}
      {open && (
        <Animated.View
          style={[sb.backdrop, { opacity: backdropAnim }]}
          pointerEvents={open ? 'auto' : 'none'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>
      )}

      {/* Sidebar rail */}
      <Animated.View
        style={[
          sb.rail,
          {
            width: sidebarWidth,
            top: insets.top + 8,
            bottom: insets.bottom + 8,
          },
        ]}
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 40 : 100}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={sb.inner}>
          {/* Logo / toggle */}
          <Pressable style={sb.logoBtn} onPress={toggle}>
            <View style={sb.logoMark}>
              <Text style={sb.logoV}>V</Text>
            </View>
            {open && <Text style={sb.logoLabel}>VESTARA</Text>}
            <MaterialCommunityIcons
              name={open ? 'chevron-left' : 'chevron-right'}
              size={16}
              color={MUTED}
              style={open ? undefined : sb.chevronCollapsed}
            />
          </Pressable>

          <View style={sb.divider} />

          {/* Nav items */}
          <View style={sb.navList}>
            {state.routes.map((route: any, index: number) => {
              const item = NAV_ITEMS.find(n => n.name === route.name);
              if (!item) return null;
              const active = state.index === index;
              return (
                <NavRow
                  key={route.key}
                  item={item}
                  active={active}
                  expanded={open}
                  onPress={() => {
                    const event = navigation.emit({ type: 'tabPress', target: route.key });
                    if (!active && !event.defaultPrevented) navigation.navigate(route.name);
                    if (open) close();
                  }}
                />
              );
            })}
          </View>

          {/* Version tag at bottom */}
          {open && (
            <View style={sb.versionWrap}>
              <Text style={sb.versionTxt}>v1.0</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sb = StyleSheet.create({
  backdrop: {
    position: 'absolute', inset: 0, zIndex: 9,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  rail: {
    position: 'absolute',
    left: 10,
    zIndex: 10,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
      },
      android: { elevation: 16 },
    }),
  },
  inner: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 0,
    backgroundColor: 'rgba(8, 14, 28, 0.75)',
  },
  logoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    minHeight: 48,
  },
  logoMark: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(143,245,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(143,245,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  logoV:     { color: CYAN, fontSize: 15, fontWeight: '800', fontFamily: mono },
  logoLabel: { flex: 1, color: CYAN, fontSize: 11, fontWeight: '700', letterSpacing: 2, fontFamily: mono },
  chevronCollapsed: { position: 'absolute', right: 6, top: '50%' },

  divider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.07)',
    marginHorizontal: 14, marginVertical: 8,
  },
  navList: { flex: 1, gap: 2, paddingHorizontal: 8 },

  versionWrap: { paddingHorizontal: 16, paddingBottom: 4 },
  versionTxt:  { fontSize: 10, color: MUTED, fontFamily: mono },
});

const nr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 8,
    gap: 12,
    minHeight: 44,
  },
  rowActive:  { backgroundColor: 'rgba(143,245,255,0.08)' },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  iconWrap: {
    width: 30, alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  dot: {
    position: 'absolute', right: -2, top: -2,
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: CYAN,
  },
  label:       { flex: 1, fontSize: 13, fontWeight: '500', color: MUTED, fontFamily: sans },
  labelActive: { color: TXT, fontWeight: '700' },
});

// ─── Root layout ──────────────────────────────────────────────────────────────
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: useClientOnlyValue(false, true),
        headerStyle: { backgroundColor: BG, borderBottomWidth: 0, elevation: 0 },
        headerTintColor: TXT,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        tabBarStyle: { display: 'none' },
      }}
      tabBar={(props) => <Sidebar {...props} />}
    >
      <Tabs.Screen name="index"             options={{ title: 'VESTARA' }} />
      <Tabs.Screen name="Market"            options={{ headerShown: false }} />
      <Tabs.Screen name="Portfolio"         options={{ headerShown: false }} />
      <Tabs.Screen name="Holdings"          options={{ headerShown: false }} />
      <Tabs.Screen name="Insights"          options={{ headerShown: false }} />
      <Tabs.Screen name="GlobalMarkets"     options={{ headerShown: false }} />
      <Tabs.Screen name="Reports"           options={{ headerShown: false }} />
      <Tabs.Screen name="InvestmentProfile" options={{ headerShown: false }} />
    </Tabs>
  );
}

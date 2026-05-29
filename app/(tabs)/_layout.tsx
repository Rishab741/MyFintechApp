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

// ─── Tokens ───────────────────────────────────────────────────────────────────
const BG    = '#04070F';
const CYAN  = '#8FF5FF';
const TXT   = '#F8FAFC';
const MUTED = '#64748B';
const SIDEBAR_W = 252;
const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const sans = Platform.OS === 'ios' ? 'SF Pro Text' : 'sans-serif';

// ─── Nav items ────────────────────────────────────────────────────────────────
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
interface NavItem { name: string; label: string; icon: IconName; iconActive: IconName }

const NAV_ITEMS: NavItem[] = [
  { name: 'index',             label: 'Profile',  icon: 'account-outline',        iconActive: 'account'         },
  { name: 'Market',            label: 'Markets',  icon: 'chart-line',              iconActive: 'chart-line'      },
  { name: 'Portfolio',         label: 'Vault',    icon: 'chart-donut',             iconActive: 'chart-donut'     },
  { name: 'Holdings',          label: 'Assets',   icon: 'view-grid-outline',       iconActive: 'view-grid'       },
  { name: 'Insights',          label: 'AI',       icon: 'brain',                   iconActive: 'brain'           },
  { name: 'GlobalMarkets',     label: 'Macro',    icon: 'earth',                   iconActive: 'earth'           },
  { name: 'Compare',           label: 'Compare',  icon: 'chart-multiple',          iconActive: 'chart-multiple'  },
  { name: 'Reports',           label: 'Reports',  icon: 'download-circle-outline', iconActive: 'download-circle' },
  { name: 'InvestmentProfile', label: 'Setup',    icon: 'tune-variant',            iconActive: 'tune-variant'    },
];

// ─── Nav row ──────────────────────────────────────────────────────────────────
function NavRow({ item, active, onPress }: { item: NavItem; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [nr.row, active && nr.rowActive, pressed && nr.rowPressed]}
    >
      <View style={nr.iconWrap}>
        <MaterialCommunityIcons
          name={active ? item.iconActive : item.icon}
          size={20}
          color={active ? CYAN : MUTED}
        />
      </View>
      <Text numberOfLines={1} style={[nr.label, active && nr.labelActive]}>
        {item.label}
      </Text>
      {active && <View style={nr.activePip} />}
    </Pressable>
  );
}

// ─── Sidebar + FAB ────────────────────────────────────────────────────────────
function SidebarNav({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const slideAnim    = useRef(new Animated.Value(-SIDEBAR_W)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const fabRotate    = useRef(new Animated.Value(0)).current;

  const openSidebar = () => {
    setOpen(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(fabRotate, { toValue: 1, friction: 8, tension: 65, useNativeDriver: true }),
    ]).start();
  };

  const closeSidebar = (cb?: () => void) => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: -SIDEBAR_W, friction: 8, tension: 65, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.spring(fabRotate, { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }),
    ]).start(() => { setOpen(false); cb?.(); });
  };

  const fabSpin = fabRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  const activeItem = NAV_ITEMS[state.index];

  return (
    <>
      {/* ── Backdrop ── */}
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[s.backdrop, { opacity: backdropAnim }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => closeSidebar()} />
      </Animated.View>

      {/* ── Sidebar panel ── */}
      <Animated.View
        style={[s.panel, { paddingTop: insets.top, transform: [{ translateX: slideAnim }] }]}
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 60 : 100}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        {/* Extra tint on top of blur */}
        <View style={s.panelTint} />

        <View style={s.panelInner}>
          {/* Brand */}
          <View style={s.brand}>
            <View style={s.brandMark}>
              <Text style={s.brandV}>V</Text>
            </View>
            <View>
              <Text style={s.brandName}>VESTARA</Text>
              <Text style={s.brandSub}>Portfolio OS</Text>
            </View>
            {/* Close button inside sidebar header */}
            <Pressable
              onPress={() => closeSidebar()}
              style={s.sidebarClose}
              hitSlop={10}
            >
              <MaterialCommunityIcons name="close" size={18} color={MUTED} />
            </Pressable>
          </View>

          <View style={s.divider} />

          {/* Nav items */}
          <View style={s.navList}>
            {state.routes.map((route: any, index: number) => {
              const item = NAV_ITEMS.find(n => n.name === route.name);
              if (!item) return null;
              const active = state.index === index;
              return (
                <NavRow
                  key={route.key}
                  item={item}
                  active={active}
                  onPress={() => {
                    const event = navigation.emit({ type: 'tabPress', target: route.key });
                    closeSidebar(() => {
                      if (!active && !event.defaultPrevented) navigation.navigate(route.name);
                    });
                  }}
                />
              );
            })}
          </View>

          <View style={s.divider} />
          <Text style={s.version}>v1.0 · Vestara</Text>
        </View>
      </Animated.View>

      {/* ── FAB — bottom right, never overlaps any header ── */}
      <View
        style={[s.fabWrap, { bottom: insets.bottom + 28 }]}
        pointerEvents="box-none"
      >
        {/* Active section label chip */}
        {!open && activeItem && (
          <View style={s.fabLabel}>
            <Text style={s.fabLabelTxt}>{activeItem.label}</Text>
          </View>
        )}

        <Pressable
          onPress={open ? () => closeSidebar() : openSidebar}
          style={({ pressed }) => [s.fab, pressed && s.fabPressed]}
          hitSlop={6}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 50 : 100}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View style={s.fabTint} />
          <Animated.View style={{ transform: [{ rotate: fabSpin }] }}>
            <MaterialCommunityIcons
              name={open ? 'close' : 'menu'}
              size={21}
              color={CYAN}
            />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Backdrop
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.60)',
  },

  // Sidebar panel
  panel: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: SIDEBAR_W,
    zIndex: 20,
    overflow: 'hidden',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(143,245,255,0.15)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 10, height: 0 }, shadowOpacity: 0.7, shadowRadius: 30 },
      android: { elevation: 24 },
    }),
  },
  panelTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,7,15,0.78)' },
  panelInner: { flex: 1, paddingHorizontal: 18, paddingVertical: 20 },

  brand: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingBottom: 4,
  },
  brandMark: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(143,245,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(143,245,255,0.30)',
    alignItems: 'center', justifyContent: 'center',
  },
  brandV:    { color: CYAN, fontSize: 18, fontWeight: '800', fontFamily: mono },
  brandName: { color: CYAN, fontSize: 12, fontWeight: '800', letterSpacing: 2.5, fontFamily: mono },
  brandSub:  { color: MUTED, fontSize: 10, marginTop: 1 },
  sidebarClose: {
    marginLeft: 'auto',
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.09)', marginVertical: 14 },
  navList: { flex: 1, gap: 2 },
  version: { color: MUTED, fontSize: 10, fontFamily: mono, textAlign: 'center', paddingTop: 4 },

  // FAB
  fabWrap: {
    position: 'absolute',
    right: 18,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fabLabel: {
    backgroundColor: 'rgba(4,7,15,0.80)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  fabLabelTxt: { color: MUTED, fontSize: 12, fontFamily: mono, letterSpacing: 0.4 },

  fab: {
    width: 48, height: 48, borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(143,245,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: CYAN, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 10 },
    }),
  },
  fabTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,7,15,0.75)' },
  fabPressed: { opacity: 0.7 },
});

const nr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12,
    gap: 12,
  },
  rowActive:  { backgroundColor: 'rgba(143,245,255,0.07)' },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  iconWrap:   { width: 24, alignItems: 'center' },
  label:       { flex: 1, fontSize: 14, color: MUTED, fontFamily: sans, fontWeight: '500' },
  labelActive: { color: TXT, fontWeight: '700' },
  activePip: {
    width: 4, height: 20, borderRadius: 2, backgroundColor: CYAN,
  },
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
      tabBar={(props) => <SidebarNav {...props} />}
    >
      <Tabs.Screen name="index"             options={{ title: 'VESTARA' }} />
      <Tabs.Screen name="Market"            options={{ headerShown: false }} />
      <Tabs.Screen name="Portfolio"         options={{ headerShown: false }} />
      <Tabs.Screen name="Holdings"          options={{ headerShown: false }} />
      <Tabs.Screen name="Insights"          options={{ headerShown: false }} />
      <Tabs.Screen name="GlobalMarkets"     options={{ headerShown: false }} />
      <Tabs.Screen name="Compare"           options={{ headerShown: false }} />
      <Tabs.Screen name="Reports"           options={{ headerShown: false }} />
      <Tabs.Screen name="InvestmentProfile" options={{ headerShown: false }} />
    </Tabs>
  );
}

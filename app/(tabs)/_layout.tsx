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
const BG   = '#04070F';
const CYAN = '#8FF5FF';
const TXT  = '#F8FAFC';
const MUTED = '#64748B';
const SIDEBAR_W = 240;
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
      {active && <View style={nr.activeLine} />}
    </Pressable>
  );
}

// ─── Sidebar + trigger ────────────────────────────────────────────────────────
function SidebarNav({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  // translateX: 0 = visible, -SIDEBAR_W = off-screen left
  const slideAnim    = useRef(new Animated.Value(-SIDEBAR_W)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const openSidebar = () => {
    setOpen(true);
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSidebar = (cb?: () => void) => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: -SIDEBAR_W,
        friction: 8,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setOpen(false);
      cb?.();
    });
  };

  const activeItem = NAV_ITEMS[state.index];

  return (
    <>
      {/* ── Floating trigger button ── */}
      <View
        style={[
          trig.wrap,
          { top: insets.top + 12 },
          open && trig.wrapOpen,
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={open ? () => closeSidebar() : openSidebar}
          style={({ pressed }) => [trig.btn, pressed && trig.btnPressed]}
          hitSlop={8}
        >
          <MaterialCommunityIcons
            name={open ? 'close' : 'menu'}
            size={20}
            color={CYAN}
          />
        </Pressable>

        {/* Current page label — hides when sidebar is open */}
        {!open && (
          <View style={trig.pagePill}>
            <Text style={trig.pageLabel} numberOfLines={1}>
              {activeItem?.label ?? ''}
            </Text>
          </View>
        )}
      </View>

      {/* ── Backdrop ── */}
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[sb.backdrop, { opacity: backdropAnim }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => closeSidebar()} />
      </Animated.View>

      {/* ── Sidebar panel ── */}
      <Animated.View
        style={[
          sb.panel,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 50 : 100}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={sb.glass} />

        <View style={sb.inner}>
          {/* Brand header */}
          <View style={sb.brand}>
            <View style={sb.brandMark}>
              <Text style={sb.brandV}>V</Text>
            </View>
            <View>
              <Text style={sb.brandName}>VESTARA</Text>
              <Text style={sb.brandSub}>Portfolio OS</Text>
            </View>
          </View>

          <View style={sb.divider} />

          {/* Nav list */}
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

          <View style={sb.divider} />

          <Text style={sb.version}>v1.0 · Vestara</Text>
        </View>
      </Animated.View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const trig = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wrapOpen: { zIndex: 20 },
  btn: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(8,14,28,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(143,245,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  btnPressed: { backgroundColor: 'rgba(143,245,255,0.1)' },
  pagePill: {
    backgroundColor: 'rgba(8,14,28,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pageLabel: {
    color: MUTED,
    fontSize: 12,
    fontFamily: mono,
    letterSpacing: 0.5,
  },
});

const sb = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_W,
    zIndex: 15,
    overflow: 'hidden',
    borderRightWidth: 1,
    borderRightColor: 'rgba(143,245,255,0.1)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 8, height: 0 }, shadowOpacity: 0.6, shadowRadius: 24 },
      android: { elevation: 20 },
    }),
  },
  // Extra tinted glass layer on top of BlurView
  glass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,7,15,0.72)',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  brandMark: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(143,245,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(143,245,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandV:    { color: CYAN, fontSize: 17, fontWeight: '800', fontFamily: mono },
  brandName: { color: CYAN, fontSize: 12, fontWeight: '800', letterSpacing: 2.5, fontFamily: mono },
  brandSub:  { color: MUTED, fontSize: 10, marginTop: 1 },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 12,
  },
  navList: { flex: 1, gap: 2 },
  version: { color: MUTED, fontSize: 10, fontFamily: mono, textAlign: 'center', paddingTop: 4 },
});

const nr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
    overflow: 'hidden',
  },
  rowActive:  { backgroundColor: 'rgba(143,245,255,0.07)' },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  iconWrap: { width: 24, alignItems: 'center' },
  label:       { flex: 1, fontSize: 14, color: MUTED, fontFamily: sans, fontWeight: '500' },
  labelActive: { color: TXT, fontWeight: '700' },
  activeLine: {
    width: 3, height: 18,
    borderRadius: 2,
    backgroundColor: CYAN,
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
      <Tabs.Screen name="Reports"           options={{ headerShown: false }} />
      <Tabs.Screen name="InvestmentProfile" options={{ headerShown: false }} />
    </Tabs>
  );
}

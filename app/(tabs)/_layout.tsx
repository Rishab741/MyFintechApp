import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QL, sans } from '@/constants/Colors';
import { DrawerContext } from '@/src/context/DrawerContext';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface TabConfig {
  name:       string;
  label:      string;
  icon:       IconName;
  iconActive: IconName;
  color:      string;
}

const TABS: TabConfig[] = [
  { name: 'home',      label: 'Home',    icon: 'home-outline',        iconActive: 'home',        color: QL.GOLD },
  { name: 'Market',    label: 'Markets', icon: 'chart-line',          iconActive: 'chart-line',  color: QL.GOLD },
  { name: 'Portfolio', label: 'Vault',   icon: 'safe-square-outline', iconActive: 'safe-square', color: QL.GOLD },
  { name: 'Insights',  label: 'AI',      icon: 'brain',               iconActive: 'brain',       color: QL.BLUE },
  { name: 'index',     label: 'Profile', icon: 'account-outline',     iconActive: 'account',     color: QL.GOLD },
];

const PARENT_TAB: Record<string, string> = {
  GlobalMarkets: 'Market',   Holdings: 'Portfolio', Compare: 'Insights',
  Onboarding: 'index',       Import: 'index',       Reports: 'index',
  InvestmentProfile: 'index', Connect: 'index',
};

const DRAWER_W   = 220;
const ANIM_MS    = 260;
const SIDEBAR_BG = 'rgba(8, 11, 18, 0.96)';

// ── Nav item ──────────────────────────────────────────────────────────────────
function NavItem({
  tab, active, badge, onPress,
}: {
  tab: TabConfig; active: boolean; badge?: number; onPress: () => void;
}) {
  const scale    = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.87, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  const isBlue     = tab.color === QL.BLUE;
  const iconColor  = active ? tab.color : QL.MUTED;
  const pillBg     = active ? (isBlue ? 'rgba(123,140,196,0.16)' : 'rgba(201,162,75,0.12)') : 'transparent';
  const pillBorder = active ? (isBlue ? 'rgba(123,140,196,0.26)' : 'rgba(201,162,75,0.26)') : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : {}}
      accessibilityLabel={tab.label}
    >
      <Animated.View style={[
        s.pill,
        { backgroundColor: pillBg, borderColor: pillBorder, transform: [{ scale }] },
      ]}>
        {badge !== undefined && badge > 0 && (
          <View style={s.badge} pointerEvents="none">
            <Text style={s.badgeTxt}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
        <MaterialCommunityIcons name={active ? tab.iconActive : tab.icon} size={21} color={iconColor} />
        <Text style={[s.navLabel, { color: iconColor }]} numberOfLines={1}>{tab.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────
function Drawer({
  state, navigation, slideAnim, backdropAnim, onClose, insightBadge = 0,
}: {
  state: any; navigation: any;
  slideAnim: Animated.Value; backdropAnim: Animated.Value;
  onClose: () => void; insightBadge?: number;
}) {
  const insets  = useSafeAreaInsets();
  const current = state.routes[state.index]?.name ?? '';
  const active  = PARENT_TAB[current] ?? current;
  const visible = (state.routes as any[]).filter(r => TABS.some(t => t.name === r.name));

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, { opacity: backdropAnim, zIndex: 99 }]}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
          onPress={onClose}
        />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View style={[
        s.drawer,
        {
          transform:     [{ translateX: slideAnim }],
          paddingTop:    Math.max(insets.top, 16),
          paddingBottom: Math.max(insets.bottom, 20),
        },
      ]}>
        {/* Header */}
        <View style={s.drawerHeader}>
          <View style={s.drawerBrand}>
            <View style={s.brandMark}>
              <MaterialCommunityIcons name="chart-areaspline" size={16} color={QL.GOLD} />
            </View>
            <Text style={s.brandTxt}>Platstock</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn}>
            <MaterialCommunityIcons name="close" size={18} color={QL.MUTED} />
          </Pressable>
        </View>

        <View style={s.drawerDivider} />

        {/* Nav items */}
        <View style={s.drawerList}>
          {visible.map((route: any) => {
            const tab      = TABS.find(t => t.name === route.name)!;
            const isActive = active === route.name;
            return (
              <NavItem
                key={route.key}
                tab={tab}
                active={isActive}
                badge={route.name === 'Insights' ? insightBadge : undefined}
                onPress={() => {
                  onClose(); // close drawer first
                  const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!isActive && !ev.defaultPrevented) navigation.navigate(route.name);
                }}
              />
            );
          })}
        </View>
      </Animated.View>
    </>
  );
}


// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Drawer
  drawer: {
    position:         'absolute',
    left:             0,
    top:              0,
    bottom:           0,
    width:            DRAWER_W,
    zIndex:           100,
    backgroundColor:  SIDEBAR_BG,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(201,162,75,0.20)',
  },
  drawerHeader: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 16,
    paddingBottom:    12,
  },
  drawerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: {
    width:           34,
    height:          34,
    borderRadius:    10,
    backgroundColor: 'rgba(201,162,75,0.12)',
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     'rgba(201,162,75,0.28)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  brandTxt: {
    color:         QL.GOLD,
    fontSize:      15,
    fontFamily:    sans,
    fontWeight:    '700',
    letterSpacing: 0.4,
  },
  closeBtn: {
    width:           30,
    height:          30,
    borderRadius:    8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     'rgba(255,255,255,0.08)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  drawerDivider: {
    height:           StyleSheet.hairlineWidth,
    backgroundColor:  'rgba(255,255,255,0.07)',
    marginHorizontal: 14,
    marginBottom:     8,
  },
  drawerList: { flex: 1, paddingHorizontal: 10, gap: 2 },

  // Nav item
  pill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              12,
    borderRadius:     11,
    borderWidth:      StyleSheet.hairlineWidth,
    paddingVertical:  11,
    paddingHorizontal: 12,
    position:         'relative',
  },
  navLabel: { fontSize: 14, fontFamily: sans, fontWeight: '600', letterSpacing: 0.1, flexShrink: 1 },
  badge: {
    position:        'absolute',
    top:             4,
    left:            24,
    minWidth:        15,
    height:          15,
    borderRadius:    8,
    backgroundColor: QL.RED,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 3,
    borderWidth:     1.5,
    borderColor:     QL.BG,
    zIndex:          1,
  },
  badgeTxt: { fontSize: 8, color: '#fff', fontWeight: '700', fontFamily: sans },
});

// ── Root layout ───────────────────────────────────────────────────────────────
export default function TabLayout() {
  const [open, setOpen] = useState(false);
  const slideAnim    = useRef(new Animated.Value(-DRAWER_W)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const openDrawer = useCallback(() => {
    setOpen(true);
    Animated.parallel([
      Animated.timing(slideAnim,    { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 1, duration: ANIM_MS, useNativeDriver: false }),
    ]).start();
  }, [slideAnim, backdropAnim]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim,    { toValue: -DRAWER_W, duration: ANIM_MS, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0,         duration: ANIM_MS, useNativeDriver: false }),
    ]).start(() => setOpen(false));
  }, [slideAnim, backdropAnim]);

  return (
    <DrawerContext.Provider value={openDrawer}>
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{ headerShown: false }}
          tabBar={(props) => open ? (
            <Drawer
              {...props}
              slideAnim={slideAnim}
              backdropAnim={backdropAnim}
              onClose={closeDrawer}
            />
          ) : null}
        >
        <Tabs.Screen name="home"      options={{ title: 'Home' }} />
        <Tabs.Screen name="Market"    options={{ title: 'Markets' }} />
        <Tabs.Screen name="Portfolio" options={{ title: 'Vault' }} />
        <Tabs.Screen name="Insights"  options={{ title: 'AI' }} />
        <Tabs.Screen name="index"     options={{ title: 'Profile' }} />

        <Tabs.Screen name="Holdings"          options={{ href: null }} />
        <Tabs.Screen name="GlobalMarkets"     options={{ href: null }} />
        <Tabs.Screen name="Compare"           options={{ href: null }} />
        <Tabs.Screen name="Onboarding"        options={{ href: null }} />
        <Tabs.Screen name="Import"            options={{ href: null }} />
        <Tabs.Screen name="Reports"           options={{ href: null }} />
        <Tabs.Screen name="InvestmentProfile" options={{ href: null }} />
        <Tabs.Screen name="Connect"           options={{ href: null }} />
        </Tabs>
      </View>
    </DrawerContext.Provider>
  );
}

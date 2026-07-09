import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React, {
  useCallback, useLayoutEffect, useRef, useState,
} from 'react';
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

// Child screens that belong to a parent tab (for active-state highlighting)
const PARENT_TAB: Record<string, string> = {
  GlobalMarkets: 'Market',   Holdings: 'Portfolio', Compare: 'Insights',
  Onboarding: 'index',       Import: 'index',       Reports: 'index',
  InvestmentProfile: 'index', Connect: 'index',
};

const COLLAPSED_W = 62;
const EXPANDED_W  = 168;
const ANIM_MS     = 230;

// ── Nav item ─────────────────────────────────────────────────────────────────
function NavItem({
  tab, active, collapsed, badge, onPress,
}: {
  tab: TabConfig; active: boolean; collapsed: boolean; badge?: number; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.86, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  const iconColor  = active ? tab.color : QL.MUTED;
  const pillBg     = active ? (tab.color === QL.BLUE ? QL.BLUE_D : QL.GOLD_D) : 'transparent';
  const pillBorder = active ? (tab.color === QL.BLUE ? 'rgba(129,140,248,0.20)' : QL.GOLD_B) : 'transparent';

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}
      style={s.navItem} accessibilityRole="button"
      accessibilityState={active ? { selected: true } : {}}
      accessibilityLabel={tab.label}
    >
      <Animated.View style={[
        s.pill,
        collapsed ? s.pillCollapsed : s.pillExpanded,
        { backgroundColor: pillBg, borderColor: pillBorder, transform: [{ scale }] },
      ]}>
        {badge !== undefined && badge > 0 && (
          <View style={s.badge} pointerEvents="none">
            <Text style={s.badgeTxt}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
        <MaterialCommunityIcons
          name={active ? tab.iconActive : tab.icon}
          size={22} color={iconColor}
        />
        {!collapsed && (
          <Text style={[s.label, { color: iconColor }]} numberOfLines={1}>{tab.label}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
// Rendered as a normal flex child (not absolute) in a row layout with <Tabs>.
function LeftSidebar({
  state, navigation, collapsed, widthAnim, onToggle, insightBadge = 0,
}: {
  state: any; navigation: any; collapsed: boolean;
  widthAnim: Animated.Value; onToggle: () => void; insightBadge?: number;
}) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name ?? '';
  const active  = PARENT_TAB[current] ?? current;
  const visible = (state.routes as any[]).filter(r => TABS.some(t => t.name === r.name));

  return (
    <Animated.View style={[s.sidebar, {
      width:         widthAnim,
      paddingTop:    Math.max(insets.top, 14),
      paddingBottom: Math.max(insets.bottom, 16),
    }]}>
      {/* Toggle */}
      <Pressable onPress={onToggle} hitSlop={8}
        style={[s.toggleBtn, collapsed && s.toggleBtnCentered]}
      >
        <MaterialCommunityIcons
          name={collapsed ? 'chevron-right' : 'chevron-left'}
          size={18} color={QL.MUTED}
        />
      </Pressable>

      {/* Brand */}
      <View style={s.brand}>
        <View style={s.brandMark}>
          <MaterialCommunityIcons name="chart-areaspline" size={16} color={QL.GOLD} />
        </View>
        {!collapsed && (
          <Text style={s.brandTxt} numberOfLines={1}>Platstock</Text>
        )}
      </View>

      <View style={s.divider} />

      {/* Nav items */}
      <View style={s.list}>
        {visible.map((route: any) => {
          const tab      = TABS.find(t => t.name === route.name)!;
          const isActive = active === route.name;
          return (
            <NavItem
              key={route.key}
              tab={tab}
              active={isActive}
              collapsed={collapsed}
              badge={route.name === 'Insights' ? insightBadge : undefined}
              onPress={() => {
                const ev = navigation.emit({
                  type: 'tabPress', target: route.key, canPreventDefault: true,
                });
                if (!isActive && !ev.defaultPrevented) navigation.navigate(route.name);
              }}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

// ── StateBridge: renders inside tabBar prop to surface nav state upward ───────
// Returns null (no visible UI). Uses useLayoutEffect to avoid a visible flash.
interface NavCapture { state: any; navigation: any }
function StateBridge({
  state, navigation, onCapture,
}: NavCapture & { onCapture: (c: NavCapture) => void }) {
  useLayoutEffect(() => {
    onCapture({ state, navigation });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index]);
  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  sidebar: {
    backgroundColor:  QL.BG,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: QL.BORDER,
    overflow:         'hidden',
  },
  toggleBtn: {
    alignSelf:        'flex-end',
    marginRight:      10,
    marginBottom:     6,
    width:            30,
    height:           30,
    borderRadius:     8,
    backgroundColor:  QL.CARD,
    borderWidth:      StyleSheet.hairlineWidth,
    borderColor:      QL.BORDER,
    alignItems:       'center',
    justifyContent:   'center',
  },
  toggleBtnCentered: { alignSelf: 'center', marginRight: 0 },
  brand: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    paddingHorizontal: 10,
    marginBottom:   8,
  },
  brandMark: {
    width:           32,
    height:          32,
    borderRadius:    9,
    backgroundColor: QL.GOLD_D,
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     QL.GOLD_B,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  brandTxt: {
    color:        QL.GOLD,
    fontSize:     14,
    fontFamily:   sans,
    fontWeight:   '700',
    letterSpacing: 0.3,
    flexShrink:   1,
  },
  divider: {
    height:            StyleSheet.hairlineWidth,
    backgroundColor:   QL.BORDER,
    marginHorizontal:  10,
    marginBottom:      8,
  },
  list:    { flex: 1, gap: 2, paddingHorizontal: 6 },
  navItem: { width: '100%' },
  pill: {
    flexDirection: 'row',
    alignItems:    'center',
    borderRadius:  10,
    borderWidth:   StyleSheet.hairlineWidth,
    position:      'relative',
  },
  pillCollapsed: { justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 10 },
  pillExpanded:  { justifyContent: 'flex-start', gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  label: {
    fontSize:     13,
    fontFamily:   sans,
    fontWeight:   '600',
    letterSpacing: 0.1,
    flexShrink:   1,
  },
  badge: {
    position:        'absolute',
    top:             4,
    right:           4,
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
  const [collapsed, setCollapsed]   = useState(true);
  const [navCapture, setNavCapture] = useState<NavCapture | null>(null);
  const widthAnim = useRef(new Animated.Value(COLLAPSED_W)).current;

  const toggle = useCallback(() => {
    Animated.timing(widthAnim, {
      toValue:         !collapsed ? COLLAPSED_W : EXPANDED_W,
      duration:        ANIM_MS,
      useNativeDriver: false,
    }).start();
    setCollapsed(c => !c);
  }, [collapsed, widthAnim]);

  // Stable callback — only setNavCapture when the active tab index changes
  // (or on first mount). StateBridge passes state up via useLayoutEffect.
  const onCapture = useCallback((c: NavCapture) => {
    setNavCapture(prev =>
      prev?.state.index === c.state.index ? prev : c
    );
  }, []);

  return (
    // Row layout: sidebar slot on the left, screens take flex: 1 on the right.
    // No absolutely-positioned elements — avoids overflow-clipping issues.
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* Sidebar slot always reserves its animated width to keep screens stable */}
      <Animated.View style={{ width: widthAnim }}>
        {navCapture && (
          <LeftSidebar
            state={navCapture.state}
            navigation={navCapture.navigation}
            collapsed={collapsed}
            widthAnim={widthAnim}
            onToggle={toggle}
          />
        )}
      </Animated.View>

      {/* Screen content */}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{ headerShown: false }}
          tabBar={(props) => (
            <StateBridge
              state={props.state}
              navigation={props.navigation}
              onCapture={onCapture}
            />
          )}
        >
          <Tabs.Screen name="home"      options={{ title: 'Home' }} />
          <Tabs.Screen name="Market"    options={{ title: 'Markets' }} />
          <Tabs.Screen name="Portfolio" options={{ title: 'Vault' }} />
          <Tabs.Screen name="Insights"  options={{ title: 'AI' }} />
          <Tabs.Screen name="index"     options={{ title: 'Profile' }} />

          {/* Sub-screens — excluded from sidebar nav */}
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
    </View>
  );
}

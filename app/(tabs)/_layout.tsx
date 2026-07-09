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

const RAIL_W     = 42;   // collapsed — icon-only rail
const EXPANDED_W = 188;  // expanded — icons + labels
const ANIM_MS    = 220;

// Semi-transparent surface: deep ink with opacity
const SIDEBAR_BG   = 'rgba(8, 11, 18, 0.92)';
const BACKDROP_CLR = 'rgba(0, 0, 0, 0.38)';

// ── Nav item ─────────────────────────────────────────────────────────────────
function NavItem({
  tab, active, collapsed, badge, onPress,
}: {
  tab: TabConfig; active: boolean; collapsed: boolean; badge?: number; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () =>
    Animated.spring(scale, { toValue: 0.85, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  const iconColor  = active ? tab.color : QL.MUTED;
  const pillBg     = active
    ? (tab.color === QL.BLUE ? 'rgba(123,140,196,0.18)' : 'rgba(201,162,75,0.14)')
    : 'transparent';
  const pillBorder = active
    ? (tab.color === QL.BLUE ? 'rgba(123,140,196,0.28)' : 'rgba(201,162,75,0.28)')
    : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={s.navItem}
      accessibilityRole="button"
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
          size={21}
          color={iconColor}
        />
        {!collapsed && (
          <Text style={[s.label, { color: iconColor }]} numberOfLines={1}>
            {tab.label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ── Sidebar overlay ───────────────────────────────────────────────────────────
// position: 'absolute' — does NOT take any layout space; floats over screens.
// The "ear" tab protrudes past the right edge of the sidebar so users always
// have a visible, tappable target to expand/collapse — even in the rail state.
function LeftSidebar({
  state, navigation, collapsed, widthAnim, backdropAnim, onToggle, insightBadge = 0,
}: {
  state: any; navigation: any; collapsed: boolean;
  widthAnim: Animated.Value; backdropAnim: Animated.Value;
  onToggle: () => void; insightBadge?: number;
}) {
  const insets  = useSafeAreaInsets();
  const current = state.routes[state.index]?.name ?? '';
  const active  = PARENT_TAB[current] ?? current;
  const visible = (state.routes as any[]).filter(r => TABS.some(t => t.name === r.name));
  const earTop  = Math.max(insets.top, 12) + 44; // sits below the brand mark

  return (
    <>
      {/* Dim backdrop — tap anywhere to collapse */}
      <Animated.View
        pointerEvents={collapsed ? 'none' : 'box-only'}
        style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP_CLR, opacity: backdropAnim, zIndex: 99 }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onToggle} />
      </Animated.View>

      {/* Sidebar panel — overflow visible so the ear can protrude right */}
      <Animated.View style={[s.sidebar, {
        width:      widthAnim,
        paddingTop: Math.max(insets.top, 12),
        paddingBottom: Math.max(insets.bottom, 16),
      }]}>

        {/* Ear toggle — sticks out past the right border, always tappable */}
        <Pressable
          onPress={onToggle}
          hitSlop={8}
          accessibilityLabel={collapsed ? 'Expand menu' : 'Collapse menu'}
          style={[s.ear, { top: earTop }]}
        >
          <MaterialCommunityIcons
            name={collapsed ? 'chevron-right' : 'chevron-left'}
            size={13}
            color={QL.MUTED}
          />
        </Pressable>

        {/* Content — inner wrapper clips text overflow during animation */}
        <View style={s.sidebarContent}>
          {/* Brand */}
          <View style={s.brand}>
            <View style={s.brandMark}>
              <MaterialCommunityIcons name="chart-areaspline" size={15} color={QL.GOLD} />
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
                    if (!collapsed) onToggle(); // auto-collapse after picking a tab
                  }}
                />
              );
            })}
          </View>
        </View>
      </Animated.View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  sidebar: {
    position:         'absolute',
    left:             0,
    top:              0,
    bottom:           0,
    zIndex:           100,
    backgroundColor:  SIDEBAR_BG,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(201,162,75,0.18)',
    // overflow visible so the ear tab can protrude past the right border
  },
  sidebarContent: {
    flex:     1,
    overflow: 'hidden', // clips text/icons during collapse animation
  },
  ear: {
    position:              'absolute',
    right:                 -18,   // protrudes 18 px past the right border
    width:                 18,
    height:                38,
    backgroundColor:       SIDEBAR_BG,
    borderTopRightRadius:  10,
    borderBottomRightRadius: 10,
    borderTopWidth:        StyleSheet.hairlineWidth,
    borderRightWidth:      StyleSheet.hairlineWidth,
    borderBottomWidth:     StyleSheet.hairlineWidth,
    borderColor:           'rgba(201,162,75,0.18)',
    alignItems:            'center',
    justifyContent:        'center',
    zIndex:                101,
  },
  brand: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              10,
    paddingHorizontal: 10,
    marginBottom:     10,
  },
  brandMark: {
    width:           32,
    height:          32,
    borderRadius:    9,
    backgroundColor: 'rgba(201,162,75,0.12)',
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     'rgba(201,162,75,0.25)',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  brandTxt: {
    color:         QL.GOLD,
    fontSize:      14,
    fontFamily:    sans,
    fontWeight:    '700',
    letterSpacing: 0.4,
    flexShrink:    1,
  },
  divider: {
    height:           StyleSheet.hairlineWidth,
    backgroundColor:  'rgba(255,255,255,0.07)',
    marginHorizontal: 10,
    marginBottom:     8,
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
  pillCollapsed: {
    justifyContent:  'center',
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  pillExpanded: {
    justifyContent:  'flex-start',
    gap:             10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  label: {
    fontSize:      13,
    fontFamily:    sans,
    fontWeight:    '600',
    letterSpacing: 0.1,
    flexShrink:    1,
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
  const [collapsed, setCollapsed] = useState(true);
  const widthAnim    = useRef(new Animated.Value(RAIL_W)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const toggle = useCallback(() => {
    const expanding = collapsed;
    Animated.parallel([
      Animated.timing(widthAnim, {
        toValue:         expanding ? EXPANDED_W : RAIL_W,
        duration:        ANIM_MS,
        useNativeDriver: false,
      }),
      Animated.timing(backdropAnim, {
        toValue:         expanding ? 1 : 0,
        duration:        ANIM_MS,
        useNativeDriver: false,
      }),
    ]).start();
    setCollapsed(c => !c);
  }, [collapsed, widthAnim, backdropAnim]);

  return (
    // Screens take full width — sidebar floats absolutely over them
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => (
          <LeftSidebar
            {...props}
            collapsed={collapsed}
            widthAnim={widthAnim}
            backdropAnim={backdropAnim}
            onToggle={toggle}
          />
        )}
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
  );
}

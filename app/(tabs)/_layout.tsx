import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QL, sans } from '@/constants/Colors';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface TabConfig {
  name:        string;
  label:       string;
  icon:        IconName;
  iconActive:  IconName;
  activeColor: string;
}

const TABS: TabConfig[] = [
  { name: 'home',      label: 'Home',    icon: 'home-outline',        iconActive: 'home',        activeColor: QL.GOLD   },
  { name: 'Market',    label: 'Markets', icon: 'chart-line',          iconActive: 'chart-line',  activeColor: QL.GOLD   },
  { name: 'Portfolio', label: 'Vault',   icon: 'safe-square-outline', iconActive: 'safe-square', activeColor: QL.GOLD   },
  { name: 'Insights',  label: 'AI',      icon: 'brain',               iconActive: 'brain',       activeColor: QL.BLUE   },
  { name: 'index',     label: 'Profile', icon: 'account-outline',     iconActive: 'account',     activeColor: QL.GOLD   },
];

// Secondary screen → primary tab name (keeps the active highlight correct)
const PARENT_TAB: Record<string, string> = {
  GlobalMarkets:     'Market',
  Holdings:          'Portfolio',
  Compare:           'Insights',
  Onboarding:        'index',
  Import:            'index',
  Reports:           'index',
  InvestmentProfile: 'index',
  Connect:           'index',
};

// ─── Single tab item with press-scale animation ───────────────────────────────
interface TabItemProps {
  tab:         TabConfig;
  active:      boolean;
  badge?:      number;
  onPress:     () => void;
}

function TabItem({ tab, active, badge, onPress }: TabItemProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn  = () => Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1.00, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  const color = active ? tab.activeColor : QL.MUTED;

  // Active colour determines the pill tint (BLUE tab gets blue pill, others get GOLD)
  const pillBg     = active ? (tab.activeColor === QL.BLUE ? QL.BLUE_D  : QL.GOLD_D)  : 'transparent';
  const pillBorder = active ? (tab.activeColor === QL.BLUE ? 'rgba(129,140,248,0.20)' : QL.GOLD_B) : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={styles.tabItem}
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : {}}
      accessibilityLabel={tab.label}
    >
      <Animated.View
        style={[
          styles.tabInner,
          { backgroundColor: pillBg, borderColor: pillBorder, transform: [{ scale }] },
        ]}
      >
        {/* Badge overlay */}
        {badge !== undefined && badge > 0 && (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeTxt}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
        <MaterialCommunityIcons
          name={active ? tab.iconActive : tab.icon}
          size={22}
          color={color}
        />
        <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Bottom Tab Bar ───────────────────────────────────────────────────────────
function BottomTabBar({ state, navigation, insightBadge = 0 }: any) {
  const insets = useSafeAreaInsets();

  const currentRouteName: string = state.routes[state.index]?.name ?? '';
  const effectiveActiveName = PARENT_TAB[currentRouteName] ?? currentRouteName;

  const visibleRoutes = state.routes.filter((r: any) =>
    TABS.some(t => t.name === r.name)
  );

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.barInner}>
        {visibleRoutes.map((route: any) => {
          const tab = TABS.find(t => t.name === route.name)!;
          const active = effectiveActiveName === route.name;
          const badge = route.name === 'Insights' ? insightBadge : undefined;

          return (
            <TabItem
              key={route.key}
              tab={tab}
              active={active}
              badge={badge}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!active && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  bar: {
    backgroundColor: QL.BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: QL.BORDER,
  },
  barInner: {
    flexDirection: 'row',
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: sans,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 6,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: QL.RED,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: QL.BG,
    zIndex: 1,
  },
  badgeTxt: {
    fontSize: 8,
    color: '#fff',
    fontWeight: '700',
    fontFamily: sans,
  },
});

// ─── Root tab layout ──────────────────────────────────────────────────────────
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomTabBar {...props} />}
    >
      {/* ── Primary 5 tabs ── */}
      <Tabs.Screen name="home"      options={{ title: 'Home' }} />
      <Tabs.Screen name="Market"    options={{ title: 'Markets' }} />
      <Tabs.Screen name="Portfolio" options={{ title: 'Vault' }} />
      <Tabs.Screen name="Insights"  options={{ title: 'AI' }} />
      <Tabs.Screen name="index"     options={{ title: 'Profile' }} />

      {/* ── Secondary screens — hidden from tab bar, accessible via router.push() ── */}
      <Tabs.Screen name="Holdings"          options={{ href: null }} />
      <Tabs.Screen name="GlobalMarkets"     options={{ href: null }} />
      <Tabs.Screen name="Compare"           options={{ href: null }} />
      <Tabs.Screen name="Onboarding"        options={{ href: null }} />
      <Tabs.Screen name="Import"            options={{ href: null }} />
      <Tabs.Screen name="Reports"           options={{ href: null }} />
      <Tabs.Screen name="InvestmentProfile" options={{ href: null }} />
      <Tabs.Screen name="Connect"           options={{ href: null }} />
    </Tabs>
  );
}

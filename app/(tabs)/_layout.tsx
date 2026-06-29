import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Tokens ───────────────────────────────────────────────────────────────────
const BG     = '#060E1F';
const CYAN   = '#0EA5E9';
const INDIGO = '#818CF8';
const MUTED  = '#607A93';
const BORDER = '#1E3347';
const sans   = Platform.OS === 'ios' ? 'SF Pro Text' : 'sans-serif';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface TabConfig {
  name: string;
  label: string;
  icon: IconName;
  iconActive: IconName;
  activeColor: string;
}

const TABS: TabConfig[] = [
  { name: 'home',      label: 'Home',    icon: 'home-outline',        iconActive: 'home',         activeColor: CYAN   },
  { name: 'Market',    label: 'Markets', icon: 'chart-line',          iconActive: 'chart-line',   activeColor: CYAN   },
  { name: 'Portfolio', label: 'Vault',   icon: 'safe-square-outline', iconActive: 'safe-square',  activeColor: CYAN   },
  { name: 'Insights',  label: 'AI',      icon: 'brain',               iconActive: 'brain',        activeColor: INDIGO },
  { name: 'index',     label: 'Profile', icon: 'account-outline',     iconActive: 'account',      activeColor: CYAN   },
];

// ─── Parent tab map: secondary screen → primary tab name ─────────────────────
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

// ─── Bottom Tab Bar ───────────────────────────────────────────────────────────
function BottomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();

  const currentRouteName: string = state.routes[state.index]?.name ?? '';
  const effectiveActiveName = PARENT_TAB[currentRouteName] ?? currentRouteName;

  // Only render tab items that are in our TABS config (primary 5)
  const visibleRoutes = state.routes.filter((r: any) =>
    TABS.some(t => t.name === r.name)
  );

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.barInner}>
        {visibleRoutes.map((route: any) => {
          const tab = TABS.find(t => t.name === route.name)!;
          const active = effectiveActiveName === route.name;
          const color = active ? tab.activeColor : MUTED;

          return (
            <Pressable
              key={route.key}
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
              style={({ pressed }) => [styles.tabItem, pressed && styles.tabItemPressed]}
              accessibilityRole="button"
              accessibilityState={active ? { selected: true } : {}}
              accessibilityLabel={tab.label}
            >
              <MaterialCommunityIcons
                name={active ? tab.iconActive : tab.icon}
                size={23}
                color={color}
              />
              <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  bar: {
    backgroundColor: BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  barInner: {
    flexDirection: 'row',
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  tabItemPressed: {
    opacity: 0.65,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: sans,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
});

// ─── Root tab layout ──────────────────────────────────────────────────────────
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomTabBar {...props} />}
    >
      {/* ── Primary 5 tabs (visible in bottom bar, in order) ── */}
      <Tabs.Screen name="home"      options={{ title: 'Home' }} />
      <Tabs.Screen name="Market"    options={{ title: 'Markets' }} />
      <Tabs.Screen name="Portfolio" options={{ title: 'Vault' }} />
      <Tabs.Screen name="Insights"  options={{ title: 'AI' }} />
      <Tabs.Screen name="index"     options={{ title: 'Profile' }} />

      {/* ── Secondary screens — accessible via router.push(), hidden from bar ── */}
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

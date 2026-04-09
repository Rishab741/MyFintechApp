import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur'; // Added the missing import
import { Tabs } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';

// ─── Design Tokens ──────────────────────────────────────────────────────────
const BG = '#04070F';
const CYAN = '#8FF5FF';
const TXT = '#F8FAFC';
const MUTED = '#64748B';
const DOCK_BG = 'rgba(15, 23, 42, 0.85)';
const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const TABS: TabDef[] = [
  { name: 'index',         label: 'Profile',   icon: 'account-outline',    iconActive: 'account' },
  { name: 'Market',        label: 'Markets',   icon: 'chart-line',         iconActive: 'chart-line' },
  { name: 'Portfolio',     label: 'Vault',     icon: 'chart-donut',        iconActive: 'chart-donut' },
  { name: 'Holdings',      label: 'Assets',    icon: 'view-grid-outline',  iconActive: 'view-grid' },
  { name: 'Insights',      label: 'AI',        icon: 'brain',              iconActive: 'brain' },
  { name: 'GlobalMarkets', label: 'Macro',     icon: 'earth',              iconActive: 'earth' },
  { name: 'InvestmentProfile', label: 'Setup', icon: 'tune-variant',       iconActive: 'tune-variant' },
];

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
interface TabDef { name: string; label: string; icon: IconName; iconActive: IconName; }

const TabButton = ({ tab, active, onPress }: { tab: TabDef; active: boolean; onPress: () => void }) => {
  const expansion = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(expansion, {
      toValue: active ? 1 : 0,
      friction: 8,
      tension: 40,
      useNativeDriver: false,
    }).start();
  }, [active]);

  const animatedWidth = expansion.interpolate({
    inputRange: [0, 1],
    outputRange: [42, 95],
  });

  const animatedOpacity = expansion.interpolate({
    inputRange: [0.7, 1],
    outputRange: [0, 1],
  });

  return (
    <Pressable onPress={onPress}>
      <Animated.View style={[tb.inner, { width: animatedWidth, backgroundColor: active ? 'rgba(143, 245, 255, 0.12)' : 'transparent' }]}>
        <MaterialCommunityIcons
          name={active ? tab.iconActive : tab.icon}
          size={20}
          color={active ? CYAN : MUTED}
        />
        {active && (
          <Animated.Text numberOfLines={1} style={[tb.label, { opacity: animatedOpacity }]}>
            {tab.label}
          </Animated.Text>
        )}
      </Animated.View>
    </Pressable>
  );
};

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[bar.wrapper, { bottom: insets.bottom + 12 }]}>
      {/* Container wraps the BlurView to ensure the border-radius 
        and shadows are applied correctly across platforms 
      */}
      <View style={bar.container}>
        <BlurView intensity={Platform.OS === 'ios' ? 30 : 100} tint="dark" style={bar.blurPadding}>
          <View style={bar.row}>
            {state.routes.map((route: any, index: number) => {
              const tab = TABS.find(t => t.name === route.name);
              if (!tab) return null;
              const active = state.index === index;

              return (
                <TabButton
                  key={route.key}
                  tab={tab}
                  active={active}
                  onPress={() => {
                    const event = navigation.emit({ type: 'tabPress', target: route.key });
                    if (!active && !event.defaultPrevented) navigation.navigate(route.name);
                  }}
                />
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

const bar = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 10,
    right: 10,
    alignItems: 'center',
  },
  container: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: DOCK_BG,
    overflow: 'hidden', // Crucial for BlurView to respect borderRadius
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 15 },
      android: { elevation: 8 },
    }),
  },
  blurPadding: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});

const tb = StyleSheet.create({
  inner: {
    height: 42,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  label: {
    color: CYAN,
    fontSize: 11,
    fontFamily: mono,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
});

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
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'VESTARA' }} />
      <Tabs.Screen name="Market" options={{ headerShown: false }} />
      <Tabs.Screen name="Portfolio" options={{ headerShown: false }} />
      <Tabs.Screen name="Holdings" options={{ headerShown: false }} />
      <Tabs.Screen name="Insights" options={{ headerShown: false }} />
      <Tabs.Screen name="GlobalMarkets" options={{ headerShown: false }} />
      <Tabs.Screen name="InvestmentProfile" options={{ headerShown: false }} />
    </Tabs>
  );
}
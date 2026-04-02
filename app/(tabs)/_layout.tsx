import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
import React from 'react';
import { Platform, Pressable } from 'react-native';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#A89CF5',
        tabBarInactiveTintColor: '#475569',
        tabBarStyle: {
          backgroundColor: '#0C1019',
          borderTopColor: 'rgba(255,255,255,0.07)',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 60,
          paddingBottom: Platform.OS === 'ios' ? 24 : 6,
        },
        tabBarLabelStyle: {
          fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
          fontSize: 10,
          letterSpacing: 0.2,
        },
        headerShown: useClientOnlyValue(false, true),
        headerStyle: { backgroundColor: '#0C1019' },
        headerTintColor: '#F1F5F9',
        headerTitleStyle: {
          fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                {({ pressed }) => (
                  <FontAwesome
                    name="info-circle"
                    size={22}
                    color={Colors[colorScheme ?? 'light'].text}
                    style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="Market"
        options={{
          title: 'Markets',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon name="line-chart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="Portfolio"
        options={{
          title: 'Portfolio',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon name="pie-chart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="Insights"
        options={{
          title: 'Insights',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon name="bar-chart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="GlobalMarkets"
        options={{
          title: 'Macro',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon name="globe" color={color} />,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Profile Setup',
          tabBarIcon: ({ color }) => <TabBarIcon name="sliders" color={color} />,
        }}
      />
    </Tabs>
  );
}

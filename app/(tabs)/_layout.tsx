import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { fontFamily, useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const t = useTheme();
  const icon = (name: React.ComponentProps<typeof Ionicons>['name']) =>
    ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: t.colors.navActive,
      tabBarInactiveTintColor: t.colors.navInactive,
      tabBarStyle: { backgroundColor: t.colors.navBg, borderTopColor: t.colors.border },
      tabBarLabelStyle: { fontFamily: fontFamily(t.font.body), fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('sunny-outline') }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: icon('calendar-outline') }} />
      {/* The five tabs never move; disabled modules are hidden inside each tab instead */}
      <Tabs.Screen name="track" options={{ title: 'Track', tabBarIcon: icon('leaf-outline') }} />
      <Tabs.Screen name="money" options={{ title: 'Money', tabBarIcon: icon('wallet-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal-circle-outline') }} />
    </Tabs>
  );
}

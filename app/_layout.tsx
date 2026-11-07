import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { initSync } from '@/lib/db';
import { PreferencesProvider, usePreferences } from '@/lib/preferences';
import { isConfigured } from '@/lib/supabase';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { Screen, Title, Txt } from '@/components/ui';

function Gate() {
  const { session, ready } = useAuth();
  const { profile, loaded } = usePreferences();
  const segments = useSegments();
  const router = useRouter();
  const t = useTheme();

  useEffect(() => { if (session) void initSync(); }, [session]);

  useEffect(() => {
    if (!ready || (session && !loaded)) return;
    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';
    if (!session && !inAuth) router.replace('/(auth)/login');
    else if (session && profile && !profile.onboarded && !inOnboarding) router.replace('/onboarding');
    else if (session && profile?.onboarded && (inAuth || inOnboarding)) router.replace('/');
  }, [ready, loaded, session, profile, segments, router]);

  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bg }}><ActivityIndicator color={t.colors.primary} /></View>;

  return (
    <>
      <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{
        headerShadowVisible: false, headerStyle: { backgroundColor: t.colors.bg }, headerTintColor: t.colors.primary,
        headerTitleStyle: { color: t.colors.text }, contentStyle: { backgroundColor: t.colors.bg }, headerBackTitle: 'Back',
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </>
  );
}

function MissingConfig() {
  return (
    <Screen>
      <Title sub="Backend not configured">Setup needed</Title>
      <Txt>Copy .env.example to .env and set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart Expo. See README → "Supabase setup".</Txt>
    </Screen>
  );
}

export default function Root() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <PreferencesProvider>
            <ThemeProvider>{isConfigured ? <Gate /> : <MissingConfig />}</ThemeProvider>
          </PreferencesProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

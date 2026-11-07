import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { usePreferences } from '@/lib/preferences';
import { NavTile, Screen, Title } from '@/components/ui';

export default function More() {
  const { prefs } = usePreferences();
  return (
    <Screen>
      <Title>More</Title>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {prefs.modules.wishlist ? <NavTile icon="heart-outline" label="Wishlists" sub="Things you'd love" onPress={() => router.push('/more/wishlist')} /> : null}
        {prefs.modules.wishlist ? <NavTile icon="home-outline" label="Big purchases" sub="House, car, laptop…" onPress={() => router.push('/more/purchases')} /> : null}
        <NavTile icon="document-text-outline" label="Notes" sub="Ideas, links, lists" onPress={() => router.push('/more/notes')} />
        <NavTile icon="color-palette-outline" label="Aesthetic" sub="20 themes" onPress={() => router.push('/more/theme')} />
        <NavTile icon="settings-outline" label="Settings" sub="Profile, modules, privacy" onPress={() => router.push('/more/settings')} />
      </View>
    </Screen>
  );
}

import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { usePreferences } from '@/lib/preferences';
import { Empty, NavTile, Screen, Title } from '@/components/ui';

export default function Track() {
  const { prefs } = usePreferences();
  const m = prefs.modules;
  const any = m.food || m.water || m.meds || m.sleep || m.mindful || m.habits;
  return (
    <Screen>
      <Title sub="Gentle tracking — no scores, no streak guilt.">Track</Title>
      {!any ? <Empty text="All tracking modules are off. Turn some on in More → Settings." action={{ label: 'Settings', onPress: () => router.push('/more/settings') }} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {m.food ? <NavTile icon="nutrition-outline" label="Food diary" sub="Search, log, review" onPress={() => router.push('/track/food')} /> : null}
        {m.food ? <NavTile icon="restaurant-outline" label="Meal planner" sub="Day, week, month" onPress={() => router.push('/track/meals')} /> : null}
        {m.food ? <NavTile icon="chatbubbles-outline" label="Recipe AI" sub="Cook with what you have" onPress={() => router.push('/track/recipe-ai')} /> : null}
        {m.food ? <NavTile icon="cart-outline" label="Groceries" sub="From plans & recipes" onPress={() => router.push('/track/groceries')} /> : null}
        {m.food ? <NavTile icon="book-outline" label="Recipes" sub="Saved & custom" onPress={() => router.push('/track/recipes')} /> : null}
        {m.water ? <NavTile icon="water-outline" label="Water" sub="Quick add & history" onPress={() => router.push('/track/water')} /> : null}
        {m.meds ? <NavTile icon="medkit-outline" label="Medication" sub="Reminders & history" onPress={() => router.push('/track/meds')} /> : null}
        {m.habits ? <NavTile icon="sparkles-outline" label="Habits" sub="Flexible, no streaks" onPress={() => router.push('/track/habits')} /> : null}
        {m.sleep ? <NavTile icon="moon-outline" label="Sleep" sub="Planned vs actual" onPress={() => router.push('/track/sleep')} /> : null}
        {m.mindful ? <NavTile icon="flower-outline" label="Wellbeing" sub="Meditation, journaling, rest" onPress={() => router.push('/track/mindful')} /> : null}
      </View>
    </Screen>
  );
}

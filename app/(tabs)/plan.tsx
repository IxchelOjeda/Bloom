import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useRows } from '@/lib/db';
import { Button, NavTile, Screen, Title } from '@/components/ui';

export default function Plan() {
  const inbox = useRows<{ id: string }>('brain_dump', 'braindump:open', (q) => q.select('id').is('converted_to', null)).rows.length;
  return (
    <Screen>
      <Title sub="Your schedule adapts to your life.">Plan</Title>
      <Button icon="sparkles" label="Ask the Life Planner" onPress={() => router.push('/plan/planner-ai')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <NavTile icon="calendar-outline" label="Calendar" sub="Week · month · year" onPress={() => router.push('/plan/calendar')} />
        <NavTile icon="checkbox-outline" label="Tasks" sub="Everything, filtered your way" onPress={() => router.push('/plan/tasks')} />
        <NavTile icon="cloud-outline" label="Everything on my mind" sub={inbox ? `${inbox} to sort` : 'Brain dump inbox'} onPress={() => router.push('/plan/brain-dump')} />
        <NavTile icon="flag-outline" label="Goals" sub="Milestones & progress" onPress={() => router.push('/plan/goals')} />
        <NavTile icon="barbell-outline" label="Activities" sub="Things you give time to" onPress={() => router.push('/plan/activities')} />
        <NavTile icon="repeat-outline" label="Routines" sub="Step by step" onPress={() => router.push('/plan/routines')} />
        <NavTile icon="timer-outline" label="Focus" sub="Pomodoro timer" onPress={() => router.push('/plan/focus')} />
        <NavTile icon="moon-outline" label="Rest & availability" sub="Hours, rest days, energy" onPress={() => router.push('/plan/availability')} />
        <NavTile icon="layers-outline" label="Week · month · year" sub="Priorities, reviews, resets" onPress={() => router.push('/plan/periods')} />
        <NavTile icon="copy-outline" label="Templates" sub="Reusable starting points" onPress={() => router.push('/plan/templates')} />
        <NavTile icon="time-outline" label="Plan history" sub="Past AI plans" onPress={() => router.push('/plan/history')} />
      </View>
    </Screen>
  );
}

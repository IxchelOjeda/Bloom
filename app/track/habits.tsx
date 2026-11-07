import { Stack } from 'expo-router';
import { format, startOfDay, subDays } from 'date-fns';
import React from 'react';
import { Pressable, View } from 'react-native';
import { Collection } from '@/components/Collection';
import { db, useRows } from '@/lib/db';
import { WEEKDAY_SHORT, ymd } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/components/ui';

interface Habit { id: string; name: string; frequency: string; weekdays: number[]; times_per_week: number | null }

/** Last 4 weeks as soft dots. No streak counter: missing a day is just an empty dot. */
function HabitGrid({ h }: { h: Habit }) {
  const t = useTheme();
  const since = subDays(startOfDay(new Date()), 27);
  const logs = useRows<{ id: string; habit_id: string; date: string }>('habit_logs', `habitlogs:${h.id}`, (q) => q.select('*').eq('habit_id', h.id).gte('date', ymd(since)), (l) => l.habit_id === h.id).rows;
  const days = Array.from({ length: 28 }, (_, i) => subDays(startOfDay(new Date()), 27 - i));
  const thisWeek = logs.filter((l) => l.date >= ymd(subDays(new Date(), 6))).length;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {days.map((d) => {
          const log = logs.find((l) => l.date === ymd(d));
          return <Pressable key={+d} accessibilityLabel={`${format(d, 'MMM d')}${log ? ' done' : ''}`} hitSlop={2}
            onPress={() => log ? db.remove('habit_logs', log.id) : db.insert('habit_logs', { habit_id: h.id, date: ymd(d) })}
            style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: log ? t.colors.primary : t.colors.progressTrack }} />;
        })}
      </View>
      <Txt size={12} muted>{thisWeek} times in the last 7 days{h.times_per_week ? ` · aiming for ${h.times_per_week}` : ''} · tap any day to fill it in</Txt>
    </View>
  );
}

export default function Habits() {
  return (
    <>
      <Stack.Screen options={{ title: 'Habits' }} />
      <Collection<Habit>
        table="habits" title="Habits" icon="sparkles-outline" subtitle="Showing up sometimes still counts."
        emptyText="Reading, skincare, a walk, practicing an instrument…"
        fields={[
          { key: 'name', label: 'Habit', type: 'text', required: true },
          { key: 'frequency', label: 'How often', type: 'select', options: [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Some days a week' }, { value: 'custom', label: 'Flexible' }] },
          { key: 'weekdays', label: 'Show on Today on', type: 'weekdays' },
          { key: 'times_per_week', label: 'Gentle target per week (optional)', type: 'number', min: 1 },
        ]}
        defaults={{ frequency: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6] }}
        itemTitle={(h) => h.name}
        itemSub={(h) => h.weekdays.length === 7 ? 'every day' : h.weekdays.map((d) => WEEKDAY_SHORT[d]).join(' ')}
        itemExtra={(h) => <HabitGrid h={h} />}
      />
    </>
  );
}

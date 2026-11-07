import { Stack } from 'expo-router';
import { format, startOfDay, subDays } from 'date-fns';
import React, { useState } from 'react';
import { View } from 'react-native';
import { db, useRows } from '@/lib/db';
import { dayRange } from '@/lib/dates';
import { rescheduleHydration } from '@/lib/notifications';
import { usePreferences } from '@/lib/preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Chip, Field, Progress, Row, Screen, Section, Segmented, Txt } from '@/components/ui';

export default function Water() {
  const t = useTheme();
  const { prefs, profile, setPrefs } = usePreferences();
  const imperial = profile?.units === 'imperial';
  const fmt = (ml: number) => imperial ? `${Math.round(ml / 29.57)} fl oz` : `${ml} ml`;
  const { from, to } = dayRange();
  const [range, setRange] = useState<'7' | '30'>('7');
  const today = useRows<{ id: string; amount_ml: number; logged_at: string }>('water_logs', `water:${format(new Date(), 'yyyy-MM-dd')}`,
    (q) => q.select('*').gte('logged_at', from).lte('logged_at', to).order('logged_at'), (w) => w.logged_at >= from && w.logged_at <= to).rows;
  const hist = useRows<{ id: string; amount_ml: number; logged_at: string }>('water_logs', `water:${range}d`,
    (q) => q.select('id,amount_ml,logged_at').gte('logged_at', subDays(startOfDay(new Date()), Number(range) - 1).toISOString())).rows;
  const [goal, setGoal] = useState(String(prefs.water_goal_ml));
  const total = today.reduce((s, w) => s + w.amount_ml, 0);
  const days = Array.from({ length: Number(range) }, (_, i) => {
    const d = subDays(startOfDay(new Date()), Number(range) - 1 - i);
    return { d, ml: hist.filter((w) => format(new Date(w.logged_at), 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd')).reduce((s, w) => s + w.amount_ml, 0) };
  });
  const quick = imperial ? [[237, '8 oz'], [355, '12 oz'], [473, '16 oz']] : [[150, '150 ml'], [250, '250 ml'], [500, '500 ml']];

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Water' }} />
      <Card style={{ alignItems: 'center' }}>
        <Txt heading size={32}>{fmt(total)}</Txt>
        <Txt muted>{total >= prefs.water_goal_ml ? 'Goal reached ✦' : `${fmt(prefs.water_goal_ml - total)} to go`}</Txt>
        <View style={{ width: '100%' }}><Progress value={total / Math.max(1, prefs.water_goal_ml)} height={14} /></View>
        <Row wrap>{quick.map(([ml, l]) => <Button key={ml} small label={`+ ${l}`} onPress={() => void db.insert('water_logs', { amount_ml: ml, logged_at: new Date().toISOString() })} />)}</Row>
      </Card>
      {today.length ? <Section title="Today">
        <Card>{today.map((w) => <Row key={w.id}><Txt style={{ flex: 1 }}>{format(new Date(w.logged_at), 'h:mm a')}</Txt><Txt>{fmt(w.amount_ml)}</Txt><Chip label="Undo" onPress={() => db.remove('water_logs', w.id)} /></Row>)}</Card>
      </Section> : null}
      <Section title="History">
        <Segmented value={range} onChange={setRange} options={[{ value: '7', label: 'Week' }, { value: '30', label: 'Month' }]} />
        <Card><View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 2 }}>
          {days.map(({ d, ml }) => <View key={+d} accessibilityLabel={`${format(d, 'MMM d')}: ${fmt(ml)}`}
            style={{ flex: 1, height: `${Math.min(100, (ml / Math.max(1, prefs.water_goal_ml)) * 100)}%`, minHeight: 2, borderRadius: 3, backgroundColor: ml >= prefs.water_goal_ml ? t.colors.primary : t.colors.secondary }} />)}
        </View><Txt size={12} muted>Average {fmt(Math.round(days.reduce((s, x) => s + x.ml, 0) / days.length))} / day</Txt></Card>
      </Section>
      <Section title="Settings">
        <Field label="Daily goal (ml)" value={goal} onChangeText={setGoal} keyboardType="number-pad" />
        <Txt size={13} muted>Reminders every</Txt>
        <Row wrap>{[0, 60, 90, 120, 180].map((m) => <Chip key={m} label={m ? `${m / 60}h` : 'Off'} selected={prefs.notifications.water_every_min === m}
          onPress={async () => { const n = { ...prefs.notifications, water_every_min: m }; await setPrefs({ notifications: n }); await rescheduleHydration({ ...prefs, notifications: n }, profile?.wake_time?.slice(0, 5) ?? '08:00'); }} />)}</Row>
        <Button kind="secondary" label="Save goal" onPress={() => { const g = Number(goal); if (g > 0 && g <= 10000) void setPrefs({ water_goal_ml: g }); }} />
      </Section>
    </Screen>
  );
}

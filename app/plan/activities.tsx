import { Stack } from 'expo-router';
import { startOfWeek } from 'date-fns';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Collection } from '@/components/Collection';
import { db, useRows } from '@/lib/db';
import { WEEKDAY_SHORT } from '@/lib/dates';
import { Named, TaskSheet } from '@/components/sheets';
import { Button, Chip, Field, Progress, Row, Sheet, Txt } from '@/components/ui';

interface Activity { id: string; name: string; description: string | null; weekly_minutes: number | null; sessions_per_week: number | null; preferred_days: number[];
  preferred_start: string | null; session_minutes: number | null; demanding: boolean; progress_unit: string | null; progress_value: number | null; total_minutes: number; notes: string | null }

function ActivityExtras({ a }: { a: Activity }) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
  const focus = useRows<{ id: string; minutes: number; activity_id: string }>('focus_sessions', `focus:act:${a.id}:${weekStart}`,
    (q) => q.select('id,minutes,activity_id').eq('activity_id', a.id).gte('started_at', weekStart)).rows;
  const done = useRows<{ id: string; starts_at: string; ends_at: string }>('events', `events:act:${a.id}:${weekStart}`,
    (q) => q.select('id,starts_at,ends_at').eq('activity_id', a.id).eq('done', true).gte('starts_at', weekStart)).rows;
  const history = useRows<{ id: string; value: number; logged_at: string }>('progress_entries', `progress:act:${a.id}`,
    (q) => q.select('*').eq('activity_id', a.id).order('logged_at', { ascending: false }).limit(5)).rows;
  const goals = useRows<{ id: string; goal_id: string; activity_id: string }>('activity_goals', `actgoals:${a.id}`, (q) => q.select('*').eq('activity_id', a.id)).rows;
  const allGoals = useRows<Named>('goals', 'goals:open', (q) => q.select('id,title').is('completed_at', null)).rows;
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [task, setTask] = useState(false);

  const minutes = focus.reduce((s, f) => s + f.minutes, 0) + done.reduce((s, e) => s + (+new Date(e.ends_at) - +new Date(e.starts_at)) / 60000, 0);
  return (
    <View style={{ gap: 6 }}>
      {a.weekly_minutes ? (<>
        <Progress value={minutes / a.weekly_minutes} />
        <Txt size={12} muted>{Math.round(minutes)} of {a.weekly_minutes} min this week · {Math.round(a.total_minutes / 60)} h total</Txt>
      </>) : <Txt size={12} muted>{Math.round(a.total_minutes / 60 * 10) / 10} h logged in focus</Txt>}
      {a.progress_unit ? <Txt size={13}>Current: <Txt weight="600">{a.progress_value ?? '—'} {a.progress_unit}</Txt></Txt> : null}
      <Row wrap><Button small kind="secondary" label="Log progress" onPress={() => setOpen(true)} /><Button small kind="ghost" label="Add to-do" onPress={() => setTask(true)} /></Row>
      <Sheet visible={open} onClose={() => setOpen(false)} title={a.name}>
        {a.progress_unit ? (<>
          <Field label={`New value (${a.progress_unit})`} keyboardType="decimal-pad" value={val} onChangeText={setVal} />
          <Button label="Save" onPress={async () => { if (!isNaN(Number(val)) && val !== '') { await db.insert('progress_entries', { activity_id: a.id, value: Number(val) }); setVal(''); } }} />
        </>) : <Txt muted>Set a "progress unit" (e.g. kg, pages) on this activity to track a value over time.</Txt>}
        {history.length ? <Txt heading size={15}>History</Txt> : null}
        {history.map((h) => <Txt key={h.id} size={13}>{new Date(h.logged_at).toLocaleDateString()} — {h.value} {a.progress_unit}</Txt>)}
        <Txt heading size={15}>Linked goals</Txt>
        <Row wrap>{allGoals.map((g) => {
          const link = goals.find((l) => l.goal_id === g.id);
          return <Chip key={g.id} label={g.title!} selected={!!link} onPress={() => link ? db.remove('activity_goals', link.id) : db.insert('activity_goals', { activity_id: a.id, goal_id: g.id })} />;
        })}</Row>
      </Sheet>
      <TaskSheet visible={task} onClose={() => setTask(false)} defaults={{ activity_id: a.id }} />
    </View>
  );
}

export default function Activities() {
  return (
    <>
      <Stack.Screen options={{ title: 'Activities' }} />
      <Collection<Activity>
        table="activities" title="Activities" subtitle="Anything you want to give time to." icon="barbell-outline"
        emptyText="Weightlifting, studying, drawing, a language… add what matters to you."
        fields={[
          { key: 'name', label: 'Activity', type: 'text', required: true },
          { key: 'weekly_minutes', label: 'Desired minutes per week', type: 'number', min: 0 },
          { key: 'sessions_per_week', label: 'Sessions per week', type: 'number', min: 0 },
          { key: 'session_minutes', label: 'Usual session length (min)', type: 'number', min: 1 },
          { key: 'preferred_days', label: 'Preferred days', type: 'weekdays' },
          { key: 'preferred_start', label: 'Preferred start time', type: 'time' },
          { key: 'demanding', label: 'Demanding', type: 'bool', hint: 'The planner keeps these off rest and low-energy days' },
          { key: 'progress_unit', label: 'Track progress in (optional)', type: 'text', placeholder: 'kg, km, pages…' },
          { key: 'description', label: 'Description', type: 'multiline' },
          { key: 'notes', label: 'Notes', type: 'multiline' },
        ]}
        defaults={{ preferred_days: [], demanding: false }}
        itemTitle={(a) => a.name}
        itemSub={(a) => [a.sessions_per_week && `${a.sessions_per_week}×/week`, a.preferred_days?.length && a.preferred_days.map((d) => WEEKDAY_SHORT[d]).join(' '), a.demanding && 'demanding'].filter(Boolean).join(' · ')}
        itemExtra={(a) => <ActivityExtras a={a} />}
      />
    </>
  );
}

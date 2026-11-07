/**
 * Reusable create/edit sheets so tasks and events can be added from anywhere
 * (Today, calendar, brain dump, activities, goals…) with the same behaviour.
 */
import { addDays, format } from 'date-fns';
import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { db, useRows } from '@/lib/db';
import { ymd } from '@/lib/dates';
import { nextFreeSlot, AvailabilityRule, DayKind } from '@/lib/scheduler';
import { supabase } from '@/lib/supabase';
import { Button, Chip, Field, Row, Sheet, Txt } from './ui';

export interface Task {
  id: string; title: string; description: string | null; notes: string | null; parent_id: string | null;
  activity_id: string | null; goal_id: string | null; goal_increment: number; due_date: string | null; scheduled_at: string | null;
  deadline: string | null; priority: 'low' | 'medium' | 'high' | 'urgent'; estimate_min: number | null;
  status: 'todo' | 'done' | 'not_relevant' | 'unscheduled'; recurrence: string | null; completed_at: string | null; created_at: string;
}
export interface EventRow {
  id: string; title: string; kind: string; starts_at: string; ends_at: string; all_day: boolean; notes: string | null;
  task_id: string | null; activity_id: string | null; done: boolean; location: string | null;
}
export interface Named { id: string; name?: string; title?: string }

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export function TaskSheet({ visible, onClose, task, defaults }: {
  visible: boolean; onClose: () => void; task?: Task | null; defaults?: Partial<Task>;
}) {
  const cats = useRows<Named>('categories', 'categories:all', (q) => q.select('id,name').order('name')).rows;
  const goals = useRows<Named>('goals', 'goals:open', (q) => q.select('id,title').is('completed_at', null)).rows;
  const acts = useRows<Named>('activities', 'activities:active', (q) => q.select('id,name').eq('archived', false)).rows;
  const subtasks = useRows<Task>('tasks', `tasks:sub:${task?.id ?? 'none'}`, (q) => q.select('*').eq('parent_id', task?.id ?? '00000000-0000-0000-0000-000000000000').order('created_at'),
    (r) => !!task && r.parent_id === task.id).rows;

  const [v, setV] = useState<Partial<Task>>({});
  const [catIds, setCatIds] = useState<string[]>([]);
  const [newSub, setNewSub] = useState('');
  const [newCat, setNewCat] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setV(task ? { ...task } : { priority: 'medium', ...defaults });
    if (task) supabase.from('task_categories').select('category_id').eq('task_id', task.id).then(({ data }) => setCatIds((data ?? []).map((d) => d.category_id)));
    else setCatIds([]);
  }, [visible, task]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Task>(k: K, val: Task[K] | null) => setV((s) => ({ ...s, [k]: val }));

  const save = async () => {
    const title = (v.title ?? '').trim();
    if (!title) return Alert.alert('Give it a name', 'A short title is enough.');
    if (v.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(v.due_date)) return Alert.alert('Date format', 'Use YYYY-MM-DD');
    setBusy(true);
    const row = {
      title, description: v.description || null, notes: v.notes || null, priority: v.priority ?? 'medium',
      due_date: v.due_date || null, estimate_min: v.estimate_min ? Number(v.estimate_min) : null,
      goal_id: v.goal_id || null, activity_id: v.activity_id || null, goal_increment: v.goal_id ? Number(v.goal_increment ?? 0) : 0,
      recurrence: v.recurrence || null, parent_id: v.parent_id ?? null, scheduled_at: v.scheduled_at ?? null,
    };
    let id = task?.id;
    if (task) await db.update('tasks', task.id, row);
    else id = (await db.insert('tasks', { ...row, status: 'todo', source: (defaults as any)?.source ?? 'manual' })).id;
    // sync many-to-many categories
    const { data: existing } = task ? await supabase.from('task_categories').select('id,category_id').eq('task_id', id!) : { data: [] as { id: string; category_id: string }[] };
    for (const e of existing ?? []) if (!catIds.includes(e.category_id)) await db.remove('task_categories', e.id);
    for (const c of catIds) if (!(existing ?? []).some((e) => e.category_id === c)) await db.insert('task_categories', { task_id: id, category_id: c });
    setBusy(false); onClose();
  };

  const addCategory = async () => {
    const n = newCat.trim(); if (!n) return;
    const c = await db.insert('categories', { name: n }); setCatIds((s) => [...s, c.id]); setNewCat('');
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={task ? 'Edit task' : 'New task'}>
      <Field label="Task" value={v.title ?? ''} onChangeText={(x) => set('title', x)} placeholder="e.g. Buy groceries" autoFocus={!task} />
      <View style={{ gap: 6 }}>
        <Txt size={13} muted>Due</Txt>
        <Row wrap>
          <Chip label="Today" selected={v.due_date === ymd(new Date())} onPress={() => set('due_date', ymd(new Date()))} />
          <Chip label="Tomorrow" selected={v.due_date === ymd(addDays(new Date(), 1))} onPress={() => set('due_date', ymd(addDays(new Date(), 1)))} />
          <Chip label="Someday" selected={!v.due_date} onPress={() => set('due_date', null)} />
        </Row>
        <Field value={v.due_date ?? ''} onChangeText={(x) => set('due_date', x)} placeholder="or YYYY-MM-DD" autoCapitalize="none" />
      </View>
      <View style={{ gap: 6 }}>
        <Txt size={13} muted>Priority</Txt>
        <Row wrap>{PRIORITIES.map((p) => <Chip key={p} label={p} selected={v.priority === p} onPress={() => set('priority', p)} />)}</Row>
      </View>
      <Field label="Estimated minutes" keyboardType="number-pad" value={v.estimate_min ? String(v.estimate_min) : ''} onChangeText={(x) => set('estimate_min', x ? Number(x.replace(/\D/g, '')) : null)} placeholder="Helps with time blindness" />
      <View style={{ gap: 6 }}>
        <Txt size={13} muted>Categories (pick any number)</Txt>
        <Row wrap>{cats.map((c) => <Chip key={c.id} label={c.name!} selected={catIds.includes(c.id)} onPress={() => setCatIds((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])} />)}</Row>
        <Row><View style={{ flex: 1 }}><Field value={newCat} onChangeText={setNewCat} placeholder="New category" /></View><Button small kind="secondary" label="Add" onPress={addCategory} /></Row>
      </View>
      {acts.length ? (<View style={{ gap: 6 }}>
        <Txt size={13} muted>Activity</Txt>
        <Row wrap><Chip label="None" selected={!v.activity_id} onPress={() => set('activity_id', null)} />
          {acts.map((a) => <Chip key={a.id} label={a.name!} selected={v.activity_id === a.id} onPress={() => set('activity_id', a.id)} />)}</Row>
      </View>) : null}
      {goals.length ? (<View style={{ gap: 6 }}>
        <Txt size={13} muted>Goal</Txt>
        <Row wrap><Chip label="None" selected={!v.goal_id} onPress={() => set('goal_id', null)} />
          {goals.map((g) => <Chip key={g.id} label={g.title!} selected={v.goal_id === g.id} onPress={() => set('goal_id', g.id)} />)}</Row>
        {v.goal_id ? <Field label="Counts toward goal by" keyboardType="decimal-pad" value={v.goal_increment ? String(v.goal_increment) : ''} onChangeText={(x) => set('goal_increment', Number(x) || 0)} placeholder="e.g. 1 (book)" /> : null}
      </View>) : null}
      <View style={{ gap: 6 }}>
        <Txt size={13} muted>Repeat</Txt>
        <Row wrap>{[['', 'Never'], ['FREQ=DAILY', 'Daily'], ['FREQ=WEEKLY', 'Weekly'], ['FREQ=MONTHLY', 'Monthly']].map(([r, l]) =>
          <Chip key={l} label={l} selected={(v.recurrence ?? '') === r} onPress={() => set('recurrence', r || null)} />)}</Row>
      </View>
      <Field label="Notes" multiline value={v.notes ?? ''} onChangeText={(x) => set('notes', x)} />
      {task ? (
        <View style={{ gap: 6 }}>
          <Txt size={13} muted>Subtasks — small steps make big things doable</Txt>
          {subtasks.map((s) => (
            <Row key={s.id}>
              <Chip label={s.status === 'done' ? '✓' : '○'} onPress={() => db.update('tasks', s.id, { status: s.status === 'done' ? 'todo' : 'done' })} />
              <Txt style={{ flex: 1, textDecorationLine: s.status === 'done' ? 'line-through' : 'none' }}>{s.title}</Txt>
            </Row>
          ))}
          <Row><View style={{ flex: 1 }}><Field value={newSub} onChangeText={setNewSub} placeholder="Add a step" /></View>
            <Button small kind="secondary" label="Add" onPress={async () => { if (newSub.trim()) { await db.insert('tasks', { title: newSub.trim(), parent_id: task.id, status: 'todo', priority: 'medium' }); setNewSub(''); } }} /></Row>
        </View>
      ) : null}
      <Button label="Save" onPress={save} loading={busy} />
      {task ? <Button kind="ghost" label="Delete task" onPress={() => Alert.alert('Delete task?', task.title, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void db.remove('tasks', task.id); onClose(); } }])} /> : null}
    </Sheet>
  );
}

const KINDS = [['event', 'Event'], ['activity', 'Activity'], ['break', 'Break'], ['meal', 'Meal'], ['appointment', 'Appointment'], ['routine', 'Routine']] as const;

export function EventSheet({ visible, onClose, event, date, defaultTitle, onSaved }: { visible: boolean; onClose: () => void; event?: EventRow | null; date?: Date; defaultTitle?: string; onSaved?: (id: string) => void }) {
  const acts = useRows<Named>('activities', 'activities:active', (q) => q.select('id,name').eq('archived', false)).rows;
  const [title, setTitle] = useState(''); const [kind, setKind] = useState('event');
  const [day, setDay] = useState(''); const [start, setStart] = useState(''); const [end, setEnd] = useState('');
  const [notes, setNotes] = useState(''); const [activity, setActivity] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const s = event ? new Date(event.starts_at) : new Date(date ?? new Date());
    if (!event) { s.setMinutes(Math.ceil(s.getMinutes() / 15) * 15, 0, 0); }
    const e = event ? new Date(event.ends_at) : new Date(+s + 60 * 60000);
    setTitle(event?.title ?? defaultTitle ?? ''); setKind(event?.kind ?? 'event'); setNotes(event?.notes ?? ''); setActivity(event?.activity_id ?? null);
    setDay(ymd(s)); setStart(format(s, 'HH:mm')); setEnd(format(e, 'HH:mm'));
  }, [visible, event, date]);

  const save = async () => {
    const re = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!title.trim()) return Alert.alert('Add a title');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !re.test(start) || !re.test(end)) return Alert.alert('Check the date and times', 'Date YYYY-MM-DD, times HH:MM');
    const s = new Date(`${day}T${start}:00`), e = new Date(`${day}T${end}:00`);
    if (e <= s) return Alert.alert('End must be after start');
    setBusy(true);
    const row = { title: title.trim(), kind, starts_at: s.toISOString(), ends_at: e.toISOString(), notes: notes || null, activity_id: activity };
    let id = event?.id;
    if (event) await db.update('events', event.id, row); else id = (await db.insert('events', { ...row, done: false })).id;
    setBusy(false); onSaved?.(id!); onClose();
  };
  const durations = [15, 30, 45, 60, 90, 120];
  const setDuration = (m: number) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) return;
    const s = new Date(`2000-01-01T${start}:00`); setEnd(format(new Date(+s + m * 60000), 'HH:mm'));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={event ? 'Edit' : 'Add to schedule'}>
      <Field label="What" value={title} onChangeText={setTitle} autoFocus={!event} />
      <Row wrap>{KINDS.map(([k, l]) => <Chip key={k} label={l} selected={kind === k} onPress={() => setKind(k)} />)}</Row>
      <Field label="Date" value={day} onChangeText={setDay} autoCapitalize="none" />
      <Row><View style={{ flex: 1 }}><Field label="Start" value={start} onChangeText={setStart} autoCapitalize="none" /></View>
        <View style={{ flex: 1 }}><Field label="End" value={end} onChangeText={setEnd} autoCapitalize="none" /></View></Row>
      <Row wrap>{durations.map((m) => <Chip key={m} label={m < 60 ? `${m}m` : `${m / 60}h`} onPress={() => setDuration(m)} />)}</Row>
      {acts.length ? <Row wrap><Chip label="No activity" selected={!activity} onPress={() => setActivity(null)} />
        {acts.map((a) => <Chip key={a.id} label={a.name!} selected={activity === a.id} onPress={() => setActivity(a.id)} />)}</Row> : null}
      <Field label="Notes" multiline value={notes} onChangeText={setNotes} />
      <Button label="Save" onPress={save} loading={busy} />
      {event ? <Button kind="ghost" label="Delete" onPress={() => { void db.remove('events', event.id); onClose(); }} /> : null}
    </Sheet>
  );
}

/** Gentle options for a missed task — nothing is auto-moved. */
export function RescheduleSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const [custom, setCustom] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  if (!task) return null;
  const done = (patch: Record<string, unknown>) => { void db.update('tasks', task.id, patch); onClose(); };

  const nextAvailable = async () => {
    const now = new Date();
    const horizon = addDays(now, 14);
    const [av, ev, flags] = await Promise.all([
      supabase.from('availability').select('weekday,start_time,end_time'),
      supabase.from('events').select('starts_at,ends_at,title').gte('ends_at', now.toISOString()).lte('starts_at', horizon.toISOString()),
      supabase.from('day_flags').select('date,kind').gte('date', ymd(now)),
    ]);
    const rules: AvailabilityRule[] = (av.data ?? []).map((a) => ({ weekday: a.weekday, start: a.start_time.slice(0, 5), end: a.end_time.slice(0, 5) }));
    if (!rules.length) return setMsg('Set your available hours in Plan → Availability first.');
    const slot = nextFreeSlot(now, task.estimate_min ?? 30, rules, (ev.data ?? []).map((e) => ({ start: new Date(e.starts_at), end: new Date(e.ends_at), title: e.title })),
      Object.fromEntries((flags.data ?? []).map((f) => [f.date, f.kind as DayKind])));
    if (!slot) return setMsg('No free slot in the next two weeks — try picking a date.');
    await db.insert('events', { title: task.title, kind: 'task_block', starts_at: slot.start.toISOString(), ends_at: slot.end.toISOString(), task_id: task.id, done: false });
    done({ due_date: ymd(slot.start), scheduled_at: slot.start.toISOString(), status: 'todo' });
  };

  return (
    <Sheet visible onClose={onClose} title="No worries — what now?">
      <Txt muted>"{task.title}" didn't happen. That's okay. Pick what fits:</Txt>
      <Button kind="secondary" icon="sunny-outline" label="Tomorrow" onPress={() => done({ due_date: ymd(addDays(new Date(), 1)), status: 'todo' })} />
      <Button kind="secondary" icon="time-outline" label="Next free time" onPress={nextAvailable} />
      <Row><View style={{ flex: 1 }}><Field value={custom} onChangeText={setCustom} placeholder="YYYY-MM-DD" autoCapitalize="none" /></View>
        <Button small kind="secondary" label="Move" onPress={() => /^\d{4}-\d{2}-\d{2}$/.test(custom) ? done({ due_date: custom, status: 'todo' }) : setMsg('Use YYYY-MM-DD')} /></Row>
      <Button kind="secondary" icon="file-tray-outline" label="Leave unscheduled" onPress={() => done({ due_date: null, scheduled_at: null, status: 'unscheduled' })} />
      <Button kind="ghost" icon="close-circle-outline" label="No longer relevant" onPress={() => done({ status: 'not_relevant' })} />
      {msg ? <Txt muted>{msg}</Txt> : null}
    </Sheet>
  );
}

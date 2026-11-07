import { differenceInCalendarDays, format } from 'date-fns';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { db, useRows } from '@/lib/db';
import { dayRange, greeting, hm, ymd } from '@/lib/dates';
import { formatMoney } from '@/lib/finance';
import { DashboardSection, usePreferences } from '@/lib/preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { EventRow, EventSheet, RescheduleSheet, Task, TaskSheet } from '@/components/sheets';
import { Button, Card, Check, Chip, Empty, Field, IconButton, IconName, Pill, Progress, Row, Screen, Section, Sheet, Title, Txt } from '@/components/ui';

const SECTION_LABEL: Record<DashboardSection, string> = {
  minimum_day: 'Minimum day', timeline: 'Timeline', tasks: 'Tasks', meals: 'Meals', water: 'Water',
  meds: 'Medication', payments: 'Upcoming payments', habits: 'Habits', progress: 'Progress',
};
const ALL_SECTIONS = Object.keys(SECTION_LABEL) as DashboardSection[];
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] as const;

export default function Today() {
  const t = useTheme();
  const { prefs, profile, setPrefs } = usePreferences();
  const today = ymd(new Date());
  const { from, to } = dayRange();

  // ---- data (each list refreshes automatically when anything writes to its table) ----
  const events = useRows<EventRow>('events', `events:${today}`, (q) => q.select('*').gte('starts_at', from).lte('starts_at', to).order('starts_at'),
    (e) => e.starts_at >= from && e.starts_at <= to).rows;
  const tasks = useRows<Task>('tasks', `tasks:today:${today}`, (q) => q.select('*').is('parent_id', null).in('status', ['todo', 'done']).lte('due_date', today).order('priority', { ascending: false }),
    (x) => !x.parent_id && (x.status === 'todo' || x.status === 'done') && !!x.due_date && x.due_date <= today).rows;
  const meals = useRows<{ id: string; slot: string; title: string; completed: boolean }>('meal_plans', `meals:${today}`, (q) => q.select('id,slot,title,completed,date').eq('date', today)).rows;
  const water = useRows<{ id: string; amount_ml: number; logged_at: string }>('water_logs', `water:${today}`, (q) => q.select('*').gte('logged_at', from).lte('logged_at', to)).rows;
  const meds = useRows<{ id: string; name: string; dosage: string | null; times: string[]; weekdays: number[] }>('medications', 'meds:all', (q) => q.select('*')).rows;
  const medLogs = useRows<{ id: string; medication_id: string; scheduled_for: string; status: string }>('medication_logs', `medlogs:${today}`, (q) => q.select('*').gte('scheduled_for', from).lte('scheduled_for', to)).rows;
  const bills = useRows<{ id: string; name: string; amount: number; currency: string; next_due: string }>('recurring_payments', 'bills:upcoming',
    (q) => q.select('*').eq('active', true).lte('next_due', ymd(new Date(Date.now() + 7 * 86400000))).order('next_due')).rows;
  const habits = useRows<{ id: string; name: string; weekdays: number[] }>('habits', 'habits:active', (q) => q.select('*').eq('archived', false)).rows;
  const habitLogs = useRows<{ id: string; habit_id: string; date: string }>('habit_logs', `habitlogs:${today}`, (q) => q.select('*').eq('date', today)).rows;
  const minDay = useRows<{ id: string; items: { label: string; done: boolean }[] }>('minimum_days', `minday:${today}`, (q) => q.select('*').eq('date', today)).rows[0];
  const focus = useRows<{ id: string; minutes: number }>('focus_sessions', `focus:${today}`, (q) => q.select('id,minutes').eq('kind', 'focus').gte('started_at', from)).rows;
  const energy = useRows<{ id: string; level: string }>('energy_logs', `energy:${today}`, (q) => q.select('*').eq('date', today)).rows[0];

  // ---- local UI state ----
  const [taskSheet, setTaskSheet] = useState<{ open: boolean; task?: Task | null }>({ open: false });
  const [eventSheet, setEventSheet] = useState<{ open: boolean; event?: EventRow | null }>({ open: false });
  const [missed, setMissed] = useState<Task | null>(null);
  const [customize, setCustomize] = useState(false);
  const [minEdit, setMinEdit] = useState(false);
  const [restartDismissed, setRestartDismissed] = useState(false);

  const waterTotal = water.reduce((s, w) => s + w.amount_ml, 0);
  const todaysMeds = useMemo(() => meds.filter((m) => m.weekdays.includes(new Date().getDay())).flatMap((m) =>
    m.times.map((time) => {
      const at = new Date(`${today}T${time.slice(0, 5)}:00`);
      const log = medLogs.find((l) => l.medication_id === m.id && +new Date(l.scheduled_for) === +at);
      return { med: m, time: time.slice(0, 5), at, log };
    })).sort((a, b) => +a.at - +b.at), [meds, medLogs, today]);
  const todaysHabits = habits.filter((h) => h.weekdays.includes(new Date().getDay()));

  const away = profile?.last_active_at ? differenceInCalendarDays(new Date(), new Date(profile.last_active_at)) : 0;
  const nextEvent = events.find((e) => new Date(e.ends_at) > new Date() && !e.done);

  const toggleTask = (x: Task) => db.update('tasks', x.id, { status: x.status === 'done' ? 'todo' : 'done' });
  const toggleHabit = (id: string) => {
    const log = habitLogs.find((l) => l.habit_id === id);
    return log ? db.remove('habit_logs', log.id) : db.insert('habit_logs', { habit_id: id, date: today });
  };
  const logMed = (m: { med: { id: string }; at: Date; log?: { id: string } }, status: 'taken' | 'skipped' | 'snoozed') =>
    m.log ? db.update('medication_logs', m.log.id, { status }) : db.insert('medication_logs', { medication_id: m.med.id, scheduled_for: m.at.toISOString(), status });

  const quick: { icon: IconName; label: string; onPress: () => void }[] = [
    { icon: 'checkbox-outline', label: 'Task', onPress: () => setTaskSheet({ open: true }) },
    { icon: 'add-circle-outline', label: 'Activity', onPress: () => setEventSheet({ open: true }) },
    { icon: 'restaurant-outline', label: 'Meal', onPress: () => router.push('/track/meals') },
    { icon: 'nutrition-outline', label: 'Log food', onPress: () => router.push('/track/food') },
    { icon: 'water-outline', label: '+250 ml', onPress: () => void db.insert('water_logs', { amount_ml: 250, logged_at: new Date().toISOString() }) },
    { icon: 'card-outline', label: 'Expense', onPress: () => router.push('/money/expenses') },
    { icon: 'create-outline', label: 'Note', onPress: () => router.push('/more/notes') },
    { icon: 'timer-outline', label: 'Focus', onPress: () => router.push('/plan/focus') },
    { icon: 'sparkles-outline', label: 'AI planner', onPress: () => router.push('/plan/planner-ai') },
  ];

  const sections: Record<DashboardSection, React.ReactNode> = {
    minimum_day: (
      <Section title="Minimum day" action={{ label: minDay ? 'Edit' : 'Set up', onPress: () => setMinEdit(true) }}>
        {minDay && minDay.items.length ? (
          <Card tone="soft">
            <Txt size={13} muted>Just these today. Everything else is a bonus.</Txt>
            {minDay.items.map((it, i) => (
              <Row key={i}><Check done={it.done} label={it.label} onPress={() => db.update('minimum_days', minDay.id, { items: minDay.items.map((x, j) => j === i ? { ...x, done: !x.done } : x) })} />
                <Txt style={{ flex: 1, textDecorationLine: it.done ? 'line-through' : 'none' }}>{it.label}</Txt></Row>
            ))}
          </Card>
        ) : <Card tone="alt"><Txt muted size={13}>Low-energy day? Pick 1–3 essentials and let the rest wait.</Txt></Card>}
      </Section>
    ),
    timeline: (
      <Section title="Timeline" action={{ label: 'Add', onPress: () => setEventSheet({ open: true }) }}>
        {nextEvent ? <Card tone="soft"><Txt size={13} muted>Up next</Txt><Txt weight="600">{nextEvent.title}</Txt>
          <Txt size={13} muted>{hm(nextEvent.starts_at)} – {hm(nextEvent.ends_at)} · {Math.max(0, Math.round((+new Date(nextEvent.starts_at) - Date.now()) / 60000))} min away</Txt></Card> : null}
        {events.length === 0 ? <Empty icon="calendar-clear-outline" text="Nothing scheduled. That's free time." /> :
          <Card>{events.map((e) => (
            <Row key={e.id} style={{ paddingVertical: 4 }}>
              <Txt size={13} muted style={{ width: 64 }}>{e.all_day ? 'All day' : hm(e.starts_at)}</Txt>
              <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: e.kind === 'break' ? t.colors.success : e.kind === 'meal' ? t.colors.accent : t.colors.primary }} />
              <Pressable style={{ flex: 1 }} onPress={() => setEventSheet({ open: true, event: e })}>
                <Txt style={{ textDecorationLine: e.done ? 'line-through' : 'none' }}>{e.title}</Txt>
                <Txt size={12} muted>{Math.round((+new Date(e.ends_at) - +new Date(e.starts_at)) / 60000)} min · {e.kind.replace('_', ' ')}</Txt>
              </Pressable>
              <Check done={e.done} label={e.title} onPress={() => db.update('events', e.id, { done: !e.done })} />
            </Row>
          ))}</Card>}
        <Row wrap>
          <Chip icon="cafe-outline" label="Add break" onPress={() => void db.insert('events', { title: 'Break', kind: 'break', starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 15 * 60000).toISOString(), done: false })} />
          <Chip icon="bed-outline" label="Make today a rest day" onPress={() => void db.insert('day_flags', { date: today, kind: 'rest' })} />
        </Row>
      </Section>
    ),
    tasks: (
      <Section title="Tasks" action={{ label: 'All', onPress: () => router.push('/plan/tasks') }}>
        {tasks.length === 0 ? <Empty icon="checkmark-done-outline" text="No tasks due today." action={{ label: 'Add one', onPress: () => setTaskSheet({ open: true }) }} /> :
          <Card>{tasks.map((x) => {
            const overdue = x.status === 'todo' && x.due_date! < today;
            return (
              <Row key={x.id} style={{ paddingVertical: 4 }}>
                <Check done={x.status === 'done'} label={x.title} onPress={() => toggleTask(x)} />
                <Pressable style={{ flex: 1 }} onPress={() => setTaskSheet({ open: true, task: x })}>
                  <Txt style={{ textDecorationLine: x.status === 'done' ? 'line-through' : 'none' }}>{x.title}</Txt>
                  <Row gap={6}>{x.estimate_min ? <Txt size={12} muted>~{x.estimate_min} min</Txt> : null}{x.priority === 'high' || x.priority === 'urgent' ? <Pill label={x.priority} tone="warning" /> : null}</Row>
                </Pressable>
                {overdue ? <Chip label="Missed?" onPress={() => setMissed(x)} /> : null}
              </Row>
            );
          })}</Card>}
      </Section>
    ),
    meals: prefs.modules.food ? (
      <Section title="Meals" action={{ label: 'Plan', onPress: () => router.push('/track/meals') }}>
        <Row wrap>{SLOTS.map((s) => {
          const m = meals.find((x) => x.slot === s);
          return <Chip key={s} icon={m?.completed ? 'checkmark-circle' : m ? 'ellipse-outline' : 'remove-outline'}
            label={`${s[0].toUpperCase() + s.slice(1)}${m ? `: ${m.title}` : ''}`} selected={!!m?.completed}
            onPress={() => router.push(m ? '/track/meals' : '/track/food')} />;
        })}</Row>
      </Section>
    ) : null,
    water: prefs.modules.water ? (
      <Section title="Water" action={{ label: 'Details', onPress: () => router.push('/track/water') }}>
        <Card>
          <Row><Txt weight="600" style={{ flex: 1 }}>{waterTotal} / {prefs.water_goal_ml} ml</Txt>
            {[150, 250, 500].map((ml) => <Chip key={ml} label={`+${ml}`} onPress={() => void db.insert('water_logs', { amount_ml: ml, logged_at: new Date().toISOString() })} />)}</Row>
          <Progress value={waterTotal / Math.max(1, prefs.water_goal_ml)} />
        </Card>
      </Section>
    ) : null,
    meds: prefs.modules.meds && todaysMeds.length ? (
      <Section title="Medication" action={{ label: 'Manage', onPress: () => router.push('/track/meds') }}>
        <Card>{todaysMeds.map((m) => (
          <Row key={m.med.id + m.time}>
            <Txt size={13} muted style={{ width: 48 }}>{m.time}</Txt>
            <Txt style={{ flex: 1 }}>{m.med.name}{m.med.dosage ? ` · ${m.med.dosage}` : ''}</Txt>
            {m.log ? <Pill label={m.log.status} tone={m.log.status === 'taken' ? 'success' : 'neutral'} /> : null}
            <Chip label="Taken" selected={m.log?.status === 'taken'} onPress={() => void logMed(m, 'taken')} />
            <Chip label="Skip" selected={m.log?.status === 'skipped'} onPress={() => void logMed(m, 'skipped')} />
          </Row>
        ))}</Card>
      </Section>
    ) : null,
    payments: prefs.modules.money && bills.length ? (
      <Section title="Upcoming payments" action={{ label: 'Bills', onPress: () => router.push('/money/recurring') }}>
        <Card>{bills.map((b) => (
          <Row key={b.id}><Txt style={{ flex: 1 }}>{b.name}</Txt>
            <Txt size={13} muted>{b.next_due === today ? 'today' : format(new Date(b.next_due + 'T12:00'), 'EEE d')}</Txt>
            <Txt weight="600">{formatMoney(b.amount, b.currency)}</Txt></Row>
        ))}</Card>
      </Section>
    ) : null,
    habits: prefs.modules.habits && todaysHabits.length ? (
      <Section title="Habits" action={{ label: 'All', onPress: () => router.push('/track/habits') }}>
        <Row wrap>{todaysHabits.map((h) => <Chip key={h.id} label={h.name} icon={habitLogs.some((l) => l.habit_id === h.id) ? 'checkmark' : undefined}
          selected={habitLogs.some((l) => l.habit_id === h.id)} onPress={() => void toggleHabit(h.id)} />)}</Row>
      </Section>
    ) : null,
    progress: (
      <Section title="Today so far">
        <Card tone="alt">
          <Txt size={13} muted>A snapshot, not a score.</Txt>
          <Row wrap gap={14}>
            <Txt>✓ {tasks.filter((x) => x.status === 'done').length} tasks</Txt>
            <Txt>◷ {events.filter((e) => e.done).length} activities</Txt>
            <Txt>♡ {habitLogs.length} habits</Txt>
            <Txt>⏱ {focus.reduce((s, f) => s + f.minutes, 0)} min focus</Txt>
          </Row>
        </Card>
      </Section>
    ),
  };

  return (
    <Screen>
      <Row>
        <View style={{ flex: 1 }}>
          <Txt muted>{format(new Date(), 'EEEE, MMMM d')}</Txt>
          <Title>{greeting(profile?.display_name)}</Title>
        </View>
        <IconButton icon="options-outline" label="Customize dashboard" onPress={() => setCustomize(true)} />
      </Row>

      {away >= 3 && !restartDismissed ? (
        <Card tone="soft">
          <Txt heading size={17}>Welcome back ♡</Txt>
          <Txt>Nothing to catch up on. Want to start small? Pick one thing for today, or let the planner make a light plan.</Txt>
          <Row wrap><Button small label="Light plan for today" onPress={() => router.push({ pathname: '/plan/planner-ai', params: { preset: 'restart' } })} />
            <Button small kind="ghost" label="Not now" onPress={() => setRestartDismissed(true)} /></Row>
        </Card>
      ) : null}

      <Card>
        <Txt size={13} muted>How's your energy?</Txt>
        <Row wrap>{(['very_low', 'low', 'medium', 'high'] as const).map((l) => (
          <Chip key={l} label={l.replace('_', ' ')} selected={energy?.level === l}
            onPress={() => energy ? db.update('energy_logs', energy.id, { level: l }) : db.insert('energy_logs', { date: today, level: l })} />
        ))}</Row>
      </Card>

      <Button icon="sparkles" label="Reorganize my day" onPress={() => router.push({ pathname: '/plan/planner-ai', params: { preset: 'reorganize' } })} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {quick.map((q) => <Chip key={q.label} icon={q.icon} label={q.label} onPress={q.onPress} />)}
      </View>

      {prefs.dashboard_layout.map((s) => <React.Fragment key={s}>{sections[s]}</React.Fragment>)}

      <TaskSheet visible={taskSheet.open} task={taskSheet.task} defaults={{ due_date: today }} onClose={() => setTaskSheet({ open: false })} />
      <EventSheet visible={eventSheet.open} event={eventSheet.event} onClose={() => setEventSheet({ open: false })} />
      <RescheduleSheet task={missed} onClose={() => setMissed(null)} />
      <CustomizeSheet visible={customize} onClose={() => setCustomize(false)} layout={prefs.dashboard_layout} onSave={(l) => setPrefs({ dashboard_layout: l })} />
      <MinimumDaySheet visible={minEdit} onClose={() => setMinEdit(false)} existing={minDay} date={today} />
    </Screen>
  );
}

function CustomizeSheet({ visible, onClose, layout, onSave }: { visible: boolean; onClose: () => void; layout: DashboardSection[]; onSave: (l: DashboardSection[]) => void }) {
  const [l, setL] = useState(layout);
  React.useEffect(() => { if (visible) setL(layout); }, [visible, layout]);
  const move = (i: number, d: -1 | 1) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setL(n); };
  return (
    <Sheet visible={visible} onClose={onClose} title="Customize Today">
      <Txt muted size={13}>Reorder or hide sections. Hidden ones are listed below.</Txt>
      {l.map((s, i) => (
        <Card key={s}><Row><Txt style={{ flex: 1 }}>{SECTION_LABEL[s]}</Txt>
          <IconButton icon="arrow-up" label="Move up" onPress={() => move(i, -1)} />
          <IconButton icon="arrow-down" label="Move down" onPress={() => move(i, 1)} />
          <IconButton icon="eye-off-outline" label="Hide" onPress={() => setL(l.filter((x) => x !== s))} /></Row></Card>
      ))}
      <Row wrap>{ALL_SECTIONS.filter((s) => !l.includes(s)).map((s) => <Chip key={s} icon="add" label={SECTION_LABEL[s]} onPress={() => setL([...l, s])} />)}</Row>
      <Button label="Save layout" onPress={() => { onSave(l); onClose(); }} />
    </Sheet>
  );
}

function MinimumDaySheet({ visible, onClose, existing, date }: { visible: boolean; onClose: () => void; existing?: { id: string; items: { label: string; done: boolean }[] }; date: string }) {
  const presets = ['Eat meals', 'Take my medication', 'Drink water', 'Attend my appointment', 'One essential task', 'Shower', 'Rest'];
  const [items, setItems] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  React.useEffect(() => { if (visible) setItems(existing?.items.map((i) => i.label) ?? []); }, [visible, existing]);
  const toggle = (s: string) => setItems((x) => x.includes(s) ? x.filter((y) => y !== s) : [...x, s]);
  const save = async () => {
    const rows = items.map((label) => ({ label, done: existing?.items.find((i) => i.label === label)?.done ?? false }));
    if (existing) await db.update('minimum_days', existing.id, { items: rows }); else await db.insert('minimum_days', { date, items: rows });
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Minimum day">
      <Txt muted>Pick the few things that matter most today.</Txt>
      <Row wrap>{[...new Set([...presets, ...items])].map((p) => <Chip key={p} label={p} selected={items.includes(p)} onPress={() => toggle(p)} />)}</Row>
      <Row><View style={{ flex: 1 }}><Field value={custom} onChangeText={setCustom} placeholder="Something else" /></View>
        <Button small kind="secondary" label="Add" onPress={() => { if (custom.trim()) { setItems([...items, custom.trim()]); setCustom(''); } }} /></Row>
      <Button label="Save" onPress={save} />
      {existing ? <Button kind="ghost" label="Turn off minimum day" onPress={() => { void db.remove('minimum_days', existing.id); onClose(); }} /> : null}
    </Sheet>
  );
}

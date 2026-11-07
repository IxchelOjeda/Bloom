import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, endOfYear, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { Stack, router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRows } from '@/lib/db';
import { hm, ymd } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { EventRow, EventSheet, Task, TaskSheet } from '@/components/sheets';
import { Button, Card, Chip, IconButton, Pill, Row, Screen, Segmented, Txt } from '@/components/ui';

type Mode = 'week' | 'month' | 'year';

export default function Calendar() {
  const t = useTheme();
  const { profile } = usePreferences();
  const ws = (profile?.week_start ?? 1) as 0 | 1;
  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [eventSheet, setEventSheet] = useState<{ open: boolean; event?: EventRow | null; date?: Date }>({ open: false });
  const [taskSheet, setTaskSheet] = useState<{ open: boolean; task?: Task | null }>({ open: false });

  const range = useMemo(() => {
    if (mode === 'week') return { from: startOfWeek(anchor, { weekStartsOn: ws }), to: endOfWeek(anchor, { weekStartsOn: ws }) };
    if (mode === 'month') return { from: startOfWeek(startOfMonth(anchor), { weekStartsOn: ws }), to: endOfWeek(endOfMonth(anchor), { weekStartsOn: ws }) };
    return { from: startOfYear(anchor), to: endOfYear(anchor) };
  }, [mode, anchor, ws]);
  const key = `${ymd(range.from)}_${ymd(range.to)}`;

  const events = useRows<EventRow>('events', `events:${key}`, (q) => q.select('*').gte('starts_at', range.from.toISOString()).lte('starts_at', range.to.toISOString()).order('starts_at'),
    (e) => new Date(e.starts_at) >= range.from && new Date(e.starts_at) <= range.to).rows;
  const tasks = useRows<Task>('tasks', `tasks:due:${key}`, (q) => q.select('*').is('parent_id', null).eq('status', 'todo').gte('due_date', ymd(range.from)).lte('due_date', ymd(range.to)),
    (x) => !x.parent_id && x.status === 'todo' && !!x.due_date && x.due_date >= ymd(range.from) && x.due_date <= ymd(range.to)).rows;
  const flags = useRows<{ id: string; date: string; kind: string }>('day_flags', `flags:${key}`, (q) => q.select('*').gte('date', ymd(range.from)).lte('date', ymd(range.to))).rows;
  const meals = useRows<{ id: string; date: string; slot: string; title: string }>('meal_plans', `meals:${key}`, (q) => q.select('id,date,slot,title').gte('date', ymd(range.from)).lte('date', ymd(range.to))).rows;
  const goals = useRows<{ id: string; title: string; target_date: string | null; current_value: number; target_value: number | null; horizon: string }>('goals', `goals:year:${anchor.getFullYear()}`,
    (q) => q.select('*').in('horizon', ['annual', 'long', 'monthly'])).rows;

  const shift = (d: number) => setAnchor((a) => mode === 'week' ? addWeeks(a, d) : mode === 'month' ? addMonths(a, d) : new Date(a.getFullYear() + d, 0, 1));
  const forDay = (d: Date) => ({
    events: events.filter((e) => isSameDay(new Date(e.starts_at), d)),
    tasks: tasks.filter((x) => x.due_date === ymd(d)),
    meals: meals.filter((m) => m.date === ymd(d)),
    flag: flags.find((f) => f.date === ymd(d)),
  });

  const DayList = ({ d }: { d: Date }) => {
    const x = forDay(d);
    return (
      <Card style={{ backgroundColor: x.flag ? t.colors.calRest : t.colors.surface }}>
        <Row><Txt weight="600" style={{ flex: 1 }}>{format(d, 'EEEE d MMM')}</Txt>{x.flag ? <Pill label={x.flag.kind.replace('_', ' ')} tone="success" /> : null}
          <IconButton icon="add" label="Add to this day" onPress={() => { const s = new Date(d); s.setHours(9, 0, 0, 0); setEventSheet({ open: true, date: s }); }} /></Row>
        {x.events.map((e) => (
          <Pressable key={e.id} onPress={() => setEventSheet({ open: true, event: e })}>
            <Txt><Txt muted size={13}>{e.all_day ? 'All day' : hm(e.starts_at)}  </Txt>{e.title}{e.done ? ' ✓' : ''}</Txt>
          </Pressable>
        ))}
        {x.tasks.map((k) => <Pressable key={k.id} onPress={() => setTaskSheet({ open: true, task: k })}><Txt>○ {k.title} <Txt size={12} muted>task</Txt></Txt></Pressable>)}
        {x.meals.map((m) => <Txt key={m.id} muted size={13}>🍽 {m.slot}: {m.title}</Txt>)}
        {!x.events.length && !x.tasks.length && !x.meals.length ? <Txt muted size={13}>Free</Txt> : null}
      </Card>
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Calendar' }} />
      <Segmented value={mode} onChange={setMode} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
      <Row>
        <IconButton icon="chevron-back" label="Previous" onPress={() => shift(-1)} />
        <Txt heading size={18} style={{ flex: 1, textAlign: 'center' }}>
          {mode === 'week' ? `${format(range.from, 'MMM d')} – ${format(range.to, 'MMM d')}` : mode === 'month' ? format(anchor, 'MMMM yyyy') : format(anchor, 'yyyy')}
        </Txt>
        <IconButton icon="chevron-forward" label="Next" onPress={() => shift(1)} />
      </Row>
      <Chip label="Today" onPress={() => { setAnchor(new Date()); setSelected(new Date()); }} />

      {mode === 'week' && eachDayOfInterval({ start: range.from, end: range.to }).map((d) => <DayList key={ymd(d)} d={d} />)}

      {mode === 'month' && (<>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {eachDayOfInterval({ start: range.from, end: range.to }).map((d) => {
            const x = forDay(d); const isToday = isSameDay(d, new Date()); const sel = isSameDay(d, selected);
            const count = x.events.length + x.tasks.length;
            return (
              <Pressable key={ymd(d)} onPress={() => setSelected(d)} accessibilityLabel={`${format(d, 'MMMM d')}, ${count} items`}
                style={{ width: `${100 / 7}%`, aspectRatio: 0.9, padding: 2 }}>
                <View style={{ flex: 1, borderRadius: t.radius.sm, alignItems: 'center', paddingTop: 4, gap: 3,
                  backgroundColor: isToday ? t.colors.calToday : x.flag ? t.colors.calRest : sel ? t.colors.primarySoft : 'transparent',
                  borderWidth: sel ? 1 : 0, borderColor: t.colors.primary, opacity: isSameMonth(d, anchor) ? 1 : 0.4 }}>
                  <Txt size={13} weight={isToday ? '700' : '400'} color={isToday ? t.colors.calTodayText : undefined}>{format(d, 'd')}</Txt>
                  <Row gap={2}>{Array.from({ length: Math.min(3, count) }).map((_, i) =>
                    <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isToday ? t.colors.calTodayText : t.colors.accent }} />)}</Row>
                </View>
              </Pressable>
            );
          })}
        </View>
        <DayList d={selected} />
      </>)}

      {mode === 'year' && (<>
        <Txt heading size={17}>Goals for {anchor.getFullYear()}</Txt>
        {goals.filter((g) => !g.target_date || g.target_date.startsWith(String(anchor.getFullYear()))).map((g) => (
          <Card key={g.id} onPress={() => router.push('/plan/goals')}>
            <Row><Txt weight="600" style={{ flex: 1 }}>{g.title}</Txt><Pill label={g.horizon} /></Row>
            {g.target_value ? <Txt size={13} muted>{g.current_value} / {g.target_value}{g.target_date ? ` · by ${g.target_date}` : ''}</Txt> : null}
          </Card>
        ))}
        <Button kind="secondary" icon="flag-outline" label="Add an annual goal" onPress={() => router.push('/plan/goals')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: 12 }, (_, m) => {
            const start = new Date(anchor.getFullYear(), m, 1);
            const n = events.filter((e) => new Date(e.starts_at).getMonth() === m).length + tasks.filter((x) => Number(x.due_date!.slice(5, 7)) - 1 === m).length;
            return (
              <Card key={m} onPress={() => { setAnchor(start); setSelected(start); setMode('month'); }} style={{ flexBasis: '30%', flexGrow: 1 }}>
                <Txt weight="600">{format(start, 'MMM')}</Txt>
                <Txt size={12} muted>{n} planned</Txt>
              </Card>
            );
          })}
        </View>
        <Button kind="ghost" label="Monthly objectives & yearly plan" onPress={() => router.push('/plan/periods')} />
      </>)}

      <EventSheet visible={eventSheet.open} event={eventSheet.event} date={eventSheet.date} onClose={() => setEventSheet({ open: false })} />
      <TaskSheet visible={taskSheet.open} task={taskSheet.task} onClose={() => setTaskSheet({ open: false })} />
    </Screen>
  );
}

import { Stack, router } from 'expo-router';
import { addDays, format, startOfMonth, startOfWeek, startOfYear, subDays } from 'date-fns';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { db, useRows } from '@/lib/db';
import { ymd } from '@/lib/dates';
import { formatMoney, monthSummary } from '@/lib/finance';
import { usePreferences } from '@/lib/preferences';
import { Button, Card, Check, Field, Row, Screen, Section, Segmented, Txt } from '@/components/ui';

type Period = 'week' | 'month' | 'year';
interface PlanRow { id: string; period: Period; starts_on: string; priorities: { text: string; done: boolean }[]; objectives: { text: string; done: boolean }[]; reflection: string | null }

/** Weekly reset, monthly review and yearly plan in one place. */
export default function Periods() {
  const { profile } = usePreferences();
  const [period, setPeriod] = useState<Period>('week');
  const ws = (profile?.week_start ?? 1) as 0 | 1;
  const start = period === 'week' ? startOfWeek(new Date(), { weekStartsOn: ws }) : period === 'month' ? startOfMonth(new Date()) : startOfYear(new Date());
  const prevStart = period === 'week' ? subDays(start, 7) : period === 'month' ? startOfMonth(subDays(start, 1)) : new Date(start.getFullYear() - 1, 0, 1);
  const key = `${period}:${ymd(start)}`;

  const plan = useRows<PlanRow>('period_plans', `period:${key}`, (q) => q.select('*').eq('period', period).eq('starts_on', ymd(start))).rows[0];
  const done = useRows<{ id: string; title: string; completed_at: string }>('tasks', `tasks:done:${ymd(prevStart)}`,
    (q) => q.select('id,title,completed_at').eq('status', 'done').gte('completed_at', prevStart.toISOString()).lt('completed_at', start.toISOString())).rows;
  const open = useRows<{ id: string; title: string; due_date: string }>('tasks', `tasks:openbefore:${ymd(start)}`,
    (q) => q.select('id,title,due_date').eq('status', 'todo').lt('due_date', ymd(start))).rows;
  const upcoming = useRows<{ id: string; title: string; due_date: string }>('tasks', `tasks:upcoming:${ymd(start)}`,
    (q) => q.select('id,title,due_date').eq('status', 'todo').gte('due_date', ymd(start)).lte('due_date', ymd(addDays(start, period === 'week' ? 7 : 31))).order('due_date')).rows;
  const goals = useRows<{ id: string; title: string; current_value: number; target_value: number | null; start_value: number }>('goals', 'goals:open:full', (q) => q.select('*').is('completed_at', null)).rows;
  const tx = useRows<{ id: string; kind: any; amount: number; occurred_on: string }>('transactions', `tx:${ymd(prevStart)}`, (q) => q.select('id,kind,amount,occurred_on').gte('occurred_on', ymd(prevStart))).rows;
  const habitLogs = useRows<{ id: string }>('habit_logs', `habitlogs:since:${ymd(prevStart)}`, (q) => q.select('id').gte('date', ymd(prevStart)).lt('date', ymd(start))).rows;

  const [item, setItem] = useState('');
  const [reflection, setReflection] = useState('');
  useEffect(() => setReflection(plan?.reflection ?? ''), [plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = plan?.priorities ?? [];
  const save = async (patch: Partial<PlanRow>) =>
    plan ? db.update('period_plans', plan.id, patch) : db.insert('period_plans', { period, starts_on: ymd(start), priorities: [], objectives: [], ...patch });
  const prevMonth = format(prevStart, 'yyyy-MM');
  const money = monthSummary(tx, period === 'month' ? prevMonth : format(new Date(), 'yyyy-MM'));

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Reviews & planning' }} />
      <Segmented value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Weekly reset' }, { value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />

      <Section title={`Looking back · ${period === 'week' ? 'last week' : period === 'month' ? format(prevStart, 'MMMM') : prevStart.getFullYear()}`}>
        <Card tone="soft">
          <Txt>✓ {done.length} things done · ♡ {habitLogs.length} habit check-ins</Txt>
          {done.slice(0, 6).map((d) => <Txt key={d.id} size={13} muted>• {d.title}</Txt>)}
          {period !== 'year' ? <Txt size={13}>Money: spent {formatMoney(money.expenses, profile?.currency ?? 'USD')}, saved {formatMoney(money.saved, profile?.currency ?? 'USD')}</Txt> : null}
        </Card>
        {open.length ? <Card><Txt weight="600">Still open ({open.length}) — keep, move or let go</Txt>
          {open.slice(0, 8).map((x) => <Row key={x.id}><Txt style={{ flex: 1 }}>{x.title}</Txt>
            <Button small kind="ghost" label="This week" onPress={() => db.update('tasks', x.id, { due_date: ymd(start) })} />
            <Button small kind="ghost" label="Let go" onPress={() => db.update('tasks', x.id, { status: 'not_relevant' })} /></Row>)}
        </Card> : null}
      </Section>

      <Section title="Goals">
        {goals.slice(0, 6).map((g) => <Card key={g.id}><Txt>{g.title}</Txt>{g.target_value != null ? <Txt size={13} muted>{g.current_value}/{g.target_value}</Txt> : null}</Card>)}
      </Section>

      <Section title={period === 'week' ? 'Priorities this week' : period === 'month' ? `Objectives for ${format(start, 'MMMM')}` : `Big goals for ${start.getFullYear()}`}>
        <Card>
          {list.map((p, i) => <Row key={i}><Check done={p.done} label={p.text} onPress={() => save({ priorities: list.map((x, j) => j === i ? { ...x, done: !x.done } : x) })} />
            <Txt style={{ flex: 1 }}>{p.text}</Txt><Button small kind="ghost" label="✕" onPress={() => save({ priorities: list.filter((_, j) => j !== i) })} /></Row>)}
          <Row><View style={{ flex: 1 }}><Field value={item} onChangeText={setItem} placeholder={period === 'week' ? 'Top 3 is plenty' : 'Add one'} /></View>
            <Button small kind="secondary" label="Add" onPress={() => { if (item.trim()) { void save({ priorities: [...list, { text: item.trim(), done: false }] }); setItem(''); } }} /></Row>
        </Card>
        {upcoming.length ? <Card><Txt weight="600">Coming up</Txt>{upcoming.map((u) => <Txt key={u.id} size={13}>{u.due_date} · {u.title}</Txt>)}</Card> : null}
        <Row wrap>
          <Button small kind="secondary" label="Plan meals" onPress={() => router.push('/track/meals')} />
          <Button small kind="secondary" label="Rest days" onPress={() => router.push('/plan/availability')} />
          <Button small kind="secondary" label="Schedule with AI" onPress={() => router.push('/plan/planner-ai')} />
        </Row>
      </Section>

      <Section title="Reflection (optional)">
        <Field multiline value={reflection} onChangeText={setReflection} placeholder="What felt good? What would make next time easier?" />
        <Button kind="secondary" label="Save reflection" onPress={() => save({ reflection })} />
      </Section>
    </Screen>
  );
}

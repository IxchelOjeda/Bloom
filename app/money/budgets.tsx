import { Stack } from 'expo-router';
import { format } from 'date-fns';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { db, useRows } from '@/lib/db';
import { formatMoney } from '@/lib/finance';
import { usePreferences } from '@/lib/preferences';
import { WEEKDAY_SHORT, ymd } from '@/lib/dates';
import { Button, Card, Chip, Field, Progress, Row, Screen, Section, Txt } from '@/components/ui';

export default function Budgets() {
  const { profile } = usePreferences();
  const cur = profile?.currency ?? 'USD';
  const f = (n: number) => formatMoney(n, cur);
  const month = format(new Date(), 'yyyy-MM-01');
  const limits = useRows<{ id: string; weekday: number | null; date: string | null; amount: number }>('daily_limits', 'limits:all', (q) => q.select('*')).rows;
  const budgets = useRows<{ id: string; category_id: string; amount: number; month: string }>('budgets', `budgets:${month}`, (q) => q.select('*').eq('month', month)).rows;
  const cats = useRows<{ id: string; name: string }>('expense_categories', 'expcats:all', (q) => q.select('id,name').order('name')).rows;
  const spent = useRows<{ id: string; amount: number; category_id: string | null; occurred_on: string }>('transactions', `tx:month:${month}`,
    (q) => q.select('id,amount,category_id,occurred_on').eq('kind', 'expense').gte('occurred_on', month)).rows;
  const [wd, setWd] = useState<number>(new Date().getDay());
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [bAmt, setBAmt] = useState('');

  const weekTotal = WEEKDAY_SHORT.reduce((s, _, i) => s + Number(limits.find((l) => l.weekday === i)?.amount ?? 0), 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Budgets & limits' }} />
      <Section title="Daily spending limits">
        <Txt size={13} muted>Different days can have different limits — e.g. more on Fridays.</Txt>
        <Card>{WEEKDAY_SHORT.map((d, i) => {
          const l = limits.find((x) => x.weekday === i);
          return <Row key={d}><Txt style={{ width: 44 }}>{d}</Txt><Txt style={{ flex: 1 }}>{l ? f(Number(l.amount)) : '—'}</Txt>{l ? <Chip label="✕" onPress={() => db.remove('daily_limits', l.id)} /> : null}</Row>;
        })}<Txt size={13} muted>Week total: {f(weekTotal)} · ~{f(weekTotal * 4.35)}/month</Txt></Card>
        <Row wrap>{WEEKDAY_SHORT.map((d, i) => <Chip key={d} label={d} selected={wd === i} onPress={() => setWd(i)} />)}</Row>
        <Row><View style={{ flex: 1 }}><Field value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="Limit" /></View>
          <Button small kind="secondary" label="Set" onPress={async () => {
            const n = Number(amt); if (!(n >= 0) || amt === '') return;
            const l = limits.find((x) => x.weekday === wd);
            if (l) await db.update('daily_limits', l.id, { amount: n }); else await db.insert('daily_limits', { weekday: wd, amount: n });
            setAmt('');
          }} /></Row>
        <Txt size={13} muted>One-off override for a specific date (e.g. a birthday):</Txt>
        <Row><View style={{ flex: 1 }}><Field value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" /></View>
          <Button small kind="ghost" label="Use limit above" onPress={async () => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(Number(amt) >= 0) || amt === '') return Alert.alert('Enter a date and a limit');
            await db.insert('daily_limits', { date, amount: Number(amt) }); setDate(''); setAmt('');
          }} /></Row>
        {limits.filter((l) => l.date && l.date >= ymd(new Date())).map((l) => <Row key={l.id}><Txt style={{ flex: 1 }}>{l.date}</Txt><Txt>{f(Number(l.amount))}</Txt><Chip label="✕" onPress={() => db.remove('daily_limits', l.id)} /></Row>)}
      </Section>

      <Section title={`Category budgets · ${format(new Date(), 'MMMM')}`}>
        {budgets.map((b) => {
          const used = spent.filter((s) => s.category_id === b.category_id).reduce((s, x) => s + Number(x.amount), 0);
          return (
            <Card key={b.id}><Row><Txt style={{ flex: 1 }}>{cats.find((c) => c.id === b.category_id)?.name ?? 'Category'}</Txt><Txt size={13}>{f(used)} / {f(Number(b.amount))}</Txt>
              <Chip label="✕" onPress={() => db.remove('budgets', b.id)} /></Row><Progress value={used / Math.max(1, Number(b.amount))} /></Card>
          );
        })}
        <Row wrap>{cats.map((c) => <Chip key={c.id} label={c.name} selected={cat === c.id} onPress={() => setCat(c.id)} />)}</Row>
        <Row><View style={{ flex: 1 }}><Field value={bAmt} onChangeText={setBAmt} keyboardType="decimal-pad" placeholder="Monthly budget" /></View>
          <Button small kind="secondary" label="Save" onPress={async () => {
            if (!cat || !(Number(bAmt) >= 0) || bAmt === '') return;
            const ex = budgets.find((b) => b.category_id === cat);
            if (ex) await db.update('budgets', ex.id, { amount: Number(bAmt) }); else await db.insert('budgets', { category_id: cat, month, amount: Number(bAmt) });
            setBAmt('');
          }} /></Row>
      </Section>
    </Screen>
  );
}

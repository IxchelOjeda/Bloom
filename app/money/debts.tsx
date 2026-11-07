import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Collection } from '@/components/Collection';
import { db, useRows } from '@/lib/db';
import { debtPayoff, formatMoney } from '@/lib/finance';
import { usePreferences } from '@/lib/preferences';
import { ymd } from '@/lib/dates';
import { Button, Field, Progress, Row, Txt } from '@/components/ui';

interface Debt { id: string; name: string; kind: string; original_amount: number; remaining: number; currency: string; apr: number | null; min_payment: number | null; frequency: string; due_day: number | null; notes: string | null }

function Extras({ d }: { d: Debt }) {
  const [amt, setAmt] = useState(d.min_payment ? String(d.min_payment) : '');
  const [plan, setPlan] = useState('');
  const payments = useRows<{ id: string; amount: number; occurred_on: string }>('transactions', `debtpay:${d.id}`,
    (q) => q.select('id,amount,occurred_on').eq('debt_id', d.id).order('occurred_on', { ascending: false }).limit(5)).rows;
  const f = (n: number) => formatMoney(n, d.currency);
  const payoff = d.min_payment ? debtPayoff(Number(d.remaining), d.apr, Number(d.min_payment)) : null;
  const custom = Number(plan) > 0 ? debtPayoff(Number(d.remaining), d.apr, Number(plan)) : null;
  return (
    <View style={{ gap: 6 }}>
      <Progress value={1 - d.remaining / Math.max(1, d.original_amount)} />
      <Txt size={13} muted>{f(Number(d.remaining))} left of {f(Number(d.original_amount))}{d.apr ? ` · ${d.apr}% APR` : ''}</Txt>
      {payoff ? <Txt size={13}>At the minimum: about {payoff.months} months{payoff.totalInterest ? `, ~${f(payoff.totalInterest)} interest` : ''}</Txt>
        : d.min_payment ? <Txt size={13}>The minimum doesn't cover the interest — the balance would grow.</Txt> : null}
      <Row><View style={{ flex: 1 }}><Field value={plan} onChangeText={setPlan} keyboardType="decimal-pad" placeholder="Try a monthly payment" /></View></Row>
      {custom ? <Txt size={13}>Paying {f(Number(plan))}/month: ~{custom.months} months, ~{f(custom.totalInterest)} interest</Txt> : Number(plan) > 0 ? <Txt size={13}>That doesn't cover the interest.</Txt> : null}
      <Row><View style={{ flex: 1 }}><Field value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="Payment amount" /></View>
        <Button small kind="secondary" label="Log payment" onPress={async () => { const n = Number(amt); if (n > 0) await db.insert('transactions', { kind: 'debt_payment', amount: n, currency: d.currency, debt_id: d.id, description: `Payment: ${d.name}`, occurred_on: ymd(new Date()) }); }} /></Row>
      {payments.map((p) => <Row key={p.id}><Txt size={12} muted style={{ flex: 1 }}>{p.occurred_on} · {f(Number(p.amount))}</Txt>
        <Button small kind="ghost" label="Undo" onPress={() => db.remove('transactions', p.id)} /></Row>)}
    </View>
  );
}

export default function Debts() {
  const { profile } = usePreferences();
  return (
    <>
      <Stack.Screen options={{ title: 'Debts' }} />
      <Collection<Debt>
        table="debts" title="Debts" icon="trending-down-outline" subtitle="Seeing it clearly is the first step. You're doing it."
        emptyText="Credit cards, student loans, money owed to friends or family."
        fields={[
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'kind', label: 'Type', type: 'select', options: [['credit_card', 'Credit card'], ['student', 'Student loan'], ['personal', 'Personal loan'], ['friend', 'Friend'], ['family', 'Family'], ['custom', 'Other']].map(([value, label]) => ({ value, label })) },
          { key: 'original_amount', label: 'Original amount', type: 'money', required: true, min: 0 },
          { key: 'remaining', label: 'Remaining balance', type: 'money', required: true, min: 0 },
          { key: 'apr', label: 'Interest rate % per year (if any)', type: 'number', min: 0 },
          { key: 'min_payment', label: 'Minimum payment', type: 'money', min: 0 },
          { key: 'frequency', label: 'Payment frequency', type: 'select', options: [['monthly', 'Monthly'], ['biweekly', 'Every 2 weeks'], ['weekly', 'Weekly'], ['custom', 'Flexible']].map(([value, label]) => ({ value, label })) },
          { key: 'due_day', label: 'Due day of month', type: 'number', min: 1 },
          { key: 'notes', label: 'Notes / payment plan', type: 'multiline' },
        ]}
        defaults={{ kind: 'custom', frequency: 'monthly', currency: profile?.currency ?? 'USD' }}
        itemTitle={(d) => d.name}
        itemSub={(d) => [d.kind.replace('_', ' '), d.due_day && `due on the ${d.due_day}`].filter(Boolean).join(' · ')}
        itemExtra={(d) => <Extras d={d} />}
      />
    </>
  );
}

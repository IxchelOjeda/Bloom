import { Stack } from 'expo-router';
import React from 'react';
import { Collection } from '@/components/Collection';
import { db, useRows } from '@/lib/db';
import { formatMoney, monthlyEquivalent } from '@/lib/finance';
import { usePreferences } from '@/lib/preferences';
import { ymd } from '@/lib/dates';
import { Button, Card, Txt } from '@/components/ui';

interface Income { id: string; name: string; amount: number; currency: string; frequency: any; next_pay_date: string | null; start_date: string | null; end_date: string | null }
const FREQ = [['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['twice_monthly', 'Twice a month'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annually', 'Yearly'], ['once', 'One-off'], ['custom', 'Irregular']];

export default function IncomeScreen() {
  const { profile } = usePreferences();
  const cur = profile?.currency ?? 'USD';
  const all = useRows<Income>('income_sources', 'income_sources:{}', (q) => q.select('*')).rows;
  const monthly = all.filter((i) => i.currency === cur).reduce((s, i) => s + monthlyEquivalent(Number(i.amount), i.frequency), 0);
  return (
    <>
      <Stack.Screen options={{ title: 'Income' }} />
      <Collection<Income>
        table="income_sources" title="Income" icon="cash-outline" subtitle="Jobs, freelancing, gifts — anything that comes in."
        emptyText="Add your main income and any extras."
        header={all.length ? <Card tone="soft"><Txt>About {formatMoney(monthly, cur)} / month on average</Txt></Card> : undefined}
        fields={[
          { key: 'name', label: 'Source', type: 'text', required: true },
          { key: 'amount', label: `Amount per payment (${cur})`, type: 'money', required: true, min: 0 },
          { key: 'frequency', label: 'How often', type: 'select', options: FREQ.map(([value, label]) => ({ value, label })), required: true },
          { key: 'next_pay_date', label: 'Next expected payment', type: 'date' },
          { key: 'start_date', label: 'Start date', type: 'date' },
          { key: 'end_date', label: 'End date (optional)', type: 'date' },
        ]}
        defaults={{ currency: cur, frequency: 'monthly' }}
        itemTitle={(i) => i.name}
        itemSub={(i) => [FREQ.find(([v]) => v === i.frequency)?.[1], i.next_pay_date && `next ${i.next_pay_date}`].filter(Boolean).join(' · ')}
        itemRight={(i) => <Txt weight="600">{formatMoney(Number(i.amount), i.currency)}</Txt>}
        itemExtra={(i) => <Button small kind="ghost" label="Mark received" onPress={() => db.insert('transactions', { kind: 'income', amount: i.amount, currency: i.currency, income_source_id: i.id, description: i.name, occurred_on: ymd(new Date()) })} />}
      />
    </>
  );
}

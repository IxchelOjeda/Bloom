import { Stack } from 'expo-router';
import React from 'react';
import { Collection } from '@/components/Collection';
import { db, useRows } from '@/lib/db';
import { formatMoney } from '@/lib/finance';
import { cancelFor, scheduleOnce } from '@/lib/notifications';
import { usePreferences } from '@/lib/preferences';
import { ymd } from '@/lib/dates';
import { Button, Pill, Row } from '@/components/ui';

interface Bill { id: string; name: string; amount: number; currency: string; frequency: string; next_due: string; category_id: string | null; reminder_days: number; active: boolean }

export default function Recurring() {
  const { prefs, profile } = usePreferences();
  const cats = useRows<{ id: string; name: string }>('expense_categories', 'expcats:all', (q) => q.select('id,name').order('name')).rows;
  const today = ymd(new Date());

  const remind = async (b: Bill) => {
    await cancelFor(b.id);
    if (!prefs.notifications.payments || !b.active) return;
    const at = new Date(`${b.next_due}T09:00:00`); at.setDate(at.getDate() - (b.reminder_days ?? 1));
    await scheduleOnce(prefs, 'payment', b.id, `${b.name} due ${b.reminder_days ? `in ${b.reminder_days} day(s)` : 'today'}`, formatMoney(Number(b.amount), b.currency), at);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Bills & subscriptions' }} />
      <Collection<Bill>
        table="recurring_payments" title="Bills & subscriptions" icon="calendar-number-outline" subtitle="Rent, phone, Spotify, gym — so nothing sneaks up."
        emptyText="Add rent, utilities, subscriptions or card payments."
        order={{ column: 'next_due', ascending: true }}
        fields={[
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'amount', label: 'Amount', type: 'money', required: true, min: 0 },
          { key: 'frequency', label: 'How often', type: 'select', required: true, options: [['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annually', 'Yearly']].map(([value, label]) => ({ value, label })) },
          { key: 'next_due', label: 'Next due date', type: 'date', required: true },
          { key: 'category_id', label: 'Category', type: 'select', options: cats.map((c) => ({ value: c.id, label: c.name })) },
          { key: 'reminder_days', label: 'Remind me this many days before', type: 'number', min: 0 },
          { key: 'active', label: 'Active', type: 'bool' },
        ]}
        defaults={{ frequency: 'monthly', currency: profile?.currency ?? 'USD', reminder_days: 1, active: true }}
        afterSave={remind}
        afterDelete={(b) => cancelFor(b.id)}
        itemTitle={(b) => b.name}
        itemSub={(b) => `${b.frequency} · next ${b.next_due}`}
        itemRight={(b) => <Row gap={6}>{b.next_due < today ? <Pill label="overdue" tone="warning" /> : null}{!b.active ? <Pill label="paused" /> : null}</Row>}
        itemExtra={(b) => b.active ? (
          // logs an expense; a DB trigger then moves next_due forward by one period
          <Button small kind="secondary" label={`Mark paid · ${formatMoney(Number(b.amount), b.currency)}`} onPress={async () => {
            await db.insert('transactions', { kind: 'expense', amount: b.amount, currency: b.currency, recurring_id: b.id, category_id: b.category_id, description: b.name, occurred_on: today });
          }} />
        ) : null}
      />
    </>
  );
}

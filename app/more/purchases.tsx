import { Stack, router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Collection } from '@/components/Collection';
import { db, useRows } from '@/lib/db';
import { formatMoney } from '@/lib/finance';
import { usePreferences } from '@/lib/preferences';
import { Button, Progress, Txt } from '@/components/ui';

interface Purchase { id: string; name: string; description: string | null; estimated_price: number | null; currency: string | null; url: string | null; target_date: string | null; savings_goal_id: string | null }

function Extras({ p }: { p: Purchase }) {
  const goal = useRows<{ id: string; current_amount: number; target_amount: number }>('savings_goals', `savings:${p.savings_goal_id ?? 'none'}`,
    (q) => q.select('*').eq('id', p.savings_goal_id ?? '00000000-0000-0000-0000-000000000000')).rows[0];
  const f = (n: number) => formatMoney(n, p.currency ?? 'USD');
  if (!goal) return (
    <Button small kind="secondary" label="Create a savings goal for this" onPress={async () => {
      if (!p.estimated_price) return;
      const g = await db.insert('savings_goals', { name: p.name, target_amount: p.estimated_price, currency: p.currency ?? 'USD', target_date: p.target_date, current_amount: 0 });
      await db.update('major_purchases', p.id, { savings_goal_id: g.id });
    }} disabled={!p.estimated_price} />
  );
  return (
    <View style={{ gap: 4 }}>
      <Progress value={goal.current_amount / goal.target_amount} />
      <Txt size={13} muted>{f(Number(goal.current_amount))} saved of {f(Number(goal.target_amount))}</Txt>
      <Button small kind="ghost" label="Add money in Savings" onPress={() => router.push('/money/savings')} />
    </View>
  );
}

export default function Purchases() {
  const { profile } = usePreferences();
  return (
    <>
      <Stack.Screen options={{ title: 'Big purchases' }} />
      <Collection<Purchase>
        table="major_purchases" title="Big purchases" icon="home-outline" subtitle="Linked to a savings goal so progress updates itself."
        emptyText="An apartment, a car, a computer, a big trip…"
        fields={[
          { key: 'name', label: 'What', type: 'text', required: true },
          { key: 'estimated_price', label: 'Estimated price', type: 'money', min: 0 },
          { key: 'target_date', label: 'Target date', type: 'date' },
          { key: 'url', label: 'Reference link', type: 'url' },
          { key: 'description', label: 'Description', type: 'multiline' },
        ]}
        defaults={{ currency: profile?.currency ?? 'USD' }}
        itemTitle={(p) => p.name}
        itemSub={(p) => [p.estimated_price != null && formatMoney(Number(p.estimated_price), p.currency ?? 'USD'), p.target_date && `by ${p.target_date}`].filter(Boolean).join(' · ')}
        itemExtra={(p) => <Extras p={p} />}
      />
    </>
  );
}

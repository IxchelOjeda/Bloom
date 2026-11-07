import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Collection } from '@/components/Collection';
import { db, useRows } from '@/lib/db';
import { formatMoney, savingsPace } from '@/lib/finance';
import { usePreferences } from '@/lib/preferences';
import { ymd } from '@/lib/dates';
import { Button, Chip, Field, Progress, Row, Txt } from '@/components/ui';

interface Goal { id: string; name: string; target_amount: number; current_amount: number; currency: string; target_date: string | null; contribution: number | null }

function Extras({ g }: { g: Goal }) {
  const [amt, setAmt] = useState('');
  const accounts = useRows<{ id: string; name: string }>('accounts', 'accounts:all', (q) => q.select('id,name')).rows;
  const [from, setFrom] = useState<string | null>(null);
  const pace = savingsPace(Number(g.target_amount), Number(g.current_amount), g.target_date ? new Date(g.target_date + 'T12:00') : null);
  const f = (n: number) => formatMoney(n, g.currency);
  return (
    <View style={{ gap: 6 }}>
      <Progress value={g.current_amount / g.target_amount} />
      <Txt size={13} muted>{f(Number(g.current_amount))} of {f(Number(g.target_amount))}</Txt>
      {pace.done ? <Txt size={13}>Reached ✦</Txt>
        : pace.overdue ? <Txt size={13}>Target date passed — want to pick a new one? ({f(pace.remaining)} to go)</Txt>
        : g.target_date ? <Txt size={13}>To hit {g.target_date}: {f(pace.perDay)}/day · {f(pace.perWeek)}/week · {f(pace.perMonth)}/month</Txt>
        : <Txt size={13} muted>Add a target date to see a suggested pace.</Txt>}
      <Row><View style={{ flex: 1 }}><Field value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="Add money" /></View>
        <Button small kind="secondary" label="Add" onPress={async () => {
          const n = Number(amt); if (!(n > 0)) return;
          await db.insert('transactions', { kind: 'savings_contribution', amount: n, currency: g.currency, savings_goal_id: g.id, account_id: from, description: `Saved for ${g.name}`, occurred_on: ymd(new Date()) });
          setAmt('');
        }} /></Row>
      {accounts.length ? <Row wrap><Txt size={12} muted>from:</Txt><Chip label="—" selected={!from} onPress={() => setFrom(null)} />{accounts.map((a) => <Chip key={a.id} label={a.name} selected={from === a.id} onPress={() => setFrom(a.id)} />)}</Row> : null}
    </View>
  );
}

export default function Savings() {
  const { profile } = usePreferences();
  return (
    <>
      <Stack.Screen options={{ title: 'Savings goals' }} />
      <Collection<Goal>
        table="savings_goals" title="Savings goals" icon="trending-up-outline" subtitle="Every small amount counts."
        emptyText="Emergency fund, a trip, a new laptop…"
        fields={[
          { key: 'name', label: 'Goal', type: 'text', required: true },
          { key: 'target_amount', label: 'Target amount', type: 'money', required: true, min: 0.01 },
          { key: 'target_date', label: 'Target date', type: 'date' },
          { key: 'contribution', label: 'Planned regular contribution (optional)', type: 'money', min: 0 },
        ]}
        defaults={{ currency: profile?.currency ?? 'USD', current_amount: 0 }}
        itemTitle={(g) => g.name}
        itemExtra={(g) => <Extras g={g} />}
      />
    </>
  );
}

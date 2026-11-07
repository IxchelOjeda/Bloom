import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Collection } from '@/components/Collection';
import { db, useRows } from '@/lib/db';
import { formatMoney, spendingToday, Tx as FinTx } from '@/lib/finance';
import { alertOverDailyLimit } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { Thumb } from '@/components/ImageField';
import { usePreferences } from '@/lib/preferences';
import { ymd } from '@/lib/dates';
import { Button, Chip, Field, Row, Txt } from '@/components/ui';

interface Tx { id: string; kind: string; amount: number; currency: string; occurred_on: string; description: string | null; category_id: string | null; account_id: string | null; payment_method: string | null; notes: string | null; receipt_path: string | null }

function CategoryManager() {
  const cats = useRows<{ id: string; name: string }>('expense_categories', 'expcats:all', (q) => q.select('id,name').order('name')).rows;
  const [name, setName] = useState('');
  return (
    <View style={{ gap: 6 }}>
      <Txt size={13} muted>Categories</Txt>
      <Row wrap>{cats.map((c) => <Chip key={c.id} label={`${c.name}  ✕`} onPress={() => db.remove('expense_categories', c.id)} />)}</Row>
      <Txt size={12} muted>Removing a category keeps its expenses (they become "Other").</Txt>
      <Row><View style={{ flex: 1 }}><Field value={name} onChangeText={setName} placeholder="Custom category" /></View>
        <Button small kind="secondary" label="Add" onPress={() => { if (name.trim()) { void db.insert('expense_categories', { name: name.trim() }); setName(''); } }} /></Row>
    </View>
  );
}

export default function Expenses() {
  const { profile, prefs } = usePreferences();
  const cur = profile?.currency ?? 'USD';
  const cats = useRows<{ id: string; name: string }>('expense_categories', 'expcats:all', (q) => q.select('id,name').order('name')).rows;
  const accounts = useRows<{ id: string; name: string }>('accounts', 'accounts:all', (q) => q.select('id,name')).rows;
  const [showCats, setShowCats] = useState(false);
  return (
    <>
      <Stack.Screen options={{ title: 'Expenses' }} />
      <Collection<Tx>
        table="transactions" title="Expenses" icon="receipt-outline" subtitle="Quick to log, easy to fix."
        emptyText="Log what you spend to see where it goes."
        order={{ column: 'occurred_on' }}
        where={{ kind: 'expense' }}
        header={<>{showCats ? <CategoryManager /> : null}<Button small kind="ghost" label={showCats ? 'Hide categories' : 'Manage categories'} onPress={() => setShowCats(!showCats)} /></>}
        fields={[
          { key: 'amount', label: `Amount (${cur})`, type: 'money', required: true, min: 0.01 },
          { key: 'description', label: 'What for', type: 'text' },
          { key: 'category_id', label: 'Category', type: 'select', options: cats.map((c) => ({ value: c.id, label: c.name })) },
          { key: 'occurred_on', label: 'Date', type: 'date', required: true },
          { key: 'account_id', label: 'Paid from (updates that balance)', type: 'select', options: accounts.map((a) => ({ value: a.id, label: a.name })) },
          { key: 'payment_method', label: 'Payment method', type: 'select', options: ['cash', 'debit', 'credit', 'transfer', 'other'].map((v) => ({ value: v, label: v })) },
          { key: 'notes', label: 'Notes', type: 'multiline' },
          { key: 'receipt_path', label: 'Receipt (optional)', type: 'image', prefix: 'receipt' },
        ]}
        defaults={{ kind: 'expense', currency: cur, occurred_on: ymd(new Date()) }}
        afterSave={async (x) => {
          // optional heads-up when today's spending passes today's limit (at most once a day)
          if (x.occurred_on !== ymd(new Date())) return;
          const [lim, tx] = await Promise.all([
            supabase.from('daily_limits').select('weekday,date,amount'),
            supabase.from('transactions').select('kind,amount,occurred_on,currency').eq('kind', 'expense').eq('occurred_on', x.occurred_on),
          ]);
          const s = spendingToday(new Date(), (lim.data ?? []).map((l) => ({ ...l, amount: Number(l.amount) })),
            (tx.data ?? []).filter((t) => t.currency === cur).map((t) => ({ kind: 'expense' as const, occurred_on: t.occurred_on, amount: Number(t.amount) })) as FinTx[]);
          if (s.over && s.limit != null) await alertOverDailyLimit(prefs, x.occurred_on, formatMoney(s.spent, cur), formatMoney(s.limit, cur));
        }}
        itemTitle={(x) => x.description || cats.find((c) => c.id === x.category_id)?.name || 'Expense'}
        itemSub={(x) => [x.occurred_on, cats.find((c) => c.id === x.category_id)?.name, x.payment_method].filter(Boolean).join(' · ')}
        itemRight={(x) => <Row gap={8}><Thumb path={x.receipt_path} size={36} /><Txt weight="600">{formatMoney(Number(x.amount), x.currency)}</Txt></Row>}
      />
    </>
  );
}

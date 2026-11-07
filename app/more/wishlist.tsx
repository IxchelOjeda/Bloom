import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Collection } from '@/components/Collection';
import { db, useRows } from '@/lib/db';
import { formatMoney } from '@/lib/finance';
import { usePreferences } from '@/lib/preferences';
import { ymd } from '@/lib/dates';
import { Button, Chip, Field, Pill, Row, Txt } from '@/components/ui';

interface Item { id: string; name: string; description: string | null; url: string | null; price: number | null; currency: string | null; store: string | null; priority: string; status: string; category_id: string | null; notes: string | null; created_at: string }
const STATUS = [['want', 'Want to buy'], ['saving', 'Saving for'], ['purchased', 'Purchased'], ['not_interested', 'No longer interested']];

function Categories({ active, onPick }: { active: string | null; onPick: (id: string | null) => void }) {
  const cats = useRows<{ id: string; name: string }>('wishlist_categories', 'wishcats:all', (q) => q.select('*').order('name')).rows;
  const [name, setName] = useState('');
  return (
    <View style={{ gap: 6 }}>
      <Row wrap><Chip label="All" selected={!active} onPress={() => onPick(null)} />
        {cats.map((c) => <Chip key={c.id} label={c.name} selected={active === c.id} onPress={() => onPick(c.id)} />)}</Row>
      <Row><View style={{ flex: 1 }}><Field value={name} onChangeText={setName} placeholder="New list (Books, Makeup…)" /></View>
        <Button small kind="secondary" label="Add" onPress={() => { if (name.trim()) { void db.insert('wishlist_categories', { name: name.trim() }); setName(''); } }} /></Row>
    </View>
  );
}

export default function Wishlist() {
  const { profile } = usePreferences();
  const cats = useRows<{ id: string; name: string }>('wishlist_categories', 'wishcats:all', (q) => q.select('*').order('name')).rows;
  const [filter, setFilter] = useState<string | null>(null);

  const markPurchased = (it: Item) => Alert.alert('Purchased ✦', 'Also log it as an expense?', [
    { text: 'Just mark it', onPress: () => void db.update('wishlist_items', it.id, { status: 'purchased' }) },
    { text: 'Log expense too', onPress: async () => {
      await db.update('wishlist_items', it.id, { status: 'purchased' });
      if (it.price) await db.insert('transactions', { kind: 'expense', amount: it.price, currency: it.currency ?? profile?.currency ?? 'USD', description: it.name, wishlist_item_id: it.id, occurred_on: ymd(new Date()) });
    } },
    { text: 'Cancel', style: 'cancel' },
  ]);

  return (
    <>
      <Stack.Screen options={{ title: 'Wishlists' }} />
      <Collection<Item>
        key={filter ?? 'all'}
        table="wishlist_items" title="Wishlists" icon="heart-outline" subtitle="Want it, save for it, or let it go."
        emptyText="Add something you've been eyeing."
        where={filter ? { category_id: filter } : undefined}
        header={<Categories active={filter} onPick={setFilter} />}
        fields={[
          { key: 'name', label: 'Item', type: 'text', required: true },
          { key: 'category_id', label: 'List', type: 'select', options: cats.map((c) => ({ value: c.id, label: c.name })) },
          { key: 'price', label: 'Price', type: 'money', min: 0 },
          { key: 'store', label: 'Store', type: 'text' },
          { key: 'url', label: 'Link', type: 'url' },
          { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high'].map((v) => ({ value: v, label: v })) },
          { key: 'status', label: 'Status', type: 'select', options: STATUS.map(([value, label]) => ({ value, label })) },
          { key: 'description', label: 'Description', type: 'multiline' },
          { key: 'notes', label: 'Notes', type: 'multiline' },
        ]}
        defaults={{ priority: 'medium', status: 'want', currency: profile?.currency ?? 'USD', category_id: filter }}
        itemTitle={(i) => i.name}
        itemSub={(i) => [i.store, cats.find((c) => c.id === i.category_id)?.name, `added ${i.created_at.slice(0, 10)}`].filter(Boolean).join(' · ')}
        itemRight={(i) => <View style={{ alignItems: 'flex-end', gap: 4 }}>{i.price != null ? <Txt weight="600">{formatMoney(Number(i.price), i.currency ?? 'USD')}</Txt> : null}
          <Pill label={STATUS.find(([v]) => v === i.status)?.[1] ?? i.status} tone={i.status === 'purchased' ? 'success' : i.status === 'saving' ? 'primary' : 'neutral'} /></View>}
        itemExtra={(i) => <Row wrap>
          {i.url ? <Button small kind="ghost" label="Open link" onPress={() => Linking.openURL(i.url!)} /> : null}
          {i.status !== 'purchased' ? <Button small kind="secondary" label="Bought it" onPress={() => markPurchased(i)} /> : null}
        </Row>}
      />
    </>
  );
}

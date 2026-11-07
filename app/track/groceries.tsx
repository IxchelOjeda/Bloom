import { Stack } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { db, useRows } from '@/lib/db';
import { Button, Card, Check, Chip, Empty, Field, Row, Screen, Section, Txt } from '@/components/ui';

interface Item { id: string; name: string; quantity: number | null; unit: string | null; aisle: string | null; checked: boolean; staple: boolean }
const AISLES = ['Produce', 'Dairy', 'Meat & fish', 'Bakery', 'Pantry', 'Frozen', 'Drinks', 'Household', 'Other'];

export default function Groceries() {
  const items = useRows<Item>('grocery_items', 'grocery:all', (q) => q.select('*').order('created_at')).rows;
  const [name, setName] = useState(''); const [qty, setQty] = useState(''); const [aisle, setAisle] = useState('Other');
  const open = items.filter((i) => !i.checked);
  const staples = items.filter((i) => i.staple && i.checked); // bought staples, ready to re-add
  const groups = useMemo(() => AISLES.map((a) => ({ a, list: open.filter((i) => (i.aisle ?? 'Other') === a) })).filter((g) => g.list.length), [open]);

  const add = async (n = name, q = qty, a = aisle) => {
    if (!n.trim()) return;
    const m = q.match(/^([\d.]+)\s*(\D*)$/);
    await db.insert('grocery_items', { name: n.trim(), quantity: m ? Number(m[1]) : null, unit: m?.[2]?.trim() || null, aisle: a });
    setName(''); setQty('');
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Groceries' }} />
      <Card>
        <Row><View style={{ flex: 2 }}><Field value={name} onChangeText={setName} placeholder="Add item" onSubmitEditing={() => add()} /></View>
          <View style={{ flex: 1 }}><Field value={qty} onChangeText={setQty} placeholder="2 kg" /></View></Row>
        <Row wrap>{AISLES.map((a) => <Chip key={a} label={a} selected={aisle === a} onPress={() => setAisle(a)} />)}</Row>
        <Button label="Add" onPress={() => add()} />
      </Card>
      {staples.length ? <Section title="Frequent — tap to re-add">
        <Row wrap>{staples.map((s) => <Chip key={s.id} icon="add" label={s.name} onPress={() => db.update('grocery_items', s.id, { checked: false })} />)}</Row>
      </Section> : null}
      {open.length === 0 ? <Empty icon="cart-outline" text="List is empty. Add items, or send ingredients from a recipe or meal plan." /> : null}
      {groups.map((g) => (
        <Section key={g.a} title={g.a}>
          <Card>{g.list.map((i) => (
            <Row key={i.id}>
              <Check done={i.checked} label={i.name} onPress={() => db.update('grocery_items', i.id, { checked: true })} />
              <Txt style={{ flex: 1 }}>{i.name}{i.quantity != null ? ` · ${i.quantity}${i.unit ? ' ' + i.unit : ''}` : ''}</Txt>
              <Chip label={i.staple ? '★' : '☆'} onPress={() => db.update('grocery_items', i.id, { staple: !i.staple })} />
              <Chip label="✕" onPress={() => db.remove('grocery_items', i.id)} />
            </Row>
          ))}</Card>
        </Section>
      ))}
      {items.some((i) => i.checked) ? (
        <Button kind="ghost" label="Clear purchased (keeps ★ staples)" onPress={() => { for (const i of items.filter((x) => x.checked && !x.staple)) void db.remove('grocery_items', i.id); }} />
      ) : null}
    </Screen>
  );
}

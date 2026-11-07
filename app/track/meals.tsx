import { Stack } from 'expo-router';
import { addDays, addWeeks, format, startOfWeek } from 'date-fns';
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { db, useRows } from '@/lib/db';
import { ymd } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import { Button, Card, Check, Chip, Field, IconButton, Row, Screen, Sheet, Txt } from '@/components/ui';

type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';
const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];
interface Meal { id: string; date: string; slot: Slot; title: string; recipe_id: string | null; servings: number; completed: boolean }

export default function MealPlanner() {
  const { profile } = usePreferences();
  const [anchor, setAnchor] = useState(new Date());
  const start = startOfWeek(anchor, { weekStartsOn: (profile?.week_start ?? 1) as 0 | 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const meals = useRows<Meal>('meal_plans', `meals:week:${ymd(start)}`, (q) => q.select('*').gte('date', ymd(start)).lte('date', ymd(days[6])),
    (m) => m.date >= ymd(start) && m.date <= ymd(days[6])).rows;
  const recipes = useRows<{ id: string; title: string }>('recipes', 'recipes:titles', (q) => q.select('id,title').order('title')).rows;
  const [edit, setEdit] = useState<{ date: string; slot: Slot; meal?: Meal } | null>(null);
  const [title, setTitle] = useState('');
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [repeat, setRepeat] = useState(0);

  const open = (date: string, slot: Slot, meal?: Meal) => { setEdit({ date, slot, meal }); setTitle(meal?.title ?? ''); setRecipeId(meal?.recipe_id ?? null); setRepeat(0); };
  const save = async () => {
    if (!edit || !title.trim()) return Alert.alert('What are you eating?');
    if (edit.meal) await db.update('meal_plans', edit.meal.id, { title: title.trim(), recipe_id: recipeId });
    else for (let w = 0; w <= repeat; w++) await db.insert('meal_plans', { date: ymd(addWeeks(new Date(edit.date + 'T12:00'), w)), slot: edit.slot, title: title.trim(), recipe_id: recipeId, servings: 1, completed: false });
    setEdit(null);
  };

  /** Adds every recipe ingredient for this week's planned meals to the grocery list (merging duplicates). */
  const toGroceries = async () => {
    const ids = [...new Set(meals.map((m) => m.recipe_id).filter(Boolean))] as string[];
    if (!ids.length) return Alert.alert('No recipes linked', 'Link meals to saved recipes to build a list automatically.');
    const [{ data: ings }, { data: existing }] = await Promise.all([
      supabase.from('recipe_ingredients').select('name,quantity,unit,recipe_id').in('recipe_id', ids),
      supabase.from('grocery_items').select('id,name,quantity,unit').eq('checked', false),
    ]);
    let added = 0;
    for (const ing of ings ?? []) {
      const times = meals.filter((m) => m.recipe_id === ing.recipe_id).length;
      const same = existing?.find((e) => e.name.toLowerCase() === ing.name.toLowerCase() && e.unit === ing.unit);
      if (same && ing.quantity != null) await db.update('grocery_items', same.id, { quantity: (same.quantity ?? 0) + ing.quantity * times });
      else { await db.insert('grocery_items', { name: ing.name, quantity: ing.quantity != null ? ing.quantity * times : null, unit: ing.unit, recipe_id: ing.recipe_id, aisle: 'Other' }); added++; }
    }
    Alert.alert('Grocery list updated', `${added} new items, others merged.`);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Meal planner' }} />
      <Row>
        <IconButton icon="chevron-back" label="Previous week" onPress={() => setAnchor(addWeeks(anchor, -1))} />
        <Txt heading size={17} style={{ flex: 1, textAlign: 'center' }}>{format(start, 'MMM d')} – {format(days[6], 'MMM d')}</Txt>
        <IconButton icon="chevron-forward" label="Next week" onPress={() => setAnchor(addWeeks(anchor, 1))} />
      </Row>
      <Button kind="secondary" icon="cart-outline" label="Add this week's ingredients to groceries" onPress={toGroceries} />
      {days.map((d) => (
        <Card key={ymd(d)}>
          <Txt weight="600">{format(d, 'EEEE d')}</Txt>
          {SLOTS.map((s) => {
            const m = meals.find((x) => x.date === ymd(d) && x.slot === s);
            return (
              <Row key={s}>
                <Txt size={13} muted style={{ width: 76 }}>{s}</Txt>
                {m ? (<>
                  <Check done={m.completed} label={m.title} onPress={() => db.update('meal_plans', m.id, { completed: !m.completed })} />
                  <Txt style={{ flex: 1 }} numberOfLines={1}>{m.title}</Txt>
                  <Chip label="Edit" onPress={() => open(ymd(d), s, m)} /><Chip label="✕" onPress={() => db.remove('meal_plans', m.id)} />
                </>) : <Chip icon="add" label="Plan" onPress={() => open(ymd(d), s)} />}
              </Row>
            );
          })}
        </Card>
      ))}
      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.slot} · ${edit.date}` : ''}>
        <Field label="Meal" value={title} onChangeText={setTitle} placeholder="e.g. Chicken rice bowl" />
        {recipes.length ? <><Txt size={13} muted>Link a saved recipe (for groceries)</Txt>
          <Row wrap><Chip label="None" selected={!recipeId} onPress={() => setRecipeId(null)} />
            {recipes.map((r) => <Chip key={r.id} label={r.title} selected={recipeId === r.id} onPress={() => { setRecipeId(r.id); if (!title) setTitle(r.title); }} />)}</Row></> : null}
        {!edit?.meal ? <><Txt size={13} muted>Repeat on the same day for…</Txt>
          <Row wrap>{[0, 1, 3, 7, 11].map((n) => <Chip key={n} label={n === 0 ? 'Just this week' : `+${n} weeks`} selected={repeat === n} onPress={() => setRepeat(n)} />)}</Row></> : null}
        <Button label="Save" onPress={save} />
      </Sheet>
    </Screen>
  );
}

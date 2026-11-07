import { Stack, router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { db } from '@/lib/db';
import { usePreferences } from '@/lib/preferences';
import { callFunction } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Chip, Field, Row, Screen, Title, Txt } from '@/components/ui';

interface Ing { name: string; quantity?: number | null; unit?: string | null }
interface RecipeOut { title: string; servings: number; prep_min?: number | null; cook_min?: number | null; difficulty?: string | null; ingredients: Ing[]; steps: string[]; nutrition_note?: string | null }
interface Reply { reply: string; off_topic: boolean; recipe?: RecipeOut | null; shopping?: Ing[] | null }
interface Turn { role: 'user' | 'assistant'; content: string; recipe?: RecipeOut | null; shopping?: Ing[] | null }

const STARTERS = [
  'I have eggs, rice, onions, tomatoes and chicken. What can I make?',
  'I have chicken, rice and onions. What else should I buy for a good meal?',
  "I don't have heavy cream. What can I use instead?",
];

export default function RecipeAI() {
  const t = useTheme();
  const { profile } = usePreferences();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [pantry, setPantry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<number, string>>({});

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: text.trim() }];
    setTurns(next); setInput(''); setBusy(true); setError(null);
    try {
      const res = await callFunction<Reply>('recipe-ai', {
        messages: next.slice(-16).map(({ role, content }) => ({ role, content })),
        pantry: pantry.split(',').map((s) => s.trim()).filter(Boolean),
        units: profile?.units ?? 'metric',
      });
      setTurns([...next, { role: 'assistant', content: res.reply, recipe: res.recipe, shopping: res.shopping }]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Recipe AI is unavailable right now.'); }
    finally { setBusy(false); }
  };

  const saveRecipe = async (i: number, r: RecipeOut) => {
    const row = await db.insert('recipes', { title: r.title, servings: r.servings, prep_min: r.prep_min ?? null, cook_min: r.cook_min ?? null, difficulty: r.difficulty ?? null, steps: r.steps, source: 'recipe_ai' });
    for (const ing of r.ingredients) await db.insert('recipe_ingredients', { recipe_id: row.id, name: ing.name, quantity: ing.quantity ?? null, unit: ing.unit ?? null });
    setSaved((s) => ({ ...s, [i]: row.id }));
  };
  const toGroceries = async (i: number, list: Ing[]) => {
    for (const ing of list) await db.insert('grocery_items', { name: ing.name, quantity: ing.quantity ?? null, unit: ing.unit ?? null, aisle: 'Other', recipe_id: saved[i] ?? null });
    setSaved((s) => ({ ...s, [-i - 1]: 'groceries' }));
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Recipe AI' }} />
      <Title sub="Cooking help only. It can't see your calendar, money or health data.">Recipe AI</Title>
      <Field label="What's in your kitchen? (optional, comma separated)" value={pantry} onChangeText={setPantry} placeholder="eggs, rice, spinach, garlic" />
      {turns.length === 0 ? STARTERS.map((s) => <Card key={s} tone="alt" onPress={() => send(s)}><Txt size={14}>{s}</Txt></Card>) : null}

      {turns.map((m, i) => (
        <View key={i} style={{ gap: 8, alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '90%' : '100%' }}>
          <Card tone={m.role === 'user' ? 'soft' : undefined}><Txt>{m.content}</Txt></Card>
          {m.recipe ? (
            <Card>
              <Txt heading size={18}>{m.recipe.title}</Txt>
              <Txt size={13} muted>{[`${m.recipe.servings} servings`, m.recipe.prep_min != null && `prep ${m.recipe.prep_min} min`, m.recipe.cook_min != null && `cook ${m.recipe.cook_min} min`, m.recipe.difficulty].filter(Boolean).join(' · ')}</Txt>
              <Txt weight="600">Ingredients</Txt>
              {m.recipe.ingredients.map((g, j) => <Txt key={j} size={14}>• {g.quantity ?? ''} {g.unit ?? ''} {g.name}</Txt>)}
              <Txt weight="600">Steps — tap one to ask about it</Txt>
              {m.recipe.steps.map((s, j) => <Card key={j} tone="alt" onPress={() => send(`Explain step ${j + 1} in more detail: "${s}"`)}><Txt size={14}>{j + 1}. {s}</Txt></Card>)}
              {m.recipe.nutrition_note ? <Txt size={12} muted>Estimate: {m.recipe.nutrition_note}</Txt> : null}
              <Row wrap>
                {saved[i] ? <Chip label="Saved ✓" onPress={() => router.push('/track/recipes')} /> : <Button small kind="secondary" label="Save recipe" onPress={() => saveRecipe(i, m.recipe!)} />}
                {saved[-i - 1] ? <Chip label="In groceries ✓" /> : <Button small kind="ghost" label="Ingredients → groceries" onPress={() => toGroceries(i, m.recipe!.ingredients)} />}
              </Row>
            </Card>
          ) : null}
          {m.shopping?.length ? (
            <Card>
              <Txt weight="600">To buy</Txt>
              {m.shopping.map((g, j) => <Txt key={j} size={14}>• {g.quantity ?? ''} {g.unit ?? ''} {g.name}</Txt>)}
              {saved[-i - 1] ? <Chip label="In groceries ✓" /> : <Button small kind="secondary" label="Add to grocery list" onPress={() => toGroceries(i, m.shopping!)} />}
            </Card>
          ) : null}
        </View>
      ))}
      {busy ? <Txt muted>Stirring the pot…</Txt> : null}
      {error ? <Txt color={t.colors.danger}>{error}</Txt> : null}
      <Field multiline value={input} onChangeText={setInput} placeholder="Ask anything about cooking" />
      <Button label="Send" icon="send" onPress={() => send(input)} loading={busy} disabled={!input.trim()} />
      {turns.length ? <Button kind="ghost" label="New conversation" onPress={() => { setTurns([]); setSaved({}); }} /> : null}
    </Screen>
  );
}

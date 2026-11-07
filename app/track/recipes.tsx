import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Collection } from '@/components/Collection';
import { db, useRows } from '@/lib/db';
import { Button, Field, Row, Sheet, Txt } from '@/components/ui';

export interface Recipe { id: string; title: string; servings: number; prep_min: number | null; cook_min: number | null; difficulty: string | null; steps: string[]; source: string }
interface Ing { id: string; recipe_id: string; name: string; quantity: number | null; unit: string | null }

export async function sendToGroceries(recipeId: string, ings: Ing[]) {
  for (const i of ings) await db.insert('grocery_items', { name: i.name, quantity: i.quantity, unit: i.unit, recipe_id: recipeId, aisle: 'Other' });
  Alert.alert('Added to groceries', `${ings.length} ingredients`);
}

function RecipeExtras({ r }: { r: Recipe }) {
  const ings = useRows<Ing>('recipe_ingredients', `ings:${r.id}`, (q) => q.select('*').eq('recipe_id', r.id), (i) => i.recipe_id === r.id).rows;
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(''); const [qty, setQty] = useState(''); const [unit, setUnit] = useState('');
  const [step, setStep] = useState('');
  return (
    <View style={{ gap: 6 }}>
      <Txt size={13} muted numberOfLines={2}>{ings.map((i) => i.name).join(', ') || 'No ingredients yet'}</Txt>
      <Row><Button small kind="secondary" label="Open" onPress={() => setOpen(true)} />
        {ings.length ? <Button small kind="ghost" label="→ Groceries" onPress={() => sendToGroceries(r.id, ings)} /> : null}</Row>
      <Sheet visible={open} onClose={() => setOpen(false)} title={r.title}>
        <Txt heading size={16}>Ingredients</Txt>
        {ings.map((i) => <Row key={i.id}><Txt style={{ flex: 1 }}>• {i.quantity ?? ''} {i.unit ?? ''} {i.name}</Txt><Button small kind="ghost" label="✕" onPress={() => db.remove('recipe_ingredients', i.id)} /></Row>)}
        <Row><View style={{ flex: 2 }}><Field value={n} onChangeText={setN} placeholder="Ingredient" /></View>
          <View style={{ flex: 1 }}><Field value={qty} onChangeText={setQty} placeholder="Qty" keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field value={unit} onChangeText={setUnit} placeholder="Unit" /></View></Row>
        <Button small kind="secondary" label="Add ingredient" onPress={async () => { if (n.trim()) { await db.insert('recipe_ingredients', { recipe_id: r.id, name: n.trim(), quantity: qty ? Number(qty) : null, unit: unit || null }); setN(''); setQty(''); setUnit(''); } }} />
        <Txt heading size={16}>Steps</Txt>
        {(r.steps ?? []).map((s, i) => <Txt key={i}>{i + 1}. {s}</Txt>)}
        <Field value={step} onChangeText={setStep} placeholder="Add a step" multiline />
        <Button small kind="secondary" label="Add step" onPress={async () => { if (step.trim()) { await db.update('recipes', r.id, { steps: [...(r.steps ?? []), step.trim()] }); setStep(''); } }} />
      </Sheet>
    </View>
  );
}

export default function Recipes() {
  return (
    <>
      <Stack.Screen options={{ title: 'Recipes' }} />
      <Collection<Recipe>
        table="recipes" title="Recipes" subtitle="Saved from Recipe AI or your own." icon="book-outline"
        emptyText="Save a recipe from Recipe AI, or add your own."
        fields={[
          { key: 'title', label: 'Recipe', type: 'text', required: true },
          { key: 'servings', label: 'Servings', type: 'number', min: 0.5 },
          { key: 'prep_min', label: 'Prep minutes', type: 'number', min: 0 },
          { key: 'cook_min', label: 'Cook minutes', type: 'number', min: 0 },
          { key: 'difficulty', label: 'Difficulty', type: 'select', options: ['easy', 'medium', 'hard'].map((v) => ({ value: v, label: v })) },
        ]}
        defaults={{ servings: 2, steps: [], source: 'manual' }}
        itemTitle={(r) => r.title}
        itemSub={(r) => [r.servings && `${r.servings} servings`, (r.prep_min || r.cook_min) && `${(r.prep_min ?? 0) + (r.cook_min ?? 0)} min`, r.difficulty, r.source === 'recipe_ai' && 'from Recipe AI'].filter(Boolean).join(' · ')}
        itemExtra={(r) => <RecipeExtras r={r} />}
      />
    </>
  );
}

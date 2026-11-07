import { Stack } from 'expo-router';
import { format, startOfDay, subDays } from 'date-fns';
import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { db, useRows } from '@/lib/db';
import { dayRange } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { callFunction } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Chip, Empty, Field, Pill, Progress, Row, Screen, Section, Segmented, Sheet, Txt } from '@/components/ui';

type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';
interface Food { id: string; source: string; brand: string | null; name: string; serving_label: string; serving_grams: number | null; kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; verified: boolean }
interface Log { id: string; eaten_at: string; slot: Slot; name: string; servings: number; kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; source: string; favorite: boolean; food_id: string | null }

const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];
const defaultSlot = (): Slot => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack'; };
const r1 = (n: number) => Math.round(n * 10) / 10;

export default function FoodDiary() {
  const t = useTheme();
  const { prefs, profile } = usePreferences();
  const [view, setView] = useState<'today' | 'week'>('today');
  const { from, to } = dayRange();
  const logs = useRows<Log>('food_logs', `food:${format(new Date(), 'yyyy-MM-dd')}`, (q) => q.select('*').gte('eaten_at', from).lte('eaten_at', to).order('eaten_at'),
    (l) => l.eaten_at >= from && l.eaten_at <= to).rows;
  const week = useRows<Log>('food_logs', 'food:7d', (q) => q.select('eaten_at,kcal,protein_g,id').gte('eaten_at', subDays(startOfDay(new Date()), 6).toISOString())).rows;
  const favs = useRows<Log>('food_logs', 'food:favorites', (q) => q.select('*').eq('favorite', true).order('created_at', { ascending: false }).limit(20)).rows;

  const [q, setQ] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [picked, setPicked] = useState<Food | null>(null);
  const [manual, setManual] = useState(false);

  const totals = useMemo(() => logs.reduce((s, l) => ({ kcal: s.kcal + (l.kcal ?? 0), p: s.p + (l.protein_g ?? 0), c: s.c + (l.carbs_g ?? 0), f: s.f + (l.fat_g ?? 0) }), { kcal: 0, p: 0, c: 0, f: 0 }), [logs]);
  const byDay = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = subDays(startOfDay(new Date()), 6 - i); const k = format(d, 'yyyy-MM-dd');
    return { label: format(d, 'EEE'), kcal: week.filter((l) => l.eaten_at.slice(0, 10) === k || format(new Date(l.eaten_at), 'yyyy-MM-dd') === k).reduce((s, l) => s + (l.kcal ?? 0), 0) };
  }), [week]);
  const maxDay = Math.max(1, ...byDay.map((d) => d.kcal));

  const search = async () => {
    if (q.trim().length < 2) return;
    setSearching(true); setNote(null);
    try {
      const res = await callFunction<{ results: Food[]; sources: { usda: boolean } }>('food-search', { query: q.trim(), country: profile?.country?.slice(0, 2) ?? null });
      setResults(res.results);
      if (!res.sources.usda) setNote('Only Open Food Facts is connected. Add a free USDA key for generic foods and US restaurant items (see README).');
      if (!res.results.length) setNote('No verified match. You can add it manually as an estimate.');
    } catch (e) { setNote(e instanceof Error ? e.message : 'Search unavailable — you can still add food manually.'); }
    finally { setSearching(false); }
  };

  const relog = (l: Log) => db.insert('food_logs', { slot: defaultSlot(), name: l.name, servings: l.servings, kcal: l.kcal, protein_g: l.protein_g, carbs_g: l.carbs_g, fat_g: l.fat_g, source: l.source, food_id: l.food_id, eaten_at: new Date().toISOString() });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Food diary' }} />
      <Segmented value={view} onChange={setView} options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'Last 7 days' }]} />

      {view === 'today' ? (<>
        <Card>
          <Row wrap gap={14}><Txt heading size={22}>{Math.round(totals.kcal)} kcal</Txt><Txt muted>P {r1(totals.p)}g · C {r1(totals.c)}g · F {r1(totals.f)}g</Txt></Row>
          {prefs.nutrition_goals?.kcal ? <><Progress value={totals.kcal / prefs.nutrition_goals.kcal} /><Txt size={12} muted>Your optional goal: {prefs.nutrition_goals.kcal} kcal</Txt></> : null}
          <Txt size={11} muted>For awareness only — not a medical or dietary assessment.</Txt>
        </Card>
        {SLOTS.map((s) => {
          const items = logs.filter((l) => l.slot === s);
          if (!items.length) return null;
          return (
            <Section key={s} title={s[0].toUpperCase() + s.slice(1)}>
              <Card>{items.map((l) => (
                <Row key={l.id}>
                  <View style={{ flex: 1 }}><Txt>{l.name}</Txt><Row gap={6}><Txt size={12} muted>{l.servings}× · {Math.round(l.kcal ?? 0)} kcal</Txt>
                    {l.source === 'manual_estimate' ? <Pill label="estimate" /> : <Pill label="verified" tone="success" />}</Row></View>
                  <Chip label={l.favorite ? '♥' : '♡'} onPress={() => db.update('food_logs', l.id, { favorite: !l.favorite })} />
                  <Chip label="✕" onPress={() => db.remove('food_logs', l.id)} />
                </Row>
              ))}</Card>
            </Section>
          );
        })}
      </>) : (
        <Card>
          {byDay.map((d) => <Row key={d.label}><Txt style={{ width: 40 }}>{d.label}</Txt>
            <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: t.colors.progressTrack }}>
              <View style={{ width: `${(d.kcal / maxDay) * 100}%`, height: 10, borderRadius: 5, backgroundColor: t.colors.primary }} /></View>
            <Txt size={12} muted style={{ width: 70, textAlign: 'right' }}>{Math.round(d.kcal)} kcal</Txt></Row>)}
        </Card>
      )}

      <Section title="Add food">
        <Row><View style={{ flex: 1 }}><Field value={q} onChangeText={setQ} placeholder="e.g. McDonald's nuggets, oat milk, banana" returnKeyType="search" onSubmitEditing={search} /></View>
          <Button small label="Search" onPress={search} loading={searching} /></Row>
        {note ? <Txt size={13} muted>{note}</Txt> : null}
        {results.map((f) => (
          <Card key={f.id} onPress={() => setPicked(f)}>
            <Txt weight="600">{f.name}</Txt>
            <Txt size={12} muted>{[f.brand, `${f.kcal} kcal / ${f.serving_label}`, f.source === 'usda' ? 'USDA' : f.source === 'open_food_facts' ? 'Open Food Facts' : 'official'].filter(Boolean).join(' · ')}</Txt>
          </Card>
        ))}
        <Button kind="ghost" label="Enter manually" onPress={() => setManual(true)} />
      </Section>

      {favs.length ? <Section title="Favorites — tap to log again">
        <Row wrap>{favs.map((f) => <Chip key={f.id} label={f.name} onPress={() => void relog(f)} />)}</Row>
      </Section> : null}
      {!logs.length && view === 'today' && !results.length ? <Empty icon="nutrition-outline" text="Nothing logged today. Logging is optional — do what helps." /> : null}

      <LogSheet food={picked} onClose={() => setPicked(null)} />
      <ManualSheet visible={manual} onClose={() => setManual(false)} />
    </Screen>
  );
}

function LogSheet({ food, onClose }: { food: Food | null; onClose: () => void }) {
  const [grams, setGrams] = useState('100');
  const [slot, setSlot] = useState<Slot>(defaultSlot());
  if (!food) return null;
  const factor = (Number(grams) || 0) / (food.serving_grams ?? 100);
  const v = (n: number | null) => (n == null ? null : r1(n * factor));
  return (
    <Sheet visible onClose={onClose} title={food.name}>
      <Txt muted size={13}>Per {food.serving_label}: {food.kcal} kcal · P {food.protein_g ?? '–'} · C {food.carbs_g ?? '–'} · F {food.fat_g ?? '–'}</Txt>
      <Field label="Amount (grams)" value={grams} onChangeText={setGrams} keyboardType="decimal-pad" />
      <Row wrap>{[50, 100, 150, 200, 250].map((g) => <Chip key={g} label={`${g} g`} selected={grams === String(g)} onPress={() => setGrams(String(g))} />)}</Row>
      <Txt size={12} muted>Tip: check the product's serving weight (e.g. 10 nuggets ≈ the weight on the box) for accuracy.</Txt>
      <Row wrap>{SLOTS.map((s) => <Chip key={s} label={s} selected={slot === s} onPress={() => setSlot(s)} />)}</Row>
      <Card tone="soft"><Txt weight="600">{v(food.kcal)} kcal</Txt><Txt size={13}>P {v(food.protein_g) ?? '–'}g · C {v(food.carbs_g) ?? '–'}g · F {v(food.fat_g) ?? '–'}g</Txt></Card>
      <Button label="Log it" onPress={async () => {
        if (!(Number(grams) > 0)) return Alert.alert('Enter an amount');
        await db.insert('food_logs', { food_id: food.id, name: food.brand ? `${food.name} (${food.brand})` : food.name, slot, servings: r1(factor), kcal: v(food.kcal), protein_g: v(food.protein_g), carbs_g: v(food.carbs_g), fat_g: v(food.fat_g),
          source: food.source, eaten_at: new Date().toISOString() });
        onClose();
      }} />
    </Sheet>
  );
}

function ManualSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [name, setName] = useState(''); const [kcal, setKcal] = useState(''); const [p, setP] = useState(''); const [c, setC] = useState(''); const [f, setF] = useState('');
  const [slot, setSlot] = useState<Slot>(defaultSlot()); const [save, setSave] = useState(true);
  const n = (s: string) => (s === '' ? null : Number(s));
  return (
    <Sheet visible={visible} onClose={onClose} title="Add manually">
      <Txt size={13} muted>Saved as an estimate, clearly marked as not from a verified database.</Txt>
      <Field label="Food" value={name} onChangeText={setName} />
      <Field label="Calories (kcal)" value={kcal} onChangeText={setKcal} keyboardType="decimal-pad" placeholder="optional" />
      <Row><View style={{ flex: 1 }}><Field label="Protein g" value={p} onChangeText={setP} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="Carbs g" value={c} onChangeText={setC} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="Fat g" value={f} onChangeText={setF} keyboardType="decimal-pad" /></View></Row>
      <Row wrap>{SLOTS.map((s) => <Chip key={s} label={s} selected={slot === s} onPress={() => setSlot(s)} />)}</Row>
      <Chip label={save ? '✓ Save as custom food' : 'Save as custom food'} selected={save} onPress={() => setSave(!save)} />
      <Button label="Log it" onPress={async () => {
        if (!name.trim()) return Alert.alert('Name the food');
        if ([kcal, p, c, f].some((x) => x !== '' && isNaN(Number(x)))) return Alert.alert('Numbers only for nutrition');
        let foodId: string | null = null;
        if (save) foodId = (await db.insert('foods', { source: 'manual_estimate', name: name.trim(), serving_label: '1 serving', kcal: n(kcal), protein_g: n(p), carbs_g: n(c), fat_g: n(f), verified: false })).id;
        await db.insert('food_logs', { food_id: foodId, name: name.trim(), slot, servings: 1, kcal: n(kcal), protein_g: n(p), carbs_g: n(c), fat_g: n(f), source: 'manual_estimate', eaten_at: new Date().toISOString() });
        setName(''); setKcal(''); setP(''); setC(''); setF(''); onClose();
      }} />
    </Sheet>
  );
}

import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Collection } from '@/components/Collection';
import { db, useRows } from '@/lib/db';
import { Button, Check, Field, Progress, Row, Sheet, Txt } from '@/components/ui';

interface Goal { id: string; title: string; description: string | null; horizon: string; unit: string | null; start_value: number; target_value: number | null; current_value: number; target_date: string | null; completed_at: string | null }
interface Milestone { id: string; goal_id: string; title: string; done: boolean; position: number; due_date: string | null }

export const pct = (g: Pick<Goal, 'start_value' | 'target_value' | 'current_value'>) =>
  g.target_value == null || g.target_value === g.start_value ? 0 : (g.current_value - g.start_value) / (g.target_value - g.start_value);

function GoalExtras({ g }: { g: Goal }) {
  const ms = useRows<Milestone>('milestones', `milestones:${g.id}`, (q) => q.select('*').eq('goal_id', g.id).order('position'), (m) => m.goal_id === g.id).rows;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const p = g.target_value != null ? pct(g) : ms.length ? ms.filter((m) => m.done).length / ms.length : 0;
  return (
    <View style={{ gap: 6 }}>
      <Progress value={p} />
      <Row><Txt size={12} muted style={{ flex: 1 }}>{Math.round(p * 100)}%{g.target_value != null ? ` · ${g.current_value}/${g.target_value} ${g.unit ?? ''}` : ''}</Txt>
        <Button small kind="secondary" label="Update" onPress={() => setOpen(true)} /></Row>
      <Sheet visible={open} onClose={() => setOpen(false)} title={g.title}>
        {g.target_value != null ? (<>
          <Field label={`Current value (${g.unit ?? 'units'})`} keyboardType="decimal-pad" value={value} onChangeText={setValue} placeholder={String(g.current_value)} />
          <Button label="Log progress" onPress={async () => { if (value !== '' && !isNaN(Number(value))) { await db.insert('progress_entries', { goal_id: g.id, value: Number(value) }); setValue(''); } }} />
        </>) : null}
        <Txt heading size={16}>Milestones</Txt>
        {ms.map((m) => <Row key={m.id}><Check done={m.done} label={m.title} onPress={() => db.update('milestones', m.id, { done: !m.done })} /><Txt style={{ flex: 1 }}>{m.title}</Txt>
          <Button small kind="ghost" label="Remove" onPress={() => db.remove('milestones', m.id)} /></Row>)}
        <Row><View style={{ flex: 1 }}><Field value={title} onChangeText={setTitle} placeholder="e.g. Book 3" /></View>
          <Button small kind="secondary" label="Add" onPress={async () => { if (title.trim()) { await db.insert('milestones', { goal_id: g.id, title: title.trim(), position: ms.length }); setTitle(''); } }} /></Row>
        {g.target_value != null && g.unit && ms.length === 0 ? (
          <Button kind="ghost" label={`Split into ${Math.min(12, Math.ceil(g.target_value - g.start_value))} milestones`} onPress={async () => {
            const n = Math.min(12, Math.ceil(g.target_value! - g.start_value));
            for (let i = 1; i <= n; i++) await db.insert('milestones', { goal_id: g.id, title: `${g.unit} ${Math.round(g.start_value + ((g.target_value! - g.start_value) * i) / n)}`, position: i, target_value: g.start_value + ((g.target_value! - g.start_value) * i) / n });
          }} />) : null}
        <Button kind="secondary" label={g.completed_at ? 'Reopen goal' : 'Mark goal complete ✦'} onPress={() => db.update('goals', g.id, { completed_at: g.completed_at ? null : new Date().toISOString() })} />
      </Sheet>
    </View>
  );
}

export default function Goals() {
  return (
    <>
      <Stack.Screen options={{ title: 'Goals' }} />
      <Collection<Goal>
        table="goals" title="Goals" subtitle="Big things, broken into small steps." icon="flag-outline"
        emptyText="Try: Read 12 books this year, or Lift 50 kg by December."
        fields={[
          { key: 'title', label: 'Goal', type: 'text', required: true },
          { key: 'horizon', label: 'Timeframe', type: 'select', options: ['daily', 'weekly', 'monthly', 'annual', 'long'].map((v) => ({ value: v, label: v })) },
          { key: 'unit', label: 'Measured in (optional)', type: 'text', placeholder: 'books, kg, hours…' },
          { key: 'start_value', label: 'Starting point', type: 'number' },
          { key: 'target_value', label: 'Target', type: 'number' },
          { key: 'target_date', label: 'Target date', type: 'date' },
          { key: 'description', label: 'Why it matters', type: 'multiline' },
        ]}
        defaults={{ horizon: 'long', start_value: 0, current_value: 0 }}
        transform={(v, existing) => existing ? v : { ...v, start_value: v.start_value ?? 0, current_value: v.start_value ?? 0 }}
        itemTitle={(g) => `${g.completed_at ? '✓ ' : ''}${g.title}`}
        itemSub={(g) => [g.horizon, g.target_date && `by ${g.target_date}`].filter(Boolean).join(' · ')}
        itemExtra={(g) => <GoalExtras g={g} />}
      />
    </>
  );
}

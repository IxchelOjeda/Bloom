import { Stack, router } from 'expo-router';
import { format } from 'date-fns';
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { db, useRows } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { TEMPLATES, TemplateDef } from '@/lib/templates';
import { Button, Card, Field, Pill, Row, Screen, Section, Title, Txt } from '@/components/ui';

export default function Templates() {
  const [busy, setBusy] = useState<string | null>(null);
  const custom = useRows<{ id: string; name: string; kind: string; payload: TemplateDef }>('templates', 'templates:mine', (q) => q.select('*').not('user_id', 'is', null)).rows;
  const routines = useRows<{ id: string; name: string }>('routines', 'routines:names', (q) => q.select('id,name')).rows;
  const [income, setIncome] = useState('');

  const apply = async (t: TemplateDef) => {
    setBusy(t.id);
    try {
      if (t.routine) {
        const r = await db.insert('routines', { name: t.routine.name, weekdays: t.routine.weekdays, start_time: t.routine.start_time ?? null });
        let i = 1; for (const [name, minutes] of t.routine.steps) await db.insert('routine_steps', { routine_id: r.id, name, minutes, position: i++ });
      }
      for (const title of t.tasks ?? []) await db.insert('tasks', { title, status: 'todo', priority: 'medium', source: 'template' });
      if (t.budgets) {
        const inc = Number(income);
        if (!inc) { Alert.alert('Monthly income needed', 'Enter your monthly take-home to size the budget.'); return; }
        const { data: cats } = await supabase.from('expense_categories').select('id,name');
        const month = format(new Date(), 'yyyy-MM-01');
        for (const [name, frac] of t.budgets) {
          const cat = cats?.find((c) => c.name === name);
          if (cat) await db.insert('budgets', { category_id: cat.id, month, amount: Math.round(inc * frac) });
        }
      }
      Alert.alert('Added ✦', 'You can edit everything it created.');
    } finally { setBusy(null); }
  };

  const saveAsTemplate = async (routineId: string, name: string) => {
    const { data: steps } = await supabase.from('routine_steps').select('name,minutes').eq('routine_id', routineId).order('position');
    const payload: TemplateDef = { id: routineId, kind: 'custom', name, blurb: 'Your template', routine: { name, weekdays: [], steps: (steps ?? []).map((s) => [s.name, s.minutes ?? 5]) } };
    await db.insert('templates', { kind: 'custom', name, payload });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Templates' }} />
      <Title sub="Start from something, then make it yours.">Templates</Title>
      {TEMPLATES.map((t) => (
        <Card key={t.id}>
          <Row><Txt weight="600" style={{ flex: 1 }}>{t.name}</Txt><Pill label={t.kind.replace('_', ' ')} /></Row>
          <Txt size={13} muted>{t.blurb}{t.routine ? ` · ${t.routine.steps.length} steps` : ''}{t.tasks ? ` · ${t.tasks.length} tasks` : ''}</Txt>
          {t.budgets ? <Field value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder="Monthly take-home" /> : null}
          <Button small kind="secondary" label="Use this" loading={busy === t.id} onPress={() => apply(t)} />
        </Card>
      ))}
      <Section title="Your templates">
        {custom.map((c) => <Card key={c.id}><Row><Txt style={{ flex: 1 }}>{c.name}</Txt>
          <Button small kind="secondary" label="Use" onPress={() => apply(c.payload)} /><Button small kind="ghost" label="✕" onPress={() => db.remove('templates', c.id)} /></Row></Card>)}
        {routines.length ? <Txt size={13} muted>Save one of your routines as a template:</Txt> : <Txt muted size={13}>Create a routine to save it as a template.</Txt>}
        <Row wrap>{routines.map((r) => <Button key={r.id} small kind="ghost" label={`+ ${r.name}`} onPress={() => saveAsTemplate(r.id, r.name)} />)}</Row>
        <Button kind="ghost" label="Go to routines" onPress={() => router.push('/plan/routines')} />
      </Section>
    </Screen>
  );
}

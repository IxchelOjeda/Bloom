import { Stack } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Collection } from '@/components/Collection';
import { db, useRows } from '@/lib/db';
import { ymd } from '@/lib/dates';
import { Button, Check, Field, Progress, Row, Sheet, Txt } from '@/components/ui';

interface Routine { id: string; name: string; description: string | null; weekdays: number[]; start_time: string | null }
interface Step { id: string; routine_id: string; position: number; name: string; minutes: number | null; description: string | null }
interface Run { id: string; routine_id: string; date: string; completed_steps: string[]; finished: boolean }

function RoutineExtras({ r }: { r: Routine }) {
  const today = ymd(new Date());
  const steps = useRows<Step>('routine_steps', `steps:${r.id}`, (q) => q.select('*').eq('routine_id', r.id).order('position'), (s) => s.routine_id === r.id).rows.sort((a, b) => a.position - b.position);
  const run = useRows<Run>('routine_runs', `run:${r.id}:${today}`, (q) => q.select('*').eq('routine_id', r.id).eq('date', today)).rows[0];
  const [edit, setEdit] = useState(false);
  const [play, setPlay] = useState(false);
  const [name, setName] = useState(''); const [mins, setMins] = useState('');
  const done = run?.completed_steps ?? [];

  const toggle = async (stepId: string) => {
    const next = done.includes(stepId) ? done.filter((x) => x !== stepId) : [...done, stepId];
    const finished = steps.length > 0 && steps.every((s) => next.includes(s.id));
    if (run) await db.update('routine_runs', run.id, { completed_steps: next, finished });
    else await db.insert('routine_runs', { routine_id: r.id, date: today, completed_steps: next, finished });
  };

  return (
    <View style={{ gap: 6 }}>
      <Progress value={steps.length ? done.length / steps.length : 0} />
      <Txt size={12} muted>{done.length}/{steps.length} steps today · {steps.reduce((s, x) => s + (x.minutes ?? 0), 0)} min total</Txt>
      <Row><Button small label="Start" icon="play" onPress={() => setPlay(true)} /><Button small kind="ghost" label="Edit steps" onPress={() => setEdit(true)} /></Row>

      <Sheet visible={edit} onClose={() => setEdit(false)} title={`${r.name} — steps`}>
        {steps.map((s, i) => (
          <Row key={s.id}><Txt style={{ flex: 1 }}>{i + 1}. {s.name}{s.minutes ? ` · ${s.minutes} min` : ''}</Txt>
            {i > 0 ? <Button small kind="ghost" label="↑" onPress={async () => { await db.update('routine_steps', s.id, { position: steps[i - 1].position }); await db.update('routine_steps', steps[i - 1].id, { position: s.position }); }} /> : null}
            <Button small kind="ghost" label="✕" onPress={() => db.remove('routine_steps', s.id)} /></Row>
        ))}
        <Field label="Step" value={name} onChangeText={setName} placeholder="e.g. Wash face" />
        <Field label="Minutes" value={mins} onChangeText={setMins} keyboardType="number-pad" />
        <Button kind="secondary" label="Add step" onPress={async () => {
          if (!name.trim()) return;
          await db.insert('routine_steps', { routine_id: r.id, name: name.trim(), minutes: mins ? Number(mins) : null, position: (steps.at(-1)?.position ?? 0) + 1 });
          setName(''); setMins('');
        }} />
      </Sheet>

      {play ? <Player steps={steps} done={done} onToggle={toggle} onClose={() => setPlay(false)} title={r.name} /> : null}
    </View>
  );
}

/** Step-by-step mode with a visual countdown for each step (time-blindness support). */
function Player({ steps, done, onToggle, onClose, title }: { steps: Step[]; done: string[]; onToggle: (id: string) => void; onClose: () => void; title: string }) {
  const first = steps.findIndex((s) => !done.includes(s.id));
  const [i, setI] = useState(first === -1 ? 0 : first);
  const [left, setLeft] = useState((steps[i]?.minutes ?? 0) * 60);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { setLeft((steps[i]?.minutes ?? 0) * 60); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { timer.current = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000); return () => { if (timer.current) clearInterval(timer.current); }; }, []);
  const s = steps[i];
  if (!s) return <Sheet visible onClose={onClose} title={title}><Txt>Add steps first.</Txt></Sheet>;
  const total = (s.minutes ?? 0) * 60;
  return (
    <Sheet visible onClose={onClose} title={`${title} · ${i + 1}/${steps.length}`}>
      <Txt heading size={24}>{s.name}</Txt>
      {s.description ? <Txt muted>{s.description}</Txt> : null}
      {total ? (<><Progress value={1 - left / total} height={14} /><Txt muted>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left</Txt></>) : null}
      <Row><Check done={done.includes(s.id)} label={s.name} onPress={() => onToggle(s.id)} /><Txt>Done</Txt></Row>
      <Row>
        {i > 0 ? <Button kind="ghost" label="Back" onPress={() => setI(i - 1)} /> : null}
        {i < steps.length - 1 ? <Button label="Next step" onPress={() => { if (!done.includes(s.id)) onToggle(s.id); setI(i + 1); }} />
          : <Button label="Finish ✦" onPress={() => { if (!done.includes(s.id)) onToggle(s.id); onClose(); }} />}
      </Row>
    </Sheet>
  );
}

export default function Routines() {
  return (
    <>
      <Stack.Screen options={{ title: 'Routines' }} />
      <Collection<Routine>
        table="routines" title="Routines" subtitle="Follow along one step at a time." icon="repeat-outline"
        emptyText="Morning routine, night routine, Sunday reset… or start from Templates."
        fields={[
          { key: 'name', label: 'Routine', type: 'text', required: true },
          { key: 'weekdays', label: 'Repeats on', type: 'weekdays' },
          { key: 'start_time', label: 'Usual start time', type: 'time' },
          { key: 'description', label: 'Description', type: 'multiline' },
        ]}
        defaults={{ weekdays: [] }}
        itemTitle={(r) => r.name}
        itemSub={(r) => r.start_time ? `starts ${r.start_time.slice(0, 5)}` : null}
        itemExtra={(r) => <RoutineExtras r={r} />}
      />
    </>
  );
}

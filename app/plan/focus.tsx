import { Stack } from 'expo-router';
import { startOfDay, subDays } from 'date-fns';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { db, useRows } from '@/lib/db';
import { usePreferences } from '@/lib/preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { Named, Task } from '@/components/sheets';
import { Button, Card, Chip, Field, Row, Screen, Section, Txt } from '@/components/ui';

type Phase = 'focus' | 'short' | 'long';

export default function Focus() {
  const t = useTheme();
  const { prefs, setPrefs } = usePreferences();
  const p = prefs.pomodoro;
  const tasks = useRows<Task>('tasks', 'tasks:open', (q) => q.select('*').eq('status', 'todo').is('parent_id', null).limit(30)).rows;
  const acts = useRows<Named>('activities', 'activities:active', (q) => q.select('id,name').eq('archived', false)).rows;
  const week = useRows<{ id: string; minutes: number; activity_id: string | null; started_at: string }>('focus_sessions', 'focus:7d',
    (q) => q.select('id,minutes,activity_id,started_at').eq('kind', 'focus').gte('started_at', subDays(startOfDay(new Date()), 6).toISOString())).rows;

  const [taskId, setTaskId] = useState<string | null>(null);
  const [actId, setActId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('focus');
  const [round, setRound] = useState(1);
  const [running, setRunning] = useState(false);
  const [endAt, setEndAt] = useState<number | null>(null);          // wall-clock end → survives backgrounding
  const [remaining, setRemaining] = useState(p.focus * 60);
  const startedAt = useRef<Date | null>(null);
  const [custom, setCustom] = useState('');

  const phaseLen = (ph: Phase) => (ph === 'focus' ? p.focus : ph === 'short' ? p.short : p.long) * 60;

  useEffect(() => {
    if (!running || !endAt) return;
    const tick = () => {
      const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) void complete(true);
    };
    tick();
    const i = setInterval(tick, 1000);
    const sub = AppState.addEventListener('change', tick);
    return () => { clearInterval(i); sub.remove(); };
  }, [running, endAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    if (!startedAt.current) startedAt.current = new Date();
    setEndAt(Date.now() + remaining * 1000); setRunning(true);
  };
  const pause = () => { setRunning(false); setEndAt(null); };

  const complete = async (natural: boolean) => {
    setRunning(false); setEndAt(null);
    const elapsedMin = Math.round((phaseLen(phase) - remaining) / 60) || (natural ? phaseLen(phase) / 60 : 0);
    if (phase === 'focus' && elapsedMin >= 1) {
      const task = tasks.find((x) => x.id === taskId);
      await db.insert('focus_sessions', { task_id: taskId, activity_id: actId ?? task?.activity_id ?? null, started_at: (startedAt.current ?? new Date()).toISOString(), minutes: Math.min(600, elapsedMin), kind: 'focus' });
    }
    startedAt.current = null;
    if (natural) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const next: Phase = phase === 'focus' ? (round % p.rounds === 0 ? 'long' : 'short') : 'focus';
    if (phase !== 'focus') setRound((r) => r + 1);
    setPhase(next); setRemaining(phaseLen(next));
  };

  const mm = Math.floor(remaining / 60), ss = remaining % 60;
  const frac = 1 - remaining / phaseLen(phase);
  const byAct = acts.map((a) => ({ name: a.name!, min: week.filter((w) => w.activity_id === a.id).reduce((s, w) => s + w.minutes, 0) })).filter((x) => x.min > 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Focus' }} />
      <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
        <Txt muted>{phase === 'focus' ? `Focus · round ${round}` : phase === 'short' ? 'Short break — stretch, sip water' : 'Long break — you earned it'}</Txt>
        <Txt heading size={64} weight="300" style={{ fontVariant: ['tabular-nums'] }}>{mm}:{String(ss).padStart(2, '0')}</Txt>
        {/* visual timer: the bar empties as time passes (time-blindness support) */}
        <View style={{ width: '100%', height: 16, borderRadius: 8, backgroundColor: t.colors.progressTrack, overflow: 'hidden' }}>
          <View style={{ width: `${(1 - frac) * 100}%`, height: 16, backgroundColor: phase === 'focus' ? t.colors.primary : t.colors.success }} />
        </View>
        <Row style={{ marginTop: 12 }}>
          {running ? <Button label="Pause" icon="pause" onPress={pause} /> : <Button label={remaining < phaseLen(phase) ? 'Resume' : 'Start'} icon="play" onPress={start} />}
          <Button kind="secondary" label={phase === 'focus' ? 'Stop & save' : 'Skip break'} onPress={() => void complete(false)} />
        </Row>
      </Card>

      {!running && phase === 'focus' && remaining === phaseLen('focus') ? (<>
        <Section title="Working on">
          <Row wrap><Chip label="Nothing specific" selected={!taskId} onPress={() => setTaskId(null)} />
            {tasks.map((x) => <Chip key={x.id} label={x.title} selected={taskId === x.id} onPress={() => setTaskId(x.id)} />)}</Row>
          {acts.length ? <Row wrap><Chip label="No activity" selected={!actId} onPress={() => setActId(null)} />
            {acts.map((a) => <Chip key={a.id} label={a.name!} selected={actId === a.id} onPress={() => setActId(a.id)} />)}</Row> : null}
        </Section>
        <Section title="Intervals">
          <Row wrap>{[[25, 5, 15], [50, 10, 20], [15, 3, 10], [90, 15, 30]].map(([f, s, l]) =>
            <Chip key={f} label={`${f}/${s}`} selected={p.focus === f && p.short === s} onPress={() => { void setPrefs({ pomodoro: { ...p, focus: f, short: s, long: l } }); setRemaining(f * 60); }} />)}</Row>
          <Row><View style={{ flex: 1 }}><Field value={custom} onChangeText={setCustom} placeholder="Custom focus minutes" keyboardType="number-pad" /></View>
            <Button small kind="secondary" label="Set" onPress={() => { const n = Number(custom); if (n > 0 && n <= 180) { void setPrefs({ pomodoro: { ...p, focus: n } }); setRemaining(n * 60); setCustom(''); } }} /></Row>
        </Section>
      </>) : null}

      <Section title="Last 7 days">
        <Card>
          <Txt>{week.reduce((s, w) => s + w.minutes, 0)} min focused</Txt>
          {byAct.map((b) => <Row key={b.name}><Txt style={{ flex: 1 }}>{b.name}</Txt><Txt muted>{b.min} min</Txt></Row>)}
        </Card>
      </Section>
    </Screen>
  );
}

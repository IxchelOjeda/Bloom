import { Stack } from 'expo-router';
import { addDays, format } from 'date-fns';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { db, useRows } from '@/lib/db';
import { WEEKDAY_SHORT, ymd } from '@/lib/dates';
import { Button, Card, Chip, Field, Row, Screen, Section, Txt } from '@/components/ui';

const KINDS = [['rest', 'Full rest'], ['active_recovery', 'Active recovery'], ['low_workload', 'Low workload'], ['unavailable', 'Unavailable'], ['vacation', 'Vacation']] as const;

export default function Availability() {
  const av = useRows<{ id: string; weekday: number; start_time: string; end_time: string }>('availability', 'availability:all', (q) => q.select('*').order('weekday')).rows;
  const flags = useRows<{ id: string; date: string; kind: string }>('day_flags', 'flags:upcoming', (q) => q.select('*').gte('date', ymd(new Date())).order('date')).rows;
  const energy = useRows<{ id: string; date: string; level: string; mood: number | null }>('energy_logs', 'energy:recent', (q) => q.select('*').order('date', { ascending: false }).limit(14)).rows;
  const [day, setDay] = useState(1); const [start, setStart] = useState('09:00'); const [end, setEnd] = useState('17:00');
  const [flagDate, setFlagDate] = useState(ymd(new Date())); const [kind, setKind] = useState<string>('rest');
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Rest & availability' }} />
      <Section title="When can things be scheduled?">
        <Txt muted size={13}>The planner only suggests times inside these windows. Add several per day if you like.</Txt>
        {WEEKDAY_SHORT.map((d, i) => (
          <Card key={d}><Row wrap><Txt weight="600" style={{ width: 44 }}>{d}</Txt>
            {av.filter((a) => a.weekday === i).map((a) => <Chip key={a.id} label={`${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}  ✕`} onPress={() => db.remove('availability', a.id)} />)}
            {!av.some((a) => a.weekday === i) ? <Txt muted size={13}>not available</Txt> : null}</Row></Card>
        ))}
        <Row wrap>{WEEKDAY_SHORT.map((d, i) => <Chip key={d} label={d} selected={day === i} onPress={() => setDay(i)} />)}</Row>
        <Row><View style={{ flex: 1 }}><Field label="From" value={start} onChangeText={setStart} /></View><View style={{ flex: 1 }}><Field label="To" value={end} onChangeText={setEnd} /></View></Row>
        <Button kind="secondary" label={`Add window on ${WEEKDAY_SHORT[day]}`} onPress={() => {
          if (!re.test(start) || !re.test(end) || end <= start) return Alert.alert('Check times', 'HH:MM, and end after start');
          void db.insert('availability', { weekday: day, start_time: start, end_time: end });
        }} />
      </Section>

      <Section title="Rest days & time off">
        <Txt muted size={13}>Demanding activities are never auto-scheduled on these days.</Txt>
        {flags.map((f) => <Card key={f.id}><Row><Txt style={{ flex: 1 }}>{format(new Date(f.date + 'T12:00'), 'EEE, MMM d')}</Txt><Txt muted>{f.kind.replace('_', ' ')}</Txt>
          <Button small kind="ghost" label="Remove" onPress={() => db.remove('day_flags', f.id)} /></Row></Card>)}
        <Field label="Date" value={flagDate} onChangeText={setFlagDate} autoCapitalize="none" />
        <Row wrap>{[0, 1, 2, 7].map((n) => <Chip key={n} label={n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === 2 ? 'In 2 days' : 'Next week'} onPress={() => setFlagDate(ymd(addDays(new Date(), n)))} />)}</Row>
        <Row wrap>{KINDS.map(([k, l]) => <Chip key={k} label={l} selected={kind === k} onPress={() => setKind(k)} />)}</Row>
        <Button kind="secondary" label="Save day" onPress={() => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(flagDate)) return Alert.alert('Use YYYY-MM-DD');
          const existing = flags.find((f) => f.date === flagDate);
          void (existing ? db.update('day_flags', existing.id, { kind }) : db.insert('day_flags', { date: flagDate, kind }));
        }} />
      </Section>

      <Section title="Energy (optional)">
        <Txt muted size={13}>Logged from Today. The planner gives lighter loads on low-energy days.</Txt>
        <Card>{energy.length ? energy.map((e) => <Row key={e.id}><Txt style={{ flex: 1 }}>{e.date}</Txt><Txt muted>{e.level.replace('_', ' ')}</Txt></Row>) : <Txt muted>No entries yet.</Txt>}</Card>
      </Section>
    </Screen>
  );
}

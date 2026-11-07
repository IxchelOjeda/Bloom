import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { db, useRows } from '@/lib/db';
import { ymd } from '@/lib/dates';
import { EventSheet } from '@/components/sheets';
import { Button, Card, Chip, Empty, Field, Row, Screen, Title, Txt } from '@/components/ui';

interface Entry { id: string; content: string; converted_to: string | null; created_at: string }

export default function BrainDump() {
  const entries = useRows<Entry>('brain_dump', 'braindump:open', (q) => q.select('*').is('converted_to', null).order('created_at', { ascending: false }), (e) => !e.converted_to).rows;
  const [text, setText] = useState('');
  const [eventFor, setEventFor] = useState<Entry | null>(null);

  const add = async () => {
    // one thought per line → paste a whole list at once
    for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) await db.insert('brain_dump', { content: line });
    setText('');
  };
  const convert = async (e: Entry, to: string) => {
    let created: { id: string } | null = null;
    if (to === 'task') created = await db.insert('tasks', { title: e.content.slice(0, 200), status: 'todo', priority: 'medium', source: 'brain_dump' });
    if (to === 'today') created = await db.insert('tasks', { title: e.content.slice(0, 200), status: 'todo', priority: 'medium', due_date: ymd(new Date()), source: 'brain_dump' });
    if (to === 'goal') created = await db.insert('goals', { title: e.content.slice(0, 120), horizon: 'long' });
    if (to === 'activity') created = await db.insert('activities', { name: e.content.slice(0, 80) });
    if (to === 'note') created = await db.insert('notes', { body: e.content });
    if (to === 'wishlist') created = await db.insert('wishlist_items', { name: e.content.slice(0, 200), status: 'want', priority: 'medium' });
    if (to === 'event') { setEventFor(e); return; }
    await db.update('brain_dump', e.id, { converted_to: to === 'today' ? 'task' : to, converted_id: created?.id ?? null });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Brain dump' }} />
      <Title sub="Get it out of your head. Sort it later — or never.">Everything on my mind</Title>
      <Field multiline value={text} onChangeText={setText} placeholder={'Call the dentist\nIdea for the blog\nBuy oat milk'} />
      <Button label="Dump it" icon="arrow-down" onPress={add} disabled={!text.trim()} />
      {entries.length === 0 ? <Empty icon="cloud-outline" text="Inbox is clear." /> : null}
      {entries.map((e) => (
        <Card key={e.id}>
          <Txt>{e.content}</Txt>
          <Row wrap>
            {[['today', 'Do today'], ['task', 'Task'], ['event', 'Schedule'], ['goal', 'Goal'], ['activity', 'Activity'], ['note', 'Note'], ['wishlist', 'Wishlist']].map(([k, l]) =>
              <Chip key={k} label={l} onPress={() => void convert(e, k)} />)}
            <Chip label="Delete" onPress={() => db.remove('brain_dump', e.id)} />
          </Row>
        </Card>
      ))}
      <EventSheet visible={!!eventFor} defaultTitle={eventFor?.content.slice(0, 200)} onClose={() => setEventFor(null)}
        onSaved={(id) => { if (eventFor) void db.update('brain_dump', eventFor.id, { converted_to: 'event', converted_id: id }); }} />
    </Screen>
  );
}

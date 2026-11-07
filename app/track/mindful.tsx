import { Stack } from 'expo-router';
import { format } from 'date-fns';
import React from 'react';
import { Collection } from '@/components/Collection';
import { db } from '@/lib/db';
import { Chip } from '@/components/ui';

interface Mindful { id: string; kind: string; title: string; scheduled_at: string | null; done_at: string | null; minutes: number | null; note: string | null; when_date?: string; when_time?: string }
const KINDS = ['meditation', 'therapy', 'journaling', 'nap', 'breathing', 'relaxation', 'reflection', 'digital detox', 'custom'];

export default function MindfulScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Wellbeing' }} />
      <Collection<Mindful>
        table="mindful_activities" title="Wellbeing" icon="flower-outline" subtitle="Small things that help you feel okay."
        emptyText="Schedule a breathing break, a nap, journaling or a therapy session."
        fields={[
          { key: 'kind', label: 'Type', type: 'select', options: KINDS.map((k) => ({ value: k, label: k })), required: true },
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'when_date', label: 'Date (optional)', type: 'date' },
          { key: 'when_time', label: 'Time (optional)', type: 'time' },
          { key: 'minutes', label: 'Minutes', type: 'number', min: 1 },
          { key: 'note', label: 'Notes', type: 'multiline' },
        ]}
        defaults={{ kind: 'meditation' }}
        transform={(v, existing) => {
          const { when_date, when_time, ...rest } = v as Record<string, unknown>;
          if (!when_date) return existing ? rest : { ...rest, scheduled_at: null }; // editing without a new date keeps the old one
          return { ...rest, scheduled_at: new Date(`${when_date}T${when_time ?? '09:00'}:00`).toISOString() };
        }}
        itemTitle={(m) => `${m.done_at ? '✓ ' : ''}${m.title}`}
        itemSub={(m) => [m.kind, m.scheduled_at && format(new Date(m.scheduled_at), 'EEE MMM d, h:mm a'), m.minutes && `${m.minutes} min`].filter(Boolean).join(' · ')}
        itemRight={(m) => <Chip label={m.done_at ? 'Done' : 'Mark done'} selected={!!m.done_at} onPress={() => db.update('mindful_activities', m.id, { done_at: m.done_at ? null : new Date().toISOString() })} />}
      />
    </>
  );
}

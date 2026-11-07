import { Stack } from 'expo-router';
import React from 'react';
import { Collection } from '@/components/Collection';
import { useRows } from '@/lib/db';
import { Card, Txt } from '@/components/ui';

interface Sleep { id: string; date: string; planned_bed: string | null; planned_wake: string | null; actual_bed: string | null; actual_wake: string | null; quality: number | null; bed?: string; wake?: string }

const hours = (s: Sleep) => s.actual_bed && s.actual_wake ? (+new Date(s.actual_wake) - +new Date(s.actual_bed)) / 3600000 : null;
const hhmm = (iso: string | null) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '');

function Summary() {
  const rows = useRows<Sleep>('sleep_logs', 'sleep:all', (q) => q.select('*').order('date', { ascending: false }).limit(14)).rows;
  const hs = rows.map(hours).filter((h): h is number => h != null && h > 0);
  if (!hs.length) return null;
  return <Card tone="soft"><Txt>Average {(hs.reduce((a, b) => a + b, 0) / hs.length).toFixed(1)} h over the last {hs.length} nights</Txt></Card>;
}

export default function SleepScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Sleep' }} />
      <Collection<Sleep>
        table="sleep_logs" title="Sleep" icon="moon-outline" subtitle="Just notes for you — no judgement."
        emptyText="Log last night: when you went to bed and woke up."
        header={<Summary />}
        order={{ column: 'date' }}
        fields={[
          { key: 'date', label: 'Night of (wake-up date)', type: 'date', required: true },
          { key: 'planned_bed', label: 'Planned bedtime', type: 'time' },
          { key: 'bed', label: 'Actual bedtime', type: 'time' },
          { key: 'planned_wake', label: 'Planned wake-up', type: 'time' },
          { key: 'wake', label: 'Actual wake-up', type: 'time' },
          { key: 'quality', label: 'Quality (1–5, optional)', type: 'select', options: [1, 2, 3, 4, 5].map((n) => ({ value: n as unknown as string, label: '★'.repeat(n) })) },
        ]}
        // Convert the two HH:MM inputs into real timestamps; bedtime after noon belongs to the previous day.
        transform={(v) => {
          const out: Record<string, unknown> = { date: v.date, planned_bed: v.planned_bed, planned_wake: v.planned_wake, quality: v.quality ?? null };
          const date = String(v.date);
          if (v.wake) out.actual_wake = new Date(`${date}T${v.wake}:00`).toISOString();
          if (v.bed) {
            const bed = new Date(`${date}T${v.bed}:00`);
            if (Number(String(v.bed).slice(0, 2)) >= 12) bed.setDate(bed.getDate() - 1);
            out.actual_bed = bed.toISOString();
          }
          return out;
        }}
        itemTitle={(s) => s.date}
        itemSub={(s) => [hours(s) != null && `${hours(s)!.toFixed(1)} h`, s.actual_bed && `${hhmm(s.actual_bed)} → ${hhmm(s.actual_wake)}`, s.quality && '★'.repeat(s.quality)].filter(Boolean).join(' · ')}
      />
    </>
  );
}

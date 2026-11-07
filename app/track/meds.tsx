import { Stack } from 'expo-router';
import { format, subDays } from 'date-fns';
import React from 'react';
import { View } from 'react-native';
import { Collection } from '@/components/Collection';
import { useRows } from '@/lib/db';
import { cancelFor, scheduleDaily } from '@/lib/notifications';
import { usePreferences } from '@/lib/preferences';
import { WEEKDAY_SHORT } from '@/lib/dates';
import { Button, Card, Txt } from '@/components/ui';

interface Med { id: string; name: string; dosage: string | null; times: string[]; weekdays: number[]; start_date: string | null; end_date: string | null; instructions: string | null; reminders: boolean }

async function syncReminders(m: Med, enabled: boolean) {
  await cancelFor(m.id);
  if (!enabled || !m.reminders) return;
  for (const t of m.times) await scheduleDaily('medication', m.id, `Time for ${m.name}`, m.dosage ? `${m.dosage} — as you scheduled it` : 'As you scheduled it', t.slice(0, 5));
}

function MedHistory({ m }: { m: Med }) {
  const logs = useRows<{ id: string; scheduled_for: string; status: string }>('medication_logs', `medlogs:${m.id}`,
    (q) => q.select('*').eq('medication_id', m.id).gte('scheduled_for', subDays(new Date(), 7).toISOString()).order('scheduled_for', { ascending: false })).rows;
  const { prefs } = usePreferences();
  return (
    <View style={{ gap: 4 }}>
      {logs.slice(0, 5).map((l) => <Txt key={l.id} size={12} muted>{format(new Date(l.scheduled_for), 'EEE h:mm a')} — {l.status}</Txt>)}
      {m.reminders && prefs.notifications.enabled ? (
        <Button small kind="ghost" label="Refresh reminders" onPress={() => syncReminders(m, true)} />
      ) : null}
    </View>
  );
}

export default function Meds() {
  const { prefs } = usePreferences();
  return (
    <>
      <Stack.Screen options={{ title: 'Medication' }} />
      <Collection<Med>
        table="medications" title="Medication" icon="medkit-outline"
        subtitle="Reminders exactly as you or your prescriber set them. This app never suggests doses or changes."
        emptyText="Add a medication to get gentle reminders and a simple history."
        header={!prefs.notifications.enabled ? <Card tone="alt"><Txt size={13}>Reminders are off. Turn them on in More → Settings → Notifications.</Txt></Card> : undefined}
        fields={[
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'dosage', label: 'Dosage (as prescribed)', type: 'text', placeholder: 'e.g. 1 tablet' },
          { key: 'times', label: 'Times (HH:MM, comma separated)', type: 'times' },
          { key: 'weekdays', label: 'Days', type: 'weekdays' },
          { key: 'start_date', label: 'Start date', type: 'date' },
          { key: 'end_date', label: 'End date', type: 'date' },
          { key: 'instructions', label: 'Instructions', type: 'multiline' },
          { key: 'reminders', label: 'Remind me', type: 'bool', hint: 'Medication reminders are never moved by quiet hours' },
        ]}
        defaults={{ times: [], weekdays: [0, 1, 2, 3, 4, 5, 6], reminders: true }}
        afterSave={(m) => syncReminders(m, prefs.notifications.enabled && prefs.notifications.meds)}
        itemTitle={(m) => m.name}
        itemSub={(m) => [m.dosage, m.times.map((t) => t.slice(0, 5)).join(', '), m.weekdays.length < 7 && m.weekdays.map((d) => WEEKDAY_SHORT[d]).join(' ')].filter(Boolean).join(' · ')}
        itemExtra={(m) => <MedHistory m={m} />}
      />
    </>
  );
}

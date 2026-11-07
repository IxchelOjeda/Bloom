import { Stack, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useSyncStatus } from '@/lib/db';
import { exportMyData } from '@/lib/exportData';
import { ensurePermission, rescheduleHydration } from '@/lib/notifications';
import { ModuleKey, usePreferences } from '@/lib/preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { WEEKDAY_SHORT } from '@/lib/dates';
import { Button, Card, Chip, Field, Row, Screen, Section, Toggle, Txt } from '@/components/ui';
import { DateTimeField } from '@/components/pickers';
import { deviceCalendarSupported, ensureCalendarPermission, listCalendars } from '@/lib/deviceCalendar';

const MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'plan', label: 'Planner' }, { key: 'habits', label: 'Habits' }, { key: 'food', label: 'Food & meals' }, { key: 'water', label: 'Water' },
  { key: 'meds', label: 'Medication' }, { key: 'sleep', label: 'Sleep' }, { key: 'mindful', label: 'Wellbeing' }, { key: 'money', label: 'Money' }, { key: 'wishlist', label: 'Wishlists' },
];

export default function Settings() {
  const t = useTheme();
  const { session, signOut, deleteAccount } = useAuth();
  const { prefs, profile, setPrefs, setProfile } = usePreferences();
  const sync = useSyncStatus();
  const [p, setP] = useState({ display_name: '', country: '', language: 'en', currency: 'USD', timezone: 'UTC', date_format: 'yyyy-MM-dd' });
  const [busy, setBusy] = useState<string | null>(null);
  const [kcal, setKcal] = useState(prefs.nutrition_goals?.kcal ? String(prefs.nutrition_goals.kcal) : '');
  const [quiet, setQuiet] = useState({ start: prefs.notifications.quiet_start, end: prefs.notifications.quiet_end });
  const [cals, setCals] = useState<{ id: string; title: string; source: string }[]>([]);
  const integ = prefs.integrations ?? { device_calendar: false };
  useEffect(() => { if (integ.device_calendar) void listCalendars().then(setCals); }, [integ.device_calendar]);

  useEffect(() => {
    if (profile) setP({ display_name: profile.display_name ?? '', country: profile.country ?? '', language: profile.language, currency: profile.currency, timezone: profile.timezone, date_format: profile.date_format });
  }, [profile]);

  const n = prefs.notifications;
  const setN = async (patch: Partial<typeof n>) => {
    const next = { ...n, ...patch };
    if (patch.enabled && !(await ensurePermission())) {
      Alert.alert('Notifications are blocked', "Allow notifications for this app in your phone's settings, then try again.");
      return;
    }
    await setPrefs({ notifications: next });
    if ('enabled' in patch || 'water_every_min' in patch || 'quiet_start' in patch) await rescheduleHydration({ ...prefs, notifications: next }, profile?.wake_time?.slice(0, 5) ?? '08:00');
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Settings' }} />

      <Section title="Profile">
        <Card>
          <Field label="Preferred name" value={p.display_name} onChangeText={(v) => setP({ ...p, display_name: v })} />
          <Row><Field label="Country" value={p.country} onChangeText={(v) => setP({ ...p, country: v.toUpperCase() })} style={{ minWidth: 90 }} />
            <Field label="Language" value={p.language} onChangeText={(v) => setP({ ...p, language: v })} style={{ minWidth: 90 }} />
            <Field label="Currency" value={p.currency} maxLength={3} onChangeText={(v) => setP({ ...p, currency: v.toUpperCase() })} style={{ minWidth: 90 }} /></Row>
          <Field label="Time zone" value={p.timezone} onChangeText={(v) => setP({ ...p, timezone: v })} autoCapitalize="none" />
          <Txt size={13} muted>Units</Txt>
          <Row><Chip label="Metric" selected={profile?.units === 'metric'} onPress={() => setProfile({ units: 'metric' })} /><Chip label="Imperial" selected={profile?.units === 'imperial'} onPress={() => setProfile({ units: 'imperial' })} /></Row>
          <Txt size={13} muted>Week starts on</Txt>
          <Row wrap>{[1, 0, 6].map((d) => <Chip key={d} label={WEEKDAY_SHORT[d]} selected={profile?.week_start === d} onPress={() => setProfile({ week_start: d })} />)}</Row>
          <Txt size={13} muted>Date format</Txt>
          <Row wrap>{['yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy'].map((f) => <Chip key={f} label={f} selected={p.date_format === f} onPress={() => setP({ ...p, date_format: f })} />)}</Row>
          <Button label="Save profile" onPress={() => setProfile({ ...p, display_name: p.display_name || null, country: p.country || null, currency: p.currency.slice(0, 3) || 'USD' })} />
        </Card>
      </Section>

      <Section title="Aesthetic">
        <Button kind="secondary" icon="color-palette-outline" label="Themes, colours & decoration" onPress={() => router.push('/more/theme')} />
      </Section>

      <Section title="Modules">
        <Card>{MODULES.map((m) => <Toggle key={m.key} label={m.label} value={prefs.modules[m.key]} onChange={(v) => setPrefs({ modules: { ...prefs.modules, [m.key]: v } })} />)}</Card>
      </Section>

      <Section title="Notifications">
        <Card>
          <Toggle label="Allow reminders" value={n.enabled} onChange={(v) => setN({ enabled: v })} />
          {n.enabled ? (<>
            <Toggle label="Tasks" value={n.tasks} onChange={(v) => setN({ tasks: v })} />
            <Toggle label="Medication" value={n.meds} onChange={(v) => setN({ meds: v })} />
            <Toggle label="Payments" value={n.payments} onChange={(v) => setN({ payments: v })} />
            <Toggle label="Meals" value={n.meals} onChange={(v) => setN({ meals: v })} />
            <Txt size={13} muted>Quiet hours — reminders wait until they end (except medication)</Txt>
            <Row><View style={{ flex: 1 }}><DateTimeField mode="time" label="From" value={quiet.start} onChange={(v) => setQuiet({ ...quiet, start: v })} /></View>
              <View style={{ flex: 1 }}><DateTimeField mode="time" label="Until" value={quiet.end} onChange={(v) => setQuiet({ ...quiet, end: v })} /></View></Row>
            <Button small kind="secondary" label="Save quiet hours" onPress={() => { const re = /^([01]\d|2[0-3]):[0-5]\d$/; if (re.test(quiet.start) && re.test(quiet.end)) void setN({ quiet_start: quiet.start, quiet_end: quiet.end }); else Alert.alert('Use HH:MM (24h)'); }} />
          </>) : null}
        </Card>
      </Section>

      <Section title="Integrations">
        <Card>
          {deviceCalendarSupported ? (<>
            <Toggle label="Show my phone calendar" hint="Apple Calendar / Google Calendar events appear (read-only) in Today and Calendar, and the planner won't double-book them. They stay on your phone."
              value={integ.device_calendar} onChange={async (v) => {
                if (v && !(await ensureCalendarPermission())) return Alert.alert('Calendar access is off', "Allow calendar access for Orchid in your phone's settings.");
                await setPrefs({ integrations: { ...integ, device_calendar: v } });
              }} />
            {integ.device_calendar && cals.length ? (<>
              <Txt size={13} muted>Which calendars? (none selected = all)</Txt>
              <Row wrap>{cals.map((c) => {
                const on = (integ.device_calendar_ids ?? []).includes(c.id);
                return <Chip key={c.id} label={`${c.title}${c.source ? ` · ${c.source}` : ''}`} selected={on}
                  onPress={() => setPrefs({ integrations: { ...integ, device_calendar_ids: on ? (integ.device_calendar_ids ?? []).filter((x) => x !== c.id) : [...(integ.device_calendar_ids ?? []), c.id] } })} />;
              })}</Row>
            </>) : null}
            <Txt size={12} muted>To copy an Orchid event to your phone calendar, open it and turn on “Also add to my phone calendar”.</Txt>
          </>) : <Txt size={13} muted>Phone calendar sync is available in the iOS and Android app.</Txt>}
        </Card>
      </Section>

      <Section title="Nutrition (optional)">
        <Card>
          <Txt size={13} muted>No targets are set unless you add one. This is for awareness, not medical advice.</Txt>
          <Row><Field value={kcal} onChangeText={setKcal} keyboardType="number-pad" placeholder="Daily kcal goal (optional)" style={{ minWidth: 200 }} />
            <Button small kind="secondary" label="Save" onPress={() => setPrefs({ nutrition_goals: Number(kcal) > 0 ? { kcal: Number(kcal) } : null })} /></Row>
        </Card>
      </Section>

      <Section title="Privacy & data">
        <Card>
          <Toggle label="Let the Life Planner read my schedule" hint="Calendar, tasks, activities, goals, availability and energy only." value={prefs.ai_planner_ok} onChange={(v) => setPrefs({ ai_planner_ok: v })} />
          <Txt size={13} muted>The Recipe AI never reads your data. Your information is never used for advertising.</Txt>
          <Button kind="secondary" icon="download-outline" label="Export all my data (JSON)" loading={busy === 'export'} onPress={async () => {
            setBusy('export');
            try { await exportMyData(session!.user.id); } catch (e) { Alert.alert('Export failed', e instanceof Error ? e.message : String(e)); }
            setBusy(null);
          }} />
        </Card>
      </Section>

      <Section title="Account">
        <Card>
          <Txt size={13} muted>Signed in as {session?.user.email}</Txt>
          <Button kind="secondary" label="Log out" onPress={() => sync.pending
            ? Alert.alert('Some changes are still waiting to sync', `${sync.pending} change${sync.pending > 1 ? 's' : ''} will upload next time you log in on this phone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out anyway', onPress: () => void signOut() }])
            : void signOut()} />
          <Button kind="danger" label="Delete my account" loading={busy === 'delete'} onPress={() => Alert.alert('Delete everything?', 'Your account and all your data will be permanently erased. Consider exporting first.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete forever', style: 'destructive', onPress: async () => { setBusy('delete'); const e = await deleteAccount(); setBusy(null); if (e) Alert.alert('Could not delete', e); } },
          ])} />
        </Card>
      </Section>
      <Txt size={12} muted style={{ textAlign: 'center', color: t.colors.textMuted }}>Orchid 0.1</Txt>
    </Screen>
  );
}

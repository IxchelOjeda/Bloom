import * as Localization from 'expo-localization';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { db } from '@/lib/db';
import { ModuleKey, usePreferences } from '@/lib/preferences';
import { ensurePermission } from '@/lib/notifications';
import { Button, Chip, Field, Progress, Row, Screen, Title, Toggle, Txt } from '@/components/ui';
import { ThemePicker } from '@/components/ThemePicker';
import { WEEKDAY_SHORT } from '@/lib/dates';

const MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'plan', label: 'Planner & tasks' }, { key: 'habits', label: 'Habits' }, { key: 'food', label: 'Food & meals' },
  { key: 'water', label: 'Water' }, { key: 'meds', label: 'Medication reminders' }, { key: 'sleep', label: 'Sleep' },
  { key: 'mindful', label: 'Wellbeing' }, { key: 'money', label: 'Money' }, { key: 'wishlist', label: 'Wishlists' },
];

export default function Onboarding() {
  const { prefs, setPrefs, setProfile } = usePreferences();
  const loc = Localization.getLocales()[0];
  const cal = Localization.getCalendars()[0];
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [country, setCountry] = useState(loc?.regionCode ?? '');
  const [language, setLanguage] = useState(loc?.languageCode ?? 'en');
  const [currency, setCurrency] = useState(loc?.currencyCode ?? 'USD');
  const [tz, setTz] = useState(cal?.timeZone ?? 'UTC');
  const [weekStart, setWeekStart] = useState(cal?.firstWeekday ? cal.firstWeekday - 1 : 1);
  const [wake, setWake] = useState('');
  const [sleep, setSleep] = useState('');
  const [modules, setModules] = useState(prefs.modules);
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);

  const steps = ['You', 'Region', 'Aesthetic', 'Focus', 'Rhythm', 'Reminders'];
  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));

  const finish = async () => {
    setBusy(true);
    const okTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
    await setProfile({
      display_name: name.trim() || null, country: country || null, language, currency: currency.toUpperCase().slice(0, 3),
      timezone: tz, week_start: weekStart, wake_time: okTime(wake) ? wake : null, sleep_time: okTime(sleep) ? sleep : null, onboarded: true,
    });
    const granted = notify ? await ensurePermission() : false;
    await setPrefs({ modules, notifications: { ...prefs.notifications, enabled: granted } });
    // default availability from wake/sleep so the planner has something to work with (editable later)
    if (okTime(wake) && okTime(sleep)) {
      for (let d = 0; d < 7; d++) await db.insert('availability', { weekday: d, start_time: wake, end_time: sleep > wake ? sleep : '23:59' });
    }
    for (const n of ['Personal', 'Work', 'Study', 'Health', 'Home']) await db.insert('categories', { name: n });
    setBusy(false);
    router.replace('/');
  };

  return (
    <Screen>
      <Progress value={(step + 1) / steps.length} />
      <Txt muted size={13}>Step {step + 1} of {steps.length} · you can skip anything and change it later</Txt>

      {step === 0 && (<>
        <Title sub="What should we call you?">Hi there ✦</Title>
        <Field label="Preferred name" value={name} onChangeText={setName} placeholder="Optional" />
      </>)}

      {step === 1 && (<>
        <Title sub="Used for currency, dates and reminders.">Where are you?</Title>
        <Field label="Country (code)" value={country} onChangeText={setCountry} autoCapitalize="characters" />
        <Field label="Language" value={language} onChangeText={setLanguage} autoCapitalize="none" />
        <Field label="Currency" value={currency} onChangeText={setCurrency} autoCapitalize="characters" maxLength={3} />
        <Field label="Time zone" value={tz} onChangeText={setTz} autoCapitalize="none" />
        <Txt size={13} muted>Week starts on</Txt>
        <Row wrap>{[1, 0, 6].map((d) => <Chip key={d} label={WEEKDAY_SHORT[d]} selected={weekStart === d} onPress={() => setWeekStart(d)} />)}</Row>
      </>)}

      {step === 2 && (<>
        <Title sub="It restyles the whole app. Change it any time.">Pick your vibe</Title>
        <ThemePicker value={prefs.theme_id} mode={prefs.theme_mode === 'dark' ? 'dark' : 'light'} onChange={(id) => void setPrefs({ theme_id: id })} />
      </>)}

      {step === 3 && (<>
        <Title sub="Turn off anything you don't need — less is more.">What do you want to organize?</Title>
        {MODULES.map((m) => <Toggle key={m.key} label={m.label} value={modules[m.key]} onChange={(v) => setModules({ ...modules, [m.key]: v })} />)}
      </>)}

      {step === 4 && (<>
        <Title sub="Optional — helps the planner keep your nights free.">Your usual day</Title>
        <Field label="Usually wake up (HH:MM)" value={wake} onChangeText={setWake} placeholder="07:30" autoCapitalize="none" />
        <Field label="Usually wind down by (HH:MM)" value={sleep} onChangeText={setSleep} placeholder="22:30" autoCapitalize="none" />
      </>)}

      {step === 5 && (<>
        <Title sub="Only the ones you choose, and never during quiet hours.">Gentle reminders</Title>
        <Toggle label="Allow reminders" hint="We'll ask your phone for permission now." value={notify} onChange={setNotify} />
      </>)}

      <View style={{ gap: 8, marginTop: 8 }}>
        {step < steps.length - 1 ? <Button label="Continue" onPress={next} /> : <Button label="Start my day" onPress={finish} loading={busy} />}
        <Row>
          {step > 0 ? <Button kind="ghost" label="Back" onPress={() => setStep(step - 1)} /> : null}
          {step < steps.length - 1 ? <Button kind="ghost" label="Skip setup" onPress={finish} /> : null}
        </Row>
      </View>
    </Screen>
  );
}

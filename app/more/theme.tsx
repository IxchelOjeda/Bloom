import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { usePreferences } from '@/lib/preferences';
import { getThemeDef, Seed } from '@/theme/themes';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemePicker } from '@/components/ThemePicker';
import { Button, Card, Chip, Field, Progress, Row, Screen, Section, Segmented, Title, Txt } from '@/components/ui';

const SWATCH_KEYS: (keyof Seed)[] = ['primary', 'secondary', 'accent', 'bg', 'surface', 'text'];

export default function ThemeScreen() {
  const t = useTheme();
  const { prefs, setPrefs } = usePreferences();
  const [key, setKey] = useState<keyof Seed>('primary');
  const [hex, setHex] = useState('');
  const def = getThemeDef(prefs.theme_id);
  const mode = prefs.theme_mode === 'dark' ? 'dark' : 'light';

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Aesthetic' }} />
      <Title sub="Restyles the whole app: colours, fonts, shapes and details.">{def.name}</Title>

      {/* live preview built from the current tokens */}
      <Card>
        <Txt heading size={20}>Today {t.ornaments.join(' ')}</Txt>
        <Progress value={0.6} />
        <Row wrap><Chip label="Selected" selected /><Chip label="Chip" /><Button small label="Button" onPress={() => {}} /></Row>
        <Txt muted size={13}>Secondary text stays readable in every theme.</Txt>
      </Card>

      <Section title="Mode">
        <Segmented value={prefs.theme_mode} onChange={(v) => setPrefs({ theme_mode: v })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Match phone' }]} />
      </Section>
      <Section title="Decoration">
        <Segmented value={String(prefs.decor_intensity) as '0' | '1' | '2' | '3'} onChange={(v) => setPrefs({ decor_intensity: Number(v) })}
          options={[{ value: '0', label: 'Minimal' }, { value: '1', label: 'Subtle' }, { value: '2', label: 'Balanced' }, { value: '3', label: 'Full' }]} />
        <Txt size={12} muted>Minimal removes ornaments and decorative fonts — handy on busy or low-energy days.</Txt>
      </Section>

      <Section title="Choose an aesthetic">
        <ThemePicker value={prefs.theme_id} mode={mode} onChange={(id) => setPrefs({ theme_id: id, custom_colors: {} })} />
      </Section>

      <Section title="Customize colours">
        <Row wrap>{SWATCH_KEYS.map((k) => (
          <Chip key={k} label={k} selected={key === k} onPress={() => { setKey(k); setHex(prefs.custom_colors[k] ?? def[mode][k]); }} />
        ))}</Row>
        <Row>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: /^#[0-9a-f]{6}$/i.test(hex) ? hex : def[mode][key], borderWidth: 1, borderColor: t.colors.border }} />
          <View style={{ flex: 1 }}><Field value={hex} onChangeText={setHex} placeholder={def[mode][key]} autoCapitalize="characters" /></View>
          <Button small kind="secondary" label="Apply" onPress={() => { if (/^#[0-9a-f]{6}$/i.test(hex)) void setPrefs({ custom_colors: { ...prefs.custom_colors, [key]: hex.toUpperCase() } }); }} />
        </Row>
        <Txt size={12} muted>Text colours are automatically adjusted if a choice would be hard to read.</Txt>
        {Object.keys(prefs.custom_colors).length ? <Button kind="ghost" label="Reset to theme colours" onPress={() => setPrefs({ custom_colors: {} })} /> : null}
      </Section>
    </Screen>
  );
}

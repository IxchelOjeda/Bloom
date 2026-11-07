/**
 * Date / time inputs. On iOS and Android they open the native picker (no typing formats);
 * on web they fall back to a validated text field. Values stay plain strings:
 * dates 'YYYY-MM-DD', times 'HH:mm' (24h) — the same format the database uses.
 */
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Field, Txt } from './ui';

const native = Platform.OS === 'ios' || Platform.OS === 'android';

function toDate(value: string, mode: 'date' | 'time'): Date {
  if (mode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  if (mode === 'time' && /^\d{2}:\d{2}/.test(value)) { const d = new Date(); d.setHours(Number(value.slice(0, 2)), Number(value.slice(3, 5)), 0, 0); return d; }
  return new Date();
}

export function DateTimeField({ label, value, onChange, mode, placeholder, allowClear }: {
  label?: string; value: string; onChange: (v: string) => void; mode: 'date' | 'time'; placeholder?: string; allowClear?: boolean;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  if (!native) {
    return <Field label={label} value={value} onChangeText={onChange} placeholder={placeholder ?? (mode === 'date' ? 'YYYY-MM-DD' : 'HH:MM')} autoCapitalize="none" />;
  }
  const shown = !value ? (placeholder ?? 'Not set')
    : mode === 'date' ? format(toDate(value, 'date'), 'EEE, MMM d yyyy') : format(toDate(value, 'time'), 'p');
  const handle = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (e.type === 'dismissed' || !d) return;
    onChange(mode === 'date' ? format(d, 'yyyy-MM-dd') : format(d, 'HH:mm'));
  };
  return (
    <View style={{ gap: 4 }}>
      {label ? <Txt size={13} muted>{label}</Txt> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? mode}: ${shown}`} onPress={() => setOpen((o) => !o)}
        style={{ backgroundColor: t.colors.surface, borderColor: open ? t.colors.primary : t.colors.border, borderWidth: 1, borderRadius: t.radius.sm,
          paddingHorizontal: 12, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={18} color={t.colors.textMuted} />
        <Txt style={{ flex: 1 }} muted={!value}>{shown}</Txt>
        {allowClear && value ? <Pressable hitSlop={10} accessibilityLabel="Clear" onPress={() => onChange('')}><Ionicons name="close-circle" size={18} color={t.colors.textMuted} /></Pressable> : null}
      </Pressable>
      {open ? (
        <>
          <DateTimePicker value={toDate(value, mode)} mode={mode} onChange={handle}
            display={Platform.OS === 'ios' ? (mode === 'date' ? 'inline' : 'spinner') : 'default'}
            accentColor={t.colors.primary} themeVariant={t.mode} minuteInterval={mode === 'time' ? 5 : undefined} />
          {Platform.OS === 'ios' ? <Button small kind="secondary" label="Done" onPress={() => setOpen(false)} /> : null}
        </>
      ) : null}
    </View>
  );
}

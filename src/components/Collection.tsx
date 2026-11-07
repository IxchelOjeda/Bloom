/**
 * Config-driven CRUD screen used by the simpler modules (income, debts, bills, meds,
 * habits, sleep, notes, wishlist…). Every form validates, writes through the offline
 * queue, and every row can be edited or deleted — no dead buttons.
 */
import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { addDays } from 'date-fns';
import { db, useRows } from '@/lib/db';
import { ymd, WEEKDAY_SHORT } from '@/lib/dates';
import { Button, Card, Chip, Empty, Field, IconName, Row, Screen, Sheet, Title, Toggle, Txt } from './ui';
import { DateTimeField } from './pickers';
import { ImageField } from './ImageField';

export type FieldDef =
  | { key: string; label: string; type: 'text' | 'multiline' | 'url'; required?: boolean; placeholder?: string }
  | { key: string; label: string; type: 'number' | 'money'; required?: boolean; min?: number; placeholder?: string }
  | { key: string; label: string; type: 'date' | 'time'; required?: boolean }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; required?: boolean }
  | { key: string; label: string; type: 'bool'; hint?: string }
  | { key: string; label: string; type: 'weekdays' }
  | { key: string; label: string; type: 'times' } // list of HH:mm
  | { key: string; label: string; type: 'image'; prefix: 'receipt' | 'wishlist' }; // private photo path

export interface CollectionProps<T extends { id: string }> {
  table: string;
  title: string;
  subtitle?: string;
  icon?: IconName;
  fields: FieldDef[];
  defaults?: Record<string, unknown>;
  order?: { column: string; ascending?: boolean };
  sort?: (a: T, b: T) => number;
  where?: Record<string, string | number | boolean>; // equality filter, e.g. { kind: 'expense' }
  itemTitle: (r: T) => string;
  itemSub?: (r: T) => string | null;
  itemRight?: (r: T) => React.ReactNode;
  itemExtra?: (r: T) => React.ReactNode;          // e.g. progress bar, quick actions
  emptyText: string;
  header?: React.ReactNode;
  transform?: (values: Record<string, unknown>, existing?: T) => Record<string, unknown>;
  afterSave?: (row: T) => void | Promise<void>; // e.g. (re)schedule reminders
  afterDelete?: (row: T) => void | Promise<void>; // e.g. cancel reminders
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export function validate(fields: FieldDef[], v: Record<string, any>): string | null {
  for (const f of fields) {
    const val = v[f.key];
    const empty = val === undefined || val === null || val === '';
    if ('required' in f && f.required && empty) return `${f.label} is required`;
    if (empty) continue;
    if ((f.type === 'number' || f.type === 'money') && (isNaN(Number(val)) || (f.min !== undefined && Number(val) < f.min))) return `${f.label} must be a number${f.min !== undefined ? ` ≥ ${f.min}` : ''}`;
    if (f.type === 'date' && !DATE_RE.test(val)) return `${f.label}: use YYYY-MM-DD`;
    if (f.type === 'time' && !TIME_RE.test(val)) return `${f.label}: use HH:MM (24h)`;
    if (f.type === 'url' && !/^https?:\/\//i.test(val)) return `${f.label} must start with http:// or https://`;
    if (f.type === 'times' && !(val as string[]).every((x) => TIME_RE.test(x))) return `${f.label}: use HH:MM, comma separated`;
  }
  return null;
}

export function FormFields({ fields, values, set }: { fields: FieldDef[]; values: Record<string, any>; set: (k: string, v: unknown) => void }) {
  return (
    <>
      {fields.map((f) => {
        const v = values[f.key];
        switch (f.type) {
          case 'bool':
            return <Toggle key={f.key} label={f.label} hint={f.hint} value={!!v} onChange={(x) => set(f.key, x)} />;
          case 'select':
            return (
              <View key={f.key} style={{ gap: 6 }}>
                <Txt size={13} muted>{f.label}</Txt>
                <Row wrap>{f.options.map((o) => <Chip key={o.value} label={o.label} selected={v === o.value} onPress={() => set(f.key, o.value)} />)}</Row>
              </View>
            );
          case 'weekdays': {
            const sel: number[] = v ?? [];
            return (
              <View key={f.key} style={{ gap: 6 }}>
                <Txt size={13} muted>{f.label}</Txt>
                <Row wrap>{WEEKDAY_SHORT.map((d, i) => (
                  <Chip key={d} label={d} selected={sel.includes(i)} onPress={() => set(f.key, sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i].sort())} />
                ))}</Row>
              </View>
            );
          }
          case 'date':
            return (
              <View key={f.key} style={{ gap: 6 }}>
                <DateTimeField mode="date" label={f.label} value={v ?? ''} onChange={(x) => set(f.key, x)} allowClear />
                <Row wrap>
                  <Chip label="Today" onPress={() => set(f.key, ymd(new Date()))} />
                  <Chip label="Tomorrow" onPress={() => set(f.key, ymd(addDays(new Date(), 1)))} />
                  <Chip label="Next week" onPress={() => set(f.key, ymd(addDays(new Date(), 7)))} />
                  {v ? <Chip label="Clear" onPress={() => set(f.key, '')} /> : null}
                </Row>
              </View>
            );
          case 'time':
            return <DateTimeField key={f.key} mode="time" label={f.label} value={v ? String(v).slice(0, 5) : ''} onChange={(x) => set(f.key, x)} allowClear />;
          case 'image':
            return <ImageField key={f.key} label={f.label} value={v ?? null} prefix={f.prefix} onChange={(x) => set(f.key, x)} />;
          case 'times':
            return <Field key={f.key} label={f.label} value={(v ?? []).join(', ')} placeholder="08:00, 20:00"
              onChangeText={(x) => set(f.key, x.split(',').map((s) => s.trim()).filter(Boolean))} />;
          default:
            return (
              <Field key={f.key} label={f.label} value={v == null ? '' : String(v)}
                onChangeText={(x) => set(f.key, x)} multiline={f.type === 'multiline'}
                placeholder={'placeholder' in f ? f.placeholder : undefined}
                keyboardType={f.type === 'number' || f.type === 'money' ? 'decimal-pad' : f.type === 'url' ? 'url' : 'default'}
                autoCapitalize={f.type === 'url' ? 'none' : 'sentences'} />
            );
        }
      })}
    </>
  );
}

/** Converts form strings to DB values (numbers, nulls for blanks). */
export function coerce(fields: FieldDef[], v: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const val = v[f.key];
    if (f.type === 'number' || f.type === 'money') out[f.key] = val === '' || val == null ? null : Number(val);
    else if (f.type === 'date' || f.type === 'time' || f.type === 'url' || f.type === 'text' || f.type === 'multiline') out[f.key] = val === '' || val == null ? null : val;
    else out[f.key] = val;
  }
  return out;
}

export function useFormSheet<T extends { id: string }>(table: string, fields: FieldDef[], defaults: Record<string, unknown> = {}, transform?: CollectionProps<T>['transform'], afterSave?: CollectionProps<T>['afterSave'], afterDelete?: CollectionProps<T>['afterDelete']) {
  const [editing, setEditing] = useState<T | null>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);

  const start = (row?: T) => {
    setEditing(row ?? null);
    setValues(row ? { ...row } : { ...defaults });
    setOpen(true);
  };
  const save = async () => {
    const err = validate(fields, values);
    if (err) { Alert.alert('Almost there', err); return; }
    setBusy(true);
    try {
      let data = coerce(fields, values);
      if (transform) data = transform(data, editing ?? undefined);
      let row: T;
      if (editing) { await db.update(table, editing.id, data); row = { ...editing, ...data } as T; }
      else row = (await db.insert(table, { ...defaults, ...data })) as unknown as T;
      setOpen(false);
      try { await afterSave?.(row); } catch { /* side effects (e.g. reminders) must never block saving */ }
    } finally { setBusy(false); }
  };
  const remove = (row: T, label: string) =>
    Alert.alert('Delete?', `"${label}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void db.remove(table, row.id); Promise.resolve(afterDelete?.(row)).catch(() => {}); } },
    ]);
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));
  return { open, setOpen, start, save, remove, values, set, busy, editing };
}

export function Collection<T extends { id: string }>(p: CollectionProps<T>) {
  const where = p.where ?? {};
  const { rows, loading } = useRows<T>(p.table, `${p.table}:${JSON.stringify(where)}`, (q) =>
    q.select('*').match(where).order(p.order?.column ?? 'created_at', { ascending: p.order?.ascending ?? false }),
    (r) => Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v));
  const form = useFormSheet<T>(p.table, p.fields, p.defaults, p.transform, p.afterSave, p.afterDelete);
  const sorted = useMemo(() => (p.sort ? [...rows].sort(p.sort) : rows), [rows, p.sort]);

  return (
    <Screen>
      <Title sub={p.subtitle} right={<Button small icon="add" label="Add" onPress={() => form.start()} />}>{p.title}</Title>
      {p.header}
      {!loading && sorted.length === 0 ? <Empty icon={p.icon} text={p.emptyText} action={{ label: 'Add the first one', onPress: () => form.start() }} /> : null}
      {sorted.map((r) => (
        <Card key={r.id} onPress={() => form.start(r)}>
          <Row>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt weight="600">{p.itemTitle(r)}</Txt>
              {p.itemSub?.(r) ? <Txt size={13} muted>{p.itemSub(r)}</Txt> : null}
            </View>
            {p.itemRight?.(r)}
          </Row>
          {p.itemExtra?.(r)}
        </Card>
      ))}
      <Sheet visible={form.open} onClose={() => form.setOpen(false)} title={form.editing ? `Edit` : `New`}>
        <FormFields fields={p.fields} values={form.values} set={form.set} />
        <Button label="Save" onPress={form.save} loading={form.busy} />
        {form.editing ? <Button kind="ghost" label="Delete" onPress={() => { form.setOpen(false); form.remove(form.editing!, p.itemTitle(form.editing!)); }} /> : null}
      </Sheet>
    </Screen>
  );
}

/**
 * Local notifications via expo-notifications.
 *
 * - Permission is only requested when the user turns reminders on (never at launch).
 * - OS notification ids only exist on the device that scheduled them, so the registry
 *   (refId → os ids) is stored on-device in AsyncStorage, not in the database.
 * - Wall-clock triggers (DAILY / WEEKLY / DATE built from local time) let the OS handle
 *   time zones and daylight-saving shifts.
 * - Quiet hours move non-medication reminders; medication is never shifted.
 * - Every function is a safe no-op on web and when reminders are off.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { adjustForQuietHours, hydrationTimes, reminderTimeFor } from './quietHours';
import type { Preferences } from './preferences';

const native = Platform.OS === 'ios' || Platform.OS === 'android';
const REG_KEY = 'orchid.notification-registry';

if (native) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function ensurePermission(): Promise<boolean> {
  if (!native) return false;
  const cur = await Notifications.getPermissionsAsync();
  let granted = cur.granted;
  if (!granted && cur.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (granted && Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT });
  }
  return granted;
}

export type Kind = 'task' | 'medication' | 'water' | 'payment' | 'meal' | 'event' | 'routine' | 'budget';

// ---------- device-local registry ----------
type Registry = Record<string, string[]>; // key (`kind:refId`) → os ids
async function readReg(): Promise<Registry> {
  try { return JSON.parse((await AsyncStorage.getItem(REG_KEY)) ?? '{}'); } catch { return {}; }
}
async function remember(key: string, osId: string) {
  const r = await readReg(); r[key] = [...(r[key] ?? []), osId]; await AsyncStorage.setItem(REG_KEY, JSON.stringify(r));
}
const keyOf = (kind: Kind, refId: string | null) => `${kind}:${refId ?? '*'}`;

/** Cancels every reminder scheduled on this device for an item (or a whole kind when refId is null). */
export async function cancelFor(refId: string | null, kind?: Kind) {
  if (!native) return;
  const r = await readReg();
  const keys = Object.keys(r).filter((k) => (kind ? k.startsWith(`${kind}:`) : true) && (refId ? k.endsWith(`:${refId}`) : true));
  for (const k of keys) {
    for (const id of r[k]) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    delete r[k];
  }
  await AsyncStorage.setItem(REG_KEY, JSON.stringify(r));
}

const kindAllowed = (p: Preferences, kind: Kind) => {
  const n = p.notifications;
  if (!n.enabled) return false;
  if (kind === 'medication') return n.meds;
  if (kind === 'payment' || kind === 'budget') return n.payments;
  if (kind === 'meal') return n.meals;
  if (kind === 'task' || kind === 'event' || kind === 'routine') return n.tasks;
  return true;
};

export async function scheduleOnce(p: Preferences, kind: Kind, refId: string | null, title: string, body: string, when: Date) {
  if (!native || !kindAllowed(p, kind)) return null;
  const at = adjustForQuietHours(when, p.notifications.quiet_start, p.notifications.quiet_end, kind);
  if (at <= new Date()) return null;
  const osId = await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { kind, refId } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'reminders' },
  });
  await remember(keyOf(kind, refId), osId);
  return osId;
}

/** Repeating reminder at a wall-clock time; weekdays (0=Sun) limits it to those days. */
export async function scheduleRepeating(p: Preferences, kind: Kind, refId: string | null, title: string, body: string, hhmm: string, weekdays?: number[]) {
  if (!native || !kindAllowed(p, kind)) return;
  const [hour, minute] = hhmm.split(':').map(Number);
  const days = weekdays && weekdays.length < 7 ? weekdays : null;
  const triggers = days
    ? days.map((d) => ({ type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: d + 1, hour, minute, channelId: 'reminders' } as const))
    : [{ type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: 'reminders' } as const];
  for (const trigger of triggers) {
    const osId = await Notifications.scheduleNotificationAsync({ content: { title, body, data: { kind, refId } }, trigger });
    await remember(keyOf(kind, refId), osId);
  }
}

// ---------- feature helpers ----------

export async function syncMedicationReminders(p: Preferences, m: { id: string; name: string; dosage: string | null; times: string[]; weekdays: number[]; reminders: boolean; end_date?: string | null }) {
  await cancelFor(m.id, 'medication');
  if (!m.reminders || (m.end_date && m.end_date < new Date().toISOString().slice(0, 10))) return;
  for (const t of m.times) {
    await scheduleRepeating(p, 'medication', m.id, `Time for ${m.name}`, m.dosage ? `${m.dosage} — as you scheduled it` : 'As you scheduled it', t.slice(0, 5), m.weekdays);
  }
}

/** One-off reminder N minutes from now (medication "Snooze"). */
export async function snoozeMedication(name: string, minutes: number, p?: Preferences) {
  if (!native) return;
  if (p && !p.notifications.enabled) return;
  const osId = await Notifications.scheduleNotificationAsync({
    content: { title: `Reminder: ${name}`, body: 'You snoozed this a little while ago.', data: { kind: 'medication' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: minutes * 60, channelId: 'reminders' },
  });
  await remember(keyOf('medication', 'snooze'), osId);
}

/** Task / event / meal reminder: `leadMin` minutes before `at` (or a date-only due date at 09:00). */
export async function syncItemReminder(p: Preferences, kind: 'task' | 'event' | 'meal' | 'routine', refId: string, title: string, at: Date | string | null, leadMin: number | null) {
  await cancelFor(refId, kind);
  if (at == null || leadMin == null) return;
  const fire = reminderTimeFor(at, leadMin);
  const body = leadMin === 0 ? 'Starting now' : `In ${leadMin < 60 ? `${leadMin} min` : `${Math.round(leadMin / 60)} h`}`;
  await scheduleOnce(p, kind, refId, title, body, fire);
}

export async function rescheduleHydration(p: Preferences, wake = '08:00') {
  await cancelFor(null, 'water');
  if (!p.notifications.enabled || !p.modules.water || p.notifications.water_every_min <= 0) return;
  for (const t of hydrationTimes(p.notifications.water_every_min, wake, p.notifications.quiet_start)) {
    await scheduleRepeating(p, 'water', null, 'Water break 💧', 'A few sips count.', t);
  }
}

/** Immediate, at-most-once-per-day alert when today's spending passes the daily limit. */
export async function alertOverDailyLimit(p: Preferences, dateKey: string, spent: string, limit: string) {
  if (!native || !kindAllowed(p, 'budget')) return;
  const flag = `orchid.limit-alert.${dateKey}`;
  if (await AsyncStorage.getItem(flag)) return;
  await AsyncStorage.setItem(flag, '1');
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Daily spending limit reached', body: `You've spent ${spent} of your ${limit} for today. Just a heads-up — no judgement.`, data: { kind: 'budget' } },
    trigger: null,
  });
}

export async function cancelAll() {
  if (!native) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.removeItem(REG_KEY);
}

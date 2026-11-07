/**
 * Local notifications via expo-notifications. Permission is only requested when the
 * user turns reminders on (never at launch). Each scheduled reminder is recorded in the
 * `notifications` table so it can be cancelled when the source item changes.
 * Reminders are scheduled with local wall-clock triggers, so DST shifts are handled by the OS.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { adjustForQuietHours, hydrationTimes } from './quietHours';
import type { Preferences } from './preferences';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function ensurePermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT });
  }
  return res.granted;
}

type Kind = 'task' | 'medication' | 'water' | 'payment' | 'meal' | 'event' | 'routine';

export async function scheduleOnce(p: Preferences, kind: Kind, refId: string | null, title: string, body: string, when: Date) {
  if (!p.notifications.enabled) return null;
  const at = adjustForQuietHours(when, p.notifications.quiet_start, p.notifications.quiet_end, kind);
  if (at <= new Date()) return null;
  const osId = await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { kind, refId } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'reminders' },
  });
  await supabase.from('notifications').insert({ ref_type: kind, ref_id: refId, fire_at: at.toISOString(), os_id: osId });
  return osId;
}

/** Daily repeating reminder at a wall-clock time (e.g. medication at 08:00). */
export async function scheduleDaily(kind: Kind, refId: string | null, title: string, body: string, hhmm: string) {
  const [hour, minute] = hhmm.split(':').map(Number);
  const osId = await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { kind, refId } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: 'reminders' },
  });
  await supabase.from('notifications').insert({ ref_type: kind, ref_id: refId, os_id: osId });
  return osId;
}

export async function cancelFor(refId: string) {
  const { data } = await supabase.from('notifications').select('id, os_id').eq('ref_id', refId);
  for (const n of data ?? []) if (n.os_id) await Notifications.cancelScheduledNotificationAsync(n.os_id);
  await supabase.from('notifications').delete().eq('ref_id', refId);
}

export async function rescheduleHydration(p: Preferences, wake = '08:00') {
  const { data } = await supabase.from('notifications').select('os_id').eq('ref_type', 'water');
  for (const n of data ?? []) if (n.os_id) await Notifications.cancelScheduledNotificationAsync(n.os_id);
  await supabase.from('notifications').delete().eq('ref_type', 'water');
  if (!p.notifications.enabled || !p.modules.water || p.notifications.water_every_min <= 0) return;
  for (const t of hydrationTimes(p.notifications.water_every_min, wake, p.notifications.quiet_start)) {
    await scheduleDaily('water', null, 'Water break 💧', 'A few sips count.', t);
  }
}

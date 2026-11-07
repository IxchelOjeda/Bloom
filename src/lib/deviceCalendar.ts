/**
 * Phone calendar integration via expo-calendar. This covers Apple Calendar on iOS and
 * Google Calendar on Android (and any Google/Outlook account added to the phone), because
 * both sync through the OS calendar store. Everything is opt-in:
 *  - "Add to my phone calendar" copies one Orchid event (and remembers the id to update it).
 *  - "Show phone calendar events" reads busy blocks for Today / Calendar (read-only).
 * Nothing is uploaded to Orchid's servers except the id of a copy you created.
 */
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

export const deviceCalendarSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export async function ensureCalendarPermission(): Promise<boolean> {
  if (!deviceCalendarSupported) return false;
  const cur = await Calendar.getCalendarPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Calendar.requestCalendarPermissionsAsync()).granted;
}

export async function listCalendars() {
  if (!(await ensureCalendarPermission())) return [];
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return cals.map((c) => ({ id: c.id, title: c.title, color: c.color, source: c.source?.name ?? '', writable: c.allowsModifications }));
}

async function writableCalendarId(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    try { return (await Calendar.getDefaultCalendarAsync()).id; } catch { /* fall through */ }
  }
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const ok = cals.filter((c) => c.allowsModifications);
  return (ok.find((c) => c.isPrimary) ?? ok[0])?.id ?? null;
}

export interface ExternalRef { device?: { calendarId: string; eventId: string } }

/** Creates or updates the phone-calendar copy of an event. Returns the new external_ref. */
export async function upsertDeviceEvent(e: { title: string; starts_at: string; ends_at: string; all_day?: boolean; notes?: string | null; location?: string | null; external_ref?: ExternalRef | null }): Promise<ExternalRef> {
  if (!(await ensureCalendarPermission())) throw new Error('Calendar access is off for Orchid in your phone settings.');
  const details = { title: e.title, startDate: new Date(e.starts_at), endDate: new Date(e.ends_at), allDay: !!e.all_day, notes: e.notes ?? undefined, location: e.location ?? undefined };
  const existing = e.external_ref?.device;
  if (existing) {
    try { await Calendar.updateEventAsync(existing.eventId, details); return { ...e.external_ref, device: existing }; } catch { /* deleted on the phone → recreate */ }
  }
  const calendarId = await writableCalendarId();
  if (!calendarId) throw new Error('No writable calendar found on this phone.');
  const eventId = await Calendar.createEventAsync(calendarId, details);
  return { ...e.external_ref, device: { calendarId, eventId } };
}

export async function removeDeviceEvent(ref?: ExternalRef | null) {
  if (!ref?.device || !deviceCalendarSupported) return;
  try { await Calendar.deleteEventAsync(ref.device.eventId); } catch { /* already gone */ }
}

export interface BusyBlock { id: string; title: string; start: Date; end: Date; allDay: boolean; calendar: string }

/** Read-only events from the phone's calendars in a range (excludes copies Orchid created). */
export async function deviceEvents(from: Date, to: Date, calendarIds?: string[], ownCopies: Set<string> = new Set()): Promise<BusyBlock[]> {
  if (!deviceCalendarSupported) return [];
  const perm = await Calendar.getCalendarPermissionsAsync();
  if (!perm.granted) return [];
  const cals = calendarIds?.length ? calendarIds : (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).map((c) => c.id);
  if (!cals.length) return [];
  const evs = await Calendar.getEventsAsync(cals, from, to);
  return evs.filter((x) => !ownCopies.has(x.id)).map((x) => ({
    id: x.id, title: x.title || 'Busy', start: new Date(x.startDate), end: new Date(x.endDate), allDay: x.allDay, calendar: x.calendarId,
  }));
}

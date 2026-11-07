import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { BusyBlock, deviceEvents } from './deviceCalendar';
import { usePreferences } from './preferences';

/** Phone-calendar events in [from, to] when the person opted in (Settings → Integrations); otherwise []. */
export function useDeviceEvents(from: Date, to: Date, ownCopies: string[] = []): BusyBlock[] {
  const { prefs } = usePreferences();
  const on = prefs.integrations?.device_calendar;
  const ids = prefs.integrations?.device_calendar_ids;
  const [rows, setRows] = useState<BusyBlock[]>([]);
  const key = `${+from}|${+to}|${ownCopies.join(',')}|${(ids ?? []).join(',')}`;
  useEffect(() => {
    if (!on) { setRows([]); return; }
    let alive = true;
    const load = () => deviceEvents(from, to, ids, new Set(ownCopies)).then((r) => alive && setRows(r)).catch(() => alive && setRows([]));
    void load();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void load(); }); // pick up edits made in the Calendar app
    return () => { alive = false; sub.remove(); };
  }, [on, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}

/**
 * Notification timing rules (pure). Reminders that would fire during quiet hours
 * are moved to the end of quiet hours — except medication, which the user
 * scheduled deliberately and is never shifted.
 */
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function isQuiet(d: Date, start: string, end: string): boolean {
  const m = d.getHours() * 60 + d.getMinutes();
  const s = toMin(start), e = toMin(end);
  return s <= e ? m >= s && m < e : m >= s || m < e; // handles windows crossing midnight
}

export function adjustForQuietHours(fireAt: Date, start: string, end: string, kind: string): Date {
  if (kind === 'medication' || !isQuiet(fireAt, start, end)) return fireAt;
  const out = new Date(fireAt);
  const [eh, em] = end.split(':').map(Number);
  if (out.getHours() * 60 + out.getMinutes() >= toMin(end)) out.setDate(out.getDate() + 1);
  out.setHours(eh, em, 0, 0);
  return out;
}

/** Hydration reminders between wake and quiet start, every N minutes, max 8/day to avoid overload. */
export function hydrationTimes(everyMin: number, wake: string, quietStart: string, max = 8): string[] {
  const out: string[] = [];
  for (let m = toMin(wake) + everyMin; m < toMin(quietStart) && out.length < max; m += everyMin) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

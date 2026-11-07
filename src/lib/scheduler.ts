/**
 * Scheduling engine (pure, unit-tested).
 *
 * Two jobs:
 *  1. planSessions()  — deterministic allocator: splits a workload into sessions and
 *     fits them into free time, respecting availability, existing events, rest days,
 *     energy, breaks and the deadline. Used as the offline fallback and to "repair"
 *     AI proposals.
 *  2. validateProposal() — checks any proposal (AI or manual) before the user is
 *     asked to approve it: no overlaps, inside availability, not on blocked days,
 *     before the deadline. The AI never writes to the DB; only validated, approved
 *     items are inserted.
 */

export type Energy = 'very_low' | 'low' | 'medium' | 'high';
export type DayKind = 'rest' | 'active_recovery' | 'low_workload' | 'unavailable' | 'vacation';

export interface Interval { start: Date; end: Date }
export interface AvailabilityRule { weekday: number; start: string; end: string } // "HH:mm" local
export interface BusyBlock extends Interval { title?: string }

export interface PlanInput {
  title: string;
  totalMinutes: number;
  sessionMinutes?: number;          // preferred session length (default 50)
  breakMinutes?: number;            // gap between sessions on the same day (default 10)
  from: Date;                       // earliest start
  deadline: Date;                   // must finish before
  demanding?: boolean;              // avoid rest / low-energy days
  availability: AvailabilityRule[];
  busy: BusyBlock[];
  dayFlags: Record<string, DayKind>; // 'yyyy-MM-dd' → kind
  energy?: Record<string, Energy>;   // 'yyyy-MM-dd' → level (forecast or logged)
  maxMinutesPerDay?: number;         // overall cap so one day isn't overloaded (default 240)
  allowedDays?: number[];            // optional weekday whitelist from the user's message
}

export interface ProposedSession extends Interval { title: string; minutes: number; note?: string }

export interface PlanResult {
  sessions: ProposedSession[];
  scheduledMinutes: number;
  unscheduledMinutes: number;
  warnings: string[];
}

const MIN = 60_000;
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at = (day: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day); d.setHours(h, m, 0, 0); return d;
};
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Fraction of normal capacity to use on a given day. */
export function capacityFactor(kind: DayKind | undefined, energy: Energy | undefined, demanding: boolean): number {
  if (kind === 'rest' || kind === 'unavailable' || kind === 'vacation') return 0;
  let f = 1;
  if (kind === 'low_workload') f = 0.5;
  if (kind === 'active_recovery') f = demanding ? 0 : 0.5;
  if (energy === 'very_low') f *= demanding ? 0 : 0.35;
  else if (energy === 'low') f *= demanding ? 0.4 : 0.6;
  return f;
}

/** Free intervals of a day = availability windows minus busy blocks. */
export function freeIntervals(day: Date, rules: AvailabilityRule[], busy: BusyBlock[]): Interval[] {
  const windows = rules
    .filter((r) => r.weekday === day.getDay())
    .map((r) => ({ start: at(day, r.start), end: at(day, r.end) }))
    .sort((a, b) => +a.start - +b.start);
  const out: Interval[] = [];
  for (const w of windows) {
    let pieces: Interval[] = [w];
    for (const b of busy) {
      pieces = pieces.flatMap((p) => {
        if (!overlaps(p, b)) return [p];
        const res: Interval[] = [];
        if (b.start > p.start) res.push({ start: p.start, end: b.start });
        if (b.end < p.end) res.push({ start: b.end, end: p.end });
        return res;
      });
    }
    out.push(...pieces.filter((p) => +p.end - +p.start >= 15 * MIN));
  }
  return out;
}

/** Minutes of an interval that can hold sessions of `len` separated by `gap`. */
export function packable(intervalMin: number, len: number, gap: number): number {
  const n = Math.floor((intervalMin + gap) / (len + gap));
  const used = n * len + Math.max(0, n - 1) * gap;
  const tail = intervalMin - used - (n > 0 ? gap : 0);
  return n * len + (tail >= 15 ? tail : 0);
}

export function planSessions(input: PlanInput): PlanResult {
  const sessionLen = input.sessionMinutes ?? 50;
  const gap = input.breakMinutes ?? 10;
  const maxPerDay = input.maxMinutesPerDay ?? 240;
  const warnings: string[] = [];

  // 1. Capacity per eligible day
  type Day = { date: Date; free: Interval[]; cap: number };
  const days: Day[] = [];
  const cursor = new Date(input.from); cursor.setHours(0, 0, 0, 0);
  while (cursor < input.deadline) {
    const k = dayKey(cursor);
    const allowed = !input.allowedDays || input.allowedDays.includes(cursor.getDay());
    const factor = allowed ? capacityFactor(input.dayFlags[k], input.energy?.[k], !!input.demanding) : 0;
    if (factor > 0) {
      const free = freeIntervals(cursor, input.availability, input.busy)
        .map((i) => ({ start: new Date(Math.max(+i.start, +input.from)), end: new Date(Math.min(+i.end, +input.deadline)) }))
        .filter((i) => +i.end - +i.start >= 15 * MIN);
      // capacity counts only minutes that can hold sessions once breaks are inserted
      const usable = free.reduce((s, i) => s + packable((+i.end - +i.start) / MIN, sessionLen, gap), 0);
      if (usable > 0) days.push({ date: new Date(cursor), free, cap: Math.floor(Math.min(usable, maxPerDay) * factor) });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const totalCap = days.reduce((s, d) => s + d.cap, 0);
  if (totalCap === 0) {
    return { sessions: [], scheduledMinutes: 0, unscheduledMinutes: input.totalMinutes, warnings: ['No available time before the deadline.'] };
  }

  // 2. Spread proportionally to capacity (avoids front-loading → gentler weeks)
  let remaining = input.totalMinutes;
  const share = days.map((d) => Math.min(d.cap, Math.round((d.cap / totalCap) * input.totalMinutes)));
  // top up rounding leftovers onto days with spare capacity
  let diff = input.totalMinutes - share.reduce((a, b) => a + b, 0);
  for (let i = 0; diff > 0 && i < days.length; i++) {
    const add = Math.min(diff, days[i].cap - share[i]); share[i] += add; diff -= add;
  }

  // 3. Place sessions inside free intervals. Each interval keeps a cursor so a second
  //    pass can top up rounding leftovers without overlapping the first pass.
  const sessions: ProposedSession[] = [];
  const cursors = days.map((d) => d.free.map((iv) => +iv.start));
  const placed = days.map(() => 0);
  const place = (i: number, want: number) => {
    const d = days[i];
    d.free.forEach((iv, k) => {
      while (want >= 15 && placed[i] < d.cap) {
        const t = cursors[i][k];
        const len = Math.min(sessionLen, want, d.cap - placed[i], Math.floor((+iv.end - t) / MIN));
        if (len < 15) break;
        sessions.push({ title: input.title, start: new Date(t), end: new Date(t + len * MIN), minutes: len });
        want -= len; remaining -= len; placed[i] += len;
        cursors[i][k] = t + (len + gap) * MIN;
      }
    });
  };
  days.forEach((_, i) => place(i, share[i]));
  for (let i = 0; remaining >= 15 && i < days.length; i++) place(i, remaining);

  sessions.sort((a, b) => +a.start - +b.start);
  sessions.forEach((s, i) => (s.note = `Session ${i + 1} of ${sessions.length}`));
  if (remaining > 0) warnings.push(`${remaining} min didn't fit before the deadline. Consider extending it or adding time.`);
  return { sessions, scheduledMinutes: input.totalMinutes - Math.max(0, remaining), unscheduledMinutes: Math.max(0, remaining), warnings };
}

export interface ValidationIssue { index: number; problem: string }

export function validateProposal(
  items: Interval[],
  ctx: { busy: BusyBlock[]; availability?: AvailabilityRule[]; dayFlags: Record<string, DayKind>; deadline?: Date; demanding?: boolean },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  items.forEach((it, i) => {
    if (!(it.start instanceof Date) || isNaN(+it.start) || isNaN(+it.end) || it.end <= it.start) {
      issues.push({ index: i, problem: 'invalid time range' }); return;
    }
    const kind = ctx.dayFlags[dayKey(it.start)];
    if (kind === 'rest' || kind === 'unavailable' || kind === 'vacation') issues.push({ index: i, problem: `falls on a ${kind} day` });
    if (ctx.demanding && kind === 'active_recovery') issues.push({ index: i, problem: 'demanding work on a recovery day' });
    if (ctx.deadline && it.end > ctx.deadline) issues.push({ index: i, problem: 'ends after the deadline' });
    const clash = ctx.busy.find((b) => overlaps(it, b));
    if (clash) issues.push({ index: i, problem: `overlaps "${clash.title ?? 'existing event'}"` });
    items.forEach((other, j) => { if (j > i && overlaps(it, other)) issues.push({ index: j, problem: `overlaps proposed item ${i + 1}` }); });
    if (ctx.availability?.length) {
      const inside = freeIntervals(it.start, ctx.availability, []).some((w) => it.start >= w.start && it.end <= w.end);
      if (!inside) issues.push({ index: i, problem: 'outside your available hours' });
    }
  });
  return issues;
}

/** Options shown when a task is missed — never auto-moves everything to tomorrow. */
export type MissedChoice = 'tomorrow' | 'pick_date' | 'next_free' | 'unscheduled' | 'not_relevant';

export function nextFreeSlot(after: Date, minutes: number, rules: AvailabilityRule[], busy: BusyBlock[], dayFlags: Record<string, DayKind>, horizonDays = 14): Interval | null {
  const day = new Date(after); day.setHours(0, 0, 0, 0);
  for (let i = 0; i < horizonDays; i++) {
    const kind = dayFlags[dayKey(day)];
    if (!(kind === 'rest' || kind === 'unavailable' || kind === 'vacation')) {
      for (const iv of freeIntervals(day, rules, busy)) {
        const start = new Date(Math.max(+iv.start, +after));
        if (+iv.end - +start >= minutes * MIN) return { start, end: new Date(+start + minutes * MIN) };
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return null;
}

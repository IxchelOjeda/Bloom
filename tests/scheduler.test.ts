import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSessions, validateProposal, capacityFactor, nextFreeSlot, dayKey, AvailabilityRule } from '../src/lib/scheduler';

// The spec's example: 10 lectures in a week; Mon 3h, Wed 3h, Thu 2h, Sat 4h.
// Week of Mon 2026-11-09.
const avail: AvailabilityRule[] = [
  { weekday: 1, start: '09:00', end: '12:00' },
  { weekday: 3, start: '09:00', end: '12:00' },
  { weekday: 4, start: '14:00', end: '16:00' },
  { weekday: 6, start: '10:00', end: '14:00' },
];
const from = new Date(2026, 10, 9, 0, 0);
const deadline = new Date(2026, 10, 15, 23, 59);
const lectures = 10 * 60; // 600 min = 10 h; capacity 12 h

test('fits a 10-lecture workload into the stated availability', () => {
  const r = planSessions({ title: 'Lectures', totalMinutes: lectures, from, deadline, availability: avail, busy: [], dayFlags: {} });
  assert.equal(r.unscheduledMinutes, 0);
  assert.equal(r.sessions.reduce((s, x) => s + x.minutes, 0), lectures);
  const days = new Set(r.sessions.map((s) => s.start.getDay()));
  for (const d of days) assert.ok([1, 3, 4, 6].includes(d), `scheduled on unavailable weekday ${d}`);
  assert.deepEqual(validateProposal(r.sessions, { busy: [], availability: avail, dayFlags: {}, deadline }), []);
});

test('breaks are inserted between sessions on the same day', () => {
  const r = planSessions({ title: 'L', totalMinutes: 170, from, deadline: new Date(2026, 10, 9, 23), availability: avail, busy: [], dayFlags: {}, breakMinutes: 10 });
  for (let i = 1; i < r.sessions.length; i++) assert.ok(+r.sessions[i].start - +r.sessions[i - 1].end >= 10 * 60000);
});

test('never schedules over an existing commitment', () => {
  const busy = [{ title: 'Doctor', start: new Date(2026, 10, 9, 10), end: new Date(2026, 10, 9, 11) }];
  const r = planSessions({ title: 'L', totalMinutes: lectures, from, deadline, availability: avail, busy, dayFlags: {} });
  for (const s of r.sessions) assert.ok(!(s.start < busy[0].end && busy[0].start < s.end), 'overlaps doctor');
});

test('rest day gets nothing; overflow is reported, not crammed', () => {
  // Saturday rest → Mon 150 + Wed 150 + Thu 100 usable minutes once 10-min breaks are included = 400
  const flags = { [dayKey(new Date(2026, 10, 14))]: 'rest' as const };
  const r = planSessions({ title: 'L', totalMinutes: lectures, from, deadline, availability: avail, busy: [], dayFlags: flags });
  assert.ok(r.sessions.every((s) => s.start.getDay() !== 6));
  assert.equal(r.unscheduledMinutes, 200);
  assert.equal(r.scheduledMinutes, 400);
  assert.equal(r.warnings.length, 1);
});

test('low energy days get lighter load for demanding work', () => {
  assert.equal(capacityFactor(undefined, 'very_low', true), 0);
  assert.ok(capacityFactor(undefined, 'low', true) < capacityFactor(undefined, 'medium', true));
  assert.equal(capacityFactor('active_recovery', 'high', true), 0);
  assert.equal(capacityFactor('active_recovery', 'high', false), 0.5);
});

test('validator catches overlaps, rest days, deadline and out-of-hours items', () => {
  const items = [
    { start: new Date(2026, 10, 9, 9), end: new Date(2026, 10, 9, 10) },
    { start: new Date(2026, 10, 9, 9, 30), end: new Date(2026, 10, 9, 10, 30) }, // overlaps #1
    { start: new Date(2026, 10, 10, 9), end: new Date(2026, 10, 10, 10) },        // Tuesday: no availability
    { start: new Date(2026, 10, 20, 9), end: new Date(2026, 10, 20, 10) },        // after deadline
  ];
  const issues = validateProposal(items, { busy: [], availability: avail, dayFlags: {}, deadline });
  assert.ok(issues.some((i) => i.index === 1 && /overlaps proposed/.test(i.problem)));
  assert.ok(issues.some((i) => i.index === 2 && /available hours/.test(i.problem)));
  assert.ok(issues.some((i) => i.index === 3 && /deadline/.test(i.problem)));
});

test('next free slot skips rest days and busy blocks', () => {
  const after = new Date(2026, 10, 9, 9);
  const busy = [{ start: new Date(2026, 10, 9, 9), end: new Date(2026, 10, 9, 12) }];
  const slot = nextFreeSlot(after, 60, avail, busy, { [dayKey(new Date(2026, 10, 11))]: 'rest' });
  assert.ok(slot);
  assert.equal(slot!.start.getDay(), 4); // Mon busy, Wed rest → Thursday
});

test('odd totals are fully placed (no rounding loss)', () => {
  const r = planSessions({ title: 'L', totalMinutes: 437, from, deadline, availability: avail, busy: [], dayFlags: {} });
  assert.equal(r.unscheduledMinutes, 0);
  assert.deepEqual(validateProposal(r.sessions, { busy: [], availability: avail, dayFlags: {}, deadline }), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, flush, applyPending, EMPTY, NetworkError, Transport } from '../src/lib/offlineQueue';
import { THEMES, buildTheme, contrast } from '../src/theme/themes';
import { adjustForQuietHours, hydrationTimes, isQuiet } from '../src/lib/quietHours';

// ---------- offline queue ----------
test('edits to one row coalesce; create+delete offline cancels out', () => {
  let s = enqueue(EMPTY, { kind: 'insert', table: 'tasks', id: 'a', row: { id: 'a', title: 'x' }, ts: 1 });
  s = enqueue(s, { kind: 'patch', table: 'tasks', id: 'a', patch: { status: 'done' }, ts: 2 });
  assert.equal(s.pending.length, 1);
  assert.deepEqual((s.pending[0] as any).row, { id: 'a', title: 'x', status: 'done' });
  s = enqueue(s, { kind: 'delete', table: 'tasks', id: 'a', ts: 3 });
  assert.equal(s.pending.length, 0);
});

test('flush stops on network error and keeps order; rejections are surfaced, not retried forever', async () => {
  const sent: string[] = [];
  let offline = true;
  const t: Transport = {
    insert: async (_t, r) => { if (offline) throw new NetworkError('offline'); sent.push(String(r.id)); },
    patch: async (_t, id) => { if (id === 'bad') throw new Error('RLS violation'); sent.push(id); },
    remove: async () => {},
  };
  let s = enqueue(EMPTY, { kind: 'insert', table: 'tasks', id: '1', row: { id: '1' }, ts: 1 });
  s = enqueue(s, { kind: 'patch', table: 'goals', id: 'bad', patch: { x: 1 }, ts: 2 });
  s = enqueue(s, { kind: 'insert', table: 'tasks', id: '2', row: { id: '2' }, ts: 3 });
  s = await flush(s, t);
  assert.equal(s.pending.length, 3);
  offline = false;
  s = await flush(s, t);
  assert.deepEqual(sent, ['1', '2']);
  assert.equal(s.pending.length, 0);
  assert.equal(s.failed.length, 1);
});

test('pending ops overlay cached rows', () => {
  const rows = [{ id: 'a', t: 'old' }, { id: 'b', t: 'keep' }];
  const out = applyPending(rows, 'x', [
    { kind: 'patch', table: 'x', id: 'a', patch: { t: 'new' }, ts: 1 },
    { kind: 'insert', table: 'x', id: 'c', row: { id: 'c', t: 'added' }, ts: 2 },
    { kind: 'delete', table: 'x', id: 'b', ts: 3 },
  ]);
  assert.deepEqual(out, [{ id: 'a', t: 'new' }, { id: 'c', t: 'added' }]);
});

// ---------- themes ----------
test('there are exactly 20 themes with unique ids', () => {
  assert.equal(THEMES.length, 20);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, 20);
});

for (const def of THEMES) {
  for (const mode of ['light', 'dark'] as const) {
    test(`${def.id}/${mode} meets contrast minimums`, () => {
      const th = buildTheme(def.id, { mode });
      const c = th.colors;
      assert.ok(contrast(c.text, c.surface) >= 7, 'body text');
      assert.ok(contrast(c.text, c.bg) >= 4.5, 'text on background');
      assert.ok(contrast(c.textMuted, c.surface) >= 4.5, 'muted text');
      assert.ok(contrast(c.onPrimary, c.primary) >= 3, 'button label');
      assert.ok(contrast(c.primary, c.surface) >= 3, 'primary on surface');
      assert.ok(contrast(c.calTodayText, c.calToday) >= 3, 'calendar today');
    });
  }
}

test('minimal variation strips ornaments and decorative fonts', () => {
  const t = buildTheme('coquette', { mode: 'light', decor: 0 });
  assert.equal(t.isMinimal, true);
  assert.deepEqual(t.ornaments, []);
  assert.equal(t.font.heading, 'sans');
});

test('custom colours are still forced readable', () => {
  const t = buildTheme('clean_girl', { mode: 'light', custom: { text: '#FAFAFA' } });
  assert.ok(contrast(t.colors.text, t.colors.surface) >= 7);
});

// ---------- notification timing ----------
test('quiet hours across midnight', () => {
  assert.equal(isQuiet(new Date(2026, 0, 1, 23, 0), '22:00', '07:00'), true);
  assert.equal(isQuiet(new Date(2026, 0, 1, 6, 59), '22:00', '07:00'), true);
  assert.equal(isQuiet(new Date(2026, 0, 1, 12, 0), '22:00', '07:00'), false);
  const moved = adjustForQuietHours(new Date(2026, 0, 1, 23, 30), '22:00', '07:00', 'task');
  assert.equal(moved.getDate(), 2); assert.equal(moved.getHours(), 7);
  const med = new Date(2026, 0, 1, 23, 30);
  assert.equal(+adjustForQuietHours(med, '22:00', '07:00', 'medication'), +med);
});

test('hydration reminders are capped to avoid overload', () => {
  assert.equal(hydrationTimes(30, '07:00', '22:00').length, 8);
  assert.deepEqual(hydrationTimes(180, '08:00', '22:00'), ['11:00', '14:00', '17:00', '20:00']);
});

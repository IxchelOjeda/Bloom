import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savingsPace, debtPayoff, monthSummary, limitFor, spendingToday, monthlyEquivalent } from '../src/lib/finance';

test('savings pace per day/week/month', () => {
  const p = savingsPace(1500, 300, new Date(2027, 0, 6), new Date(2026, 10, 7)); // 60 days
  assert.equal(p.remaining, 1200);
  assert.equal(p.days, 60);
  assert.equal(p.perDay, 20);
  assert.equal(p.perWeek, 140);
  assert.ok(Math.abs(p.perMonth - 608.69) < 0.5);
});

test('savings: done and overdue states', () => {
  assert.equal(savingsPace(100, 100, new Date()).done, true);
  assert.equal(savingsPace(100, 10, new Date(2020, 0, 1)).overdue, true);
});

test('debt payoff with and without interest', () => {
  assert.deepEqual(debtPayoff(1000, null, 100), { months: 10, totalInterest: 0 });
  const r = debtPayoff(1000, 24, 100)!;
  assert.equal(r.months, 12); // n = -ln(1 - rB/P) / ln(1 + r) = 11.27 → 12
  assert.ok(r.totalInterest > 100 && r.totalInterest < 130);
  assert.equal(debtPayoff(1000, 24, 20), null); // payment never covers 2%/month interest
});

test('month summary does not double count', () => {
  const s = monthSummary([
    { kind: 'income', amount: 2000, occurred_on: '2026-11-01' },
    { kind: 'expense', amount: 50, occurred_on: '2026-11-02', category: 'Food' },
    { kind: 'expense', amount: 30, occurred_on: '2026-11-03', category: 'Food' },
    { kind: 'debt_payment', amount: 200, occurred_on: '2026-11-05' },
    { kind: 'savings_contribution', amount: 300, occurred_on: '2026-11-05' },
    { kind: 'expense', amount: 999, occurred_on: '2026-10-31' },
  ], '2026-11');
  assert.equal(s.expenses, 80);
  assert.equal(s.byCategory.Food, 80);
  assert.equal(s.net, 1420);
});

test('daily limit: date override beats weekday default', () => {
  const rules = [{ weekday: 5, amount: 80 }, { weekday: 1, amount: 20 }, { date: '2026-11-13', amount: 150 }];
  assert.equal(limitFor(new Date(2026, 10, 9), rules), 20);   // Monday
  assert.equal(limitFor(new Date(2026, 10, 13), rules), 150); // Friday override
  assert.equal(limitFor(new Date(2026, 10, 10), rules), null);
  const t = spendingToday(new Date(2026, 10, 9), rules, [{ kind: 'expense', amount: 25, occurred_on: '2026-11-09' }]);
  assert.deepEqual(t, { limit: 20, spent: 25, remaining: -5, over: true });
});

test('monthly equivalents', () => {
  assert.equal(monthlyEquivalent(100, 'weekly'), 433.33);
  assert.equal(monthlyEquivalent(1200, 'annually'), 100);
});

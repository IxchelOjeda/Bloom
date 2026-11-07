/** Money maths (pure, unit-tested). Amounts are numbers in the account's currency. */

export type Frequency = 'once' | 'weekly' | 'biweekly' | 'twice_monthly' | 'monthly' | 'quarterly' | 'annually' | 'custom';

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

/** Average monthly equivalent of a recurring amount. */
export function monthlyEquivalent(amount: number, f: Frequency): number {
  const perYear: Record<Frequency, number> = { once: 0, custom: 0, weekly: 52, biweekly: 26, twice_monthly: 24, monthly: 12, quarterly: 4, annually: 1 };
  return round2((amount * perYear[f]) / 12);
}

export interface SavingsPace { remaining: number; days: number; perDay: number; perWeek: number; perMonth: number; done: boolean; overdue: boolean }

export function savingsPace(target: number, current: number, targetDate: Date | null, today = new Date()): SavingsPace {
  const remaining = round2(Math.max(0, target - current));
  if (remaining === 0) return { remaining, days: 0, perDay: 0, perWeek: 0, perMonth: 0, done: true, overdue: false };
  if (!targetDate) return { remaining, days: Infinity, perDay: 0, perWeek: 0, perMonth: 0, done: false, overdue: false };
  const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
  const t1 = new Date(targetDate); t1.setHours(0, 0, 0, 0);
  const days = Math.round((+t1 - +t0) / DAY);
  if (days <= 0) return { remaining, days: 0, perDay: remaining, perWeek: remaining, perMonth: remaining, done: false, overdue: true };
  return {
    remaining, days, done: false, overdue: false,
    perDay: round2(remaining / days),
    perWeek: round2(remaining / Math.max(1, days / 7)),
    perMonth: round2(remaining / Math.max(1, days / 30.4375)),
  };
}

/** Months to pay off a debt at a fixed payment. Returns null if the payment never covers interest. */
export function debtPayoff(balance: number, aprPct: number | null, payment: number): { months: number; totalInterest: number } | null {
  if (balance <= 0) return { months: 0, totalInterest: 0 };
  if (payment <= 0) return null;
  const r = (aprPct ?? 0) / 100 / 12;
  if (r > 0 && payment <= balance * r) return null;
  let b = balance, months = 0, interest = 0;
  while (b > 0.005 && months < 1200) {
    const i = b * r; interest += i; b = b + i - payment; months++;
  }
  return { months, totalInterest: round2(interest) };
}

export interface Tx { kind: 'expense' | 'income' | 'debt_payment' | 'savings_contribution' | 'transfer'; amount: number; occurred_on: string; category?: string | null }

export function monthSummary(txs: Tx[], month: string /* yyyy-MM */) {
  const inMonth = txs.filter((t) => t.occurred_on.startsWith(month));
  const sum = (k: Tx['kind']) => round2(inMonth.filter((t) => t.kind === k).reduce((s, t) => s + t.amount, 0));
  const byCategory: Record<string, number> = {};
  for (const t of inMonth) if (t.kind === 'expense') byCategory[t.category ?? 'Other'] = round2((byCategory[t.category ?? 'Other'] ?? 0) + t.amount);
  const income = sum('income'), expenses = sum('expense'), debt = sum('debt_payment'), saved = sum('savings_contribution');
  return { income, expenses, debtPayments: debt, saved, net: round2(income - expenses - debt - saved), byCategory };
}

export interface DailyLimitRule { weekday?: number | null; date?: string | null; amount: number }

/** Date-specific override wins over the weekday default. */
export function limitFor(date: Date, rules: DailyLimitRule[]): number | null {
  const k = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const exact = rules.find((r) => r.date === k);
  if (exact) return exact.amount;
  const wd = rules.find((r) => r.weekday === date.getDay() && !r.date);
  return wd ? wd.amount : null;
}

export function spendingToday(date: Date, rules: DailyLimitRule[], txs: Tx[]) {
  const k = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const spent = round2(txs.filter((t) => t.kind === 'expense' && t.occurred_on === k).reduce((s, t) => s + t.amount, 0));
  const limit = limitFor(date, rules);
  return { limit, spent, remaining: limit == null ? null : round2(limit - spent), over: limit != null && spent > limit };
}

export function formatMoney(n: number, currency: string, locale?: string) {
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}

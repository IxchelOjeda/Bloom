import { router } from 'expo-router';
import { format, subMonths } from 'date-fns';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRows } from '@/lib/db';
import { ymd } from '@/lib/dates';
import { formatMoney, monthlyEquivalent, monthSummary, spendingToday, Tx } from '@/lib/finance';
import { usePreferences } from '@/lib/preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Empty, NavTile, Progress, Row, Screen, Section, Stat, Title, Txt } from '@/components/ui';

export default function Money() {
  const t = useTheme();
  const { prefs, profile } = usePreferences();
  const cur = profile?.currency ?? 'USD';
  const m = (n: number) => formatMoney(n, cur);
  const since = ymd(subMonths(new Date(), 5)).slice(0, 8) + '01';

  const accounts = useRows<{ id: string; name: string; balance: number; currency: string; kind: string }>('accounts', 'accounts:all', (q) => q.select('*')).rows;
  const debts = useRows<{ id: string; remaining: number; original_amount: number; currency: string }>('debts', 'debts:all', (q) => q.select('*')).rows;
  const savings = useRows<{ id: string; name: string; current_amount: number; target_amount: number; currency: string }>('savings_goals', 'savings:all', (q) => q.select('*')).rows;
  const bills = useRows<{ id: string; name: string; amount: number; frequency: any; next_due: string; currency: string }>('recurring_payments', 'bills:active', (q) => q.select('*').eq('active', true).order('next_due')).rows;
  const tx = useRows<Tx & { id: string; currency: string; category_id: string | null }>('transactions', `tx:since:${since}`, (q) => q.select('id,kind,amount,occurred_on,currency,category_id').gte('occurred_on', since)).rows;
  const cats = useRows<{ id: string; name: string }>('expense_categories', 'expcats:all', (q) => q.select('id,name')).rows;
  const limits = useRows<{ id: string; weekday: number | null; date: string | null; amount: number }>('daily_limits', 'limits:all', (q) => q.select('*')).rows;

  // Totals only include the primary currency; others are listed separately rather than silently mixed.
  const same = <T extends { currency: string }>(xs: T[]) => xs.filter((x) => x.currency === cur);
  const other = [...accounts, ...debts, ...savings].filter((x) => x.currency !== cur).length;
  const withCat = tx.filter((x) => x.currency === cur).map((x) => ({ ...x, category: cats.find((c) => c.id === x.category_id)?.name ?? 'Other' }));
  const month = monthSummary(withCat, format(new Date(), 'yyyy-MM'));
  const today = spendingToday(new Date(), limits, withCat);
  const trend = Array.from({ length: 6 }, (_, i) => { const d = subMonths(new Date(), 5 - i); return { label: format(d, 'MMM'), ...monthSummary(withCat, format(d, 'yyyy-MM')) }; });
  const maxTrend = Math.max(1, ...trend.map((x) => Math.max(x.income, x.expenses)));
  const topCats = useMemo(() => Object.entries(month.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5), [month]);
  const subs = same(bills).reduce((s, b) => s + monthlyEquivalent(b.amount, b.frequency), 0);

  if (!prefs.modules.money) return <Screen><Title>Money</Title><Empty text="The money module is off. Turn it on in More → Settings." action={{ label: 'Settings', onPress: () => router.push('/more/settings') }} /></Screen>;

  return (
    <Screen>
      <Title sub="A clear picture, no judgement. Nothing here moves real money.">Money</Title>
      <Row wrap>
        <Stat label="Available" value={m(same(accounts).reduce((s, a) => s + Number(a.balance), 0))} sub={`${accounts.length} accounts`} />
        <Stat label="Saved" value={m(same(savings).reduce((s, g) => s + Number(g.current_amount), 0))} />
      </Row>
      <Row wrap>
        <Stat label={`In · ${format(new Date(), 'MMM')}`} value={m(month.income)} />
        <Stat label={`Out · ${format(new Date(), 'MMM')}`} value={m(month.expenses)} />
        <Stat label="Debt left" value={m(same(debts).reduce((s, d) => s + Number(d.remaining), 0))} />
      </Row>
      {other ? <Txt size={12} muted>{other} item(s) in other currencies aren't included in these totals.</Txt> : null}

      {today.limit != null ? (
        <Card tone={today.over ? 'alt' : 'soft'}>
          <Txt weight="600">Today: {m(today.spent)} of {m(today.limit)}</Txt>
          <Progress value={today.spent / Math.max(1, today.limit)} />
          <Txt size={13} muted>{today.over ? `Over by ${m(-today.remaining!)} — tomorrow is a fresh start.` : `${m(today.remaining!)} left`}</Txt>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <NavTile icon="receipt-outline" label="Expenses" sub="Log & review" onPress={() => router.push('/money/expenses')} />
        <NavTile icon="cash-outline" label="Income" sub="Jobs & side income" onPress={() => router.push('/money/income')} />
        <NavTile icon="wallet-outline" label="Accounts" sub="Cash, bank, savings" onPress={() => router.push('/money/accounts')} />
        <NavTile icon="calendar-number-outline" label="Bills & subscriptions" sub={`${m(subs)}/month`} onPress={() => router.push('/money/recurring')} />
        <NavTile icon="trending-up-outline" label="Savings goals" sub="With daily/weekly pace" onPress={() => router.push('/money/savings')} />
        <NavTile icon="trending-down-outline" label="Debts" sub="Balances & payoff" onPress={() => router.push('/money/debts')} />
        <NavTile icon="speedometer-outline" label="Budgets & limits" sub="Daily limits, categories" onPress={() => router.push('/money/budgets')} />
      </View>

      <Section title="Upcoming bills">
        {bills.slice(0, 5).map((b) => <Card key={b.id}><Row><Txt style={{ flex: 1 }}>{b.name}</Txt><Txt muted size={13}>{format(new Date(b.next_due + 'T12:00'), 'MMM d')}</Txt><Txt weight="600">{formatMoney(b.amount, b.currency)}</Txt></Row></Card>)}
        {!bills.length ? <Txt muted size={13}>No bills added.</Txt> : null}
      </Section>

      <Section title="Where it went this month">
        <Card>{topCats.length ? topCats.map(([c, v]) => (
          <View key={c} style={{ gap: 4 }}><Row><Txt style={{ flex: 1 }}>{c}</Txt><Txt>{m(v)}</Txt></Row><Progress value={v / Math.max(1, month.expenses)} height={6} /></View>
        )) : <Txt muted size={13}>No expenses yet this month.</Txt>}</Card>
      </Section>

      <Section title="Income vs spending (6 months)">
        <Card>{trend.map((x) => (
          <View key={x.label} style={{ gap: 3 }}>
            <Txt size={12} muted>{x.label} · net {m(x.net)}</Txt>
            <View style={{ height: 8, width: `${(x.income / maxTrend) * 100}%`, minWidth: 2, borderRadius: 4, backgroundColor: t.colors.success }} />
            <View style={{ height: 8, width: `${(x.expenses / maxTrend) * 100}%`, minWidth: 2, borderRadius: 4, backgroundColor: t.colors.primary }} />
          </View>
        ))}<Row gap={14}><Txt size={12} color={t.colors.success}>■ income</Txt><Txt size={12} color={t.colors.primary}>■ spending</Txt></Row></Card>
      </Section>

      {savings.length ? <Section title="Savings progress">
        {savings.map((g) => <Card key={g.id} onPress={() => router.push('/money/savings')}><Row><Txt style={{ flex: 1 }}>{g.name}</Txt><Txt size={13} muted>{formatMoney(g.current_amount, g.currency)} / {formatMoney(g.target_amount, g.currency)}</Txt></Row>
          <Progress value={g.current_amount / g.target_amount} /></Card>)}
      </Section> : null}
    </Screen>
  );
}

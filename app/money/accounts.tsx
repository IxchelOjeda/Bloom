import { Stack } from 'expo-router';
import React from 'react';
import { Collection } from '@/components/Collection';
import { formatMoney } from '@/lib/finance';
import { usePreferences } from '@/lib/preferences';
import { Txt } from '@/components/ui';

interface Account { id: string; name: string; kind: string; currency: string; balance: number }

export default function Accounts() {
  const { profile } = usePreferences();
  return (
    <>
      <Stack.Screen options={{ title: 'Accounts' }} />
      <Collection<Account>
        table="accounts" title="Accounts" icon="wallet-outline" subtitle="Entered by hand. Balances move when you log expenses or income against them."
        emptyText="Add cash, a bank account or a savings account."
        fields={[
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'kind', label: 'Type', type: 'select', required: true, options: [['cash', 'Cash'], ['bank', 'Bank'], ['savings', 'Savings'], ['wallet', 'Wallet'], ['other', 'Other']].map(([value, label]) => ({ value, label })) },
          { key: 'balance', label: 'Current balance', type: 'money', required: true },
          { key: 'currency', label: 'Currency (3 letters)', type: 'text', required: true },
        ]}
        defaults={{ kind: 'bank', currency: profile?.currency ?? 'USD', balance: '' }}
        transform={(v) => ({ ...v, currency: String(v.currency ?? '').toUpperCase().slice(0, 3) })}
        itemTitle={(a) => a.name}
        itemSub={(a) => a.kind}
        itemRight={(a) => <Txt weight="600">{formatMoney(Number(a.balance), a.currency)}</Txt>}
      />
    </>
  );
}

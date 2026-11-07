import { Stack } from 'expo-router';
import { format } from 'date-fns';
import React from 'react';
import { useRows } from '@/lib/db';
import { ProposalItem } from '@/lib/plannerTypes';
import { Card, Empty, Pill, Row, Screen, Title, Txt } from '@/components/ui';

export default function History() {
  const plans = useRows<{ id: string; prompt: string; status: string; created_at: string; proposal: { summary: string; items: ProposalItem[] } }>(
    'ai_plans', 'aiplans:all', (q) => q.select('*').order('created_at', { ascending: false }).limit(50)).rows;
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Plan history' }} />
      <Title sub="Every plan the AI suggested, and what you did with it.">History</Title>
      {plans.length === 0 ? <Empty text="No AI plans yet." /> : null}
      {plans.map((p) => (
        <Card key={p.id}>
          <Row><Txt size={12} muted style={{ flex: 1 }}>{format(new Date(p.created_at), 'MMM d, h:mm a')}</Txt>
            <Pill label={p.status.replace('_', ' ')} tone={p.status === 'approved' ? 'success' : p.status === 'rejected' ? 'neutral' : 'primary'} /></Row>
          <Txt weight="600" numberOfLines={2}>{p.prompt}</Txt>
          {p.proposal.summary ? <Txt size={13} muted>{p.proposal.summary}</Txt> : null}
          {p.proposal.items.slice(0, 8).map((it, i) => <Txt key={i} size={13}>• {it.title}{it.starts_at ? ` — ${format(new Date(it.starts_at), 'EEE h:mm a')}` : ''}</Txt>)}
        </Card>
      ))}
    </Screen>
  );
}

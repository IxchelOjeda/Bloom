import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { format } from 'date-fns';
import { db } from '@/lib/db';
import { usePreferences } from '@/lib/preferences';
import { callFunction } from '@/lib/supabase';
import { useDeviceEvents } from '@/lib/useDeviceEvents';
import { ChatTurn, PlannerResponse, ProposalItem } from '@/lib/plannerTypes';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Check, Chip, Field, Pill, Row, Screen, Title, Toggle, Txt } from '@/components/ui';

const PRESETS: Record<string, string> = {
  reorganize: 'Please reorganize the rest of my day based on what is done, what is left, and my energy.',
  restart: "I've been away for a few days. Make me a light, gentle plan for today with just a few essentials.",
};
const SUGGESTIONS = [
  'I have one week to study 10 lectures. I can study Mon, Wed, Thu and Sat — 3h Mon & Wed, 2h Thu, 4h Sat.',
  "I couldn't study yesterday. Reorganize the rest of my week.",
  'I want to lift 50 kg by the end of December. I currently lift 30 kg.',
];

export default function PlannerAI() {
  const t = useTheme();
  const { prefs, setPrefs } = usePreferences();
  const params = useLocalSearchParams<{ preset?: string }>();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<PlannerResponse['proposal'] & { plan_id?: string | null } | null>(null);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [applied, setApplied] = useState(false);
  const sentPreset = useRef(false);
  const [horizon] = useState(() => ({ from: new Date(), to: new Date(Date.now() + 21 * 86400000) }));
  const phoneBusy = useDeviceEvents(horizon.from, horizon.to);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const next = [...turns, { role: 'user' as const, content: text.trim() }];
    setTurns(next); setInput(''); setBusy(true); setError(null); setApplied(false);
    try {
      const res = await callFunction<PlannerResponse>('life-planner', {
        messages: next.slice(-12), now: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        external_busy: phoneBusy.filter((b) => !b.allDay).slice(0, 300).map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() })),
      });
      setTurns([...next, { role: 'assistant', content: res.reply }]);
      if (res.proposal?.items.length) {
        setProposal({ ...res.proposal, plan_id: res.plan_id });
        // items with validator issues start unticked so nothing problematic is applied by accident
        setSelected(res.proposal.items.map((i) => !i.issues?.length));
      } else setProposal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The planner is unavailable right now.');
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (prefs.ai_planner_ok && params.preset && PRESETS[params.preset] && !sentPreset.current) { sentPreset.current = true; void send(PRESETS[params.preset]); }
  }, [prefs.ai_planner_ok, params.preset]); // eslint-disable-line react-hooks/exhaustive-deps

  const editItem = (i: number, patch: Partial<ProposalItem>) =>
    setProposal((p) => p ? { ...p, items: p.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) } : p);

  const apply = async () => {
    if (!proposal) return;
    const chosen = proposal.items.filter((_, i) => selected[i]);
    const planId = proposal.plan_id ?? null;
    for (const it of chosen) {
      if (it.op === 'create_event' && it.starts_at && it.ends_at)
        await db.insert('events', { title: it.title, kind: it.kind ?? 'activity', starts_at: it.starts_at, ends_at: it.ends_at, activity_id: it.activity_id ?? null, task_id: it.task_id ?? null, notes: it.note ?? null, ai_plan_id: planId, done: false });
      else if (it.op === 'move_event' && it.ref_id && it.starts_at && it.ends_at)
        await db.update('events', it.ref_id, { starts_at: it.starts_at, ends_at: it.ends_at });
      else if (it.op === 'delete_event' && it.ref_id)
        await db.remove('events', it.ref_id);
      else if (it.op === 'create_task')
        await db.insert('tasks', { title: it.title, due_date: it.due_date ?? null, activity_id: it.activity_id ?? null, notes: it.note ?? null, status: 'todo', priority: 'medium', source: 'ai_plan', ai_plan_id: planId });
      else if (it.op === 'update_task' && it.ref_id)
        await db.update('tasks', it.ref_id, { due_date: it.due_date ?? null });
    }
    if (planId) await db.update('ai_plans', planId, { status: chosen.length === proposal.items.length ? 'approved' : 'partially_approved', applied_at: new Date().toISOString(), proposal: { ...proposal, items: proposal.items } });
    setApplied(true); setProposal(null);
  };

  const reject = async () => { if (proposal?.plan_id) await db.update('ai_plans', proposal.plan_id, { status: 'rejected' }); setProposal(null); };

  if (!prefs.ai_planner_ok) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Life Planner' }} />
        <Title sub="Planning, scheduling and workload — nothing else.">Life Planner AI</Title>
        <Card>
          <Txt weight="600">Before we start</Txt>
          <Txt>To plan around your real life, the planner reads your calendar, tasks, activities, goals, availability, rest days and energy for the next two weeks and sends them to the AI provider for this request.</Txt>
          <Txt>It never sees your finances, food, medication, sleep or notes. It can only <Txt weight="600">suggest</Txt> changes — nothing touches your calendar until you approve it.</Txt>
          <Toggle label="I'm okay with that" value={false} onChange={(v) => void setPrefs({ ai_planner_ok: v })} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Life Planner' }} />
      <Title sub="Tell me what you need to get done. I'll suggest; you decide.">Life Planner</Title>
      {turns.length === 0 ? <View style={{ gap: 8 }}>{SUGGESTIONS.map((s) => <Card key={s} tone="alt" onPress={() => setInput(s)}><Txt size={14}>{s}</Txt></Card>)}</View> : null}

      {turns.map((m, i) => (
        <Card key={i} tone={m.role === 'user' ? 'soft' : undefined} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
          <Txt>{m.content}</Txt>
        </Card>
      ))}
      {busy ? <Txt muted>Thinking about your week…</Txt> : null}
      {error ? <Card><Txt color={t.colors.danger}>{error}</Txt>{/not configured|API key/i.test(error) ? <Txt size={13} muted>Set ANTHROPIC_API_KEY as a Supabase secret (see README).</Txt> : null}</Card> : null}
      {applied ? <Card tone="soft"><Txt>Added to your calendar ✦</Txt><Button small kind="secondary" label="Open calendar" onPress={() => router.push('/plan/calendar')} /></Card> : null}

      {proposal ? (
        <Card>
          <Txt heading size={17}>Proposed plan</Txt>
          <Txt muted>{proposal.summary}</Txt>
          {proposal.warnings.map((w) => <Pill key={w} label={w} tone="warning" />)}
          {proposal.items.map((it, i) => (
            <View key={i} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: t.colors.border }}>
              <Row>
                <Check done={!!selected[i]} label={it.title} onPress={() => setSelected((s) => s.map((x, j) => (j === i ? !x : x)))} />
                <View style={{ flex: 1 }}>
                  <Txt weight="600">{it.op === 'delete_event' ? 'Remove: ' : it.op === 'move_event' ? 'Move: ' : ''}{it.title}</Txt>
                  {it.starts_at ? <Txt size={13} muted>{format(new Date(it.starts_at), 'EEE MMM d, h:mm a')} – {format(new Date(it.ends_at!), 'h:mm a')}</Txt> : null}
                  {it.due_date ? <Txt size={13} muted>Due {it.due_date}</Txt> : null}
                  {it.note ? <Txt size={13}>{it.note}</Txt> : null}
                </View>
              </Row>
              {it.issues?.map((x) => <Pill key={x} label={x} tone="danger" />)}
              {it.starts_at && selected[i] ? <TimeEdit item={it} onChange={(patch) => editItem(i, patch)} /> : null}
            </View>
          ))}
          <Button label={`Approve ${selected.filter(Boolean).length} change${selected.filter(Boolean).length === 1 ? '' : 's'}`} disabled={!selected.some(Boolean)} onPress={apply} />
          <Row><Chip label="Select all" onPress={() => setSelected(proposal.items.map(() => true))} /><Chip label="Discard plan" onPress={reject} /></Row>
        </Card>
      ) : null}

      <Field multiline value={input} onChangeText={setInput} placeholder="What do you need to plan?" />
      <Button label="Send" icon="send" onPress={() => send(input)} loading={busy} disabled={!input.trim()} />
      <Button kind="ghost" label="Stop sharing schedule data with the planner" onPress={() => setPrefs({ ai_planner_ok: false })} />
    </Screen>
  );
}

/** Lets the user nudge a proposed session before approving it. */
function TimeEdit({ item, onChange }: { item: ProposalItem; onChange: (p: Partial<ProposalItem>) => void }) {
  const [v, setV] = useState(format(new Date(item.starts_at!), 'yyyy-MM-dd HH:mm'));
  const [bad, setBad] = useState(false);
  const commit = () => {
    const d = new Date(v.trim().replace(' ', 'T'));
    if (isNaN(+d)) return setBad(true);
    const len = +new Date(item.ends_at!) - +new Date(item.starts_at!);
    setBad(false);
    onChange({ starts_at: d.toISOString(), ends_at: new Date(+d + len).toISOString(), issues: ['edited — re-check for clashes in your calendar'] });
  };
  return (
    <Row>
      <View style={{ flex: 1 }}><Field value={v} onChangeText={setV} autoCapitalize="none" placeholder="YYYY-MM-DD HH:MM" /></View>
      <Button small kind="secondary" label="Change" onPress={commit} />
      {bad ? <Pill label="use YYYY-MM-DD HH:MM" tone="danger" /> : null}
    </Row>
  );
}

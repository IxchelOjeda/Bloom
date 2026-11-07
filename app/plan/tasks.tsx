import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Stack } from 'expo-router';
import { db, useRows } from '@/lib/db';
import { ymd } from '@/lib/dates';
import { Named, RescheduleSheet, Task, TaskSheet } from '@/components/sheets';
import { Button, Card, Check, Chip, Empty, Pill, Row, Screen, Txt } from '@/components/ui';

type View_ = 'today' | 'upcoming' | 'overdue' | 'all' | 'unscheduled' | 'completed' | 'category' | 'activity' | 'goal';
const VIEWS: { v: View_; label: string }[] = [
  { v: 'today', label: 'Today' }, { v: 'upcoming', label: 'Upcoming' }, { v: 'overdue', label: 'Overdue' }, { v: 'all', label: 'All' },
  { v: 'unscheduled', label: 'Someday' }, { v: 'completed', label: 'Done' }, { v: 'category', label: 'By category' },
  { v: 'activity', label: 'By activity' }, { v: 'goal', label: 'By goal' },
];

export default function Tasks() {
  const today = ymd(new Date());
  const [view, setView] = useState<View_>('today');
  const [sheet, setSheet] = useState<{ open: boolean; task?: Task | null }>({ open: false });
  const [missed, setMissed] = useState<Task | null>(null);
  const tasks = useRows<Task>('tasks', 'tasks:top', (q) => q.select('*').is('parent_id', null).order('due_date', { ascending: true, nullsFirst: false }), (t) => !t.parent_id).rows;
  const links = useRows<{ id: string; task_id: string; category_id: string }>('task_categories', 'taskcats:all', (q) => q.select('*')).rows;
  const cats = useRows<Named>('categories', 'categories:all', (q) => q.select('id,name').order('name')).rows;
  const acts = useRows<Named>('activities', 'activities:active', (q) => q.select('id,name').eq('archived', false)).rows;
  const goals = useRows<Named>('goals', 'goals:open', (q) => q.select('id,title').is('completed_at', null)).rows;

  const groups = useMemo(() => {
    const open = tasks.filter((t) => t.status === 'todo');
    switch (view) {
      case 'today': return [{ title: '', items: open.filter((t) => t.due_date && t.due_date <= today) }];
      case 'upcoming': return [{ title: '', items: open.filter((t) => t.due_date && t.due_date > today) }];
      case 'overdue': return [{ title: 'These slipped — choose what to do, no pressure', items: open.filter((t) => t.due_date && t.due_date < today) }];
      case 'all': return [{ title: '', items: open }];
      case 'unscheduled': return [{ title: '', items: tasks.filter((t) => t.status === 'unscheduled' || (t.status === 'todo' && !t.due_date)) }];
      case 'completed': return [{ title: '', items: tasks.filter((t) => t.status === 'done').slice(0, 100) }];
      case 'category': return cats.map((c) => ({ title: c.name!, items: open.filter((t) => links.some((l) => l.task_id === t.id && l.category_id === c.id)) })).filter((g) => g.items.length);
      case 'activity': return acts.map((a) => ({ title: a.name!, items: open.filter((t) => t.activity_id === a.id) })).filter((g) => g.items.length);
      case 'goal': return goals.map((g) => ({ title: g.title!, items: open.filter((t) => t.goal_id === g.id) })).filter((g) => g.items.length);
    }
  }, [tasks, view, today, cats, acts, goals, links]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Tasks' }} />
      <Button icon="add" label="New task" onPress={() => setSheet({ open: true })} />
      <Row wrap>{VIEWS.map((x) => <Chip key={x.v} label={x.label} selected={view === x.v} onPress={() => setView(x.v)} />)}</Row>
      {groups.every((g) => g.items.length === 0) ? <Empty icon="leaf-outline" text="Nothing here. Enjoy the space." /> : null}
      {groups.map((g) => g.items.length ? (
        <View key={g.title || 'list'} style={{ gap: 6 }}>
          {g.title ? <Txt heading size={16}>{g.title}</Txt> : null}
          <Card>{g.items.map((t) => (
            <Row key={t.id} style={{ paddingVertical: 4 }}>
              <Check done={t.status === 'done'} label={t.title} onPress={() => db.update('tasks', t.id, { status: t.status === 'done' ? 'todo' : 'done' })} />
              <Pressable style={{ flex: 1 }} onPress={() => setSheet({ open: true, task: t })}>
                <Txt style={{ textDecorationLine: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</Txt>
                <Row gap={6} wrap>
                  {t.due_date ? <Txt size={12} muted>{t.due_date === today ? 'Today' : t.due_date}</Txt> : null}
                  {t.estimate_min ? <Txt size={12} muted>~{t.estimate_min} min</Txt> : null}
                  {t.priority !== 'medium' && t.priority !== 'low' ? <Pill label={t.priority} tone="warning" /> : null}
                  {t.recurrence ? <Pill label="repeats" /> : null}
                </Row>
              </Pressable>
              {t.status === 'todo' && t.due_date && t.due_date < today ? <Chip label="Reschedule" onPress={() => setMissed(t)} /> : null}
            </Row>
          ))}</Card>
        </View>
      ) : null)}
      <TaskSheet visible={sheet.open} task={sheet.task} onClose={() => setSheet({ open: false })} defaults={view === 'today' ? { due_date: today } : {}} />
      <RescheduleSheet task={missed} onClose={() => setMissed(null)} />
    </Screen>
  );
}

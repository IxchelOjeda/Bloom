// Life Planner AI — planning/scheduling ONLY.
// Flow: read the user's scheduling data (RLS, their JWT) → ask Claude to interpret the request
// as structured output → let the tested scheduling engine allocate time / validate every item →
// store the proposal in ai_plans → return it. The function never writes events or tasks;
// the app applies only what the user approves.
import { z } from 'https://esm.sh/zod@3.23.8';
import { callClaude, cors, fromWall, json, rateLimited, toWall, userClient } from '../_shared/ai.ts';
import { planSessions, validateProposal, AvailabilityRule, DayKind, Energy } from '../_shared/scheduler.ts';

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).min(1).max(20),
  now: z.string().datetime(),
  timezone: z.string().max(64),
});

const Item = z.object({
  op: z.enum(['create_event', 'move_event', 'delete_event', 'create_task', 'update_task']),
  ref_id: z.string().uuid().nullish(),
  title: z.string().min(1).max(200),
  starts_at: z.string().nullish(),   // wall-clock "YYYY-MM-DDTHH:mm" in the user's zone
  ends_at: z.string().nullish(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  activity_id: z.string().uuid().nullish(),
  task_id: z.string().uuid().nullish(),
  kind: z.enum(['event', 'activity', 'break', 'task_block', 'focus', 'routine']).nullish(),
  note: z.string().max(500).nullish(),
});
const Allocate = z.object({
  title: z.string().min(1).max(200),
  total_minutes: z.number().int().positive().max(20000),
  session_minutes: z.number().int().min(15).max(240).nullish(),
  deadline: z.string(),                         // wall-clock
  demanding: z.boolean().nullish(),
  activity_id: z.string().uuid().nullish(),
  windows: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string(), end: z.string() })).nullish(),
  session_notes: z.array(z.string().max(300)).nullish(),
});
const Answer = z.object({
  reply: z.string().max(3000),
  off_topic: z.boolean(),
  summary: z.string().max(500).nullish(),
  items: z.array(Item).max(60).nullish(),
  allocate: Allocate.nullish(),
});

const TOOL = {
  name: 'respond',
  description: 'Reply to the user and optionally propose schedule changes.',
  input_schema: {
    type: 'object',
    required: ['reply', 'off_topic'],
    properties: {
      reply: { type: 'string', description: 'Warm, brief message to the user (no lists of every session — the app renders those).' },
      off_topic: { type: 'boolean', description: 'true if the request is not about planning, scheduling, tasks, activities, goals or time management.' },
      summary: { type: 'string', description: 'One-line summary of the proposed plan.' },
      allocate: {
        type: 'object',
        description: 'Use for "I need N hours/sessions of X before a deadline" requests. The server computes exact sessions that respect availability, rest days, energy, breaks and existing events.',
        required: ['title', 'total_minutes', 'deadline'],
        properties: {
          title: { type: 'string' }, total_minutes: { type: 'integer' }, session_minutes: { type: 'integer' },
          deadline: { type: 'string', description: 'Local wall-clock YYYY-MM-DDTHH:mm' }, demanding: { type: 'boolean' },
          activity_id: { type: 'string', description: 'id of a matching existing activity, if any' },
          windows: { type: 'array', description: 'Only if the user stated specific days/hours in this message. weekday 0=Sun. start/end HH:mm. Place them inside their stored availability when possible.',
            items: { type: 'object', required: ['weekday', 'start', 'end'], properties: { weekday: { type: 'integer' }, start: { type: 'string' }, end: { type: 'string' } } } },
          session_notes: { type: 'array', items: { type: 'string' }, description: 'What to accomplish in each session, in order (e.g. "Lectures 1–2").' },
        },
      },
      items: {
        type: 'array',
        description: 'Explicit changes (moving/removing existing events, tasks, milestone check-ins). Times are local wall-clock YYYY-MM-DDTHH:mm.',
        items: {
          type: 'object', required: ['op', 'title'],
          properties: {
            op: { type: 'string', enum: ['create_event', 'move_event', 'delete_event', 'create_task', 'update_task'] },
            ref_id: { type: 'string' }, title: { type: 'string' }, starts_at: { type: 'string' }, ends_at: { type: 'string' },
            due_date: { type: 'string' }, activity_id: { type: 'string' }, task_id: { type: 'string' },
            kind: { type: 'string', enum: ['event', 'activity', 'break', 'task_block', 'focus', 'routine'] }, note: { type: 'string' },
          },
        },
      },
    },
  },
};

const SYSTEM = (ctx: string) => `You are the Life Planner inside a personal organization app built for people with ADHD and executive dysfunction.

SCOPE: You ONLY help with planning, scheduling, tasks, activities, goals, time management, workload distribution and calendar organization.
If the request is about anything else (general knowledge, recipes, health/medical, finance advice, coding, chit-chat), set off_topic=true and reply briefly that you're only for personal planning, and suggest what you can help with. Do not answer the off-topic part.

PHILOSOPHY: "Your schedule should adapt to your life, not your life to your schedule."
- Be warm, short and non-judgmental. Never guilt the user about missed work.
- Prefer lighter, sustainable plans. Respect rest days and low-energy days; never cram.
- Never double-book. Preserve existing commitments unless the user asks to move them.
- For workload requests use "allocate" so the engine computes exact times. Use "items" for moving, removing or adding specific things.
- For fitness/skill goals, propose a gradual progression with milestones and sessions, and remind them you're not a coach or medical professional; no guarantees, no unsafe advice.
- If key info is missing (deadline, how much work), ask ONE short question instead of guessing, with no proposal.
- Everything you propose is a suggestion; the user approves each change in the app.

CONTEXT (user's own data, local time zone):
${ctx}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const u = await userClient(req);
  if (u instanceof Response) return u;
  const { sb, userId } = u;
  if (rateLimited(userId)) return json({ error: 'Too many requests — try again in a minute.' }, 429);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid request' }, 400);
  const { messages, timezone: tz } = parsed.data;

  const prefs = await sb.from('preferences').select('ai_planner_ok').single();
  if (!prefs.data?.ai_planner_ok) return json({ error: 'Planner data sharing is turned off in the app.' }, 403);

  // ---- gather ONLY scheduling data (no money, food, meds, sleep, notes) ----
  const now = new Date(parsed.data.now);
  const horizon = new Date(+now + 21 * 86400000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const [ev, tasks, av, flags, energy, acts, goals] = await Promise.all([
    sb.from('events').select('id,title,kind,starts_at,ends_at,done,activity_id').gte('ends_at', new Date(+now - 7 * 86400000).toISOString()).lte('starts_at', horizon.toISOString()).order('starts_at').limit(300),
    sb.from('tasks').select('id,title,status,due_date,deadline,priority,estimate_min,activity_id,goal_id').in('status', ['todo', 'unscheduled']).is('parent_id', null).limit(150),
    sb.from('availability').select('weekday,start_time,end_time'),
    sb.from('day_flags').select('date,kind').gte('date', ymd(new Date(+now - 86400000))).lte('date', ymd(horizon)),
    sb.from('energy_logs').select('date,level').gte('date', ymd(new Date(+now - 3 * 86400000))),
    sb.from('activities').select('id,name,weekly_minutes,sessions_per_week,session_minutes,preferred_days,demanding,progress_unit,progress_value').eq('archived', false),
    sb.from('goals').select('id,title,unit,start_value,current_value,target_value,target_date').is('completed_at', null),
  ]);

  const wall = (iso: string) => toWall(new Date(iso), tz);
  const fmt = (d: Date) => d.toISOString().slice(0, 16);
  const nowWall = toWall(now, tz);
  const ctx = JSON.stringify({
    now_local: fmt(nowWall), weekday_now: nowWall.getUTCDay(), timezone: tz,
    availability: av.data ?? [], day_flags: flags.data ?? [], recent_energy: energy.data ?? [],
    events: (ev.data ?? []).map((e) => ({ ...e, starts_at: fmt(wall(e.starts_at)), ends_at: fmt(wall(e.ends_at)) })),
    open_tasks: tasks.data ?? [], activities: acts.data ?? [], goals: goals.data ?? [],
  });

  let raw: Record<string, unknown>;
  try { raw = await callClaude({ system: SYSTEM(ctx), messages, tool: TOOL }); }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'AI error' }, 502); }
  const ans = Answer.safeParse(raw);
  if (!ans.success) return json({ reply: "Sorry — I got muddled planning that. Could you rephrase or add a detail?", off_topic: false, proposal: null });
  const a = ans.data;
  if (a.off_topic) return json({ reply: a.reply, off_topic: true, proposal: null });

  // ---- engine works in "wall clock as UTC" so weekdays/hours match the user's zone ----
  const W = (s: string) => new Date(s.length === 16 ? s + ':00Z' : s.endsWith('Z') ? s : s + 'Z');
  const rules: AvailabilityRule[] = (av.data ?? []).map((r) => ({ weekday: r.weekday, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) }));
  const dayFlags = Object.fromEntries((flags.data ?? []).map((f) => [f.date, f.kind as DayKind]));
  const energyMap = Object.fromEntries((energy.data ?? []).map((e) => [e.date, e.level as Energy]));
  const busyAll = (ev.data ?? []).filter((e) => !e.done).map((e) => ({ id: e.id, title: e.title, start: wall(e.starts_at), end: wall(e.ends_at) }));
  const busy = busyAll;
  const items: (z.infer<typeof Item> & { issues?: string[] })[] = [];
  const warnings: string[] = [];

  // Deno runs in UTC, so Date local getters == UTC == our wall clock. Good.
  if (a.allocate) {
    const al = a.allocate;
    const deadline = W(al.deadline);
    const windows = al.windows?.length ? al.windows : rules;
    if (!windows.length) warnings.push('No available hours set — add them in Plan → Rest & availability.');
    const r = planSessions({
      title: al.title, totalMinutes: al.total_minutes, sessionMinutes: al.session_minutes ?? 50, from: nowWall, deadline,
      demanding: !!al.demanding, availability: windows, busy, dayFlags, energy: energyMap,
    });
    warnings.push(...r.warnings);
    r.sessions.forEach((s, i) => items.push({
      op: 'create_event', title: al.title, kind: 'activity', activity_id: al.activity_id ?? null,
      starts_at: fmt(s.start), ends_at: fmt(s.end), note: al.session_notes?.[i] ?? s.note ?? null,
    }));
  }
  items.push(...(a.items ?? []));

  // validate everything that has a time; move/delete must reference the user's real rows
  const ownEventIds = new Set((ev.data ?? []).map((e) => e.id));
  const ownTaskIds = new Set((tasks.data ?? []).map((t) => t.id));
  const timed = items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.starts_at && it.ends_at && it.op !== 'delete_event');
  const movedIds = new Set(items.filter((i) => i.op === 'move_event' || i.op === 'delete_event').map((i) => i.ref_id));
  const issues = validateProposal(timed.map(({ it }) => ({ start: W(it.starts_at!), end: W(it.ends_at!) })), {
    busy: busyAll.filter((b) => !movedIds.has(b.id)), dayFlags,  // an event being moved can't clash with itself
  });
  for (const iss of issues) { const t = timed[iss.index]; (items[t.idx].issues ??= []).push(iss.problem); }
  for (const it of items) {
    if ((it.op === 'move_event' || it.op === 'delete_event') && (!it.ref_id || !ownEventIds.has(it.ref_id))) (it.issues ??= []).push('unknown event');
    if (it.op === 'update_task' && (!it.ref_id || !ownTaskIds.has(it.ref_id))) (it.issues ??= []).push('unknown task');
  }

  // convert wall-clock back to real instants for the app
  const out = items.map((it) => ({
    ...it,
    starts_at: it.starts_at ? fromWall(W(it.starts_at), tz).toISOString() : null,
    ends_at: it.ends_at ? fromWall(W(it.ends_at), tz).toISOString() : null,
  }));

  let plan_id: string | null = null;
  if (out.length) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const ins = await sb.from('ai_plans').insert({ user_id: userId, prompt: lastUser.slice(0, 4000), proposal: { summary: a.summary ?? '', items: out, warnings }, status: 'proposed' }).select('id').single();
    plan_id = ins.data?.id ?? null;
  }

  return json({
    reply: a.reply, off_topic: false, plan_id,
    proposal: out.length ? { summary: a.summary ?? '', items: out, warnings } : null,
  });
});

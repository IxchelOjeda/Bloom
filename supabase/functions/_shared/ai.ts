// Shared helpers for Edge Functions (Deno).
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Supabase client acting AS THE USER (their JWT) → Row Level Security applies to every read. */
export async function userClient(req: Request): Promise<{ sb: SupabaseClient; userId: string } | Response> {
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Not signed in' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return json({ error: 'Session expired — please log in again' }, 401);
  return { sb, userId: data.user.id };
}

// Simple per-user rate limit (in-memory per instance; good enough to stop runaway loops).
const hits = new Map<string, number[]>();
export function rateLimited(userId: string, perMinute = 12) {
  const now = Date.now();
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  arr.push(now); hits.set(userId, arr);
  return arr.length > perMinute;
}

export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }

/** Calls Anthropic's Messages API and forces a single structured tool call. */
export async function callClaude(opts: { system: string; messages: { role: 'user' | 'assistant'; content: string }[]; tool: ToolDef; maxTokens?: number }) {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('AI is not configured: set the ANTHROPIC_API_KEY secret on your Supabase project');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('AI_MODEL') ?? 'claude-sonnet-5-5',
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: opts.messages,
      tools: [opts.tool],
      tool_choice: { type: 'tool', name: opts.tool.name },
    }),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const block = body.content?.find((b: { type: string }) => b.type === 'tool_use');
  if (!block) throw new Error('AI returned no structured answer');
  return block.input as Record<string, unknown>;
}

/** Wall-clock view of an instant in the user's zone, so day/time checks match what the user sees. */
export function toWall(d: Date, tz: string): Date {
  return new Date(d.toLocaleString('en-US', { timeZone: tz }));
}
/** Inverse of toWall: a wall-clock Date in `tz` → real instant. */
export function fromWall(wall: Date, tz: string): Date {
  const guess = new Date(wall.getTime());
  const offset = toWall(guess, tz).getTime() - guess.getTime();
  return new Date(wall.getTime() - offset);
}

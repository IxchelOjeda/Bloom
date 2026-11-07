// Recipe AI — cooking ONLY. Completely separate from the Life Planner:
// it reads nothing from the database (no calendar, finances, medication or health data);
// it only sees the chat and an optional pantry list the user typed. Saving recipes and
// sending ingredients to groceries happens in the app, with the user's own permissions.
import { z } from 'https://esm.sh/zod@3.23.8';
import { callClaude, cors, json, rateLimited, userClient } from '../_shared/ai.ts';

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).min(1).max(30),
  pantry: z.array(z.string().max(60)).max(80).nullish(),
  units: z.enum(['metric', 'imperial']).default('metric'),
});

const Ing = z.object({ name: z.string().max(80), quantity: z.number().nullish(), unit: z.string().max(20).nullish() });
const Answer = z.object({
  reply: z.string().max(6000),
  off_topic: z.boolean(),
  recipe: z.object({
    title: z.string().max(120), servings: z.number().positive(), prep_min: z.number().int().nullish(), cook_min: z.number().int().nullish(),
    difficulty: z.enum(['easy', 'medium', 'hard']).nullish(), ingredients: z.array(Ing).max(40), steps: z.array(z.string().max(600)).max(40),
    nutrition_note: z.string().max(300).nullish(),
  }).nullish(),
  shopping: z.array(Ing).max(30).nullish(),
});

const TOOL = {
  name: 'respond', description: 'Answer the cooking question; optionally include one full recipe and/or a shopping list.',
  input_schema: {
    type: 'object', required: ['reply', 'off_topic'],
    properties: {
      reply: { type: 'string', description: 'Conversational answer. For technique questions (e.g. how to dice an onion) give clear numbered steps and describe what it should look like at each stage.' },
      off_topic: { type: 'boolean' },
      recipe: { type: 'object', required: ['title', 'servings', 'ingredients', 'steps'], properties: {
        title: { type: 'string' }, servings: { type: 'number' }, prep_min: { type: 'integer' }, cook_min: { type: 'integer' },
        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        ingredients: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' } } } },
        steps: { type: 'array', items: { type: 'string' }, description: 'One action per step, with times and temperatures.' },
        nutrition_note: { type: 'string', description: 'Optional rough per-serving estimate, clearly labelled as an estimate.' } } },
      shopping: { type: 'array', description: 'Extra ingredients to buy, with quantities.', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' } } } },
    },
  },
};

const SYSTEM = (pantry: string[] | null | undefined, units: string) => `You are a friendly home-cooking assistant inside a life-organizer app.
SCOPE: recipes, ingredients, cooking methods and techniques, substitutions, meal prep, food storage and kitchen safety. Anything else (scheduling, finances, health/medical or diet prescriptions, general knowledge) → off_topic=true and a short, kind redirect.
- When the user lists what they have, prefer recipes needing NO extra purchases; say clearly if something extra is needed.
- For "what should I buy", fill "shopping" with quantities.
- For substitutions, explain how the swap changes taste/texture and adjust quantities.
- Full recipes: exact quantities (${units} units), times, temperatures (°C and °F), servings, prep time, difficulty.
- Follow-up questions about one step: explain that step in detail, simply.
- Food safety: give safe internal temperatures for meat/poultry/fish when relevant.
- Nutrition is optional and always an estimate. Never give medical or weight-loss advice; for allergies, remind them to check labels.
- Be concise and warm. Assume the cook may be tired or overwhelmed — keep steps simple.
${pantry?.length ? `Pantry the user listed: ${pantry.join(', ')}` : ''}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const u = await userClient(req);
  if (u instanceof Response) return u;
  if (rateLimited(u.userId)) return json({ error: 'Too many requests — try again in a minute.' }, 429);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: 'Invalid request' }, 400);

  let raw: Record<string, unknown>;
  try { raw = await callClaude({ system: SYSTEM(p.data.pantry, p.data.units), messages: p.data.messages, tool: TOOL }); }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'AI error' }, 502); }
  const a = Answer.safeParse(raw);
  if (!a.success) return json({ reply: 'Sorry, I lost my place in the recipe — could you ask again?', off_topic: false });
  return json(a.data);
});

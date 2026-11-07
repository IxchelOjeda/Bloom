// Food search: verified data only. Sources, in order:
//  1. Cached verified rows in `foods` (includes any licensed restaurant data you import)
//  2. USDA FoodData Central (needs USDA_FDC_API_KEY; includes generic foods, branded US products
//     and the SR Legacy "fast foods" set with several US chain items)
//  3. Open Food Facts (no key; packaged products worldwide, filtered by country when given)
// Values are never invented: anything without calories from a source is dropped.
// Results are cached in `foods` with the service role so clients can't forge "verified" rows.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { cors, json, rateLimited, userClient } from '../_shared/ai.ts';

const Body = z.object({ query: z.string().min(2).max(80), country: z.string().length(2).nullish(), barcode: z.string().regex(/^\d{8,14}$/).nullish() });

interface Food { source: 'usda' | 'open_food_facts' | 'restaurant_official'; external_id: string; brand: string | null; country: string | null; name: string;
  serving_label: string; serving_grams: number | null; kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null; verified: true;
  portion_label: string | null; portion_grams: number | null }

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : null);

async function usda(q: string): Promise<Food[]> {
  const key = Deno.env.get('USDA_FDC_API_KEY');
  if (!key) return [];
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: q, pageSize: 20, dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded'] }),
  });
  if (!res.ok) return [];
  const body = await res.json();
  return (body.foods ?? []).map((f: any): Food | null => {
    const n = (id: number) => num(f.foodNutrients?.find((x: any) => x.nutrientId === id)?.value);
    const kcal = n(1008) ?? n(2047) ?? n(2048);
    if (kcal == null) return null;
    // USDA nutrient values are per 100 g. Branded items also report the label's household serving
    // (e.g. "4 pieces", 64 g) — kept as a verified portion so people can log by pieces.
    const grams = typeof f.servingSize === 'number' && /^(g|grm)$/i.test(f.servingSizeUnit ?? '') ? f.servingSize : null;
    const household = typeof f.householdServingFullText === 'string' ? f.householdServingFullText.trim().slice(0, 80) : null;
    return { source: 'usda', external_id: String(f.fdcId), brand: f.brandOwner ?? f.brandName ?? null, country: 'US',
      name: f.description, serving_label: '100 g', serving_grams: 100, kcal, protein_g: n(1003), carbs_g: n(1005), fat_g: n(1004), verified: true,
      portion_label: grams ? (household || `${grams} g`) : null, portion_grams: grams };
  }).filter(Boolean) as Food[];
}

async function off(q: string, country?: string | null, barcode?: string | null): Promise<Food[]> {
  const ua = { 'User-Agent': 'Orchid/0.1 (personal organizer app)' };
  const url = barcode
    ? `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`
    : `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20${country ? `&tagtype_0=countries&tag_contains_0=contains&tag_0=${country}` : ''}`;
  const res = await fetch(url, { headers: ua });
  if (!res.ok) return [];
  const body = await res.json();
  const products = barcode ? (body.product ? [body.product] : []) : body.products ?? [];
  return products.map((p: any): Food | null => {
    const nm = p.nutriments ?? {};
    const kcal = num(nm['energy-kcal_100g']);
    if (kcal == null || !p.product_name) return null;
    const sq = Number(p.serving_quantity);
    return { source: 'open_food_facts', external_id: String(p.code), brand: p.brands ?? null, country: country ?? null, name: p.product_name,
      serving_label: '100 g', serving_grams: 100, kcal, protein_g: num(nm.proteins_100g), carbs_g: num(nm.carbohydrates_100g), fat_g: num(nm.fat_100g), verified: true,
      portion_label: sq > 0 ? String(p.serving_size ?? `${sq} g`).slice(0, 80) : null, portion_grams: sq > 0 ? sq : null };
  }).filter(Boolean) as Food[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const u = await userClient(req);
  if (u instanceof Response) return u;
  if (rateLimited(u.userId, 30)) return json({ error: 'Slow down a little — try again in a minute.' }, 429);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: 'Type at least 2 characters' }, 400);
  const { query, country, barcode } = p.data;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const words = query.trim().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).join(' & ');

  const [cached, fromUsda, fromOff] = await Promise.all([
    words ? admin.from('foods').select('*').is('user_id', null).eq('verified', true)
      .textSearch('name', words, { config: 'simple' }).limit(20).then((r) => r.data ?? []) : Promise.resolve([]),
    barcode ? Promise.resolve([]) : usda(query).catch(() => []),
    off(query, country, barcode).catch(() => []),
  ]);

  const fresh = [...fromUsda, ...fromOff];
  let stored: any[] = [];
  if (fresh.length) {
    const up = await admin.from('foods').upsert(fresh.map((f) => ({ ...f, user_id: null })), { onConflict: 'source,external_id' }).select('*');
    stored = up.data ?? [];
  }
  const seen = new Set<string>();
  const results = [...cached, ...stored].filter((f) => { const k = `${f.source}:${f.external_id}`; if (seen.has(k)) return false; seen.add(k); return true; });

  // restaurant/brand matches first (e.g. "mcdonalds nuggets"), then the rest
  const q = query.toLowerCase();
  results.sort((a, b) => Number(!!b.brand && q.includes(String(b.brand).toLowerCase().split(/[ ,]/)[0])) - Number(!!a.brand && q.includes(String(a.brand).toLowerCase().split(/[ ,]/)[0])));

  return json({
    results: results.slice(0, 40),
    sources: { usda: !!Deno.env.get('USDA_FDC_API_KEY'), open_food_facts: true },
  });
});

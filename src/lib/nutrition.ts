/**
 * Portion maths for the food diary (pure, unit-tested). Nutrient values are stored
 * "per serving_label" (usually per 100 g). Values are only ever scaled from verified or
 * user-entered numbers — never invented.
 */
export interface FoodBasis {
  serving_label: string; serving_grams: number | null;
  portion_label?: string | null; portion_grams?: number | null;
  kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null;
}
export type Amount =
  | { mode: 'grams'; grams: number }
  | { mode: 'portion'; count: number }   // in units of the portion label, e.g. 10 (pieces)
  | { mode: 'serving'; count: number };  // multiples of serving_label (foods without a weight)

/** "4 pieces" → { count: 4, unit: 'pieces' }; "1 cup (240 ml)" → { count: 1, unit: 'cup (240 ml)' }; "about 2" → null. */
export function parsePortion(label: string | null | undefined): { count: number; unit: string } | null {
  const m = label?.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return null;
  const count = Number(m[1].replace(',', '.'));
  return count > 0 ? { count, unit: m[2].trim() || 'portion' } : null;
}

/** Which ways of entering an amount make sense for this food. */
export function amountModes(f: FoodBasis): Amount['mode'][] {
  const modes: Amount['mode'][] = [];
  if (f.portion_grams && f.serving_grams) modes.push('portion');
  if (f.serving_grams) modes.push('grams');
  else modes.push('serving');
  return modes;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function scaleFood(f: FoodBasis, a: Amount) {
  let factor: number; let grams: number | null = null;
  if (a.mode === 'serving' || !f.serving_grams) {
    factor = a.mode === 'serving' ? a.count : a.mode === 'portion' ? a.count : a.grams / 100;
  } else if (a.mode === 'grams') {
    grams = a.grams; factor = a.grams / f.serving_grams;
  } else {
    const p = parsePortion(f.portion_label);
    const perUnit = (f.portion_grams ?? 0) / (p?.count ?? 1);
    grams = a.count * perUnit; factor = grams / f.serving_grams;
  }
  const v = (n: number | null) => (n == null || !isFinite(factor) ? null : r1(n * factor));
  return { factor: r1(factor * 100) / 100, grams: grams == null ? null : r1(grams), kcal: v(f.kcal), protein_g: v(f.protein_g), carbs_g: v(f.carbs_g), fat_g: v(f.fat_g) };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountModes, parsePortion, scaleFood } from '../src/lib/nutrition';

const nuggets = { serving_label: '100 g', serving_grams: 100, portion_label: '4 pieces', portion_grams: 64, kcal: 296, protein_g: 15.6, carbs_g: 18.4, fat_g: 17.9 };

test('parsePortion', () => {
  assert.deepEqual(parsePortion('4 pieces'), { count: 4, unit: 'pieces' });
  assert.deepEqual(parsePortion('1,5 cups'), { count: 1.5, unit: 'cups' });
  assert.equal(parsePortion('a handful'), null);
  assert.equal(parsePortion(null), null);
});

test('10 nuggets from a verified "4 pieces = 64 g" portion', () => {
  const r = scaleFood(nuggets, { mode: 'portion', count: 10 });
  assert.equal(r.grams, 160);           // 10 × 16 g
  assert.equal(r.kcal, 473.6);          // 296 kcal/100 g × 1.6
  assert.equal(r.protein_g, 25);
});

test('grams mode and serving-only foods', () => {
  assert.equal(scaleFood(nuggets, { mode: 'grams', grams: 50 }).kcal, 148);
  const custom = { serving_label: '1 serving', serving_grams: null, kcal: 350, protein_g: null, carbs_g: 40, fat_g: 10 };
  assert.deepEqual(amountModes(custom), ['serving']);
  const r = scaleFood(custom, { mode: 'serving', count: 2 });
  assert.equal(r.kcal, 700); assert.equal(r.protein_g, null); assert.equal(r.grams, null);
  assert.deepEqual(amountModes(nuggets), ['portion', 'grams']);
});

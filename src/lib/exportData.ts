/** Personal data export: every row the user owns, as one JSON file, shared via the OS sheet. */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const USER_TABLES = [
  'profiles', 'preferences', 'availability', 'day_flags', 'energy_logs', 'minimum_days', 'categories', 'goals', 'milestones', 'activities',
  'activity_goals', 'progress_entries', 'tasks', 'task_categories', 'events', 'period_plans', 'routines', 'routine_steps', 'routine_runs',
  'focus_sessions', 'brain_dump', 'templates', 'ai_plans', 'foods', 'recipes', 'recipe_ingredients', 'meal_plans', 'food_logs',
  'grocery_items', 'water_logs', 'medications', 'medication_logs', 'sleep_logs', 'mindful_activities', 'habits', 'habit_logs',
  'accounts', 'expense_categories', 'income_sources', 'savings_goals', 'debts', 'recurring_payments', 'transactions', 'budgets',
  'daily_limits', 'wishlist_categories', 'wishlist_items', 'major_purchases', 'notes', 'notifications',
] as const;

export async function exportMyData(userId: string): Promise<void> {
  const out: Record<string, unknown[]> = {};
  for (const t of USER_TABLES) {
    const col = t === 'profiles' ? 'id' : 'user_id';
    const rows: unknown[] = [];
    // page through in case a table is large
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(t).select('*').eq(col, userId).range(from, from + 999);
      if (error) throw new Error(`${t}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    out[t] = rows;
  }
  const json = JSON.stringify({ exported_at: new Date().toISOString(), data: out }, null, 2);
  const name = `orchid-export-${new Date().toISOString().slice(0, 10)}.json`;
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
    return;
  }
  const path = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(path, json);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Your Orchid data' });
}

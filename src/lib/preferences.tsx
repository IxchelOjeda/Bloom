import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { Seed } from '@/theme/themes';

export type ModuleKey = 'plan' | 'food' | 'water' | 'meds' | 'sleep' | 'mindful' | 'habits' | 'money' | 'wishlist';
export type DashboardSection = 'minimum_day' | 'timeline' | 'tasks' | 'meals' | 'water' | 'meds' | 'payments' | 'habits' | 'progress';

export interface Preferences {
  theme_id: string;
  theme_mode: 'light' | 'dark' | 'system';
  decor_intensity: number;
  custom_colors: Partial<Seed>;
  modules: Record<ModuleKey, boolean>;
  dashboard_layout: DashboardSection[];
  notifications: { enabled: boolean; quiet_start: string; quiet_end: string; water_every_min: number; tasks: boolean; meds: boolean; payments: boolean; meals: boolean };
  water_goal_ml: number;
  nutrition_goals: { kcal?: number; protein_g?: number } | null;
  pomodoro: { focus: number; short: number; long: number; rounds: number };
  ai_planner_ok: boolean;
}
export interface Profile {
  id: string; display_name: string | null; country: string | null; language: string; currency: string;
  timezone: string; units: 'metric' | 'imperial'; week_start: number; date_format: string;
  wake_time: string | null; sleep_time: string | null; onboarded: boolean; last_active_at: string | null;
}

export const DEFAULT_PREFS: Preferences = {
  theme_id: 'pinterest_minimalist', theme_mode: 'light', decor_intensity: 2, custom_colors: {},
  modules: { plan: true, food: true, water: true, meds: true, sleep: true, mindful: true, habits: true, money: true, wishlist: true },
  dashboard_layout: ['minimum_day', 'timeline', 'tasks', 'meals', 'water', 'meds', 'payments', 'habits', 'progress'],
  notifications: { enabled: false, quiet_start: '22:00', quiet_end: '07:00', water_every_min: 120, tasks: true, meds: true, payments: true, meals: false },
  water_goal_ml: 2000, nutrition_goals: null, pomodoro: { focus: 25, short: 5, long: 15, rounds: 4 }, ai_planner_ok: false,
};

interface Ctx {
  prefs: Preferences; profile: Profile | null; loaded: boolean;
  setPrefs(p: Partial<Preferences>): Promise<void>;
  setProfile(p: Partial<Profile>): Promise<void>;
}
const C = createContext<Ctx | null>(null);
const KEY = 'lifeos.prefs';

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [prefs, setP] = useState<Preferences>(DEFAULT_PREFS);
  const [profile, setPr] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) { setLoaded(true); return; }
    let alive = true;
    (async () => {
      const cached = await AsyncStorage.getItem(`${KEY}.${uid}`);
      if (cached && alive) { const c = JSON.parse(cached); setP({ ...DEFAULT_PREFS, ...c.prefs }); setPr(c.profile); setLoaded(true); }
      const [p, pr] = await Promise.all([
        supabase.from('preferences').select('*').eq('user_id', uid).maybeSingle(),
        supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      ]);
      if (!alive) return;
      if (p.data) setP({ ...DEFAULT_PREFS, ...p.data });
      if (pr.data) setPr(pr.data as Profile);
      setLoaded(true);
      if (p.data || pr.data) await AsyncStorage.setItem(`${KEY}.${uid}`, JSON.stringify({ prefs: p.data, profile: pr.data }));
      // gentle-restart detection uses last_active_at; bump it after reading
      await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', uid);
    })();
    return () => { alive = false; };
  }, [uid]);

  const persist = useCallback(async (nextPrefs: Preferences, nextProfile: Profile | null) => {
    if (uid) await AsyncStorage.setItem(`${KEY}.${uid}`, JSON.stringify({ prefs: nextPrefs, profile: nextProfile }));
  }, [uid]);

  const value: Ctx = {
    prefs, profile, loaded,
    async setPrefs(patch) {
      const next = { ...prefs, ...patch }; setP(next); await persist(next, profile);
      if (uid) await supabase.from('preferences').update(patch).eq('user_id', uid);
    },
    async setProfile(patch) {
      const next = { ...(profile as Profile), ...patch }; setPr(next); await persist(prefs, next);
      if (uid) await supabase.from('profiles').update(patch).eq('id', uid);
    },
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export const usePreferences = () => {
  const c = useContext(C);
  if (!c) throw new Error('usePreferences outside provider');
  return c;
};

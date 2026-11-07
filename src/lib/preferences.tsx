import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
type Outbox = { prefs?: Partial<Preferences>; profile?: Partial<Profile> };
const C = createContext<Ctx | null>(null);
const KEY = 'orchid.prefs';

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [prefs, setP] = useState<Preferences>(DEFAULT_PREFS);
  const [profile, setPr] = useState<Profile | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const uid = session?.user.id ?? null;
  // "loaded" means loaded *for the current user* — never reuse a previous user's (or signed-out) state.
  const loaded = loadedFor === uid;

  // Latest values for async callers (avoids stale closures when setProfile and setPrefs run back to back).
  const ref = useRef<{ prefs: Preferences; profile: Profile | null; outbox: Outbox }>({ prefs: DEFAULT_PREFS, profile: null, outbox: {} });

  const persist = useCallback(async () => {
    if (uid) await AsyncStorage.setItem(`${KEY}.${uid}`, JSON.stringify(ref.current));
  }, [uid]);

  /** Push un-synced profile/preference changes (made offline) to the server. */
  const flushOutbox = useCallback(async () => {
    if (!uid) return;
    const { outbox } = ref.current;
    if (outbox.prefs && Object.keys(outbox.prefs).length) {
      const { error } = await supabase.from('preferences').update(outbox.prefs).eq('user_id', uid);
      if (!error) delete ref.current.outbox.prefs;
    }
    if (outbox.profile && Object.keys(outbox.profile).length) {
      const { error } = await supabase.from('profiles').update(outbox.profile).eq('id', uid);
      if (!error) delete ref.current.outbox.profile;
    }
    await persist();
  }, [uid, persist]);

  useEffect(() => {
    if (!uid) { setP(DEFAULT_PREFS); setPr(null); ref.current = { prefs: DEFAULT_PREFS, profile: null, outbox: {} }; setLoadedFor(null); return; }
    let alive = true;
    (async () => {
      const raw = await AsyncStorage.getItem(`${KEY}.${uid}`);
      const cached = raw ? JSON.parse(raw) as { prefs?: Preferences; profile?: Profile; outbox?: Outbox } : null;
      if (cached && alive) {
        ref.current = { prefs: { ...DEFAULT_PREFS, ...cached.prefs }, profile: cached.profile ?? null, outbox: cached.outbox ?? {} };
        setP(ref.current.prefs); setPr(ref.current.profile);
        setLoadedFor(uid); // open instantly (and offline) from the device copy; server values refresh below
      }
      await flushOutbox();
      const [p, pr] = await Promise.all([
        supabase.from('preferences').select('*').eq('user_id', uid).maybeSingle(),
        supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      ]);
      if (!alive) return;
      const pending = ref.current.outbox; // local changes not yet on the server win over server values
      if (p.data) ref.current.prefs = { ...DEFAULT_PREFS, ...p.data, ...pending.prefs };
      if (pr.data) ref.current.profile = { ...(pr.data as Profile), ...pending.profile };
      setP(ref.current.prefs); setPr(ref.current.profile);
      // Offline with a cache → use it. Offline with no cache → still continue (defaults) rather than hang.
      setLoadedFor(uid);
      await persist();
      // gentle-restart detection reads last_active_at above; bump it afterwards
      if (pr.data) await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', uid);
    })();
    return () => { alive = false; };
  }, [uid, flushOutbox, persist]);

  const value: Ctx = {
    prefs, profile, loaded,
    async setPrefs(patch) {
      ref.current.prefs = { ...ref.current.prefs, ...patch };
      ref.current.outbox.prefs = { ...ref.current.outbox.prefs, ...patch };
      setP(ref.current.prefs);
      await persist(); await flushOutbox();
    },
    async setProfile(patch) {
      ref.current.profile = { ...(ref.current.profile as Profile), ...patch };
      ref.current.outbox.profile = { ...ref.current.outbox.profile, ...patch };
      setPr(ref.current.profile);
      await persist(); await flushOutbox();
    },
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export const usePreferences = () => {
  const c = useContext(C);
  if (!c) throw new Error('usePreferences outside provider');
  return c;
};

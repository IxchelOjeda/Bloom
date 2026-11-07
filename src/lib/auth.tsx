import type { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { callFunction, supabase } from './supabase';
import { cancelAll } from './notifications';
import { setDbUser } from './db';

interface AuthCtx {
  session: Session | null;
  ready: boolean;
  signUp(email: string, password: string): Promise<string | null>;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<string | null>;
  updatePassword(pw: string): Promise<string | null>;
  deleteAccount(): Promise<string | null>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setDbUser(data.session?.user.id ?? null); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setDbUser(s?.user.id ?? null); });
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    session, ready,
    async signUp(email, password) {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: Linking.createURL('/') } });
      return error?.message ?? null;
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error?.message ?? null;
    },
    async signOut() {
      // reminders on this phone belong to the person signing out (e.g. medication) — stop them
      await cancelAll().catch(() => {});
      await supabase.auth.signOut();
      // cached rows are per-user keyed, but clear them so a shared phone leaks nothing
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('orchid.cache.'));
      await AsyncStorage.multiRemove(keys);
    },
    async resetPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: Linking.createURL('/(auth)/reset') });
      return error?.message ?? null;
    },
    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      return error?.message ?? null;
    },
    async deleteAccount() {
      try { await callFunction('delete-account', {}); await value.signOut(); return null; }
      catch (e) { return e instanceof Error ? e.message : String(e); }
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
};

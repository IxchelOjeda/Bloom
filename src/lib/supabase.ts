import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const isConfigured = !!url && !!anon && !url.includes('YOUR-PROJECT');

/**
 * Session tokens live in the OS keychain/keystore. SecureStore caps values at ~2 KB,
 * so the session JSON is split into chunks.
 */
const CHUNK = 1800;
const secureStorage = {
  async getItem(key: string) {
    const n = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!n) return null;
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return parts.every((p) => p != null) ? parts.join('') : null;
  },
  async setItem(key: string, value: string) {
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
  },
  async removeItem(key: string) {
    const n = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
    await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)));
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

export const supabase = createClient(url ?? 'http://localhost', anon ?? 'missing', {
  auth: {
    storage: Platform.OS === 'web' ? undefined : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Calls an Edge Function with the user's JWT; API keys stay server-side. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch {}
    throw new Error(msg);
  }
  return data as T;
}

/**
 * Data layer: offline-first reads + queued writes on top of Supabase.
 *
 * Reads: useRows() shows the cached copy instantly, then refreshes from the server.
 * Writes: db.insert/update/remove apply locally at once, queue for sync, and notify
 * every screen showing that table — plus tables the server-side triggers touch,
 * so e.g. logging a debt payment refreshes the debt card and the dashboard.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { applyPending, enqueue, EMPTY, flush, load, NetworkError, Op, QueueState, save } from './offlineQueue';

// Tables whose rows are changed by database triggers when *this* table is written.
const DEPENDENTS: Record<string, string[]> = {
  tasks: ['goals', 'events'],
  focus_sessions: ['activities'],
  progress_entries: ['activities', 'goals'],
  transactions: ['debts', 'savings_goals', 'accounts', 'recurring_payments', 'major_purchases'],
  food_logs: ['meal_plans'],
  meal_plans: ['events'],
};

// ---------- tiny event bus ----------
type Listener = (table: string) => void;
const listeners = new Set<Listener>();
export function emitChange(table: string) {
  const all = new Set([table, ...(DEPENDENTS[table] ?? [])]);
  all.forEach((t) => listeners.forEach((l) => l(t)));
}
export function onChange(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

// ---------- queue + sync status ----------
let queue: QueueState = EMPTY;
let online = true;
let syncing = false;
const statusSubs = new Set<() => void>();
let status = { online: true, pending: 0, failed: 0, syncing: false };
const setStatus = () => { status = { online, pending: queue.pending.length, failed: queue.failed.length, syncing }; statusSubs.forEach((s) => s()); };
export const useSyncStatus = () => useSyncExternalStore((cb) => { statusSubs.add(cb); return () => statusSubs.delete(cb); }, () => status);

const kv = { get: AsyncStorage.getItem, set: AsyncStorage.setItem };

const transport = {
  async insert(table: string, row: Record<string, unknown>) { throwIf(await supabase.from(table).upsert(row, { onConflict: 'id' })); },
  async patch(table: string, id: string, patch: Record<string, unknown>) { throwIf(await supabase.from(table).update(patch).eq('id', id)); },
  async remove(table: string, id: string) { throwIf(await supabase.from(table).delete().eq('id', id)); },
};
function throwIf(res: { error: { message: string; code?: string } | null }) {
  if (!res.error) return;
  // fetch failures have no Postgres code → treat as offline and retry later
  if (!res.error.code || /fetch|network/i.test(res.error.message)) throw new NetworkError(res.error.message);
  throw new Error(res.error.message);
}

export async function initSync() {
  queue = await load(kv);
  setStatus();
  NetInfo.addEventListener((s) => {
    const was = online; online = !!s.isConnected && s.isInternetReachable !== false; setStatus();
    if (online && !was) void syncNow();
  });
  void syncNow();
}

export async function syncNow() {
  if (syncing || !online || queue.pending.length === 0) return;
  syncing = true; setStatus();
  const touched = new Set(queue.pending.map((o) => o.table));
  queue = await flush(queue, transport);
  await save(kv, queue);
  syncing = false; setStatus();
  touched.forEach(emitChange);
}

export function dismissFailed() { queue = { ...queue, failed: [] }; void save(kv, queue); setStatus(); }

export const newId = () => Crypto.randomUUID();
let currentUser: string | null = null;
export const setDbUser = (id: string | null) => { currentUser = id; };

async function push(op: Op) {
  queue = enqueue(queue, op);
  await save(kv, queue);
  setStatus();
  emitChange(op.table);
  void syncNow();
}

export const db = {
  async insert<T extends Record<string, unknown>>(table: string, row: T): Promise<T & { id: string }> {
    if (!currentUser) throw new Error('Not signed in');
    const full = { id: newId(), user_id: currentUser, ...row } as T & { id: string };
    await push({ kind: 'insert', table, id: full.id, row: full, ts: Date.now() });
    return full;
  },
  async update(table: string, id: string, patch: Record<string, unknown>) {
    await push({ kind: 'patch', table, id, patch, ts: Date.now() });
  },
  async remove(table: string, id: string) {
    await push({ kind: 'delete', table, id, ts: Date.now() });
  },
};

// ---------- reads ----------
type QueryFn = (q: ReturnType<typeof supabase.from>) => PromiseLike<{ data: any[] | null; error: any }>;

/**
 * @param table  table name
 * @param key    stable cache key for this particular query (e.g. "tasks:today:2026-11-07")
 * @param query  builds the Supabase query; defaults to select * ordered by created_at
 */
export function useRows<T extends { id: string }>(table: string, key: string, query?: QueryFn, filterLocal?: (r: T) => boolean) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const qRef = useRef(query); qRef.current = query;
  const fRef = useRef(filterLocal); fRef.current = filterLocal;
  const cacheKey = `lifeos.cache.${currentUser}.${key}`;

  const withPending = useCallback((base: T[]) => {
    const merged = applyPending(base, table, queue.pending);
    return fRef.current ? merged.filter(fRef.current) : merged;
  }, [table]);

  const refresh = useCallback(async () => {
    try {
      const builder = supabase.from(table);
      const res = await (qRef.current ? qRef.current(builder) : builder.select('*').order('created_at'));
      if (res.error) throw new Error(res.error.message);
      const data = (res.data ?? []) as T[];
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
      setRows(withPending(data)); setError(null);
    } catch (e) {
      // offline: keep cached rows; only surface errors when we have nothing to show
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [table, cacheKey, withPending]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(cacheKey).then((raw) => { if (alive && raw) { setRows(withPending(JSON.parse(raw))); setLoading(false); } });
    void refresh();
    const off = onChange((t) => {
      if (t !== table) return;
      // instant local view, then server truth
      AsyncStorage.getItem(cacheKey).then((raw) => alive && setRows(withPending(raw ? JSON.parse(raw) : [])));
      void refresh();
    });
    return () => { alive = false; off(); };
  }, [cacheKey, table, refresh, withPending]);

  return { rows, loading, error, refresh };
}

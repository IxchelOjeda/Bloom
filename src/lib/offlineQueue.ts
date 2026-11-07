/**
 * Offline write queue (pure core; storage + transport are injected so it's testable).
 *
 * - Every row gets a client-generated UUID, so replaying an insert is idempotent
 *   (upsert on primary key) → no duplicates after reconnect.
 * - Updates are queued as *patches* (only changed fields). Two devices editing
 *   different fields of the same row both survive; the same field is last-write-wins.
 * - Repeated edits to one row coalesce into a single op; delete-after-create of a row
 *   that never reached the server cancels out entirely.
 * - Network errors stop the flush (retry later). Server rejections (RLS/validation)
 *   move the op to `failed` so the UI can tell the user instead of looping forever.
 */

export type Op =
  | { kind: 'insert'; table: string; id: string; row: Record<string, unknown>; ts: number }
  | { kind: 'patch'; table: string; id: string; patch: Record<string, unknown>; ts: number }
  | { kind: 'delete'; table: string; id: string; ts: number };

export interface QueueState { pending: Op[]; failed: { op: Op; error: string }[] }

export interface KV { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> }

export interface Transport {
  insert(table: string, row: Record<string, unknown>): Promise<void>;   // must upsert on id
  patch(table: string, id: string, patch: Record<string, unknown>): Promise<void>;
  remove(table: string, id: string): Promise<void>;
}

export class NetworkError extends Error {}

export function enqueue(state: QueueState, op: Op): QueueState {
  const pending = [...state.pending];
  const idx = pending.findIndex((p) => p.table === op.table && p.id === op.id);
  if (idx === -1) return { ...state, pending: [...pending, op] };
  const prev = pending[idx];

  if (op.kind === 'delete') {
    if (prev.kind === 'insert') pending.splice(idx, 1);          // never reached server → nothing to do
    else pending[idx] = op;
  } else if (op.kind === 'patch') {
    if (prev.kind === 'insert') pending[idx] = { ...prev, row: { ...prev.row, ...op.patch }, ts: op.ts };
    else if (prev.kind === 'patch') pending[idx] = { ...prev, patch: { ...prev.patch, ...op.patch }, ts: op.ts };
    else return state;                                            // patch after delete: ignore
  } else {
    pending[idx] = op;                                            // re-insert (same id) replaces
  }
  return { ...state, pending };
}

export async function flush(state: QueueState, t: Transport): Promise<QueueState> {
  const pending = [...state.pending];
  const failed = [...state.failed];
  while (pending.length) {
    const op = pending[0];
    try {
      if (op.kind === 'insert') await t.insert(op.table, op.row);
      else if (op.kind === 'patch') await t.patch(op.table, op.id, op.patch);
      else await t.remove(op.table, op.id);
      pending.shift();
    } catch (e) {
      if (e instanceof NetworkError) break;                       // keep order, retry later
      failed.push({ op, error: e instanceof Error ? e.message : String(e) });
      pending.shift();
    }
  }
  return { pending, failed };
}

export const EMPTY: QueueState = { pending: [], failed: [] };

export async function load(kv: KV, key = 'lifeos.queue'): Promise<QueueState> {
  try { const raw = await kv.get(key); return raw ? (JSON.parse(raw) as QueueState) : EMPTY; } catch { return EMPTY; }
}
export async function save(kv: KV, s: QueueState, key = 'lifeos.queue') { await kv.set(key, JSON.stringify(s)); }

/** Apply queued ops to cached rows so the UI shows offline edits immediately. */
export function applyPending<T extends { id: string }>(rows: T[], table: string, pending: Op[]): T[] {
  let out = [...rows];
  for (const op of pending) {
    if (op.table !== table) continue;
    if (op.kind === 'insert') out = [...out.filter((r) => r.id !== op.id), op.row as unknown as T];
    else if (op.kind === 'patch') out = out.map((r) => (r.id === op.id ? { ...r, ...op.patch } : r));
    else out = out.filter((r) => r.id !== op.id);
  }
  return out;
}

/**
 * LOCAL TEST GATEWAY — not shipped, not used in production.
 *
 * Speaks the subset of the Supabase HTTP protocol that supabase-js uses in this app
 * (GoTrue /auth/v1 and PostgREST /rest/v1) and runs every request against a real
 * Postgres with the real migrations. Each REST request runs in its own transaction
 * as the `authenticated` role with `request.jwt.claim.sub` set, so Row Level Security,
 * grants and triggers behave as they do on Supabase.
 *
 * Why: the hosted Supabase stack (Docker images) is not reachable from every dev/CI
 * sandbox. This lets the real app run end-to-end in a browser (Expo web + Playwright).
 *
 * Usage:  PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres node tests/e2e/gateway.mjs
 *         then EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=local-anon
 */
import crypto from 'node:crypto';
import http from 'node:http';
import pg from 'pg';

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const SECRET = process.env.GATEWAY_JWT_SECRET ?? 'local-test-secret-not-for-production';
const pool = new pg.Pool({ database: process.env.PGDATABASE ?? 'orchid_e2e' });

// ---------------- JWT (HS256) ----------------
const b64u = (b) => Buffer.from(b).toString('base64url');
function sign(payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
function verify(token) {
  const [h, p, s] = String(token).split('.');
  if (!s) return null;
  const good = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  if (good.length !== s.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(s))) return null;
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  return claims.exp * 1000 > Date.now() ? claims : null;
}
const refreshTokens = new Map(); // token -> user id

const hash = (pw, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
const checkPw = (pw, stored) => { const [salt] = stored.split(':'); return hash(pw, salt) === stored; };

function userObj(u) {
  return { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}
function session(u) {
  const expires_in = 3600;
  const access_token = sign({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + expires_in });
  const refresh_token = crypto.randomBytes(24).toString('hex');
  refreshTokens.set(refresh_token, u);
  return { access_token, token_type: 'bearer', expires_in, expires_at: Math.floor(Date.now() / 1000) + expires_in, refresh_token, user: userObj(u) };
}

// ---------------- helpers ----------------
const IDENT = /^[a-z_][a-z0-9_]*$/;
const q = (id) => { if (!IDENT.test(id)) throw httpErr(400, 'PGRST100', `bad identifier ${id}`); return `"${id}"`; };
function httpErr(status, code, message) { return Object.assign(new Error(message), { status, code }); }

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
async function readBody(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : undefined;
}

function parseSelect(sel) {
  if (!sel || sel.trim() === '*') return '*';
  return sel.split(',').map((s) => q(s.trim())).join(', ');
}

/** PostgREST filters → SQL. Supports eq neq gt gte lt lte like ilike in is, and not.<op>. */
function buildWhere(params, values) {
  const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
  const parts = [];
  for (const [col, raw] of params) {
    if (RESERVED.has(col)) continue;
    if (col === 'or' || col === 'and') throw httpErr(400, 'PGRST100', 'or/and filters not supported by the test gateway');
    let expr = raw; let negate = false;
    if (expr.startsWith('not.')) { negate = true; expr = expr.slice(4); }
    const dot = expr.indexOf('.');
    const op = expr.slice(0, dot); const val = expr.slice(dot + 1);
    const c = q(col);
    let sql;
    const ph = (v) => { values.push(v); return `$${values.length}`; };
    switch (op) {
      case 'eq': sql = `${c} = ${ph(val)}`; break;
      case 'neq': sql = `${c} <> ${ph(val)}`; break;
      case 'gt': sql = `${c} > ${ph(val)}`; break;
      case 'gte': sql = `${c} >= ${ph(val)}`; break;
      case 'lt': sql = `${c} < ${ph(val)}`; break;
      case 'lte': sql = `${c} <= ${ph(val)}`; break;
      case 'like': sql = `${c}::text like ${ph(val.replace(/\*/g, '%'))}`; break;
      case 'ilike': sql = `${c}::text ilike ${ph(val.replace(/\*/g, '%'))}`; break;
      case 'is': {
        const v = val.toLowerCase();
        if (!['null', 'true', 'false'].includes(v)) throw httpErr(400, 'PGRST100', `bad is value ${val}`);
        sql = `${c} is ${v}`; break;
      }
      case 'in': {
        const items = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).filter((s) => s !== '');
        sql = items.length ? `${c}::text = any(${ph(items)}::text[])` : 'false'; break;
      }
      case 'cs': sql = `${c} @> ${ph(val)}`; break;
      case 'ov': sql = `${c} && ${ph(val)}`; break;
      default: throw httpErr(400, 'PGRST100', `operator ${op} not supported by the test gateway`);
    }
    parts.push(negate ? `not (${sql})` : sql);
  }
  return parts.length ? ` where ${parts.join(' and ')}` : '';
}

function buildOrder(order) {
  if (!order) return '';
  return ' order by ' + order.split(',').map((o) => {
    const [col, ...mods] = o.split('.');
    const dir = mods.includes('desc') ? 'desc' : 'asc';
    const nulls = mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : '';
    return `${q(col)} ${dir}${nulls}`;
  }).join(', ');
}

async function asUser(claims, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${claims ? 'authenticated' : 'anon'}`);
    if (claims) {
      await client.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [claims.sub, JSON.stringify(claims)]);
    }
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) { await client.query('rollback').catch(() => {}); throw e; } finally { client.release(); }
}

// ---------------- PostgREST ----------------
async function rest(req, res, table, claims, url) {
  const params = [...url.searchParams.entries()];
  const get = (k) => url.searchParams.get(k);
  const prefer = req.headers.prefer ?? '';
  const wantsObject = (req.headers.accept ?? '').includes('vnd.pgrst.object');
  const t = `public.${q(table)}`;
  const values = [];
  let sql;
  if (req.method === 'GET' || req.method === 'HEAD') {
    sql = `select ${parseSelect(get('select'))} from ${t}${buildWhere(params, values)}${buildOrder(get('order'))}`;
    if (get('limit')) sql += ` limit ${Number(get('limit'))}`;
    if (get('offset')) sql += ` offset ${Number(get('offset'))}`;
  } else if (req.method === 'POST') {
    let body = await readBody(req);
    const rows = Array.isArray(body) ? body : [body];
    const cols = get('columns') ? get('columns').split(',').map((s) => s.replace(/"/g, '')) : [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const colSql = cols.map(q).join(', ');
    values.push(JSON.stringify(rows));
    sql = `insert into ${t} (${colSql}) select ${colSql} from json_populate_recordset(null::${t}, $1)`;
    if (prefer.includes('resolution=')) {
      const target = (get('on_conflict') ?? 'id').split(',').map(q).join(', ');
      sql += prefer.includes('ignore-duplicates') ? ` on conflict (${target}) do nothing`
        : ` on conflict (${target}) do update set ${cols.map((c) => `${q(c)} = excluded.${q(c)}`).join(', ')}`;
    }
    sql += ` returning ${parseSelect(get('select'))}`;
  } else if (req.method === 'PATCH') {
    const body = await readBody(req);
    const cols = Object.keys(body);
    values.push(JSON.stringify(body));
    sql = `update ${t} set (${cols.map(q).join(', ')}) = (select ${cols.map(q).join(', ')} from json_populate_record(null::${t}, $1))`;
    if (cols.length === 1) sql = `update ${t} set ${q(cols[0])} = (select ${q(cols[0])} from json_populate_record(null::${t}, $1))`;
    sql += buildWhere(params, values) + ` returning ${parseSelect(get('select'))}`;
  } else if (req.method === 'DELETE') {
    sql = `delete from ${t}${buildWhere(params, values)} returning ${parseSelect(get('select'))}`;
  } else throw httpErr(405, 'PGRST000', 'method not allowed');

  // Serialize with Postgres' own JSON encoding, exactly like PostgREST (dates stay 'YYYY-MM-DD', numerics are numbers).
  const wrapped = req.method === 'GET' || req.method === 'HEAD'
    ? `select coalesce(json_agg(_r), '[]'::json) as j from (${sql}) _r`
    : `with _w as (${sql}) select coalesce(json_agg(_w), '[]'::json) as j from _w`;
  const result = await asUser(claims, (c) => c.query(wrapped, values));
  const rows = result.rows[0].j;
  const headers = { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${prefer.includes('count=') ? rows.length : '*'}` };
  if (req.method !== 'GET' && !prefer.includes('return=representation')) return send(res, req.method === 'POST' ? 201 : 204, undefined, headers);
  if (wantsObject) {
    if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null });
    return send(res, 200, rows[0], headers);
  }
  return send(res, req.method === 'POST' ? 201 : 200, rows, headers);
}

// ---------------- GoTrue ----------------
async function auth(req, res, path, url) {
  const admin = async (sql, v) => (await pool.query(sql, v)).rows;
  if (req.method === 'POST' && path === 'signup') {
    const { email, password } = await readBody(req);
    if (!email || !password || password.length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
    const exists = await admin('select 1 from auth.users where lower(email) = lower($1)', [email]);
    if (exists.length) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
    const id = crypto.randomUUID();
    await admin('insert into auth.users (id, email) values ($1, $2)', [id, email]);
    await admin('insert into auth.gw_passwords (user_id, hash) values ($1, $2)', [id, hash(password)]);
    return send(res, 200, session({ id, email }));
  }
  if (req.method === 'POST' && path === 'token') {
    const body = await readBody(req);
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const u = refreshTokens.get(body.refresh_token);
      if (!u) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      refreshTokens.delete(body.refresh_token);
      return send(res, 200, session(u));
    }
    const rows = await admin('select u.id, u.email, p.hash from auth.users u join auth.gw_passwords p on p.user_id = u.id where lower(u.email) = lower($1)', [body.email]);
    if (!rows.length || !checkPw(body.password, rows[0].hash)) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return send(res, 200, session(rows[0]));
  }
  const claims = verify((req.headers.authorization ?? '').replace(/^Bearer /i, ''));
  if (path === 'user' && req.method === 'GET') {
    if (!claims) return send(res, 401, { code: 401, msg: 'invalid JWT' });
    return send(res, 200, userObj({ id: claims.sub, email: claims.email }));
  }
  if (path === 'user' && req.method === 'PUT') {
    if (!claims) return send(res, 401, { code: 401, msg: 'invalid JWT' });
    const body = await readBody(req);
    if (body.password) await admin('update auth.gw_passwords set hash = $2 where user_id = $1', [claims.sub, hash(body.password)]);
    return send(res, 200, userObj({ id: claims.sub, email: claims.email }));
  }
  if (path === 'logout') return send(res, 204);
  if (path === 'recover') { console.log('[gateway] password recovery requested (no email sent locally)'); return send(res, 200, {}); }
  return send(res, 404, { msg: `auth endpoint ${path} not implemented in the test gateway` });
}

// ---------------- Edge Functions ----------------
async function fn(req, res, name, claims) {
  if (!claims) return send(res, 401, { error: 'Not signed in' });
  if (name === 'delete-account') {
    // Mirrors supabase/functions/delete-account: deletes the auth user; FKs cascade to every table.
    await pool.query('delete from auth.users where id = $1', [claims.sub]);
    return send(res, 200, { ok: true });
  }
  // AI + food search functions run on Deno with server-side secrets; not emulated here.
  return send(res, 503, { error: `The "${name}" function isn't running in the local test gateway. Deploy Edge Functions to use it.` });
}

http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD');
  res.setHeader('access-control-expose-headers', 'content-range');
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, 'http://x');
  const [, svc, ver, name] = url.pathname.split('/');
  try {
    const claims = verify((req.headers.authorization ?? '').replace(/^Bearer /i, ''));
    if (svc === 'rest' && ver === 'v1' && name) return await rest(req, res, name, claims, url);
    if (svc === 'auth' && ver === 'v1') return await auth(req, res, name, url);
    if (svc === 'functions' && ver === 'v1') return await fn(req, res, name, claims);
    send(res, 404, { message: 'not found' });
  } catch (e) {
    const status = e.status ?? (e.code === '42501' ? 403 : e.code === '23505' ? 409 : 400);
    if (process.env.GATEWAY_DEBUG) console.error('[gateway]', req.method, req.url, e.message);
    send(res, status, { code: e.code ?? 'PGRST000', message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
  }
}).listen(PORT, () => console.log(`[gateway] listening on http://localhost:${PORT} (db ${pool.options.database})`));

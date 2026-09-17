import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Tests run against a frozen copy of the original demo data, independent of the live catalogs in data/. */
export const DATA_DIR = path.join(ROOT, 'test', 'fixtures', 'data');
export const require = createRequire(import.meta.url);

export function loadJson(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
}

export function loadSeed() {
  const products = loadJson('test/fixtures/data/products.json');
  const chains = loadJson('test/fixtures/data/chains.json');
  const catalogs = {};
  for (const chain of chains) catalogs[chain.id] = loadJson(`test/fixtures/data/catalogs/${chain.id}.json`);
  return { products, chains, catalogs };
}

/** Minimal fetch wrapper that stores cookies per origin, like a browser would. */
export function cookieFetch(baseFetch = globalThis.fetch) {
  const jar = new Map();
  return async (url, init = {}) => {
    const origin = new URL(url).origin;
    const headers = new Headers(init.headers ?? {});
    const cookies = jar.get(origin);
    if (cookies?.size) headers.set('cookie', [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
    const res = await baseFetch(url, { ...init, headers });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const line of set) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      if (!jar.has(origin)) jar.set(origin, new Map());
      jar.get(origin).set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
    return res;
  };
}

/** A fake DOM just rich enough for the injector (meta tags + banner). */
export function fakeDocument({ meta = {}, inputs = {}, cookie = '' } = {}) {
  const banner = { id: null, textContent: '', style: {}, setAttribute() {}, getAttribute() { return null; } };
  return {
    cookie,
    body: { appendChild(el) { banner.appended = el; } },
    getElementById(id) { return banner.id === id ? banner : null; },
    createElement() { banner.id = 'cart-handoff-banner'; return banner; },
    querySelector(sel) {
      const m = sel.match(/^meta\[name="(.+)"\]$/);
      if (m) return m[1] in meta ? { getAttribute: () => meta[m[1]] } : null;
      const i = sel.match(/^input\[name="(.+)"\]$/);
      if (i) return i[1] in inputs ? { value: inputs[i[1]] } : null;
      return null;
    },
    get banner() { return banner; },
  };
}

export function fakeResponse({ status = 200, json = null, text = null } = {}) {
  const body = text ?? (json === null ? '' : JSON.stringify(json));
  return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
}

/** An in-memory stand-in for the Upstash REST API: enough commands for RedisHandoffStore. */
export function fakeUpstash({ token = 'tok' } = {}) {
  const kv = new Map();
  const zsets = new Map();
  const ttl = new Map();
  const range = (len, start, stop) => { if (start < 0) start += len; if (stop < 0) stop += len; return [Math.max(start, 0), Math.min(stop, len - 1)]; };
  const sorted = (key) => [...(zsets.get(key) ?? new Map()).entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  function exec([cmd, ...args]) {
    switch (String(cmd).toUpperCase()) {
      case 'GET': return kv.has(args[0]) ? kv.get(args[0]) : null;
      case 'SET': { kv.set(args[0], args[1]); const ex = args.indexOf('EX'); if (ex > -1) ttl.set(args[0], Number(args[ex + 1])); return 'OK'; }
      case 'DEL': { let n = 0; for (const k of args) if (kv.delete(k)) n++; return n; }
      case 'MGET': return args.map((k) => (kv.has(k) ? kv.get(k) : null));
      case 'EXPIRE': ttl.set(args[0], Number(args[1])); return 1;
      case 'ZADD': { const z = zsets.get(args[0]) ?? new Map(); z.set(args[2], Number(args[1])); zsets.set(args[0], z); return 1; }
      case 'ZREM': { const z = zsets.get(args[0]); let n = 0; for (const m of args.slice(1)) if (z?.delete(m)) n++; return n; }
      case 'ZRANGE': { const members = sorted(args[0]).map((e) => e[0]); const [s, e] = range(members.length, Number(args[1]), Number(args[2])); const out = members.slice(s, e + 1); return args.includes('REV') ? out.reverse() : out; }
      case 'ZREMRANGEBYRANK': { const z = zsets.get(args[0]); if (!z) return 0; const entries = sorted(args[0]); const [s, e] = range(entries.length, Number(args[1]), Number(args[2])); let n = 0; for (let i = s; i <= e; i++) { z.delete(entries[i][0]); n++; } return n; }
      default: throw new Error(`ERR unknown command '${cmd}'`);
    }
  }
  const fetch = async (url, init = {}) => {
    if (init.headers?.Authorization !== `Bearer ${token}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = JSON.parse(init.body);
    if (String(url).endsWith('/pipeline')) return Response.json(body.map((c) => { try { return { result: exec(c) }; } catch (err) { return { error: err.message }; } }));
    try { return Response.json({ result: exec(body) }); } catch (err) { return Response.json({ error: err.message }, { status: 400 }); }
  };
  return { fetch, kv, zsets, ttl };
}

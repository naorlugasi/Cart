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

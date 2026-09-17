/**
 * Every-store file listings for the price-transparency portals (phase "כל הסניפים", DATA-SERVICE-PLAN §4.2).
 *
 * One function per portal type. Each returns the files currently published for ALL stores of a
 * retailer, in one shape:
 *
 *   { kind: 'PriceFull'|'PromoFull'|'Stores', storeId: '039'|null, sub: '001'|null, ts: '20260917-055457',
 *     name: 'PriceFull7290058140886-001-039-20260917-055457.gz', url, headers? , size? }
 *
 * scripts/fetch-prices.mjs keeps fetching the single online store for the app's catalog; this module
 * feeds pipeline/fetch.mjs, which downloads the latest PriceFull of every store plus the Stores file.
 *
 * Portal notes (all verified 17-18.9.2026, plain HTTP, no browser, no request to any chain's shop):
 *   shufersal        FileObject/UpdateCategory?catID=<2 PriceFull|4 PromoFull|5 Stores>&storeId=0&page=N,
 *                    20 links a page; the last page repeats when N is too large.
 *   publishedprices  login (public user, no password) then /file/json/dir; names are not uniform:
 *                    "PriceFull<chain>-<sub>-<store>-<ts>", "PriceFull<chain>-<store>-<ts>" (Keshet), and
 *                    lowercase "pricefull<chain>-<store>-<ts>" (Rami Levy's online store, a ZIP).
 *   carrefour        the page embeds `const files = [...]` for one day: /?date=YYYYMMDD; the download URL
 *                    is /<YYYYMMDD>/<name>. ~1,650 entries a day, ~147 stores with PriceFull.
 *   hazihinam        /Prices?p=N (50 rows a page); Stores through /Prices?t=Stores.
 *   laib             /webapi/api/getfiles?edi=<chain> (all branches, sometimes an empty array: retry).
 *   bina             MainIO_Hok.aspx { WStore: 0, WDate: '', WFileType: 4|5|1 }; Download.aspx?FileNm= -> [{ SPath }].
 */
import { gunzipSync, inflateRawSync } from 'node:zlib';

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** Parse a transparency file name into its parts; null when the name is not one of ours. */
export function parseFileName(name) {
  const m = name.match(/^(pricefull|promofull|price|promo|storesfull|stores)(\d{13})-(?:(\d{3})-)?(\d{3,4})?-?(\d{8}-?\d{4,6})/i);
  if (!m) return null;
  const kindRaw = m[1].toLowerCase();
  const kind = kindRaw === 'pricefull' ? 'PriceFull' : kindRaw === 'promofull' ? 'PromoFull' : kindRaw.startsWith('stores') ? 'Stores' : kindRaw === 'price' ? 'Price' : 'Promo';
  // "Stores<chain>-000-<ts>" has no store id: the 000 lands in `sub` and storeId stays null.
  let sub = m[3] ?? null, storeId = m[4] ?? null;
  if (kind === 'Stores') { storeId = null; sub = null; }
  if (kind !== 'Stores' && sub && !storeId) { storeId = sub; sub = null; }
  return { kind, chain: m[2], sub, storeId, ts: m[5] };
}

/** Keep the newest file per (kind, storeId). */
export function latestPerStore(files) {
  const map = new Map();
  for (const f of files) {
    const key = `${f.kind}:${f.storeId ?? ''}`;
    const cur = map.get(key);
    if (!cur || f.ts > cur.ts) map.set(key, f);
  }
  return [...map.values()];
}

export async function fetchRetry(url, init = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(init.timeoutMs ?? 60000) });
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) { lastErr = err; if (i < tries - 1) await new Promise((r) => setTimeout(r, [5000, 15000][i] ?? 15000)); }
  }
  throw lastErr;
}
const text = async (url, init) => { const r = await fetchRetry(url, init); if (!r.ok) throw new Error(`${url} -> ${r.status}`); return r.text(); };

/** Bytes of a transparency file -> XML text (gzip, ZIP or plain; UTF-16 variants). */
export function decodeArchive(buf) {
  let data = buf;
  if (data[0] === 0x1f && data[1] === 0x8b) data = gunzipSync(data);
  else if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) data = unzipFirstEntry(data);
  if (data[0] === 0xff && data[1] === 0xfe) return data.toString('utf16le').replace(/^﻿/, '');
  if (data[0] === 0xfe && data[1] === 0xff) return Buffer.from(data).swap16().toString('utf16le').replace(/^﻿/, '');
  return data.toString('utf8').replace(/^﻿/, '');
}
export function unzipFirstEntry(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('zip: end-of-central-directory record not found');
  const cd = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(cd + 10), compressedSize = buf.readUInt32LE(cd + 20), local = buf.readUInt32LE(cd + 42);
  const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(dataStart, dataStart + compressedSize);
  if (method === 8) return inflateRawSync(data);
  if (method === 0) return Buffer.from(data);
  throw new Error(`zip: unsupported compression method ${method}`);
}

const withParts = (name, extra) => { const p = parseFileName(name); return p ? { ...p, name, ...extra } : null; };

export const portals = {
  async shufersal(src) {
    const out = [];
    for (const catId of [2, 4, 5]) {
      let prev = '';
      for (let page = 1; page <= 60; page++) {
        // Shufersal's portal answers in 8-30 seconds; give each page time and retries.
        const html = await text(`https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=${catId}&storeId=0&page=${page}`, { timeoutMs: 150000 });
        const links = [...html.matchAll(/href="(https:\/\/pricesprodpublic[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
        const key = links.join('|');
        if (!links.length || key === prev) break;
        prev = key;
        for (const url of links) { const name = url.match(/\/((?:Price|Promo|Stores)[A-Za-z]*[0-9-]+\.(?:gz|xml))/)?.[1]; const f = name && withParts(name, { url }); if (f) out.push(f); }
        if (catId === 5) break;
      }
    }
    return out;
  },

  async publishedprices(src) {
    const host = 'https://url.publishedprices.co.il';
    const jar = new Map();
    const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const grab = (res) => { for (const l of res.headers.getSetCookie?.() ?? []) { const [p] = l.split(';'); const i = p.indexOf('='); jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } };
    const get = async (u) => { const r = await fetchRetry(u, { headers: { cookie: cookie() }, redirect: 'manual' }); grab(r); return r; };
    const lp = await (await get(`${host}/login`)).text();
    const token = lp.match(/<meta name="csrftoken" content="([^"]+)"/)?.[1];
    const login = await fetchRetry(`${host}/login/user`, { method: 'POST', redirect: 'manual', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ r: '', username: src.user, password: src.password ?? '', csrftoken: token }) });
    grab(login);
    if (login.status !== 302) throw new Error(`publishedprices login for ${src.user} failed (${login.status})`);
    const fp = await (await get(`${host}/file`)).text();
    const t2 = fp.match(/<meta name="csrftoken" content="([^"]+)"/)?.[1] ?? token;
    const dir = async (search) => {
      const rows = [];
      for (let start = 0; start < 20000; start += 3000) {
        const body = new URLSearchParams({ sEcho: '1', iColumns: '5', sColumns: ',,,,', iDisplayStart: String(start), iDisplayLength: '3000', mDataProp_0: 'fname', mDataProp_1: 'typeLabel', mDataProp_2: 'size', mDataProp_3: 'ftime', mDataProp_4: '', sSearch: search, bRegex: 'false', iSortingCols: '0', cd: '/', csrftoken: t2 });
        const res = await fetchRetry(`${host}/file/json/dir`, { method: 'POST', headers: { cookie: cookie(), 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded' }, body });
        const json = await res.json();
        const page = json.aaData ?? [];
        rows.push(...page);
        if (rows.length >= Number(json.iTotalDisplayRecords ?? 0) || !page.length) break;
      }
      return rows;
    };
    const out = [];
    for (const search of ['PriceFull', 'PromoFull', 'Stores']) {
      for (const r of await dir(search)) {
        const f = withParts(r.fname, { url: `${host}/file/d/${r.fname}`, headers: { cookie: cookie() }, size: r.size });
        if (f && f.chain === src.chain && (f.kind === search || (search === 'Stores' && f.kind === 'Stores'))) out.push(f);
      }
    }
    return out;
  },

  // The page lists one day; early in the morning it holds only the first uploads, so today's and
  // yesterday's listings are merged (latestPerStore keeps the newest per store).
  async carrefour(src, { date } = {}) {
    const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const today = date ?? fmt(new Date());
    const y = new Date(`${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}T12:00:00`); y.setDate(y.getDate() - 1);
    const out = [];
    for (const day of [today, fmt(y)]) {
      const html = await text(`https://prices.carrefour.co.il/?date=${day}`);
      out.push(...parseCarrefourPage(html).map((f) => ({ ...f, url: `https://prices.carrefour.co.il/${f.ts.slice(0, 8)}/${f.name}` })).filter((f) => f.chain === src.chain));
    }
    return out;
  },

  async hazihinam(src) {
    const out = [];
    for (let page = 1; page <= 40; page++) {
      const html = await text(`https://shop.hazi-hinam.co.il/Prices?p=${page}&s=&f=&t=&d=`);
      const urls = [...html.matchAll(/https:\/\/[^"'\s]+regulatories\/[^"'\s]+/g)].map((m) => m[0]);
      if (!urls.length) break;
      for (const url of urls) { const f = withParts(url.split('/').pop(), { url }); if (f) out.push(f); }
    }
    const storesHtml = await text('https://shop.hazi-hinam.co.il/Prices?p=1&s=&f=&t=Stores&d=');
    for (const url of [...storesHtml.matchAll(/https:\/\/[^"'\s]+regulatories\/[^"'\s]+/g)].map((m) => m[0])) { const f = withParts(url.split('/').pop(), { url }); if (f) out.push(f); }
    return out;
  },

  async laib(src) {
    const api = async (p) => { const r = await fetchRetry(`https://laibcatalog.co.il/webapi/api/${p}?edi=${src.chain}`); if (!r.ok) throw new Error(`laib ${p}: HTTP ${r.status}`); return r.json(); };
    let files = [];
    for (let i = 0; i < 3 && !files.length; i++) { files = await api('getfiles'); if (!files.length) await new Promise((r) => setTimeout(r, 10000)); }
    if (!files.length) throw new Error(`laib ${src.chain}: getfiles returned nothing`);
    return files.map((f) => withParts(f.fileName, { url: `https://laibcatalog.co.il/webapi/${src.chain}/${f.fileName}`, size: f.size })).filter(Boolean);
  },

  async bina(src) {
    const base = `https://${src.host}`;
    const post = async (page, body) => { const r = await fetchRetry(`${base}/${page}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() }); if (!r.ok) throw new Error(`${base}/${page} -> ${r.status}`); return r.json(); };
    const out = [];
    for (const type of ['4', '5', '1']) {
      for (const r of await post('MainIO_Hok.aspx', { WStore: '0', WDate: '', WFileType: type })) {
        const f = withParts(r.FileNm, { storeName: (r.Store ?? '').trim(), resolve: async () => { const res = await fetchRetry(`${base}/Download.aspx?FileNm=${encodeURIComponent(r.FileNm)}`); const meta = await res.json().catch(() => null); return meta?.[0]?.SPath ?? null; } });
        if (f) out.push(f);
      }
    }
    return out;
  },
};

/** The Carrefour portal page: `const files = [{ name, size, modified }, ...]` */
export function parseCarrefourPage(html) {
  const i = html.indexOf('const files = [');
  if (i < 0) return [];
  const j = html.indexOf('];', i);
  let arr = [];
  try { arr = JSON.parse(html.slice(i + 'const files = '.length, j + 1)); } catch { return []; }
  return arr.map((f) => withParts(f.name, { size: f.size })).filter(Boolean);
}

/** File timestamp -> Date (both "20260917-055457" and "202609170523" forms). */
export function tsDate(ts) {
  const d = ts.replace(/-/g, '');
  return new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10) || '00'}:${d.slice(10, 12) || '00'}:00`);
}

/** All files of a retailer, newest per (kind, store), Stores included. Files older than `maxAgeDays`
 *  are ignored: portals keep stale files of stores that no longer publish (Yochananof 7999, 12/2024). */
export async function listRetailer(src, { maxAgeDays = 3, ...opts } = {}) {
  const all = await portals[src.portal](src, opts);
  const cutoff = Date.now() - maxAgeDays * 86400e3;
  // Stores files can be weekly: the newest one is kept whatever its age.
  return latestPerStore(all.filter((f) => f.kind === 'Stores' || (['PriceFull', 'PromoFull'].includes(f.kind) && tsDate(f.ts).getTime() >= cutoff)));
}

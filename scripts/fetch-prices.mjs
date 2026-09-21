#!/usr/bin/env node
/**
 * Download the latest PriceFull / PromoFull files of each chain's ONLINE store from the chains'
 * price-transparency portals (חוק שקיפות מחירים) and import them into full catalogs.
 *
 *   node scripts/fetch-prices.mjs [chain ...]        # default: every chain in SOURCES
 *
 * Output (git-ignored): data/prices/<chain>/PriceFull.xml, PromoFull.xml and catalog.full.json.
 * Run scripts/build-products.mjs afterwards to derive data/products.json and the slim per-chain
 * catalogs the app ships with.
 *
 * Portals (September 2026):
 *   shufersal        prices.shufersal.co.il (Azure blob links; store 413 = "שופרסל ONLINE")
 *   publishedprices  url.publishedprices.co.il (Cerberus FTP web UI, public usernames without a
 *                    password as mandated by the regulation): Rami Levy, Yochananof, Tiv Taam, Keshet
 *   carrefour        prices.carrefour.co.il - also hosts the Yeinot Bitan and Quik online stores
 *   laib             laibcatalog.co.il (ASP.NET form, needs a browser): Victory, Mahsanei Hashuk
 *   hazihinam        shop.hazi-hinam.co.il/prices (Azure blob links)
 *   bina             <chain>.binaprojects.com (ASP.NET, JSON endpoints): Shuk City (7 online stores)
 * Express Mehadrin publishes no machine-readable portal we could find.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { gunzipSync, inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePriceFile, parsePromoFile, buildCatalogFromFiles } from '../src/catalog/priceXml.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'prices');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export const shufersalCode = (code) => (/^729000\d{7}$/.test(code) ? `P_${Number(code.slice(6))}` : `P_${code}`);

export const SOURCES = {
  // Shufersal's storefront code is "P_" + the price-file ItemCode, except that barcodes under the
  // chain's own 729000 prefix are shortened to the number after the prefix (7290000066318 -> P_66318,
  // 7290004131074 -> P_4131074); verified against the live cart API (docs/HANDOFF.md).
  shufersal: { portal: 'shufersal', store: '413', storeName: 'שופרסל ONLINE', storeItemId: shufersalCode },
  // The online store (039, StoreType 2 in the Stores file) is published as "pricefull<chain>-039-<ts>.gz":
  // lowercase, without the sub-chain segment, and the archive is a ZIP. Matches the website's prices
  // (98% identical to the storefront API on 17.9.2026; the rest are intra-day changes).
  ramilevy: { portal: 'publishedprices', user: 'RamiLevi', chain: '7290058140886', sub: '001', store: '039', storeName: 'מרלוג אינטרנט' },
  // Yochananof sells online for pickup only, so the online price is the pickup branch's shelf price:
  // with the Magento "Store" header of a pickup view the site's prices equal that branch's published
  // file 100% (verified 17.9.2026 for 9 of 11 views). Catalog branch: 050 נתניה הדרים = view s116.
  // Two pickup views (s82 צומת חולון, the site default, and s79 יד אליהו) match no published file.
  // Yochananof is split into pickup sub-chains, one per published price list (DATA-SERVICE-PLAN §4.1.1):
  // A = 18 pickup points priced like branch 050 (view s116), B = בת ים / נס ציונה priced like branch 015
  // (view s84). C (צומת חולון, רמלה, יד אליהו) has no published file and is therefore not built.
  yochananof: { portal: 'publishedprices', user: 'yohananof', chain: '7290803800003', sub: '001', store: '050', storeName: 'יוחננוף פיקאפ A - נתניה הדרים (view s116)', storeView: 's116' },
  yochananof_b: { portal: 'publishedprices', user: 'yohananof', chain: '7290803800003', sub: '001', store: '015', storeName: 'יוחננוף פיקאפ B - אור יהודה (בת ים / נס ציונה, view s84)', storeView: 's84' },
  tivtaam: { portal: 'publishedprices', user: 'TivTaam', chain: '7290873255550', sub: '001', store: '502', storeName: 'ליקוט נתניה (online picking)' },
  // Keshet's online warehouses (116, 120; StoreType 2) publish "PriceFull<chain>-120-<ts>.gz" without a sub-chain segment.
  keshet: { portal: 'publishedprices', user: 'Keshet', chain: '7290785400000', sub: '001', store: '120', storeName: 'ממ"ר פתח תקווה (online)' },
  carrefour: { portal: 'carrefour', chain: '7290055700007', sub: '001', store: '471', storeName: 'קרפור אונליין כפר סבא' },
  ybitan: { portal: 'carrefour', chain: '7290055700007', sub: '001', store: '472', storeName: '@ יהלומים ביתן (online)' },
  quik: { portal: 'carrefour', chain: '7290055700007', sub: '001', store: '473', storeName: 'כפר סבא @ קוויק' },
  victory: { portal: 'laib', chain: '7290696200003', sub: '001', store: '097', storeName: 'אינטרנט' },
  mck: { portal: 'laib', chain: '7290661400001', sub: '003', store: '097', storeName: '97 אינטרנט' },
  // The portal publishes two stores: 219 "online warehouse" holds only ~600 items, while 103 carries
  // the full assortment and matches the website (94% identical on 17.9.2026). 103 is the online catalog.
  hazihinam: { portal: 'hazihinam', chain: '7290700100008', sub: '000', store: '103', storeName: 'חצי חינם - סניף 103 (מחירון האתר; 219 הוא מחסן חלקי)' },
  // Shuk City (Self Point site, retailer 1254) publishes seven online stores (StoreType 2, one per delivery
  // area: 304 רמות, 305 אשקלון צפוני, 309 קרית גת, 311 כפר סבא, 312 בני ברק, 313 רמלה, 319 אור ים) with
  // small, area-specific files. Verified 18.9.2026 against the website's default branch (Self Point 1636):
  // the site's regular prices equal file 305 (26/26), 311, 312 and 313 (100% on their overlap) but not
  // 309 "קרית גת" (13/44). 305 is the largest online file and is the catalog source.
  shukcity: { portal: 'bina', host: 'shuk-hayir.binaprojects.com', chain: '7290058148776', sub: '000', store: '305', storeName: 'אונליין - אשקלון צפוני (matches the site, 26/26)' },
  // Osher Ad has no online store: the largest branch file stands in for the chain (store prices).
  osherad: { portal: 'publishedprices', user: 'osherad', chain: '7290103152017', sub: '001', store: null, storeName: 'אושר עד (no online store)', onlineStore: false },
};

// The portals are flaky (slow Azure front-ends, connect timeouts, occasional 5xx): every listing and
// download request is retried up to RETRY_WAITS.length times on network errors and 5xx/429 responses.
const RETRY_WAITS = [5000, 15000, 30000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchRetry = async (url, init = {}) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt >= RETRY_WAITS.length) throw err;
      const wait = RETRY_WAITS[attempt];
      console.log(`  retry ${attempt + 1}/${RETRY_WAITS.length} in ${wait / 1000}s: ${String(url).split('?')[0]} (${err.cause?.code ?? err.message})`);
      await sleep(wait);
    }
  }
};
const fetchText = async (url, init = {}) => {
  const res = await fetchRetry(url, { ...init, headers: { 'user-agent': UA, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
};
const fetchBuffer = async (url, init = {}) => {
  const res = await fetchRetry(url, { ...init, headers: { 'user-agent': UA, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};
// Some chains (Rami Levy's online store, the Bina portals) publish a ZIP archive under a .gz name:
// read the first entry through the central directory (sizes in the local header may be zero).
export const unzipFirstEntry = (buf) => {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('zip: end-of-central-directory record not found');
  const cd = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('zip: bad central directory');
  const method = buf.readUInt16LE(cd + 10);
  const compressedSize = buf.readUInt32LE(cd + 20);
  const nameLen = buf.readUInt16LE(cd + 28), extraLen = buf.readUInt16LE(cd + 30), commentLen = buf.readUInt16LE(cd + 32);
  const local = buf.readUInt32LE(cd + 42);
  const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(dataStart, dataStart + compressedSize);
  void nameLen; void extraLen; void commentLen;
  if (method === 8) return inflateRawSync(data);
  if (method === 0) return Buffer.from(data);
  throw new Error(`zip: unsupported compression method ${method}`);
};
const decodeXml = (buf) => {
  let data = buf;
  if (data[0] === 0x1f && data[1] === 0x8b) data = gunzipSync(data);
  if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) data = unzipFirstEntry(data);
  if (data[0] === 0xff && data[1] === 0xfe) return data.toString('utf16le').replace(/^﻿/, '');
  if (data[0] === 0xfe && data[1] === 0xff) return data.swap16().toString('utf16le').replace(/^﻿/, '');
  return data.toString('utf8').replace(/^﻿/, '');
};
const stamp = (name) => (name.match(/-(\d{8}-?\d{4,6})/) ?? [])[1] ?? '';
const latest = (names) => names.filter(Boolean).sort((a, b) => stamp(b).localeCompare(stamp(a)))[0] ?? null;

// The stamp in a portal file name is the moment the chain produced the file, Israel wall-clock time
// ("20260919-121005", Keshet/Rami Levy "202609190010"). It is the honest "prices as of" date: on a
// Shabbat or holiday nothing new is published, the fetch takes Friday's file, and generatedAt (the
// download time) would claim today. Returned as ISO 8601 with the Asia/Jerusalem offset of that
// instant, null when the name carries no stamp.
const jerusalemOffsetMinutes = (utcMs) => {
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'longOffset' }).formatToParts(new Date(utcMs)).find((p) => p.type === 'timeZoneName')?.value ?? '';
  const m = tz.match(/([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
};
export function sourceDateFromName(name) {
  const s = stamp(String(name ?? '').split('/').pop()).replace('-', '');
  if (s.length < 12) return null;
  const [y, mo, d, h, mi] = [s.slice(0, 4), s.slice(4, 6), s.slice(6, 8), s.slice(8, 10), s.slice(10, 12)];
  const se = s.length >= 14 ? s.slice(12, 14) : '00';
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  if (Number.isNaN(wall)) return null;
  const off = jerusalemOffsetMinutes(wall - jerusalemOffsetMinutes(wall) * 60000);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return `${y}-${mo}-${d}T${h}:${mi}:${se}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- portals
const portals = {
  async shufersal(src) {
    const pick = async (catId) => {
      const html = await fetchText(`https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=${catId}&storeId=${src.store}&page=1`);
      const links = [...html.matchAll(/href="(https:\/\/pricesprodpublic[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
      return latest(links.map((l) => ({ l, n: l.match(/(Price|Promo)Full[0-9-]+\.gz/)?.[0] })).filter((x) => x.n).sort((a, b) => stamp(b.n).localeCompare(stamp(a.n))).map((x) => x.l).slice(0, 1)) ;
    };
    return { price: await pick(2), promo: await pick(4) };
  },
  async publishedprices(src) {
    const jar = new Map();
    const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const grab = (res) => { for (const line of res.headers.getSetCookie?.() ?? []) { const [pair] = line.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); } };
    const get = async (url) => { const res = await fetchRetry(url, { headers: { 'user-agent': UA, cookie: cookieHeader() }, redirect: 'manual' }); grab(res); return res; };
    const loginPage = await (await get('https://url.publishedprices.co.il/login')).text();
    const token = loginPage.match(/<meta name="csrftoken" content="([^"]+)"/)?.[1];
    const login = await fetchRetry('https://url.publishedprices.co.il/login/user', { method: 'POST', redirect: 'manual', headers: { 'user-agent': UA, cookie: cookieHeader(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ r: '', username: src.user, password: '', Submit: 'Sign in', csrftoken: token }) });
    grab(login);
    if (login.status !== 302) throw new Error(`publishedprices login for ${src.user} failed (${login.status})`);
    const filePage = await (await get('https://url.publishedprices.co.il/file')).text();
    const token2 = filePage.match(/<meta name="csrftoken" content="([^"]+)"/)?.[1] ?? token;
    const list = async (prefix) => {
      const body = new URLSearchParams({ sEcho: '1', iColumns: '5', sColumns: ',,,,', iDisplayStart: '0', iDisplayLength: '3000', mDataProp_0: 'fname', mDataProp_1: 'typeLabel', mDataProp_2: 'size', mDataProp_3: 'ftime', mDataProp_4: '', sSearch: prefix, iSortCol_0: '3', sSortDir_0: 'desc', iSortingCols: '1', cd: '/', csrftoken: token2 });
      const res = await fetchRetry('https://url.publishedprices.co.il/file/json/dir', { method: 'POST', headers: { 'user-agent': UA, cookie: cookieHeader(), 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded' }, body });
      const json = await res.json();
      // The portal's search is case-insensitive and so are the chains: Rami Levy's online store
      // publishes "pricefull<chain>-039-<ts>.gz" (lowercase, no sub-chain segment) next to the
      // "PriceFull<chain>-001-<store>-<ts>.gz" files of its branches.
      allRows = (json.aaData ?? []).filter((r) => r.fname.toLowerCase().startsWith(prefix.toLowerCase()));
      return allRows.map((r) => r.fname);
    };
    let allRows = [];
    // Sub-chain ids vary per chain and not every online warehouse publishes a file: look for the
    // configured store under any sub-chain, else fall back to the largest file (a flagship store).
    const all = await list(`PriceFull${src.chain}`);
    const forStore = (names, kind) => names.filter((n) => new RegExp(`^${kind}${src.chain}-(?:\\d{3}-)?${src.store}-`, 'i').test(n));
    const wanted = forStore(all, 'PriceFull');
    let priceName = latest(wanted);
    if (!priceName) {
      const sizes = new Map();
      for (const r of allRows) { const m = r.fname.match(/-(\d{3})-(\d{3})-/); if (m && (!sizes.has(m[1] + '-' + m[2]) || sizes.get(m[1] + '-' + m[2]).size < r.size)) sizes.set(m[1] + '-' + m[2], r); }
      const biggest = [...sizes.values()].sort((a, b) => b.size - a.size)[0];
      if (!biggest) return { price: null, promo: null };
      priceName = biggest.fname;
      src.store = biggest.fname.match(/-(\d{3})-(\d{3})-/)[2];
      src.storeName = `${src.storeName} - not published, using the largest store ${src.store} instead`;
      src.onlineStore = false;
    }
    const promoName = latest(forStore(await list(`PromoFull${src.chain}`), 'PromoFull'));
    const dl = (name) => (name ? { url: `https://url.publishedprices.co.il/file/d/${name}`, headers: { cookie: cookieHeader() } } : null);
    return { price: dl(priceName), promo: dl(promoName) };
  },
  async carrefour(src) {
    const html = await fetchText('https://prices.carrefour.co.il/');
    const names = [...html.matchAll(/"name":"((?:Price|Promo)Full[0-9-]+\.gz)"/g)].map((m) => m[1]);
    const url = (n) => (n ? `https://prices.carrefour.co.il/${n.match(/-(\d{8})-/)[1]}/${n}` : null);
    return { price: url(latest(names.filter((n) => n.startsWith(`PriceFull${src.chain}-${src.sub}-${src.store}-`)))), promo: url(latest(names.filter((n) => n.startsWith(`PromoFull${src.chain}-${src.sub}-${src.store}-`)))) };
  },
  /** shop.hazi-hinam.co.il/Prices is paginated (?p=N, 50 rows a page, ~7 pages for the current
   *  files of 13 stores); the first page alone shows whichever stores published last. Walk every page. */
  async hazihinam(src) {
    const links = [];
    for (let page = 1; page <= 30; page++) {
      const html = await fetchText(`https://shop.hazi-hinam.co.il/Prices?p=${page}&s=&f=&t=&d=`);
      const found = [...html.matchAll(/https:\/\/[^"']+(?:Price|Promo)Full[0-9-]+\.gz/g)].map((m) => m[0]);
      if (!found.length) break;
      links.push(...found);
    }
    const pick = (kind) => latest(links.filter((l) => l.includes(`${kind}Full${src.chain}-${src.sub}-${src.store}-`)));
    return { price: pick('Price'), promo: pick('Promo') };
  },
  /** Bina (binaprojects.com: Shuk City, Zol VeBegadol, King Store, Maayan 2000, ...): an ASP.NET page whose
   *  data comes from three POST endpoints. MainIO_Hok.aspx { WStore, WDate, WFileType } lists files
   *  (1 Stores, 2 Price, 3 Promo, 4 PriceFull, 5 PromoFull; empty WDate = the current files);
   *  Download.aspx?FileNm= answers JSON [{ SPath }] with the real file URL; the archive is gzip or ZIP.
   *  Online stores are StoreType 2 in the Stores file and named "אונליין - <area>" in the listing. */
  async bina(src) {
    const base = `https://${src.host}`;
    const post = async (page, body) => {
      const res = await fetchRetry(`${base}/${page}`, { method: 'POST', headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
      if (!res.ok) throw new Error(`${base}/${page} -> ${res.status}`);
      return res.json();
    };
    const latestPerStore = (rows) => {
      const map = new Map();
      for (const r of rows) { const m = r.FileNm.match(/-(\d{3})-(\d{8}-?\d{4,6})/); if (!m) continue; if (!map.has(m[1]) || stamp(r.FileNm) > stamp(map.get(m[1]).FileNm)) map.set(m[1], r); }
      return map;
    };
    const prices = latestPerStore(await post('MainIO_Hok.aspx', { WStore: '0', WDate: '', WFileType: '4' }));
    const promos = latestPerStore(await post('MainIO_Hok.aspx', { WStore: '0', WDate: '', WFileType: '5' }));
    if (!prices.size) throw new Error(`bina ${src.host}: no PriceFull files listed`);
    let store = src.store && prices.has(src.store) ? src.store : null;
    if (!store) {
      const online = [...prices.values()].filter((r) => /אונליין|online|אינטרנט/i.test(r.Store ?? ''));
      const pick = online[0] ?? [...prices.values()][0];
      store = pick.FileNm.match(/-(\d{3})-/)[1];
      src.store = store;
      src.storeName = `${(pick.Store ?? '').trim()}${online.length ? '' : ' (no online store listed)'}`;
      if (!online.length) src.onlineStore = false;
    } else {
      src.storeName = (prices.get(store).Store ?? src.storeName ?? '').trim() || src.storeName;
    }
    const resolve = async (row) => {
      if (!row) return null;
      const res = await fetchRetry(`${base}/Download.aspx?FileNm=${encodeURIComponent(row.FileNm)}`, { headers: { 'user-agent': UA } });
      const meta = await res.json().catch(() => null);
      return meta?.[0]?.SPath ?? null;
    };
    return { price: await resolve(prices.get(store)), promo: await resolve(promos.get(store)) };
  },
  /** Laib (Victory, Mahsanei Hashuk, H. Cohen): a JSON API behind laibcatalog.co.il/<chain>/index.html.
   *  getbranches lists branches, getfiles lists every file; downloads are /webapi/<edi>/<fileName>. */
  async laib(src) {
    const api = (path) => fetch(`https://laibcatalog.co.il/webapi/api/${path}?edi=${src.chain}`, { headers: { 'user-agent': UA } }).then((r) => { if (!r.ok) throw new Error(`laib ${path}: HTTP ${r.status}`); return r.json(); });
    const branches = await api('getbranches');
    const files = await api('getfiles');
    const num = (b) => String(b.number ?? b.Number).padStart(3, '0');
    const branch = branches.find((b) => src.store && num(b) === src.store) ?? branches.find((b) => /אינטרנט|אונליין|online|מרלוג/i.test(b.name ?? b.Name ?? ''));
    if (!branch) throw new Error(`laib: no online branch for ${src.chain}: ${branches.map((b) => b.name ?? b.Name).join(', ')}`);
    src.store = num(branch);
    src.storeName = branch.name ?? branch.Name;
    const pick = (type) => latest(files.filter((f) => String(f.branchNumber).padStart(3, '0') === src.store && String(f.fileType).toLowerCase() === type).map((f) => f.fileName));
    const url = (n) => (n ? `https://laibcatalog.co.il/webapi/${src.chain}/${n}` : null);
    return { price: url(pick('pricefull')), promo: url(pick('promofull')) };
  },
};

async function download(target) {
  if (!target) return null;
  const url = typeof target === 'string' ? target : target.url;
  const headers = typeof target === 'string' ? {} : target.headers;
  return decodeXml(await fetchBuffer(url, { headers }));
}

/** `offline`: rebuild catalog.full.json from the PriceFull/PromoFull already on disk (no portal access). */
export async function fetchChain(chainId, { offline = false } = {}) {
  const src = { ...SOURCES[chainId] };
  if (!src) throw new Error(`unknown chain ${chainId}`);
  const dir = path.join(OUT, chainId);
  mkdirSync(dir, { recursive: true });
  let files, priceXml, promoXml;
  if (offline) {
    const pricePath = path.join(dir, 'PriceFull.xml');
    if (!existsSync(pricePath)) throw new Error(`${chainId}: no ${pricePath} to rebuild from`);
    priceXml = readFileSync(pricePath, 'utf8');
    promoXml = existsSync(path.join(dir, 'PromoFull.xml')) ? readFileSync(path.join(dir, 'PromoFull.xml'), 'utf8') : null;
    const prev = existsSync(path.join(dir, 'catalog.full.json')) ? JSON.parse(readFileSync(path.join(dir, 'catalog.full.json'), 'utf8')).source : null;
    files = { price: prev?.price ?? 'PriceFull.xml', promo: prev?.promo ?? (promoXml ? 'PromoFull.xml' : null) };
  } else {
    files = await portals[src.portal](src);
    if (!files.price) throw new Error(`${chainId}: no PriceFull found for store ${src.store}`);
    priceXml = await download(files.price);
    promoXml = await download(files.promo);
    writeFileSync(path.join(dir, 'PriceFull.xml'), priceXml);
    if (promoXml) writeFileSync(path.join(dir, 'PromoFull.xml'), promoXml);
  }
  const price = parsePriceFile(priceXml);
  const promo = promoXml ? parsePromoFile(promoXml, { chainId }) : null;
  const storeItemIdFor = src.storeItemId ? (item) => src.storeItemId(item.code) : (item) => item.code;
  const catalog = buildCatalogFromFiles({ chainId, price, promo, storeItemIdFor });
  catalog.generatedAt = new Date().toISOString();
  catalog.source = { portal: src.portal, store: src.store, storeName: src.storeName, onlineStore: src.onlineStore !== false, price: String(typeof files.price === 'string' ? files.price : files.price.url).split('?')[0], promo: files.promo ? String(typeof files.promo === 'string' ? files.promo : files.promo.url).split('?')[0] : null };
  catalog.sourceDate = sourceDateFromName(catalog.source.price);
  writeFileSync(path.join(dir, 'catalog.full.json'), JSON.stringify(catalog));
  const st = promo?.stats ?? null;
  const withPromo = catalog.items.filter((i) => i.promotions.length).length;
  if (st) writeFileSync(path.join(dir, 'promo-report.json'), JSON.stringify({ chainId, layout: promo.layout, ...st, itemsWithPromo: withPromo }, null, 2));
  return { chainId, items: catalog.items.length, promos: st?.promotions ?? 0, promosParsed: st?.parsed ?? 0, promosClub: st?.club ?? 0, promosSkipped: st?.skipped ?? {}, itemsWithPromo: withPromo, store: src.store, storeName: src.storeName };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const chains = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const offline = process.argv.includes('--offline');
  const targets = chains.length ? chains : Object.keys(SOURCES);
  let failed = 0;
  for (const chainId of targets) {
    try {
      const r = await fetchChain(chainId, { offline });
      const sk = Object.entries(r.promosSkipped).map(([k, v]) => `${k} ${v}`).join(', ');
      console.log(`${chainId.padEnd(12)} store ${r.store} (${r.storeName}): ${r.items} items, promotions ${r.promosParsed}/${r.promos} usable${r.promosClub ? ` (${r.promosClub} club)` : ''}, ${r.itemsWithPromo} items with a promo${sk ? ` [skipped: ${sk}]` : ''}`);
    } catch (err) {
      failed++;
      console.log(`${chainId.padEnd(12)} FAILED: ${err.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

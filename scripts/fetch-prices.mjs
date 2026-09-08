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
 * Shuk City and Express Mehadrin publish no machine-readable portal we could find.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
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
  ramilevy: { portal: 'publishedprices', user: 'RamiLevi', chain: '7290058140886', sub: '001', store: '039', storeName: 'מרלוג אינטרנט' },
  yochananof: { portal: 'publishedprices', user: 'yohananof', chain: '7290803800003', sub: '001', store: '001', storeName: 'יוחננוף מפוח (no dedicated online store)' },
  tivtaam: { portal: 'publishedprices', user: 'TivTaam', chain: '7290873255550', sub: '001', store: '502', storeName: 'ליקוט נתניה (online picking)' },
  keshet: { portal: 'publishedprices', user: 'Keshet', chain: '7290785400000', sub: '001', store: '120', storeName: 'ממ"ר פתח תקווה (online)' },
  carrefour: { portal: 'carrefour', chain: '7290055700007', sub: '001', store: '471', storeName: 'קרפור אונליין כפר סבא' },
  ybitan: { portal: 'carrefour', chain: '7290055700007', sub: '001', store: '472', storeName: '@ יהלומים ביתן (online)' },
  quik: { portal: 'carrefour', chain: '7290055700007', sub: '001', store: '473', storeName: 'כפר סבא @ קוויק' },
  victory: { portal: 'laib', chain: '7290696200003', sub: '001', store: '097', storeName: 'אינטרנט 97' },
  mck: { portal: 'laib', chain: '7290661400001', sub: '001', store: null, storeName: 'online branch (detected)' },
  hazihinam: { portal: 'hazihinam', chain: '7290700100008', sub: '000', store: '219', storeName: 'online warehouse 219' },
};

const fetchText = async (url, init = {}) => {
  const res = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
};
const fetchBuffer = async (url, init = {}) => {
  const res = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};
const decodeXml = (buf) => {
  let data = buf;
  if (data[0] === 0x1f && data[1] === 0x8b) data = gunzipSync(data);
  if (data[0] === 0xff && data[1] === 0xfe) return data.toString('utf16le').replace(/^﻿/, '');
  if (data[0] === 0xfe && data[1] === 0xff) return data.swap16().toString('utf16le').replace(/^﻿/, '');
  return data.toString('utf8').replace(/^﻿/, '');
};
const stamp = (name) => (name.match(/-(\d{8}-?\d{4,6})/) ?? [])[1] ?? '';
const latest = (names) => names.filter(Boolean).sort((a, b) => stamp(b).localeCompare(stamp(a)))[0] ?? null;

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
    const get = async (url) => { const res = await fetch(url, { headers: { 'user-agent': UA, cookie: cookieHeader() }, redirect: 'manual' }); grab(res); return res; };
    const loginPage = await (await get('https://url.publishedprices.co.il/login')).text();
    const token = loginPage.match(/<meta name="csrftoken" content="([^"]+)"/)?.[1];
    const login = await fetch('https://url.publishedprices.co.il/login/user', { method: 'POST', redirect: 'manual', headers: { 'user-agent': UA, cookie: cookieHeader(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ r: '', username: src.user, password: '', Submit: 'Sign in', csrftoken: token }) });
    grab(login);
    if (login.status !== 302) throw new Error(`publishedprices login for ${src.user} failed (${login.status})`);
    const filePage = await (await get('https://url.publishedprices.co.il/file')).text();
    const token2 = filePage.match(/<meta name="csrftoken" content="([^"]+)"/)?.[1] ?? token;
    const list = async (prefix) => {
      const body = new URLSearchParams({ sEcho: '1', iColumns: '5', sColumns: ',,,,', iDisplayStart: '0', iDisplayLength: '800', mDataProp_0: 'fname', mDataProp_1: 'typeLabel', mDataProp_2: 'size', mDataProp_3: 'ftime', mDataProp_4: '', sSearch: prefix, iSortCol_0: '3', sSortDir_0: 'desc', iSortingCols: '1', cd: '/', csrftoken: token2 });
      const res = await fetch('https://url.publishedprices.co.il/file/json/dir', { method: 'POST', headers: { 'user-agent': UA, cookie: cookieHeader(), 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded' }, body });
      const json = await res.json();
      allRows = (json.aaData ?? []).filter((r) => r.fname.startsWith(prefix));
      return allRows.map((r) => r.fname);
    };
    let allRows = [];
    // Sub-chain ids vary per chain and not every online warehouse publishes a file: look for the
    // configured store under any sub-chain, else fall back to the largest file (a flagship store).
    const all = await list(`PriceFull${src.chain}`);
    const wanted = all.filter((n) => new RegExp(`^PriceFull${src.chain}-\\d{3}-${src.store}-`).test(n));
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
    const sub = priceName.match(/-(\d{3})-\d{3}-/)[1];
    const promoName = latest(await list(`PromoFull${src.chain}-${sub}-${src.store}`));
    const dl = (name) => (name ? { url: `https://url.publishedprices.co.il/file/d/${name}`, headers: { cookie: cookieHeader() } } : null);
    return { price: dl(priceName), promo: dl(promoName) };
  },
  async carrefour(src) {
    const html = await fetchText('https://prices.carrefour.co.il/');
    const names = [...html.matchAll(/"name":"((?:Price|Promo)Full[0-9-]+\.gz)"/g)].map((m) => m[1]);
    const url = (n) => (n ? `https://prices.carrefour.co.il/${n.match(/-(\d{8})-/)[1]}/${n}` : null);
    return { price: url(latest(names.filter((n) => n.startsWith(`PriceFull${src.chain}-${src.sub}-${src.store}-`)))), promo: url(latest(names.filter((n) => n.startsWith(`PromoFull${src.chain}-${src.sub}-${src.store}-`)))) };
  },
  async hazihinam(src) {
    const html = await fetchText('https://shop.hazi-hinam.co.il/prices');
    const links = [...html.matchAll(/https:\/\/[^"']+(?:Price|Promo)Full[0-9-]+\.gz/g)].map((m) => m[0]);
    const pick = (kind) => latest(links.filter((l) => l.includes(`${kind}Full${src.chain}-${src.sub}-${src.store}-`)));
    return { price: pick('Price'), promo: pick('Promo') };
  },
  async laib(src) {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ userAgent: UA, locale: 'he-IL' });
    const out = { price: null, promo: null };
    try {
      await page.goto('https://laibcatalog.co.il/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.selectOption('#MainContent_chain', src.chain);
      await page.waitForTimeout(2500);
      const branches = await page.evaluate(() => [...document.querySelectorAll('#MainContent_branch option')].map((o) => ({ v: o.value, t: o.textContent.trim() })));
      const branch = branches.find((b) => src.store && b.v.endsWith(src.store)) ?? branches.find((b) => /אינטרנט|אונליין|online|מרלוג/i.test(b.t));
      if (!branch) throw new Error(`laib: no online branch for ${src.chain}: ${branches.map((b) => b.t).join(', ')}`);
      src.store = branch.v.slice(-3);
      src.storeName = branch.t;
      await page.selectOption('#MainContent_branch', branch.v);
      await page.waitForTimeout(2500);
      for (const [kind, value] of [['price', 'pricefull'], ['promo', 'promofull']]) {
        await page.selectOption('#MainContent_fileType', value);
        await page.waitForTimeout(1500);
        await page.click('#MainContent_btnSearch, input[type=submit]').catch(() => {});
        await page.waitForTimeout(4000);
        const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /(Price|Promo)Full[0-9-]+\.xml\.gz/.test(h)));
        out[kind] = latest(links.filter((l) => l.includes(`${kind === 'price' ? 'Price' : 'Promo'}Full${src.chain}-${src.sub}-${src.store}-`)));
      }
    } finally { await browser.close(); }
    return out;
  },
};

async function download(target) {
  if (!target) return null;
  const url = typeof target === 'string' ? target : target.url;
  const headers = typeof target === 'string' ? {} : target.headers;
  return decodeXml(await fetchBuffer(url, { headers }));
}

export async function fetchChain(chainId) {
  const src = { ...SOURCES[chainId] };
  if (!src) throw new Error(`unknown chain ${chainId}`);
  const files = await portals[src.portal](src);
  if (!files.price) throw new Error(`${chainId}: no PriceFull found for store ${src.store}`);
  const dir = path.join(OUT, chainId);
  mkdirSync(dir, { recursive: true });
  const priceXml = await download(files.price);
  const promoXml = await download(files.promo);
  writeFileSync(path.join(dir, 'PriceFull.xml'), priceXml);
  if (promoXml) writeFileSync(path.join(dir, 'PromoFull.xml'), promoXml);
  const price = parsePriceFile(priceXml);
  const promo = promoXml ? parsePromoFile(promoXml) : null;
  const storeItemIdFor = src.storeItemId ? (item) => src.storeItemId(item.code) : (item) => item.code;
  const catalog = buildCatalogFromFiles({ chainId, price, promo, storeItemIdFor });
  catalog.generatedAt = new Date().toISOString();
  catalog.source = { portal: src.portal, store: src.store, storeName: src.storeName, onlineStore: src.onlineStore !== false, price: String(typeof files.price === 'string' ? files.price : files.price.url).split('?')[0], promo: files.promo ? String(typeof files.promo === 'string' ? files.promo : files.promo.url).split('?')[0] : null };
  writeFileSync(path.join(dir, 'catalog.full.json'), JSON.stringify(catalog));
  return { chainId, items: catalog.items.length, promos: promo?.promotions.length ?? 0, store: src.store, storeName: src.storeName };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const chains = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const targets = chains.length ? chains : Object.keys(SOURCES);
  let failed = 0;
  for (const chainId of targets) {
    try {
      const r = await fetchChain(chainId);
      console.log(`${chainId.padEnd(12)} store ${r.store} (${r.storeName}): ${r.items} items, ${r.promos} promotions`);
    } catch (err) {
      failed++;
      console.log(`${chainId.padEnd(12)} FAILED: ${err.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

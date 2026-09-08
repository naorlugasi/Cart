#!/usr/bin/env node
/**
 * Online-storefront prices for chains whose price-transparency files do not cover the online store
 * (or cover it only partially). The storefront APIs recorded in src/handoff/adapters are queried
 * for the unified product list (data/products.json, or the GTINs passed in) and the result is
 * written to data/prices/<chain>/online.json = { gtin: { price, name, inStock, isWeighted, id } }.
 * scripts/build-products.mjs merges it over the file-based catalog.
 *
 *   node scripts/online-prices.mjs [ramilevy|yochananof|hazihinam ...] [--gtins file.json]
 *
 * The sites are contacted through a real browser (playwright) because they sit behind bot
 * protection and their APIs expect the page's own headers.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i === -1 ? def : argv[i + 1]; };
const chains = argv.filter((a) => !a.startsWith('--') && !argv[argv.indexOf(a) - 1]?.startsWith('--'));

function gtinList() {
  const file = opt('gtins', null);
  if (file) return JSON.parse(readFileSync(file, 'utf8'));
  const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
  return products.map((p) => p.gtin).filter(Boolean);
}
const chunk = (list, n) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };

const fetchers = {
  /** Rami Levy: POST /api/catalog { items: "<barcodes>", itemsBy: "barcode", store: 331 } with the site's anonymous bearer. */
  async ramilevy(page, gtins) {
    const { default: adapter } = await import('../src/handoff/adapters/ramilevy.js');
    await page.goto('https://www.rami-levy.co.il/he', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    const out = {};
    for (const group of chunk(gtins, 40)) {
      const data = await page.evaluate(async ({ headers, group }) => {
        const r = await fetch('/api/catalog?', { method: 'POST', headers: { ...headers, 'content-type': 'application/json;charset=UTF-8' }, body: JSON.stringify({ store: 331, items: group.join(','), size: group.length, itemsBy: 'barcode' }) });
        const j = await r.json();
        return (j.data ?? []).map((p) => ({ gtin: String(p.barcode), id: p.id, name: p.name, price: p.price?.price ?? null, isWeighted: !!(p.prop?.by_kilo || p.prop?.sw_shakil), inStock: p.prop?.status === 2 || p.prop?.status == null }));
      }, { headers: adapter.lookup.headers, group });
      for (const p of data) out[p.gtin] = p;
      await page.waitForTimeout(250);
    }
    return out;
  },
  /** Yochananof: GraphQL products(filter: { sku: { in: [...] } }) - SKU is the barcode. */
  async yochananof(page, gtins) {
    await page.goto('https://yochananof.co.il/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    const out = {};
    for (const group of chunk(gtins, 50)) {
      const data = await page.evaluate(async (skus) => {
        const q = 'query($skus:[String!]){ products(filter:{sku:{in:$skus}}, pageSize: 100){ items { sku name stock_status price_range { minimum_price { final_price { value } } } } } }';
        const r = await fetch('https://api.yochananof.co.il/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q, variables: { skus } }) });
        const j = await r.json();
        return (j.data?.products?.items ?? []).map((i) => ({ gtin: i.sku, id: i.sku, name: i.name, price: i.price_range?.minimum_price?.final_price?.value ?? null, inStock: i.stock_status !== 'OUT_OF_STOCK', isWeighted: false }));
      }, group);
      for (const p of data) out[p.gtin] = p;
      await page.waitForTimeout(250);
    }
    return out;
  },
  /** Hazi Hinam: walk every sub-category (item/getItemsBySubCategory) - the full online assortment. */
  async hazihinam(page) {
    await page.goto('https://shop.hazi-hinam.co.il/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    const subIds = await page.evaluate(async () => {
      const j = await (await fetch('/proxy/api/Catalog/get', { credentials: 'include', headers: { accept: 'application/json' } })).json();
      const ids = [];
      for (const c of j.Results?.Categories ?? []) for (const s of c.SubCategories ?? []) ids.push(s.Id);
      return ids;
    });
    const out = {};
    for (const id of subIds) {
      const items = await page.evaluate(async (id) => {
        const j = await (await fetch(`/proxy/api/item/getItemsBySubCategory?Id=${id}&IsDescending=false&SortBy=-1`, { credentials: 'include', headers: { accept: 'application/json' } })).json();
        const list = j.Results?.Category?.SubCategory?.Items ?? j.Results?.Items ?? [];
        return list.map((i) => ({ gtin: String(i.BarKod), id: i.Id, name: i.Name, price: i.Price_NET ?? i.Price_Regular ?? null, isWeighted: !!i.IsShakil, inStock: i.IsInStock !== false }));
      }, id);
      for (const p of items) if (/^\d{8,14}$/.test(p.gtin)) out[p.gtin] = p;
      await page.waitForTimeout(150);
    }
    return out;
  },
};

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
const context = await browser.newContext({ locale: 'he-IL', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' });
let failed = 0;
for (const chainId of chains.length ? chains : Object.keys(fetchers)) {
  const page = await context.newPage();
  try {
    const gtins = gtinList();
    const result = await fetchers[chainId](page, gtins);
    const dir = path.join(ROOT, 'data', 'prices', chainId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'online.json'), JSON.stringify({ chainId, fetchedAt: new Date().toISOString(), items: result }));
    console.log(`${chainId.padEnd(12)} ${Object.keys(result).length} online prices${chainId === 'hazihinam' ? ' (full assortment)' : ` for ${gtins.length} products`}`);
  } catch (err) { failed++; console.log(`${chainId.padEnd(12)} FAILED: ${err.message}`); }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);

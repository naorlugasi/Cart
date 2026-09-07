#!/usr/bin/env node
/**
 * Import a chain catalog from price-transparency XML files.
 *
 *   node scripts/import-prices.js --chain shufersal --price PriceFull.xml [--promo PromoFull.xml] [--out data/catalogs/shufersal.json]
 *   node scripts/import-prices.js --chain shufersal --price PriceFull.xml --store-item-id "P_{code}"
 *
 * `--store-item-id` is a template translating the barcode into the storefront item id
 * ({code} = ItemCode). Chains whose online ids differ from barcodes need a lookup table
 * instead: pass `--id-map map.json` with { "<barcode>": "<storeItemId>" }.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parsePriceFile, parsePromoFile, buildCatalogFromFiles } from '../src/catalog/priceXml.js';

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const chainId = opt('chain');
const priceFile = opt('price');
if (!chainId || !priceFile) {
  console.error('usage: import-prices.js --chain <id> --price <PriceFull.xml> [--promo <PromoFull.xml>] [--out <file>] [--store-item-id "P_{code}"] [--id-map map.json]');
  process.exit(1);
}

const price = parsePriceFile(readFileSync(priceFile, 'utf8'));
const promo = opt('promo') ? parsePromoFile(readFileSync(opt('promo'), 'utf8')) : null;
const template = opt('store-item-id', '{code}');
const idMap = opt('id-map') ? JSON.parse(readFileSync(opt('id-map'), 'utf8')) : null;

const storeItemIdFor = (item) => idMap?.[item.code] ?? template.replace('{code}', item.code);
const catalog = buildCatalogFromFiles({ chainId, price, promo, storeItemIdFor });
catalog.generatedAt = new Date().toISOString();
catalog.source = path.basename(priceFile);

const out = opt('out', path.join('data', 'catalogs', `${chainId}.json`));
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(catalog, null, 2) + '\n');
console.log(`${chainId}: ${catalog.items.length} items (${catalog.items.filter((i) => i.promotions.length).length} with promotions) -> ${out}`);

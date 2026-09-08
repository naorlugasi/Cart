#!/usr/bin/env node
/**
 * Writes the deterministic demo catalogs used by the test suite (test/fixtures/data/catalogs/<chain>.json)
 * from test/fixtures/data/products.json. The real catalogs in data/ come from the price-transparency
 * files (scripts/fetch-prices.mjs + scripts/build-products.mjs).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PROFILES, generateCatalog } from '../src/catalog/seedCatalogs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'test', 'fixtures', 'data');
const products = JSON.parse(readFileSync(path.join(dataDir, 'products.json'), 'utf8'));

mkdirSync(path.join(dataDir, 'catalogs'), { recursive: true });
for (const chainId of Object.keys(PROFILES)) {
  const catalog = generateCatalog(chainId, products);
  writeFileSync(path.join(dataDir, 'catalogs', `${chainId}.json`), JSON.stringify(catalog, null, 2) + '\n');
  console.log(`${chainId}: ${catalog.items.length} items`);
}

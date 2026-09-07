#!/usr/bin/env node
/**
 * Writes the deterministic demo catalogs (data/catalogs/<chain>.json) from data/products.json.
 * In production these files come from the price-transparency XML files (see scripts/import-prices.js).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PROFILES, generateCatalog } from '../src/catalog/seedCatalogs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data');
const products = JSON.parse(readFileSync(path.join(dataDir, 'products.json'), 'utf8'));

mkdirSync(path.join(dataDir, 'catalogs'), { recursive: true });
for (const chainId of Object.keys(PROFILES)) {
  const catalog = generateCatalog(chainId, products);
  writeFileSync(path.join(dataDir, 'catalogs', `${chainId}.json`), JSON.stringify(catalog, null, 2) + '\n');
  console.log(`${chainId}: ${catalog.items.length} items`);
}

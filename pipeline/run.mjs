#!/usr/bin/env node
/**
 * Every-store price pipeline (DATA-SERVICE-PLAN §4.2, §11): list -> fetch -> load into DuckDB.
 *
 *   node pipeline/run.mjs [--chains ramilevy,shufersal] [--date YYYYMMDD] [--stages fetch,load] [--kinds PriceFull,Stores] [--keep-days 7]
 *
 * Talks only to the price-transparency portals (never to a chain's shop). Idempotent per (chain, date).
 * Requires the duckdb CLI for the load stage (brew install duckdb).
 */
import path from 'node:path';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RETAILERS } from './retailers.mjs';
import { fetchRetailer } from './fetch.mjs';
import { loadRetailer } from './load.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i === -1 ? def : argv[i + 1]; };
const chains = (opt('chains', '') || Object.keys(RETAILERS).join(',')).split(',').filter(Boolean);
const localDay = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const date = opt('date', localDay());
const stages = opt('stages', 'fetch,load').split(',');
const kinds = opt('kinds', 'PriceFull,Stores').split(',');

const keepDays = Number(opt('keep-days', 7));

/** Raw archives older than --keep-days are deleted (DuckDB keeps the data; the manifests stay). */
function prune(root, days) {
  const rawRoot = path.join(root, 'data', 'pipeline', 'raw');
  if (!existsSync(rawRoot)) return;
  const cutoff = Date.now() - days * 86400e3;
  for (const chain of readdirSync(rawRoot)) for (const day of readdirSync(path.join(rawRoot, chain))) {
    const t = Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00`);
    if (!Number.isNaN(t) && t < cutoff) rmSync(path.join(rawRoot, chain, day), { recursive: true, force: true });
  }
}

let failed = 0;
for (const chainId of chains) {
  const src = RETAILERS[chainId];
  if (!src) { console.log(`${chainId}: unknown retailer`); failed++; continue; }
  try {
    if (stages.includes('fetch')) await fetchRetailer({ root: ROOT, chainId, src, date, kinds });
    if (stages.includes('load')) loadRetailer({ root: ROOT, chainId, date });
  } catch (err) {
    failed++;
    console.log(`${chainId.padEnd(12)} FAILED: ${err.message}`);
  }
}
if (stages.includes('fetch')) prune(ROOT, keepDays);
process.exit(failed ? 1 : 0);

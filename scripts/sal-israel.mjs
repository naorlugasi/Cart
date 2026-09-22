#!/usr/bin/env node
/**
 * "הסל של ישראל" - daily computation (docs/SAL-ISRAEL.md, plan §3.1-3.2).
 *
 *   node scripts/sal-israel.mjs             compute today's data/sal-israel.json + append history
 *   node scripts/sal-israel.mjs --check     per configured gtin: in products.json? in which catalogs?
 *                                            exit 1 (printed, not thrown) if any gtin is absent from
 *                                            products.json - never crashes, scripts/daily-refresh.sh
 *                                            treats a non-zero exit here as a warning, not a failed run.
 *
 * Called from scripts/daily-refresh.sh right after products:build (plan §3.2): a failure here must
 * never fail the publish (the site just keeps showing the last data/sal-israel.json), so every I/O
 * problem is caught and reported with a clear message rather than an uncaught throw.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSalIsraelConfig } from '../src/basket/salIsraelConfig.js';
import { computeSalIsrael } from '../src/basket/salIsrael.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = path.join(ROOT, 'config', 'sal-israel.json');
const PRODUCTS_FILE = path.join(ROOT, 'data', 'products.json');
const CHAINS_FILE = path.join(ROOT, 'data', 'chains.json');
const CATALOGS_DIR = path.join(ROOT, 'data', 'catalogs');
const OUT_FILE = path.join(ROOT, 'data', 'sal-israel.json');
const HISTORY_FILE = path.join(ROOT, 'data', 'sal-israel-history.jsonl');

function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

function loadCatalogs(dir) {
  const catalogs = {};
  if (!existsSync(dir)) return catalogs;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const chainId = file.replace(/\.json$/, '');
    const c = readJson(path.join(dir, file));
    if (c) catalogs[chainId] = c;
  }
  return catalogs;
}

/** data/sal-israel-history.jsonl -> { [chainId]: [{date, total}, ...] } (one line per chain per day). */
function loadHistory(file) {
  const history = {};
  if (!existsSync(file)) return history;
  const text = readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (!row?.chainId || !row?.date) continue;
    (history[row.chainId] ??= []).push({ date: row.date, total: row.total });
  }
  return history;
}

/** Rewrite the whole jsonl from the computed history (so a same-day rerun replaces, not duplicates). */
function writeHistory(file, history) {
  const lines = [];
  for (const [chainId, entries] of Object.entries(history)) {
    for (const e of entries) lines.push(JSON.stringify({ chainId, date: e.date, total: e.total }));
  }
  writeAtomic(file, lines.length ? lines.join('\n') + '\n' : '');
}

/** tmp file in the same directory + rename, like scripts/lib/pipelineStatus.mjs writePipelineStatus. */
function writeAtomic(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

function todayIsrael() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function runCompute() {
  const config = loadSalIsraelConfig(CONFIG_FILE);
  if (!config.products.length) {
    console.warn('sal-israel: config/sal-israel.json has no products yet - nothing to compute (this is a warning, not a failure)');
    process.exit(2);
  }
  const products = readJson(PRODUCTS_FILE, []);
  const chains = readJson(CHAINS_FILE, []);
  const catalogs = loadCatalogs(CATALOGS_DIR);
  const history = loadHistory(HISTORY_FILE);
  const today = todayIsrael();

  const result = computeSalIsrael({ config, products, catalogs, chains, today, history });
  writeAtomic(OUT_FILE, JSON.stringify(result, null, 2) + '\n');
  writeHistory(HISTORY_FILE, result.history);

  console.log(`sal-israel: wrote ${path.relative(ROOT, OUT_FILE)} - ${result.ranking.length} ranked, ${result.excluded.length} excluded, ${result.products.length} products, date ${result.date}`);
  for (const r of result.ranking) console.log(`  ${r.chainId.padEnd(12)} total=${r.total.toFixed(2).padStart(8)}  found=${r.found}  imputed=${r.imputed}  coverage=${(r.coverage * 100).toFixed(0)}%`);
  for (const e of result.excluded) console.log(`  ${e.chainId.padEnd(12)} EXCLUDED (${e.reason}, coverage=${(e.coverage * 100).toFixed(0)}%)`);
}

function runCheck() {
  const config = loadSalIsraelConfig(CONFIG_FILE);
  if (!config.products.length) {
    console.log('sal-israel --check: config/sal-israel.json has no products yet - nothing to check');
    process.exit(0);
  }
  const products = readJson(PRODUCTS_FILE, []);
  const pGtins = new Set(products.map((p) => p.gtin));
  const catalogs = loadCatalogs(CATALOGS_DIR);
  const catalogIds = Object.keys(catalogs);
  const catalogIndex = new Map(catalogIds.map((id) => [id, new Set((catalogs[id]?.items ?? []).map((i) => i.gtin).filter(Boolean))]));

  // A line is covered when ANY of its printed barcodes (config.gtins, defaulting to [gtin]) is present -
  // docs/SAL-ISRAEL.md: several barcodes on one basket line are size/stage variants of the same product.
  let missingFromProducts = [];
  console.log('gtin (primary)   variants  in-products  chains');
  for (const p of config.products) {
    const variants = p.gtins ?? [p.gtin];
    const inProducts = variants.some((g) => pGtins.has(g));
    if (!inProducts) missingFromProducts.push(p);
    const chainsWithIt = catalogIds.filter((id) => variants.some((g) => catalogIndex.get(id).has(g)));
    console.log(`${p.gtin.padEnd(16)} ${String(variants.length).padEnd(9)} ${(inProducts ? 'yes' : 'NO').padEnd(11)} ${chainsWithIt.length ? chainsWithIt.join(',') : '(none)'}  ${p.name}`);
  }
  console.log(`\n${config.products.length} configured lines, ${missingFromProducts.length} absent (no variant) from data/products.json`);
  if (missingFromProducts.length) {
    console.log('missing from products.json (no variant found):');
    for (const p of missingFromProducts) console.log(`  ${p.gtin}  ${p.name}`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    if (process.argv.includes('--check')) runCheck();
    else runCompute();
  } catch (err) {
    console.error(`sal-israel: ${err.message}`);
    process.exit(process.argv.includes('--check') ? 1 : 2);
  }
}

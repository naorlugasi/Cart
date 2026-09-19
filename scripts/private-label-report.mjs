#!/usr/bin/env node
/**
 * Private-label report over the downloaded online-store catalogs (data/prices/<chain>/catalog.full.json).
 *
 *   node scripts/private-label-report.mjs [chain ...] [--samples 12] [--json out.json]
 *
 * Per chain: how many items each signal marks (prefix / name), how many of those are sold by another chain too
 * (a private label should be exclusive), random samples for a manual check, and candidate barcode prefixes
 * that are exclusive to the chain but not in config/private-label.json yet.
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateLabelSignal, loadPrivateLabelConfig } from '../src/catalog/privateLabel.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRICES = path.join(ROOT, 'data', 'prices');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const SAMPLES = Number(opt('samples', 12));
const GENERIC = new Set(['7290000', '7290001', '7290002', '7290003', '7290004', '7290005', '7290006', '7290007', '7290008', '7290009', '7290010', '7290011', '7290012', '7290013', '7290014', '7290015', '7290016', '7290017', '7290018', '7290019', '7290020', '7290100', '7290101', '7290102', '7290103', '7290104', '7290105', '7290106', '7290107', '7290108', '7290109', '7290110', '7290111', '7290112', '7290113', '7290114', '7290115', '7290116', '7290117', '7290118', '7290119', '7290120', '7290121']);

const cfg = loadPrivateLabelConfig();
const chains = readdirSync(PRICES).filter((c) => existsSync(path.join(PRICES, c, 'catalog.full.json')));
const catalogs = Object.fromEntries(chains.map((c) => [c, JSON.parse(readFileSync(path.join(PRICES, c, 'catalog.full.json'), 'utf8'))]));
const sellers = new Map(); // gtin -> Set(chain family)
const family = (c) => (['ybitan', 'quik'].includes(c) ? 'carrefour' : c === 'yochananof_b' ? 'yochananof' : c);
for (const [c, cat] of Object.entries(catalogs)) for (const i of cat.items) if (i.gtin) (sellers.get(i.gtin) ?? sellers.set(i.gtin, new Set()).get(i.gtin)).add(family(c));

let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (arr, n) => { const a = [...arr]; const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
const targets = args.filter((a) => !a.startsWith('--') && a !== opt('samples') && a !== opt('json'));
const report = [];
for (const c of (targets.length ? targets : chains)) {
  const items = catalogs[c].items;
  const marked = items.map((i) => ({ i, s: privateLabelSignal(i, c, cfg) })).filter((x) => x.s);
  const shared = marked.filter(({ i }) => i.gtin && sellers.get(i.gtin).size > 1);
  const byPrefix = {};
  for (const i of items) {
    if (!i.gtin || i.gtin.length !== 13 || sellers.get(i.gtin).size > 1) continue;
    const p = i.gtin.slice(0, 7);
    if (GENERIC.has(p) || (cfg[c]?.prefixes ?? []).some((x) => p.startsWith(x))) continue;
    (byPrefix[p] ??= []).push(i);
  }
  const candidates = Object.entries(byPrefix).filter(([, a]) => a.length >= 40).sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  const r = { chainId: c, items: items.length, privateLabel: marked.length, byPrefix: marked.filter((x) => x.s === 'prefix').length, byName: marked.filter((x) => x.s === 'name').length, sharedWithOtherChains: shared.length,
    samples: pick(marked, SAMPLES).map(({ i, s }) => `${s[0]} ${i.gtin ?? i.code} ${i.name}`),
    sharedSamples: pick(shared, 5).map(({ i }) => `${i.gtin} ${i.name} (${[...sellers.get(i.gtin)].join(',')})`),
    candidatePrefixes: candidates.map(([p, a]) => ({ prefix: p, items: a.length, samples: pick(a, 3).map((i) => i.name) })) };
  report.push(r);
  console.log(`\n${c}: ${r.items} items, private label ${r.privateLabel} (prefix ${r.byPrefix}, name ${r.byName}); ${r.sharedWithOtherChains} of them also sold elsewhere`);
  for (const s of r.samples) console.log(`   ${s}`);
  if (r.sharedSamples.length) { console.log('   shared with other chains (suspicious):'); for (const s of r.sharedSamples) console.log(`     ${s}`); }
  if (candidates.length) { console.log('   exclusive prefixes not in config (review):'); for (const cnd of r.candidatePrefixes) console.log(`     ${cnd.prefix} ×${cnd.items}: ${cnd.samples.join(' | ')}`); }
}
if (opt('json')) writeFileSync(opt('json'), JSON.stringify(report, null, 2));

#!/usr/bin/env node
/**
 * Substitute audit: what would the comparison offer, and why was everything else refused?
 *
 *   node scripts/substitute-audit.mjs [--every 20] [--chains shufersal,ramilevy,hazihinam] [--legacy] [--concept rice-basmati] [--show 40]
 *
 * Reads the published data (data/products.json, data/catalogs) and, for a sample of products with a
 * concept, runs the substitute finder at each chain twice - as a cheaper offer on an available line and as
 * a replacement for a missing line - and prints every offer with its tier plus the count of refusals by
 * rule. `--legacy` runs the pre-22.9 behaviour (same concept + size only) so before/after can be compared.
 * Manual audit tool, like the category review: read the offers with your eyes (docs/CONCEPTS.md §4).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MappingEngine } from '../src/catalog/mapping.js';
import { evaluateSubstitutes, findSubstitute } from '../src/pricing/substitutes.js';
import { familyOf, conceptPolicy } from '../src/pricing/substituteRules.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i === -1 ? def : argv[i + 1]; };
const every = Number(opt('every', 20));
const legacy = argv.includes('--legacy');
const onlyConcept = opt('concept', null);
const show = Number(opt('show', 40));
const chainIds = (opt('chains', 'shufersal,ramilevy,hazihinam')).split(',').filter(Boolean);

const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
const chains = JSON.parse(readFileSync(path.join(ROOT, 'data', 'chains.json'), 'utf8')).filter((c) => chainIds.includes(c.id));
const catalogs = {};
for (const c of chains) catalogs[c.id] = JSON.parse(readFileSync(path.join(ROOT, 'data', 'catalogs', `${c.id}.json`), 'utf8'));
// strictGtin: a packaged product resolves by barcode or concept only, never by name - the same rule the production
// resolver (cartBackend) applies, so the audit counts the offers the customer actually sees (backend comparison 23.9).
const mapping = new MappingEngine({ products, chains, catalogs, strictGtin: true });

const sample = products.filter((p, i) => p.conceptId && (onlyConcept ? p.conceptId === onlyConcept : i % every === 0));
const refusals = {};
const offers = { cheaper: [], missing: [], family: [] };
const t0 = Date.now();
for (const p of sample) {
  for (const chainId of chainIds) {
    const orig = mapping.resolve(p.id, chainId);
    const available = !!(orig && orig.storeItem.inStock);
    if (available) {
      const ref = orig.storeItem.price;
      for (const e of evaluateSubstitutes({ product: p, qty: 1, chainId, mapping, policy: 'cheapest', purpose: 'cheaper', referencePrice: ref, rules: !legacy })) {
        if (!e.ok) refusals[e.reason] = (refusals[e.reason] ?? 0) + 1;
      }
      const s = findSubstitute({ product: p, qty: 1, chainId, mapping, policy: 'cheapest', purpose: 'cheaper', referencePrice: ref, rules: !legacy });
      if (s && s.lineTotal < ref - 0.005) offers.cheaper.push(`${chainId.padEnd(10)} ${p.name} (${p.category}, ₪${ref}) -> ${s.product.name} ₪${s.unitPrice}${s.privateLabel ? ' [PL]' : ''}`);
    } else {
      const base = { product: p, qty: 1, chainId, mapping, policy: 'cheapest', purpose: 'missing', referencePrice: p.basePrice ?? null, rules: !legacy };
      const s = findSubstitute({ ...base, scope: 'concept' });
      if (s) offers.missing.push(`${chainId.padEnd(10)} ${p.name} (${p.category}) -> ${s.product.name} ₪${s.unitPrice}${s.privateLabel ? ' [PL]' : ''}`);
      else if (!legacy && familyOf(p.conceptId)) {
        const f = findSubstitute({ ...base, scope: 'family' });
        if (f) offers.family.push(`${chainId.padEnd(10)} ${p.name} [${p.conceptId}] -> ${f.product.name} [${f.product.conceptId}] ₪${f.unitPrice}  (${f.family.name})`);
      }
    }
  }
}

const policies = {};
for (const p of sample) { const pol = conceptPolicy(p.conceptId); policies[pol] = (policies[pol] ?? 0) + 1; }
console.log(`${legacy ? 'LEGACY (concept + size only)' : 'RULES 22.9'}  sample=${sample.length} products x ${chainIds.length} chains  ${Date.now() - t0}ms`);
console.log(`offers: cheaper=${offers.cheaper.length} missing=${offers.missing.length} family=${offers.family.length}`);
console.log(`refusals by rule: ${JSON.stringify(refusals)}`);
console.log(`sample by concept policy: ${JSON.stringify(policies)}`);
for (const [k, list] of Object.entries(offers)) {
  console.log(`\n== ${k.toUpperCase()} (${list.length}, showing ${Math.min(show, list.length)})`);
  for (const line of list.slice(0, show)) console.log('  ' + line);
}

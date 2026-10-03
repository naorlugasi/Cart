#!/usr/bin/env node
/**
 * Turns Naor's decisions (downloaded from tools/review/same-product.html as same-product-decisions.json)
 * into the two config files the pipeline actually reads (docs/REVIEW-SAME-PRODUCT.md):
 *
 *   - verdict "same"       -> config/products/aliases.json: one new {alias, canonical, why, since} per
 *                             non-canonical gtin in the cluster (docs/ALIASES.md). Validated with the same
 *                             validateGtinAliases() scripts/build-products.mjs applies at build time, so a
 *                             bad entry is caught here, not on the next pipeline run.
 *   - verdict "different"  -> config/products/not-aliases.json: one {gtins, why, since} per cluster, so
 *                             scripts/same-product-review-export.mjs never rebuilds that cluster again
 *                             (isBlockedPair there reads this exact file).
 *   - verdict "unsure"     -> no file change; counted in the summary only.
 *
 * Reads data/products.json ONLY to look up a gtin's name for the `why` text - never writes under data/, per
 * the project rule that only the refresh pipeline publishes data/ (memory: "only the runner publishes data").
 *
 *   node scripts/same-product-review-import.mjs data/local/same-product-decisions.json
 *   DATA_ROOT=/path/to/data node scripts/same-product-review-import.mjs decisions.json   # tests
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGtinAliases } from './build-products.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DATA_ROOT = '/Users/naorlugassi/Projects/Cart/data'; // see same-product-review-export.mjs doc comment
export const DATA_ROOT = process.env.DATA_ROOT ? path.resolve(process.env.DATA_ROOT) : DEFAULT_DATA_ROOT;
const ALIASES_PATH = path.join(ROOT, 'config', 'products', 'aliases.json');
const NOT_ALIASES_PATH = path.join(ROOT, 'config', 'products', 'not-aliases.json');

const ALIASES_DOC = 'GTIN aliases, reviewed by hand (docs/ALIASES.md): barcodes a human confirmed are the SAME product sold under two codes (old/new packaging), so their prices should merge into one product instead of showing as two ‘missing at this chain’ lines. Never generated automatically - candidates come from scripts/alias-candidates.mjs / tools/review/same-product.html and a human decides. Applied in scripts/build-products.mjs (applyGtinAliases): an alias item’s gtin is rewritten to its canonical; when the same chain sells both codes, the canonical’s own row wins and the alias row is dropped for that chain. Validated on load: alias != canonical, no alias used twice, no chains of aliases (an alias’s canonical is never itself an alias), both values must look like barcodes.';
const NOT_ALIASES_DOC = 'Clusters Naor reviewed in tools/review/same-product.html and called שונה (different products, not a packaging-change pair) - scripts/same-product-review-export.mjs reads this so the same cluster is never rebuilt and shown again. Entries here are never aliases and never applied to any catalog.';

export function readAliasesFile(filePath = ALIASES_PATH) {
  if (!existsSync(filePath)) return { _doc: ALIASES_DOC, aliases: [] };
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  return { _doc: raw._doc ?? ALIASES_DOC, aliases: Array.isArray(raw.aliases) ? raw.aliases : [] };
}

export function readNotAliasesFile(filePath = NOT_ALIASES_PATH) {
  if (!existsSync(filePath)) return [];
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  return Array.isArray(raw) ? raw : [];
}

export function loadProductNames(dataRoot = DATA_ROOT) {
  const file = path.join(dataRoot, 'products.json');
  const byGtin = new Map();
  if (!existsSync(file)) return byGtin;
  for (const p of JSON.parse(readFileSync(file, 'utf8'))) if (p.gtin) byGtin.set(p.gtin, p.name);
  return byGtin;
}

const sameGtinSet = (a, b) => a.length === b.length && [...a].sort().every((g, i) => g === [...b].sort()[i]);

/**
 * Pure merge: decisions + what's already on disk -> the final aliases/not-aliases arrays plus a summary.
 * No file I/O, so test/same-product-review-import.test.js can exercise it directly with fixtures.
 */
export function importDecisions(decisions, { existingAliases = [], existingNotAliases = [], names = new Map(), dateStr = new Date().toISOString().slice(0, 10) } = {}) {
  const aliases = [...existingAliases];
  const notAliases = [...existingNotAliases];
  const nameOf = (gtin) => names.get(gtin) ?? gtin;
  const summary = { total: decisions.length, same: 0, aliasesAdded: 0, aliasesSkipped: 0, different: 0, notAliasesAdded: 0, notAliasesSkipped: 0, unsure: 0, invalid: 0, skipDetails: [] };

  for (const decision of decisions ?? []) {
    const { id, gtins, verdict, canonical } = decision ?? {};
    if (!Array.isArray(gtins) || gtins.length < 2 || !verdict) {
      summary.invalid++;
      summary.skipDetails.push(`${id ?? '?'}: פסילה - צורת החלטה לא תקינה`);
      continue;
    }

    if (verdict === 'unsure') { summary.unsure++; continue; }

    if (verdict === 'same') {
      summary.same++;
      if (!canonical || !gtins.includes(canonical)) {
        summary.aliasesSkipped++;
        summary.skipDetails.push(`${id}: דולג - אין קנוני תקין בין הברקודים`);
        continue;
      }
      for (const gtin of gtins) {
        if (gtin === canonical) continue;
        if (aliases.some((a) => a.alias === gtin)) {
          summary.aliasesSkipped++;
          summary.skipDetails.push(`${id}: ${gtin} - דולג, כבר קיים כינוי`);
          continue;
        }
        const candidate = { alias: gtin, canonical, why: `נאור, ${dateStr}: אותו מוצר - ${nameOf(gtin)} / ${nameOf(canonical)}`, since: dateStr };
        try {
          validateGtinAliases([...aliases, candidate]);
        } catch (err) {
          summary.aliasesSkipped++;
          summary.skipDetails.push(`${id}: ${gtin} -> ${canonical} - דולג, לא עבר ולידציה (${err.message})`);
          continue;
        }
        aliases.push(candidate);
        summary.aliasesAdded++;
      }
      continue;
    }

    if (verdict === 'different') {
      summary.different++;
      const sorted = [...gtins].sort();
      if (notAliases.some((e) => Array.isArray(e.gtins) && sameGtinSet(e.gtins, sorted))) {
        summary.notAliasesSkipped++;
        summary.skipDetails.push(`${id}: דולג - צרור שונה כבר רשום`);
        continue;
      }
      notAliases.push({ gtins: sorted, why: `נאור, ${dateStr}: שונה - ${gtins.map(nameOf).join(' / ')}`, since: dateStr });
      summary.notAliasesAdded++;
      continue;
    }

    summary.invalid++;
    summary.skipDetails.push(`${id}: דולג - verdict לא מוכר "${verdict}"`);
  }

  return { aliases, notAliases, summary };
}

function run() {
  const decisionsFile = process.argv[2];
  if (!decisionsFile) {
    console.error('usage: node scripts/same-product-review-import.mjs <decisions.json>');
    process.exit(1);
  }
  const decisionsPath = path.resolve(decisionsFile);
  if (!existsSync(decisionsPath)) {
    console.error(`missing ${decisionsPath}`);
    process.exit(1);
  }
  const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'));

  const aliasesFile = readAliasesFile();
  const notAliases = readNotAliasesFile();
  const names = loadProductNames();

  const { aliases, notAliases: newNotAliases, summary } = importDecisions(decisions, {
    existingAliases: aliasesFile.aliases,
    existingNotAliases: notAliases,
    names,
  });

  if (summary.aliasesAdded > 0) {
    writeFileSync(ALIASES_PATH, JSON.stringify({ _doc: aliasesFile._doc, aliases }, null, 2) + '\n');
  }
  if (summary.notAliasesAdded > 0) {
    writeFileSync(NOT_ALIASES_PATH, JSON.stringify(newNotAliases, null, 2) + '\n');
  }

  console.log(`same-product-review-import: ${summary.total} החלטות`);
  console.log(`  אותו מוצר: ${summary.same} (${summary.aliasesAdded} כינויים נוספו ל-config/products/aliases.json, ${summary.aliasesSkipped} דולגו)`);
  console.log(`  שונה: ${summary.different} (${summary.notAliasesAdded} נוספו ל-config/products/not-aliases.json, ${summary.notAliasesSkipped} דולגו)`);
  console.log(`  לא בטוח: ${summary.unsure} (לא טופל)`);
  if (summary.invalid) console.log(`  פסולות: ${summary.invalid}`);
  if (summary.skipDetails.length) {
    console.log('פירוט דילוגים:');
    for (const line of summary.skipDetails) console.log(`  ${line}`);
  }
  if (summary.aliasesAdded === 0 && summary.notAliasesAdded === 0) {
    console.log('(שום קובץ לא השתנה)');
  } else {
    console.log('זכרו: שום דבר מזה לא מתמזג עד שה-commit הזה נכנס (docs/REVIEW-SAME-PRODUCT.md).');
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) run();

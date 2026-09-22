/**
 * Loader for config/sal-israel.json ("הסל של ישראל" - docs/SAL-ISRAEL.md): the ministry of economy's
 * 100-product basket that Carrefour committed to sell at a fixed price, which we price against every
 * chain's online catalog (src/basket/salIsrael.js does the computation; this module only loads and
 * validates the static product list).
 *
 * Pattern: src/catalog/privateLabel.js (readFileSync + JSON.parse, module-level cache, `_`-prefixed
 * keys ignored). An empty `products` list is valid on purpose - scripts/sal-israel.mjs runs as part of
 * the daily publish (scripts/daily-refresh.sh) before the basket list is necessarily filled in, and
 * must not throw.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'sal-israel.json');

/** The 10 departments used throughout data/products.json (docs/CATEGORIES.md). */
export const CATEGORIES = [
  'בשר ועוף',
  'חטיפים וממתקים',
  'חלב וביצים',
  'ירקות ופירות',
  'כללי',
  'מאפים ולחם',
  'מעדנייה',
  'משקאות',
  'ניקיון וטואלטיקה',
  'שימורים',
];
const CATEGORY_SET = new Set(CATEGORIES);

/** unit convention shared with data/products.json: weighted items are ק"ג, everything else is יח'. */
function expectedUnit(isWeighted) {
  return isWeighted ? 'ק"ג' : "יח'";
}

function validate(config, file) {
  if (!config || typeof config !== 'object') throw new Error(`sal-israel config ${file}: not an object`);
  if (!Array.isArray(config.products)) throw new Error(`sal-israel config ${file}: "products" must be an array`);

  const seenGtins = new Set();
  for (const [i, p] of config.products.entries()) {
    const where = `${file} products[${i}] (${p?.gtin ?? p?.name ?? '?'})`;
    if (!p || typeof p !== 'object') throw new Error(`${where}: not an object`);
    if (!p.gtin || typeof p.gtin !== 'string') throw new Error(`${where}: missing gtin`);
    if (seenGtins.has(p.gtin)) throw new Error(`${where}: duplicate gtin ${p.gtin}`);
    seenGtins.add(p.gtin);
    if (!(typeof p.qty === 'number' && p.qty > 0)) throw new Error(`${where}: qty must be > 0`);
    if (!CATEGORY_SET.has(p.category)) throw new Error(`${where}: category "${p.category}" is not one of the 10 departments`);
    const wantUnit = expectedUnit(!!p.isWeighted);
    if (p.unit !== wantUnit) throw new Error(`${where}: unit "${p.unit}" does not match isWeighted (expected "${wantUnit}")`);
  }
  return config;
}

export function loadSalIsraelConfig(file = DEFAULT_CONFIG) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return validate(raw, file);
}

let cached = null;
export function salIsraelConfig(file = DEFAULT_CONFIG) {
  return (cached ??= loadSalIsraelConfig(file));
}

/** For tests: clear the module-level cache between fixtures. */
export function _resetCache() {
  cached = null;
}

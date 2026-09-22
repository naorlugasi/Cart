/**
 * Per-product category labels (docs/CATEGORIES.md).
 *
 * The keyword rules in categorize.js can only ever be a good guess: a Hebrew product name is a bag of
 * brand, flavour, size and packaging words with no grammar, and half the chains truncate it mid-word.
 * So every product in data/products.json was reviewed one by one and its department written down here.
 * The rules stay as the fallback for a product that appears after the review (a new GTIN in tomorrow's
 * price files) - and any disagreement between the two is a bug in the rules, checked on every build.
 *
 * File shape: { version, generatedAt, labels: { "<product id>": ["<category>", "<name when reviewed>"] } }
 * The name is stored for auditing only: if a chain renames a barcode into a different product, the
 * mismatch is visible (scripts/category-report.mjs --drift) instead of silently keeping a stale label.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LABELS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'categories', 'labels.json');

export function loadCategoryLabels(file = LABELS_FILE) {
  if (!existsSync(file)) return new Map();
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const map = new Map();
  for (const [id, entry] of Object.entries(raw.labels ?? {})) {
    const [category, name] = Array.isArray(entry) ? entry : [entry, null];
    if (!category) throw new Error(`labels.json: ${id} has no category`);
    map.set(id, { category, name: name ?? null });
  }
  return map;
}

let cached = null;
export function categoryLabels() { return (cached ??= loadCategoryLabels()); }
export function resetCategoryLabels() { cached = null; namesCached = null; }
/** The reviewed category for a product id, or null when it was never reviewed. */
export function categoryLabel(id) { return id ? categoryLabels().get(id)?.category ?? null : null; }

/**
 * Manual display names (decision 22.9). The unified name is the most common one across chains, and
 * that is the wrong answer when six chains copy the supplier's series name and two say what is in the
 * pack: "מובחרים מן הטבע 700" is a 700 g legume mix. A name written here wins over the common name;
 * the build keeps the common name as an alias so search still finds it. Deliberately tiny and by id:
 * every entry is one product a person looked at, never a rule.
 *
 * File shape: { version, note, names: { "<product id>": "<display name>" } }
 */
export const NAMES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'categories', 'names.json');

export function loadDisplayNames(file = NAMES_FILE) {
  if (!existsSync(file)) return new Map();
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const map = new Map();
  for (const [id, name] of Object.entries(raw.names ?? {})) {
    if (typeof name !== 'string' || !name.trim()) throw new Error(`names.json: ${id} has no display name`);
    map.set(id, name.trim());
  }
  return map;
}

let namesCached = null;
export function displayNames() { return (namesCached ??= loadDisplayNames()); }
/** The manual display name for a product id, or null when none was set. */
export function displayName(id) { return id ? displayNames().get(id) ?? null : null; }

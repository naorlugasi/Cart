/**
 * Verified product records - config/products/verified.json (docs/PLAN-PRODUCT-TRUTH.md §2, 23.9.2026).
 *
 * One record per barcode that a person, a review pass or three agreeing storefronts confirmed. The build
 * prefers a record over every heuristic: a verified name beats the common name, a verified department
 * beats the reviewed label, a verified concept (an explicit `null` means "no concept, do not guess") beats
 * the concept regexes, a verified size beats the size parser. Fields are optional except the audit trail:
 * a record may verify only the concept and leave the rest to the usual sources.
 *
 * {
 *   "version": 1,
 *   "records": {
 *     "g7290010002436": { "name": "...", "brand": "...", "category": "שימורים", "conceptId": null,
 *                         "size": { "value": 25, "unit": "g", "count": 1 },
 *                         "verifiedBy": "naor" | "review" | "chains", "verifiedAt": "2026-09-23",
 *                         "evidence": ["shufersal: פארם וטיפוח", ...] }
 *   }
 * }
 *
 * Same loading pattern as config/categories/labels.json: read once, cached, `resetVerified()` for tests.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERIFIED_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'products', 'verified.json');
export const VERIFIERS = new Set(['naor', 'review', 'chains']);

let cache = null;

export function loadVerified(file = VERIFIED_FILE) {
  if (!existsSync(file)) return new Map();
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const out = new Map();
  for (const [id, rec] of Object.entries(raw.records ?? {})) {
    if (!rec || typeof rec !== 'object') continue;
    if (!VERIFIERS.has(rec.verifiedBy)) throw new Error(`verified.json ${id}: verifiedBy must be one of ${[...VERIFIERS].join('/')}`);
    if (rec.size != null && !(Number.isFinite(rec.size.value) && rec.size.value > 0 && rec.size.unit)) throw new Error(`verified.json ${id}: size must be {value>0, unit, count}`);
    out.set(id, rec);
  }
  return out;
}

export function verified() { return (cache ??= loadVerified()); }
export function verifiedRecord(id) { return verified().get(id) ?? null; }
export function resetVerified(map = null) { cache = map; }

/**
 * Apply a record on top of the heuristic values. `has(key)` semantics: a key present in the record wins even
 * when its value is null (that is how "conceptId: null" says "no concept"); a key absent keeps the heuristic.
 */
export function applyVerified(rec, heuristic) {
  if (!rec) return { ...heuristic, verified: false };
  const out = { ...heuristic, verified: true };
  for (const key of ['name', 'brand', 'category', 'conceptId', 'size']) if (Object.prototype.hasOwnProperty.call(rec, key)) out[key] = rec[key];
  return out;
}

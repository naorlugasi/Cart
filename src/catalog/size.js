/**
 * Size ("גודל"): parses the package size out of a Hebrew supermarket product name
 * (docs/CONCEPTS.md §2). `value` is always per single unit, normalized to grams or
 * millilitres; `count` is the pack size (default 1). Fat/alcohol percentages are
 * never a size. Returns null when the name has no discernible size (e.g. weighted
 * produce/meat sold loose).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Scraped catalog data is inconsistent about how it types a Hebrew abbreviation mark:
// a real gershayim/geresh (״ ׳), a plain ASCII quote, curly quotes, or two single quotes
// typed in a row. One class covers every spot ("ק"ג", "ק״ג", "מ''ל", "מ'ל", "ל'", "יח'"...).
const QUOTE = '(?:\'\'|"|״|”|“|\'|׳)';

// Longest-first per unit family so the alternation doesn't stop at a shorter prefix
// (e.g. "גר" before "גרם" would greedily eat "גר" out of "גרם" and then fail the
// no-trailing-letter lookahead - listing "גרם" first avoids that entirely).
// "לי" covers names hard-truncated mid-word ("1.5 לי" for "1.5 ליטר") - very common upstream.
const UNIT_ALT = String.raw`קילו|ק${QUOTE}ג|קג|kg|גרם|גר|ג${QUOTE}|ג|g|ליטר|לי|ל${QUOTE}|ל|L|מ${QUOTE}ל|מל|ml`;
// Plural "count nouns" that stand in for a bare pack size: "60 טבליות", "20 שקיות", "9 גלילים".
// "יחיד" and "שק" are the chains' cuts of יחידות and שקיקים ("תה ירוק נענע 50 יחיד", "25 שק*1.5גר", 1.10).
const UNIT_COUNT_ALT = String.raw`יחידות|יחיד|יח${QUOTE}|יח|שקיות|שקיקים|שקיק|שק|גלילים|טבליות|קפסולות|כמוסות|מגבונים|מנות`;

const KG_RE = new RegExp(`^(?:קילו|ק${QUOTE}ג|קג|kg)$`, 'i');
const GRAM_RE = new RegExp(`^(?:גרם|גר|ג${QUOTE}|ג|g)$`, 'i');
const LITER_RE = new RegExp(`^(?:ליטר|לי|ל${QUOTE}|ל|L)$`);
const ML_RE = new RegExp(`^(?:מ${QUOTE}ל|מל|ml)$`, 'i');

/** number, optionally a "150-200" range (only the first number is kept), then a size unit. The range's second
 * number is captured (group 2) because a dash is not always a range: "פולי אספרסו עוצמה 10- 450 גרם" is strength
 * 10 and 450 grams, and reading it as the range 10-450 made the product 10 g (28.9). See rangeValue. */
const SIZE_TOKEN_RE = new RegExp(String.raw`(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?\s*(${UNIT_ALT})(?![\p{L}])`, 'giu');
/** A real range spans a small ratio ("150-200 גרם", a baby's "5-9 ק"ג"); a second number more than three times the
 * first is the size itself, and the first belongs to something else on the label. */
const rangeValue = (m) => (m[2] && toNum(m[2]) > 3 * toNum(m[1]) ? toNum(m[2]) : toNum(m[1]));

/** "330 מ"ל x6" / "500 גרם *4" - unit sits right after the first (per-unit) number. */
const MULT_MID_RE = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*(${UNIT_ALT})(?![\p{L}])\s*[*x×X]\s*(\d+)`, 'gu');

/** "6*330 מ"ל" / "108x4 גר" - unit sits after both numbers; magnitude decides which is the count. */
const MULT_END_RE = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*[*x×X]\s*(\d+(?:[.,]\d+)?)\s*(${UNIT_ALT})(?![\p{L}])`, 'gu');

/** Bare unit count: "12 יח'", "40 יחידות" (also matches inside "מארז 4 יח"). */
const UNIT_COUNT_RE = new RegExp(String.raw`(?<!\d)(?<!\d[.,])(\d+)\s*(${UNIT_COUNT_ALT})(?![\p{L}])`, 'gu');

/** "25 שקיקים * 1.5 גרם" / "25 שק*1.5גר" / "25 שקיקים 1.5 גרם": a count of bags, then what ONE bag weighs. Read
 * this way only with an explicit "*", or when the weight is too small to be the whole box (3 g or less for ten
 * or more bags) - "20 שקיות 34 גר" is the box. Before 1.10 the bag weight was read as the product: a 25-bag box of
 * tea weighed 1.5 g. */
const COUNT_THEN_EACH_RE = new RegExp(String.raw`(?<!\d)(?<!\d[.,])(\d+)\s*(?:${UNIT_COUNT_ALT})(?![\p{L}])\s*([*x×X])?\s*(\d+(?:[.,]\d+)?)\s*(${UNIT_ALT})(?![\p{L}])`, 'gu');

/** Hebrew "N-pack" nouns. Construct-state forms ("שישיית") are included alongside the plain ones. */
const PACK_WORDS = {
  'זוג': 2,
  'שלישיה': 3, 'שלישייה': 3, 'שלישיית': 3,
  'רביעיה': 4, 'רביעייה': 4, 'רביעיית': 4,
  'חמישיה': 5, 'חמישייה': 5, 'חמישיית': 5,
  'שישיה': 6, 'שישייה': 6, 'שישיית': 6,
  'שביעיה': 7, 'שביעייה': 7, 'שביעיית': 7,
  'שמיניה': 8, 'שמינייה': 8, 'שמינייתה': 8,
  'תשיעיה': 9, 'תשיעייה': 9,
  'עשיריה': 10, 'עשירייה': 10, 'עשיריית': 10,
  // The chains' ~20-character cut lands inside the pack word often enough to matter: "מגבוני האגיס אקסטרה קר
  // ללא בישום רביעיי" (Naor's search, 3.10) read as 56 units off its "56 יח'" instead of a 4-pack.
  'שלישיי': 3, 'רביעיי': 4, 'חמישיי': 5, 'שישיי': 6, 'שמיניי': 8, 'עשיריי': 10,
};
const PACK_WORD_RE = new RegExp(
  String.raw`(?<![\p{L}])(${Object.keys(PACK_WORDS).sort((a, b) => b.length - a.length).join('|')})(?![\p{L}])`,
  'u',
);

/** Baby diapers print the *baby's* weight ("5-7 קילו שלב 2", "עד 6 קילו", "5-9 ק"ג") right next
 * to the real pack size ("42 יחידות") - a kg/g figure there is never the product's own size. */
const DIAPER_RE = /חיתול/;

function toNum(token) {
  return parseFloat(String(token).replace(',', '.'));
}

function isIntToken(token) {
  return !/[.,]/.test(String(token));
}

/** g/1000 or ml/1000 factor for a matched unit token, or null if it isn't a recognized size unit. */
function classifyUnit(token) {
  if (KG_RE.test(token)) return { unit: 'g', factor: 1000 };
  if (GRAM_RE.test(token)) return { unit: 'g', factor: 1 };
  if (LITER_RE.test(token)) return { unit: 'ml', factor: 1000 };
  if (ML_RE.test(token)) return { unit: 'ml', factor: 1 };
  return null;
}

/**
 * `parseSize(name) -> { value, unit, count } | null`
 * `unit` is 'g' | 'ml' | 'unit'. `value` is per single unit (already ×1000 for kg/liter).
 * `count` is the pack size, 1 by default.
 */
export function parseSize(name) {
  const text = String(name ?? '');
  if (!text.trim()) return null;

  const isDiaper = DIAPER_RE.test(text);
  const diaperGuarded = (cls) => isDiaper && cls.unit === 'g' && cls.factor === 1000;

  // 1. "330 מ"ל x6" style: the unit is unambiguous (bound to the first number).
  MULT_MID_RE.lastIndex = 0;
  for (let m; (m = MULT_MID_RE.exec(text)); ) {
    const cls = classifyUnit(m[2]);
    if (!cls || diaperGuarded(cls)) continue;
    const count = Math.max(1, Math.round(toNum(m[3])));
    return { value: toNum(m[1]) * cls.factor, unit: cls.unit, count };
  }

  // 2. "6*330 מ"ל" / "108x4 גר": unit trails both numbers - the smaller one is the count
  // (a count can't be fractional, so a decimal number is always the value).
  MULT_END_RE.lastIndex = 0;
  for (let m; (m = MULT_END_RE.exec(text)); ) {
    const cls = classifyUnit(m[3]);
    if (!cls || diaperGuarded(cls)) continue;
    const [raw1, raw2] = [m[1], m[2]];
    const [n1, n2] = [toNum(raw1), toNum(raw2)];
    const [int1, int2] = [isIntToken(raw1), isIntToken(raw2)];
    let count, value;
    if (int1 && !int2) [count, value] = [n1, n2];
    else if (!int1 && int2) [count, value] = [n2, n1];
    else [count, value] = n1 <= n2 ? [n1, n2] : [n2, n1];
    return { value: value * cls.factor, unit: cls.unit, count: Math.max(1, Math.round(count)) };
  }

  // 2b. "25 שקיקים * 1.5 גרם": a bag count, then the weight of one bag (COUNT_THEN_EACH_RE).
  COUNT_THEN_EACH_RE.lastIndex = 0;
  for (let m; (m = COUNT_THEN_EACH_RE.exec(text)); ) {
    const cls = classifyUnit(m[4]);
    if (!cls || diaperGuarded(cls)) continue;
    const count = Math.round(toNum(m[1]));
    const each = toNum(m[3]) * cls.factor;
    if (count > 1 && (m[2] || (cls.unit === 'g' && each <= 3 && count >= 10))) return { value: each, unit: cls.unit, count };
  }

  // 3. Word-form pack ("שישיית 330 מ"ל", "330 מ"ל שישייה", "זוג" on its own).
  const packMatch = PACK_WORD_RE.exec(text);
  if (packMatch) {
    const count = PACK_WORDS[packMatch[1]];
    SIZE_TOKEN_RE.lastIndex = 0;
    for (let m; (m = SIZE_TOKEN_RE.exec(text)); ) {
      const cls = classifyUnit(m[3]);
      if (!cls || diaperGuarded(cls)) continue;
      return { value: rangeValue(m) * cls.factor, unit: cls.unit, count };
    }
    return { value: 1, unit: 'unit', count };
  }

  // 4. A single plain size ("500 גרם", "1.5 ליטר", "150-200 גרם" -> first number).
  SIZE_TOKEN_RE.lastIndex = 0;
  for (let m; (m = SIZE_TOKEN_RE.exec(text)); ) {
    const cls = classifyUnit(m[3]);
    if (!cls || diaperGuarded(cls)) continue;
    return { value: rangeValue(m) * cls.factor, unit: cls.unit, count: 1 };
  }

  // 5. A bare unit count with no weight/volume ("12 יח'", "מארז 4 יח", "42 יחידות").
  UNIT_COUNT_RE.lastIndex = 0;
  const um = UNIT_COUNT_RE.exec(text);
  if (um) return { value: 1, unit: 'unit', count: Math.max(1, Math.round(toNum(um[1]))) };

  return null;
}

/** Same unit required; compares total quantity (value×count) within ±pct. Either null -> false. */
export function sizeWithinTolerance(a, b, pct = 0.25) {
  if (!a || !b) return false;
  if (a.unit !== b.unit) return false;
  const totalA = a.value * a.count;
  const totalB = b.value * b.count;
  if (totalA === totalB) return true;
  const denom = Math.max(totalA, totalB);
  if (denom === 0) return false;
  return Math.abs(totalA - totalB) / denom <= pct;
}

function formatNum(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Hebrew display string: "1 ליטר", "500 גרם", "6 × 330 מ"ל", "1.5 ק"ג", "12 יח'". */
export function describeSize(size) {
  if (!size) return '';
  const { value, unit, count } = size;
  let num;
  let label;
  if (unit === 'unit') {
    return `${Math.round(count)} יח'`;
  } else if (unit === 'g') {
    if (value >= 1000) { num = value / 1000; label = 'ק"ג'; }
    else { num = value; label = 'גרם'; }
  } else if (unit === 'ml') {
    if (value >= 1000) { num = value / 1000; label = 'ליטר'; }
    else { num = value; label = 'מ"ל'; }
  } else {
    return '';
  }
  const text = `${formatNum(num)} ${label}`;
  return count > 1 ? `${count} × ${text}` : text;
}

/**
 * Package size from the chains' own price-file fields (Quantity/UnitOfMeasure/UnitQty, from
 * priceXml.js's normalizePriceItem), for the products whose name carries no size at all (half
 * the chains truncate names to ~20 characters). config/size-units.json (loaded below) is built
 * from data/local/size-unit-table.json + data/local/size-from-chain-fields-report.md
 * (10.10.2026): per chain, which UnitOfMeasure strings reliably mean what, validated against
 * parseSize(name) ground truth - NOT the UnitOfMeasurePrice field, which turned out not to need
 * checking (ramilevy's Quantity matches real package weights even though its
 * UnitOfMeasurePrice is simply ItemPrice/100 on every row, unrelated to Quantity).
 *
 * `sizeFromChainFields` handles ONE chain's ONE item; `resolveChainFieldSize` combines several
 * chains' candidates (scripts/build-products.mjs's pickSize-area fallback supplies one per chain
 * FAMILY, already deduped the way familyVotes dedupes names) into a single reliability-weighted
 * answer, or null when they disagree too evenly to trust.
 *
 * Both are called only when (a) no chain NAME yields a size (parseSize) and (b) the product's
 * FINAL isWeighted (the majority across chains, not any one chain's own flag) is false - a
 * weighed product never gets a size from these fields, an owner hard rule (10.10.2026): some
 * chains sell the very same barcode both loose-weighed and pre-packed per unit, and "isWeighted"
 * is the only source of truth for the price unit. The per-ITEM weighed flag is a second, narrower
 * guard inside `sizeFromChainFields` itself (a chain's own weighed row carries no package size
 * at all - every chain sets Quantity=1 and a fixed per-kg UnitOfMeasure on those rows regardless
 * of the real item, and a couple of chains (mck, shukcity) leak real-looking non-1 Quantities
 * into 5-33% of their weighed rows anyway) - callers must still never pass a weighed item's
 * fields in at all (scripts/build-products.mjs's groupItemsByGtin skips them at the source), the
 * `isWeighted` parameter here is a second, defensive gate, not the only one.
 */

/** Normalize a chain's `UnitOfMeasure`/`UnitQty` string before a config/size-units.json lookup:
 * strip bidi marks (mck embeds U+200E before "קילוגרם"), trim, and collapse internal whitespace
 * to one space. No Hebrew final-letter folding: every bucket string here already ends correctly
 * with its proper final letter (גרם, קילוגרם...) - folding it away would corrupt the very words
 * it is supposed to match, not normalize a real chain inconsistency. */
export function normalizeUnitOfMeasure(raw) {
  return String(raw ?? '')
    .replace(/[‎‏‪-‮]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

const normalizeBucketKey = (key) => (key.startsWith('UQ:') ? `UQ:${normalizeUnitOfMeasure(key.slice(3))}` : normalizeUnitOfMeasure(key));

const DEFAULT_SIZE_UNITS_CONFIG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'size-units.json');

/**
 * Loads config/size-units.json into `{ chains: Map<chainId, Map<bucketKey, entry>>, fallback:
 * Map<bucketKey, entry>, chainReliability: { [chainId]: number }, excludedChains: Set<chainId> }`.
 * `_`-prefixed keys (documentation) are skipped; every bucket key is run through
 * normalizeBucketKey so lookups never have to re-normalize the config itself.
 */
export function loadSizeUnitsConfig(file = DEFAULT_SIZE_UNITS_CONFIG) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const normalizeBucket = (entries) => {
    const out = new Map();
    for (const [key, val] of Object.entries(entries ?? {})) {
      if (key.startsWith('_')) continue;
      out.set(normalizeBucketKey(key), val);
    }
    return out;
  };
  const chains = new Map();
  for (const [chainId, entries] of Object.entries(raw.chains ?? {})) {
    if (chainId.startsWith('_')) continue;
    chains.set(chainId, normalizeBucket(entries));
  }
  return {
    chains,
    fallback: normalizeBucket(raw.fallback),
    chainReliability: { ...(raw.chainReliability ?? {}) },
    excludedChains: new Set(raw.excludedChains ?? []),
  };
}

let cachedSizeUnitsConfig = null;
/** Cached default config/size-units.json, loaded once. `resetSizeUnitsConfig` (tests only) clears it. */
export function sizeUnitsConfig() { return (cachedSizeUnitsConfig ??= loadSizeUnitsConfig()); }
export function resetSizeUnitsConfig(cfg = null) { cachedSizeUnitsConfig = cfg; }

/**
 * `chainId`'s own bucket table, or the universal `fallback` table when `chainId` has no table of
 * its own (a chain not yet measured) - never a merge of the two, so a chain's deliberate omission
 * of a basis (the "יחידות" unit-count basis is trustworthy on only 3 of 14 chains; the rest simply
 * have no such bucket) is never silently restored by the fallback. `null` for a chain on
 * `excludedChains` (today: victory - its UnitOfMeasure text is corrupted on disk, literal '?'
 * bytes baked into the stored file).
 */
export function sizeUnitsTableForChain(chainId, config = sizeUnitsConfig()) {
  if (config.excludedChains.has(chainId)) return null;
  return config.chains.get(chainId) ?? config.fallback ?? null;
}

/**
 * Package size from one chain's raw price-file fields for one item. `table` is that chain's own
 * bucket map (sizeUnitsTableForChain) - a flat object also works for ad-hoc tests. `unitPrice`/
 * `price` are accepted for signature stability but unused: the per-bucket trust already lives in
 * config/size-units.json's `chainReliability`, validated offline against parseSize(name) ground
 * truth, not against UnitOfMeasurePrice (see the file doc above for why that field isn't it).
 *
 * Returns null for a weighed item, a non-positive/missing quantity, a missing table, or a bucket
 * the table doesn't define. Tries `UQ:<unitQty>` only when the `unitOfMeasure` lookup itself comes
 * up empty (hazihinam: UnitOfMeasure is blank on every row, but UnitQty still carries the family word).
 */
export function sizeFromChainFields({ quantity, unitOfMeasure, unitQty, unitPrice, price, isWeighted = false } = {}, table) {
  if (isWeighted) return null;
  if (!(Number(quantity) > 0)) return null;
  if (!table) return null;
  const get = (table instanceof Map) ? (k) => table.get(k) : (k) => table?.[k];
  const uomKey = normalizeUnitOfMeasure(unitOfMeasure);
  let entry = uomKey ? get(uomKey) : undefined;
  if (!entry && unitQty) entry = get(`UQ:${normalizeUnitOfMeasure(unitQty)}`);
  if (!entry) return null;
  const scale = entry.scale ?? 1;
  if (entry.quantityIs === 'count') {
    return { value: 1, unit: entry.unit ?? 'unit', count: Math.max(1, Math.round(quantity * scale)) };
  }
  const value = quantity * scale;
  if (!(value > 0)) return null;
  // No grocery package is over 20 kg / 20 L: a chain that writes Quantity 1320 on a "ליטר" basis (a 4x330 ml
  // beer pack, read as 1,320 L) is a data slip, and null is right - a size the customer would laugh at never
  // enters the catalog (local build 10.10: one product in 8,827).
  if (value > 20000) return null;
  return { value, unit: entry.unit, count: 1 };
}

/**
 * Reliability-weighted majority over several chains' `sizeFromChainFields` candidates.
 * `candidates`: `[{ size: {value, unit, count} | null, weight: number }]` - one entry per chain
 * FAMILY (the caller dedupes siblings before calling this, same as familyVotes dedupes names),
 * `weight` = that chain's config/size-units.json `chainReliability`.
 *
 * Candidates are grouped by unit and by total amount (value×count) within 5% of each other; the
 * group with the highest summed weight wins and its highest-weight member is returned. When the
 * runner-up group's weight is within 0.15 of the winner's AND the two groups' totals differ by
 * more than 5%, the result is null - too evenly contested to trust, rather than guessed (the
 * product is left for review, never blocking the build).
 */
export function resolveChainFieldSize(candidates) {
  const usable = (candidates ?? []).filter((c) => c?.size && c.weight > 0);
  if (!usable.length) return null;
  const groups = [];
  for (const { size, weight } of usable) {
    const total = size.value * (size.count || 1);
    const group = groups.find((g) => g.unit === size.unit && Math.abs(total - g.total) / Math.max(total, g.total) <= 0.05);
    if (group) {
      group.weight += weight;
      if (weight > group.bestWeight) { group.bestWeight = weight; group.bestSize = size; }
    } else {
      groups.push({ unit: size.unit, total, weight, bestWeight: weight, bestSize: size });
    }
  }
  groups.sort((a, b) => b.weight - a.weight);
  const [winner, runnerUp] = groups;
  if (runnerUp && Math.abs(winner.weight - runnerUp.weight) <= 0.15) {
    const diff = Math.abs(winner.total - runnerUp.total) / Math.max(winner.total, runnerUp.total);
    if (diff > 0.05) return null;
  }
  return winner.bestSize;
}

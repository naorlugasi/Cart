#!/usr/bin/env node
/**
 * Manual review tool (docs/ALIASES.md) - finds CANDIDATE GTIN aliases for a human to check, never applies
 * anything. A candidate is a pair of non-weighed, barcoded products whose names agree once normalized and
 * whose parsed size is identical, but whose gtin differs - the same shape as the real Coca-Cola Zero
 * 1.5L case (7290110115227 / 7290110115869) that config/products/aliases.json now folds together.
 *
 *   node scripts/alias-candidates.mjs
 *   DATA_ROOT=/path/to/data node scripts/alias-candidates.mjs   # read a different data/ (read-only)
 *
 * Reads data/products.json and data/catalogs/<chain>.json (read-only). Writes every pair found to
 * data/local/alias-candidates.json (gitignored - working output, never published) and prints:
 *   - every STRONG pair: the two gtins share their first 9 digits (the GS1 company prefix), so they were
 *     issued by the same manufacturer - almost certainly a packaging change, the easy case to review.
 *   - the top 30 WEAK pairs by chain count: different prefix, so it could be a different manufacturer's
 *     identical-looking product - needs a closer human look before it goes in aliases.json.
 * Confirming a pair is always a human decision; add it to config/products/aliases.json's `aliases` array
 * yourself, with a `why` that names the evidence (which chains, what price agreement).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText } from '../src/catalog/matching.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = process.env.DATA_ROOT ? path.resolve(process.env.DATA_ROOT) : path.join(ROOT, 'data');

function loadProducts() {
  return JSON.parse(readFileSync(path.join(DATA_ROOT, 'products.json'), 'utf8'));
}

/** gtin -> Map(chainId -> cheapest price), read from the published per-chain catalogs so a candidate pair
 *  can report which chains actually carry each code and at what price - products.json itself only carries
 *  a chain COUNT, not which chains or what each one charges. */
function loadPricesByGtin() {
  const dir = path.join(DATA_ROOT, 'catalogs');
  const byGtin = new Map();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'demo.json') continue;
    const chainId = file.replace(/\.json$/, '');
    let catalog;
    try { catalog = JSON.parse(readFileSync(path.join(dir, file), 'utf8')); } catch { continue; }
    for (const item of catalog.items ?? []) {
      if (!item.gtin || !Number.isFinite(item.price)) continue;
      const m = byGtin.get(item.gtin) ?? new Map();
      if (!m.has(chainId) || item.price < m.get(chainId)) m.set(chainId, item.price);
      byGtin.set(item.gtin, m);
    }
  }
  return byGtin;
}

/** Hebrew unit spellings unified onto one token: ל/ליטר(ים), ג/גר/גרם(ים), מל/מ"ל/מיליליטר(ים). Applied
 *  per-token (not by regex over the joined string) because Hebrew letters are not `\w`, so a `\b`-anchored
 *  regex would not see a boundary between a space and a Hebrew letter at all. */
const UNIT_TOKEN = {
  'ל': 'ל', 'ליטר': 'ל', 'ליטרים': 'ל',
  'ג': 'ג', 'גר': 'ג', 'גרם': 'ג', 'גרמים': 'ג',
  'מל': 'מל', 'מיליליטר': 'מל', 'מיליליטרים': 'מל',
};
/** src/catalog/matching.js normalizeText, then unify units and strip whatever punctuation/spaces survive it. */
function nameKey(name) {
  const tokens = normalizeText(name).split(' ').filter(Boolean).map((t) => UNIT_TOKEN[t] ?? t);
  return tokens.join('').replace(/[^\p{L}\p{N}]/gu, '');
}

const sizeKey = (size) => (size ? `${size.value}|${size.unit}|${size.count ?? 1}` : null);
const median = (nums) => { const a = nums.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const sameGs1Prefix = (a, b) => a.length >= 9 && b.length >= 9 && a.slice(0, 9) === b.slice(0, 9);

/** gtin -> every name a chain publishes for it (data/prices/<chain>/catalog.full.json, when present). */
function loadNamesByGtin() {
  const dir = path.join(DATA_ROOT, 'prices');
  const byGtin = new Map();
  if (!existsSync(dir)) return byGtin;
  for (const chain of readdirSync(dir)) {
    const file = path.join(dir, chain, 'catalog.full.json');
    if (!existsSync(file)) continue;
    for (const item of JSON.parse(readFileSync(file, 'utf8')).items ?? []) if (item.gtin && item.name) (byGtin.get(item.gtin) ?? byGtin.set(item.gtin, []).get(item.gtin)).push(item.name);
  }
  return byGtin;
}

/* The screen that makes STRONG mean what it says (products session, 3.10). The first run's 341 "same prefix,
 * same name, same size" pairs were almost all a manufacturer's VARIANTS behind one truncated name: Materna
 * שלב 1/2/3 all published as "מטרנה אקסטרה קר מהדר", Milka לבן vs חלב, Rio tuna כתית vs לימון ופלפל, Rexona
 * לגבר vs נשים, soap colours, make-up shades. A chain that sells both codes at one price looks exactly the
 * same. What separated the six real repackagings (Coca-Cola, Diet Coke, Pepsi, 7UP, Mirinda, a pastrami) was:
 *   (a) each code is sold by at least two chains, and the pair by at least three in total, so the names come
 *       from more than one truncation; and
 *   (b) no name of one code, in any chain, carries a content word - digits included - that no name of the
 *       other code carries, prefix-tolerant so a cut word still matches the whole one. */
export const CONTENT_STOP = new Set(['יח', 'יחידות', 'גרמ', 'גר', 'ג', 'מל', 'ליטר', 'ל', 'קג', 'מארז', 'רביעייה', 'רביעיית', 'שלישייה', 'שלישיית', 'שישייה', 'שישיית', 'זוג', 'חבילה', 'אריזה', 'בעמ', 'מבצע', 'חדש', 'כשלפ', 'בדצ', 'מהדרינ', 'כשר', 'חלק', 'עדח', 'ארוז', 'ארוזה', 'בקבוק', 'פחית', 'קופסה', 'קופסא', 'שקית', 'צנצנת', 'גביע']);
export const contentWords = (names) => { const out = new Set(); for (const n of names) for (const t of normalizeText(n).split(' ')) if (t.length >= 2 && !CONTENT_STOP.has(t)) out.add(t); return out; };
export const covered = (word, words) => { for (const w of words) if (w === word || (word.length >= 3 && w.startsWith(word)) || (w.length >= 3 && word.startsWith(w))) return true; return false; };
export function sameProductScreen(a, b, chainsA, chainsB, namesByGtin) {
  const total = new Set([...chainsA.keys(), ...chainsB.keys()]).size;
  if (chainsA.size < 2 || chainsB.size < 2 || total < 3) return 'too-few-chains';
  const wa = contentWords([a.name, ...(namesByGtin.get(a.gtin) ?? [])]);
  const wb = contentWords([b.name, ...(namesByGtin.get(b.gtin) ?? [])]);
  for (const w of wa) if (!covered(w, wb)) return `only A says "${w}"`;
  for (const w of wb) if (!covered(w, wa)) return `only B says "${w}"`;
  return null;
}

function buildCandidates(products, pricesByGtin, namesByGtin = new Map()) {
  const eligible = products.filter((p) => !p.isWeighted && p.gtin && p.kind !== 'concept' && p.size);
  const groups = new Map(); // "<nameKey>|<sizeKey>" -> [product]
  for (const p of eligible) {
    const key = `${nameKey(p.name)}|${sizeKey(p.size)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const strong = [];
  const variant = []; // same prefix, same truncated name and size, but the chains' names disagree on a content word
  const weak = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // de-dupe by gtin within the group (a product appears once per gtin in products.json, but be defensive)
    const byGtin = new Map(group.map((p) => [p.gtin, p]));
    const members = [...byGtin.values()];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const [a, b] = [members[i], members[j]];
        const chainsA = pricesByGtin.get(a.gtin) ?? new Map();
        const chainsB = pricesByGtin.get(b.gtin) ?? new Map();
        const chainsBoth = [...chainsA.keys()].filter((c) => chainsB.has(c)).sort();
        const diffs = chainsBoth.map((c) => Math.abs(chainsA.get(c) - chainsB.get(c)));
        const pair = {
          gtinA: a.gtin, nameA: a.name, basePriceA: a.basePrice, chainsA: [...chainsA.keys()].sort(),
          gtinB: b.gtin, nameB: b.name, basePriceB: b.basePrice, chainsB: [...chainsB.keys()].sort(),
          chainsBoth, medianPriceDiffOnSharedChains: median(diffs),
        };
        if (!sameGs1Prefix(a.gtin, b.gtin)) { weak.push(pair); continue; }
        const why = sameProductScreen(a, b, chainsA, chainsB, namesByGtin);
        if (why) { variant.push({ ...pair, screened: why }); continue; }
        strong.push(pair);
      }
    }
  }
  weak.sort((x, y) => y.chainsBoth.length - x.chainsBoth.length || (x.medianPriceDiffOnSharedChains ?? 0) - (y.medianPriceDiffOnSharedChains ?? 0));
  strong.sort((x, y) => y.chainsBoth.length - x.chainsBoth.length);
  variant.sort((x, y) => y.chainsBoth.length - x.chainsBoth.length);
  return { strong, variant, weak };
}

function formatPair(p) {
  return `  ${p.gtinA} / ${p.gtinB}  "${p.nameA}" / "${p.nameB}"  chains ${p.chainsA.length}+${p.chainsB.length} (${p.chainsBoth.length} shared)  price ${p.basePriceA} / ${p.basePriceB}${p.medianPriceDiffOnSharedChains != null ? `  median diff on shared chains ${p.medianPriceDiffOnSharedChains.toFixed(2)}` : ''}`;
}

function run() {
  const products = loadProducts();
  const pricesByGtin = loadPricesByGtin();
  const { strong, variant, weak } = buildCandidates(products, pricesByGtin, loadNamesByGtin());
  const outDir = path.join(ROOT, 'data', 'local');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'alias-candidates.json');
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), strongCount: strong.length, variantCount: variant.length, weakCount: weak.length, strong, variant, weak }, null, 1) + '\n');

  console.log(`alias candidates: ${strong.length} strong (same GS1 prefix, two chains each, no name disagrees), ${variant.length} same-prefix pairs screened out as variants, ${weak.length} weak (different prefix) - full list in data/local/alias-candidates.json\n`);
  console.log(`STRONG (${strong.length}):`);
  for (const p of strong) console.log(formatPair(p));
  console.log(`\nVARIANTS (same prefix, screened out), top 10 of ${variant.length}:`);
  for (const p of variant.slice(0, 10)) console.log(`${formatPair(p)}\n      screened: ${p.screened}`);
  console.log(`\nWEAK, top 30 of ${weak.length} by shared-chain count:`);
  for (const p of weak.slice(0, 30)) console.log(formatPair(p));
}

// Guarded (4.10): src/catalog/identity.js imports sameProductScreen/contentWords/covered/CONTENT_STOP from
// this file (the products session's screen, reused rather than copied - docs/IDENTITY-MERGE.md) and must
// not trigger a data/local/alias-candidates.json scan as a side effect of that import.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) run();

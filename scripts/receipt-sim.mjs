#!/usr/bin/env node
/**
 * Receipt simulator & substitute-quality measurement harness (Naor, 11.10 - "simulate at least 100
 * receipts ... and get offers from the other supermarkets", substitute-finding suspected weak).
 *
 * Builds N synthetic baskets (default 100), each 25-40 lines drawn from one online chain's own catalog
 * in a department mix roughly like a real receipt, with a home chain rotating round-robin through the
 * 7 online chains (shufersal, ramilevy, carrefour, yochananof, hazihinam, victory, osherad). For every
 * basket, runs compareCart (src/pricing/compare.js, the same function the backend's /compare uses)
 * against the OTHER six chains - the home chain's own row is trivially ~100% ok and excluded from the
 * per-chain stats - under both substitute policies: 'cheapest' and 'privateLabel' (the production
 * default, src/pricing/compare.js DEFAULT_SUBSTITUTES). `apply` is always 'ask' (the production
 * default): a line is never auto-replaced, only offered via `line.alternative`, so `status` is 'ok' or
 * 'missing'/'out_of_stock' - 'substituted' only happens for an explicit customer pick, which these
 * baskets never make, so that bucket is ~0 by construction.
 *
 * Note: the task's "settings {brandSwap:'yes', sizeSwap:true}" has no equivalent parameter on
 * compareCart in this repo - brand is never part of the rules (only `policy`/private-label matters) and
 * size tolerance (±25%, `config/substitutes/rules.json`) isn't caller-configurable. Nothing to pass.
 *
 * Every (basket, other-chain) line is classified: ok / substituted / missing-with-alternative /
 * missing-no-alternative. For missing-no-alternative lines we additionally run evaluateSubstitutes
 * ourselves (src/pricing/substitutes.js) to get WHY nothing qualified (the same refusal tokens as
 * scripts/substitute-audit.mjs: form-of-sale, category, size, pack, form, diet, required, percent,
 * variant, price-band, not-sold, policy, or 'no-concept' when the product carries no conceptId at all).
 * compareCart's own missing-line fallback is always policy:'cheapest' internally (docs/CONCEPTS.md §4),
 * independent of the cart's substitutes.policy, so missing-line outcomes are the same across both policy
 * runs; the policy only changes whether an available ('ok') line ALSO gets a bonus cheaper-alternative
 * offer, which we report as `okWithCheaperOffer` without changing the status bucket.
 *
 * Usage:
 *   node scripts/receipt-sim.mjs [--n 100] [--seed 42] [--receipts data/local/receipts] [--out ops/review/receipt-sim-2026-10-11]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MappingEngine } from '../src/catalog/mapping.js';
import { compareCart, LINE_STATUS } from '../src/pricing/compare.js';
import { evaluateSubstitutes } from '../src/pricing/substitutes.js';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ONLINE_CHAIN_IDS = ['shufersal', 'ramilevy', 'carrefour', 'yochananof', 'hazihinam', 'victory', 'osherad'];
export const POLICIES = ['cheapest', 'privateLabel'];

// ---- department mix (docs/CONCEPTS.md categories; Naor's rough real-receipt proportions) ----
export const BUCKET_WEIGHTS = { produce: 0.25, dairy: 0.2, meat: 0.1, pantry: 0.2, snacks: 0.1, cleaning: 0.1, other: 0.05 };
const BUCKET_CATEGORIES = {
  produce: ['ירקות ופירות'],
  dairy: ['חלב וביצים'],
  meat: ['בשר ועוף'],
  pantry: ['שימורים', 'מאפים ולחם', 'פיצוחים ופירות יבשים', 'פארם ותוספים'],
  snacks: ['חטיפים וממתקים', 'משקאות'],
  cleaning: ['ניקיון וטואלטיקה', 'טיפוח ויופי'],
  other: ['בית וכלים', 'בעלי חיים', 'טבעוני', 'כללי', 'מעדנייה', 'תינוקות'],
};
const CATEGORY_TO_BUCKET = new Map();
for (const [bucket, cats] of Object.entries(BUCKET_CATEGORIES)) for (const c of cats) CATEGORY_TO_BUCKET.set(c, bucket);
export const BUCKETS = Object.keys(BUCKET_WEIGHTS);
export function categoryToBucket(category) { return CATEGORY_TO_BUCKET.get(category) ?? 'other'; }

/** Deterministic seeded PRNG (mulberry32): same seed -> same stream, every call site shares one instance. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1)); // inclusive
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/**
 * Per-chain, per-bucket pools of products that chain actually prices - built once and reused across
 * every basket (100 baskets x 7 chains must stay well under a minute). Weighed and non-weighed products
 * are kept separate so a basket can target 3-6 weighed lines.
 *
 * Deliberately bypasses mapping.resolve()'s fuzzy-name fallback: going through it for all ~49k products
 * x 7 chains (to find what a chain merely *stocks*, before any cart line exists) takes well over a
 * minute by itself (rankMatches over each chain's weighed catalog items, repeated per candidate) - the
 * same reason scripts/substitute-audit.mjs only samples. Instead this reads the engine's own fast-path
 * indexes directly (gtin-exact for barcoded products, concept-match for weighed ones), which is exactly
 * what resolve() would have found anyway for every product that ends up in a basket: a real chain
 * catalog is barcode-complete for packaged goods (strictGtin, same as production) and weighed produce
 * resolves by conceptId, never by fuzzy name. The only products this excludes are weighed-but-barcoded
 * items whose own barcode isn't stocked at a chain AND whose concept has no in-stock item there either -
 * resolve() would have reached for a fuzzy name guess there; a basket simply won't draw that pairing.
 */
/**
 * Pre-fills mapping.cache with exactly what mapping.resolve()'s two fast paths (gtin-exact, then
 * concept-cheapest-in-stock) would compute, for every (chain, product) pair - so that later, real
 * resolve() calls made from inside compareCart/evaluateSubstitutes (which iterate every candidate of a
 * concept, across every chain, for every cart line) are pure cache hits and never fall through to
 * rankMatches' fuzzy name search. That fuzzy fallback (only reachable for a *weighed* product whose own
 * gtin isn't stocked and whose concept has no in-stock item at that chain either - the strictGtin guard
 * already blocks it for non-weighed products) is what made the first version of this harness take two
 * minutes for 100 baskets: scanning a few thousand weighed-with-gtin candidates x 7 chains, each one a
 * rankMatches() pass over that chain's whole weighed catalog. Pre-warming trades the rare fuzzy match
 * this harness would have found (same approximation scripts/substitute-audit.mjs's strictGtin already
 * makes for packaged goods) for 100 baskets running in seconds instead of minutes.
 */
function prewarmMappingCache(mapping, products, chainIds) {
  for (const chainId of chainIds) {
    const index = mapping.indexes.get(chainId);
    for (const p of products) {
      const key = `${chainId}:${p.id}`;
      if (mapping.cache.has(key)) continue;
      let result = null;
      if (p.gtin) {
        const item = index.byGtin.get(String(p.gtin));
        if (item) result = { storeItem: item, method: 'gtin', score: 1 };
      }
      if (!result && p.conceptId) {
        const candidates = (index.byConceptId.get(p.conceptId) ?? []).filter((i) => i.inStock !== false && Number.isFinite(i.price));
        if (candidates.length) result = { storeItem: candidates.reduce((a, b) => (b.price < a.price ? b : a)), method: 'concept', score: 1 };
      }
      mapping.cache.set(key, result);
    }
  }
}
export { prewarmMappingCache };

export function buildChainPools({ products, mapping, chainIds = ONLINE_CHAIN_IDS }) {
  const pools = {};
  for (const chainId of chainIds) {
    const index = mapping.indexes.get(chainId);
    const byBucket = {};
    for (const b of BUCKETS) byBucket[b] = { weighed: [], nonWeighed: [] };
    for (const p of products) {
      let available = false;
      if (p.gtin) {
        const item = index.byGtin.get(String(p.gtin));
        available = !!item && item.inStock !== false;
      }
      if (!available && p.conceptId) {
        const list = index.byConceptId.get(p.conceptId);
        available = !!list && list.some((i) => i.inStock !== false);
      }
      if (!available) continue;
      const bucket = byBucket[categoryToBucket(p.category)];
      (p.isWeighted ? bucket.weighed : bucket.nonWeighed).push(p.id);
    }
    pools[chainId] = byBucket;
  }
  return pools;
}

/** How many lines from each bucket for a basket of `total` lines, rounded to add up exactly to `total`. */
function bucketCounts(total) {
  const raw = BUCKETS.map((b) => BUCKET_WEIGHTS[b] * total);
  const counts = raw.map(Math.floor);
  let remainder = total - counts.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < remainder; k++) counts[order[k % order.length][1]]++;
  return Object.fromEntries(BUCKETS.map((b, i) => [b, counts[i]]));
}

/** Sample `count` distinct ids from `arr` using `rng` (Fisher-Yates partial shuffle, no replacement). */
function sampleDistinct(rng, arr, count) {
  const pool = arr.slice();
  const out = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = randInt(rng, i, pool.length - 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
    out.push(pool[i]);
  }
  return out;
}

/**
 * One deterministic basket for `homeChain`: 25-40 lines in the department mix above, 3-6 weighed lines
 * (preferring produce/meat, the departments that actually have weighed products), qty 1-3 (kg for
 * weighed lines), everything else barcoded. Pure function of (rng's current state, pools) - no I/O.
 */
export function buildBasket({ rng, homeChain, pools, productsById }) {
  const total = randInt(rng, 25, 40);
  const weighedTarget = randInt(rng, 3, 6);
  const counts = bucketCounts(total);
  const chainPools = pools[homeChain];
  const lines = [];
  let weighedSoFar = 0;
  const shortfall = {};
  for (const bucket of BUCKETS) {
    const want = counts[bucket];
    if (!want) continue;
    const bp = chainPools[bucket];
    const wantWeighed = Math.max(0, Math.min(want, weighedTarget - weighedSoFar, bp.weighed.length));
    const weighedIds = bucket === 'produce' || bucket === 'meat' ? sampleDistinct(rng, bp.weighed, wantWeighed) : [];
    weighedSoFar += weighedIds.length;
    const restWanted = want - weighedIds.length;
    const nonWeighedIds = sampleDistinct(rng, bp.nonWeighed, restWanted);
    const gotIds = [...weighedIds, ...nonWeighedIds];
    if (gotIds.length < want) shortfall[bucket] = want - gotIds.length;
    for (const id of gotIds) {
      const product = productsById.get(id);
      const qty = product.isWeighted ? Math.round((0.3 + rng() * 1.7) * 100) / 100 : randInt(rng, 1, 3);
      lines.push({ productId: id, qty, bucket });
    }
  }
  return { homeChain, lines, shortfall };
}

/** N deterministic baskets, home chain rotating round-robin through `chainIds`. Pure given (n, seed, pools). */
export function generateBaskets({ n, seed, pools, productsById, chainIds = ONLINE_CHAIN_IDS }) {
  const rng = mulberry32(seed);
  const baskets = [];
  for (let i = 0; i < n; i++) {
    const homeChain = chainIds[i % chainIds.length];
    const basket = buildBasket({ rng, homeChain, pools, productsById });
    baskets.push({ id: i, ...basket });
  }
  return baskets;
}

// ---------------------------------------------------------------------------
// Real receipts (data/local/receipts/*.json, produced from the Osher Ad PDFs - see docs in that script)
// ---------------------------------------------------------------------------
export function loadRealReceipts(dir) {
  const abs = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
  const files = readdirSync(abs).filter((f) => f.endsWith('.json')).sort();
  return files.map((f, i) => {
    const data = JSON.parse(readFileSync(path.join(abs, f), 'utf8'));
    const resolvedLines = (data.lines ?? []).filter((l) => l.productId);
    return {
      id: i,
      file: f,
      homeChain: data.chain,
      date: data.date,
      lines: resolvedLines.map((l) => ({ productId: l.productId, qty: l.qty ?? 1 })),
      unresolvedCount: (data.lines ?? []).length - resolvedLines.length,
      totalParsed: (data.lines ?? []).length,
    };
  });
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------
const CLASS = {
  OK: 'ok',
  SUBSTITUTED: 'substituted',
  MISSING_WITH_ALT: 'missing-with-alternative',
  MISSING_NO_ALT: 'missing-no-alternative',
};

function classifyPricedLine(l) {
  if (l.status === LINE_STATUS.SUBSTITUTED) return CLASS.SUBSTITUTED;
  if (l.status === LINE_STATUS.OK) return CLASS.OK;
  // MISSING or OUT_OF_STOCK
  return l.alternative ? CLASS.MISSING_WITH_ALT : CLASS.MISSING_NO_ALT;
}

/** Why findSubstitute came back empty for a missing-no-alternative line - the per-rule refusal tokens. */
function noAlternativeReasons({ product, chainId, mapping }) {
  if (!product?.conceptId) return ['no-concept'];
  const entries = evaluateSubstitutes({ product, qty: 1, chainId, mapping, policy: 'cheapest', purpose: 'missing', referencePrice: product.basePrice ?? null, scope: 'concept' });
  const reasons = entries.filter((e) => !e.ok).map((e) => e.reason ?? 'unknown');
  return reasons.length ? reasons : ['no-candidates'];
}

/**
 * Classifies every line of every "other chain" (not `basket.homeChain`) row of a compareCart result and
 * folds the counts into `agg` (mutated in place, keyed by chainId then policy). Also tallies the
 * cross-cutting histograms (caveats, tier, no-alternative concept/reason) and collects offer samples.
 */
export function classifyResult({ result, basket, policy, mapping, productsById, agg, offerSink, noAltSink }) {
  for (const row of result.rows) {
    if (row.chainId === basket.homeChain) continue;
    if (!row.deliverable) continue;
    const chainAgg = (agg[row.chainId] ??= {});
    const pa = (chainAgg[policy] ??= { ok: 0, substituted: 0, 'missing-with-alternative': 0, 'missing-no-alternative': 0, total: 0, okWithCheaperOffer: 0 });
    for (const l of row.lines) {
      const cls = classifyPricedLine(l);
      pa[cls]++;
      pa.total++;
      if (cls === CLASS.OK && l.alternative) pa.okWithCheaperOffer++;
      if ((cls === CLASS.OK || cls === CLASS.MISSING_WITH_ALT) && l.alternative && offerSink) {
        offerSink.push({
          chainId: row.chainId, policy, basketId: basket.id, homeChain: basket.homeChain,
          original: l.name, alternative: l.alternative.name, caveats: l.alternative.caveats ?? [],
          reason: l.alternative.reason, tier: l.alternative.tier, savings: l.alternative.savings,
        });
      }
      if (cls === CLASS.MISSING_NO_ALT && noAltSink) {
        const product = productsById.get(l.productId);
        const reasons = noAlternativeReasons({ product, chainId: row.chainId, mapping });
        noAltSink.push({ conceptId: product?.conceptId ?? 'no-concept', reasons, name: l.name, chainId: row.chainId, policy });
      }
    }
  }
}

function emptyPolicyAgg() { return { ok: 0, substituted: 0, 'missing-with-alternative': 0, 'missing-no-alternative': 0, total: 0, okWithCheaperOffer: 0 }; }

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i === -1 ? def : argv[i + 1]; };
  return {
    n: Number(opt('n', 100)),
    seed: Number(opt('seed', 42)),
    receipts: opt('receipts', null),
    out: opt('out', 'ops/review/receipt-sim-2026-10-11'),
  };
}

function topN(histogram, n) {
  return Object.entries(histogram).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function buildMarkdown({ simAgg, simCaveats, simTier, simNoAltConcepts, simNoAltReasons, noConceptShare, sampleOffers, worst, realAgg, realNoAltConcepts, realNoAltReasons, n, seed, parseStats }) {
  const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '-');
  const lines = [];
  lines.push(`# מדידת תחליפים - סימולציית ${n} קבלות (סיד ${seed}, 11.10.2026)`);
  lines.push('');
  lines.push(`נאור טען שמציאת תחליפים חלשה. ${n} סלים מדומים, 25-40 שורות כל אחד, מתוך הקטלוג האמיתי של כל רשת אונליין (שופרסל/רמי לוי/קרפור/יוחננוף/חצי חינם/ויקטורי/אושר עד, בתורות), הושוו ל-6 הרשתות האחרות (הרשת הביתית מוציאה כמעט תמיד "תקין" ולא מעניינת). כל שורה סווגה: תקין / הוחלף / חסר-עם-תחליף / חסר-בלי-תחליף. \`apply\` הוא 'ask' (ברירת המחדל בפרודקשן) - "הוחלף" לעולם לא קורה בלי בחירת לקוח מפורשת, שהסימולציה הזו לא עושה, אז הדלי הזה אפסי מבנית.`);
  lines.push('');
  lines.push(`**הערה:** ל-compareCart בריפו הזה אין פרמטר \`brandSwap\`/\`sizeSwap\` - מותג לא חלק מהכללים (רק \`policy\`/מותג-פרטי), וטווח הגודל (±25%) לא ניתן להגדרה מהקריאה. לא היה מה להעביר. שורה חסרה תמיד מקבלת תחליף לפי \`policy:'cheapest'\` פנימי (ללא תלות ב-policy של הסל) - ה-policy שבחרתם משפיע רק על הצעת "זול יותר" לשורה שכן קיימת.`);
  lines.push('');
  lines.push(`שיעור שורות הסל בלי conceptId בכלל: **${pct(noConceptShare.count, noConceptShare.total)}** (${noConceptShare.count}/${noConceptShare.total}) - לשורות כאלה אין שום סיכוי לתחליף, זה לא כשל בכללים.`);
  lines.push('');
  for (const policy of POLICIES) {
    lines.push(`## טבלה לפי רשת - policy: ${policy}`);
    lines.push('');
    lines.push('| רשת | שורות | תקין % | הוחלף % | חסר-עם-תחליף % | חסר-בלי-תחליף % | "זול יותר" גם על שורה תקינה |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const chainId of ONLINE_CHAIN_IDS) {
      const a = simAgg[chainId]?.[policy];
      if (!a) continue;
      lines.push(`| ${chainId} | ${a.total} | ${pct(a.ok, a.total)} | ${pct(a.substituted, a.total)} | ${pct(a['missing-with-alternative'], a.total)} | ${pct(a['missing-no-alternative'], a.total)} | ${pct(a.okWithCheaperOffer, a.ok)} |`);
    }
    lines.push('');
  }
  lines.push('## היסטוגרמת caveats על הצעות-לשורה-חסרה (שתי המדיניויות, אותה תוצאה - הפולבק תמיד cheapest)');
  lines.push('');
  for (const [k, v] of topN(simCaveats, 20)) lines.push(`- ${k}: ${v}`);
  if (!Object.keys(simCaveats).length) lines.push('- (אין)');
  lines.push('');
  lines.push('## tier של ההצעות לשורה חסרה (concept/family) - המשפחות ריקות מ-23.9, אז family אמור להיות אפס');
  lines.push('');
  for (const [k, v] of topN(simTier, 10)) lines.push(`- ${k}: ${v}`);
  lines.push('');
  lines.push('## 25 המושגים הנפוצים ביותר בלי אף תחליף (חסר-בלי-תחליף), ברשתות האחרות');
  lines.push('');
  lines.push('| conceptId | פעמים | הסיבות הנפוצות |');
  lines.push('|---|---|---|');
  for (const [conceptId, count] of topN(simNoAltConcepts, 25)) {
    const reasonsForConcept = simNoAltReasons[conceptId] ?? {};
    const topReasons = topN(reasonsForConcept, 3).map(([r, c]) => `${r}(${c})`).join(', ');
    lines.push(`| ${conceptId} | ${count} | ${topReasons} |`);
  }
  lines.push('');
  lines.push('## הסיבות הנפוצות ביותר לאין-תחליף, בכלל (כל המושגים)');
  lines.push('');
  const allReasons = {};
  for (const perConcept of Object.values(simNoAltReasons)) for (const [r, c] of Object.entries(perConcept)) allReasons[r] = (allReasons[r] ?? 0) + c;
  for (const [k, v] of topN(allReasons, 15)) lines.push(`- ${k}: ${v}`);
  lines.push('');
  lines.push(`## מדגם אקראי של ${sampleOffers.length} הצעות (מקור -> תחליף, caveats, סיבה) - לבדיקה אנושית`);
  lines.push('');
  lines.push('| רשת | מדיניות | מקור | תחליף | caveats | סיבה | tier | חיסכון |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const o of sampleOffers) lines.push(`| ${o.chainId} | ${o.policy} | ${o.original} | ${o.alternative} | ${o.caveats.join(',') || '-'} | ${o.reason} | ${o.tier} | ${o.savings ?? '-'} |`);
  lines.push('');
  lines.push('## דגלים - מה נראה בעייתי במדגם');
  lines.push('');
  if (worst.length) for (const w of worst) lines.push(`- **${w.chainId}/${w.policy}**: "${w.original}" -> "${w.alternative}" (${w.why})`);
  else lines.push('- לא נמצאו הצעות עם caveats מרובים/חיסכון שלילי/חריג במדגם הזה.');
  lines.push('');
  lines.push('## 5 הקבלות האמיתיות (אושר עד) - פענוח + השוואה');
  lines.push('');
  for (const r of parseStats) lines.push(`- ${r.file} (${r.date}): ${r.resolved}/${r.totalParsed} שורות זוהו (${pct(r.resolved, r.totalParsed)})`);
  lines.push('');
  for (const policy of POLICIES) {
    lines.push(`### קבלות אמיתיות - policy: ${policy}`);
    lines.push('');
    lines.push('| רשת | שורות | תקין % | הוחלף % | חסר-עם-תחליף % | חסר-בלי-תחליף % |');
    lines.push('|---|---|---|---|---|---|');
    for (const chainId of ONLINE_CHAIN_IDS) {
      const a = realAgg[chainId]?.[policy];
      if (!a) continue;
      lines.push(`| ${chainId} | ${a.total} | ${pct(a.ok, a.total)} | ${pct(a.substituted, a.total)} | ${pct(a['missing-with-alternative'], a.total)} | ${pct(a['missing-no-alternative'], a.total)} |`);
    }
    lines.push('');
  }
  lines.push('## 25 המושגים הנפוצים ביותר בלי תחליף - קבלות אמיתיות');
  lines.push('');
  for (const [conceptId, count] of topN(realNoAltConcepts, 25)) {
    const reasonsForConcept = realNoAltReasons[conceptId] ?? {};
    const topReasons = topN(reasonsForConcept, 3).map(([r, c]) => `${r}(${c})`).join(', ');
    lines.push(`- ${conceptId}: ${count} (${topReasons})`);
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

export async function run() {
  const t0 = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
  const chains = JSON.parse(readFileSync(path.join(ROOT, 'data', 'chains.json'), 'utf8')).filter((c) => ONLINE_CHAIN_IDS.includes(c.id));
  const catalogs = {};
  for (const c of chains) catalogs[c.id] = JSON.parse(readFileSync(path.join(ROOT, 'data', 'catalogs', `${c.id}.json`), 'utf8'));
  const mapping = new MappingEngine({ products, catalogs, strictGtin: true });
  const productsById = mapping.productsById;
  prewarmMappingCache(mapping, products, ONLINE_CHAIN_IDS);

  // ---- simulated baskets ----
  const pools = buildChainPools({ products, mapping, chainIds: ONLINE_CHAIN_IDS });
  const baskets = generateBaskets({ n: args.n, seed: args.seed, pools, productsById, chainIds: ONLINE_CHAIN_IDS });

  const simAgg = {};
  const simOffers = [];
  const simNoAlt = [];
  let simNoConceptLines = 0;
  let simTotalLines = 0;
  for (const basket of baskets) {
    const cart = { lines: basket.lines };
    for (const l of basket.lines) { simTotalLines++; if (!productsById.get(l.productId)?.conceptId) simNoConceptLines++; }
    for (const policy of POLICIES) {
      const result = compareCart({ cart, chains, mapping, address: null, substitutes: { policy, apply: 'ask' } });
      classifyResult({ result, basket, policy, mapping, productsById, agg: simAgg, offerSink: simOffers, noAltSink: simNoAlt });
    }
  }

  const simCaveats = {};
  const simTier = {};
  for (const o of simOffers) { for (const c of o.caveats) simCaveats[c] = (simCaveats[c] ?? 0) + 1; simTier[o.tier] = (simTier[o.tier] ?? 0) + 1; }
  const simNoAltConcepts = {};
  const simNoAltReasons = {}; // conceptId -> reason -> count
  for (const e of simNoAlt) {
    simNoAltConcepts[e.conceptId] = (simNoAltConcepts[e.conceptId] ?? 0) + 1;
    const perConcept = (simNoAltReasons[e.conceptId] ??= {});
    for (const r of e.reasons) perConcept[r] = (perConcept[r] ?? 0) + 1;
  }

  // deterministic sample of 60 offers, independent RNG stream so it doesn't disturb basket generation
  const sampleRng = mulberry32(args.seed + 1);
  const sampleOffers = sampleDistinct(sampleRng, simOffers, Math.min(60, simOffers.length));
  // "Worst-looking": most caveats first (a candidate the rules themselves flagged as uncertain - size
  // unconfirmed/other size/other flavour), then any offer with negative savings (shouldn't happen by
  // construction, kept as a trip-wire). Always returns up to 10, even when nothing hit 2+ caveats.
  const worst = simOffers
    .filter((o) => o.caveats.length >= 1 || (o.savings != null && o.savings < 0))
    .sort((a, b) => b.caveats.length - a.caveats.length)
    .slice(0, 10)
    .map((o) => ({ ...o, why: o.caveats.length ? `caveats: ${o.caveats.join(', ')}` : `negative savings: ${o.savings}` }));

  // ---- real receipts ----
  const receiptsDir = args.receipts ?? 'data/local/receipts';
  let realAgg = {};
  let realNoAltConcepts = {};
  let realNoAltReasons = {};
  let parseStats = [];
  try {
    const realBaskets = loadRealReceipts(receiptsDir);
    parseStats = realBaskets.map((b) => ({ file: b.file, date: b.date, resolved: b.lines.length, totalParsed: b.totalParsed }));
    const realNoAlt = [];
    for (const basket of realBaskets) {
      const cart = { lines: basket.lines };
      for (const policy of POLICIES) {
        const result = compareCart({ cart, chains, mapping, address: null, substitutes: { policy, apply: 'ask' } });
        classifyResult({ result, basket, policy, mapping, productsById, agg: realAgg, offerSink: null, noAltSink: realNoAlt });
      }
    }
    for (const e of realNoAlt) {
      realNoAltConcepts[e.conceptId] = (realNoAltConcepts[e.conceptId] ?? 0) + 1;
      const perConcept = (realNoAltReasons[e.conceptId] ??= {});
      for (const r of e.reasons) perConcept[r] = (perConcept[r] ?? 0) + 1;
    }
  } catch (e) {
    console.log(`(no real receipts at ${receiptsDir}: ${e.message})`);
  }

  const ms = Date.now() - t0;
  console.log(`receipt-sim: ${args.n} baskets x ${ONLINE_CHAIN_IDS.length - 1} other chains x ${POLICIES.length} policies, ${simTotalLines} basket-lines, in ${ms}ms`);

  const outBase = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
  mkdirSync(path.dirname(outBase), { recursive: true });
  const jsonOut = {
    generatedAt: new Date().toISOString(), n: args.n, seed: args.seed,
    noConceptShare: { count: simNoConceptLines, total: simTotalLines },
    simAgg, simCaveats, simTier, simNoAltConcepts, simNoAltReasons,
    sampleOffers, worst, realAgg, realNoAltConcepts, realNoAltReasons, parseStats,
  };
  writeFileSync(`${outBase}.json`, JSON.stringify(jsonOut, null, 2) + '\n');
  const md = buildMarkdown({
    simAgg, simCaveats, simTier, simNoAltConcepts, simNoAltReasons,
    noConceptShare: { count: simNoConceptLines, total: simTotalLines },
    sampleOffers, worst, realAgg, realNoAltConcepts, realNoAltReasons, n: args.n, seed: args.seed, parseStats,
  });
  writeFileSync(`${outBase}.md`, md);
  console.log(`wrote ${args.out}.json and ${args.out}.md`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) run();

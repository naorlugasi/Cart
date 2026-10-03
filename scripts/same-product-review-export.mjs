#!/usr/bin/env node
/**
 * Builds the input for tools/review/same-product.html: "same product, several barcodes" clusters for
 * Naor to call אותו מוצר / שונה / לא בטוח on (docs/REVIEW-SAME-PRODUCT.md).
 *
 * Sources (all read-only, never data/ itself written):
 *   - data/local/alias-candidates.json (scripts/alias-candidates.mjs output: strong/variant/weak PAIRS).
 *     Run that script first - this one does not invoke it, same read-only-input convention as the rest of
 *     the review tools in this file (`node scripts/alias-candidates.mjs`).
 *   - data/review-queue.json items whose checks carry rule "same-product" (a parallel agent's queue; may
 *     not exist yet - an empty/missing file contributes nothing, not an error). Each such item is keyed to
 *     ONE gtin (its own id); any other gtin-looking token in that item's "same-product" checks' detail/
 *     suggestion text is read as "this item says it is the same product as that gtin" and turned into a pair,
 *     tier "queue". This is deliberately permissive about the exact shape, since the real shape hadn't
 *     landed when this was written.
 *   - config/products/not-aliases.json (Naor's "שונה" verdicts, written by same-product-review-import.mjs):
 *     any pair that both appear together in one entry's `gtins` is dropped before clustering, so a
 *     rejected pair never resurfaces and never glues two unrelated clusters back together.
 *
 * Pairs are merged into clusters with a plain union-find (a pair's two gtins join one cluster; clusters
 * can have more than 2 members when pairs chain: A-B and B-C make one 3-way cluster). Clustering, impact
 * and the Hebrew size text are exported as pure functions for test/same-product-review-export.test.js.
 *
 *   node scripts/same-product-review-export.mjs
 *   DATA_ROOT=/path/to/data node scripts/same-product-review-export.mjs   # point at a different data/ (tests)
 *
 * Writes (never committed - data/local/ is gitignored):
 *   - data/local/same-product-review.json      full detail, every cluster.
 *   - data/local/same-product-review.min.json  same clusters, compact fields, capped at MAX_MIN_CLUSTERS
 *     by impact (the page's primary input - must stay well under 3 MB).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { tokenize } from '../src/catalog/matching.js';
import { describeSize } from '../src/catalog/size.js';
import { isGtin } from '../src/catalog/priceXml.js';
import { contentWords, covered } from './alias-candidates.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// The pipeline publishes data/ only in the main checkout - a review worktree's own data/ is an untracked
// copy that can silently go stale while this session is open (memory: "only the runner publishes data",
// "shared working tree"). DATA_ROOT still overrides it, for tests and for pointing at a snapshot.
const DEFAULT_DATA_ROOT = '/Users/naorlugassi/Projects/Cart/data';
export const DATA_ROOT = process.env.DATA_ROOT ? path.resolve(process.env.DATA_ROOT) : DEFAULT_DATA_ROOT;
const OUT_DIR = path.join(ROOT, 'data', 'local');
const CANDIDATES_PATH = path.join(OUT_DIR, 'alias-candidates.json'); // written by scripts/alias-candidates.mjs, always ROOT-relative (its own convention)
const NOT_ALIASES_PATH = path.join(ROOT, 'config', 'products', 'not-aliases.json');
const IDENTITY_CLUSTERS_PATH = path.join(OUT_DIR, 'identity-clusters.json'); // written by scripts/identity-merge.mjs, always ROOT-relative

/** Chains the app actually serves carts for - "impact" counts only these (docs/REVIEW-SAME-PRODUCT.md). */
export const SERVED_CHAINS = ['shufersal', 'ramilevy', 'carrefour', 'yochananof', 'hazihinam', 'victory', 'osherad'];
export const MAX_MIN_CLUSTERS = 1500;

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------

export function loadProducts(dataRoot = DATA_ROOT) {
  const file = path.join(dataRoot, 'products.json');
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** gtin -> Map(chainId -> { price, name }), read from the published per-chain catalogs - the same source
 *  scripts/alias-candidates.mjs uses, kept alongside the chain's own name (products.json only has a count). */
export function loadCatalogPrices(dataRoot = DATA_ROOT) {
  const dir = path.join(dataRoot, 'catalogs');
  const byGtin = new Map();
  if (!existsSync(dir)) return byGtin;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'demo.json') continue;
    const chainId = file.replace(/\.json$/, '');
    let catalog;
    try { catalog = JSON.parse(readFileSync(path.join(dir, file), 'utf8')); } catch { continue; }
    for (const item of catalog.items ?? []) {
      if (!item.gtin || !Number.isFinite(item.price)) continue;
      const m = byGtin.get(item.gtin) ?? new Map();
      const cur = m.get(chainId);
      if (!cur || item.price < cur.price) m.set(chainId, { price: item.price, name: item.name });
      byGtin.set(item.gtin, m);
    }
  }
  return byGtin;
}

export function loadAliasCandidates(candidatesPath = CANDIDATES_PATH) {
  if (!existsSync(candidatesPath)) {
    throw new Error(`missing ${candidatesPath} - run \`node scripts/alias-candidates.mjs\` first`);
  }
  return JSON.parse(readFileSync(candidatesPath, 'utf8'));
}

export function loadReviewQueue(dataRoot = DATA_ROOT) {
  const file = path.join(dataRoot, 'review-queue.json');
  if (!existsSync(file)) return { items: [] };
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return { items: raw.items ?? [] };
  } catch {
    return { items: [] };
  }
}

export function loadNotAliases(filePath = NOT_ALIASES_PATH) {
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/** scripts/identity-merge.mjs's output (docs/ALIASES.md) - an offline PROPOSAL tool, not run by this
 *  script. Missing/unparsable reads as no identity clusters at all, same tolerance as every other optional
 *  source here (the export must still work before the identity tool has ever been run). */
export function loadIdentityClusters(filePath = IDENTITY_CLUSTERS_PATH) {
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// pairs -> edges
// ---------------------------------------------------------------------------

/** Every 8-14 digit run in `text` that passes isGtin (docs/ALIASES.md's own barcode check), used to pull a
 *  referenced gtin out of a review-queue check's free-text detail/suggestion. */
export function gtinTokensIn(text) {
  const out = [];
  const re = /\d{8,14}/g;
  let m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) if (isGtin(m[0])) out.push(m[0]);
  return out;
}

export function edgesFromCandidates(candidateData) {
  const edges = [];
  for (const tier of ['strong', 'variant', 'weak']) {
    for (const p of candidateData?.[tier] ?? []) {
      if (p.gtinA && p.gtinB) edges.push({ a: p.gtinA, b: p.gtinB, tier });
    }
  }
  return edges;
}

/** A "same-product" review-queue item is keyed to one gtin (its id, "g<gtin>"); any OTHER gtin-looking
 *  token in its same-product checks' detail/suggestion is read as "same product as that gtin" (see file
 *  doc comment - the real queue shape hadn't landed when this was written, so this stays permissive). */
export function edgesFromQueue(items) {
  const edges = [];
  for (const item of items ?? []) {
    const checks = (item.checks ?? []).filter((c) => c?.rule === 'same-product');
    if (item.kind !== 'same-product' && checks.length === 0) continue;
    const ownGtin = typeof item.id === 'string' && item.id.startsWith('g') ? item.id.slice(1) : null;
    if (!ownGtin || !isGtin(ownGtin)) continue;
    const others = new Set();
    for (const c of checks) for (const g of [...gtinTokensIn(c.detail), ...gtinTokensIn(c.suggestion)]) {
      if (g !== ownGtin) others.add(g);
    }
    for (const other of others) edges.push({ a: ownGtin, b: other, tier: 'queue' });
  }
  return edges;
}

/** True when `a` and `b` were both named in one not-aliases.json entry - Naor already said "שונה" for this
 *  exact pair, so it must never re-merge into a cluster (export must read this file, see file doc comment). */
export function isBlockedPair(a, b, notAliases) {
  return (notAliases ?? []).some((entry) => Array.isArray(entry.gtins) && entry.gtins.includes(a) && entry.gtins.includes(b));
}

// ---------------------------------------------------------------------------
// clustering
// ---------------------------------------------------------------------------

// "identity-auto"/"identity-review" (scripts/identity-merge.mjs, docs/ALIASES.md) rank AHEAD of every
// alias-candidates/queue tier: a cluster the four auto-merge conditions all held for (identity-auto) or
// that reached them and failed one (identity-review) carries more evidence - attrs, price-per-chain, the
// products-session screen - than a bare name/prefix match ever does.
const TIER_RANK = { 'identity-auto': -2, 'identity-review': -1, strong: 0, queue: 1, variant: 2, weak: 3 };

/** Union-find over `edges` ({a, b, tier}), each a confirmed-candidate PAIR. Clusters with fewer than 2
 *  members are dropped (an isolated gtin, from a chain edge filtered out as blocked, is not a cluster).
 *  A cluster's tier is the best (lowest TIER_RANK) tier of any edge inside it - one strong pair among an
 *  otherwise-weak chain still means "look at this first". Returns [{ gtins: [sorted], tier }], unsorted. */
export function buildClusters(edges) {
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  const union = (a, b) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const kept = [];
  for (const { a, b, tier } of edges) {
    if (!a || !b || a === b) continue;
    union(a, b);
    kept.push({ a, b, tier });
  }
  const groups = new Map(); // root -> Set(gtin)
  for (const gtin of parent.keys()) {
    const root = find(gtin);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root).add(gtin);
  }
  const clusters = [];
  for (const members of groups.values()) {
    if (members.size < 2) continue;
    const tiers = kept.filter((e) => members.has(e.a) && members.has(e.b)).map((e) => e.tier);
    const tier = tiers.sort((x, y) => TIER_RANK[x] - TIER_RANK[y])[0] ?? 'weak';
    clusters.push({ gtins: [...members].sort(), tier });
  }
  return clusters;
}

/** Stable id for a cluster: a hash of its sorted gtins, so the same cluster gets the same id across runs
 *  as long as its membership doesn't change (decisions.json round-trips on this id). */
export function clusterId(gtins) {
  return crypto.createHash('sha1').update([...gtins].sort().join(',')).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// per-cluster detail
// ---------------------------------------------------------------------------

/** Tokens (src/catalog/matching.js tokenize, same stemming/normalizing as the rest of the catalog) that do
 *  not appear in EVERY product name in the cluster - what to highlight on the review page. */
/** Unit spellings are one word (Naor, 4.10: ל' and ליטר are the same, גר' and גרם and גרמים too); a token that is
 *  only punctuation is nothing. */
const UNIT_SPELLINGS = [
  [/^(ל|ל'|לי|ליטר|ליטרימ|ליטרים)$/, 'ליטר'], [/^(ג|ג'|גר|גר'|גרמ|גרם|גרמימ|גרמים)$/, 'גרם'], [/^(מל|מ"ל|מ'ל|מיליליטר)$/, 'מל'],
  [/^(יח|יח'|יחי|יחיד|יחידה|יחידות)$/, 'יח'], [/^(קג|ק"ג|ק'ג|קילו|קילוגרמ)$/, 'קג'], [/^(שק|שקיק|שקיקימ|שקיקים|שקיות)$/, 'שק'],
];
export function unitWord(tok) {
  const t = tok.replace(/[״”“]/g, '"').replace(/[׳’‘`]/g, "'");
  if (!/[\p{L}\p{N}]/u.test(t)) return null;
  for (const [re, word] of UNIT_SPELLINGS) if (re.test(t)) return word;
  return t;
}

const UNIT_WORDS = new Set(UNIT_SPELLINGS.map(([, w]) => w));
export function differingTokens(names) {
  // Unit words are not content: the quantity itself is compared by ruleVerdict from the parsed size, and a chain
  // that writes "ל'" (a single letter the tokenizer drops) must not differ from one that writes "ליטר".
  const sets = names.map((n) => new Set(tokenize(n).map(unitWord).filter((t) => t && !UNIT_WORDS.has(t))));
  const all = new Set(sets.flatMap((s) => [...s]));
  const out = [];
  for (const tok of all) if (!sets.every((s) => s.has(tok))) out.push(tok);
  return out.sort();
}

/** attrs keys whose value differs across the cluster's products (sparse attrs - a missing key reads as
 *  null, so "only one product has state" also counts as differing). Reported as "attrs.<key>". */
export function differingAttrKeys(attrsList) {
  const keys = new Set(attrsList.flatMap((a) => Object.keys(a ?? {})));
  const out = [];
  for (const k of keys) {
    const vals = new Set(attrsList.map((a) => JSON.stringify(a?.[k] ?? null)));
    if (vals.size > 1) out.push(`attrs.${k}`);
  }
  return out.sort();
}

/** The gtin with the most served/sold chains wins as canonical (ties broken by the smaller gtin string, for
 *  determinism); `impact` is how many SERVED_CHAINS currently show no price at the canonical but DO show one
 *  at some other gtin in the cluster - the chains that would gain a price if the cluster were merged. */
export function computeImpact(gtins, pricesByGtin, servedChains = SERVED_CHAINS) {
  let canonical = null;
  let canonicalCount = -1;
  for (const g of gtins) {
    const count = pricesByGtin.get(g)?.size ?? 0;
    if (count > canonicalCount || (count === canonicalCount && (canonical === null || g < canonical))) {
      canonical = g;
      canonicalCount = count;
    }
  }
  const canonicalChains = pricesByGtin.get(canonical) ?? new Map();
  let impact = 0;
  for (const chain of servedChains) {
    if (canonicalChains.has(chain)) continue;
    if (gtins.some((g) => g !== canonical && pricesByGtin.get(g)?.has(chain))) impact++;
  }
  return { impact, canonical };
}

const BRANDS_PATH = path.join(ROOT, 'config', 'products', 'brands.json');
let reviewedBrands = null;
function reviewedBrand(gtin) {
  if (!reviewedBrands) { try { reviewedBrands = JSON.parse(readFileSync(BRANDS_PATH, 'utf8')).brands ?? {}; } catch { reviewedBrands = {}; } }
  return reviewedBrands[gtin]?.brand ?? null;
}
/** The chains' brand field when it reads as a brand or a maker, not a filler, a company line or an address. */
const NOT_A_BRAND = /^(,|-|לא ידוע|כללי|unknown|n\/a|none)$|בע"?מ|בעמ|\bltd\b|\binc\b|\bco\.|s\.a\.|\d{4,}|רח'|רחוב/i;
export function cleanBrand(b) { const s = String(b ?? '').trim(); return s && !NOT_A_BRAND.test(s) && s.length <= 30 ? s : null; }
const normBrand = (b) => String(b ?? '').replace(/["'״׳.,\-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Naor's rule (4.10): a different brand is a different product, and so is a different quantity; unit spellings are
 *  one word; one other differing word needs a look. Returns { verdict: 'different'|'same'|'review', reason }. */
export function ruleVerdict(products, differing) {
  // Naor, 4.10: a chain that lists two of these barcodes itself knows them as two products (colour, edition, pack).
  const perChain = new Map();
  for (const p of products) for (const c of p.chains ?? []) perChain.set(c.chain, (perChain.get(c.chain) ?? 0) + 1);
  const both = [...perChain].filter(([, n]) => n > 1).map(([c]) => c);
  if (both.length) return { verdict: 'different', reason: 'אותה רשת מוכרת שני ברקודים: ' + both.join(', ') };
  const brands = products.map((p) => normBrand(p.brand)).filter(Boolean);
  if (new Set(brands).size > 1) return { verdict: 'different', reason: 'מותג שונה: ' + [...new Set(products.map((p) => p.brand).filter(Boolean))].join(' / ') };
  const sizes = products.map((p) => p.rawSize).filter((s) => s && s.unit);
  const keys = new Set(sizes.map((s) => `${s.value * (s.count ?? 1)}|${s.unit}`));
  if (keys.size > 1) return { verdict: 'different', reason: 'כמות שונה: ' + products.map((p) => p.size).filter(Boolean).join(' / ') };
  if (!differing.length && brands.length === products.length && new Set(brands).size === 1) return { verdict: 'same', reason: 'אותו מותג ואין מילה שונה' };
  // Naor, 4.10, after a look at the list: names that agree word for word are the same product even when no brand is
  // known - the import still refuses the alias if a brand lookup later shows two brands (scripts/same-product-review-import.mjs).
  if (!differing.length) return { verdict: 'same', reason: 'אין מילה שונה (מותג לא ידוע)' };
  return { verdict: 'review', reason: 'מילים שונות: ' + differing.join(', ') };
}

function productEntry(gtin, product, pricesByGtin) {
  const chainsMap = pricesByGtin.get(gtin) ?? new Map();
  const chains = [...chainsMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chain, info]) => ({ chain, name: info.name, price: info.price }));
  return {
    gtin,
    name: product?.name ?? gtin,
    chains,
    size: describeSize(product?.size ?? null),
    rawSize: product?.size ?? null,
    brand: reviewedBrand(gtin) ?? cleanBrand(product?.brand),
    attrs: product?.attrs ?? {},
  };
}

/** True when ANY two gtins of this identity cluster were both named in one not-aliases.json entry - Naor
 *  already said "שונה" for at least that pairing, so the whole cluster (not just that one pair) is dropped
 *  rather than reshaped around a rejected member. */
function clusterBlockedByNotAliases(gtins, notAliases) {
  for (let i = 0; i < gtins.length; i++) for (let j = i + 1; j < gtins.length; j++) if (isBlockedPair(gtins[i], gtins[j], notAliases)) return true;
  return false;
}

/** Turns one scripts/identity-merge.mjs cluster (already fully formed - a gtin set, a verdict, its own
 *  `differing`/`impact`) into this page's review-cluster shape. `differing`/`impact` are carried over
 *  AS-IS (not recomputed - they already came from the exact same differingTokens/differingAttrKeys/
 *  computeImpact this file uses for its own alias-candidate/queue-sourced clusters, see
 *  scripts/identity-merge.mjs), and each product's raw `size` is rendered to the same Hebrew text
 *  describeSize() gives every other cluster on the page, so identity-sourced and candidate-sourced
 *  clusters are visually indistinguishable to Naor - only the `tier` chip differs. */
function identityClusterToReviewCluster(cluster) {
  const tier = cluster.verdict === 'auto' ? 'identity-auto' : 'identity-review';
  return {
    id: cluster.id,
    gtins: cluster.gtins,
    tier,
    products: (cluster.products ?? []).map((p) => ({ gtin: p.gtin, name: p.name, chains: p.chains ?? [], size: describeSize(p.size ?? null), rawSize: p.size ?? null, brand: reviewedBrand(p.gtin) ?? cleanBrand(p.brand), attrs: p.attrs ?? {} })),
    differing: [...(cluster.differing?.words ?? []), ...(cluster.differing?.attrs ?? [])],
    impact: cluster.impact ?? 0,
  };
}

/** Two products whose chain names agree on every content word (digits included, prefix-tolerant) - the products
 *  session's screen from scripts/alias-candidates.mjs, minus its chain-count condition. On 4.10 the identity step's
 *  "review" clusters were mostly a spice shelf: Mimon oregano with Rami Levy oregano with Shufersal oregano, same
 *  concept, same 40 g, no brand the lexicon knew - different products, and the words say so. Here an identity cluster is
 *  split into components whose names agree, so Naor sees only pairs the words cannot tell apart. */
export function namesAgree(a, b) {
  const wa = contentWords([a.name, ...(a.chains ?? []).map((c) => c.name).filter(Boolean)]);
  const wb = contentWords([b.name, ...(b.chains ?? []).map((c) => c.name).filter(Boolean)]);
  for (const w of wa) if (!covered(w, wb)) return false;
  for (const w of wb) if (!covered(w, wa)) return false;
  return true;
}

/** Splits a cluster's products into the components in which every member's names agree with another's. */
export function splitByNames(products, max = 8) {
  const parent = products.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < products.length; i++) for (let j = i + 1; j < products.length; j++) if (namesAgree(products[i], products[j])) parent[find(i)] = find(j);
  const groups = new Map();
  products.forEach((p, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)).push(p); });
  return [...groups.values()].filter((g) => g.length >= 2 && g.length <= max);
}

export function buildReviewClusters({ products, pricesByGtin, candidateData, queueItems, notAliases, identityClusters = [] }) {
  const productsByGtin = new Map(products.map((p) => [p.gtin, p]));
  let edges = [...edgesFromCandidates(candidateData), ...edgesFromQueue(queueItems)];
  edges = edges.filter((e) => !isBlockedPair(e.a, e.b, notAliases));

  const clusters = [];
  // Identity clusters come pre-formed (scripts/identity-merge.mjs already decided membership from a
  // stricter, attrs/price/screen-aware search) - kept standalone rather than fed into the plain
  // name/prefix union-find below, so a looser alias-candidates edge can never dilute or re-tier a cluster
  // the identity step already reasoned about.
  for (const c of identityClusters) {
    const validGtins = (c.gtins ?? []).filter((g) => productsByGtin.has(g));
    if (validGtins.length < 2) continue;
    if (clusterBlockedByNotAliases(validGtins, notAliases)) continue;
    const whole = identityClusterToReviewCluster({ ...c, gtins: validGtins });
    const parts = splitByNames(whole.products);
    // Unsplit (every member's names agree): the identity step's own id, differing and impact are kept as-is.
    if (parts.length === 1 && parts[0].length === whole.products.length) { clusters.push(whole); continue; }
    for (const part of parts) {
      const gtins = part.map((p) => p.gtin);
      const { impact } = computeImpact(gtins, pricesByGtin);
      clusters.push({ ...whole, id: clusterId(gtins), gtins, products: part, differing: [...differingTokens(part.map((p) => p.name)), ...differingAttrKeys(part.map((p) => p.attrs))], impact });
    }
  }
  for (const { gtins, tier } of buildClusters(edges)) {
    const validGtins = gtins.filter((g) => productsByGtin.has(g));
    if (validGtins.length < 2) continue; // need at least two known products to review as a cluster
    const productEntries = validGtins.map((g) => productEntry(g, productsByGtin.get(g), pricesByGtin));
    const differing = [
      ...differingTokens(productEntries.map((p) => p.name)),
      ...differingAttrKeys(productEntries.map((p) => p.attrs)),
    ];
    const { impact } = computeImpact(validGtins, pricesByGtin);
    clusters.push({ id: clusterId(validGtins), gtins: validGtins, tier, products: productEntries, differing, impact });
  }
  clusters.sort((a, b) => b.impact - a.impact || TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.id.localeCompare(b.id));
  return clusters;
}

/** Strips each cluster down to {id, gtins, tier, products:[{gtin, name, chains:[{chain, price}], size, attrs}],
 *  differing, impact} - same identifying fields, but each chain entry drops the chain's own (often near-
 *  duplicate) raw name text, which is most of what made the full file big. Caps at `max` clusters, by the
 *  same impact-desc order the full file is already sorted in, so what's cut is always the lowest-impact tail. */
export function toMinClusters(clusters, max = MAX_MIN_CLUSTERS) {
  const kept = clusters.slice(0, max);
  const minified = kept.map((c) => ({
    id: c.id,
    gtins: c.gtins,
    tier: c.tier,
    products: c.products.map((p) => ({
      gtin: p.gtin,
      name: p.name,
      chains: p.chains.map(({ chain, price }) => ({ chain, price })),
      size: p.size,
      attrs: p.attrs,
      ...(p.webBrand ? { webBrand: p.webBrand } : {}),
      ...(p.brand ? { brand: p.brand } : {}),
    })),
    differing: c.differing,
    impact: c.impact,
    ...(c.rule ? { rule: c.rule } : {}),
    ...(c.web ? { web: { verdict: c.web.verdict, members: c.web.members.map(({ gtin, webName, brand }) => ({ gtin, webName, brand })) } } : {}),
  }));
  return { minified, truncated: clusters.length > max };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Web verdicts (data/local/same-product-web.json, written by a read-only lookup of chp.co.il / cheapersal.co.il per
 *  barcode, 4.10): a suggestion shown beside the cluster with each member's web name and brand. Matched by cluster id,
 *  else by the gtin set. Never decides anything. */
export function loadWebVerdicts(filePath = path.join(OUT_DIR, 'same-product-web.json')) {
  if (!existsSync(filePath)) return { byId: new Map(), byGtins: new Map(), brands: new Map() };
  const j = JSON.parse(readFileSync(filePath, 'utf8'));
  const byId = new Map(), byGtins = new Map(), brands = new Map();
  for (const c of j.clusters ?? []) {
    const web = { verdict: c.verdict, members: (c.evidence?.members ?? []).map((m) => ({ gtin: m.gtin, webName: m.webName ?? null, brand: m.brand ?? null, url: m.url ?? null, found: !!m.found })), decidingWords: c.evidence?.decidingWords ?? [] };
    byId.set(c.id, web); byGtins.set([...c.gtins].sort().join('|'), web);
  }
  for (const b of j.brands ?? []) if (b.gtin && b.brand) brands.set(b.gtin, b.brand);
  return { byId, byGtins, brands };
}

/** Naor, 4.10: a generic good from two packers or two bakeries ("חלה רגילה" of ברמן and of another bakery, peeled
 *  garlic from two packers) is a substitute, not the same product. A web "same" stands only when every found member
 *  carries a brand and the brands agree; two brands that differ are "different"; a member with no brand is "unsure". */
export function brandedVerdict(w) {
  if (w.verdict !== 'same') return w.verdict;
  const found = (w.members ?? []).filter((m) => m.found);
  if (!found.length) return 'unsure';
  const norm = (b) => String(b ?? '').replace(/["'״׳.,\-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const brands = found.map((m) => norm(m.brand));
  if (brands.some((b) => !b)) return 'unsure';
  return new Set(brands).size === 1 ? 'same' : 'different';
}

export function attachWebVerdicts(clusters, web) {
  for (const c of clusters) {
    const w = web.byId.get(c.id) ?? web.byGtins.get([...c.gtins].sort().join('|'));
    if (w) c.web = { ...w, rawVerdict: w.verdict, verdict: brandedVerdict(w) };
    for (const p of c.products) { const b = web.brands.get(p.gtin); if (b) { p.webBrand = b; p.brand = b; } }
  }
  return clusters;
}

/** Applies ruleVerdict to every cluster: 'different' clusters leave the review list (Naor never sees them; they are
 *  written aside), 'same' and 'review' stay with the suggestion on the cluster. */
export function applyRule(clusters) {
  const review = [], different = [];
  for (const c of clusters) {
    c.differing = [...differingTokens(c.products.map((p) => p.name)), ...differingAttrKeys(c.products.map((p) => p.attrs))];
    c.rule = ruleVerdict(c.products, c.differing);
    if (c.web?.verdict === 'different' && c.rule.verdict !== 'different') c.rule = { verdict: 'different', reason: 'לפי הרשת: ' + (c.web.decidingWords ?? []).join(', ') };
    (c.rule.verdict === 'different' ? different : review).push(c);
  }
  const order = { same: 0, review: 1 };
  review.sort((a, b) => order[a.rule.verdict] - order[b.rule.verdict] || b.impact - a.impact);
  return { review, different };
}

/** One row per cluster id: the identity step and the alias candidates can produce the same gtin set under two tiers. */
export function dedupeClusters(clusters) {
  const seen = new Set();
  return clusters.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

function run() {
  const products = loadProducts();
  const pricesByGtin = loadCatalogPrices();
  const candidateData = loadAliasCandidates();
  const queue = loadReviewQueue();
  const notAliases = loadNotAliases();
  const identityClusters = loadIdentityClusters();

  const all = attachWebVerdicts(dedupeClusters(buildReviewClusters({ products, pricesByGtin, candidateData, queueItems: queue.items, notAliases, identityClusters })), loadWebVerdicts());
  const { review: clusters, different } = applyRule(all);
  writeFileSync(path.join(OUT_DIR, 'same-product-auto-different.json'), JSON.stringify({ generatedAt: new Date().toISOString(), count: different.length, clusters: different.map((c) => ({ id: c.id, gtins: c.gtins, reason: c.rule.reason, names: c.products.map((p) => p.name) })) }, null, 1) + '\n');
  console.log(`rule: ${different.length} clusters are different by brand or quantity (set aside), ${clusters.filter((c) => c.rule.verdict === 'same').length} suggested same, ${clusters.filter((c) => c.rule.verdict === 'review').length} need a look`);

  const byTier = {};
  for (const c of clusters) byTier[c.tier] = (byTier[c.tier] ?? 0) + 1;

  mkdirSync(OUT_DIR, { recursive: true });

  const generatedAt = new Date().toISOString();
  const full = { version: 1, generatedAt, count: clusters.length, byTier, clusters };
  writeFileSync(path.join(OUT_DIR, 'same-product-review.json'), JSON.stringify(full, null, 1) + '\n');

  const { minified, truncated } = toMinClusters(clusters, MAX_MIN_CLUSTERS);
  const min = {
    version: 1,
    generatedAt,
    totalClusters: clusters.length,
    includedClusters: minified.length,
    truncated,
    byTier,
    clusters: minified,
  };
  const minPath = path.join(OUT_DIR, 'same-product-review.min.json');
  const minJson = JSON.stringify(min);
  writeFileSync(minPath, minJson);
  const minMb = Buffer.byteLength(minJson) / (1024 * 1024);

  console.log(`same-product review: ${clusters.length} clusters (${Object.entries(byTier).map(([t, n]) => `${t} ${n}`).join(', ') || 'none'})`);
  console.log(`  full: data/local/same-product-review.json`);
  console.log(`  min:  data/local/same-product-review.min.json - ${minified.length} clusters, ${minMb.toFixed(2)} MB${truncated ? ` (capped at top ${MAX_MIN_CLUSTERS} by impact, ${clusters.length - MAX_MIN_CLUSTERS} left out)` : ''}`);
  if (minMb > 3) console.error(`warn: min file is ${minMb.toFixed(2)} MB, over the 3 MB the review page was sized for`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) run();

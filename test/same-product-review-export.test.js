import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClusters, clusterId, computeImpact, differingTokens, differingAttrKeys,
  edgesFromCandidates, edgesFromQueue, gtinTokensIn, isBlockedPair, toMinClusters, buildReviewClusters,
  SERVED_CHAINS, MAX_MIN_CLUSTERS,
} from '../scripts/same-product-review-export.mjs';

// 13-digit gtins with no particular check-digit requirement (isGtin only checksums 11-digit codes).
const A = '7290000000001';
const B = '7290000000002';
const C = '7290000000003';
const D = '7290000000004';

// --- clustering -------------------------------------------------------------

test('buildClusters: a chain of pairs (A-B, B-C) becomes one 3-member cluster, not two', () => {
  const clusters = buildClusters([{ a: A, b: B, tier: 'weak' }, { a: B, b: C, tier: 'weak' }]);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].gtins, [A, B, C].sort());
});

test('buildClusters: unrelated pairs stay separate clusters', () => {
  const clusters = buildClusters([{ a: A, b: B, tier: 'weak' }, { a: C, b: D, tier: 'weak' }]);
  assert.equal(clusters.length, 2);
});

test('buildClusters: a cluster\'s tier is the best (lowest-rank) tier among its edges - one strong pair wins even inside an otherwise weak chain', () => {
  const clusters = buildClusters([{ a: A, b: B, tier: 'weak' }, { a: B, b: C, tier: 'strong' }]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].tier, 'strong');
});

test('buildClusters: a self-pair or a missing side is dropped, not a one-member cluster', () => {
  assert.deepEqual(buildClusters([{ a: A, b: A, tier: 'weak' }, { a: null, b: B, tier: 'weak' }]), []);
});

test('clusterId is stable regardless of input order', () => {
  assert.equal(clusterId([A, B, C]), clusterId([C, A, B]));
  assert.notEqual(clusterId([A, B]), clusterId([A, C]));
});

// --- pairs from candidates / queue / not-aliases -----------------------------

test('edgesFromCandidates reads all three tiers', () => {
  const data = { strong: [{ gtinA: A, gtinB: B }], variant: [{ gtinA: B, gtinB: C }], weak: [{ gtinA: C, gtinB: D }] };
  const edges = edgesFromCandidates(data);
  assert.deepEqual(edges.map((e) => e.tier).sort(), ['strong', 'variant', 'weak']);
});

test('gtinTokensIn only keeps digit runs that pass isGtin (drops a 5-digit code, a date, a price)', () => {
  const text = `ברקוד ${A} וגם ${B}, לא 12345 ולא תאריך 20260101 כמחיר`;
  const found = gtinTokensIn(text);
  assert.ok(found.includes(A) && found.includes(B));
  assert.ok(!found.includes('12345'));
});

test('edgesFromQueue: a same-product check names another gtin in its detail/suggestion text -> one edge back to the item\'s own gtin', () => {
  const items = [
    { id: `g${A}`, checks: [{ rule: 'same-product', priority: 'high', detail: `כנראה אותו מוצר כמו ${B}`, suggestion: 'לבדוק' }] },
    { id: `g${C}`, checks: [{ rule: 'department-contradiction', detail: 'לא קשור' }] }, // no same-product rule -> ignored
  ];
  const edges = edgesFromQueue(items);
  assert.deepEqual(edges, [{ a: A, b: B, tier: 'queue' }]);
});

test('edgesFromQueue ignores an item with a malformed id (no "g" prefix / not a gtin)', () => {
  assert.deepEqual(edgesFromQueue([{ id: 'not-a-gtin-id', checks: [{ rule: 'same-product', detail: B }] }]), []);
});

test('isBlockedPair: true only when both gtins appear together in one not-aliases entry', () => {
  const notAliases = [{ gtins: [A, B], why: 'שונה', since: '2026-10-03' }];
  assert.equal(isBlockedPair(A, B, notAliases), true);
  assert.equal(isBlockedPair(B, A, notAliases), true);
  assert.equal(isBlockedPair(A, C, notAliases), false);
});

// --- impact -------------------------------------------------------------------

test('computeImpact: the gtin with the most chains is canonical; impact counts only SERVED_CHAINS the canonical lacks but another cluster member has', () => {
  const pricesByGtin = new Map([
    [A, new Map([['shufersal', { price: 1 }], ['ramilevy', { price: 1 }]])], // 2 chains -> canonical
    [B, new Map([['carrefour', { price: 1 }], ['someUnservedChain', { price: 1 }]])], // 1 served chain the canonical lacks
  ]);
  const { impact, canonical } = computeImpact([A, B], pricesByGtin);
  assert.equal(canonical, A);
  assert.equal(impact, 1); // only carrefour counts; someUnservedChain is not in SERVED_CHAINS
});

test('computeImpact: zero when the canonical already covers every served chain the others have', () => {
  const pricesByGtin = new Map([
    [A, new Map(SERVED_CHAINS.map((c) => [c, { price: 1 }]))],
    [B, new Map([['shufersal', { price: 1 }]])],
  ]);
  assert.equal(computeImpact([A, B], pricesByGtin).impact, 0);
});

test('computeImpact: ties on chain count break on the smaller gtin string, deterministically', () => {
  const pricesByGtin = new Map([[A, new Map([['shufersal', { price: 1 }]])], [B, new Map([['ramilevy', { price: 1 }]])]]);
  assert.equal(computeImpact([B, A], pricesByGtin).canonical, A);
});

// --- differing ------------------------------------------------------------------

test('differingTokens: a word present in every name is not differing; a word missing from even one name is', () => {
  const out = differingTokens(['קוקה קולה זירו 1.5 ליטר', 'קוקה קולה דיאט 1.5 ליטר']);
  assert.ok(out.includes('זירו'));
  assert.ok(out.includes('דיאט'));
  assert.ok(!out.includes('קולה'));
});

test('differingAttrKeys: flags a key whose value differs, including present-vs-missing', () => {
  const out = differingAttrKeys([{ state: 'fresh' }, { state: 'frozen' }, {}]);
  assert.deepEqual(out, ['attrs.state']);
});

test('differingAttrKeys: a key with the same value everywhere (including arrays) is not differing', () => {
  assert.deepEqual(differingAttrKeys([{ diet: ['sugar-free'] }, { diet: ['sugar-free'] }]), []);
});

// --- min file cap -----------------------------------------------------------------

test('toMinClusters: caps at `max`, flags truncated, and keeps the lowest-impact tail out (input already impact-sorted)', () => {
  const clusters = [
    { id: '1', gtins: [A, B], tier: 'strong', products: [{ gtin: A, name: 'x', chains: [{ chain: 'shufersal', name: 'x', price: 1 }], size: '', attrs: {} }], differing: [], impact: 5 },
    { id: '2', gtins: [B, C], tier: 'weak', products: [{ gtin: B, name: 'y', chains: [], size: '', attrs: {} }], differing: [], impact: 2 },
    { id: '3', gtins: [C, D], tier: 'weak', products: [{ gtin: C, name: 'z', chains: [], size: '', attrs: {} }], differing: [], impact: 1 },
  ];
  const { minified, truncated } = toMinClusters(clusters, 2);
  assert.equal(truncated, true);
  assert.deepEqual(minified.map((c) => c.id), ['1', '2']);
  // chain entries drop the chain's own name but keep chain id + price
  assert.deepEqual(minified[0].products[0].chains, [{ chain: 'shufersal', price: 1 }]);
});

test('toMinClusters: not truncated when everything fits under the cap', () => {
  const clusters = [{ id: '1', gtins: [A, B], tier: 'weak', products: [], differing: [], impact: 1 }];
  const { truncated } = toMinClusters(clusters, MAX_MIN_CLUSTERS);
  assert.equal(truncated, false);
});

// --- end-to-end buildReviewClusters -------------------------------------------------

test('buildReviewClusters: sorts by impact desc, drops a not-aliases-blocked pair, drops a cluster with fewer than 2 known products', () => {
  const products = [
    { gtin: A, name: 'מוצר א', size: null, attrs: {} },
    { gtin: B, name: 'מוצר א', size: null, attrs: {} },
    { gtin: C, name: 'מוצר ג', size: null, attrs: {} },
    // D has a candidate pair with an UNKNOWN gtin, so its cluster never reaches 2 known products.
  ];
  const pricesByGtin = new Map([
    [A, new Map([['shufersal', { price: 1, name: 'מוצר א' }]])],
    [B, new Map([['ramilevy', { price: 1, name: 'מוצר א' }], ['carrefour', { price: 1, name: 'מוצר א' }]])],
    [C, new Map([['shufersal', { price: 2, name: 'מוצר ג' }]])],
  ]);
  const candidateData = { strong: [{ gtinA: A, gtinB: B }], variant: [], weak: [{ gtinA: C, gtinB: 'unknown-gtin-not-in-products' }] };
  const clusters = buildReviewClusters({ products, pricesByGtin, candidateData, queueItems: [], notAliases: [] });
  assert.equal(clusters.length, 1); // the C/unknown pair never forms a reviewable cluster
  assert.deepEqual(clusters[0].gtins, [A, B].sort());
  assert.ok(clusters[0].impact >= 1);

  const blocked = buildReviewClusters({ products, pricesByGtin, candidateData, queueItems: [], notAliases: [{ gtins: [A, B], why: 'שונה', since: '2026-10-03' }] });
  assert.equal(blocked.length, 0);
});

// --- identity clusters (scripts/identity-merge.mjs, docs/ALIASES.md) ----------------------------------------

test('buildReviewClusters: an identity cluster is tiered identity-auto/identity-review AHEAD of strong, carries its own differing/impact as-is, and is kept standalone from alias-candidate edges', () => {
  const products = [
    { gtin: A, name: 'מוצר א', size: { value: 100, unit: 'g', count: 1 }, attrs: { container: 'bottle' } },
    { gtin: B, name: 'מוצר א', size: { value: 100, unit: 'g', count: 1 }, attrs: { container: 'bottle' } },
  ];
  const pricesByGtin = new Map([
    [A, new Map([['shufersal', { price: 1, name: 'מוצר א' }]])],
    [B, new Map([['ramilevy', { price: 1, name: 'מוצר א' }]])],
  ]);
  const identityClusters = [{
    id: 'identityabc123', gtins: [A, B], verdict: 'auto', failing: [],
    differing: { words: ['מילה'], attrs: [] }, impact: 7,
    products: [
      { gtin: A, name: 'מוצר א', chains: [{ chain: 'shufersal', name: 'מוצר א', price: 1 }], size: { value: 100, unit: 'g', count: 1 }, attrs: { container: 'bottle' } },
      { gtin: B, name: 'מוצר א', chains: [{ chain: 'ramilevy', name: 'מוצר א', price: 1 }], size: { value: 100, unit: 'g', count: 1 }, attrs: { container: 'bottle' } },
    ],
  }];
  const clusters = buildReviewClusters({ products, pricesByGtin, candidateData: { strong: [], variant: [], weak: [] }, queueItems: [], notAliases: [], identityClusters });
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].tier, 'identity-auto');
  assert.equal(clusters[0].id, 'identityabc123', 'the id from scripts/identity-merge.mjs is reused, not recomputed');
  assert.deepEqual(clusters[0].differing, ['מילה'], 'carried over as-is, not recomputed from names/attrs here');
  assert.equal(clusters[0].impact, 7, 'carried over as-is');
  assert.match(clusters[0].products[0].size, /100/, 'raw size rendered to the same Hebrew text as every other cluster');
});

test('buildReviewClusters: an identity-review verdict tiers below identity-auto but still above strong/queue/variant/weak, and a not-aliases match drops the whole identity cluster', () => {
  const products = [
    { gtin: A, name: 'מוצר א', size: null, attrs: {} },
    { gtin: B, name: 'מוצר ב', size: null, attrs: {} },
    { gtin: C, name: 'מוצר ג', size: null, attrs: {} },
    { gtin: D, name: 'מוצר ד', size: null, attrs: {} },
  ];
  const pricesByGtin = new Map([
    [A, new Map([['shufersal', { price: 1, name: 'מוצר א' }]])],
    [B, new Map([['ramilevy', { price: 1, name: 'מוצר ב' }]])],
    [C, new Map([['shufersal', { price: 1, name: 'מוצר ג' }]])],
    [D, new Map([['ramilevy', { price: 1, name: 'מוצר ד' }]])],
  ]);
  const candidateData = { strong: [{ gtinA: C, gtinB: D }], variant: [], weak: [] };
  const identityClusters = [{
    id: 'identityreview1', gtins: [A, B], verdict: 'review', failing: ['attrs'],
    differing: { words: [], attrs: [] }, impact: 1,
    products: [
      { gtin: A, name: 'מוצר א', chains: [{ chain: 'shufersal', name: 'מוצר א', price: 1 }], size: null, attrs: {} },
      { gtin: B, name: 'מוצר ב', chains: [{ chain: 'ramilevy', name: 'מוצר ב', price: 1 }], size: null, attrs: {} },
    ],
  }];
  const clusters = buildReviewClusters({ products, pricesByGtin, candidateData, queueItems: [], notAliases: [], identityClusters });
  assert.equal(clusters.length, 2);
  const byTier = Object.fromEntries(clusters.map((c) => [c.tier, c]));
  assert.ok(byTier['identity-review']);
  assert.equal(byTier.strong.tier, 'strong');
  // Both clusters have impact 1 (C/D's own computed impact also happens to be 1 - merging gives either
  // side the other's served chain) - the tie falls back to TIER_RANK, so identity-review must sort first.
  assert.equal(byTier.strong.impact, 1, 'sanity: the two clusters really do tie on impact here');
  assert.equal(clusters[0].tier, 'identity-review');

  const blocked = buildReviewClusters({ products, pricesByGtin, candidateData, queueItems: [], notAliases: [{ gtins: [A, B], why: 'שונה', since: '2026-10-03' }], identityClusters });
  assert.equal(blocked.some((c) => c.tier.startsWith('identity')), false, 'a not-aliases match on any pair drops the whole identity cluster');
});

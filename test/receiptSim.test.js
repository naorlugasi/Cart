import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, generateBaskets, buildBasket, classifyResult, BUCKETS, ONLINE_CHAIN_IDS,
} from '../scripts/receipt-sim.mjs';
import { LINE_STATUS } from '../src/pricing/compare.js';

/** Toy pools: enough weighed + non-weighed ids per bucket, per chain, to exercise buildBasket/generateBaskets
 * without touching the real (concurrently-edited) data/ catalogs. */
function toyPools(chainIds) {
  const pools = {};
  for (const chainId of chainIds) {
    const byBucket = {};
    for (const b of BUCKETS) {
      byBucket[b] = {
        weighed: Array.from({ length: 10 }, (_, i) => `${chainId}-${b}-w${i}`),
        nonWeighed: Array.from({ length: 40 }, (_, i) => `${chainId}-${b}-n${i}`),
      };
    }
    pools[chainId] = byBucket;
  }
  return pools;
}

function toyProductsById(chainIds) {
  const map = new Map();
  for (const chainId of chainIds) {
    for (const b of BUCKETS) {
      for (let i = 0; i < 10; i++) map.set(`${chainId}-${b}-w${i}`, { id: `${chainId}-${b}-w${i}`, isWeighted: true, category: b, conceptId: `${b}-${i}` });
      for (let i = 0; i < 40; i++) map.set(`${chainId}-${b}-n${i}`, { id: `${chainId}-${b}-n${i}`, isWeighted: false, category: b, conceptId: `${b}-n${i}` });
    }
  }
  return map;
}

test('generateBaskets is deterministic for a given seed (same baskets, same order, same qty)', () => {
  const chainIds = ONLINE_CHAIN_IDS;
  const pools = toyPools(chainIds);
  const productsById = toyProductsById(chainIds);
  const a = generateBaskets({ n: 25, seed: 1234, pools, productsById, chainIds });
  const b = generateBaskets({ n: 25, seed: 1234, pools, productsById, chainIds });
  assert.deepEqual(a, b, 'identical seed must produce byte-identical baskets');

  const c = generateBaskets({ n: 25, seed: 5678, pools, productsById, chainIds });
  assert.notDeepEqual(a, c, 'a different seed should (almost certainly) produce different baskets');
});

test('every basket has 25-40 lines, 3-6 weighed lines, qty in range, and rotates the home chain', () => {
  const chainIds = ONLINE_CHAIN_IDS;
  const pools = toyPools(chainIds);
  const productsById = toyProductsById(chainIds);
  const baskets = generateBaskets({ n: 20, seed: 99, pools, productsById, chainIds });
  assert.equal(baskets.length, 20);
  baskets.forEach((basket, i) => {
    assert.equal(basket.homeChain, chainIds[i % chainIds.length], 'home chain rotates round-robin');
    assert.ok(basket.lines.length >= 25 && basket.lines.length <= 40, `basket ${i} has ${basket.lines.length} lines`);
    const weighedCount = basket.lines.filter((l) => productsById.get(l.productId).isWeighted).length;
    assert.ok(weighedCount >= 0 && weighedCount <= 6, `basket ${i} has ${weighedCount} weighed lines (target is 3-6, pool-limited)`);
    for (const l of basket.lines) {
      assert.ok(l.qty > 0, 'qty is positive');
      const product = productsById.get(l.productId);
      if (product.isWeighted) assert.ok(l.qty >= 0.3 && l.qty <= 2.0, `weighed qty ${l.qty} out of range`);
      else assert.ok(l.qty >= 1 && l.qty <= 3, `unit qty ${l.qty} out of range`);
    }
  });
});

test('buildBasket never draws the same product twice within one basket', () => {
  const chainIds = ONLINE_CHAIN_IDS;
  const pools = toyPools(chainIds);
  const productsById = toyProductsById(chainIds);
  const rng = mulberry32(7);
  const basket = buildBasket({ rng, homeChain: 'shufersal', pools, productsById });
  const ids = basket.lines.map((l) => l.productId);
  assert.equal(ids.length, new Set(ids).size, 'no duplicate productId within a basket');
});

/** A minimal compareCart-shaped result: one "other" chain row with four lines covering every status. */
function fakeCompareResult({ homeChain = 'shufersal', otherChain = 'ramilevy', deliverable = true } = {}) {
  return {
    rows: [
      { chainId: homeChain, deliverable: true, lines: [{ productId: 'p-home', status: LINE_STATUS.OK, name: 'home', alternative: null }] },
      {
        chainId: otherChain,
        deliverable,
        lines: [
          { productId: 'p1', status: LINE_STATUS.OK, name: 'ok-line', alternative: null },
          { productId: 'p2', status: LINE_STATUS.OK, name: 'ok-with-offer', alternative: { name: 'cheaper alt', caveats: [], reason: 'cheaper', tier: 'concept', savings: 1.5 } },
          { productId: 'p3', status: LINE_STATUS.MISSING, name: 'missing-with-alt', alternative: { name: 'replacement', caveats: ['other-flavour'], reason: 'missing', tier: 'concept', savings: 0 } },
          { productId: 'p4', status: LINE_STATUS.MISSING, name: 'missing-no-alt', alternative: null },
          { productId: 'p5', status: LINE_STATUS.OUT_OF_STOCK, name: 'oos-no-alt', alternative: null },
          { productId: 'p6', status: LINE_STATUS.SUBSTITUTED, name: 'customer-pick', alternative: null },
        ],
      },
    ],
  };
}

test('classifyResult: every line lands in exactly one bucket and the counts add up to the total', () => {
  const result = fakeCompareResult();
  const basket = { id: 0, homeChain: 'shufersal' };
  const mapping = { productsById: new Map([['p4', { conceptId: null }], ['p5', { conceptId: 'c1' }]]) };
  const agg = {};
  const offerSink = [];
  const noAltSink = [];
  classifyResult({ result, basket, policy: 'cheapest', mapping, productsById: mapping.productsById, agg, offerSink, noAltSink });

  // the home chain's row must never be counted
  assert.equal(agg.shufersal, undefined, 'home chain row is excluded from the aggregate');

  const a = agg.ramilevy.cheapest;
  assert.equal(a.total, 6, 'all 6 lines of the other-chain row were classified');
  assert.equal(a.ok + a.substituted + a['missing-with-alternative'] + a['missing-no-alternative'], a.total, 'the four buckets partition every line');
  assert.equal(a.ok, 2, 'two ok lines (one plain, one with a bonus cheaper offer)');
  assert.equal(a.okWithCheaperOffer, 1);
  assert.equal(a.substituted, 1);
  assert.equal(a['missing-with-alternative'], 1);
  assert.equal(a['missing-no-alternative'], 2, 'missing + out-of-stock both without an alternative');

  // offers collected: the ok-with-offer line and the missing-with-alt line, not the plain ok/missing/oos/substituted ones
  assert.equal(offerSink.length, 2);
  assert.ok(offerSink.some((o) => o.original === 'ok-with-offer'));
  assert.ok(offerSink.some((o) => o.original === 'missing-with-alt'));

  // no-alternative sink: p4 (no concept at all) and p5 (has a conceptId)
  assert.equal(noAltSink.length, 2);
  const p4Entry = noAltSink.find((e) => e.name === 'missing-no-alt');
  assert.deepEqual(p4Entry.reasons, ['no-concept'], 'a product with no conceptId gets the no-concept reason without touching evaluateSubstitutes');
});

test('classifyResult skips a non-deliverable other-chain row entirely', () => {
  const result = fakeCompareResult({ deliverable: false });
  const basket = { id: 0, homeChain: 'shufersal' };
  const mapping = { productsById: new Map() };
  const agg = {};
  classifyResult({ result, basket, policy: 'cheapest', mapping, productsById: mapping.productsById, agg, offerSink: [], noAltSink: [] });
  assert.equal(agg.ramilevy, undefined);
});

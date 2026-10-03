import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRawGroups, buildIdentityClusters } from '../scripts/identity-merge.mjs';
import { resetVerified } from '../src/catalog/verified.js';

// scripts/identity-merge.mjs (docs/ALIASES.md, "STEP 2" offline restructure, 4.10): reads the ALREADY-
// PUBLISHED data/products.json (conceptId/size/category/attrs already final) + data/catalogs/<chain>.json
// (per-chain name+price) instead of the build-time loadChains()+projectProduct() path - these tests use
// small fixtures shaped exactly like those two real sources.

const A = '7290000000001';
const B = '7290000000002';
const CAT_MAP = (rows) => new Map(Object.entries(rows).map(([gtin, chains]) => [gtin, new Map(Object.entries(chains))]));

test('buildRawGroups: reuses products.json attrs/conceptId/size as-is (no recomputation) and reads conceptIdDecided from verified.json', () => {
  const products = [
    { id: 'g' + A, gtin: A, kind: undefined, isWeighted: false, conceptId: 'cola', size: { value: 1500, unit: 'ml', count: 1 }, category: 'משקאות', attrs: { container: 'bottle' } },
    { id: 'g' + B, gtin: B, kind: 'concept', isWeighted: false, conceptId: null, size: null, category: null, attrs: {} }, // concept products are skipped
  ];
  const catalogPrices = CAT_MAP({ [A]: { shufersal: { price: 8, name: 'קולה' }, ramilevy: { price: 8, name: 'קולה' } } });
  resetVerified(new Map([['g' + A, { conceptId: 'cola', verifiedBy: 'naor', verifiedAt: '2026-01-01' }]]));
  try {
    const groups = buildRawGroups(products, catalogPrices);
    assert.equal(groups.length, 1, 'the concept product is skipped');
    const g = groups[0];
    assert.equal(g.gtin, A);
    assert.deepEqual(g.attrs, { container: 'bottle' }, 'attrs reused as-is from products.json, not recomputed');
    assert.equal(g.conceptIdDecided, true, 'a verified record explicitly carrying conceptId is a decision');
    assert.equal(g.chainPrices.get('shufersal'), 8);
    assert.deepEqual(new Set(g.names), new Set(['קולה']));
  } finally {
    resetVerified(null);
  }
});

test('buildRawGroups: a gtin with no row in data/catalogs/ (stale data) is skipped rather than crashing', () => {
  const products = [{ id: 'g' + A, gtin: A, kind: undefined, isWeighted: false, conceptId: 'cola', size: { value: 1, unit: 'l', count: 1 }, category: 'משקאות', attrs: {} }];
  resetVerified(new Map());
  try {
    assert.deepEqual(buildRawGroups(products, new Map()), []);
  } finally {
    resetVerified(null);
  }
});

test('buildIdentityClusters: a clean pair becomes an "auto" cluster with the published shape; failing/differing/impact are populated for a blocked pair', () => {
  const products = [
    { id: 'g' + A, gtin: A, kind: undefined, isWeighted: false, conceptId: 'cola', size: { value: 1500, unit: 'ml', count: 1 }, category: 'משקאות', name: 'קולה בבקבוק', attrs: { container: 'bottle' } },
    { id: 'g' + B, gtin: B, kind: undefined, isWeighted: false, conceptId: 'cola', size: { value: 1500, unit: 'ml', count: 1 }, category: 'משקאות', name: 'קולה בבקבוק', attrs: { container: 'bottle' } },
  ];
  const catalogPrices = CAT_MAP({
    [A]: { shufersal: { price: 8, name: 'קולה בבקבוק' }, ramilevy: { price: 8, name: 'קולה בבקבוק' } },
    [B]: { shufersal: { price: 8, name: 'קולה בבקבוק' }, carrefour: { price: 8, name: 'קולה בבקבוק' } },
  });
  resetVerified(new Map());
  try {
    const { clusters } = buildIdentityClusters({ products, catalogPrices });
    assert.equal(clusters.length, 1);
    const c = clusters[0];
    assert.equal(c.verdict, 'auto');
    assert.deepEqual(c.failing, []);
    assert.equal(c.gtins.length, 2);
    assert.ok(c.id && typeof c.id === 'string');
    assert.equal(c.products.length, 2);
    assert.ok(Array.isArray(c.products[0].chains));
    assert.ok('price' in c.products[0].chains[0] && 'name' in c.products[0].chains[0]);
  } finally {
    resetVerified(null);
  }
});

test('buildIdentityClusters: a pair that fails on price becomes a "review" cluster with failing: ["price"]', () => {
  const products = [
    { id: 'g' + A, gtin: A, kind: undefined, isWeighted: false, conceptId: 'cola', size: { value: 1500, unit: 'ml', count: 1 }, category: 'משקאות', name: 'קולה בבקבוק', attrs: { container: 'bottle' } },
    { id: 'g' + B, gtin: B, kind: undefined, isWeighted: false, conceptId: 'cola', size: { value: 1500, unit: 'ml', count: 1 }, category: 'משקאות', name: 'קולה בבקבוק', attrs: { container: 'bottle' } },
  ];
  const catalogPrices = CAT_MAP({
    [A]: { shufersal: { price: 8, name: 'קולה בבקבוק' }, ramilevy: { price: 8, name: 'קולה בבקבוק' } },
    [B]: { shufersal: { price: 12, name: 'קולה בבקבוק' }, carrefour: { price: 8, name: 'קולה בבקבוק' } },
  });
  resetVerified(new Map());
  try {
    const { clusters } = buildIdentityClusters({ products, catalogPrices });
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].verdict, 'review');
    assert.deepEqual(clusters[0].failing, ['price']);
  } finally {
    resetVerified(null);
  }
});

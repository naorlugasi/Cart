import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeKinds } from '../scripts/concept-kinds-propose.mjs';
import { normalizeText } from '../src/catalog/matching.js';

/**
 * Toy "oil-olive"-shaped concept: 10 products, two exclusive grade words (כתית מעולה 6x, מזוכך 3x), a brand
 * word (יצהר, 4x) and a unit word (מל) that would otherwise qualify by count, and a size number (750/500/1)
 * that must never qualify at all. שמנ/זית sit in every name (share 1.0 > the 60% cap) so they are filtered
 * out even without being in `exclusions` - the same share-cap a concept's own match words would hit for
 * real, demonstrated here without needing to pass them in.
 */
const PRODUCTS = [
  { gtin: '1', name: 'שמן זית כתית מעולה 750 מל יצהר' },
  { gtin: '2', name: 'שמן זית כתית מעולה 750 מל' },
  { gtin: '3', name: 'שמן זית כתית ספרדי 750 מל יצהר' },
  { gtin: '4', name: 'שמן זית כתית 500 מל' },
  { gtin: '5', name: 'שמן זית כתית פרימיום 750 מל יצהר' },
  { gtin: '6', name: 'שמן זית כתית 1 ליטר' },
  { gtin: '7', name: 'שמן זית מזוכך 750 מל' },
  { gtin: '8', name: 'שמן זית מזוכך לייט 750 מל יצהר' },
  { gtin: '9', name: 'שמן זית מזוכך 1 ליטר' },
  { gtin: '10', name: 'שמן זית 750 מל' },
];

const EXCLUSIONS = new Set([normalizeText('יצהר'), normalizeText('מל'), normalizeText('ליטר')]);

test('proposeKinds: two exclusive grade words survive with the right counts and zero co-occurrence', () => {
  const { totalProducts, candidates, uncovered } = proposeKinds(PRODUCTS, new Map(), EXCLUSIONS);

  assert.equal(totalProducts, 10);
  const tokens = candidates.map((c) => c.token);
  assert.ok(tokens.includes(normalizeText('כתית')), `expected כתית among candidates, got ${tokens.join(', ')}`);
  assert.ok(tokens.includes(normalizeText('מזוכך')), `expected מזוכך among candidates, got ${tokens.join(', ')}`);

  const extraVirgin = candidates.find((c) => c.token === normalizeText('כתית'));
  const refined = candidates.find((c) => c.token === normalizeText('מזוכך'));
  assert.equal(extraVirgin.count, 6);
  assert.equal(refined.count, 3);
  assert.equal(extraVirgin.share, 0.6);
  assert.equal(refined.share, 0.3);

  // zero co-occurrence both ways: no product's names carry both grade words
  assert.equal(extraVirgin.cooccur[normalizeText('מזוכך')] ?? 0, 0);
  assert.equal(refined.cooccur[normalizeText('כתית')] ?? 0, 0);

  // the brand word, the unit words, the size numbers, and the all-products words (שמנ/זית) never qualify
  for (const excluded of ['יצהר', 'מל', 'ליטר', '750', '500', 'שמנ', 'זית']) {
    assert.ok(!tokens.includes(normalizeText(excluded)), `"${excluded}" should not survive as a candidate`);
  }

  // product 10 ("שמן זית 750 מל") carries neither grade word
  assert.equal(uncovered, 1);
});

test('proposeKinds: examples are the shortest full product names carrying the token', () => {
  const { candidates } = proposeKinds(PRODUCTS, new Map(), EXCLUSIONS);
  const extraVirgin = candidates.find((c) => c.token === normalizeText('כתית'));
  assert.ok(extraVirgin.examples.length > 0 && extraVirgin.examples.length <= 3);
  // every example actually is one of the 6 names that carry כתית
  for (const name of extraVirgin.examples) assert.ok(normalizeText(name).split(' ').includes(normalizeText('כתית')));
  // sorted shortest-first
  for (let i = 1; i < extraVirgin.examples.length; i++) assert.ok(extraVirgin.examples[i - 1].length <= extraVirgin.examples[i].length);
});

test('proposeKinds: a token below the count floor or above the share cap never survives', () => {
  // ספרדי and פרימיום and לייט each appear on exactly 1 product (< 3) - too rare to be a kind candidate
  const { candidates } = proposeKinds(PRODUCTS, new Map(), EXCLUSIONS);
  const tokens = candidates.map((c) => c.token);
  for (const rare of ['ספרדי', 'פרימיום', 'לייט']) assert.ok(!tokens.includes(normalizeText(rare)), `"${rare}" appears once and should not survive`);
});

test('proposeKinds: chain names (namesByGtin) count toward a product once, not per name', () => {
  // product 1 is also known, at two chains, by names that repeat כתית - it must still count once for כתית.
  const namesByGtin = new Map([
    ['1', ['שמן זית כתית מעולה 750 מל - חנות א', 'כתית מעולה שמן זית יצהר 750מל']],
  ]);
  const { candidates } = proposeKinds(PRODUCTS, namesByGtin, EXCLUSIONS);
  const extraVirgin = candidates.find((c) => c.token === normalizeText('כתית'));
  assert.equal(extraVirgin.count, 6, 'product 1 must contribute once to the כתית count regardless of how many chain names repeat it');
});

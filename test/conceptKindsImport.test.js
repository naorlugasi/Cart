import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRules } from '../src/pricing/substituteRules.js';
import {
  validatePattern,
  isKebabAsciiId,
  validateGroups,
  orderGroups,
  mergeGroupsIntoRules,
  measureConcept,
  samplePairs,
  impactForConcept,
  evaluateConcept,
} from '../scripts/concept-kinds-import.mjs';

// A toy raw rules object shaped like config/substitutes/rules.json, with nothing in variant.groups yet -
// every test builds on this rather than touching the real file.
const BASE_RAW_RULES = {
  _doc: 'toy rules for conceptKindsImport.test.js',
  families: {},
  conceptPolicy: {},
  form: {},
  diet: {},
  required: {},
  variant: { words: [], concepts: {}, groups: {} },
  priceBand: 3,
  sizeTolerance: 0.25,
};

const TOY_CONCEPT = { id: 'toy-oil', name: 'Toy Oil', sizeUnit: 'g', category: 'toy' };

function product(gtin, name, extra = {}) {
  return { gtin, name, category: 'toy', isWeighted: false, conceptId: 'toy-oil', size: null, brand: null, ...extra };
}

// ---------------------------------------------------------------------------
// validatePattern / isKebabAsciiId
// ---------------------------------------------------------------------------

test('validatePattern: accepts a plain word pattern', () => {
  assert.equal(validatePattern('spray').ok, true);
});

test('validatePattern: rejects an empty or non-string pattern', () => {
  assert.equal(validatePattern('').ok, false);
  assert.equal(validatePattern('   ').ok, false);
  assert.equal(validatePattern(null).ok, false);
  assert.equal(validatePattern(42).ok, false);
});

test('validatePattern: rejects a final-form Hebrew letter', () => {
  const r = validatePattern('שמן זית כתית מעולה ךתית');
  assert.equal(r.ok, false);
  assert.match(r.reason, /final-form/);
});

test('validatePattern: rejects a pattern that does not compile as RegExp', () => {
  const r = validatePattern('(unclosed');
  assert.equal(r.ok, false);
  assert.match(r.reason, /does not compile/);
});

test('isKebabAsciiId: accepts kebab-case ASCII, rejects everything else', () => {
  assert.equal(isKebabAsciiId('extra-virgin'), true);
  assert.equal(isKebabAsciiId('spray'), true);
  assert.equal(isKebabAsciiId('Extra-Virgin'), false);
  assert.equal(isKebabAsciiId('extra_virgin'), false);
  assert.equal(isKebabAsciiId('כתית'), false);
  assert.equal(isKebabAsciiId(''), false);
  assert.equal(isKebabAsciiId(null), false);
});

// ---------------------------------------------------------------------------
// validateGroups / orderGroups
// ---------------------------------------------------------------------------

const VALID_GROUPS = { spray: ['spray'], 'extra-virgin': ['extravirgin'], refined: ['refined'] };

test('validateGroups: accepts well-formed groups with no groupOrder', () => {
  assert.deepEqual(validateGroups(VALID_GROUPS), { ok: true });
});

test('validateGroups: accepts a groupOrder that lists exactly the group ids', () => {
  assert.deepEqual(validateGroups(VALID_GROUPS, ['spray', 'extra-virgin', 'refined']), { ok: true });
});

test('validateGroups: rejects a groupOrder missing a group id', () => {
  const r = validateGroups(VALID_GROUPS, ['spray', 'refined']);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('missing group id "extra-virgin"')));
});

test('validateGroups: rejects a groupOrder with an unknown or duplicate id', () => {
  const unknown = validateGroups(VALID_GROUPS, ['spray', 'extra-virgin', 'refined', 'bogus']);
  assert.ok(unknown.errors.some((e) => e.includes('unknown group id "bogus"')));

  const dup = validateGroups(VALID_GROUPS, ['spray', 'spray', 'extra-virgin', 'refined']);
  assert.ok(dup.errors.some((e) => e.includes('duplicate ids')));
});

test('validateGroups: rejects a bad group id, an empty pattern list, and an invalid pattern, all at once', () => {
  const r = validateGroups({ Bad_Id: ['ok'], empty: [], good: ['fine', '(unclosed'] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('"Bad_Id" is not kebab-case')));
  assert.ok(r.errors.some((e) => e.includes('"empty" has no patterns')));
  assert.ok(r.errors.some((e) => e.includes('does not compile')));
});

test('validateGroups: rejects a non-object groups value', () => {
  assert.equal(validateGroups(null).ok, false);
  assert.equal(validateGroups(['a', 'b']).ok, false);
});

test('orderGroups: reorders keys per groupOrder', () => {
  const ordered = orderGroups(VALID_GROUPS, ['refined', 'spray', 'extra-virgin']);
  assert.deepEqual(Object.keys(ordered), ['refined', 'spray', 'extra-virgin']);
  assert.deepEqual(ordered, VALID_GROUPS);
});

test('orderGroups: keeps the given order when no groupOrder is supplied', () => {
  const ordered = orderGroups(VALID_GROUPS, null);
  assert.deepEqual(Object.keys(ordered), Object.keys(VALID_GROUPS));
});

// ---------------------------------------------------------------------------
// mergeGroupsIntoRules
// ---------------------------------------------------------------------------

test('mergeGroupsIntoRules: adds a new concept, preserving existing groups, other concepts and _doc', () => {
  const raw = {
    ...BASE_RAW_RULES,
    variant: { words: [], concepts: {}, groups: { _doc: 'kinds doc', 'other-concept': { a: ['x'] } } },
  };
  const { rules, applied } = mergeGroupsIntoRules(raw, 'toy-oil', VALID_GROUPS);
  assert.equal(applied, true);
  assert.deepEqual(rules.variant.groups['other-concept'], { a: ['x'] });
  assert.equal(rules.variant.groups._doc, 'kinds doc');
  assert.deepEqual(rules.variant.groups['toy-oil'], VALID_GROUPS);
  // original untouched
  assert.equal(raw.variant.groups['toy-oil'], undefined);
});

test('mergeGroupsIntoRules: skips a concept that already has groups unless replace is true', () => {
  const raw = { ...BASE_RAW_RULES, variant: { words: [], concepts: {}, groups: { 'toy-oil': { old: ['x'] } } } };

  const skipped = mergeGroupsIntoRules(raw, 'toy-oil', VALID_GROUPS);
  assert.equal(skipped.applied, false);
  assert.equal(skipped.reason, 'already-has-groups');
  assert.deepEqual(skipped.rules.variant.groups['toy-oil'], { old: ['x'] }, 'unchanged without replace');

  const replaced = mergeGroupsIntoRules(raw, 'toy-oil', VALID_GROUPS, { replace: true });
  assert.equal(replaced.applied, true);
  assert.deepEqual(replaced.rules.variant.groups['toy-oil'], VALID_GROUPS);
});

// ---------------------------------------------------------------------------
// measureConcept (no-kind / covered / conflict)
// ---------------------------------------------------------------------------

const TEN_PRODUCTS = [
  product('1', 'oil spray 500 g'),
  product('2', 'oil spray 400 g'),
  product('3', 'oil spray 300 g'),
  product('4', 'oil extravirgin 750 g'),
  product('5', 'oil extravirgin 750 g premium'),
  product('6', 'oil extravirgin 1000 g'),
  product('7', 'oil refined 750 g'),
  product('8', 'oil refined 1000 g'),
  product('9', 'oil refined 500 g'),
  product('10', 'oil plain 750 g'),
];

function compileWithGroups(groups) {
  const raw = { ...BASE_RAW_RULES, variant: { words: [], concepts: {}, groups: { 'toy-oil': groups } } };
  return compileRules(raw);
}

test('measureConcept: covered / no-kind counts, one product (10) matches nothing', () => {
  const r2 = compileWithGroups(VALID_GROUPS);
  const m = measureConcept({ products: TEN_PRODUCTS, namesByGtin: new Map(), conceptId: 'toy-oil', r2 });
  assert.equal(m.total, 10);
  assert.equal(m.noKind, 1);
  assert.equal(m.covered, 9);
  assert.equal(m.noKindShare, 0.1);
  assert.equal(m.conflicts.length, 0);
});

test('measureConcept: a product matching two groups across its names is a conflict', () => {
  const r2 = compileWithGroups(VALID_GROUPS);
  // gtin '1' is also known, at some chain, by a name carrying "refined" - it is spray by its own name,
  // refined by the chain's name, so its matched-group set has two members.
  const namesByGtin = new Map([['1', ['oil refined 500 g - some chain']]]);
  const m = measureConcept({ products: TEN_PRODUCTS, namesByGtin, conceptId: 'toy-oil', r2 });
  assert.equal(m.conflicts.length, 1);
  assert.deepEqual(m.conflicts[0].groups, ['refined', 'spray']);
  assert.equal(m.conflicts[0].gtin, '1');
});

// ---------------------------------------------------------------------------
// samplePairs / impactForConcept
// ---------------------------------------------------------------------------

test('samplePairs: returns every pair when n is small, capped and spanning the full range otherwise', () => {
  assert.deepEqual(samplePairs(3, 2000), [[0, 1], [0, 2], [1, 2]]);
  assert.equal(samplePairs(0, 2000).length, 0);
  assert.equal(samplePairs(1, 2000).length, 0);

  const big = samplePairs(200, 50); // C(200,2) = 19900 > 50
  assert.equal(big.length, 50);
  // every sampled pair is a valid i < j pair in range
  for (const [i, j] of big) { assert.ok(i >= 0 && j < 200 && i < j); }
  // the sample spans beyond just the first few indices (not stuck at the front)
  assert.ok(big.some(([, j]) => j > 100));
});

test('impactForConcept: counts pairs ok today and how many the new groups would reject', () => {
  // 4 sized products, all within size tolerance of one another pre-variant-check: A1/A2 are "spray",
  // B1/B2 are "extravirgin". Before any groups exist, variant signatures are all empty -> every pair is
  // compatible. After the groups are added, only same-group pairs stay compatible.
  const sizedProducts = [
    product('a1', 'oil spray 500 g', { size: { value: 500, unit: 'g', count: 1 } }),
    product('a2', 'oil spray 520 g', { size: { value: 520, unit: 'g', count: 1 } }),
    product('b1', 'oil extravirgin 510 g', { size: { value: 510, unit: 'g', count: 1 } }),
    product('b2', 'oil extravirgin 530 g', { size: { value: 530, unit: 'g', count: 1 } }),
  ];
  const beforeRules = compileRules(BASE_RAW_RULES);
  const afterRules = compileWithGroups({ spray: ['spray'], extravirgin: ['extravirgin'] });

  const { pairsOk, pairsRejected } = impactForConcept({ sizedProducts, requireSize: true, beforeRules, afterRules });
  assert.equal(pairsOk, 6, 'all 6 pairs among 4 products are compatible before the groups exist');
  assert.equal(pairsRejected, 4, 'the 4 cross-group pairs (a x b) are rejected after; the 2 same-group pairs stay ok');
});

// ---------------------------------------------------------------------------
// evaluateConcept (the skip gates, end to end on toy data - still no file I/O)
// ---------------------------------------------------------------------------

test('evaluateConcept: unknown concept id is skipped', () => {
  const entry = { id: 'does-not-exist', name: 'Nope', groups: VALID_GROUPS };
  const r = evaluateConcept({ entry, concept: null, products: TEN_PRODUCTS, namesByGtin: new Map(), rawRules: BASE_RAW_RULES });
  assert.equal(r.status, 'skip');
  assert.equal(r.reason, 'unknown-concept');
});

test('evaluateConcept: an invalid pattern is skipped before any measuring happens', () => {
  const entry = { id: 'toy-oil', name: 'Toy Oil', groups: { spray: ['(unclosed'] } };
  const r = evaluateConcept({ entry, concept: TOY_CONCEPT, products: TEN_PRODUCTS, namesByGtin: new Map(), rawRules: BASE_RAW_RULES });
  assert.equal(r.status, 'skip');
  assert.equal(r.reason, 'invalid-pattern');
});

test('evaluateConcept: no-kind share over 60% is skipped', () => {
  // Only 3 of 10 products carry any group word; the rest are "plain" - no-kind share 0.7 > 0.6.
  const products = [
    product('1', 'oil spray 500 g'),
    product('2', 'oil extravirgin 750 g'),
    product('3', 'oil refined 750 g'),
    ...Array.from({ length: 7 }, (_, i) => product(`p${i}`, 'oil plain 750 g')),
  ];
  const entry = { id: 'toy-oil', name: 'Toy Oil', groups: VALID_GROUPS };
  const r = evaluateConcept({ entry, concept: TOY_CONCEPT, products, namesByGtin: new Map(), rawRules: BASE_RAW_RULES });
  assert.equal(r.status, 'skip');
  assert.equal(r.reason, 'no-kind');
  assert.ok(r.measured.noKindShare > 0.6);
});

test('evaluateConcept: a conflict share over 2% is skipped', () => {
  // gtin '1' conflicts (spray by its own name, refined by a chain name) - 1 of 10 = 10% > 2%.
  const namesByGtin = new Map([['1', ['oil refined 500 g - some chain']]]);
  const entry = { id: 'toy-oil', name: 'Toy Oil', groups: VALID_GROUPS };
  const r = evaluateConcept({ entry, concept: TOY_CONCEPT, products: TEN_PRODUCTS, namesByGtin, rawRules: BASE_RAW_RULES });
  assert.equal(r.status, 'skip');
  assert.equal(r.reason, 'conflict');
  assert.equal(r.measured.conflicts.length, 1);
});

test('evaluateConcept: a clean split applies, with measured and impact numbers attached', () => {
  const entry = { id: 'toy-oil', name: 'Toy Oil', groups: VALID_GROUPS, groupOrder: ['spray', 'extra-virgin', 'refined'] };
  const r = evaluateConcept({ entry, concept: TOY_CONCEPT, products: TEN_PRODUCTS, namesByGtin: new Map(), rawRules: BASE_RAW_RULES });
  assert.equal(r.status, 'apply');
  assert.equal(r.measured.noKind, 1);
  assert.equal(r.measured.covered, 9);
  assert.deepEqual(Object.keys(r.groups), ['spray', 'extra-virgin', 'refined']);
  assert.ok(r.impact, 'a concept with a sizeUnit gets an impact estimate');
  assert.ok(Number.isInteger(r.impact.pairsOk) && Number.isInteger(r.impact.pairsRejected));
});

test('foldGroupFinals: a reviewer\'s final-form letters fold to the regular forms names are matched in', async () => {
  const { foldGroupFinals } = await import('../scripts/concept-kinds-import.mjs');
  assert.deepEqual(foldGroupFinals({ poultry: ['לעוף', 'לבשר'], soy: ['חלבון סויה'] }), { poultry: ['לעופ', 'לבשר'], soy: ['חלבונ סויה'] });
  assert.equal(validatePattern(foldGroupFinals({ a: ['לילך'] }).a[0]).ok, true);
});

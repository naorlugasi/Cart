import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identityKey, consumerBrandFor, buildConsumerBrandLexicon, fullNames,
  checkAttrsCondition, checkPriceCondition, checkScreenCondition, checkChainCountCondition,
  evaluateAutoMergePair, identityMergeCandidates, inheritPerIdRecords,
} from '../src/catalog/identity.js';
import { applyAliasPerIdInheritance, loadGtinAliases } from '../scripts/build-products.mjs';
import { resetVerified } from '../src/catalog/verified.js';

// Docs: docs/ALIASES.md ("STEP 2"). "THE RULE" referenced throughout is that section.

// --- identityKey -------------------------------------------------------------------------------------------

test('identityKey: null for a concept product, a weighed product, no gtin, no conceptId/size, decided-null conceptId, or an ambiguous brand', () => {
  const base = { gtin: '111', conceptId: 'milk', size: { value: 1, unit: 'l', count: 1 } };
  const token = { state: 'token', value: 'תנובה' };
  assert.equal(identityKey({ ...base, kind: 'concept' }, token), null, 'concept product');
  assert.equal(identityKey({ ...base, isWeighted: true }, token), null, 'weighed product');
  assert.equal(identityKey({ ...base, gtin: null }, token), null, 'no gtin');
  assert.equal(identityKey({ ...base, conceptId: null, conceptIdDecided: false, size: null }, token), null, 'no size');
  assert.equal(identityKey({ ...base, conceptId: null, conceptIdDecided: true }, token), null, 'decided null conceptId never clusters on a heuristic concept');
  assert.equal(identityKey(base, { state: 'ambiguous', value: 'x' }), null, 'ambiguous consumer brand never clusters');
  assert.equal(identityKey(base, null), null, 'no consumer brand reading at all');
});

test('identityKey: an UNRESOLVED null conceptId (no rule, no verified record, no assignment) clusters under a fixed sentinel, not excluded like a decided null', () => {
  const a = { gtin: '1', conceptId: null, conceptIdDecided: false, size: { value: 1, unit: 'unit', count: 3 } };
  const b = { gtin: '2', conceptId: null, conceptIdDecided: false, size: { value: 1, unit: 'unit', count: 3 } };
  const none = { state: 'none', value: null };
  const keyA = identityKey(a, none);
  const keyB = identityKey(b, none);
  assert.ok(keyA, 'an unresolved-null product still gets a key');
  assert.equal(keyA, keyB);
});

test('identityKey: same conceptId/size, different consumer brand -> different keys; same brand token -> same key', () => {
  const size = { value: 500, unit: 'g', count: 1 };
  const huggies = identityKey({ gtin: '1', conceptId: 'baby-wipes', size }, { state: 'token', value: 'האגיס' });
  const pampers = identityKey({ gtin: '2', conceptId: 'baby-wipes', size }, { state: 'token', value: 'פמפרס' });
  assert.notEqual(huggies, pampers);
  const huggies2 = identityKey({ gtin: '3', conceptId: 'baby-wipes', size }, { state: 'token', value: 'האגיס' });
  assert.equal(huggies, huggies2);
});

// --- consumerBrandFor / buildConsumerBrandLexicon -----------------------------------------------------------

test('consumerBrandFor: TOKEN when a lexicon word is in every full name, NONE when in none, AMBIGUOUS when in some but not all (never guessed)', () => {
  const lexicon = new Set(['האגיס']);
  assert.deepEqual(consumerBrandFor(['מגבוני האגיס רביעייה', 'האגיס מגבונים'], lexicon), { state: 'token', value: 'האגיס' });
  assert.deepEqual(consumerBrandFor(['מגבונים לחים', 'מגבוני תינוקות'], lexicon), { state: 'none', value: null });
  const ambiguous = consumerBrandFor(['האגיס מגבונים', 'מגבוני תינוקות'], lexicon);
  assert.equal(ambiguous.state, 'ambiguous');
});

test('consumerBrandFor: a truncated name that is a true prefix of a fuller one for the same gtin does not vote (docs/ATTRS.md rule 2)', () => {
  const lexicon = new Set(['קולגייט']);
  // "קולגיי" is a prefix of "קולגייט משחת שיניים" - fullNames() drops it, so only the full name is read,
  // and it is read consistently (TOKEN), not ambiguous.
  const result = consumerBrandFor(['קולגיי', 'קולגייט משחת שיניים'], lexicon);
  assert.deepEqual(result, { state: 'token', value: 'קולגייט' });
});

test('buildConsumerBrandLexicon: a real brand concentrated in a few concepts qualifies; a generic noun spread across many concepts, a concept-vocabulary word, a short fragment and a number do not', () => {
  const chainsFor = (n) => ['a', 'b', 'c'].map((c) => ({ chain: c, name: `${n}` }));
  const entries = [];
  // "מותג" ("brand", fictional product name) - a real brand: 10 products, 3 chains, ONE concept.
  for (let i = 0; i < 10; i++) entries.push({ gtin: `brand-${i}`, names: [`מותג דבר ${i}`], named: chainsFor(`מותג דבר ${i}`), conceptId: 'concept-a' });
  // "דבר" ("thing", generic noun) - same frequency, but spread across 11 different concepts: not a brand.
  for (let i = 0; i < 11; i++) entries.push({ gtin: `generic-${i}`, names: [`דבר אחר ${i}`], named: chainsFor(`דבר אחר ${i}`), conceptId: `concept-generic-${i}` });
  const lexicon = buildConsumerBrandLexicon(entries, { maxConcepts: 10 });
  assert.ok(lexicon.has('מותג'), 'a word concentrated in <= maxConcepts concepts qualifies');
  assert.ok(!lexicon.has('דבר'), 'a word spread across many concepts is a category noun, not a brand');
  assert.ok(!lexicon.has('15'), 'pure numbers never qualify');
});

// --- the four auto-merge conditions, each stopping a pair on its own ------------------------------------------

const group = (overrides) => ({
  gtin: '0', conceptId: 'c', size: { value: 1, unit: 'unit', count: 1 }, category: 'כללי',
  names: ['מוצר א'], named: [{ chain: 'shufersal', name: 'מוצר א' }, { chain: 'ramilevy', name: 'מוצר א' }],
  brandField: [], chainPrices: new Map([['shufersal', 10], ['ramilevy', 10]]),
  ...overrides,
});

test('condition 1 (attrs) stops a pair: a scalar attr read on one side and absent on the other is a mismatch, not a pass', () => {
  const a = group({ gtin: '1', names: ['מוצר בבקבוק'], named: [{ chain: 'shufersal', name: 'מוצר בבקבוק' }, { chain: 'ramilevy', name: 'מוצר בבקבוק' }] });
  const b = group({ gtin: '2', names: ['מוצר'], named: [{ chain: 'shufersal', name: 'מוצר' }, { chain: 'ramilevy', name: 'מוצר' }] });
  const r = evaluateAutoMergePair(a, b);
  assert.equal(r.ok, false);
  assert.equal(r.failedCondition, 'attrs');
});

test('condition 1 (attrs) also stops a pair with NO positive evidence at all (two empty, "matching" attrs objects are not proof of sameness - the chocolate-egg case)', () => {
  const a = group({ gtin: '1' });
  const b = group({ gtin: '2' });
  const r = checkAttrsCondition({}, {});
  assert.equal(r.ok, false);
  assert.match(r.detail, /no positive evidence/);
  assert.equal(evaluateAutoMergePair(a, b).ok, false);
});

test('condition 1: flavour/diet alone (no scalar attr) is "soft evidence" and is not enough to merge on, even when equal on both sides', () => {
  const r = checkAttrsCondition({ flavour: ['שוקולד'] }, { flavour: ['שוקולד'] });
  assert.equal(r.ok, false);
  assert.match(r.detail, /soft evidence/);
});

test('condition 2 (price) stops a pair: a chain selling both codes at different prices', () => {
  const a = group({ gtin: '1', chainPrices: new Map([['shufersal', 10], ['ramilevy', 10]]) });
  const b = group({ gtin: '2', chainPrices: new Map([['shufersal', 12], ['ramilevy', 10]]) });
  const r = checkPriceCondition(a.chainPrices, b.chainPrices);
  assert.equal(r.ok, false);
  assert.match(r.detail, /shufersal/);
});

test('condition 3 (screen) stops a pair: a content word (digits included) present in only one side\'s names', () => {
  const a = group({
    gtin: '1', names: ['שוקולד לבן 90 גרם'],
    named: [{ chain: 'shufersal', name: 'שוקולד לבן 90 גרם' }, { chain: 'ramilevy', name: 'שוקולד לבן 90 גרם' }, { chain: 'carrefour', name: 'שוקולד לבן 90 גרם' }],
    chainPrices: new Map([['shufersal', 10], ['ramilevy', 10], ['carrefour', 10]]),
  });
  const b = group({
    gtin: '2', names: ['שוקולד חלב 90 גרם'],
    named: [{ chain: 'shufersal', name: 'שוקולד חלב 90 גרם' }, { chain: 'ramilevy', name: 'שוקולד חלב 90 גרם' }],
    chainPrices: new Map([['shufersal', 10], ['ramilevy', 10]]),
  });
  const r = checkScreenCondition(a, b);
  assert.equal(r.ok, false);
  assert.match(r.detail, /לבנ|חלב/);
});

test('condition 4 (chains) stops a pair: a single-chain code paired with another single-chain code', () => {
  const a = group({ gtin: '1', chainPrices: new Map([['shufersal', 10]]) });
  const b = group({ gtin: '2', chainPrices: new Map([['shufersal', 10]]) });
  const r = checkChainCountCondition(a, b);
  assert.equal(r.ok, false);
  assert.match(r.detail, /single-chain/);
});

test('a pair passing all four conditions auto-merges', () => {
  const a = group({
    gtin: '1', names: ['מוצר בבקבוק קר'],
    named: [{ chain: 'shufersal', name: 'מוצר בבקבוק קר' }, { chain: 'ramilevy', name: 'מוצר בבקבוק קר' }],
    chainPrices: new Map([['shufersal', 10], ['ramilevy', 10]]),
  });
  const b = group({
    gtin: '2', names: ['מוצר בבקבוק קר'],
    named: [{ chain: 'shufersal', name: 'מוצר בבקבוק קר' }, { chain: 'carrefour', name: 'מוצר בבקבוק קר' }],
    chainPrices: new Map([['shufersal', 10], ['carrefour', 10]]),
  });
  const r = evaluateAutoMergePair(a, b);
  assert.equal(r.ok, true, JSON.stringify(r));
});

// --- identityMergeCandidates: clustering, auto-merge vs queue -------------------------------------------------

test('identityMergeCandidates: a cluster where every pair passes merges as a whole; the canonical is the member with the most chains', () => {
  const lexicon = new Set(['מותג']);
  const member = (gtin, chainPrices) => group({
    gtin, names: ['מותג מוצר בבקבוק'],
    named: [...chainPrices.keys()].map((chain) => ({ chain, name: 'מותג מוצר בבקבוק' })),
    chainPrices,
  });
  const a = member('canon', new Map([['shufersal', 10], ['ramilevy', 10], ['carrefour', 10]]));
  const b = member('alias', new Map([['shufersal', 10], ['ramilevy', 10]]));
  const result = identityMergeCandidates([a, b], { lexicon });
  assert.equal(result.merges.length, 1);
  assert.equal(result.merges[0].canonical, 'canon');
  assert.deepEqual(result.merges[0].aliases, ['alias']);
  assert.equal(result.queueItems.length, 0);
});

test('identityMergeCandidates: a cluster of 3+ only merges as a whole when EVERY pair agrees - one disagreeing pair sends the whole cluster to the queue as ONE item, not a partial merge', () => {
  const lexicon = new Set(['מותג']);
  const okPair = (gtin) => group({
    gtin, names: ['מותג מוצר בבקבוק'],
    named: [{ chain: 'shufersal', name: 'מותג מוצר בבקבוק' }, { chain: 'ramilevy', name: 'מותג מוצר בבקבוק' }],
    chainPrices: new Map([['shufersal', 10], ['ramilevy', 10]]),
  });
  const a = okPair('a');
  const b = okPair('b');
  // c matches a/b on everything the screen checks, but at a different price at a shared chain - condition 2.
  const c = group({
    gtin: 'c', names: ['מותג מוצר בבקבוק'],
    named: [{ chain: 'shufersal', name: 'מותג מוצר בבקבוק' }, { chain: 'ramilevy', name: 'מותג מוצר בבקבוק' }],
    chainPrices: new Map([['shufersal', 99], ['ramilevy', 10]]),
  });
  const result = identityMergeCandidates([a, b, c], { lexicon });
  assert.equal(result.merges.length, 0, 'no partial merge of the agreeing pair');
  assert.equal(result.queueItems.length, 1, 'one queue item for the whole cluster');
  assert.equal(result.queueItems[0].checks[0].rule, 'same-product');
});

// --- inheritPerIdRecords: verified inheritance and verified-conflict -------------------------------------------

test('inheritPerIdRecords: the canonical inherits a decided field held only by an alias (THE RULE: "either side")', () => {
  const decided = (id) => ({ canon: { category: 'משקאות' }, alias1: { conceptId: 'cola' } }[id] ?? {});
  const { patch, conflicts } = inheritPerIdRecords('canon', ['alias1'], decided);
  assert.equal(patch.conceptId, 'cola');
  assert.equal(conflicts.length, 0);
});

test('inheritPerIdRecords: complementary fields (category-only vs conceptId-only) merge with no conflict (~4,700 records in the real catalog are category-only)', () => {
  const decided = (id) => ({ canon: {}, a: { category: 'חלב וביצים' }, b: { conceptId: 'milk' } }[id] ?? {});
  const { patch, conflicts } = inheritPerIdRecords('canon', ['a', 'b'], decided);
  assert.equal(patch.category, 'חלב וביצים');
  assert.equal(patch.conceptId, 'milk');
  assert.equal(conflicts.length, 0);
});

test('inheritPerIdRecords: two decided values for the SAME field that disagree are never silently resolved - no patch for that field, one conflict reported', () => {
  const decided = (id) => ({ canon: { category: 'משקאות' }, alias1: { category: 'שימורים' } }[id] ?? {});
  const { patch, conflicts } = inheritPerIdRecords('canon', ['alias1'], decided);
  assert.equal(patch.category, undefined, 'the field is left exactly as the normal pipeline already computed it');
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].field, 'category');
});

test('inheritPerIdRecords: two ALIASES disagreeing on a field the canonical never decided is still a conflict, not a coin flip', () => {
  const decided = (id) => ({ canon: {}, a: { conceptId: 'x' }, b: { conceptId: 'y' } }[id] ?? {});
  const { patch, conflicts } = inheritPerIdRecords('canon', ['a', 'b'], decided);
  assert.equal(patch.conceptId, undefined);
  assert.equal(conflicts.length, 1);
});

// --- applyAliasPerIdInheritance: the build's only remaining per-id-file piece (4.10 restructure) -----------------
//
// The identity-merge CANDIDATE SEARCH moved out of the daily build entirely (docs/ALIASES.md: one real
// auto-merge found catalog-wide did not justify the added build time) into the offline
// scripts/identity-merge.mjs. What the build keeps is making every per-id config file follow the alias map
// for merges that already exist via config/products/aliases.json - tested here directly against a
// `products` array (with `gtinAliases` already set, as buildProducts() would produce), no chains/concepts
// fixture needed.

test('applyAliasPerIdInheritance: a canonical with a reviewed alias inherits a decided field the alias holds and the canonical does not, and reports a real disagreement as verified-conflict', () => {
  const canonical = { id: 'g1', gtin: '1', name: 'מוצר קנוני', category: 'משקאות', conceptId: null, size: null, chains: 5, gtinAliases: ['2'] };
  resetVerified(new Map([
    ['g2', { conceptId: 'cola', verifiedBy: 'naor', verifiedAt: '2026-01-01' }], // decided only on the alias id
  ]));
  try {
    const items = applyAliasPerIdInheritance([canonical]);
    assert.equal(canonical.conceptId, 'cola', 'the canonical inherited the alias-held decision');
    assert.equal(items.length, 0);
  } finally {
    resetVerified(null);
  }
});

test('applyAliasPerIdInheritance: canonical and alias both decide the SAME field differently -> no silent winner, one verified-conflict item, field left untouched', () => {
  const canonical = { id: 'g1', gtin: '1', name: 'מוצר קנוני', category: 'משקאות', conceptId: null, size: null, chains: 5, gtinAliases: ['2'] };
  resetVerified(new Map([
    ['g1', { category: 'משקאות', verifiedBy: 'naor', verifiedAt: '2026-01-01' }],
    ['g2', { category: 'שימורים', verifiedBy: 'naor', verifiedAt: '2026-01-01' }],
  ]));
  try {
    const items = applyAliasPerIdInheritance([canonical]);
    assert.equal(canonical.category, 'משקאות', 'left exactly as the normal pipeline already computed it');
    assert.equal(items.length, 1);
    assert.equal(items[0].checks[0].rule, 'verified-conflict');
    assert.match(items[0].checks[0].detail, /category/);
  } finally {
    resetVerified(null);
  }
});

test('applyAliasPerIdInheritance: a product with no gtinAliases is left untouched', () => {
  const plain = { id: 'g9', gtin: '9', name: 'רגיל', category: 'כללי', conceptId: null, size: null, chains: 2 };
  const items = applyAliasPerIdInheritance([plain]);
  assert.equal(items.length, 0);
  assert.deepEqual(plain, { id: 'g9', gtin: '9', name: 'רגיל', category: 'כללי', conceptId: null, size: null, chains: 2 });
});

// --- sanity: the real config applies without throwing -----------------------------------------------------------

test('loadGtinAliases: the real config/products/aliases.json still loads (identity.js adds no new required fields there)', () => {
  assert.ok(Array.isArray(loadGtinAliases()));
});

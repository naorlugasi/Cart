/**
 * Family stand-ins (Naor 12.10: "תחליף מהמשפחה: כשאין מוצר מאותו עלה ברשת, להציע מהמשפחה עם הסתייגות
 * 'מאותה משפחה' - כן"). docs/CONCEPTS.md §4.
 *
 * The families come from the concept tree (src/catalog/concepts.js families()), rules.json `families` only takes
 * away ({ substitutes: false } / { without }). These tests pin the tree, the rules and the concept units through
 * the test seams, so they do not depend on config/concepts, which other sessions edit concurrently - except the
 * last test, which is a rot guard over the real rules.json against the real tree.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MappingEngine } from '../src/catalog/mapping.js';
import { compareCart, LINE_STATUS } from '../src/pricing/compare.js';
import { findSubstitute, evaluateSubstitutes, familyOf, _setConceptLookup, _setFamilyTree } from '../src/pricing/substitutes.js';
import { compatible, buildFamilyTree, compileRules, _setRules, RULES_FILE } from '../src/pricing/substituteRules.js';
import { concepts, families } from '../src/catalog/concepts.js';

const RULES = {
  families: {},
  conceptPolicy: { 'wine-red': 'none' },
  form: { frozen: ['(?<![א-ת])קפוא'] },
  diet: { 'lactose-free': ['נטול לקטוז'] },
  required: {},
  variant: { words: ['וניל', 'שוקולד', 'תות'] },
  priceBand: 3,
  sizeTolerance: 0.25,
};

// The tree: one family per department, as families() builds it. 'cream' mixes a millilitre leaf with a gram one,
// 'wine' holds a policy-none leaf, 'beef' a fresh/frozen twin.
const fam = (id, name, category, conceptIds) => conceptIds.map((conceptId) => ({ conceptId, family: { id, name }, category }));
const TREE = [
  ...fam('bread', 'לחם', 'מאפים ולחם', ['bread-rye', 'bread-spelt', 'bread-sourdough']),
  ...fam('cream', 'שמנת', 'חלב וביצים', ['cream-sweet', 'cream-cheese']),
  ...fam('wine', 'יין', 'משקאות', ['wine-red', 'wine-sparkling']),
  ...fam('beef', 'בקר', 'בשר ועוף', ['beef-entrecote', 'beef-entrecote-frozen', 'beef-sinta']),
  ...fam('pudding', 'מעדנים', 'חלב וביצים', ['pudding-chocolate', 'pudding-vanilla']),
];
const UNITS = {
  'bread-rye': 'g', 'bread-spelt': 'g', 'bread-sourdough': 'g',
  'cream-sweet': 'ml', 'cream-cheese': 'g',
  'wine-red': 'ml', 'wine-sparkling': 'ml',
  'beef-entrecote': null, 'beef-entrecote-frozen': null, 'beef-sinta': null,
  'pudding-chocolate': 'g', 'pudding-vanilla': 'g',
};

function setup(rules = RULES) {
  _setRules(rules);
  _setConceptLookup((id) => (id in UNITS ? { id, sizeUnit: UNITS[id] } : null));
  _setFamilyTree(TREE);
}
function teardown() { _setRules(null); _setConceptLookup(null); _setFamilyTree(null); }

let gtin = 7000000000001;
const product = (o) => ({ unit: "יח'", isWeighted: false, aliases: [], size: null, privateLabelOf: null, basePrice: 15, brand: 'בדיקה', gtin: String(gtin++), ...o });
const g = (value) => ({ value, unit: 'g', count: 1 });
const ml = (value) => ({ value, unit: 'ml', count: 1 });

const P = {
  rye: product({ id: 'rye', name: 'לחם שיפון 500 גרם', conceptId: 'bread-rye', category: 'מאפים ולחם', size: g(500) }),
  rye2: product({ id: 'rye2', name: 'לחם שיפון כפרי 750 גרם', conceptId: 'bread-rye', category: 'מאפים ולחם', size: g(750) }),
  spelt: product({ id: 'spelt', name: 'לחם כוסמין 500 גרם', conceptId: 'bread-spelt', category: 'מאפים ולחם', size: g(500) }),
  sourdough: product({ id: 'sourdough', name: 'לחם מחמצת 520 גרם', conceptId: 'bread-sourdough', category: 'מאפים ולחם', size: g(520) }),
  sourdoughBig: product({ id: 'sourdough-big', name: 'לחם מחמצת גדול 1000 גרם', conceptId: 'bread-sourdough', category: 'מאפים ולחם', size: g(1000) }),
  creamSweet: product({ id: 'cream-sweet', name: 'שמנת מתוקה 250 מל', conceptId: 'cream-sweet', category: 'חלב וביצים', size: ml(250) }),
  creamCheese: product({ id: 'cream-cheese', name: 'גבינת שמנת 250 גרם', conceptId: 'cream-cheese', category: 'חלב וביצים', size: g(250) }),
  wineRed: product({ id: 'wine-red', name: 'יין אדום יבש 750 מל', conceptId: 'wine-red', category: 'משקאות', size: ml(750) }),
  wineSparkling: product({ id: 'wine-sparkling', name: 'יין מבעבע 750 מל', conceptId: 'wine-sparkling', category: 'משקאות', size: ml(750) }),
  entrecote: product({ id: 'entrecote', name: 'אנטריקוט טרי', conceptId: 'beef-entrecote', category: 'בשר ועוף', isWeighted: true }),
  entrecoteFrozen: product({ id: 'entrecote-frozen', name: 'אנטריקוט', conceptId: 'beef-entrecote-frozen', category: 'בשר ועוף', isWeighted: true }),
  puddingChoc: product({ id: 'pudding-choc', name: 'מעדן שוקולד 125 גרם', conceptId: 'pudding-chocolate', category: 'חלב וביצים', size: g(125) }),
  puddingVanilla: product({ id: 'pudding-vanilla', name: 'מעדן וניל 125 גרם', conceptId: 'pudding-vanilla', category: 'חלב וביצים', size: g(125) }),
};
const products = Object.values(P);
const it = (p, price, extra = {}) => ({ storeItemId: `SI_${p.id}`, gtin: p.gtin, code: p.gtin, name: p.name, price, isWeighted: !!p.isWeighted, unit: "יח'", inStock: true, promotions: [], ...extra });
// chainF: no rye bread at all - spelt and sourdough (a confirmed-size one and a big one), everything else's relatives.
const chainF = { items: [it(P.spelt, 14), it(P.sourdough, 12), it(P.sourdoughBig, 9), it(P.creamCheese, 8), it(P.wineSparkling, 40), it(P.entrecoteFrozen, 90), it(P.puddingVanilla, 4)] };
// chainS: sells a second rye loaf of another size - the same leaf, with a caveat of its own - and spelt.
const chainS = { items: [it(P.rye2, 16), it(P.spelt, 10)] };
// chainH: the home chain, sells the originals.
const chainH = { items: [it(P.rye, 15), it(P.creamSweet, 7), it(P.wineRed, 50), it(P.puddingChoc, 4)] };
const mapping = new MappingEngine({ products, catalogs: { chainF, chainS, chainH }, strictGtin: true });
const chains = ['chainF', 'chainS', 'chainH'].map((id) => ({ id, name: id, branches: [{ id: `${id}-1`, name: 'B', city: 'תל אביב' }] }));
const missing = (p, chainId) => findSubstitute({ product: p, qty: 1, chainId, mapping, policy: 'cheapest', purpose: 'missing', referencePrice: p.basePrice, scope: 'family' });
const line = (res, chainId) => res.rows.find((r) => r.chainId === chainId).lines[0];
const compare = (p, apply = 'ask') => compareCart({ cart: { lines: [{ productId: p.id, qty: 1 }] }, chains, mapping, address: { city: 'תל אביב' }, substitutes: { policy: 'cheapest', apply } });

test('a missing line with no same-leaf candidate gets a family candidate, with the caveat other-family', () => {
  setup();
  try {
    assert.equal(findSubstitute({ product: P.rye, qty: 1, chainId: 'chainF', mapping, policy: 'cheapest', purpose: 'missing', referencePrice: 15, scope: 'concept' }), null, 'no rye at chainF');
    const s = missing(P.rye, 'chainF');
    assert.equal(s.product.id, 'sourdough', 'the cheapest family member of a comparable size (the 1 kg loaf is not "another size" across a family)');
    assert.equal(s.tier, 'family');
    assert.deepEqual(s.family, { id: 'bread', name: 'לחם' });
    assert.deepEqual(s.caveats, ['other-family']);

    const ask = line(compare(P.rye), 'chainF');
    assert.equal(ask.status, LINE_STATUS.MISSING);
    assert.equal(ask.alternative.tier, 'family');
    assert.deepEqual(ask.alternative.caveats, ['other-family']);
    // Never applied on its own, even under apply: 'auto' - a caveat is always asked about.
    const auto = line(compare(P.rye, 'auto'), 'chainF');
    assert.equal(auto.status, LINE_STATUS.MISSING);
    assert.equal(auto.alternative.productId, 'sourdough');
  } finally { teardown(); }
});

test('a same-leaf candidate still wins, even one with a caveat of its own, and a cheaper offer never crosses concepts', () => {
  setup();
  try {
    const s = line(compare(P.rye), 'chainS');
    assert.equal(s.alternative.productId, 'rye2', 'the 750 g rye (other-size) comes before the confirmed-size spelt');
    assert.equal(s.alternative.tier, 'concept');
    assert.deepEqual(s.alternative.caveats, ['other-size']);
    // An available line: the cheaper search is same-concept only, whatever scope is asked for.
    assert.equal(findSubstitute({ product: P.rye, qty: 1, chainId: 'chainS', mapping, policy: 'cheapest', purpose: 'cheaper', referencePrice: 15, scope: 'family' }), null);
    assert.equal(line(compare(P.rye), 'chainH').alternative, null, 'at the home chain the rye is sold and spelt is not offered as cheaper');
  } finally { teardown(); }
});

test('a family switched off in rules.json offers nothing; `without` keeps single leaves out', () => {
  setup({ ...RULES, families: { bread: { substitutes: false } } });
  try {
    assert.equal(familyOf('bread-rye'), null);
    assert.equal(missing(P.rye, 'chainF'), null);
    assert.equal(line(compare(P.rye), 'chainF').alternative, null);
  } finally { teardown(); }
  setup({ ...RULES, families: { 'bread@מאפים ולחם': { without: ['bread-sourdough'] } } });
  try {
    assert.deepEqual(familyOf('bread-rye').concepts, ['bread-rye', 'bread-spelt']);
    assert.equal(missing(P.rye, 'chainF').product.id, 'spelt', 'sourdough is out, spelt stands in');
    assert.equal(familyOf('bread-sourdough'), null);
  } finally { teardown(); }
  // id@category only touches that department's family of the id.
  setup({ ...RULES, families: { 'bread@שימורים': { substitutes: false } } });
  try { assert.equal(missing(P.rye, 'chainF').product.id, 'sourdough'); } finally { teardown(); }
});

test('a concept with policy none offers nothing and is offered nowhere, family or not', () => {
  setup();
  try {
    assert.equal(missing(P.wineRed, 'chainF'), null, 'red wine borrows nothing from its family');
    assert.equal(line(compare(P.wineRed), 'chainF').alternative, null);
    const tree = buildFamilyTree(TREE, compileRules(RULES));
    assert.deepEqual(tree.get('wine-sparkling').concepts, ['wine-red', 'wine-sparkling'], 'the family itself stands');
    const sparklingOnly = evaluateSubstitutes({ product: P.wineSparkling, qty: 1, chainId: 'chainH', mapping, policy: 'cheapest', purpose: 'missing', referencePrice: 40, scope: 'family' });
    assert.equal(sparklingOnly.length, 0, 'and a none concept is never a candidate for its siblings');
  } finally { teardown(); }
});

test('two leaves whose concepts measure in different units are refused on size', () => {
  setup();
  try {
    assert.equal(missing(P.creamSweet, 'chainF'), null, '250 ml sweet cream is not 250 g of cream cheese');
    const [e] = evaluateSubstitutes({ product: P.creamSweet, qty: 1, chainId: 'chainF', mapping, policy: 'cheapest', purpose: 'missing', referencePrice: 7, scope: 'family' });
    assert.equal(e.reason, 'size');
    // The rule itself: sameSizeUnit false refuses only across concepts.
    const base = { category: 'חלב וביצים', isWeighted: false, size: g(250), name: 'שמנת' };
    assert.equal(compatible({ product: { ...base, conceptId: 'cream-sweet' }, candidate: { ...base, conceptId: 'cream-cheese' }, requireSize: true, sameSizeUnit: false, purpose: 'missing' }).reason, 'size');
    assert.deepEqual(compatible({ product: { ...base, conceptId: 'cream-sweet' }, candidate: { ...base, conceptId: 'cream-sweet' }, requireSize: true, sameSizeUnit: false, purpose: 'missing' }), { ok: true });
  } finally { teardown(); }
});

test('the other rules hold across the family: fresh/frozen twins, flavour, no stacked softening', () => {
  setup();
  try {
    assert.equal(missing(P.entrecote, 'chainF'), null, 'frozen entrecote is not fresh entrecote, though its name omits קפוא');
    const twin = evaluateSubstitutes({ product: P.entrecote, qty: 1, chainId: 'chainF', mapping, policy: 'cheapest', purpose: 'missing', referencePrice: 90, scope: 'family' });
    assert.deepEqual(twin.map((e) => [e.candidate.id, e.reason]), [['entrecote-frozen', 'form']], 'refused on form, not merely unsold');
    assert.equal(missing(P.puddingChoc, 'chainF'), null, 'vanilla pudding is another flavour, refused across a family');
    const base = { category: 'מאפים ולחם', isWeighted: false, name: 'לחם', brand: 'אחד' };
    const r = { product: { ...base, conceptId: 'bread-rye', size: g(500) }, requireSize: true, purpose: 'missing' };
    assert.equal(compatible({ ...r, candidate: { ...base, conceptId: 'bread-spelt', size: g(1000) } }).reason, 'size', 'other-size does not stack on other-family');
    assert.equal(compatible({ ...r, product: { ...r.product, size: null }, candidate: { ...base, conceptId: 'bread-spelt', size: g(500) } }).reason, 'size', 'nor size-unconfirmed');
    assert.deepEqual(compatible({ ...r, candidate: { ...base, conceptId: 'bread-rye', size: g(1000) } }), { ok: true, caveats: ['other-size'] }, 'within the leaf it still softens');
  } finally { teardown(); }
});

test('rules.json families: every key names a family of the concept tree, every `without` one of its leaves', () => {
  // Rot guard, against the live config (like test/conceptFamilies.test.js for families.json): a renamed concept or
  // a regrouped family leaves a switch that silently does nothing - the cream/soy families would stand in again.
  const raw = JSON.parse(readFileSync(RULES_FILE, 'utf8')).families ?? {};
  const tree = families(concepts()).filter((f) => f.conceptIds.length > 1);
  for (const [key, entry] of Object.entries(raw)) {
    if (key.startsWith('_') || entry.concepts) continue;
    const [id, category] = key.split('@');
    const hits = tree.filter((f) => f.id === id && (!category || f.category === category));
    assert.ok(hits.length, `rules.json families.${key}: no family "${id}"${category ? ` in ${category}` : ''} in config/concepts`);
    for (const c of entry.without ?? []) assert.ok(hits.some((f) => f.conceptIds.includes(c)), `rules.json families.${key}.without: ${c} is not one of its leaves`);
  }
});

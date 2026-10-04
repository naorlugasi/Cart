import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAttrs, normalizeBrandField, buildBrandLexicon, setBrandLexicon, brandLexicon, computeAttrsVersion,
} from '../src/catalog/attrs.js';
import { attachProductAttrs } from '../scripts/build-products.mjs';

test.afterEach(() => setBrandLexicon(new Set()));

// --- negation ----------------------------------------------------------------

test('extractAttrs: negation is checked before the positive word - "ללא בישום" reads unscented, never also scented', () => {
  const { attrs, conflicts } = extractAttrs(['מגבונים לחים ללא בישום מארז רביעיה', 'מגבונים ללא בישום 56 יח']);
  assert.equal(attrs.scent, 'unscented');
  assert.equal(conflicts.length, 0);
});

test('extractAttrs: a plain positive word with no negation reads the positive value', () => {
  const { attrs } = extractAttrs(['מגבונים לחים בניחוח עדין מארז רביעיה', 'מגבונים מבושם 56 יח']);
  assert.equal(attrs.scent, 'scented');
});

test('extractAttrs: a group with no configured explicit opposite negates to "!id" (container has none)', () => {
  const { attrs } = extractAttrs(['ממתקים ללא קופסה 200 גרם']);
  assert.equal(attrs.container, '!box');
});

// --- union across names --------------------------------------------------------

test('extractAttrs: flavour is the union of variant words across every full name, not just one', () => {
  const names = ['מגבוני האגיס אלוורה 4*56', 'רביעיית מגבון אלוורה ושקד האגיס 56 יחידות', 'מגבוני האגיס קמומיל רבעייה'];
  const { attrs } = extractAttrs(names, { conceptId: 'baby-wipes' });
  assert.deepEqual(attrs.flavour, ['אלוורה', 'קמומיל', 'שקד'].sort());
});

test('extractAttrs: diet is a union SET, lactose-free and sugar-free both read from different names', () => {
  const names = ['גבינה לבנה ללא לקטוז 5% 250 גרם', 'גבינה לבנה דיאט 250 גר'];
  const { attrs } = extractAttrs(names);
  assert.deepEqual(attrs.diet.sort(), ['lactose-free', 'sugar-free'].sort());
});

// --- truncated name does not vote ----------------------------------------------

test('extractAttrs: a name that is a prefix of a longer name for the same barcode does not vote', () => {
  // "קפוא" sits right where the short name is cut off; the fuller name says the product is sliced, not frozen.
  const full = 'פילה סלמון פרוס טרי 200 גרם ארוז בוואקום';
  const truncated = full.slice(0, 10); // "פילה סלמו" - a prefix with no form word at all
  const { attrs } = extractAttrs([truncated, full]);
  assert.equal(attrs.state, 'fresh');
  assert.equal(attrs.form, 'sliced');
});

test('extractAttrs: every name is kept when they are all prefixes of each other (nothing left otherwise)', () => {
  const { attrs } = extractAttrs(['מגבוני האגיס', 'מגבוני האגיס ']);
  assert.deepEqual(attrs, {});
});

// --- conflict -> absent, and reported -------------------------------------------

test('extractAttrs: two full names reading two different scalar values is a conflict - the key is absent', () => {
  const names = ['פילה סלמון קפוא ארוז בוואקום', 'פילה סלמון טרי ארוז בוואקום'];
  const { attrs, conflicts } = extractAttrs(names);
  assert.ok(!('state' in attrs), 'state must be ABSENT on a conflict, never a guessed value');
  const c = conflicts.find((x) => x.key === 'state');
  assert.ok(c, 'the conflict must be reported');
  assert.deepEqual(new Set(c.values.map((v) => v.value)), new Set(['frozen', 'fresh']));
});

test('extractAttrs: a value every name read wins even when one name read a second one (canned+smoked vs smoked)', () => {
  const { attrs, conflicts } = extractAttrs(['כבד דג מעושן 121 גר BRIVAIS VILNIS', 'שימורי כבד דג מעושן']);
  assert.equal(attrs.state, 'smoked');
  assert.ok(!conflicts.some((c) => c.key === 'state'));
});

test('extractAttrs: a clear majority of names resolves a scalar (4 sliced vs 1 chopped); 1:1 stays a conflict', () => {
  const four = ['לבבות דקל פרוסות במי מלח', 'לבבות דקל פרוסות תומר 400 גרם', 'לבבות דקל פרוס 400 גרם', 'לבבות דקל חתוך'];
  assert.equal(extractAttrs(four).attrs.form, 'sliced');
  const two = ['לבבות דקל פרוסות במי מלח', 'לבבות דקל חתוך במי מלח'];
  const r = extractAttrs(two);
  assert.ok(!('form' in r.attrs));
  assert.ok(r.conflicts.some((c) => c.key === 'form'));
});

test('extractAttrs: מסטיק is not a stick and דלי-קט is not a bucket', () => {
  assert.equal(extractAttrs(['מסטיק אורביט ספירמינט', 'אורביט מסטיק בקבוקון ספירמינט 64.4 גר']).attrs.container, 'bottle');
  assert.equal(extractAttrs(['פרמיו דלי-קט עם סלמון בג\'לי לחתול בוגר', 'פרמיו דלי קט סלמון פאוץ']).attrs.container, 'pouch');
  assert.equal(extractAttrs(['דאודורנט סטיק רקסונה']).attrs.container, 'stick');
});

test('extractAttrs: a code kind conflict (stage 4 vs 5) does not blank an unrelated code kind on the same product', () => {
  const names = ['חיתולי האגיס שלב 4 מידה L 42 יחידות', 'חיתולי האגיס שלב 5 מידה L 42 יחידות'];
  const { attrs, conflicts } = extractAttrs(names);
  const kinds = (attrs.code ?? []).map((c) => c.kind);
  assert.ok(!kinds.includes('stage'), 'stage conflicted and must be absent');
  assert.ok(kinds.includes('size'), 'size did not conflict and must still be published');
  assert.ok(conflicts.some((c) => c.key === 'code.stage'));
});

// --- brand -----------------------------------------------------------------

test('normalizeBrandField: a filler value ("," / "לא ידוע" / "כללי" / empty) is no brand at all', () => {
  assert.equal(normalizeBrandField(','), null);
  assert.equal(normalizeBrandField('לא ידוע'), null);
  assert.equal(normalizeBrandField('כללי'), null);
  assert.equal(normalizeBrandField(''), null);
  assert.equal(normalizeBrandField(null), null);
});

test('normalizeBrandField: legal-entity suffixes and punctuation are stripped, a real brand survives', () => {
  assert.equal(normalizeBrandField('תנובה בע"מ'), 'תנובה');
  assert.equal(normalizeBrandField('שטראוס, תעשיות'), 'שטראוס');
});

test('extractAttrs: brand field majority wins across chains, filler rows are ignored', () => {
  const { attrs } = extractAttrs(['קוטג 5% 250 גרם', 'קוטג׳ 5% 250 גר'], { brandField: ['תנובה', 'תנובה', ',', 'כללי'] });
  assert.equal(attrs.brand, 'תנובה');
});

test('extractAttrs: with no usable brand field, a lexicon word found in the name fills the gap', () => {
  setBrandLexicon(buildBrandLexicon(new Array(5).fill('תנובה')));
  const { attrs } = extractAttrs(['יוגורט תנובה ליין 150 גרם'], { brandField: [',', ''] });
  assert.equal(attrs.brand, 'תנובה');
});

test('buildBrandLexicon: a word needs >= 5 products carrying it as their brand field to enter the lexicon', () => {
  const lex4 = buildBrandLexicon(new Array(4).fill('מיתולוגיה'));
  assert.ok(!lex4.has('מיתולוגיה'));
  const lex5 = buildBrandLexicon(new Array(5).fill('מיתולוגיה'));
  assert.ok(lex5.has('מיתולוגיה'));
});

// --- each key on realistic names ------------------------------------------------

test('extractAttrs: state/form/container/scent/code/flavour/diet each read from a realistic name', () => {
  const r1 = extractAttrs(['פילה סלמון קפוא פרוס 400 גרם']);
  assert.equal(r1.attrs.state, 'frozen');
  assert.equal(r1.attrs.form, 'sliced');

  const r2 = extractAttrs(['שמפו לכל סוגי השיער בבקבוק משאבה 700 מל']);
  assert.equal(r2.attrs.container, 'bottle');

  const r3 = extractAttrs(['מגבוני תינוקות בניחוח קמומיל 64 יח', 'מגבונים ברביעיה בניחוח קמומיל']);
  assert.equal(r3.attrs.scent, 'scented');

  const r4 = extractAttrs(['חיתולי מידה 4 שלב 4 ענק 42 יחידות']);
  const kinds = new Map((r4.attrs.code ?? []).map((c) => [c.kind, c.value]));
  assert.equal(kinds.get('stage'), '4');

  const r5 = extractAttrs(['יוגורט תות שדה 3% 150 גרם']);
  assert.ok(r5.attrs.flavour?.includes('תות'));

  const r6 = extractAttrs(['חלב ללא לקטוז 1% 1 ליטר']);
  assert.deepEqual(r6.attrs.diet, ['lactose-free']);
});

test('extractAttrs: dose and model codes are told apart - a vitamin code is not also a generic model', () => {
  const dose = extractAttrs(['כמוסות ויטמין D 1000 90 יחידות']);
  assert.deepEqual(dose.attrs.code, [{ kind: 'dose', value: 'D-1000' }]);

  const model = extractAttrs(['מקדחה אלחוטית דגם K300 חדשה']);
  assert.deepEqual(model.attrs.code, [{ kind: 'model', value: 'K300' }]);
});

// --- attrsVersion -------------------------------------------------------------

test('computeAttrsVersion: a stable hash of the same inputs, different when attributes.json changes', () => {
  const rawAttrs = { state: {}, form: {}, container: {}, scent: {}, code: {} };
  const rawRules = { form: { a: ['x'] }, diet: {}, variant: { words: [] } };
  const v1 = computeAttrsVersion(rawAttrs, rawRules);
  const v2 = computeAttrsVersion(rawAttrs, rawRules);
  assert.equal(v1, v2);
  const v3 = computeAttrsVersion({ ...rawAttrs, state: { fresh: {} } }, rawRules);
  assert.notEqual(v1, v3);
});

// --- build-level: products carry attrs, other fields untouched -------------------

test('attachProductAttrs: products gain `attrs`, and every other field is left exactly as it was', () => {
  const products = [
    { id: 'g1', gtin: '1', name: 'פילה סלמון קפוא 400 גרם', category: 'ירקות ופירות', brand: 'דין', conceptId: null, chains: 3, aliases: [], basePrice: 40 },
    { id: 'g2', gtin: null, name: 'עגבנייה', category: 'ירקות ופירות', kind: 'concept', conceptId: 'tomato' },
  ];
  const before = JSON.parse(JSON.stringify(products));
  const namesByGtin = new Map([['1', [{ chain: 'a', name: 'פילה סלמון קפוא 400 גרם' }, { chain: 'b', name: 'פילה סלמון קפוא ארוז 400 גר' }]]]);
  const { byKey, queueItems } = attachProductAttrs(products, { namesByGtin, brandsByGtin: new Map([['1', ['דין', 'דין']]]) });
  assert.equal(products[1].attrs, undefined, 'a concept product (no gtin) never gets attrs');
  assert.ok(products[0].attrs && Object.keys(products[0].attrs).length, 'the barcoded product gets attrs');
  assert.equal(products[0].attrs.state, 'frozen');
  // every field that was already there is untouched
  for (const key of Object.keys(before[0])) assert.deepEqual(products[0][key], before[0][key]);
  assert.ok(byKey.state?.read >= 1);
  assert.equal(queueItems.length, 0);
});

test('attachProductAttrs: an attrs conflict becomes a review-queue item shaped like productChecks.js items', () => {
  const products = [{ id: 'g1', gtin: '1', name: 'פילה סלמון', category: 'ירקות ופירות', brand: null, conceptId: null, chains: 2 }];
  const namesByGtin = new Map([['1', [{ chain: 'a', name: 'פילה סלמון קפוא' }, { chain: 'b', name: 'פילה סלמון טרי' }]]]);
  const { queueItems } = attachProductAttrs(products, { namesByGtin, brandsByGtin: new Map() });
  assert.equal(queueItems.length, 1);
  const item = queueItems[0];
  assert.deepEqual(Object.keys(item).sort(), ['category', 'chains', 'checks', 'conceptId', 'id', 'name', 'names'].sort());
  assert.equal(item.id, 'g1');
  const check = item.checks.find((c) => c.rule === 'attrs-conflict');
  assert.ok(check);
  assert.ok(['rule', 'priority', 'detail', 'suggestion'].every((k) => k in check));
  assert.match(check.detail, /state/);
  assert.ok(check.suggestion.startsWith('attrs.state'));
});

test('attachProductAttrs: a verified attrs.<key> record wins outright and suppresses the conflict', () => {
  const products = [{ id: 'g1', gtin: '1', name: 'פילה סלמון', category: 'ירקות ופירות', brand: null, conceptId: null, chains: 2 }];
  const namesByGtin = new Map([['1', [{ chain: 'a', name: 'פילה סלמון קפוא' }, { chain: 'b', name: 'פילה סלמון טרי' }]]]);
  const verifiedOf = (id) => (id === 'g1' ? { attrs: { state: 'frozen' } } : null);
  const { queueItems } = attachProductAttrs(products, { namesByGtin, brandsByGtin: new Map(), verifiedOf });
  assert.equal(queueItems.length, 0, 'a decided key is never queued as a conflict');
  assert.equal(products[0].attrs.state, 'frozen');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept, conceptById } from '../src/catalog/concepts.js';
import { categorize } from '../src/catalog/categorize.js';

/**
 * Naor's seven decisions from the morning of 12.10.2026 (concepts-decisions-1210):
 *
 *   1. "עוגיות אוראו" -> cookies-oreo (reversed from the Opus snacks review, which put אוראו into
 *      cookies-sandwich-filled's any). A Milka-brand cookie merely flavoured with Oreo filling
 *      ("סנסיישן") stays a generic sandwich cookie, not an Oreo.
 *   2. charcoal (loose פחם/פחמים/פחם דחוס) gets its own leaf beside charcoal-lighter and grill-bbq.
 *   3. soup-bag (מרק עשיר / מרק היום, the sachet you cook in a pot) and soup-ready (ready-to-eat,
 *      צנצנת/קופסה/קרטון, chilled or shelf-stable organic soups) join bouillon-stock/soup-instant/
 *      soup-borscht as the four soup forms.
 *   4. water-distilled moves from drinks.json (משקאות) to household.json (ניקיון וטואלטיקה) - same id.
 *   5. cocktail-rtd merged into alcoholic-mixed-drink (the published catalog's id, used by double the
 *      products) - one leaf for every ready-to-drink alcoholic can/bottle.
 *   6. juice-grape widens from תירוש-only to the fruit word ענבים itself, with juice-mixed stepping
 *      back for it (wine/biscuit guards kept).
 *   7. blueberry rule coverage for "אוכמניות כחולות 400 גרם" (gtin g7290019035084): the concept rules
 *      already resolve it to blueberry - the gap in production is a stale config/products/verified.json
 *      null override from 28.9, predating the blueberry-frozen concept (outside this round's file scope;
 *      flagged separately).
 *
 * One capture and one near-miss per decision, per .claude/skills/taxonomy's own convention.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);
const gone = (id) => assert.equal(conceptById(id, concepts), null, `${id} should be gone`);

test('1. cookies-oreo takes every real Oreo line; a Milka-brand cookie merely flavoured with Oreo stays generic', () => {
  is('עוגיות אוראו 176 גרם', 'cookies-oreo');
  is('אוראו גולדן 154 גר', 'cookies-oreo');
  is('אוראו פאדג שוקולד חלב 246 גרם', 'cookies-oreo');
  isNot('עוגיות מילקה סנסיישן אוראו 156 גרם', 'cookies-oreo');
  is('עוגיות מילקה סנסיישן אוראו 156 גרם', 'cookies-sandwich-filled');
  isNot('שוקולד מילקה אוראו 100 גרם', 'cookies-oreo');
  isNot('פיינט אוראו 300 גרם', 'cookies-oreo');
});

test('2. charcoal is a leaf (Naor 12.10): loose פחם/פחמים is its own concept, not the grill or the lighter', () => {
  is('פחם למנגל 2 ק"ג', 'charcoal');
  is('פחמים 2 ק"ג רמי לוי', 'charcoal');
  is('פחם דחוס טופ גריל 3 ק"ג', 'charcoal');
  isNot('מדליק פחמים', 'charcoal');
  is('מדליק פחמים', 'charcoal-lighter');
  isNot('מנגל פחמים מהודר ברזילאי', 'charcoal');
  isNot('משחת שיניים קולגייט טוטאל עם פחם', 'charcoal');
  isNot('פחמים גריל פרימיום שקד 2 ק"ג', 'almonds-snack');
});

test('3. soup-bag (sachet you cook) and soup-ready (already a soup) are forms, not flavours', () => {
  is('מרק עשיר עוף אטריות 74 גרם כפרית קנור', 'soup-bag');
  is('מרק היום אפונה 117 גרם', 'soup-bag');
  isNot('מרק אפונה עשיר בירקות סנפרוסט 570 גרם', 'soup-bag'); // "עשיר" here means "rich in", not the Knorr line
  is('allgood מרק עגבניות קרמי אורגני 400', 'soup-ready');
  is('מרק עדשים אורגני אאוגה 400 גרם', 'soup-ready');
  isNot('מרק עדשים אורגני אאוגה 400 גרם', 'lentils'); // a lentil SOUP is not the raw legume
  isNot('מרק בורשט אורגני אאוגה 400 גרם', 'soup-ready'); // borscht keeps its own dedicated leaf
  is('מרק בורשט אורגני אאוגה 400 גרם', 'soup-borscht');
  isNot('אבקת מרק עוף קנור 400 גרם-צנצנת', 'soup-ready'); // a jar of powder is bouillon-stock, not ready
  is('אבקת מרק עוף קנור 400 גרם-צנצנת', 'bouillon-stock');
});

test('4. water-distilled moved to ניקיון וטואלטיקה (same id) and no longer lives in drinks.json', () => {
  const c = conceptById('water-distilled', concepts);
  assert.equal(c.category, 'ניקיון וטואלטיקה');
  assert.equal(c.file, 'household.json');
  assert.equal(categorize('מים מזוקקים 4 ליטר', 'water-distilled'), 'ניקיון וטואלטיקה');
  is('מים מזוקקים 4 ליטר', 'water-distilled');
});

test('5. cocktail-rtd merged into alcoholic-mixed-drink - no dangling id, one leaf for RTD alcohol', () => {
  gone('cocktail-rtd');
  is('באזז קוקטיילים מוחיטו', 'alcoholic-mixed-drink');
  is('קוארפו קוקטייל מוחיטו 750 מ"ל', 'alcoholic-mixed-drink');
  is('בקרדי בריזר לימון 275', 'alcoholic-mixed-drink');
  is('סמירנופ אייס 275 מל', 'alcoholic-mixed-drink');
});

test('6. juice-grape widens to the fruit word itself; juice-mixed steps back for grape', () => {
  is('מיץ ענבים אדום 1 ליטר', 'juice-grape');
  is("ויטמינצ'יק ענבים 1 ליטר", 'juice-grape');
  is('פריגת ענבים 1.5 ליטר', 'juice-grape');
  isNot('מיץ ענבים אדום 1 ליטר', 'juice-mixed');
  is('מיץ ענבים תירוש רוזה יקבי כרמל 1 ליטר', 'juice-grape'); // rosé grape JUICE, not wine - keeps matching
  isNot('ענבים אדומים אורגניים', 'juice-grape'); // fresh table grapes, no juice word at all
  is('מיץ אפרסקים 1 ליטר', 'juice-mixed'); // an unrelated fruit still goes to the generic mixed leaf
});

test('7. blueberry rule coverage: the concept layer already resolves the barcode whose three chain names disagree', () => {
  // gtin g7290019035084 ("אוכמניות כחולות 400 גרם", 10 chains) carries three raw names across chains
  // (node scripts/concept-why.mjs 7290019035084): two plain, one explicitly "קפוא" (frozen). The rules
  // below show each resolves correctly on its own; production is still null only because of a stale
  // config/products/verified.json override from 28.9 that predates blueberry-frozen (outside this
  // round's file scope - flagged separately, task_97534dfa).
  is('אוכמניות כחולות', 'blueberry');
  is('אוכמניות כחולות 400 גרם', 'blueberry');
  is('אוכמניות כחולות קפוא', 'blueberry-frozen');
  isNot('אוכמניות כחולות קפואות בציפוי שוקולד חלב 140 גרם', 'blueberry'); // chocolate-coated, a different product
});

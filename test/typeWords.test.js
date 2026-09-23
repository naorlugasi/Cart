/**
 * The central type-word vocabulary (config/concepts/type-words.json, docs/PLAN-PRODUCT-TRUTH.md stage ו):
 * a `fresh` concept (produce, raw meat/poultry cuts) never matches a name that says what it actually is in
 * processed-product language - a spice jar, a can, a drink, a frozen breaded shape - and a `processed`
 * concept never matches a name whose only evidence is a fresh-produce word. This is the single mechanism
 * that replaced the per-concept `none` lists every fresh-produce concept used to repeat (docs/CONCEPTS.md
 * §9). These are the concrete cases the mechanism exists for: the 23.9 parsley-spice report, the 22.9
 * review's follow-ups, and the deliberate keeps that prove the guard is not simply "no type word ever
 * matches a fresh concept".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

const concepts = loadConcepts();

test('today\'s list (23.9): a processed product never carries the fresh concept its ingredient shares a name with', () => {
  const cases = [
    ['מימון פטרוזיליה במיכ 25 גרם', 'herb-parsley'],
    ['קנור מרק בצל', 'onion-yellow'],
    ['עגבניות מוחמצות', 'tomato'],
    ['חציל מרוקאי', 'eggplant-fresh'],
    ['גאמפ מנגו', 'mango-fresh'],
    ['אקטיביה שזיף', 'plum-red'],
    ['אקטיביה שזיף', 'plum-black'],
    ['אקטיביה שזיף', 'plum-green'],
    ['נאגטס עוף', 'schnitzel-chicken'], // breaded nuggets are not the schnitzel concept either, once נאגטס left its match.all
    ['פסטרמה חזה בקר', 'beef-cuts'], // pastrami is not a raw beef cut
    ['גולד סטייק ציפס קפוא', 'beef-steak'], // frozen chips shaped like a steak
    ['פטריות סטייק פורטובלו', 'beef-steak'], // a mushroom "steak" is not beef
  ];
  for (const [name, forbidden] of cases) {
    assert.notEqual(assignConcept(name, concepts), forbidden, `"${name}" must not be ${forbidden}`);
  }
});

test('the 22.9 review follow-ups', () => {
  const cases = [
    ['זוג כפפות גומי בתוספת אלוורה', 'aloe-drink'], // rubber gloves, not an aloe drink
    ['פרוט & ווג תפוז מנדרינה גזר', 'carrot'], // a mixed juice naming its fruit/veg content
    ['אורז אדום', 'rice-white'], // red rice is not white rice
    ['מנה חמה תערובת להכנת', 'baking-mix'], // a hot-meal mix, not the baking-mix concept
    ['קולגייט מברשת ילדים', 'cleaning-brush'], // a child's toothbrush, not a cleaning brush
    ['מח.תפוח פרינוק', 'apple-golden'], // apple purée/sauce is not the fresh apple
    ['מח.תפוח פרינוק', 'apple-granny'],
    ['מח.תפוח פרינוק', 'apple-red'],
    ['מח.תפוח פרינוק', 'apple-pink'],
  ];
  for (const [name, forbidden] of cases) {
    assert.notEqual(assignConcept(name, concepts), forbidden, `"${name}" must not be ${forbidden}`);
  }
});

test('deliberate keeps: the guard does not block the fresh product itself', () => {
  assert.equal(assignConcept('מימון פטרוזיליה שקית', concepts), 'herb-parsley', 'a bagged bunch is still fresh parsley, even sold under a brand');
  assert.equal(assignConcept('לבבות חסה קראנץ', concepts), 'lettuce');
  assert.equal(assignConcept('עגבניות', concepts), 'tomato');
  assert.equal(assignConcept('פטרוזיליה', concepts), 'herb-parsley');
  assert.equal(assignConcept('חציל', concepts), 'eggplant-fresh');
  // "שניצל עוף טרי" is deliberately not asserted here: schnitzel-chicken is a processed (breaded/frozen)
  // concept, and there is no separate "fresh chicken schnitzel" concept for "טרי" to resolve to - the
  // guard correctly returns null for it (docs/PLAN-PRODUCT-TRUTH.md stage ו).
});

test('herbs sold both fresh and dried stay one concept (kind: any)', () => {
  for (const id of ['herb-cilantro', 'herb-parsley', 'herb-mint', 'herb-dill']) {
    const concept = concepts.find((c) => c.id === id);
    assert.equal(concept.kind, 'any', `${id} must be kind: any so dried and fresh forms both stay the concept`);
  }
});

test('flavour-identity drinks and dairy stay one concept (kind: any)', () => {
  for (const id of ['water-flavored', 'yogurt-fruit', 'soda-fruit-flavored', 'iced-tea', 'aloe-drink', 'flavored-syrup']) {
    const concept = concepts.find((c) => c.id === id);
    assert.equal(concept.kind, 'any', `${id} must be kind: any - the flavour word is not decoration for these`);
  }
});

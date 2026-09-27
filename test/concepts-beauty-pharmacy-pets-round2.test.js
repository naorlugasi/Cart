import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

const concepts = loadConcepts();

/**
 * Round 2 on the same three files owned by the round-1 agent (beauty.json, pharmacy.json, pets.json):
 * synonym coverage (scripts/concept-synonyms.mjs) plus three specific gaps the round-1 report left open
 * (perfume, calcium, dry dog food) - see ops/taxonomy/beauty-pharmacy-pets-round2.md for the full
 * measurement and the decisions behind each guard below.
 */

// ---------------------------------------------------------------------------------------------------
// perfume (beauty.json, new) - split from laundry/air-freshener scent words that also use "בושם"
// ---------------------------------------------------------------------------------------------------

test('perfume: EDP/EDT abbreviations and בושם capture a real fragrance', () => {
  assert.equal(assignConcept('1מיליון רויאל אדפ ג.100מ', concepts), 'perfume');
  assert.equal(assignConcept('24 קראט אדט 75 מ"ל', concepts), 'perfume');
  assert.equal(assignConcept('בושם מספר 22 100 מ"ל', concepts), 'perfume');
  assert.equal(assignConcept('בוס בוטלד פרפיום 100מל', concepts), 'perfume');
});

test('perfume: a laundry scent-booster or air freshener never captures, even though it also says בושם', () => {
  assert.notEqual(assignConcept('בושם מרוכז לכביסה FOREVER ורוד', concepts), 'perfume');
  assert.notEqual(assignConcept('לנור כדוריות הבושם בניחוח אריאל 495 גרם', concepts), 'perfume');
  assert.notEqual(assignConcept('מבשם בדים בניחוח מאסק פלאוורס פרפיום קלין 750 מ"ל', concepts), 'perfume');
  assert.notEqual(assignConcept('סנומוד ליידי קוקו Lady COCO בושם לבית', concepts), 'perfume');
});

test('perfume: an unscented ("ללא בושם") cream keeps its own concept instead of conflicting with perfume', () => {
  assert.equal(assignConcept('קרם רב שימושי ללא בושם', concepts), 'skin-face-cream');
  assert.equal(assignConcept('קרם ידיים sensitive לעור יבש ורגיש ללא בושם', concepts), 'skin-hand-cream');
});

test('perfume: a perfume+lotion gift-set bundle gets no concept rather than an arbitrary one', () => {
  assert.equal(assignConcept('פרוזן בושם50+ת.גוף150', concepts), null);
  assert.equal(assignConcept('ברבי בושם 50 ותחליב גוף', concepts), null);
});

// ---------------------------------------------------------------------------------------------------
// calcium (pharmacy.json, new) - honest single-nutrient split: a combo stays conceptless, same as its
// vitamin-c/d/e/magnesium/zinc siblings already do for each other
// ---------------------------------------------------------------------------------------------------

test('calcium: a plain calcium supplement captures, a calcium+D or calcium+magnesium combo does not', () => {
  assert.equal(assignConcept('סידן ציטראט חיסכון', concepts), 'calcium');
  assert.equal(assignConcept('קלציום 600 סופהרב', concepts), 'calcium');
  assert.equal(assignConcept('קורל קלציום 90 כמוסות', concepts), 'calcium');
  assert.notEqual(assignConcept('סידן ציטראט +ויטמין D', concepts), 'calcium');
  assert.notEqual(assignConcept('סידן ומגנזיום ט.תות 473מ', concepts), 'calcium');
  assert.notEqual(assignConcept('קלציום מגנזיום אבץ100טבל', concepts), 'calcium');
});

test('calcium: a calcium-magnesium combo is no longer mislabeled as plain magnesium either', () => {
  assert.notEqual(assignConcept('סידן ומגנזיום ט.תות 473מ', concepts), 'magnesium');
});

test('calcium: a calcium-fortified food (milk, tofu, soy drink, cheese, tahini, dog treat) never gets the calcium concept', () => {
  assert.notEqual(assignConcept('חלב יטבתה 3% שומן מועשר בסידן ובויטמין D', concepts), 'calcium');
  assert.notEqual(assignConcept('טופו רך בתוספת סידן וילר 300 גרם', concepts), 'calcium');
  assert.equal(assignConcept('משקה סויה עשיר בסידן', concepts), 'soy-milk-drink');
  assert.equal(assignConcept('קוטג 5% עם סידן 250', concepts), 'cottage-5');
  assert.equal(assignConcept('טחינה משומשום מלא פי 6 סידן', concepts), 'tahini-raw');
  assert.equal(assignConcept('חטיף כלבים ברונו עצם סידן בציפוי עוף 80 גרם', concepts), 'dog-treats');
});

test('calcium: an unrelated brand name that merely contains the letters סידנ never captures (word boundary)', () => {
  assert.equal(assignConcept('בדים לסוכה 1 מטר סידנא הבבא סאלי C9 A54453 מנה 12', concepts), null);
  assert.equal(assignConcept('ליפיקאר סידנט+APרחצה200מ', concepts), null);
});

// ---------------------------------------------------------------------------------------------------
// dog-food-dry (pets.json, new) - a kilogram-sized pack next to the species word כלב, no brand in the rule
// ---------------------------------------------------------------------------------------------------

test('dog-food-dry: a כלב name in a ק"ג pack captures, the same brand without כלב stays conceptless (no brand rule)', () => {
  assert.equal(assignConcept('דוגלי בקר לכלבים בוגרים 12 ק"ג', concepts), 'dog-food-dry');
  assert.equal(assignConcept('סימבה בקר לכלב 4 ק"ג', concepts), 'dog-food-dry');
  // brand-only, no species word at all - stays unassigned by design (taxonomy TRAPS.md trap 2)
  assert.equal(assignConcept('דוגלי בוגר בקר 3 ק"ג', concepts), null);
  assert.equal(assignConcept('בונזו בשר נטול חמץ 10.2 קג', concepts), null);
});

test('dog-food-dry: a name that already says מזון stays with the general pet-food-dog concept, not a conflict', () => {
  assert.equal(assignConcept('פייבל מזון יבש לכלב בשר בריא 10 ק"ג', concepts), 'pet-food-dog');
  assert.equal(assignConcept('מזון לגורי כלבים קטנים פורינה ONE', concepts), 'pet-food-dog');
});

test('dog-food-wet: a פטה-textured name now captures too (was only פאוץ/שימור before), matching cat-food-wet', () => {
  assert.equal(assignConcept('פרמיו פטה סלמון לכלב 150ג', concepts), 'dog-food-wet');
  assert.equal(assignConcept('וונפי שימורי כלב פטה עוף 375 גרם', concepts), 'dog-food-wet');
});

// ---------------------------------------------------------------------------------------------------
// synonym forms added this round (scripts/concept-synonyms.mjs --file <beauty|pharmacy|pets>.json)
// ---------------------------------------------------------------------------------------------------

test('new synonym forms resolve to the concept that owns them (GET /catalog/concepts phrase lookup)', () => {
  const phrasesOf = (id) => {
    const c = concepts.find((x) => x.id === id);
    return c.synonyms;
  };
  assert.ok(phrasesOf('mascara').includes('מסקרות'));
  assert.ok(phrasesOf('concealer').includes('קונסילרים'));
  assert.ok(phrasesOf('face-powder').includes('פודרות'));
  assert.ok(phrasesOf('skin-hand-cream').includes('קרם לידיים'));
  assert.ok(phrasesOf('skin-eye-cream').includes('קרם לעיניים'));
  assert.ok(phrasesOf('highlighter').includes('הילייטר'));
  assert.ok(phrasesOf('vitamin-e').includes('טוקופרולים'));
  assert.ok(phrasesOf('blood-pressure-monitor').includes('מדי לחץ דם'));
  assert.ok(phrasesOf('sweetener').includes('ממתיקים'));
  assert.ok(phrasesOf('perfume').includes('פרפיום'));
  assert.ok(phrasesOf('calcium').includes('קלציום'));
});

test('no phrase (name or synonym) added this round names two concepts at once', () => {
  const phrasesOf = (c) => [...new Set([c.name, ...(c.synonyms ?? [])])];
  const owners = new Map();
  for (const c of concepts) for (const p of phrasesOf(c)) owners.set(p, [...(owners.get(p) ?? []), c.id]);
  for (const id of ['perfume', 'calcium', 'dog-food-dry']) {
    const c = concepts.find((x) => x.id === id);
    for (const p of phrasesOf(c)) assert.equal(owners.get(p).length, 1, `"${p}" is claimed by ${owners.get(p)}`);
  }
});

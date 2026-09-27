import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
import { conceptById } from '../src/catalog/concepts.js';

/**
 * Round 2: משקאות (drinks), 27.9. Two jobs.
 *
 * 1. Synonyms - 19 concepts in drinks.json were findable by one phrasing only
 * (scripts/concept-synonyms.mjs --file drinks.json). Each got the grammatical forms a shopper actually
 * types: plural/singular (juice-*), spelling variants attested in the raw catalogs (ערק/עראק,
 * וורמוט/ורמוט, קוואס/קווס), and one colloquial addition (שוקו -> משקה שוקו). arak's and vermouth's
 * `match.all` were widened alongside the synonym, since the alternate spelling is a real, uncaught raw
 * name (TRAPS #4 - "וריאציות כתיב"), not just a search-box convenience.
 *
 * 2. Coverage - config/concepts/drinks.json --top clusters that were still open after the first round:
 *  - coffee-roasted-other: 130 ground/roasted/Turkish-adjacent coffee products the department's open
 *    "קפה" cluster (33 residual, task brief) sat on. `all: ["קפה"]` is dangerous on its own - the guard
 *    list this round measured against the full ~1070-name קפה corpus turned up coffee MACHINES and
 *    descalers, capsule/instant/Turkish/iced coffee already owned by pantry.json's coffee-* concepts
 *    (deferred via `none`, not re-claimed), and, unexpectedly, coffee as a mere FLAVOUR in cake, candy,
 *    granola, yogurt, hair dye, a baguette brand and a liqueur - each is its own `none` entry below,
 *    found by re-running scripts/concept-round.mjs-style before/after matching over that corpus.
 *  - tea-black-other: pantry.json's tea-black/tea-herbal pair excludes each other's territory (תה שחור
 *    excludes גינגר/קמומיל/פירות יער/תפוח וקינמונ/צמחימ; תה חליטה excludes שחור) - so a FLAVOURED black
 *    tea satisfies neither and falls out of the concept layer entirely. This concept catches exactly
 *    that intersection; `kind: "any"` and a narrow `any` (the same 5 words) keep it from re-claiming
 *    plain black tea (that would conflict with tea-black on every ordinary bag).
 *  - syrup-maple / syrup-agave: config/concepts/drinks.json's own flavored-syrup explicitly excludes
 *    "מייפל" and "אגבה" (they are baking sweeteners, not drink concentrate) - so real maple/agave syrup
 *    had no concept at all and sat misrouted in the משקאות department via categorize.js's keyword
 *    fallback. New concepts, category "שימורים", fix both the concept gap and the department at once.
 *  - smoothie-fruit / rice-milk-drink: real clusters (סמוזי, משקה אורז) that simply had no concept yet.
 *  - water-still: "מי עדן" was already an `any` word, but `all` required the standalone word "מים" -
 *    Mei Eden's own catalog name is the construct form "מי עדן", so the brand's plain water bottles
 *    never matched. Widened `all` to accept "מי עדנ"/"מי נביעות" too; "מי עדן סודה" still defers to
 *    water-soda via the existing `none: ["סודה"]`.
 *
 * Every capture below is a real name from data/prices; every near-miss is a real collision this round's
 * measurement (scripts/concept-round.mjs --diff, plus a bespoke matchingConcepts() sweep over each
 * cluster's full raw-name corpus) actually found and guarded against - not a hypothetical.
 */

const concepts = loadConcepts();

// --- Job 1: synonyms ---

test('synonyms: thin concepts now carry the forms a shopper types', () => {
  const cases = [
    ['vodka', 'וודקה'],
    ['arak', 'עראק'],
    ['vermouth', 'ורמוט'],
    ['kvass', 'קווס'],
    ['wine-rose', 'רוזה'],
    ['chocolate-milk-drink', 'משקה שוקו'],
    ['juice-orange', 'מיץ תפוז'],
    ['juice-lemon', 'מיץ לימונים'],
  ];
  for (const [id, syn] of cases) {
    const c = conceptById(id, concepts);
    assert.ok(c.synonyms.includes(syn), `${id} is missing synonym "${syn}"`);
  }
});

test('arak: widened match.all catches the real "עראק" spelling, not just "ערק"', () => {
  assert.equal(assignConcept('עראק עלית 700 מ"ל', concepts), 'arak');
  assert.equal(assignConcept('ערק חלב 700 מל', concepts), 'arak');
});

test('vermouth: widened match.all catches the single-vav spelling too', () => {
  assert.equal(assignConcept('ורמוט דולין לבן יבש', concepts), 'vermouth');
  assert.equal(assignConcept('וורמוט מרטיני רוסטו 750 מ"ל', concepts), 'vermouth');
});

// --- Job 2: coverage ---

test('coffee-roasted-other: captures plain black/roasted coffee the department cluster left open', () => {
  assert.equal(assignConcept('קפה שחור אורגני 250 גרם', concepts), 'coffee-roasted-other');
  assert.equal(assignConcept('קפה נחלה 250 ג עם הל', concepts), 'coffee-roasted-other');
});

test('coffee-roasted-other: does not re-claim what pantry.json\'s coffee-* concepts already own', () => {
  assert.notEqual(assignConcept('פולי קפה לוואצה אורו', concepts), 'coffee-roasted-other'); // coffee-ground
  assert.equal(assignConcept('פולי קפה לוואצה אורו', concepts), 'coffee-ground');
  assert.notEqual(assignConcept('נסקפה גולד 200 גרם', concepts), 'coffee-roasted-other'); // coffee-instant territory
  assert.notEqual(assignConcept('קפסולות קפה טורקי 10', concepts), 'coffee-roasted-other'); // coffee-capsules/turkish
});

test('coffee-roasted-other: does not capture a coffee machine descaler or coffee as a mere flavour', () => {
  assert.notEqual(assignConcept('אנטי קאלק למכונת קפה 700 מ"ל', concepts), 'coffee-roasted-other');
  assert.notEqual(assignConcept('מכונת קפה NINJA דגם 601', concepts), 'coffee-roasted-other');
  assert.notEqual(assignConcept('צבע לשיער קולסטון 5/7 חום קפה', concepts), 'coffee-roasted-other');
  assert.notEqual(assignConcept('גרנולה קפה שקוף שזה טבעי 300 ג', concepts), 'coffee-roasted-other');
  assert.notEqual(assignConcept('חצי בגט קפה פלוס', concepts), 'coffee-roasted-other');
});

test('tea-black-other: captures a flavoured black tea that tea-black and tea-herbal both reject', () => {
  assert.equal(assignConcept('תה שחור גינגר אפרסק20ש', concepts), 'tea-black-other');
  assert.equal(assignConcept('תה שחור עם פירות יער', concepts), 'tea-black-other');
});

test('tea-black-other: does not re-claim plain black tea (that belongs to pantry.json\'s tea-black)', () => {
  assert.notEqual(assignConcept('ליפטון תה שחור', concepts), 'tea-black-other');
  assert.equal(assignConcept('ליפטון תה שחור', concepts), 'tea-black');
});

test('syrup-maple: captures real maple syrup, which flavored-syrup explicitly excludes', () => {
  assert.equal(assignConcept('סירופ מייפל טהור 250 מל', concepts), 'syrup-maple');
});

test('syrup-maple: does not capture a "בטעם" imitation-maple pancake syrup differently than the real thing (flavour is identity here)', () => {
  assert.equal(assignConcept('סירופ בטעם מייפל 500 גרם', concepts), 'syrup-maple');
});

test('syrup-agave: captures real agave syrup', () => {
  assert.equal(assignConcept('סירופ אגבה כחולה 660 מ"ל', concepts), 'syrup-agave');
});

test('syrup-agave: does not capture the unrelated flavored-syrup catch-all', () => {
  assert.notEqual(assignConcept('סירופ בטעם מייפל 100% טהור 250מ"ל.', concepts), 'syrup-agave');
  assert.equal(assignConcept('אבקה להכנת משקה בטעם תות', concepts), 'flavored-syrup');
});

test('smoothie-fruit: captures a fruit smoothie pouch, including the raw "סמוצי" spelling', () => {
  assert.equal(assignConcept('סמוזי תפוח קיווי 100 גר נטורה נובה', concepts), 'smoothie-fruit');
  assert.equal(assignConcept('סמוזי נטורה נובה סמוצי אגס 100 גרם', concepts), 'smoothie-fruit');
});

test('smoothie-fruit: does not capture an almond-thickened smoothie already owned by almonds-snack', () => {
  assert.notEqual(assignConcept('מחית סמוזי אורגני תפוח בננה ושקדים 100 ג', concepts), 'smoothie-fruit');
});

test('rice-milk-drink: captures rice milk', () => {
  assert.equal(assignConcept('משקה אורז אורגני 1 ליטר', concepts), 'rice-milk-drink');
});

test('rice-milk-drink: an almond-rice blend defers to the existing almond-milk concept', () => {
  assert.notEqual(assignConcept('משקה שקדים ואורז אורגני 1 ליטר', concepts), 'rice-milk-drink');
  assert.equal(assignConcept('משקה שקדים ואורז אורגני 1 ליטר', concepts), 'almond-milk');
});

test('water-still: "מי עדן" (construct form, no standalone "מים") now matches', () => {
  assert.equal(assignConcept('מי עדן 1 ליטר', concepts), 'water-still');
  assert.equal(assignConcept('מי נביעות שישייה 1.5', concepts), 'water-still');
});

test('water-still: "מי עדן סודה" still defers to water-soda, not water-still', () => {
  assert.equal(assignConcept('מי עדן סודה 1 ליטר', concepts), 'water-soda');
  assert.notEqual(assignConcept('מי עדן סודה 1 ליטר', concepts), 'water-still');
});

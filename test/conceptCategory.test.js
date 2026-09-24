/**
 * Two guards against a food concept landing on a non-food product (24.9, docs/CONCEPTS.md §12):
 *
 * 1. The food/non-food department guard (conceptForCategory, scripts/build-products.mjs): a hair-dye shade
 *    named "דבש"/"אגוז"/"קינמון", or a hand cream named "שמן זית", really does carry that word as its own
 *    word - matchingConcepts is right to see it. The guard drops the concept afterwards, once categorize()
 *    has put the product in טיפוח ויופי (non-food) and the concept's own category (שימורים/חטיפים וממתקים)
 *    is food.
 * 2. The word-start boundary on a concept's `all`/`any` patterns (matchingConcepts, src/catalog/concepts.js):
 *    "קולה" must not match as a bare substring inside "גוטוקולה" (a hair-mask brand) - the same trap
 *    docs/CONCEPTS.md already names for "חלבה" inside "מחלבה" and "טישו" inside "ארטישוק".
 *
 * These tests run the real pipeline - assignConcept, then categorize() (which itself reads the concept's
 * category first), then conceptForCategory - because guard 1 only ever fires after categorize() has put the
 * product in its department; checking assignConcept() alone would miss it entirely.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
import { categorize, FOOD_CATEGORIES } from '../src/catalog/categorize.js';
import { conceptForCategory } from '../scripts/build-products.mjs';

const concepts = loadConcepts();

/** What a product actually ends up with, end to end: pick a concept from the name, categorize the name
 * (concept category wins there), then drop the concept if it fails the food/non-food or fresh-department
 * guard - exactly what scripts/build-products.mjs does for every GTIN. */
function finalConcept(name) {
  const picked = assignConcept(name, concepts);
  const category = categorize(name, picked);
  return conceptForCategory(picked, category, concepts);
}

test('24.9: cosmetics named after a food never end up with a food concept', () => {
  const cases = [
    ['צבע לשיער פרוטאין קולור- 7.3 דבש', 'honey'], // a hair-dye shade named "honey"
    ['צבע לשיער קולסטון - 6/75 חום אגוז בינוני', 'walnuts'], // a hair-dye shade named "nut brown"
    ['צבע לשיער פלטה דלוקס 7-65 קינמון', 'spice-cinnamon'], // a hair-dye shade named "cinnamon"
    ['מסכת קרטין גוטוקולה', 'cola'], // "קולה" inside "גוטוקולה" - the substring trap, guard 2
    ['תחליב ידיים שמן זית פמלי', 'oil-olive'], // a hand lotion named "olive oil"
    ['מסכת דבש 120 גרם', 'honey'], // a hair mask named "honey"
  ];
  for (const [name, forbidden] of cases) {
    assert.notEqual(finalConcept(name), forbidden, `"${name}" must not end up as ${forbidden}`);
  }
});

test('24.9: the real food these cosmetics are named after keeps its concept', () => {
  assert.equal(finalConcept('דבש טהור 500 גרם'), 'honey');
  assert.equal(finalConcept('קוקה קולה 1.5 ליטר'), 'cola');
  assert.equal(finalConcept('שמן זית כתית מעולה 750 מל'), 'oil-olive');
  assert.equal(finalConcept('אגוזי מלך קלופים 200 גרם'), 'walnuts');
  assert.equal(finalConcept('קינמון טחון 100 גרם'), 'spice-cinnamon');
});

test('24.9: matchingConcepts word-start boundary - the same substring trap docs/CONCEPTS.md already names', () => {
  assert.notEqual(assignConcept('ארטישוק', concepts), null); // must still resolve (to artichoke, not silenced)
  assert.equal(assignConcept('ארטישוק', concepts), 'artichoke'); // "טישו" must not match inside "ארטישוק"
  assert.equal(assignConcept('מחלבה', concepts), null); // "חלבה" must not match inside "מחלבה" (creamery)
  assert.equal(assignConcept('מסכת קרטין גוטוקולה', concepts), null); // "קולה" must not match inside "גוטוקולה"
});

test('24.9: a prefixed concept word still matches at its own word start (the boundary is not too strict)', () => {
  // Hebrew glues its one-letter prefixes onto the word ("יין וערק" = "wine AND arak"); the boundary must
  // accept the attached ו just like categorize.js's wordRule does for department keywords, not just a
  // bare "ערק" with nothing before it.
  assert.equal(assignConcept('יין וערק', concepts), 'arak');
});

test('conceptForCategory (24.9, docs/CONCEPTS.md §12): the general food/non-food guard', () => {
  const list = [
    { id: 'honey', name: 'דבש', category: 'שימורים' },
    { id: 'walnuts', name: 'אגוזי מלך', category: 'חטיפים וממתקים' },
    { id: 'shampoo', name: 'שמפו', category: 'טיפוח ויופי' },
    { id: 'hummus', name: 'חומוס', category: 'מעדנייה' },
  ];
  // a food concept dropped from a non-food product
  assert.equal(conceptForCategory('honey', 'טיפוח ויופי', list), null);
  assert.equal(conceptForCategory('walnuts', 'טיפוח ויופי', list), null);
  // a food concept kept in a neighbouring FOOD department (unchanged behaviour: only the fresh/meat
  // categories require an exact department match, docs/CONCEPTS.md §7)
  assert.equal(conceptForCategory('honey', 'מעדנייה', list), 'honey');
  // the mirror case: a non-food concept dropped from a food product
  assert.equal(conceptForCategory('shampoo', 'שימורים', list), null);
  // a food concept kept on its own food department
  assert.equal(conceptForCategory('hummus', 'מעדנייה', list), 'hummus');
  // תינוקות is treated as non-food (baby aisle mixes formula with diapers/wipes) - a food concept is
  // dropped there just like any other non-food department
  assert.equal(conceptForCategory('honey', 'תינוקות', list), null);
  assert.equal(FOOD_CATEGORIES.has('תינוקות'), false);
  assert.equal(FOOD_CATEGORIES.has('בעלי חיים'), false);
  // every category the fresh-produce/meat guard already covered keeps its exact-match behaviour
  assert.equal(conceptForCategory(null, 'שימורים', list), null);
  assert.equal(conceptForCategory('no-such-concept', 'שימורים', list), 'no-such-concept');
});

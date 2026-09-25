/**
 * A food that contains an ingredient is not that ingredient (25.9). The everyday-words round gave raisins
 * and cornflakes concepts so a shopping list could resolve them, and both concepts then claimed products
 * that merely list them: a breakfast cereal "with raisins and pecans", phyllo sticks filled with apple and
 * raisins, and a shelf of yoghurts and milk desserts sold "with cornflakes".
 *
 * The frontend session caught it on the importer and named the cost precisely: before the concepts existed
 * those words returned a wrong product marked as a guess, and after, they returned a wrong product with no
 * marking at all. A confident wrong answer is worse than a hedged one, so a round that adds a concept for
 * an everyday ingredient has to guard it against the prepared foods in the same measurement, not later.
 *
 * Note for anyone re-checking these by eye: the cereal reaches the raisin concept through ANOTHER chain's
 * name for the same barcode ("דגני Great Grains עם צימוקים ופקאן"), not through the name the site shows.
 * The build votes across every name a barcode carries (docs/CONCEPTS.md §3), so the displayed name is not
 * evidence either way - scripts/concept-why.mjs is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

const concepts = loadConcepts();

test('a prepared food that lists raisins is not raisins', () => {
  for (const name of [
    'דגני Great Grains עם צימוקים ופקאן',
    'גרייט גריינס דגני בוקר עם פירות יבשים פוסט 453 גרם',
    'מקלות פילו במלית תפוחי עץ, קינמון וצימוקים מוקפא',
  ]) assert.notEqual(assignConcept(name, concepts), 'dried-raisins', name);
});

test('a yoghurt or milk dessert sold with cornflakes is not cornflakes', () => {
  for (const name of [
    'יוגורט עם תוספת קורנפלקס',
    'יוגורט עם קורנפלקס מצופה שוקולד חלב ולבן 4%',
    'מילקי טופ קורנפלקס 141 מ"ל',
    'מעדן מילקי עם טופ קורנפלקס מצופה שוקולד',
    'הפסקת אוכל עם קורנפלקס ומשקה חלב עמיד בטעם וניל',
    'שוקלד פרה חלב קורנפלקס 100 גרם',
  ]) assert.notEqual(assignConcept(name, concepts), 'cereal-cornflakes', name);
});

test('near-miss: the real things keep their concepts, which is the point of having them', () => {
  assert.equal(assignConcept('צימוק בהיר 300 גר בקופסא', concepts), 'dried-raisins');
  assert.equal(assignConcept('צימוקים שחורים אורגני הרדוף 200 גרם', concepts), 'dried-raisins');
  assert.equal(assignConcept('קורנפלקס תלמה 400 גר', concepts), 'cereal-cornflakes');
  assert.equal(assignConcept('פתיתי תירס קלויים ללא גלוטן', concepts), 'cereal-cornflakes');
  // and the bare words a shopping list is written with still resolve
  assert.equal(assignConcept('צימוקים', concepts), 'dried-raisins');
  assert.equal(assignConcept('קורנפלקס', concepts), 'cereal-cornflakes');
});

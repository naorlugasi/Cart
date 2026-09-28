import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

const concepts = loadConcepts();

/**
 * Naor, 28.9: "טבעוני הוא מוצר בפני עצמו גם אם הוא מוצג כתחליף". A vegan product matches no animal-product
 * concept (config/concepts/type-words.json `vegan` + `veganScope`), so it is never offered as the substitute
 * for one or priced against it. Vegan products keep concepts of their own (vegan-cheese, burger-veggie...).
 */

test('a vegan product is not the animal product it imitates', () => {
  assert.notEqual(assignConcept('תחליף טונה טבעוני משומשו 160 גרם', concepts), 'tuna-canned');
  assert.notEqual(assignConcept('המבורגר ביונד מיט זוג 226 גרם', concepts), 'burger-beef');
  assert.notEqual(assignConcept('נקניקיות מן הצומח 1 ק"ג', concepts), 'sausage-other');
  assert.notEqual(assignConcept('יטבתה משקה שוקו ויגן', concepts), 'chocolate-milk-drink');
  assert.notEqual(assignConcept('מיונז טבעוני 260 גרם', concepts), 'mayonnaise');
  assert.notEqual(assignConcept('חמאה טבעונית', concepts), 'butter');
});

test('vegan cheeses share a concept of their own, in the dairy aisle', () => {
  assert.equal(assignConcept('ויולייפ צדר פרוסות 200 גרם', concepts), 'vegan-cheese');
  assert.equal(assignConcept('צהובה טבעונית בטעם מוצרלה 200 גרם', concepts), 'vegan-cheese');
  assert.equal(assignConcept('פטה קוביות במי מלח טבעוני 200 גרם', concepts), 'vegan-cheese');
});

test('"צמחי" alone is not vegan: tuna in vegetable oil is still tuna', () => {
  assert.equal(assignConcept('טונה בהירה בשמן צמחי ומלח', concepts), 'tuna-canned');
});

test('the plant-based concepts inside the dairy aisle still take their vegan products', () => {
  assert.equal(assignConcept('משקה שיבולת שועל טבעוני 1 ליטר', concepts), 'oat-milk-drink');
});

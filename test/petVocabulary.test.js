/**
 * One pet vocabulary instead of 3,683 copies of one (27.9). config/concepts/type-words.json `pet` is tested once per
 * name by matchingConcepts and by categorize, so a product FOR an animal can hold no concept outside בעלי חיים and
 * lands in בעלי חיים even when it has no concept at all.
 *
 * The copies it replaced had drifted: none carried the kitten forms until 25.9, and none of the 521 concepts that
 * lacked the list could refuse a pet food at all - so a cat pate "במרקם פטה" was sold as feta cheese and a Premio
 * salmon stick as fresh salmon. Applying ONE list to every concept exposed collisions the copies were never tested
 * against, and the cases below are those collisions, measured over every raw name.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
import { categorize } from '../src/catalog/categorize.js';

const concepts = loadConcepts();
const dept = (name) => categorize(name, assignConcept(name, concepts));

test('pet food holds no human concept and lands with the pets, including the ones the copies missed', () => {
  for (const name of [
    'פרמיו כבש במרקם פטה',            // was feta-cheese: feta.json never carried the list
    'לה קט פטה סלמון 100 גרם',        // was feta-cheese + salmon
    'פרמיו מקלות סלמון 10',           // was salmon
    'פרמיו דליקט טונה 56',            // was tuna-canned
    'פנסיפיסט נתחי עוף 85גרם',        // Fancy Feast written without the space
    'פנסי פיטס כבד מעודן ועוף',       // and with the chain's own misspelling
    'פיין דוג טעם בקר 415 גר',        // Fine Dog as well as Fine Cat
    'וונפי שימורי חתול פטה עוף 375 גר', // no "for a cat" anywhere, only the brand and "cat canned food"
  ]) {
    assert.notEqual(assignConcept(name, concepts)?.startsWith('feta') ? 'x' : 'y', 'x', `${name} must not be feta`);
    const id = assignConcept(name, concepts);
    assert.ok(id === null || ['cat', 'dog', 'pet'].some((p) => id.startsWith(p)), `${name} carried the human concept ${id}`);
    assert.equal(dept(name), 'בעלי חיים', name);
  }
});

test('near-miss: the words a pet product uses also appear on human products, and those stay human', () => {
  for (const [name, notDept] of [
    ['ביסקוויט לשונות חתול', 'בעלי חיים'],             // langues de chat, a biscuit
    ['בירה חתול שמן 330 מ"ל', 'בעלי חיים'],            // a beer called "Fat Cat"
    ['גבינה מותכת למריחה 14% החתול המחייך', 'בעלי חיים'], // a processed-cheese brand
    ['חלה רגילה בונז׳ור', 'בעלי חיים'],               // the Bonjour bakery, which normalizes to "בונזור"
    ['נקניק סלמי פיין', 'בעלי חיים'],                  // "fine", not Fine Cat
    ['פפריקה אקסטרה פנסי', 'בעלי חיים'],               // "extra fancy", not Fancy Feast
    ['בירה סטארופרמן פרמיו', 'בעלי חיים'],             // a truncated "פרמיום", not the Premio brand
  ]) assert.notEqual(dept(name), notDept, name);
  // and the ones that should keep their concept, do
  assert.equal(assignConcept('נקניק סלמי פיין', concepts), 'salami');
  assert.equal(assignConcept('חלה רגילה בונז׳ור', concepts), 'challah');
  assert.equal(assignConcept('פפריקה אקסטרה פנסי', concepts), 'spice-paprika');
  // "פרגי" is not in the vocabulary although two concepts carried it: it heads chicken thigh
  assert.equal(dept('פרגיות עוף טרי'), 'בשר ועוף');
});

test('the vocabulary is one list, not copies: no concept carries a pet word in its own none any more', async () => {
  const { typeWords } = await import('../src/catalog/concepts.js');
  const pet = new Set(typeWords().pet);
  const copies = concepts.filter((c) => (c.match?.none ?? []).some((w) => pet.has(w))).map((c) => c.id);
  assert.deepEqual(copies, [], `these concepts re-copied a pet word: ${copies.join(', ')}`);
});

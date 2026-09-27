/**
 * Sold by weight, packaged or loose is how a thing is sold, not whether it is fresh (27.9).
 *
 * A `processed` concept is blocked when a name's only type-word is a fresh one (docs/CONCEPTS.md §9), and until
 * 27.9 the fresh list also held ארוז, תפזורת and במשקל. So every processed concept was silently refused on anything
 * sold packaged or by weight - bulk nuts, deli meats and cheeses by the kilo, spices from the bin. Two rounds found it
 * independently the same day and each worked around it with `kind: any` on the concepts they held. The fix is in
 * config/concepts/type-words.json, where only טרי now counts as evidence of freshness.
 *
 * Measured over every raw name: 144 names gain a concept, none loses one, and the seven that briefly conflicted were
 * all an ingredient concept claiming a product that merely names it (TRAPS #17) - tea in a "tea sausage", walnut and
 * mustard in a flavoured gouda, chickpea in chickpea sticks, and a grill brand called שקד.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

const concepts = loadConcepts();

test('a processed product sold by weight, packaged or loose keeps its concept', () => {
  for (const [name, id] of [
    ['שקד טבעי ענק במשקל', 'almonds-snack'],
    ['אגוז קלוף במשקל', 'walnuts'],
    ['סלמי סרוולד אמיתי במשקל', 'salami'],
    ['פפריקה מתוקה במשקל', 'spice-paprika'],
    ['צימוק לבן ענק במשקל', 'dried-raisins'],
    ['אורז לבן ארוז', 'rice-white'],
    ['זית ירוק במשקל', 'olives'],
  ]) assert.equal(assignConcept(name, concepts), id, name);
});

test('near-miss: an ingredient concept still does not take a product that merely names the ingredient', () => {
  for (const [name, notId] of [
    ['נקניק תה במשקל', 'tea-black'],
    ['גאודה אגוזים הולנדי במשקל', 'walnuts'],
    ['גאודה הולנדית חרדל במשקל', 'mustard'],
    ['מקלוני חומוס במשקל', 'hummus-prepared'],
    ['מנגל ארוז בקרטון שקד', 'almonds-snack'],
  ]) assert.notEqual(assignConcept(name, concepts), notId, name);
});

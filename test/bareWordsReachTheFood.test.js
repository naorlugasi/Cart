/**
 * The bare word on a shopping list reaches the food (27.9). Measured against the deployed resolver
 * (cartBackend GET /catalog/concepts): "תפוח" and "תפוחי אדמה" returned frozen bourekas, "תפוחים" vinegar,
 * "ענבים" and "שזיפים" juice, "עגבנייה" pasta sauce and "פלפל" black pepper. The cause was the same in every case:
 * the family is split into varieties and no variety carried the bare word, so the resolver found no exact phrase
 * and fell back to a partial match on whatever mentioned it most.
 *
 * The bare word belongs to the variety the chains sell most of: potato-white (47 products against potato-red 20),
 * apple-red (12), pepper-red, grapes-green (9), plum-red, and the generic tomato concept.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';

const concepts = loadConcepts();
const ownerOf = (phrase) => concepts.filter((c) => [c.name, ...(c.synonyms ?? [])].map(normalizeText).includes(normalizeText(phrase))).map((c) => c.id);

test('each bare family word is exactly one concept, and it is the food', () => {
  for (const [word, id] of [
    ['תפוח אדמה', 'potato-white'], ['תפוחי אדמה', 'potato-white'],
    ['תפוח', 'apple-red'], ['תפוחים', 'apple-red'],
    ['פלפל', 'pepper-red'], ['ענבים', 'grapes-green'], ['שזיפים', 'plum-red'],
    ['עגבנייה', 'tomato'], ['עגבניות', 'tomato'],
    ['בצל', 'onion-yellow'], ['שום', 'garlic'], ['ביצים', 'egg-regular'],
  ]) assert.deepEqual(ownerOf(word), [id], word);
});

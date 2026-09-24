/**
 * A beer glass is not a beer (24.9). The department pass moved "כוס בירה" out of משקאות and into
 * בית וכלים, but the `beer` concept was a bare `all: ["בירה"]` with no guards at all, so the glass kept
 * the drink's concept - and where a glassware concept also claimed it, the two collided and the build
 * dropped both (TRAPS.md #14). Measured over every name the chains publish: 9 names carry בירה next to a
 * vessel word and all 9 are vessels, while the 837 real beer names carry none of those words, so the
 * guard costs nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, matchingConcepts, assignConcept } from '../src/catalog/concepts.js';
import { categorize } from '../src/catalog/categorize.js';

const concepts = loadConcepts();

test('a vessel that names beer is not beer, and it is not in the drinks aisle', () => {
  for (const name of ['כוס בירה', 'כוסות בירה 330 מל', 'כוסות שקופות לבירה 3', 'כוס בירה גבוהה 1/2 ליטר']) {
    assert.notEqual(assignConcept(name, concepts), 'beer', `"${name}" must not carry the beer concept`);
    assert.notEqual(categorize(name, null), 'משקאות', `"${name}" must not sit in the drinks aisle`);
  }
});

test('near-miss: real beer keeps its concept, including the forms the guard words could have caught', () => {
  for (const name of ['בירה גולדסטאר 500 מל', 'בירה טובורג אדום שישייה', 'בירה קורונה 330 מ"ל', 'בירה ללא אלכוהול מכבי']) {
    assert.equal(assignConcept(name, concepts), 'beer', name);
  }
});

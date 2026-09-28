import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

const concepts = loadConcepts();

/** Naor, 28.9: "כן תפריד טרי וקפוא". meat-fish-frozen.json is generated from the fresh concepts
 * (scripts/frozen-twins.mjs); a fresh rule edited without re-running the script leaves the twin stale. */
test('the frozen twins are in step with the fresh concepts they mirror', () => {
  execFileSync(process.execPath, ['scripts/frozen-twins.mjs', '--check'], { stdio: 'pipe' });
});

test('fresh and frozen are two concepts', () => {
  assert.equal(assignConcept('חזה עוף טרי', concepts), 'chicken-breast');
  assert.equal(assignConcept('חזה עוף קפוא', concepts), 'chicken-breast-frozen');
  assert.equal(assignConcept('כנפיים עוף קפוא ארוז', concepts), 'chicken-wings-frozen');
  assert.equal(assignConcept('פילה אמנון מופשר', concepts), 'amnon-fillet-frozen');
});

test('frozen without the word: a name cut off mid-word, and ice-glazed fish', () => {
  assert.equal(assignConcept('פילה סלמון נורווגי ק', concepts), 'salmon-frozen');
  assert.equal(assignConcept('פילה לברק בסט פיש קפ', concepts), 'lavrak-fillet-frozen');
  assert.equal(assignConcept('פילה אמנון עם פס עור מכיל 80% דג לפחות', concepts), 'amnon-fillet-frozen');
  // ...but a kilo after a number, and a chilled product, are not frozen.
  assert.equal(assignConcept('בקר טחון עטרה 1.2 ק', concepts), 'beef-ground');
});

test('a smoked fish is not the fresh one', () => {
  assert.notEqual(assignConcept('דניס בעישון קר/חם בו', concepts), 'denis-whole');
  assert.notEqual(assignConcept('נסיכת הנילוס בעישון', concepts), 'nile-perch');
});

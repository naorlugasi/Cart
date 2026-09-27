/**
 * No phrase names two concepts (27.9). cartBackend's GET /catalog/concepts resolves what a shopper types against a
 * concept's name and synonyms, and when one phrase belongs to two concepts it cannot choose between them.
 *
 * The same check is also the cheapest detector of the mistake this catalog made three times in one day: one product
 * written as two concepts. Disposable cups were split by singular and plural. Tablecloths were written three times
 * and pecans twice, by rounds holding different files that could not see each other - and each time the duplicate
 * only surfaced after the merge, as a jump in conflicts. A shared phrase shows it before the merge does.
 *
 * `node scripts/concept-synonyms.mjs --check` prints the same list. When this fails, decide per phrase: two
 * concepts for one product (merge them, measured) or a phrase too loose to be either one's synonym (remove it).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';

test('no phrase - a concept name or a synonym - names two concepts', () => {
  const owners = new Map();
  for (const c of loadConcepts()) {
    for (const p of new Set([c.name, ...(c.synonyms ?? [])].map(normalizeText).filter(Boolean))) {
      owners.set(p, [...(owners.get(p) ?? []), c.id]);
    }
  }
  const shared = [...owners].filter(([, ids]) => new Set(ids).size > 1).map(([p, ids]) => `${p} -> ${[...new Set(ids)].join(', ')}`);
  assert.deepEqual(shared, [], `phrases naming two concepts:\n  ${shared.join('\n  ')}`);
});

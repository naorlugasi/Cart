import test from 'node:test';
import assert from 'node:assert/strict';
import { concepts } from '../src/catalog/concepts.js';

/**
 * Naor's decision, 28.9 (docs/CONCEPTS.md §14): a word that names a family with no general member - שמן has
 * nine oils and no plain oil - returns several options for the shopper to choose from, and is never resolved
 * to one of them by us. "שמן" means cooking oil, but canola against olive is a real choice the buyer makes,
 * not a guess we are entitled to make on their behalf.
 *
 * The resolver can only offer a choice while no concept claims the bare word: the moment one concept carries
 * "שמן" as its name or a synonym, it becomes an exact match, outranks all its siblings, and the shopper is
 * handed that one oil without being asked - silently undoing the decision. That is the likely way it breaks,
 * because a synonyms round adds bare words by design, and "שמן" on שמן קנולה looks like a helpful synonym.
 *
 * So this test is the decision, in code. To change it, change the decision first (a general concept per word
 * was the other option Naor was offered and declined), then this list.
 */
const AMBIGUOUS = ['שמן', 'שמנת', 'תה', 'יין', 'סבון', 'שניצל'];

test('an ambiguous family word is claimed by no single concept, so the resolver offers the family instead of picking one', () => {
  const list = concepts();
  for (const word of AMBIGUOUS) {
    const claimants = list.filter((c) => c.name === word || (c.synonyms ?? []).includes(word)).map((c) => `${c.id} (${c.name})`);
    assert.deepEqual(claimants, [], `"${word}" is claimed as an exact name or synonym by ${claimants.join(', ')} - that makes it one confident answer and hides the other options (Naor, 28.9)`);
    const family = list.filter((c) => c.name.startsWith(word));
    assert.ok(family.length >= 2, `"${word}" should have at least two concepts to choose between, found ${family.length}`);
  }
});

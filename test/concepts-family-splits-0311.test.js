// 3.11 family splits (Opus review, Q7): behaviour, not config. What a shopper must never be offered as
// "the same shelf", whatever the ids are called. Docs: docs/CONCEPTS.md §10 (families), §17.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConcepts, resolveFamily, conceptById, familiesForCategory, CONCEPTS_DIR } from '../src/catalog/concepts.js';

const list = loadConcepts();
const famOf = (id) => {
  const c = conceptById(id, list);
  assert.ok(c, `no concept ${id}`);
  return `${c.category}${resolveFamily(c, list).id}`;
};

/** Two concepts of different product types that one family once held (or could again). */
const NEVER_ONE_FAMILY = [
  ['toilet-paper', 'toilet-cleaner'],
  ['toilet-paper', 'toilet-wipes'],
  ['toilet-paper', 'toilet-brush'],
  ['toilet-cleaner', 'toilet-brush'],
  ['sponge', 'sponge-magic'],
  ['hair-removal-cream', 'hair-spray'],
  ['ribs-fresh', 'ribs-lamb'],
  ['coconut-cream', 'coconut-desiccated'],
  ['pasta-penne', 'pasta-sauce-tomato'],
  ['pasta-spaghetti', 'pasta-sauce-tomato'],
  ['baby-wipes', 'baby-food-puree'],
  ['baby-formula', 'baby-food-puree'],
  ['baby-formula', 'baby-wipes'],
  ['baby-wipes', 'baby-teether'],
  ['baby-wipes', 'baby-bottle-nipple'],
  ['baby-teether', 'baby-bottle-nipple'],
  ['chicken-sausage', 'chicken-meatballs'],
  ['chicken-sausage', 'chicken-nugget-shapes'],
  ['chicken-nuggets', 'chicken-breast'],
];

for (const [a, b] of NEVER_ONE_FAMILY) {
  test(`${a} and ${b} never share a family`, () => {
    assert.notEqual(famOf(a), famOf(b), `${a} and ${b} are one family again`);
  });
}

test('deli chicken sausage sits with the sausage family, not the chicken cuts', () => {
  assert.equal(famOf('chicken-sausage'), famOf('sausage-wiener'));
  assert.notEqual(famOf('chicken-sausage'), famOf('chicken-breast'));
});

test('ribs: beef ribs with beef, lamb ribs with lamb, mock fillet with beef', () => {
  assert.equal(famOf('ribs-fresh'), famOf('beef-steak'));
  assert.equal(famOf('ribs-lamb'), famOf('lamb-shank'));
  assert.equal(famOf('mockfish-fillet'), famOf('beef-steak'));
});

/** A frozen twin is the same product type as its fresh concept: it must land in the same family (an explicit
 * family on the base must reach the twin, or the twin falls back to its id-prefix family). */
test('every frozen twin has its base concept\'s family', () => {
  const bases = JSON.parse(readFileSync(path.join(CONCEPTS_DIR, 'type-words.json'), 'utf8')).frozenTwins.concepts;
  assert.ok(bases.length > 0);
  let checked = 0;
  for (const id of bases) {
    const twin = conceptById(`${id}-frozen`, list);
    if (!twin) continue; // a base without a generated twin is frozen-twins.test.js's concern
    const base = conceptById(id, list);
    assert.deepEqual(resolveFamily(twin, list), resolveFamily(base, list), `${id}-frozen left the family of ${id}`);
    checked++;
  }
  assert.ok(checked > 50, `only ${checked} twins checked`);
});

/** pasta-sauce is a one-leaf family on purpose. The name "רוטבי פסטה" invites a cream/rosé leaf, and a tomato
 * sauce must never stand in for a cream sauce. */
test('pasta-sauce family holds exactly one concept (a second leaf needs substitutes:false)', () => {
  const fam = familiesForCategory('שימורים', list).find((f) => f.id === 'pasta-sauce');
  assert.ok(fam, 'no pasta-sauce family in שימורים');
  assert.deepEqual(fam.conceptIds, ['pasta-sauce-tomato'],
    'a second sauce leaf must come with config/substitutes/rules.json families.pasta-sauce {substitutes:false}');
});

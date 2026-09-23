import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConcepts, resolveFamily, familyKey, families, familiesForCategory, familyNames, CONCEPTS_DIR, FAMILIES_FILE } from '../src/catalog/concepts.js';

const concepts = loadConcepts();

/** docs/CONCEPTS.md §10 mechanism: every concept always resolves to a family, whether it has siblings or
 * not - a caller never handles "no family". */
test('every concept resolves to a family', () => {
  for (const concept of concepts) {
    assert.ok(concept.family, `${concept.id} has no family`);
    assert.equal(typeof concept.family.id, 'string');
    assert.ok(concept.family.id.length > 0, `${concept.id}: family.id is empty`);
    assert.equal(typeof concept.family.name, 'string');
    assert.ok(concept.family.name.length > 0, `${concept.id}: family.name is empty`);
  }
});

/** Two concepts in the same category whose id shares the hyphen-prefix (or, for a bare id, the id itself)
 * end up in the same family. mushroom-button/mushroom-portobello is the canonical case. */
test('concepts sharing a prefix in one category share a family', () => {
  const byCategory = new Map();
  for (const c of concepts) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  for (const [category, list] of byCategory) {
    const byKey = new Map();
    for (const c of list) {
      const key = familyKey(c.id);
      (byKey.get(key) ?? byKey.set(key, []).get(key)).push(c);
    }
    for (const [key, group] of byKey) {
      if (group.length < 2) continue;
      const ids = new Set(group.map((c) => c.family.id));
      assert.equal(ids.size, 1, `${category} / ${key}: siblings do not share one family - ${[...ids].join(', ')}`);
      const names = new Set(group.map((c) => c.family.name));
      assert.equal(names.size, 1, `${category} / ${key}: siblings do not share one family name - ${[...names].join(', ')}`);
    }
  }
  // The concrete example from docs/CONCEPTS.md §10.
  const button = concepts.find((c) => c.id === 'mushroom-button');
  const portobello = concepts.find((c) => c.id === 'mushroom-portobello');
  assert.ok(button && portobello);
  assert.deepEqual(button.family, portobello.family);
  assert.equal(button.family.id, 'mushroom');
});

/** A concept with no sibling sharing its prefix (in its own category) is its own family. */
test('a lone concept is its own family', () => {
  // avocado has no other ירקות ופירות concept whose id starts with "avocado-" or equals "avocado".
  const avocado = concepts.find((c) => c.id === 'avocado');
  assert.ok(avocado, 'fixture concept "avocado" not found - pick another lone concept if it is renamed');
  assert.deepEqual(avocado.family, { id: 'avocado', name: avocado.name });
});

/** An explicit `family` in the concept's own JSON always wins, even without siblings. */
test('an explicit family on a concept beats derivation', () => {
  const list = [
    { id: 'a-explicit', name: 'א', category: 'כללי', family: { id: 'explicit-family', name: 'משפחה מפורשת' } },
  ];
  assert.deepEqual(resolveFamily(list[0], list), { id: 'explicit-family', name: 'משפחה מפורשת' });
});

/** Derivation without an entry in families.json falls back to the shortest sibling name. */
test('a shared prefix with no families.json entry falls back to the shortest sibling name', () => {
  const list = [
    { id: 'widget-small', name: 'וידג\'ט קטן ארוך משמעותית', category: 'כללי' },
    { id: 'widget-large', name: 'וידג\'ט', category: 'כללי' },
  ];
  const fam = resolveFamily(list[0], list);
  assert.equal(fam.id, 'widget');
  assert.equal(fam.name, 'וידג\'ט', 'the shorter of the two names wins');
  assert.deepEqual(resolveFamily(list[1], list), fam);
});

/** families.json sanity: ascii kebab-case keys (so the final-letter guard trivially never fires on them -
 * the same guard concept patterns use), and no key without at least two concepts actually sharing it
 * anywhere, so the file cannot silently rot after the last sibling is removed or renamed. */
test('families.json has no final-form letters and no unknown prefixes', () => {
  const FINAL_LETTERS = /[ךםןףץ]/;
  const raw = JSON.parse(readFileSync(path.join(CONCEPTS_DIR, FAMILIES_FILE), 'utf8'));
  const map = raw.families ?? {};
  assert.ok(Object.keys(map).length > 0, 'families.json has no entries');
  const groupSizes = new Map(); // prefix -> largest sharing-group size seen in any one category
  const byCategory = new Map();
  for (const c of concepts) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  for (const list of byCategory.values()) {
    const byKey = new Map();
    for (const c of list) byKey.set(familyKey(c.id), (byKey.get(familyKey(c.id)) ?? 0) + 1);
    for (const [key, count] of byKey) groupSizes.set(key, Math.max(groupSizes.get(key) ?? 0, count));
  }
  const unknown = [];
  const finalForm = [];
  for (const key of Object.keys(map)) {
    if (FINAL_LETTERS.test(key)) finalForm.push(key);
    if (!/^[a-z0-9-]+$/.test(key)) unknown.push(`${key} (not ascii kebab-case)`);
    else if ((groupSizes.get(key) ?? 0) < 2) unknown.push(`${key} (fewer than two concepts share it in any category)`);
  }
  assert.deepEqual(finalForm, [], `families.json keys with a final-form letter: ${finalForm.join(', ')}`);
  assert.deepEqual(unknown, [], `families.json keys with no real (>=2) sharing group: ${unknown.join(', ')}`);
  // familyNames() runs the same load path build-products.mjs/concepts.js use, and must not throw.
  assert.ok(Object.keys(familyNames()).length >= Object.keys(map).length);
});

/** families() / familiesForCategory(): the shape a backend joins conceptIds against products.json with,
 * for ירקות ופירות - the department the feature request (docs/CONCEPTS.md §10-11) is about. */
test('familiesForCategory returns the expected groups for ירקות ופירות', () => {
  const fams = familiesForCategory('ירקות ופירות', concepts);
  // Sorted by name.
  const sortedNames = fams.map((f) => f.name);
  assert.deepEqual(sortedNames, [...sortedNames].sort((a, b) => a.localeCompare(b, 'he')));
  // No category field leaks into the per-category shape.
  for (const f of fams) assert.equal('category' in f, false);
  const byId = Object.fromEntries(fams.map((f) => [f.id, f]));
  assert.deepEqual(new Set(byId.mushroom.conceptIds), new Set(['mushroom-button', 'mushroom-portobello']));
  assert.equal(byId.mushroom.name, 'פטריות');
  assert.deepEqual(new Set(byId.apple.conceptIds), new Set(['apple-golden', 'apple-granny', 'apple-red', 'apple-pink']));
  assert.equal(byId.apple.name, 'תפוחים');
  assert.deepEqual(new Set(byId.grapes.conceptIds), new Set(['grapes-green', 'grapes-red', 'grapes-black']));
  assert.deepEqual(new Set(byId.potato.conceptIds), new Set(['potato-white', 'potato-red']));
  assert.deepEqual(new Set(byId.onion.conceptIds), new Set(['onion-yellow', 'onion-red']));
  assert.deepEqual(new Set(byId.cabbage.conceptIds), new Set(['cabbage-white', 'cabbage-red']));
  assert.deepEqual(new Set(byId.pepper.conceptIds), new Set(['pepper-red', 'pepper-yellow', 'pepper-green', 'pepper-orange']));
  assert.deepEqual(new Set(byId.tomato.conceptIds), new Set(['tomato', 'tomato-cherry', 'tomato-magi']));
  assert.deepEqual(new Set(byId.zucchini.conceptIds), new Set(['zucchini', 'zucchini-dark']));
  assert.deepEqual(new Set(byId.pear.conceptIds), new Set(['pear', 'pear-nashi', 'pear-red']));
  assert.deepEqual(new Set(byId.plum.conceptIds), new Set(['plum-red', 'plum-black', 'plum-green']));
  assert.deepEqual(new Set(byId.pumpkin.conceptIds), new Set(['pumpkin', 'pumpkin-japanese']));
  assert.deepEqual(new Set(byId.melon.conceptIds), new Set(['melon', 'melon-buchari']));
  // A lone concept (e.g. avocado) still shows up as its own one-member family, not dropped.
  assert.deepEqual(byId.avocado?.conceptIds, ['avocado']);
  // families() covers every category, not only produce.
  const all = families(concepts);
  assert.ok(all.some((f) => f.category === 'חלב וביצים' && f.id === 'milk'));
  const totalConceptIds = all.reduce((n, f) => n + f.conceptIds.length, 0);
  assert.equal(totalConceptIds, concepts.length, 'every concept appears in exactly one family');
});

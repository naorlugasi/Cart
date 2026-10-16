import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConcepts, loadGroups, groups, groupsForCategory, CONCEPTS_DIR, FAMILIES_FILE } from '../src/catalog/concepts.js';
import { conceptGroupFor } from '../scripts/build-products.mjs';

/**
 * The fourth tree level (docs/CONCEPTS.md §17, Naor 14.10: "אנחנו לא יכולים להתחייב ל-3 רמות, אם צריך 4 אז 4";
 * approved 14.10 evening with four rules: a group is navigation only and substitution never climbs to it; dairy
 * first; group chips above family chips in the catalogue, the full path only on the product page; Sonnet
 * proposes the group table, Opus checks, Naor approves before it lands).
 *
 * Mechanism: families.json `groups` names, per department, which families sit under a group. Concepts do not
 * change; `concept.group` is resolved at load from the concept's (derived or explicit) family id within its
 * category. A family in no group has `group: null` and sits straight under the department - variable depth,
 * four levels only where the shelf has them.
 */

const concepts = loadConcepts();

test('every concept carries a group field, null when its family sits directly under the department', () => {
  for (const c of concepts) {
    assert.ok('group' in c, `${c.id} has no group field`);
    if (c.group === null) continue;
    assert.equal(typeof c.group.id, 'string');
    assert.ok(/^[a-z0-9-]+$/.test(c.group.id), `${c.id}: group id "${c.group.id}" is not ascii kebab-case`);
    assert.ok(c.group.name, `${c.id}: group has no name`);
  }
});

test('the real families.json loads, and every group it names is one some concept resolves to', () => {
  const defs = loadGroups();
  const live = new Set(groups(concepts).map((g) => `${g.category}\n${g.id}`));
  for (const [gid, g] of Object.entries(defs)) assert.ok(live.has(`${g.category}\n${gid}`), `group ${gid} (${g.category}) has no concept under it`);
  // groups() and groupsForCategory() agree with each other.
  const cats = new Set(groups(concepts).map((g) => g.category));
  let n = 0;
  for (const cat of cats) n += groupsForCategory(cat, concepts).length;
  assert.equal(n, groups(concepts).length);
});

/** A synthetic concept dir: three cheese families under one group, milk with no group. */
function fixtureDir(groupsBlock) {
  const dir = mkdtempSync(path.join(tmpdir(), 'concept-groups-'));
  cpSync(path.join(CONCEPTS_DIR, 'type-words.json'), path.join(dir, 'type-words.json'));
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify(['dairy.json']));
  writeFileSync(path.join(dir, 'dairy.json'), JSON.stringify({ concepts: [
    { id: 'bulgarian-cheese-5', name: 'בולגרית 5%', category: 'חלב וביצים', match: { all: ['בולגרית'], any: ['5%'] } },
    { id: 'bulgarian-cheese-16', name: 'בולגרית 16%', category: 'חלב וביצים', match: { all: ['בולגרית'], any: ['16%'] } },
    { id: 'white-cheese-5', name: 'גבינה לבנה 5%', category: 'חלב וביצים', family: { id: 'white-cheese', name: 'גבינה לבנה' }, match: { all: ['לבנה'], any: ['5%'] } },
    { id: 'cottage', name: 'קוטג\'', category: 'חלב וביצים', match: { all: ['קוטג'] } },
    { id: 'milk-3', name: 'חלב 3%', category: 'חלב וביצים', match: { all: ['חלב'], any: ['3%'] } },
    { id: 'milk-1', name: 'חלב 1%', category: 'חלב וביצים', match: { all: ['חלב'], any: ['1%'] } },
  ] }));
  writeFileSync(path.join(dir, FAMILIES_FILE), JSON.stringify({ families: { bulgarian: 'בולגרית', milk: 'חלב' }, groups: groupsBlock }));
  return dir;
}

test('a group collects derived, explicit and single-concept families under one department; the rest stay ungrouped', () => {
  const dir = fixtureDir({ cheese: { name: 'גבינות', category: 'חלב וביצים', families: ['bulgarian', 'white-cheese', 'cottage'] } });
  const list = loadConcepts(dir);
  const by = Object.fromEntries(list.map((c) => [c.id, c]));
  assert.deepEqual(by['bulgarian-cheese-5'].group, { id: 'cheese', name: 'גבינות' }, 'derived family (the id prefix before the first hyphen, "bulgarian") is grouped');
  assert.deepEqual(by['bulgarian-cheese-16'].group, { id: 'cheese', name: 'גבינות' });
  assert.deepEqual(by['white-cheese-5'].group, { id: 'cheese', name: 'גבינות' }, 'explicit family is grouped by its explicit id');
  assert.deepEqual(by['cottage'].group, { id: 'cheese', name: 'גבינות' }, 'a lone concept is its own family and can still be grouped');
  assert.equal(by['milk-3'].group, null, 'a family in no group sits under the department');
  assert.equal(by['milk-1'].group, null);
  assert.deepEqual(groups(list), [{ id: 'cheese', name: 'גבינות', category: 'חלב וביצים', familyIds: ['bulgarian', 'white-cheese', 'cottage'], conceptIds: ['bulgarian-cheese-5', 'bulgarian-cheese-16', 'white-cheese-5', 'cottage'] }]);
  assert.deepEqual(groupsForCategory('חלב וביצים', list).map((g) => g.id), ['cheese']);
  assert.deepEqual(groupsForCategory('ירקות ופירות', list), []);
  // The build publishes the same answer, and null for no concept.
  assert.deepEqual(conceptGroupFor('cottage', list), { id: 'cheese', name: 'גבינות' });
  assert.equal(conceptGroupFor('milk-3', list), null);
  assert.equal(conceptGroupFor(null, list), null);
  // A group is a shelf inside the product's own department: a cottage-concept product the chains filed
  // under another department carries no group (16.10, 232 such products on the first publish).
  assert.deepEqual(conceptGroupFor('cottage', list, 'חלב וביצים'), { id: 'cheese', name: 'גבינות' });
  assert.equal(conceptGroupFor('cottage', list, 'שימורים'), null);
});

test('a family in two groups, or a family no concept resolves to, is refused at load', () => {
  assert.throws(() => loadConcepts(fixtureDir({
    cheese: { name: 'גבינות', category: 'חלב וביצים', families: ['bulgarian'] },
    salty: { name: 'מלוחות', category: 'חלב וביצים', families: ['bulgarian'] },
  })), /in two groups/);
  assert.throws(() => loadConcepts(fixtureDir({
    cheese: { name: 'גבינות', category: 'חלב וביצים', families: ['bulgarian', 'gouda'] },
  })), /no concept in חלב וביצים resolves to it/);
  // The same family id in another department is a different family: grouping it there must not match here.
  assert.throws(() => loadConcepts(fixtureDir({
    cheese: { name: 'גבינות', category: 'מעדנייה', families: ['bulgarian'] },
  })), /no concept in מעדנייה resolves to it/);
});

test('loadGroups validates shape eagerly', () => {
  for (const bad of [
    { Cheese: { name: 'x', category: 'c', families: ['a'] } },
    { cheese: { name: '', category: 'c', families: ['a'] } },
    { cheese: { name: 'x', category: '', families: ['a'] } },
    { cheese: { name: 'x', category: 'c', families: [] } },
    { cheese: { name: 'x', category: 'c', families: ['Bad Id'] } },
    { cheese: 'גבינות' },
  ]) {
    const dir = mkdtempSync(path.join(tmpdir(), 'concept-groups-bad-'));
    writeFileSync(path.join(dir, FAMILIES_FILE), JSON.stringify({ families: {}, groups: bad }));
    assert.throws(() => loadGroups(dir), `accepted ${JSON.stringify(bad)}`);
  }
  // No groups key at all is fine - the file predates the level.
  const dir = mkdtempSync(path.join(tmpdir(), 'concept-groups-none-'));
  writeFileSync(path.join(dir, FAMILIES_FILE), JSON.stringify({ families: {} }));
  assert.deepEqual(loadGroups(dir), {});
  // The real file parses the same way the loader does.
  assert.ok(typeof JSON.parse(readFileSync(path.join(CONCEPTS_DIR, FAMILIES_FILE), 'utf8')).groups === 'object');
});

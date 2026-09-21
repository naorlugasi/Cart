import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAddress, normalizeCity, selectBranch } from '../src/geo/branches.js';
import { loadSeed } from './helpers.js';

test('normalizeCity understands aliases', () => {
  assert.equal(normalizeCity('תל-אביב'), 'תל אביב');
  assert.equal(normalizeCity('ת"א'), 'תל אביב');
  assert.equal(normalizeCity('פתח תקוה'), 'פתח תקווה');
  assert.equal(normalizeCity('אטלנטיס'), null);
});

test('parseAddress extracts the city from free text', () => {
  assert.deepEqual(parseAddress('הרצל 12, תל אביב'), { raw: 'הרצל 12, תל אביב', city: 'תל אביב', street: 'הרצל 12' });
  assert.equal(parseAddress('דיזנגוף 50 תל אביב').city, 'תל אביב');
  assert.equal(parseAddress('ירושלים').city, 'ירושלים');
  assert.equal(parseAddress('רחוב בלי עיר 5').city, null);
  assert.equal(parseAddress({ city: 'חיפה', street: 'הנמל 1' }).city, 'חיפה');
});

test('selectBranch prefers a branch that names the city, and never refuses a chain over an address', () => {
  // Decision 20.9: online-only, no location asked; a hand-kept city list produced false refusals.
  const { chains } = loadSeed();
  const shufersal = chains.find((c) => c.id === 'shufersal');
  assert.equal(selectBranch(shufersal, { city: 'רמת גן' }).id, 'shufersal-online-center', 'a branch naming the city wins');
  assert.ok(selectBranch(shufersal, { city: 'אילת' }), 'a city no branch names still gets the default branch, not null');
  assert.ok(selectBranch(shufersal, null), 'no address -> a default branch');
  assert.equal(selectBranch({ id: 'x', branches: [] }, null), null, 'a chain with no branch at all');
});

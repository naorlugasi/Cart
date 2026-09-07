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

test('selectBranch picks a branch delivering to the city, or null', () => {
  const { chains } = loadSeed();
  const shufersal = chains.find((c) => c.id === 'shufersal');
  assert.equal(selectBranch(shufersal, { city: 'רמת גן' }).id, 'shufersal-online-center');
  assert.equal(selectBranch(shufersal, { city: 'אילת' }), null);
  assert.ok(selectBranch(shufersal, null), 'no address -> a default branch');
  const demo = chains.find((c) => c.id === 'demo');
  assert.equal(selectBranch(demo, { city: 'אילת' }).id, 'demo-national', '"*" means nationwide');
});

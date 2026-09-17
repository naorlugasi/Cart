import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchTerm, pickResult } from '../scripts/resolve-shufersal-codes.mjs';

test('searchTerm: the chain\'s own 729000 barcodes are searched by their short code, others by barcode', () => {
  assert.equal(searchTerm('7290000066318'), '66318');
  assert.equal(searchTerm('3046920028004'), '3046920028004');
});

test('pickResult prefers the ean match, then the formula code, then a single hit', () => {
  assert.equal(pickResult('3046920028004', [{ code: 'P_1', ean: '1' }, { code: 'P_3046920028004', ean: '3046920028004' }]).code, 'P_3046920028004');
  assert.equal(pickResult('7290000066318', [{ code: 'P_66318', ean: '' }, { code: 'P_68770', ean: '' }]).code, 'P_66318');
  assert.equal(pickResult('5', [{ code: 'P_X', ean: '' }]).code, 'P_X');
  assert.equal(pickResult('5', [{ code: 'P_X', ean: '' }, { code: 'P_Y', ean: '' }]), null);
  assert.equal(pickResult('5', []), null);
});

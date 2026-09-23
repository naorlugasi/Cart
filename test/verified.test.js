import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadVerified, applyVerified, verified, resetVerified } from '../src/catalog/verified.js';

// docs/PLAN-PRODUCT-TRUTH.md §2: a verified record beats every heuristic, field by field, and an explicit
// null concept means "no concept" rather than "not verified".
const write = (obj) => { const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'verified-')), 'verified.json'); writeFileSync(f, JSON.stringify(obj)); return f; };

test('applyVerified: present keys win (null included), absent keys keep the heuristic, and the flag is set', () => {
  const heuristic = { name: 'מימון פטרוזיליה במיכ', brand: 'א.ל ייצור', category: 'שימורים', conceptId: 'herb-parsley', size: null };
  const rec = { name: 'תבלין פטרוזיליה במיכל 25 גרם תבליני מימון', conceptId: null, size: { value: 25, unit: 'g', count: 1 }, verifiedBy: 'naor', verifiedAt: '2026-09-23' };
  const out = applyVerified(rec, heuristic);
  assert.equal(out.name, rec.name);
  assert.equal(out.conceptId, null);
  assert.deepEqual(out.size, rec.size);
  assert.equal(out.brand, 'א.ל ייצור');
  assert.equal(out.category, 'שימורים');
  assert.equal(out.verified, true);
  assert.deepEqual(applyVerified(null, heuristic), { ...heuristic, verified: false });
});

test('loadVerified: a missing file is an empty map; a bad verifier or size is rejected', () => {
  assert.equal(loadVerified('/no/such/verified.json').size, 0);
  const good = loadVerified(write({ version: 1, records: { g1: { category: 'שימורים', verifiedBy: 'chains', verifiedAt: '2026-09-23' } } }));
  assert.equal(good.get('g1').category, 'שימורים');
  assert.throws(() => loadVerified(write({ records: { g1: { verifiedBy: 'me' } } })), /verifiedBy/);
  assert.throws(() => loadVerified(write({ records: { g1: { verifiedBy: 'naor', size: { value: 0, unit: 'g' } } } })), /size/);
});

test('verified: the real config loads (possibly empty) and every record names its verifier', () => {
  resetVerified(null);
  const map = verified();
  for (const [id, rec] of map) assert.ok(rec.verifiedBy && rec.verifiedAt, `${id} lacks an audit trail`);
  resetVerified(null);
});

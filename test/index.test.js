/**
 * Builds the local catalog index (scripts/index-build.mjs) against a tiny fixture
 * (test/fixtures/index-data) and checks two of its views: v_coverage and v_barcode_sellers, plus
 * v_unsized_in_sized_concept for good measure. docs/INDEX.md documents the real tool; this only
 * proves the build + views compute what they claim to, on data small enough to reason about by hand.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'index-data');
const DB = path.join(ROOT, 'data', 'local', 'test-index.duckdb');
const DUCKDB_BIN = process.env.DUCKDB_BIN || '/opt/homebrew/bin/duckdb';

function q(sql) {
  const out = execFileSync(DUCKDB_BIN, ['-json', DB], { input: sql, encoding: 'utf8' });
  return out.trim() ? JSON.parse(out) : [];
}

test('index-build on a tiny fixture: v_coverage, v_barcode_sellers, v_unsized_in_sized_concept', async (t) => {
  process.env.DATA_ROOT = FIXTURE;
  process.env.INDEX_DB = DB;
  t.after(() => {
    rmSync(DB, { force: true });
    rmSync(`${DB}.wal`, { force: true });
    delete process.env.DATA_ROOT;
    delete process.env.INDEX_DB;
  });

  const { build } = await import(`../scripts/index-build.mjs?fixture=${Date.now()}`);
  await build({ log: () => {} });

  // Fixture: 4 products with a gtin.
  //   693493300377 (garlic)              - priced at shufersal (served, 3.9) and tivtaam (unserved, 4.2)
  //   2223334445556 (bread-white-sliced) - priced at shufersal only, no size on the product itself
  //   1112223334445 (no concept)         - priced at shufersal and tivtaam
  //   9998887776665 (no concept)         - priced nowhere
  const [overall] = q(`select * from v_coverage where scope = 'overall'`);
  assert.equal(overall.total_products, 4);
  assert.equal(overall.with_price_served, 3, 'garlic, bread and the no-concept product all have a served-chain price');
  assert.equal(overall.with_price_any, 3, 'the 4th product has no price in any chain, served or not');
  assert.equal(overall.without_price_served, 1);
  assert.equal(overall.without_price_any, 1);

  const sellers = q(`select * from v_barcode_sellers where gtin = '693493300377'`)[0];
  assert.equal(sellers.served_count, 1);
  assert.equal(sellers.unserved_count, 1);
  assert.equal(sellers.served_chains, 'shufersal');
  assert.equal(sellers.unserved_chains, 'tivtaam');

  const noSellers = q(`select * from v_barcode_sellers where gtin = '9998887776665'`);
  assert.equal(noSellers.length, 0, 'a gtin no chain prices never appears in v_barcode_sellers');

  const unsized = q(`select id, concept_id, is_weighted from v_unsized_in_sized_concept`);
  assert.deepEqual(unsized, [{ id: 'g2223334445556', concept_id: 'bread-white-sliced', is_weighted: false }],
    'the bread product has no size of its own even though its concept declares one (sizeUnit "g")');

  const garlicNames = q(`select chain, assigned_concept from name_concepts where gtin = '693493300377' order by chain`);
  assert.deepEqual(garlicNames, [
    { chain: 'shufersal', assigned_concept: 'garlic' },
    { chain: 'tivtaam', assigned_concept: 'garlic' },
  ], 'both chains\' raw names resolve to the garlic concept on their own');
});

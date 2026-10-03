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
import { rmSync, existsSync } from 'node:fs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'index-data');
const DB = path.join(ROOT, 'data', 'local', 'test-index.duckdb');
// duckdb is a local tool (מרלוג and the dev Macs), not a dependency: GitHub CI has none, and this test failed
// there on every push from 3.10 (spawnSync ENOENT). Resolve it like the script does, and skip when absent.
function findDuckdb() {
  if (process.env.DUCKDB_BIN) return process.env.DUCKDB_BIN;
  for (const p of ['/opt/homebrew/bin/duckdb', '/usr/local/bin/duckdb', '/usr/bin/duckdb']) if (existsSync(p)) return p;
  try { return execFileSync('sh', ['-c', 'command -v duckdb'], { encoding: 'utf8' }).trim() || null; } catch { return null; }
}
const DUCKDB_BIN = findDuckdb();

function q(sql) {
  const out = execFileSync(DUCKDB_BIN, ['-json', DB], { input: sql, encoding: 'utf8' });
  return out.trim() ? JSON.parse(out) : [];
}

test('index-build on a tiny fixture: v_coverage, v_barcode_sellers, v_unsized_in_sized_concept', { skip: DUCKDB_BIN ? false : 'duckdb is not installed here (the index is a local tool)' }, async (t) => {
  process.env.DUCKDB_BIN = DUCKDB_BIN;
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

  // Fixture: 5 products with a gtin, 3 chains (shufersal + ramilevy served, tivtaam not).
  //   693493300377 (garlic)              - priced at shufersal (served, 3.9) and tivtaam (unserved, 4.2)
  //   7290000000411 (garlic, 2nd one)    - priced at ramilevy (served, 5.5) only
  //   2223334445556 (bread-white-sliced) - priced at shufersal only, no size on the product itself
  //   1112223334445 (no concept)         - priced at shufersal and tivtaam
  //   9998887776665 (no concept)         - priced nowhere
  const [overall] = q(`select * from v_coverage where scope = 'overall'`);
  assert.equal(overall.total_products, 5);
  assert.equal(overall.with_price_served, 4, 'every product but the unpriced one has a served-chain price');
  assert.equal(overall.with_price_any, 4, 'the unpriced product has no price in any chain, served or not');
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

  // `why --subs`: exercise all three top-level outlook codes against the real substitute engine
  // (src/pricing/substituteRules.js compatible()), end to end through the CLI.
  const why = (gtin) => execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'index-query.mjs'), 'why', gtin, '--subs'],
    { encoding: 'utf8', env: { ...process.env, INDEX_DB: DB } });

  const garlicOut = why('693493300377');
  assert.match(garlicOut, /shufersal: sold - "שום יבש יחידה"\s+price 3\.9/, 'sold at a served chain prints the chain\'s own name and price');
  assert.match(garlicOut, /ramilevy: not sold - not-sold-here/, 'ramilevy does not sell this gtin but sells another garlic product');
  assert.match(garlicOut, /שום יבש יבוא רמי לוי/, 'the one candidate ramilevy sells is listed');
  assert.match(garlicOut, /\bok\b/, 'two unsized garlic products with no size requirement on the concept compare ok');

  const breadOut = why('2223334445556');
  assert.match(breadOut, /ramilevy: not sold - none-in-concept/, 'ramilevy sells no bread-white-sliced product at all');

  const noConceptOut = why('1112223334445');
  assert.match(noConceptOut, /ramilevy: not sold - no-concept/, 'a product with no concept_id is always no-concept, never a candidate search');
});

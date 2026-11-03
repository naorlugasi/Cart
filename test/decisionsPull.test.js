import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planAnswers, applyPlan, loadState, main } from '../scripts/decisions-pull.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = 'secret-token-xyz';
const G1 = '7290000000111', G2 = '7290000000222', G3 = '7290000000333', G4 = '7290000000444', G5 = '7290000000555', G6 = '7290000000666';

function tmpPaths() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'decpull-'));
  const p = { localDir: path.join(dir, 'local') };
  for (const [k, src] of Object.entries({ verified: 'config/products/verified.json', brands: 'config/products/brands.json', sizes: 'config/products/sizes.json', aliases: 'config/products/aliases.json', notAliases: 'config/products/not-aliases.json', chains: 'data/chains.json' })) {
    p[k] = path.join(dir, path.basename(src));
    copyFileSync(path.join(ROOT, src), p[k]);
  }
  // known state for the gtins used below
  const b = JSON.parse(readFileSync(p.brands, 'utf8'));
  b.brands[G4] = { brand: 'ישן', source: 'x', since: '2026-01-01' };
  writeFileSync(p.brands, JSON.stringify(b, null, 1) + '\n');
  return p;
}

const row = (kind, key, subject, answer, extra = {}) => ({ answerId: `a-${key}`, decisionId: `d-${key}`, key, kind, answeredBy: 'naor', answeredAt: '2026-11-03T10:00:00Z', subject, answer, ...extra });

function fixture(chains) {
  const ch = chains[0], br = ch.branches[0];
  return {
    generatedAt: '2026-11-03T10:05:00Z',
    answers: [
      row('review', `review:${G1}`, { gtin: `g${G1}`, name: 'x', category: 'שימורים', conceptId: null }, { option: 'fix', payload: { name: 'שם חדש', conceptId: null, size: { value: 500, unit: 'g', count: 1 } } }),
      row('review', `review:${G2}`, { gtin: G2, name: 'שם נוכחי', category: 'חלב', conceptId: 'milk', rules: ['name-disagreement', 'concept-category'] }, { option: 'ok' }),
      row('same-product', 'same-product:c1', { clusterId: 'c1', products: [{ gtin: G3, name: 'א' }, { gtin: G4 + '1', name: 'א ב' }] }, { option: 'same', payload: { canonical: G3 } }),
      row('brand', `brand:${G4}`, { gtin: G4, candidates: [{ brand: 'אסם', source: 'chp' }] }, { option: 'cand:0' }),
      row('brand', `brand:${G5}`, { gtin: G5, candidates: [] }, { option: 'none' }),
      row('size', `size:${G5}`, { gtin: G5, candidates: [{ size: { value: 250, unit: 'ml', count: 1 }, source: 'chp' }] }, { option: 'cand:0' }),
      row('size', `size:${G6}`, { gtin: G6, candidates: [] }, { option: 'other', payload: { size: { value: -3, unit: 'g', count: 1 } } }),
      row('chain-terms', `chain-terms:${br.id}:2026-11-03`, { chainId: ch.id, branchId: br.id }, { option: 'change', payload: { fields: { deliveryFee: 19.9, minOrder: 150 }, deliveryTerms: { verifiedAt: '2026-11-03', source: 'https://x', note: 'n' } } }),
      row('taxonomy', 'taxonomy:t1', { question: 'האם X?' }, { option: 'a', note: 'כן' }),
      row('review', `review:${G6}`, { gtin: G6 }, { option: 'later' }),
    ],
  };
}

test('plan: each kind lands in its file, malformed is skipped, by-hand writes nothing', () => {
  const paths = tmpPaths();
  const state = loadState(paths);
  const plan = planAnswers(fixture(state.chains), state, { today: '2026-11-03' });
  const st = Object.fromEntries(plan.entries.map((e) => [e.key, e.status]));
  assert.equal(st[`review:${G1}`], 'apply');
  assert.equal(st[`review:${G2}`], 'apply');
  assert.equal(st['same-product:c1'], 'apply');
  assert.equal(st[`brand:${G4}`], 'apply');
  assert.equal(st[`brand:${G5}`], 'noop');
  assert.equal(st[`size:${G5}`], 'apply');
  assert.equal(st[`size:${G6}`], 'skip');
  assert.equal(st['taxonomy:t1'], 'byhand');
  assert.equal(st[`review:${G6}`], 'noop');
  assert.deepEqual([...plan.dirty].sort(), ['aliases', 'brands', 'chains', 'sizes', 'verified']);
  // state passed in is untouched
  assert.equal(loadState(paths).verified.records[`g${G1}`], undefined);
});

test('dry run writes nothing; apply writes every target with the file style kept', async () => {
  const paths = tmpPaths();
  const before = Object.fromEntries(['verified', 'brands', 'sizes', 'aliases', 'notAliases', 'chains'].map((k) => [k, readFileSync(paths[k], 'utf8')]));
  const exp = fixture(loadState(paths).chains);
  const file = path.join(os.tmpdir(), `decpull-export-${process.pid}.json`);
  writeFileSync(file, JSON.stringify(exp));
  const out = [];
  const log = (s) => out.push(s);
  let r = await main(['--file', file], { env: {}, log, paths, now: new Date('2026-11-03T12:00:00Z') });
  assert.equal(r.code, 0);
  for (const k of Object.keys(before)) assert.equal(readFileSync(paths[k], 'utf8'), before[k], `${k} untouched in dry run`);
  assert.equal(existsSync(paths.localDir), false, 'no sidecar in dry run');
  assert.match(out.join('\n'), /לטיפול ידני/);

  r = await main(['--file', file, '--apply'], { env: {}, log, paths, now: new Date('2026-11-03T12:00:00Z') });
  assert.equal(r.code, 0);
  const v = JSON.parse(readFileSync(paths.verified, 'utf8')).records;
  assert.deepEqual(v[`g${G1}`], { name: 'שם חדש', conceptId: null, size: { value: 500, unit: 'g', count: 1 }, verifiedBy: 'naor', verifiedAt: '2026-11-03', evidence: [`admin: review:${G1}`] });
  assert.equal(v[`g${G2}`].name, 'שם נוכחי');
  assert.equal(v[`g${G2}`].category, 'חלב');
  assert.equal(v[`g${G2}`].conceptId, 'milk');
  const brands = JSON.parse(readFileSync(paths.brands, 'utf8')).brands;
  assert.deepEqual(brands[G4], { brand: 'אסם', source: 'naor', since: '2026-11-03' });
  const sizes = JSON.parse(readFileSync(paths.sizes, 'utf8')).sizes;
  assert.deepEqual(sizes[G5], { size: { value: 250, unit: 'ml', count: 1 }, source: 'naor', since: '2026-11-03' });
  assert.equal(sizes[G6], undefined);
  const al = JSON.parse(readFileSync(paths.aliases, 'utf8')).aliases;
  assert.ok(al.some((a) => a.alias === G4 + '1' && a.canonical === G3));
  const chains = JSON.parse(readFileSync(paths.chains, 'utf8'));
  const br = chains[0].branches[0];
  assert.equal(br.deliveryFee, 19.9);
  assert.equal(br.minOrder, 150);
  assert.equal(br.deliveryKnown, true);
  assert.equal(br.minOrderKnown, true);
  assert.deepEqual(br.deliveryTerms, { verifiedAt: '2026-11-03', source: 'https://x', note: 'n' });
  for (const k of ['verified', 'brands', 'sizes', 'aliases', 'chains']) assert.ok(readFileSync(paths[k], 'utf8').endsWith('}\n') || readFileSync(paths[k], 'utf8').endsWith(']\n'));
  assert.equal(readFileSync(paths.notAliases, 'utf8'), before.notAliases);
  const side = JSON.parse(readFileSync(path.join(paths.localDir, readdirSync(paths.localDir).find((n) => n.endsWith('.applied.json'))), 'utf8'));
  assert.ok(side.answerIds.includes(`a-review:${G1}`));
  assert.ok(!side.answerIds.includes('a-taxonomy:t1'));
});

test('existing verified record is merged field by field', () => {
  const paths = tmpPaths();
  const v = JSON.parse(readFileSync(paths.verified, 'utf8'));
  v.records[`g${G1}`] = { category: 'שימורים', brand: 'ב', verifiedBy: 'chains', verifiedAt: '2026-09-23', evidence: ['e1'] };
  writeFileSync(paths.verified, JSON.stringify(v, null, 1) + '\n');
  const state = loadState(paths);
  const plan = planAnswers({ answers: [row('product-truth', `product-truth:${G1}`, { gtin: `g${G1}` }, { option: 'fix', payload: { name: 'חדש' } })] }, state, { today: '2026-11-03' });
  applyPlan(plan, paths);
  const rec = JSON.parse(readFileSync(paths.verified, 'utf8')).records[`g${G1}`];
  assert.deepEqual(rec, { category: 'שימורים', brand: 'ב', verifiedBy: 'naor', verifiedAt: '2026-11-03', evidence: ['e1', `admin: product-truth:${G1}`], name: 'חדש' });
});

test('GET and POST paths: header sent, token never printed', async () => {
  const paths = tmpPaths();
  const exp = fixture(loadState(paths).chains);
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => exp, text: async () => '' }; };
  const out = [];
  try {
    const env = { ADMIN_API_BASE: 'https://api.example/', HEALTH_TOKEN: TOKEN };
    let r = await main(['--apply', '--kinds', 'review,brand'], { env, log: (s) => out.push(s), paths, now: new Date('2026-11-03T12:34:00Z') });
    assert.equal(r.code, 0);
    assert.equal(calls[0].url, 'https://api.example/admin/decisions/export?kinds=review%2Cbrand');
    assert.equal(calls[0].init.headers['X-Health-Token'], TOKEN);
    assert.ok(readdirSync(paths.localDir).some((n) => /^decisions-\d{4}-\d{2}-\d{2}T\d{4}\.json$/.test(n)));
    assert.ok(!out.join('\n').includes(TOKEN));
    // kinds filter: no same-product / chain
    assert.ok(!r.plan.entries.some((e) => e.kind === 'chain-terms'));

    r = await main(['--mark'], { env, log: (s) => out.push(s), paths, getCommit: () => 'abc123def456abc123', now: new Date() });
    assert.equal(r.code, 0);
    const post = calls[1];
    assert.equal(post.url, 'https://api.example/admin/decisions/imported');
    assert.equal(post.init.method, 'POST');
    assert.equal(post.init.headers['X-Health-Token'], TOKEN);
    const body = JSON.parse(post.init.body);
    assert.equal(body.commit, 'abc123def456abc123');
    assert.ok(body.answerIds.length >= 2);

    r = await main(['--published', '2026-11-04'], { env, log: (s) => out.push(s), paths });
    assert.equal(JSON.parse(calls[2].init.body).run, '2026-11-04');
    assert.deepEqual(JSON.parse(calls[2].init.body).commits, ['abc123def456abc123']);
    assert.ok(!out.join('\n').includes(TOKEN));
  } finally {
    globalThis.fetch = orig;
  }
});

test('missing env gives a clear error', async () => {
  const out = [];
  const r = await main([], { env: {}, log: (s) => out.push(s), paths: tmpPaths() });
  assert.equal(r.code, 1);
  assert.match(out[0], /ADMIN_API_BASE/);
});

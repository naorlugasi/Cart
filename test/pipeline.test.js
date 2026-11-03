import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseFileName, latestPerStore, parseCarrefourPage, portals } from '../pipeline/listing.mjs';
import { fetchRetailer, MANIFEST } from '../pipeline/fetch.mjs';
import { parseStoresFile } from '../pipeline/load.mjs';

test('parseFileName understands every naming variant the portals use', () => {
  assert.deepEqual(parseFileName('PriceFull7290058140886-001-039-20260917-055457.gz'), { kind: 'PriceFull', chain: '7290058140886', sub: '001', storeId: '039', ts: '20260917-055457' });
  assert.deepEqual(parseFileName('pricefull7290058140886-039-202609170523.gz'), { kind: 'PriceFull', chain: '7290058140886', sub: null, storeId: '039', ts: '202609170523' }, 'Rami Levy online store: lowercase, no sub-chain');
  assert.deepEqual(parseFileName('PriceFull7290785400000-120-202609170010.gz').storeId, '120', 'Keshet: no sub-chain segment');
  assert.equal(parseFileName('PriceFull7290803800003-7999-202412271528.gz').storeId, '7999', 'four-digit store codes exist');
  assert.deepEqual(parseFileName('Stores7290058140886-000-20260917-050500.xml'), { kind: 'Stores', chain: '7290058140886', sub: null, storeId: null, ts: '20260917-050500' });
  assert.equal(parseFileName('StoresFull7290700100008-000-20260917-011038.gz').kind, 'Stores');
  assert.deepEqual(parseFileName('Stores7290027600007-000-20260917-020.gz'), { kind: 'Stores', chain: '7290027600007', sub: null, storeId: null, ts: '20260917-020' }, 'Shufersal Stores: 3-digit time');
  assert.equal(parseFileName('PromoFull7290055700007-001-471-20260917-000048.gz').kind, 'PromoFull');
  assert.equal(parseFileName('Price7290058140886-001-001-20260917-070009.gz').kind, 'Price');
  assert.equal(parseFileName('CompanyLogo.jpg'), null);
});

test('latestPerStore keeps the newest file of each kind and store', () => {
  const files = [
    { kind: 'PriceFull', storeId: '001', ts: '20260917-050000' }, { kind: 'PriceFull', storeId: '001', ts: '20260917-120000' },
    { kind: 'PriceFull', storeId: '002', ts: '20260917-050000' }, { kind: 'PromoFull', storeId: '001', ts: '20260917-050000' },
    { kind: 'Stores', storeId: null, ts: '20260916-050000' }, { kind: 'Stores', storeId: null, ts: '20260917-050000' },
  ];
  const kept = latestPerStore(files).map((f) => `${f.kind}:${f.storeId}:${f.ts}`).sort();
  assert.deepEqual(kept, ['PriceFull:001:20260917-120000', 'PriceFull:002:20260917-050000', 'PromoFull:001:20260917-050000', 'Stores:null:20260917-050000']);
});

test('parseCarrefourPage reads the embedded files array', () => {
  const html = '<script>const files = [{"name":"PriceFull7290055700007-001-416-20260918-000011.gz","size":887162,"modified":"00:01 18-09-2026"},{"name":"Stores7290055700007-000-20260918-000100.xml","size":10,"modified":"x"}];\nlet filesInfoCache = [];</script>';
  const files = parseCarrefourPage(html);
  assert.equal(files.length, 2);
  assert.equal(files[0].storeId, '416');
  assert.equal(files[1].kind, 'Stores');
  assert.deepEqual(parseCarrefourPage('<html>no files</html>'), []);
});

test('parseStoresFile extracts id, name, address, city and StoreType from a Stores XML', () => {
  const xml = `<Root><SubChains><SubChain><SubChainId>1</SubChainId><Stores>
    <Store><StoreId>39</StoreId><StoreName>מרלוג אינטרנט</StoreName><Address>https://www.rami-levy.co.il</Address><City>6100</City><StoreType>2</StoreType></Store>
    <Store><StoreId>5</StoreId><StoreName>אשקלון גדול</StoreName><Address>הרצל 1</Address><City>אשקלון</City><StoreType>1</StoreType></Store>
  </Stores></SubChain></SubChains></Root>`;
  const rows = parseStoresFile(xml);
  assert.deepEqual(rows.map((r) => [r.storeId, r.type, r.name]), [['039', '2', 'מרלוג אינטרנט'], ['005', '1', 'אשקלון גדול']]);
});

test('shufersal portal reads the last page from the paginator and fetches pages 2..last, never beyond', async () => {
  const realFetch = globalThis.fetch;
  const requested = [];
  const pageHtml = (catId, page, last) => {
    const files = [1, 2].map((i) => `<a href="https://pricesprodpublic.blob.core.windows.net/pricefull/PriceFull7290027600007-001-${String(page * 10 + i).padStart(3, '0')}-20261103-032407.gz?sv=1&amp;sig=x">d</a>`).join('');
    const pager = [1, 2, 3].map((p) => `<a href="/FileObject/UpdateCategory?catID=${catId}&amp;storeId=0&amp;page=${p}">${p}</a>`).join('') + `<a href="/FileObject/UpdateCategory?catID=${catId}&amp;storeId=0&amp;page=${last}">&gt;&gt;</a>`;
    return files + pager;
  };
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const catId = Number(u.searchParams.get('catID')), page = Number(u.searchParams.get('page'));
    requested.push(`${catId}:${page}`);
    return new Response(pageHtml(catId, page, 3), { status: 200 });
  };
  try {
    const files = await portals.shufersal({}, { kinds: ['PriceFull'] });
    assert.deepEqual(files.map((f) => f.storeId), ['011', '012', '021', '022', '031', '032']);
    assert.deepEqual(requested.sort(), ['2:1', '2:2', '2:3']);
    requested.length = 0;
    await portals.shufersal({}, { kinds: ['Stores'] });
    assert.deepEqual(requested, ['5:1'], 'Stores is one page');
  } finally { globalThis.fetch = realFetch; }
});

test('fetchRetailer saves the manifest while downloading, and a second call skips every file', async () => {
  const realFetch = globalThis.fetch;
  const root = mkdtempSync(path.join(tmpdir(), 'pipeline-test-'));
  const N = 30, date = '20261103';
  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const names = Array.from({ length: N }, (_, i) => `PriceFull7290027600007-001-${String(i + 1).padStart(3, '0')}-${today}-032407.gz`);
  const src = { portal: 'test' };
  const origPortal = portals.test;
  portals.test = async () => names.map((name) => ({ ...parseFileName(name), name, url: `https://files.test/${name}` }));
  let downloads = 0, seenOnDisk = null;
  globalThis.fetch = async () => {
    downloads++;
    if (downloads === 30) seenOnDisk = existsSync(MANIFEST(root, 'x', date)) ? JSON.parse(readFileSync(MANIFEST(root, 'x', date), 'utf8')) : null;
    return new Response(`file ${downloads}`, { status: 200 });
  };
  try {
    const m = await fetchRetailer({ root, chainId: 'x', src, date, concurrency: 1, log: () => {} });
    assert.equal(m.summary.downloaded, N);
    assert.ok(seenOnDisk, 'manifest exists on disk before the run finishes');
    assert.equal(seenOnDisk.listed, N, 'listing is persisted');
    assert.ok(Object.values(seenOnDisk.files).filter((e) => e.sha1).length >= 25, 'completed downloads are persisted with sha1');
    downloads = 0;
    const again = await fetchRetailer({ root, chainId: 'x', src, date, concurrency: 1, log: () => {} });
    assert.equal(again.summary.skipped, N);
    assert.equal(downloads, 0);
  } finally {
    globalThis.fetch = realFetch;
    if (origPortal) portals.test = origPortal; else delete portals.test;
    rmSync(root, { recursive: true, force: true });
  }
});

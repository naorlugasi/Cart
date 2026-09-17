import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFileName, latestPerStore, parseCarrefourPage } from '../pipeline/listing.mjs';
import { parseStoresFile } from '../pipeline/load.mjs';

test('parseFileName understands every naming variant the portals use', () => {
  assert.deepEqual(parseFileName('PriceFull7290058140886-001-039-20260917-055457.gz'), { kind: 'PriceFull', chain: '7290058140886', sub: '001', storeId: '039', ts: '20260917-055457' });
  assert.deepEqual(parseFileName('pricefull7290058140886-039-202609170523.gz'), { kind: 'PriceFull', chain: '7290058140886', sub: null, storeId: '039', ts: '202609170523' }, 'Rami Levy online store: lowercase, no sub-chain');
  assert.deepEqual(parseFileName('PriceFull7290785400000-120-202609170010.gz').storeId, '120', 'Keshet: no sub-chain segment');
  assert.equal(parseFileName('PriceFull7290803800003-7999-202412271528.gz').storeId, '7999', 'four-digit store codes exist');
  assert.deepEqual(parseFileName('Stores7290058140886-000-20260917-050500.xml'), { kind: 'Stores', chain: '7290058140886', sub: null, storeId: null, ts: '20260917-050500' });
  assert.equal(parseFileName('StoresFull7290700100008-000-20260917-011038.gz').kind, 'Stores');
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

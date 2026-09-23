import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readdirSync, unlinkSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProducts, slimCatalog, categorize, applySiteCodes, readPipelineStatus, writePipelineStatus, markChainsMissing, conceptForCategory, conceptFamilyFor, shardProductsByDepartment, writeProductShards, DEPARTMENT_SLUGS, OTHER_DEPARTMENT_SLUG } from '../scripts/build-products.mjs';
import { loadConcepts } from '../src/catalog/concepts.js';

const item = (gtin, name, price, extra = {}) => ({ storeItemId: gtin, code: gtin, gtin, name, brand: 'X', price, isWeighted: false, unit: "יח'", inStock: true, promotions: [], ...extra });
const chains = {
  a: { catalog: { chainId: 'a', storeId: '1', items: [item('1111111111111', 'חלב 3% 1 ליטר', 6), item('2222222222222', 'במבה 80 גרם', 4), item('3333333333333', 'מוצר נדיר', 9)] }, online: null },
  b: { catalog: { chainId: 'b', storeId: '2', items: [item('1111111111111', 'חלב 3% ליטר', 7), item('2222222222222', 'במבה 80 גרם', 5)] }, online: null },
  c: { catalog: { chainId: 'c', storeId: '3', items: [item('1111111111111', 'חלב 3% 1 ליטר', 8)] }, online: { fetchedAt: 'now', items: { '2222222222222': { price: 4.5, name: 'במבה', inStock: true, isWeighted: false, id: 77 } } } },
};

test('categorize maps Hebrew product names to the UI categories', () => {
  assert.equal(categorize('חלב תנובה 3% 1 ליטר'), 'חלב וביצים');
  assert.equal(categorize('במבה אסם 80 גרם'), 'חטיפים וממתקים');
  assert.equal(categorize('עגבניות שרי'), 'ירקות ופירות');
  assert.equal(categorize('דבר לא מוכר'), 'כללי');
  // Fruit words are flavours too: the product type wins, and produce keywords must start a word.
  assert.equal(categorize('יוגורט תות 3% מולר 150 גרם'), 'חלב וביצים');
  assert.equal(categorize('סנו JAVEL אקונומיקה בריח לימון'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('בייגלה שטוחים שומשום'), 'חטיפים וממתקים');
  assert.equal(categorize('מלפפון בחומץ 13-17 בית השיטה'), 'שימורים');
  assert.equal(categorize('מלפפון'), 'ירקות ופירות');
  assert.equal(categorize('חלבה וניל'), 'חטיפים וממתקים');
  assert.equal(categorize('מנגו מוקפא סנפרוסט 300 גרם'), 'מעדנייה');
  assert.equal(categorize('סירופ בטעם ענבים 750'), 'משקאות');
  // A dry mix is a pantry item, not the dessert it makes (docs/CATEGORIES.md).
  assert.equal(categorize('אבקה להכנת ג\'לי בטעם תות אסם 90 גרם'), 'שימורים');
  assert.equal(categorize('אבוקדו בשל יח'), 'ירקות ופירות');
});

test('buildProducts unions chains by GTIN, keeps products sold by enough chains and takes median prices', () => {
  const products = buildProducts(chains, { minChains: 3, max: 10 });
  assert.deepEqual(products.map((p) => p.gtin).sort(), ['1111111111111', '2222222222222']);
  const milk = products.find((p) => p.gtin === '1111111111111');
  assert.equal(milk.id, 'g1111111111111');
  assert.equal(milk.name, 'חלב 3% 1 ליטר');
  assert.equal(milk.basePrice, 7);
  assert.equal(milk.category, 'חלב וביצים');
  assert.equal(milk.privateLabelOf, null, 'no private-label signal on this gtin');
  assert.equal(buildProducts(chains, { minChains: 1, max: 1 }).length, 1);
});

test('buildProducts: bestName prefers a longer, untruncated name over a similarly-frequent truncated prefix, and size/conceptId are computed from every name across chains (docs/CONCEPTS.md §3)', () => {
  // Half the chains truncate names to ~20 characters: "חלב תנובה 3" (11 chars) is what is left of
  // "חלב תנובה 3% 1 ליטר" once the unit and size are cut off. It appears in two chains, the full name
  // in only one - similar frequency, and the full name starts with the truncated one.
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'concepts-test-'));
  writeFileSync(path.join(tmpDir, 'milk.json'), JSON.stringify({
    concepts: [{ id: 'milk-3', name: 'חלב 3%', category: 'חלב וביצים', sizeUnit: 'ml', defaultSize: 1000, match: { all: ['חלב'], any: ['3%'] } }],
  }));
  try {
    const conceptList = loadConcepts(tmpDir);
    const sizeConceptChains = {
      d: { catalog: { chainId: 'd', storeId: '4', items: [item('5555555555555', 'חלב תנובה 3', 6)] }, online: null },
      e: { catalog: { chainId: 'e', storeId: '5', items: [item('5555555555555', 'חלב תנובה 3', 6.5)] }, online: null },
      f: { catalog: { chainId: 'f', storeId: '6', items: [item('5555555555555', 'חלב תנובה 3% 1 ליטר', 7)] }, online: null },
    };
    const products = buildProducts(sizeConceptChains, { minChains: 3, max: 10, concepts: conceptList });
    const milk = products.find((p) => p.gtin === '5555555555555');
    assert.ok(milk, 'sold by 3 chains -> passes the shared threshold');
    assert.equal(milk.name, 'חלב תנובה 3% 1 ליטר', 'the untruncated name wins even though the truncated one is more common');
    assert.deepEqual(milk.size, { value: 1000, unit: 'ml', count: 1 }, 'size only resolves from the one name that still has it');
    assert.equal(milk.conceptId, 'milk-3', 'concept only resolves from the one name that still matches');
    assert.deepEqual(milk.conceptFamily, { id: 'milk-3', name: 'חלב 3%' }, 'a concept with no sibling in this list is its own family');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('buildProducts: private-label products enter the catalog even sold by a single chain, a plain single-chain product does not', () => {
  const plChains = {
    shufersal: { catalog: { chainId: 'shufersal', storeId: '1', items: [
      item('7296073000019', 'שוקו שופרסל 1 ליטר', 5), // Shufersal's own GS1 prefix -> private label
      item('9999999999991', 'מוצר יחיד רגיל', 3), // ordinary item, sold by one chain only
    ] }, online: null },
  };
  const products = buildProducts(plChains, { minChains: 3, max: 10 });
  const pl = products.find((p) => p.gtin === '7296073000019');
  assert.ok(pl, 'private-label product is present despite chains=1 < minChains');
  assert.equal(pl.privateLabelOf, 'shufersal');
  assert.equal(pl.chains, 1);
  assert.equal(products.find((p) => p.gtin === '9999999999991'), undefined, 'plain single-chain product stays below the threshold and is absent');
});

test('buildProducts: sibling chains of the same private-label family report under the family head', () => {
  const familyChains = {
    carrefour: { catalog: { chainId: 'carrefour', storeId: '1', items: [item('3560070111111', 'מוצר קרפור', 4)] }, online: null },
    quik: { catalog: { chainId: 'quik', storeId: '2', items: [item('3560070111111', 'מוצר קרפור', 4.2)] }, online: null },
  };
  const products = buildProducts(familyChains, { minChains: 3, max: 10 });
  const pl = products.find((p) => p.gtin === '3560070111111');
  assert.ok(pl, 'private-label product is present despite chains=2 < minChains');
  assert.equal(pl.privateLabelOf, 'carrefour', 'carrefour/quik are the same family - the family head wins, not a per-chain split');
  assert.equal(pl.chains, 2);
});

test('buildProducts: a gtin listed in config/sal-israel.json enters the catalog even sold by one chain, via the injected salIsraelGtins set', () => {
  const salChains = {
    carrefour: { catalog: { chainId: 'carrefour', storeId: '1', items: [
      item('7290020427038', 'שמן קנולה מזוכך 1 ליטר', 6.9), // in the basket, sold by one chain only
      item('9999999999992', 'מוצר יחיד רגיל אחר', 3), // ordinary single-chain item - still stays below threshold
    ] }, online: null },
  };
  const products = buildProducts(salChains, { minChains: 3, max: 10, salIsraelGtins: new Set(['7290020427038']) });
  const basketItem = products.find((p) => p.gtin === '7290020427038');
  assert.ok(basketItem, 'sal-israel basket product is present despite chains=1 < minChains');
  assert.equal(basketItem.chains, 1);
  assert.equal(products.find((p) => p.gtin === '9999999999992'), undefined, 'a plain single-chain product not in the basket is still excluded');
});

test('buildProducts: an empty/absent salIsraelGtins set changes nothing (tolerates a missing config/sal-israel.json)', () => {
  const products = buildProducts(chains, { minChains: 3, max: 10, salIsraelGtins: new Set() });
  assert.deepEqual(products.map((p) => p.gtin).sort(), ['1111111111111', '2222222222222']);
});

test('buildProducts: a line\'s SECONDARY barcode (config "gtins", not just "gtin") also enters the catalog even sold by one chain', () => {
  // Mirrors config/sal-israel.json's merged "חיתולי האגיס פרידום דרייו" line, whose primary gtin is
  // 7290111346538 but which also lists 7290000197425 among its printed variants (docs/SAL-ISRAEL.md) -
  // a chain that only stocks that secondary barcode must still get the line, via the injected set.
  const salChains = {
    carrefour: { catalog: { chainId: 'carrefour', storeId: '1', items: [
      item('7290000197425', 'חיתולי האגיס פרידום דרייו מידה 4', 31.9),
    ] }, online: null },
  };
  const products = buildProducts(salChains, { minChains: 3, max: 10, salIsraelGtins: new Set(['7290111346538', '7290000197425', '7290000197456']) });
  const basketItem = products.find((p) => p.gtin === '7290000197425');
  assert.ok(basketItem, 'the secondary variant is present despite chains=1 < minChains');
});

test('buildProducts: with no salIsraelGtins passed, the default loader flattens "gtins" from the real config/sal-israel.json', () => {
  // '7290000197425' is a secondary barcode (not the primary "gtin") of the merged Huggies line in the
  // real config/sal-israel.json - proves loadSalIsraelGtins() itself (not just the injected-Set path)
  // includes every variant, not only each line's primary gtin.
  const salChains = {
    carrefour: { catalog: { chainId: 'carrefour', storeId: '1', items: [
      item('7290000197425', 'חיתולי האגיס פרידום דרייו מידה 4', 31.9),
    ] }, online: null },
  };
  const products = buildProducts(salChains, { minChains: 3, max: 10 });
  assert.ok(products.find((p) => p.gtin === '7290000197425'), 'secondary variant from the real config is included by default');
});

test('buildProducts: a weighted, no-GTIN concept product is emitted when >= 3 chains sell it, priced at the median of their cheapest match; service items and a 2-chain concept are skipped', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'concepts-test-'));
  writeFileSync(path.join(tmpDir, 'produce.json'), JSON.stringify({
    concepts: [
      { id: 'cucumber', name: 'מלפפון', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['מלפפון'], match: { all: ['מלפפונ'] } },
      { id: 'okra', name: 'במיה', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['במיה'], match: { all: ['במיה'] } },
    ],
  }));
  try {
    const conceptList = loadConcepts(tmpDir);
    const weighted = (code, name, price, extra = {}) => ({ storeItemId: code, code, gtin: null, name, brand: null, price, isWeighted: true, unit: 'ק"ג', inStock: true, promotions: [], ...extra });
    const weightChains = {
      a: { catalog: { chainId: 'a', storeId: '1', items: [weighted('W1', 'מלפפון שקיל', 4.9), weighted('W2', 'זיכוי מלפפון', 1)] }, online: null },
      b: { catalog: { chainId: 'b', storeId: '2', items: [weighted('W1', 'מלפפון במשקל', 5.9)] }, online: null },
      c: { catalog: { chainId: 'c', storeId: '3', items: [weighted('W1', 'מלפפון טרי', 6.9), weighted('W2', 'במיה טרייה', 8)] }, online: null },
      // only 2 chains sell okra - stays below the >= 3 chains threshold
      d: { catalog: { chainId: 'd', storeId: '4', items: [weighted('W3', 'במיה', 7.5)] }, online: null },
    };
    const products = buildProducts(weightChains, { minChains: 3, max: 10, concepts: conceptList });
    const cucumber = products.find((p) => p.conceptId === 'cucumber');
    assert.ok(cucumber, 'sold (under internal codes, no GTIN) by 3 chains -> emitted as a concept product');
    assert.equal(cucumber.id, 'c-cucumber');
    assert.equal(cucumber.kind, 'concept');
    assert.equal(cucumber.gtin, null);
    assert.equal(cucumber.isWeighted, true);
    assert.equal(cucumber.unit, 'ק"ג');
    assert.equal(cucumber.category, 'ירקות ופירות');
    assert.equal(cucumber.chains, 3);
    assert.equal(cucumber.basePrice, 5.9, 'median of the 3 chains cheapest matching price (4.9, 5.9, 6.9)');
    // the card says which row in each chain the median came from, cheapest first (docs/PIPELINE-CONTRACT.md §2.1)
    assert.deepEqual(cucumber.sources, [
      { chain: 'a', name: 'מלפפון שקיל', price: 4.9 },
      { chain: 'b', name: 'מלפפון במשקל', price: 5.9 },
      { chain: 'c', name: 'מלפפון טרי', price: 6.9 },
    ]);
    assert.equal(cucumber.verified, false, 'no verified record for this card in the test config');
    assert.equal(cucumber.privateLabelOf, null);
    assert.equal(cucumber.size, null);

    assert.equal(products.find((p) => p.conceptId === 'okra'), undefined, 'sold by only 2 chains -> not emitted');

    // slimCatalog is handed the published basePrice per concept, not just the ids: it admits a weighed
    // item only inside that price band, so a cart line can never be priced off a row the product card
    // rejected (docs/CONCEPTS.md §6).
    const conceptPrices = new Map(products.filter((p) => p.kind === 'concept').map((p) => [p.conceptId, p.basePrice]));
    const gtins = new Set(products.map((p) => p.gtin));
    const slimA = slimCatalog('a', weightChains.a, gtins, { conceptPrices, conceptList });
    const cucA = slimA.items.find((i) => i.name === 'מלפפון שקיל');
    assert.ok(cucA, 'the weighted item rides along in the slim catalog');
    assert.equal(cucA.conceptId, 'cucumber');
    assert.equal(cucA.isWeighted, true);
    assert.equal(cucA.unit, 'ק"ג');
    assert.equal(slimA.items.find((i) => i.name === 'זיכוי מלפפון'), undefined, 'service items (credit/delivery/pickup/deposit) are never concept candidates');

    const slimC = slimCatalog('c', weightChains.c, gtins, { conceptPrices, conceptList });
    assert.equal(slimC.items.find((i) => i.name === 'במיה טרייה'), undefined, 'a concept that never reached 3 chains does not get tagged even where it was sold');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('buildConceptProducts: a weighed concept is priced only from rows the chain publishes as sold by weight - a bunch or a tray never speaks for a kilo (docs/CONCEPTS.md §6)', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'concepts-test-'));
  writeFileSync(path.join(tmpDir, 'produce.json'), JSON.stringify({
    concepts: [
      { id: 'cilantro', name: 'כוסברה', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['כוסברה'], match: { all: ['כוסבר'] } },
      { id: 'mushroom', name: 'פטריות', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['פטריות'], match: { all: ['פטריות'] } },
    ],
  }));
  try {
    const conceptList = loadConcepts(tmpDir);
    const row = (code, name, price, isWeighted) => ({ storeItemId: code, code, gtin: null, name, brand: null, price, isWeighted, unit: isWeighted ? 'ק"ג' : "יח'", inStock: true, promotions: [] });
    // Fault 1: the bunch/kilo split, exactly as the chains publish it. Rami Levy and M.C.K sell a bunch
    // (bIsWeighted=0) for ~3, Tiv Taam and Yochananof sell a kilo (bIsWeighted=1) for 39 and 100.
    // Fault 2: one chain publishing both a tray (bIsWeighted=0, 9.90) and the loose kilo (39.90).
    const weightChains = {
      ramilevy: { catalog: { chainId: 'ramilevy', storeId: '1', items: [row('126', 'כוסברה בתפזורת', 3.2, false), row('333', 'פטריות במשקל', 32.5, true)] }, online: null },
      mck: { catalog: { chainId: 'mck', storeId: '2', items: [row('438084', 'כוסברה', 3.9, false), row('596', 'פטריות במשקל', 29.9, true)] }, online: null },
      tivtaam: { catalog: { chainId: 'tivtaam', storeId: '3', items: [row('3131211', 'כוסברה במשקל', 39, true)] }, online: null },
      yochananof: { catalog: { chainId: 'yochananof', storeId: '4', items: [row('7290006214225', 'כוסברה עלים', 100, true), row('597', 'פטריות במשקל', 29.9, true)] }, online: null },
      carrefour: { catalog: { chainId: 'carrefour', storeId: '5', items: [row('374', 'פטריות שמפניון', 9.9, false), row('7290000000113', 'פטריות שמפניון תפזור', 39.9, true)] }, online: null },
    };
    const products = buildProducts(weightChains, { minChains: 3, max: 10, concepts: conceptList });

    assert.equal(products.find((p) => p.conceptId === 'cilantro'), undefined,
      'the two bunches are not kilos, so only 2 chains sell cilantro by weight - below the threshold, no product card rather than a 3.20/kg price');

    const mushroom = products.find((p) => p.conceptId === 'mushroom');
    assert.ok(mushroom, 'mushroom is sold loose by 4 chains and stays');
    assert.equal(mushroom.chains, 4);
    assert.equal(mushroom.basePrice, 32.5, "Carrefour's 9.90 tray is not weighted, so its 39.90 loose kilo is its price: median of 29.9, 29.9, 32.5, 39.9");
    assert.deepEqual(mushroom.conceptFamily, { id: 'mushroom', name: 'פטריות' }, 'no sibling "mushroom-*" in this synthetic list - a weighed concept card still carries a family');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('buildConceptProducts: organic never represents the plain concept, and a chain that disagrees with the rest loses its vote instead of the whole product being dropped', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'concepts-test-'));
  writeFileSync(path.join(tmpDir, 'produce.json'), JSON.stringify({
    concepts: [
      { id: 'carrot', name: 'גזר', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['גזר'], match: { all: ['גזר'] } },
      { id: 'zucchini', name: 'קישוא', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['קישוא'], match: { all: ['קישוא'] } },
    ],
  }));
  try {
    const conceptList = loadConcepts(tmpDir);
    const w = (code, name, price) => ({ storeItemId: code, code, gtin: null, name, brand: null, price, isWeighted: true, unit: 'ק"ג', inStock: true, promotions: [] });
    // Fault 3: Shufersal's only matching carrot is organic - a real price for a different product.
    // Plus an Osher Ad zucchini 5x under everyone else, which no published field marks as wrong.
    const weightChains = {
      shufersal: { catalog: { chainId: 'shufersal', storeId: '1', items: [w('a', 'מארז גזר אורגני', 11.9), w('z', 'קישואים מובחר', 10.9)] }, online: null },
      ramilevy: { catalog: { chainId: 'ramilevy', storeId: '2', items: [w('b', 'גזר ארוז', 4.9), w('z', 'קישוא ירוק', 9.9)] }, online: null },
      carrefour: { catalog: { chainId: 'carrefour', storeId: '3', items: [w('c', 'גזר ארוז', 5.9), w('z', 'קישוא כרעה', 12.9)] }, online: null },
      tivtaam: { catalog: { chainId: 'tivtaam', storeId: '4', items: [w('d', 'גזר', 4.9), w('z', 'קישוא זוקיני', 8.9)] }, online: null },
      osherad: { catalog: { chainId: 'osherad', storeId: '5', items: [w('e', 'גזר-ארוז', 2.9), w('z', 'קישוא קרעה', 1.9)] }, online: null },
    };
    const report = {};
    const products = buildProducts(weightChains, { minChains: 3, max: 10, concepts: conceptList, report });

    const carrot = products.find((p) => p.conceptId === 'carrot');
    assert.ok(carrot, 'carrot is sold by four chains that agree and is worth comparing');
    assert.equal(carrot.chains, 4, 'Shufersal sells no plain loose carrot here, so it does not price one');
    assert.equal(carrot.basePrice, 4.9, 'median of 2.9, 4.9, 4.9, 5.9 - the 11.90 organic pack never enters');

    const zucchini = products.find((p) => p.conceptId === 'zucchini');
    assert.ok(zucchini, 'the bad chain is dropped, not the product - four chains still agree');
    assert.equal(zucchini.chains, 4);
    assert.equal(zucchini.basePrice, 10.9, 'median of 8.9, 9.9, 10.9, 12.9 once Osher Ad is out');
    assert.deepEqual(report.conceptDisagreements.map((d) => [d.conceptId, d.head, d.price]), [['zucchini', 'osherad', 1.9]]);
    assert.deepEqual(carrot.conceptFamily, { id: 'carrot', name: 'גזר' });
    assert.deepEqual(zucchini.conceptFamily, { id: 'zucchini', name: 'קישוא' }, 'no sibling "zucchini-*" in this synthetic list');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('buildConceptProducts: a concept that is a shelf rather than a product publishes no weighed product, while an equally broad-looking one whose chains price the same thing survives', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'concepts-test-'));
  writeFileSync(path.join(tmpDir, 'produce.json'), JSON.stringify({
    concepts: [
      { id: 'deli-salad-other', name: 'סלט מוכן', category: 'מעדנייה', sizeUnit: null, synonyms: ['סלט מוכן'], match: { all: ['סלט'] } },
      { id: 'pastrami-other', name: 'פסטרמה', category: 'מעדנייה', sizeUnit: null, synonyms: ['פסטרמה'], match: { all: ['פסטרמ'] } },
      { id: 'beef-cuts-other', name: 'נתחי בקר', category: 'בשר ועוף', sizeUnit: null, synonyms: ['נתחי בקר'], match: { all: ['נתח'] } },
    ],
  }));
  try {
    const conceptList = loadConcepts(tmpDir);
    const w = (code, name, price) => ({ storeItemId: code, code, gtin: null, name, brand: null, price, isWeighted: true, unit: 'ק"ג', inStock: true, promotions: [] });
    // Fault 4: "סלט מוכן" is a bucket - one chain's cheapest of 14 different salads against another's
    // single nut-and-dried-fruit mix compares two different dishes. `pastrami-other` joined it on 23.9 for a
    // reason a price check cannot see: its chains cluster tightly at 87-106 and still quote six different
    // cures. `beef-cuts-other` is the counter-example that keeps the rule honest - equally a catch-all by its
    // id, one product in practice, and it publishes.
    const weightChains = {
      hazihinam: { catalog: { chainId: 'hazihinam', storeId: '1', items: [w('a', 'סלט טחינה', 35), w('b', 'סלט ביצים', 67), w('p', 'פסטרמה כפרית', 87), w('n', 'נתח אנטרקוט', 120)] }, online: null },
      shufersal: { catalog: { chainId: 'shufersal', storeId: '2', items: [w('c', 'תערובת סלט חמוציות וקשיו', 119), w('p', 'פסטרמה מקסיקנית', 90), w('n', 'נתח אנטרקוט מיושן', 130)] }, online: null },
      tivtaam: { catalog: { chainId: 'tivtaam', storeId: '3', items: [w('d', 'סלט קולסלאו', 42), w('p', 'פסטרמה גחלים', 100), w('n', 'נתח אנטרקוט טרי', 140)] }, online: null },
      keshet: { catalog: { chainId: 'keshet', storeId: '4', items: [w('e', 'סלט מטבוחה', 49), w('p', 'פסטרמה יער שחור', 106), w('n', 'נתח אנטרקוט', 125)] }, online: null },
    };
    const products = buildProducts(weightChains, { minChains: 3, max: 10, concepts: conceptList });
    // The four chains here agree closely enough (35, 42, 49, 119) to clear the price band, which is the
    // point: breadth is invisible to a price check, so BUCKET_CONCEPTS names this one outright.
    assert.equal(products.find((p) => p.conceptId === 'deli-salad-other'), undefined,
      'the cheapest salad in one chain against the only salad in another is not one product - no card rather than a wrong price per kilo');
    assert.equal(products.find((p) => p.conceptId === 'pastrami-other'), undefined,
      'the deli counter sells a family: tight prices over six different cures is still not one product (23.9)');
    const beef = products.find((p) => p.conceptId === 'beef-cuts-other');
    assert.ok(beef, 'equally a catch-all by its id, but every chain quotes the same cut - the rule is not "the id ends in -other"');
    assert.equal(beef.chains, 4);
    assert.equal(beef.basePrice, 130);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('slimCatalog tags a weighed item with its conceptId only inside the published price band - MappingEngine prices carts from the cheapest tagged item, so the cart line cannot contradict the product card', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'concepts-test-'));
  writeFileSync(path.join(tmpDir, 'produce.json'), JSON.stringify({
    concepts: [{ id: 'zucchini', name: 'קישוא', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['קישוא'], match: { all: ['קישוא'] } }],
  }));
  try {
    const conceptList = loadConcepts(tmpDir);
    const w = (code, name, price, isWeighted = true) => ({ storeItemId: code, code, gtin: null, name, brand: null, price, isWeighted, unit: isWeighted ? 'ק"ג' : "יח'", inStock: true, promotions: [] });
    const osherad = { catalog: { chainId: 'osherad', storeId: '1', items: [
      w('z1', 'קישוא קרעה', 1.9), w('z2', 'קישוא', 8.9), w('z3', 'קישוא אורגני', 22.9), w('z4', 'קישוא ממולא באורז', 6.9, false),
    ] }, online: null };
    const slim = slimCatalog('osherad', osherad, new Set(), { conceptPrices: new Map([['zucchini', 9.9]]), conceptList });
    const tagged = slim.items.filter((i) => i.conceptId === 'zucchini');
    assert.deepEqual(tagged.map((i) => i.price), [8.9],
      'the 1.90 the chain lost its vote for stays out, and so do the organic pack and the non-weighted stuffed zucchini');
    assert.equal(tagged[0].unit, 'ק"ג');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('weighed concept invariant: no chain prices a published concept more than 3x from its basePrice, in products.json or in any slim catalog', () => {
  // The guard the two-pass build exists to hold, over a fixture carrying all four faults at once: a bunch
  // quoted against kilos, a tray flagged loose, an organic pack standing in for the plain product and a
  // chain 5x under the rest. scripts/build-products.mjs asserts the same thing on what it wrote and exits
  // non-zero, so a refactor that loses a gate fails the build rather than shipping an inverted ranking.
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'concepts-test-'));
  writeFileSync(path.join(tmpDir, 'produce.json'), JSON.stringify({
    concepts: [
      { id: 'cilantro', name: 'כוסברה', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['כוסברה'], match: { all: ['כוסבר'] } },
      { id: 'mushroom', name: 'פטריות', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['פטריות'], match: { all: ['פטריות'] } },
      { id: 'carrot', name: 'גזר', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['גזר'], match: { all: ['גזר'] } },
    ],
  }));
  try {
    const conceptList = loadConcepts(tmpDir);
    const r = (code, name, price, isWeighted) => ({ storeItemId: code, code, gtin: null, name, brand: null, price, isWeighted, unit: isWeighted ? 'ק"ג' : "יח'", inStock: true, promotions: [] });
    const weightChains = {
      a: { catalog: { chainId: 'a', storeId: '1', items: [r('1', 'כוסברה בתפזורת', 3.2, false), r('2', 'פטריות שמפניון', 9.9, false), r('3', 'פטריות שמפניון תפזור', 39.9, true), r('4', 'גזר ארוז', 4.9, true)] }, online: null },
      b: { catalog: { chainId: 'b', storeId: '2', items: [r('5', 'כוסברה עלים', 100, true), r('6', 'פטריות במשקל', 29.9, true), r('7', 'מארז גזר אורגני', 11.9, true)] }, online: null },
      c: { catalog: { chainId: 'c', storeId: '3', items: [r('8', 'כוסברה במשקל', 39, true), r('9', 'פטריות במשקל', 32.5, true), r('10', 'גזר', 5.9, true)] }, online: null },
      d: { catalog: { chainId: 'd', storeId: '4', items: [r('11', 'פטריות במשקל', 34.9, true), r('12', 'גזר-ארוז', 2.9, true)] }, online: null },
    };
    const products = buildProducts(weightChains, { minChains: 3, max: 20, concepts: conceptList });
    const conceptPrices = new Map(products.filter((p) => p.kind === 'concept').map((p) => [p.conceptId, p.basePrice]));
    assert.ok(conceptPrices.size >= 2, 'the fixture still publishes concept products to check');
    const gtins = new Set(products.map((p) => p.gtin));
    const offenders = [];
    for (const [chainId, data] of Object.entries(weightChains)) {
      for (const i of slimCatalog(chainId, data, gtins, { conceptPrices, conceptList }).items) {
        if (!i.conceptId) continue;
        const base = conceptPrices.get(i.conceptId);
        if (!(i.price <= base * 3 && i.price * 3 >= base)) offenders.push(`${chainId} ${i.conceptId} ${i.price} vs ${base} (${i.name})`);
      }
    }
    assert.deepEqual(offenders, []);
    // and the faults themselves are gone, not merely inside the band
    assert.equal(products.find((p) => p.conceptId === 'cilantro'), undefined, 'two kilo-priced chains is below the threshold once the bunch is out');
    assert.equal(products.find((p) => p.conceptId === 'mushroom').basePrice, 34.9, 'the 9.90 tray never prices the loose mushroom');
    assert.equal(products.find((p) => p.conceptId === 'carrot').chains, 3, 'the organic pack does not let chain b speak for plain carrot');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('slimCatalog: without conceptPrices, weighted/no-GTIN items are not scanned for concepts (barcoded items stay free of the field)', () => {
  const gtins = new Set(['1111111111111', '2222222222222']);
  const a = slimCatalog('a', chains.a, gtins);
  assert.ok(a.items.every((i) => !('conceptId' in i)));
});

test('slimCatalog keeps only unified products; the storefront overlay marks stock but never adds or prices items', () => {
  const gtins = new Set(['1111111111111', '2222222222222']);
  const a = slimCatalog('a', chains.a, gtins);
  assert.deepEqual(a.items.map((i) => i.gtin), ['1111111111111', '2222222222222']);
  const c = slimCatalog('c', chains.c, gtins);
  const milk = c.items.find((i) => i.gtin === '1111111111111');
  assert.equal(milk.inStock, false, 'not returned by the online store -> not sold online');
  assert.equal(milk.price, 8, 'price stays the published one');
  assert.equal(c.items.find((i) => i.gtin === '2222222222222'), undefined, 'known only to the storefront, no published price -> not shown');
  assert.equal(c.priceSource, 'file');
  assert.equal(c.source.online.items, 1);
});

test('slimCatalog: the published online-store file is the price source; the storefront overlay verifies, marks stock and adds images', () => {
  const gtins = new Set(['1', '2', '3']);
  const catalog = { storeId: '039', source: { store: '039' }, items: [
    { gtin: '1', storeItemId: '1', code: '1', name: 'א', price: 7.9, promotions: [] },
    { gtin: '2', storeItemId: '2', code: '2', name: 'ב', price: 9.1, promotions: [] },
    { gtin: '3', storeItemId: '3', code: '3', name: 'ג', price: 4, promotions: [] },
  ] };
  const online = { fetchedAt: 't', items: { 1: { price: 7.9, inStock: true, image: 'img1' }, 2: { price: 9.9, inStock: true } } };
  const slim = slimCatalog('x', { catalog, online }, gtins);
  assert.equal(slim.priceSource, 'file');
  const by = Object.fromEntries(slim.items.map((i) => [i.gtin, i]));
  assert.equal(by['2'].price, 9.1, 'file price wins over the site price');
  assert.equal(by['2'].sitePrice, 9.9, 'the site price is kept for verification');
  assert.equal(by['1'].image, 'img1');
  assert.equal(by['3'].inStock, false, 'not returned by the online store = not sold online');
  assert.deepEqual([slim.source.online.verify.compared, slim.source.online.verify.identical, slim.source.online.verify.mismatchPct], [2, 1, 50]);
});

test('slimCatalog: the storefront overlay is never a price source - products without a published price are not added', () => {
  const catalog = { storeId: '001', source: { store: '001' }, items: [{ gtin: '1', storeItemId: '1', code: '1', name: 'א', price: 7.9, promotions: [] }] };
  const online = { fetchedAt: 't', items: { 1: { price: 8.9, inStock: true }, 2: { price: 3, inStock: true, name: 'רק באתר' } } };
  const slim = slimCatalog('y', { catalog, online }, new Set(['1', '2']));
  assert.equal(slim.priceSource, 'file');
  assert.deepEqual(slim.items.map((i) => [i.gtin, i.price, i.sitePrice]), [['1', 7.9, 8.9]]);
});

test('slimCatalog: private-label items sold by one chain only are included (their gtin is in the shared gtin set) and keep the privateLabel flag', () => {
  const catalog = { storeId: '1', source: { store: '1' }, items: [item('7296073000019', 'שוקו שופרסל 1 ליטר', 5)] };
  const slim = slimCatalog('shufersal', { catalog, online: null }, new Set(['7296073000019']));
  const pl = slim.items.find((i) => i.gtin === '7296073000019');
  assert.ok(pl);
  assert.equal(pl.privateLabel, true);
});

// docs/PLAN-PER-CHAIN-AND-PRICE-HISTORY.md §A2 / docs/PIPELINE-CONTRACT.md §2.4: a chain whose portal
// failed is still published from its last good catalog.full.json, marked stale; a chain with no file at
// all is "missing" and removed, loudly. `data/pipeline-status.json` is the contract with A1.

test('slimCatalog: a chain marked failed in the status file gets fetchStatus "failed" and failedSince/fetchedAt copied, while its items still come from the existing catalog.full.json', () => {
  const gtins = new Set(['1111111111111', '2222222222222']);
  const status = { status: 'failed', sourceDate: '2026-09-21T05:18:49+03:00', fetchedAt: '2026-09-21T05:57:02+03:00', failedSince: '2026-09-22T05:55:00+03:00', attempts: 4, error: 'laib: list returned 0 files' };
  const slim = slimCatalog('a', chains.a, gtins, { status });
  assert.equal(slim.fetchStatus, 'failed');
  assert.equal(slim.failedSince, '2026-09-22T05:55:00+03:00');
  assert.equal(slim.fetchedAt, '2026-09-21T05:57:02+03:00');
  // items are still built from the (stale) catalog.full.json handed to slimCatalog - nothing about the
  // failure blanks them out
  assert.deepEqual(slim.items.map((i) => i.gtin).sort(), ['1111111111111', '2222222222222']);
});

test('slimCatalog: with no status entry (no status file, or the chain missing from one), fetchStatus is "ok" and failedSince/fetchedAt are null', () => {
  const gtins = new Set(['1111111111111', '2222222222222']);
  const slim = slimCatalog('a', chains.a, gtins);
  assert.equal(slim.fetchStatus, 'ok');
  assert.equal(slim.failedSince, null);
  assert.equal(slim.fetchedAt, null);
  // an "ok" status entry (e.g. from a healthy chain in the status file) is the same as no entry at all
  const slimOk = slimCatalog('a', chains.a, gtins, { status: { status: 'ok', sourceDate: 't', fetchedAt: 'f' } });
  assert.equal(slimOk.fetchStatus, 'ok');
  assert.equal(slimOk.fetchedAt, 'f', 'fetchedAt still rides along on an ok status');
});

test('readPipelineStatus: tolerates a missing file (treat every chain as "ok") and round-trips through writePipelineStatus atomically', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'pipeline-status-test-'));
  try {
    const missingPath = path.join(tmpDir, 'does-not-exist.json');
    assert.equal(readPipelineStatus(missingPath), null);

    const statusPath = path.join(tmpDir, 'pipeline-status.json');
    const status = { runAt: '2026-09-23T05:58:12+03:00', chains: { shufersal: { status: 'ok', sourceDate: 't1', fetchedAt: 't2' } } };
    writePipelineStatus(status, statusPath);
    assert.deepEqual(readPipelineStatus(statusPath), status);

    // an unparsable file is treated the same as a missing one, not a crash
    writeFileSync(statusPath, 'not json');
    assert.equal(readPipelineStatus(statusPath), null);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('markChainsMissing: a chain with no catalog.full.json is marked "missing" in the status file, preserving its other recorded fields; chains without a status file are left alone', () => {
  const status = { runAt: 't', chains: {
    victory: { status: 'failed', sourceDate: 's1', fetchedAt: 'f1', failedSince: 'x', attempts: 4, error: 'boom' },
    shufersal: { status: 'ok', sourceDate: 's2', fetchedAt: 'f2' },
  } };
  const updated = markChainsMissing(status, ['victory']);
  assert.equal(updated.chains.victory.status, 'missing');
  // everything else recorded for victory (sourceDate of its last good file, attempts, error) survives
  assert.equal(updated.chains.victory.sourceDate, 's1');
  assert.equal(updated.chains.victory.attempts, 4);
  assert.equal(updated.chains.shufersal.status, 'ok', 'a chain not passed in is untouched');
  // a chain with no prior entry at all still gets one
  const fresh = markChainsMissing(status, ['brandnew']);
  assert.equal(fresh.chains.brandnew.status, 'missing');

  // no status file at all (null): build-products never creates one, A1 owns that - nothing to write back
  assert.equal(markChainsMissing(null, ['victory']), null);
  // nothing missing: status is returned unchanged
  assert.equal(markChainsMissing(status, []), status);
});

test('build pipeline, temp-dir integration: a chain with catalog.full.json but no status entry builds "ok"; a failed chain builds stale from its old file; a chain with no catalog.full.json is removed and gains status "missing"', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'pipeline-integration-test-'));
  try {
    // Simulates what build-products.mjs's CLI block does, but entirely against a temp directory instead
    // of the real data/ - never touches the repo's data/pipeline-status.json or data/catalogs.
    const catalogDir = path.join(tmpDir, 'catalogs');
    mkdirSync(catalogDir, { recursive: true });
    const statusPath = path.join(tmpDir, 'pipeline-status.json');
    writePipelineStatus({ runAt: 't', chains: {
      b: { status: 'failed', sourceDate: 'old-source-date', fetchedAt: 'old-fetch', failedSince: '2026-09-22T05:55:00+03:00', attempts: 4, error: 'timeout' },
      // "gone" is a chain that used to publish a catalog (a stale slim file for it already sits in
      // catalogDir, seeded below) but has no catalog.full.json in this run at all.
    } }, statusPath);
    // seed a pre-existing slim catalog for a chain that is about to disappear
    writeFileSync(path.join(catalogDir, 'gone.json'), JSON.stringify({ chainId: 'gone' }));

    const testChains = { a: chains.a, b: chains.b }; // 'gone' deliberately absent, like a missing catalog.full.json
    const gtins = new Set(['1111111111111', '2222222222222']);
    const pipelineStatus = readPipelineStatus(statusPath);
    const missingChainIds = [];
    for (const [chainId, data] of Object.entries(testChains)) {
      const status = pipelineStatus?.chains?.[chainId];
      const slim = slimCatalog(chainId, data, gtins, { status });
      writeFileSync(path.join(catalogDir, `${chainId}.json`), JSON.stringify(slim));
    }
    for (const file of readdirSync(catalogDir)) {
      const id = file.replace(/\.json$/, '');
      if (id !== 'demo' && !testChains[id]) { unlinkSync(path.join(catalogDir, file)); missingChainIds.push(id); }
    }
    if (missingChainIds.length) {
      const updated = markChainsMissing(pipelineStatus, missingChainIds);
      if (updated) writePipelineStatus(updated, statusPath);
    }

    const slimA = JSON.parse(readFileSync(path.join(catalogDir, 'a.json'), 'utf8'));
    assert.equal(slimA.fetchStatus, 'ok', 'no status entry for a -> ok');

    const slimB = JSON.parse(readFileSync(path.join(catalogDir, 'b.json'), 'utf8'));
    assert.equal(slimB.fetchStatus, 'failed');
    assert.equal(slimB.failedSince, '2026-09-22T05:55:00+03:00');
    assert.ok(slimB.items.length > 0, 'the failed chain is still built from its (stale) catalog.full.json, not dropped');

    assert.equal(existsSync(path.join(catalogDir, 'gone.json')), false, 'a chain with no catalog.full.json is removed, as today');
    const finalStatus = readPipelineStatus(statusPath);
    assert.equal(finalStatus.chains.gone.status, 'missing');
    assert.equal(finalStatus.chains.b.status, 'failed', 'untouched chains keep their status');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('applySiteCodes: the site code replaces the formula, unknown barcodes are not sold online, unchecked ones keep the formula', () => {
  const codes = { fetchedAt: 't', items: { '1': { code: 'P_999', checkedAt: 't' }, '2': { code: null, checkedAt: 't' }, '4': { error: 'HTTP 500', checkedAt: 't' } } };
  const it = (gtin) => ({ gtin, storeItemId: `P_${gtin}`, price: 1, inStock: true });
  assert.equal(applySiteCodes(it('1'), codes).storeItemId, 'P_999');
  assert.equal(applySiteCodes(it('2'), codes).inStock, false);
  assert.equal(applySiteCodes(it('3'), codes).storeItemId, 'P_3', 'never checked -> formula');
  assert.equal(applySiteCodes(it('4'), codes).storeItemId, 'P_4', 'lookup error -> formula');
  assert.equal(applySiteCodes(it('1'), null).storeItemId, 'P_1');
});

test('slimCatalog: a catalog.full.json downloaded after failedSince means the chain recovered - the stale status entry does not paint it failed (22.9)', () => {
  const gtins = new Set(['1111111111111', '2222222222222']);
  const status = { status: 'failed', sourceDate: '2026-09-21T05:18:49+03:00', fetchedAt: '2026-09-21T20:15:00+03:00', failedSince: '2026-09-22T03:19:00+03:00', attempts: 3, error: 'laib: list returned 0 files' };
  const fresh = { ...chains.a, catalog: { ...chains.a.catalog, generatedAt: '2026-09-22T07:01:30.000Z' } };
  const slim = slimCatalog('a', fresh, gtins, { status });
  assert.equal(slim.fetchStatus, 'ok');
  assert.equal(slim.failedSince, null);
  assert.equal(slim.fetchedAt, '2026-09-22T07:01:30.000Z', 'the download time of the file that recovered it');
  // and a file older than the failure is still failed
  const old = { ...chains.a, catalog: { ...chains.a.catalog, generatedAt: '2026-09-21T17:15:00.000Z' } };
  assert.equal(slimCatalog('a', old, gtins, { status }).fetchStatus, 'failed');
});

test('conceptForCategory: a fresh-produce concept is dropped from a product whose department is not produce (23.9)', () => {
  const list = [
    { id: 'herb-parsley', name: 'פטרוזיליה', category: 'ירקות ופירות' },
    { id: 'hummus', name: 'חומוס', category: 'מעדנייה' },
  ];
  // dried parsley in a shaker: reviewed into שימורים, must not headline as the fresh herb nor substitute for it
  assert.equal(conceptForCategory('herb-parsley', 'שימורים', list), null);
  // the fresh bunch keeps its concept
  assert.equal(conceptForCategory('herb-parsley', 'ירקות ופירות', list), 'herb-parsley');
  // a non-produce concept may sit in a neighbouring department
  assert.equal(conceptForCategory('hummus', 'שימורים', list), 'hummus');
  assert.equal(conceptForCategory(null, 'שימורים', list), null);
  assert.equal(conceptForCategory('no-such-concept', 'שימורים', list), 'no-such-concept');
  // raw-meat concepts are fresh too: nuggets in מעדנייה and portobello in ירקות ופירות lose "שניצל עוף" / "סטייק בקר"
  const meat = [...list, { id: 'schnitzel-chicken', name: 'שניצל עוף', category: 'בשר ועוף' }];
  assert.equal(conceptForCategory('schnitzel-chicken', 'מעדנייה', meat), null);
  assert.equal(conceptForCategory('schnitzel-chicken', 'ירקות ופירות', meat), null);
  assert.equal(conceptForCategory('schnitzel-chicken', 'בשר ועוף', meat), 'schnitzel-chicken');
});

test('conceptFamily (docs/CONCEPTS.md §10-11): a GTIN product and a weighed concept product that split the same variety share one conceptFamily, and a product with no conceptId gets null', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'concepts-test-'));
  writeFileSync(path.join(tmpDir, 'produce.json'), JSON.stringify({
    concepts: [
      // Two barcoded varieties of the same shopper-facing family, and a loose (weighed, no-gtin) sibling.
      { id: 'cherrytomato-red', name: 'עגבניית שרי אדומה ארוזה', category: 'ירקות ופירות', sizeUnit: 'g', defaultSize: 250, synonyms: [], match: { all: ['שרי'], any: ['אדומ'] } },
      { id: 'cherrytomato-yellow', name: 'עגבניית שרי צהובה ארוזה', category: 'ירקות ופירות', sizeUnit: 'g', defaultSize: 250, synonyms: [], match: { all: ['שרי'], any: ['צהוב'] } },
      { id: 'cherrytomato-loose', name: 'עגבניית שרי במשקל', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['עגבניית שרי'], match: { all: ['שרי'], none: ['אדומ', 'צהוב'] } },
      // Unrelated single concept, no sibling anywhere.
      { id: 'endive', name: 'עולש', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['עולש'], match: { all: ['עולש'] } },
    ],
  }));
  try {
    const conceptList = loadConcepts(tmpDir);
    const barcoded = (gtin, name, price) => ({ storeItemId: gtin, code: gtin, gtin, name, brand: 'X', price, isWeighted: false, unit: "יח'", inStock: true, promotions: [] });
    const weighed = (code, name, price) => ({ storeItemId: code, code, gtin: null, name, brand: null, price, isWeighted: true, unit: 'ק"ג', inStock: true, promotions: [] });
    const familyChains = {
      a: { catalog: { chainId: 'a', storeId: '1', items: [barcoded('6666666666661', 'עגבניית שרי אדומה ארוזה 250 גרם', 7.9), weighed('t1', 'עגבניית שרי במשקל', 12.9)] }, online: null },
      b: { catalog: { chainId: 'b', storeId: '2', items: [barcoded('6666666666661', 'עגבניית שרי אדומה ארוזה 250 גרם', 8.5), weighed('t2', 'עגבניית שרי במשקל', 13.5)] }, online: null },
      c: { catalog: { chainId: 'c', storeId: '3', items: [barcoded('6666666666661', 'עגבניית שרי אדומה ארוזה 250 גרם', 7.5), weighed('t3', 'עגבניית שרי במשקל', 11.9)] }, online: null },
    };
    const products = buildProducts(familyChains, { minChains: 3, max: 10, concepts: conceptList });

    const barcodedRed = products.find((p) => p.gtin === '6666666666661');
    assert.ok(barcodedRed, 'the barcoded cherry-tomato variety clears the shared-product threshold');
    assert.equal(barcodedRed.conceptId, 'cherrytomato-red');

    const loose = products.find((p) => p.conceptId === 'cherrytomato-loose');
    assert.ok(loose, 'the loose (weighed, no-gtin) sibling clears the 3-chain concept-product threshold');
    assert.equal(loose.kind, 'concept');

    // Same category, ids share the "cherrytomato" prefix -> one family, no families.json entry for it here,
    // so the name falls back to the shortest of the three sibling names.
    assert.deepEqual(barcodedRed.conceptFamily, loose.conceptFamily, 'a GTIN product and a weighed concept product in the same variety split share one conceptFamily');
    assert.equal(barcodedRed.conceptFamily.id, 'cherrytomato');
    assert.equal(barcodedRed.conceptFamily.name, 'עגבניית שרי במשקל', 'shortest sibling name wins when families.json has no entry for this made-up prefix');

    // A concept with no sibling is still its own family, not null.
    assert.equal(conceptFamilyFor('endive', conceptList).id, 'endive');
    // No conceptId at all -> no family, not "the department's family".
    assert.equal(conceptFamilyFor(null, conceptList), null);
    // A conceptId conceptForCategory would drop (docs/CONCEPTS.md §7, 23.9) carries no family either -
    // build-products.mjs computes conceptFamily from the FINAL conceptId, after that guard runs.
    assert.equal(conceptForCategory('cherrytomato-red', 'שימורים', conceptList), null);
    assert.equal(conceptFamilyFor(conceptForCategory('cherrytomato-red', 'שימורים', conceptList), conceptList), null);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Department shards (docs/PIPELINE-CONTRACT.md §2.1.1, decision 23.9): products.json stays the authoritative
// full list, but scripts/build-products.mjs also writes one file per department plus an index describing
// them, so a consumer can download one department instead of the whole catalog.

test('DEPARTMENT_SLUGS: the exact, stable slug list for the 15 departments, plus a fixed "other" slug for anything else - a consumer keys data/products/<slug>.json off these, so they must never silently change', () => {
  assert.deepEqual(DEPARTMENT_SLUGS, {
    'ירקות ופירות': 'produce',
    'בשר ועוף': 'meat',
    'חלב וביצים': 'dairy',
    'מאפים ולחם': 'bakery',
    'חטיפים וממתקים': 'snacks',
    'משקאות': 'beverages',
    'שימורים': 'pantry',
    'ניקיון וטואלטיקה': 'cleaning',
    'מעדנייה': 'deli',
    'תינוקות': 'baby',
    'בעלי חיים': 'pets',
    'בית וכלים': 'household',
    'טיפוח ויופי': 'beauty',
    'פארם ותוספים': 'pharmacy',
    'כללי': 'general',
  });
  assert.equal(OTHER_DEPARTMENT_SLUG, 'other');
});

test('shardProductsByDepartment: every product lands in exactly one shard, the shard counts sum to the input length, and a missing or unknown category falls into "other" instead of being dropped', () => {
  const products = [
    { id: 'g1', name: 'חלב 3%', category: 'חלב וביצים' },
    { id: 'g2', name: 'עגבניות', category: 'ירקות ופירות' },
    { id: 'g3', name: 'יוגורט', category: 'חלב וביצים' },
    { id: 'g4', name: 'משהו מוזר', category: 'לא קטגוריה אמיתית' }, // unknown category (data bug)
    { id: 'g5', name: 'בלי קטגוריה בכלל' }, // category missing entirely
  ];
  const bySlug = shardProductsByDepartment(products);
  const total = [...bySlug.values()].reduce((n, items) => n + items.length, 0);
  assert.equal(total, products.length, 'the shards sum to the full input, not more and not less');
  for (const p of products) {
    const inShards = [...bySlug.entries()].filter(([, items]) => items.includes(p));
    assert.equal(inShards.length, 1, `${p.id} must land in exactly one shard, not ${inShards.length}`);
  }
  assert.deepEqual(bySlug.get('dairy').map((p) => p.id), ['g1', 'g3']);
  assert.deepEqual(bySlug.get('produce').map((p) => p.id), ['g2']);
  assert.deepEqual(bySlug.get(OTHER_DEPARTMENT_SLUG).map((p) => p.id).sort(), ['g4', 'g5'],
    'both an unknown category and a missing one land in "other" rather than vanishing from every shard');
});

test('writeProductShards: writes one file per non-empty department, the index lists exactly the shard files that exist on disk (and no others), counts sum to the total, and a stale shard from a previous build is removed', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'products-shards-test-'));
  try {
    const productsDir = path.join(tmpDir, 'products');
    const indexPath = path.join(tmpDir, 'products-index.json');
    // Seed a stale shard from a "previous build" whose department has since disappeared from this run -
    // it must not survive the write, and must not be listed in the index either.
    mkdirSync(productsDir, { recursive: true });
    writeFileSync(path.join(productsDir, 'stale-department.json'), '[]\n');

    const products = [
      { id: 'g1', category: 'חלב וביצים' },
      { id: 'g2', category: 'חלב וביצים' },
      { id: 'g3', category: 'ירקות ופירות' },
      { id: 'g4', category: 'לא ידוע' }, // unknown -> other.json
    ];
    const rows = writeProductShards(products, { productsDir, indexPath, buildId: '2026-09-23T00:00:00.000Z' });

    const filesOnDisk = readdirSync(productsDir).sort();
    assert.deepEqual(filesOnDisk, ['dairy.json', 'other.json', 'produce.json'],
      'the stale department file is gone, and only the shards this build actually produced remain');

    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    assert.equal(index.version, 1);
    assert.equal(index.buildId, '2026-09-23T00:00:00.000Z');
    assert.equal(index.generatedAt, '2026-09-23T00:00:00.000Z');
    assert.equal(index.total, products.length);
    assert.deepEqual(index.departments.map((d) => d.file).sort(), filesOnDisk.map((f) => `products/${f}`),
      'the index lists exactly the files on disk and no others');
    assert.equal(index.departments.reduce((n, d) => n + d.count, 0), products.length, 'the shard counts sum to products.json\'s length');
    for (const d of index.departments) {
      const onDisk = JSON.parse(readFileSync(path.join(tmpDir, d.file), 'utf8'));
      assert.equal(onDisk.length, d.count, `${d.file} on disk has as many items as the index says`);
      assert.ok(Number.isInteger(d.bytes) && d.bytes > 0, `${d.file} carries a real byte size`);
    }
    assert.deepEqual(rows.map((r) => r.id).sort(), ['dairy', 'other', 'produce']);
    assert.equal(index.departments.find((d) => d.id === 'other').name, 'אחר');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

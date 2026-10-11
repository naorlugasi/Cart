import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConcepts, assignConcept, stripManufacturer, isUsableManufacturer } from '../src/catalog/concepts.js';
import { buildProducts } from '../scripts/build-products.mjs';

/**
 * docs/CONCEPTS.md §1, Naor 11.10: "סולת בשקית טחנת קמח דגן (1 ק"ג)" at Victory got `flour-white`
 * because the MILL's own name, "טחנת קמח דגן", contains the bare word קמח (flour) - the concept matcher
 * never saw the manufacturer, only the name it had already bled into. stripManufacturer removes it
 * before matching; these tests use the real, loaded concept set (the same `flour-white`/`semolina` pair
 * the defect was found in) so a future edit to either concept's `none`/`all` is caught here too.
 */
const concepts = loadConcepts();

test('the flour-mill case: a manufacturer name is removed before matching, so the mill no longer feeds flour-white', () => {
  const name = 'סולת בשקית טחנת קמח דגן (1 ק"ג)';
  const manufacturer = 'טחנת קמח דגן';
  // Without stripping, the mill's own קמח would otherwise be the only thing standing between this and
  // the right concept - assert the fixture itself still demonstrates the risk the fix removes.
  assert.ok(stripManufacturer(name, manufacturer, concepts).includes('סולת'), 'the product noun survives the strip');
  assert.equal(assignConcept(name, concepts), 'semolina', 'docs/CONCEPTS.md §1: the none-list already protects the raw name independently of stripManufacturer');
  const stripped = stripManufacturer(name, manufacturer, concepts);
  assert.ok(!stripped.includes('קמח'), 'the manufacturer phrase (and the קמח inside it) is gone');
  assert.equal(assignConcept(stripped, concepts), 'semolina');
  assert.notEqual(assignConcept(stripped, concepts), 'flour-white');
});

test('a filler manufacturer ("לא ידוע", a bare comma or dash) is never stripped - there is nothing to remove', () => {
  const name = 'סולת בשקית טחנת קמח דגן (1 ק"ג)';
  for (const filler of ['לא ידוע', ',', '-', 'כללי', 'unknown']) {
    assert.equal(stripManufacturer(name, filler, concepts), stripManufacturer(name, null, concepts), `"${filler}" must act exactly like no manufacturer at all`);
    assert.equal(isUsableManufacturer(filler), false);
  }
});

test('a manufacturer that equals the whole product name is never stripped - nothing would be left', () => {
  const name = 'קמח';
  // The candidate equals the whole (normalized) text - stripManufacturer must refuse rather than empty it.
  assert.equal(stripManufacturer(name, 'קמח', concepts), 'קמח');
});

test('a brand-line concept still matches with its brand word present: Pringles keeps its name when an unrelated manufacturer field is stripped', () => {
  const name = 'פרינגלס מלוח 165 גרם';
  assert.equal(assignConcept(name, concepts), 'pringles');
  // "קלוגס" (Kellogg's) never appears in this name, so stripping it is a no-op either way - the point is
  // that stripManufacturer is only ever given the MANUFACTURER field, never config/products/brands.json's
  // reviewed `brand`, so "פרינגלס" itself is never at risk of being treated as noise to remove.
  const stripped = stripManufacturer(name, 'קלוגס', concepts);
  assert.ok(stripped.includes('פרינגלס'));
  assert.equal(assignConcept(stripped, concepts), 'pringles');
});

test('a manufacturer that IS the concept-holding brand is protected even though it also matches a trigger word alone (Ferrero Rocher, Naor 11.10 follow-up)', () => {
  // "פררו" alone resolves to ferrero-rocher (its own `all`), and "פררו רושר" (one chain's "Rocher"
  // spelling) is still that concept's own two-word brand, not a company name that happens to contain a
  // trigger word - unlike the mill, there is no "extra" word here to strip away.
  const name = 'פררו רושר 375 גרם';
  const stripped = stripManufacturer(name, 'פררו רושר', concepts);
  assert.equal(stripped, 'פררו רושר 375 גרמ', 'the brand survives untouched');
  assert.equal(assignConcept(stripped, concepts), 'ferrero-rocher');
});

test('a manufacturer that doubles as a pet-food type-word signal is protected (Gourmet Gold, found via a regression)', () => {
  // "גורמה גולד" is both this barcode's manufacturer AND the literal phrase config/concepts/type-
  // words.json's `pet` list uses to flag a cat-food product whose truncated name dropped "לחתול"/
  // "מזון" - removing it silently turned the cat food into feta cheese once "פטה" stood alone.
  const name = 'גורמה גולד פטה הודו';
  assert.equal(assignConcept(name, concepts), null, 'the pet guard already blocks every food concept on the raw name');
  const stripped = stripManufacturer(name, 'גורמה גולד', concepts);
  assert.equal(stripped, stripManufacturer(name, null, concepts), 'protected: identical to having no manufacturer at all');
  assert.equal(assignConcept(stripped, concepts), null, 'still blocked after the (non-)strip - never feta-cheese');
});

test('isUsableManufacturer: empty, filler and too-short values are unusable; a real name is usable', () => {
  assert.equal(isUsableManufacturer(null), false);
  assert.equal(isUsableManufacturer(''), false);
  assert.equal(isUsableManufacturer('לא ידוע'), false);
  assert.equal(isUsableManufacturer('קג'), false, 'under 3 letters');
  assert.equal(isUsableManufacturer('טחנת קמח דגן'), true);
  assert.equal(isUsableManufacturer('תנובה'), true);
});

/**
 * Build-level seam (test/buildProducts.test.js's own `item()`/`chains` pattern): a synthetic concept
 * pair recreating the exact flour-mill/semolina shape, so the wiring inside pickConcept (scripts/
 * build-products.mjs) - not just stripManufacturer in isolation - is what is under test. `item()`
 * defaults `brand: 'X'`, overridden here per docs/CONCEPTS.md §1/§8.
 */
test('build level: a mill-like manufacturer no longer sends a product to the wrong flour concept (pickConcept, scripts/build-products.mjs)', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'mfr-strip-build-'));
  writeFileSync(path.join(tmpDir, 'flour.json'), JSON.stringify({
    concepts: [
      { id: 'flour-white-fixture', name: 'קמח לבן', category: 'שימורים', sizeUnit: 'g', defaultSize: 1000,
        synonyms: ['קמח'], match: { all: ['קמח'] } },
      { id: 'semolina-fixture', name: 'סולת', category: 'שימורים', sizeUnit: 'g', defaultSize: 1000,
        match: { all: ['(^| )סולת'] } },
    ],
  }));
  const conceptList = loadConcepts(tmpDir);
  const item = (gtin, name, price, brand) => ({ storeItemId: gtin, code: gtin, gtin, name, brand, price, isWeighted: false, unit: "יח'", inStock: true, promotions: [] });
  const gtin = '7290003107315';
  const chains = {
    // "בשקית" dropped from the Victory name only to dodge an unrelated categorize() quirk ("in a bag"
    // reads as a cleaning-aisle keyword) that would otherwise make conceptForCategory drop the concept
    // for a reason that has nothing to do with this test.
    victory: { catalog: { chainId: 'victory', storeId: '1', items: [item(gtin, 'סולת טחנת קמח דגן (1 קג)', 4.5, null)] }, online: null },
    yochananof: { catalog: { chainId: 'yochananof', storeId: '2', items: [item(gtin, 'סולת בד"צ ארוז 1 קג', 4.9, 'לא ידוע')] }, online: null },
    tivtaam: { catalog: { chainId: 'tivtaam', storeId: '3', items: [item(gtin, 'סולת בד"צ ארוז 1 קג', 4.9, 'לא ידוע')] }, online: null },
  };
  // Without flour-white's own exclusion of "סולת" this would need the manufacturer strip to win at
  // all; with it, the assertion that matters is that the mill's own name never resurrects flour-white.
  const products = buildProducts(chains, { minChains: 1, max: 10, concepts: conceptList });
  const p = products.find((pr) => pr.gtin === gtin);
  assert.ok(p, 'the product made it into the build');
  assert.equal(p.conceptId, 'semolina-fixture');
  assert.notEqual(p.conceptId, 'flour-white-fixture');
});

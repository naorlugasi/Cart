import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept, matchingConcepts } from '../src/catalog/concepts.js';

// Meat-fish round 2 (27.9): salmon-fillet spread measurement, 30 thin-synonym fixes and a
// department coverage pass on "בשר ועוף". One capture case and one near-miss refusal per new
// concept, plus a few of the existing-concept fixes this round needed to stop losing products to
// truncated names and alternate spellings. See the round notes in the commit message for the
// LOST-column accounting and the salmon-fillet spread numbers.

const concepts = loadConcepts();

// --- new concepts ---

test('chicken-fillet captures a real chicken fillet listing', () => {
  assert.equal(assignConcept('פילה עוף טרי ארוז', concepts), 'chicken-fillet');
});

test('chicken-fillet refuses its near-miss: a fish fillet from a brand whose name starts with עופ', () => {
  // "פילה אמנון ... עופר" - "עופר" is a supplier name (ProFood/"Ofer"), not עוף; before this guard
  // it collided with amnon-fillet and dropped the product from BOTH concepts (TRAPS #14).
  assert.notEqual(assignConcept('פילה אמנון ללא עור ויינר פוד ג עופר', concepts), 'chicken-fillet');
  assert.equal(assignConcept('פילה אמנון ללא עור ויינר פוד ג עופר', concepts), 'amnon-fillet');
});

test('chicken-fillet refuses pet food that says פילה עוף without the central pet vocabulary catching the brand name', () => {
  assert.notEqual(assignConcept('פריסקיז פריים פילה עוף ברוטב 156 גר', concepts), 'chicken-fillet');
});

test('filet-mignon captures a real filet mignon listing', () => {
  assert.equal(assignConcept('פילה מיניון טרי עטרה', concepts), 'filet-mignon');
});

test('filet-mignon refuses its near-miss: Minions-branded merchandise, not a cut', () => {
  assert.notEqual(assignConcept('המיניונים - בייגלה רשתות עם מלח - 300 גר', concepts), 'filet-mignon');
});

test('beef-jerky captures a real jerky listing', () => {
  assert.equal(assignConcept('ביף גרקי קלאסי - בשר בקר מיובש', concepts), 'beef-jerky');
  assert.equal(assignConcept("בילטונג - בשר כבוש מיובש 60 גרם", concepts), 'beef-jerky');
});

test('beef-jerky refuses its near-miss: pickled gherkins, not jerky', () => {
  // "גרקינס" (gherkins) shares the "גרקי" stem with ג'רקי (jerky) - a bare, unbounded stem would
  // have swallowed it the same way "טלה" or "כרעי" would swallow an unrelated word.
  assert.notEqual(assignConcept('מלפפונים גרקינס בחומץ', concepts), 'beef-jerky');
});

test('fish-dried-salted captures a real dried/salted fish snack', () => {
  assert.equal(assignConcept('דג צנינון מלוח מיובש', concepts), 'fish-dried-salted');
});

test('fish-dried-salted refuses its near-misses: a cereal bar and a pretzel brand, not fish', () => {
  // "דגנים" (cereal/grains) starts with "דג"; "בייגלה דג דג" is a pretzel snack literally named
  // "Dag Dag", not fish. Both would conflict with cereal-bar/pretzels if "דג" were left unbounded.
  assert.notEqual(assignConcept('קורני חטיף דגנים שוקולד חלב - קרמל מלוח', concepts), 'fish-dried-salted');
  assert.notEqual(assignConcept('בייגלה דג דג מלוח 250 גר', concepts), 'fish-dried-salted');
});

test('fish-dried-salted stays out of the way of concepts that already own their own dried/salted fish', () => {
  // herring (produce-deli-frozen.json) and salmon-frozen (this file) both already claim their own
  // "דג ... מלוח" listings; a bucket concept without these guards would conflict with both.
  assert.equal(assignConcept("חתיכות פילה דג הרינג מלוח בשמן מצונן 400 גר", concepts), 'herring');
  assert.equal(assignConcept('פילה דג סלמון מלוח פרוס(מוכן לאכילה) קפוא 100 גר', concepts), 'salmon-frozen');
});

// --- existing-concept fixes this round ---

test('kebab-frozen now captures the attached-ה branding pattern ("הקבב של X")', () => {
  // the old pattern "(^| )קבב( |$)" required a space or string-start right before קבב, which a
  // directly-attached Hebrew prefix letter (ה/ב/ו/כ/ל/מ/ש) never satisfies.
  assert.equal(assignConcept('הקבב של בבר 600 גרם', concepts), 'kebab-frozen');
});

test('chicken-leg and chicken-drumstick now capture truncated brand-first listings with no species word', () => {
  // the government price file's 20-char name limit cuts these off before "עוף" appears; כרעיים/
  // שוקיים never appear with another species in the catalog, so dropping the "any: עופ"
  // requirement (kept safe by the existing turkey/beef/lamb none guards) recovers them.
  assert.equal(assignConcept('כרעיים מחפוד טרי אר', concepts), 'chicken-leg');
  assert.equal(assignConcept('שוקיים מחפוד טרי ארו', concepts), 'chicken-drumstick');
});

test('chicken-leg and chicken-drumstick still refuse a spice-mix jar for the same cut', () => {
  assert.notEqual(assignConcept('תבלין לכרעיים 30 גר', concepts), 'chicken-leg');
  assert.notEqual(assignConcept('תבלין לשוקיים 30 גר', concepts), 'chicken-drumstick');
});

test('salmon-frozen/portions/cuts now capture the סלומון spelling variant', () => {
  assert.equal(assignConcept('קוביות סלומון קפוא 100% דג 300 גרם תנובה', concepts), 'salmon-frozen');
  assert.equal(assignConcept('פילה סלומון קוהו מנות עם עור 400גר בל', concepts), 'salmon-portions');
});

test('bass-fillet now captures the באס spelling variant', () => {
  assert.equal(assignConcept('פילה באס טרי שופרסל לקג', concepts), 'bass-fillet');
});

// --- synonyms (job 2): a phrase a shopper types resolves to the concept, not just its printed name ---

test('new synonym forms resolve for a sample of the 30 concepts this round de-thinned', () => {
  const byId = Object.fromEntries(concepts.map((c) => [c.id, c]));
  const has = (id, phrase) => (byId[id].synonyms ?? []).includes(phrase);
  assert.ok(has('schnitzel-chicken', 'אצבעות שניצל עוף'));
  assert.ok(has('chicken-sausage', 'נקניק עוף'));
  assert.ok(has('shawarma-meat', 'שוארמה'));
  assert.ok(has('chicken-wings', 'כנף עוף'));
  assert.ok(has('turkey-ground', 'הודו טחון'));
  assert.ok(has('mussel-meat', 'מולים'));
});

test('no new synonym this round names a concept outside meat-fish.json (no shared phrase introduced)', () => {
  const owners = new Map();
  for (const c of concepts) {
    for (const p of [c.name, ...(c.synonyms ?? [])]) owners.set(p, [...(owners.get(p) ?? []), c.id]);
  }
  const mine = concepts.filter((c) => c.file.endsWith('meat-fish.json')).map((c) => c.id);
  const bad = [];
  for (const id of mine) {
    const c = concepts.find((x) => x.id === id);
    for (const p of [c.name, ...(c.synonyms ?? [])]) {
      const others = new Set(owners.get(p));
      others.delete(id);
      if (others.size) bad.push(`${p} -> ${id}, ${[...others].join(', ')}`);
    }
  }
  assert.deepEqual(bad, []);
});

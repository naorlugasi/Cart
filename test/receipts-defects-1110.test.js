import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept, matchingConcepts } from '../src/catalog/concepts.js';
import { compatible } from '../src/pricing/substituteRules.js';

/**
 * 11.10.2026 - five real Osher Ad receipts run against production /compare turned up a batch of
 * wrong or missing stand-ins (ops scratch: receipts-prod-offers.json). Each defect below is the
 * capture + the near-miss that used to collide with it, so a regression on either side fails loudly.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

// --- Defect 1: semolina ("סולת") is not flour. "קמח בהיר טחנות ישראל" (flour) was offered
// "סולת בשקית טחנת קמח דגן" (semolina) at Victory because both carried flour-white - semolina's name
// happens to contain the word "קמח" ("טחנת קמח דגן" is the miller's name, not the product). Semolina
// gets its own leaf; flour-white excludes it explicitly.
test('semolina is its own concept, separate from white flour', () => {
  is('סולת בשקית טחנת קמח דגן (1 קג)', 'semolina');
  is('קמח בהיר טחנות ישראל', 'flour-white');
  is('סולת 1 קג', 'semolina');
  is('סולת חיטה דגן 1 קג', 'semolina');
  // near-misses that must not fall into semolina
  isNot('קונסולת משחקים דיגיטלי', 'semolina'); // console, "סולת" has no word-start here
  isNot('סארבקס קפסולת אספרסו רוסט 36 יח', 'semolina'); // capsule
  isNot('קוסקוס סולת בינוני מאסטר שף 350 גרם', 'semolina'); // couscous is its own concept
  isNot('מיני מעמול סולת', 'semolina'); // ma'amoul pastry, not raw semolina
  isNot('סולת מאורז לנמנעים מגלוטן', 'semolina'); // rice-based, stays rice-white
  assert.equal(assignConcept('סולת מאורז לנמנעים מגלוטן', concepts), 'rice-white');
});

// --- Defect 2: paper baking cups ("עטרות"/cupcake liners) are not baking paper. "נייר אפיה הנמל קשת"
// was offered "130 גביע נייר גודל 4 הנמל" at Shufersal because Victory's own name for that barcode,
// "עטרות נייר אפייה", carries the literal phrase "נייר אפיה" and so matched baking-paper too.
test('paper baking cups ("עטרות"/"גביע נייר") are a separate concept from baking paper sheets', () => {
  is('נייר אפיה הנמל קשת י', 'baking-paper');
  is('נייר אפיה לאינגלישקייק30', 'baking-paper');
  is('130 גביע נייר גודל4 הנמל', 'baking-cups');
  is('עטרות נייר אפייה', 'baking-cups');
  is('עטרות נייר אפייה גודל 1.5', 'baking-cups');
  is('עטרות חום 4 הנמל', 'baking-cups');
  is('עטרות אלו\' לאפיה 100יח', 'baking-cups');
});

// --- Defect 3: a cheese spread is not a block of cheese. "גבינה בולגרית מעודנת" (block) was offered
// "בולגרית בעיר מעדן גבינה למריחה" (spread) at Victory. rules.json's form vocabulary had no spread
// marker at all; bulgarian-cheese gets its own exclusive kind group ("ממרח"/"למריחה"/"רכה"), the same
// mechanism butter's "spreadable" kind already uses.
test('a Bulgarian cheese spread is a different kind from the block, and refuses as a substitute', () => {
  const block = { name: 'גבינה בולגרית מעודנת', category: 'חלב וביצים', conceptId: 'bulgarian-cheese', isWeighted: false, size: { value: 200, unit: 'g', count: 1 }, brand: 'מעודנת' };
  const spread = { name: 'בולגרית בעיר מעדן גבינה למריחה 200 גר הג', category: 'חלב וביצים', conceptId: 'bulgarian-cheese', isWeighted: false, size: { value: 200, unit: 'g', count: 1 }, brand: 'הג' };
  const verdict = compatible({ product: block, candidate: spread, requireSize: true, purpose: 'cheaper' });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'variant');
});

// --- Defect 4: egg size class (S/M/L/XL) must never silently swap. "ביצים 18 יח L" was offered
// "ביצים 18 יח M" with no caveat at all. Size letters (and their Hebrew spellings, גדול/בינוני/ענק/קטן)
// are now an exclusive kind group per egg concept, so L and M read as different kinds and refuse
// each other on 'variant' - the engine has no separate "egg size" caveat, so a same-kind swap is the
// only thing it can offer going forward.
test('egg size class is a kind: an L carton is not a substitute for an M carton of the same brand', () => {
  const large = { name: 'ביצים 18 יח L פיקוח מ.לסר', category: 'חלב וביצים', conceptId: 'egg-regular', isWeighted: false, size: { value: 1, unit: 'unit', count: 18 }, brand: 'לסר' };
  const medium = { name: 'ביצים 18יח בנוני M', category: 'חלב וביצים', conceptId: 'egg-regular', isWeighted: false, size: { value: 1, unit: 'unit', count: 18 }, brand: 'לסר' };
  const verdict = compatible({ product: large, candidate: medium, requireSize: true, purpose: 'cheaper' });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'variant');
  // the Hebrew size words agree with the letters: "גדול" reads as the same kind as "L".
  const largeHeb = { ...large, name: 'ביצים 12 יח גדול' };
  const mediumHeb = { ...medium, name: 'ביצים 12 יח בינוני' };
  assert.equal(compatible({ product: largeHeb, candidate: mediumHeb, requireSize: true, purpose: 'cheaper' }).reason, 'variant');
});

// --- Defect 5 (partial): tuna in brine ("מי מלח") was reading as no flavour at all - the same empty
// signature as a name with no oil/water marker - so it silently matched unrelated tuna. "מי מלח" is now
// its own tuna-canned kind word, alongside the existing oil/water/olive words.
test('tuna in brine ("מי מלח") is a different kind from tuna in oil or in water', () => {
  // Same size/pack shape on both sides of each comparison, so only the flavour (variant) check is
  // exercised - a mismatched pack shape refuses first, on its own 'pack'/'size' reason (docs/CONCEPTS.md
  // §4), and that is a separate, already-covered rule.
  const oliveOil = { name: 'טונה בשמן זית פילטונ', category: 'שימורים', conceptId: 'tuna-canned', isWeighted: false, size: { value: 560, unit: 'g', count: 1 }, brand: 'פילטונה' };
  const brine560 = { name: 'טונה במי מלח רביעייה 560 גרם', category: 'שימורים', conceptId: 'tuna-canned', isWeighted: false, size: { value: 560, unit: 'g', count: 1 }, brand: 'אחר' };
  const water560 = { name: 'טונה 560ג במים', category: 'שימורים', conceptId: 'tuna-canned', isWeighted: false, size: { value: 560, unit: 'g', count: 1 }, brand: 'אחר' };
  assert.equal(compatible({ product: oliveOil, candidate: brine560, requireSize: true, purpose: 'cheaper' }).reason, 'variant');
  assert.equal(compatible({ product: brine560, candidate: water560, requireSize: true, purpose: 'cheaper' }).reason, 'variant');
});

// --- Defect 6: "מייפל" (maple) was missing from the global flavour vocabulary, so "סירופ מייפל טהור"
// (real maple syrup, no "בטעם" prefix) read as having no flavour at all while "סירופ בטעם מייפל"
// (maple-FLAVOURED syrup) read as carrying 'מייפל' - two real maple syrups could fail to match each
// other purely because of how the label phrases it. Both now carry 'מייפל' consistently.
test('"מייפל" (maple) is read as a flavour whether or not the name uses the "בטעם" phrasing', () => {
  const pure = { name: 'סירופ מייפל טהור 189', category: 'שימורים', conceptId: 'syrup-maple', isWeighted: false, size: { value: 189, unit: 'ml', count: 1 }, brand: 'א' };
  const flavoured = { name: 'סירופ בטעם מייפל 500 גרם מיימונס', category: 'שימורים', conceptId: 'syrup-maple', isWeighted: false, size: { value: 500, unit: 'g', count: 1 }, brand: 'ב' };
  const verdict = compatible({ product: pure, candidate: flavoured, requireSize: false, purpose: 'cheaper' });
  assert.notEqual(verdict.reason, 'variant');
});

// --- Defect 7a: fresh and frozen are separate concepts (Naor, 28.9) - blueberries and strawberries
// need the same fresh/frozen split meat and fish already have. "אוכמניות כחולות קפוא" and
// "תות שדה שלם קפוא 500" had no concept at all (the central fresh/processed guard blocked the fresh
// leaf, and the generic "פירות קפואים" bucket is for mixed/other fruit, not a species with its own
// leaf).
test('blueberries and strawberries each get a frozen twin, separate from fresh and from the generic frozen-fruit bucket', () => {
  is('אוכמניות כחולות 400 גרם', 'blueberry');
  is('אוכמניות כחולות קפוא', 'blueberry-frozen');
  is('אוכמניות כחולות מוקפאות 400 גרם', 'blueberry-frozen');
  is('אוכמניות כחולות מקופאים 300 גר סנפרוסט', 'blueberry-frozen');
  isNot('אוכמניות כחולות קפואות בציפוי שוקולד חלב 140 גרם', 'blueberry-frozen'); // chocolate-coated treat, not plain fruit
  is('תות שדה', 'strawberry-fresh');
  is('תות שדה שלם קפוא 500', 'strawberry-frozen');
  is('תות שדה מוקפא 100% פרי סנפרוסט 300 גרם', 'strawberry-frozen');
  // the generic bucket still serves species that have no leaf of their own, and never conflicts with
  // the two species that now do.
  is('פירות יער קפואים 400 גרם', 'frozen-fruit');
  is('מנגו קפוא חתוך', 'frozen-fruit');
});

// --- Defect 7d: "כוסות נייר"/"כוסות ח"פ" (paper / ח"פ-abbreviated disposable cups) had no concept:
// "נייר" was not a disposable-cups marker, and the ח"פ abbreviation (written with a gershayim, "ח\"פ")
// normalizes to "חפ" - two letters, not the three of "חדפ" ("חד פעמי") that was already on the list.
test('paper cups and the ח"פ-abbreviated disposable cups match disposable-cups', () => {
  is('כוסות נייר 260 מ"ל', 'disposable-cups');
  is('כוסות ח"פ קשת 200 מ"ל', 'disposable-cups');
});

// --- Defect 8: a cheese spread flavoured with sun-dried tomatoes is not sun-dried tomatoes. "קיו גליל
// בסגנון גבינה עם עגבניות מיובשות ועשבי תיבול" (a cheese-style dip) matched tomato-sundried-pieces
// because nothing on its none-list caught "בסגנון גבינה". Fixing it required loosening the concept's
// old bare "זית" exclusion first: real sun-dried tomatoes are overwhelmingly sold "בשמן זית" (in olive
// oil), so the bare word was quietly rejecting the standard product; the real conflict is with stuffed
// olives ("זיתים ממולאים בעגבניה מיובשת"), which is what the exclusion is narrowed to now.
test('a cheese-style dip flavoured with sun-dried tomato is not tomato-sundried-pieces, and olive oil packing is not excluded', () => {
  isNot('קיו גליל בסגנון גבינה עם עגבניות מיובשות ועשבי תיב', 'tomato-sundried-pieces');
  is('עגבניות מיובשות בשמן זית', 'tomato-sundried-pieces');
  is('עגבניות מיובשות בשמן זית אוליביה 270 גרם', 'tomato-sundried-pieces');
  is('זיתים ממולאים בעגבניה מיובשת 340 גרם', 'olives');
});

/** No name used above as a positive capture for one concept matches a second concept too - the real
 * failure mode here is a silent conflict, not a loud one. */
test('none of the fixtures above are a conflict (two concepts matching the same name)', () => {
  const names = [
    'סולת בשקית טחנת קמח דגן (1 קג)', 'קמח בהיר טחנות ישראל', 'סולת 1 קג', 'סולת חיטה דגן 1 קג',
    'נייר אפיה הנמל קשת י', '130 גביע נייר גודל4 הנמל', 'עטרות נייר אפייה',
    'אוכמניות כחולות 400 גרם', 'אוכמניות כחולות קפוא', 'תות שדה', 'תות שדה שלם קפוא 500',
    'פירות יער קפואים 400 גרם', 'מנגו קפוא חתוך',
    'כוסות נייר 260 מ"ל', 'כוסות ח"פ קשת 200 מ"ל',
    'עגבניות מיובשות בשמן זית', 'זיתים ממולאים בעגבניה מיובשת 340 גרם',
  ];
  for (const name of names) {
    const hits = matchingConcepts(name, concepts);
    assert.ok(hits.length <= 1, `${name} matches more than one concept: ${hits.map((c) => c.id).join(', ')}`);
  }
});

// 3.11 beer shelf: wheat / fruit / ale / non-alcoholic / stout leaves, the malt-drink sibling, type words in the beer word.
// Opus review: scratchpad shelf-beer/REVIEW.md. One assertion per case, the name in the message. Behaviour, not config.
// Guinness resolves to beer by rule (a brand word is not a product word); the two barcodes are fixed by verified records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConcepts, assignConcept, conceptById, resolveFamily } from '../src/catalog/concepts.js';
import { RULES_FILE } from '../src/pricing/substituteRules.js';
import { loadVerified } from '../src/catalog/verified.js';

const list = loadConcepts();

const CASES = [
  { "name": "בירה גולדסטאר פחית 500 מ\"ל", "expected": "beer" },
  { "name": "שישיית בירה היינקן בקבוק 330 מ\"ל", "expected": "beer" },
  { "name": "מארז שישייה בירה אסטרייה דאם 330 מ\"ל", "expected": "beer" },
  { "name": "בירה קרלסברג בקבוק 330 מ\"ל.", "expected": "beer" },
  { "name": "בירה פילזנר אקסטרה 500 מ\"ל", "expected": "beer" },
  { "name": "בירה בנדיקטינר דונקל", "expected": "beer" },
  { "name": "בירה גינס פחית 440 מ\"ל", "expected": "beer" },
  { "name": "בירה מרפיס סטאוט 500 מ\"ל", "expected": "beer-stout" },
  { "name": "בירה נגב פורטר אלון 330 מ\"ל", "expected": "beer-stout" },
  { "name": "בירה פאולנר חיטה 500 מ\"ל", "expected": "beer-wheat" },
  { "name": "בירה 1664 בלאנק 6*330מ\"ל", "expected": "beer-wheat" },
  { "name": "בירה הרצל בירה לבנה 330 מ\"ל פחית", "expected": "beer-wheat" },
  { "name": "בירה שקמה IPA בקבוק 330", "expected": "beer-ale" },
  { "name": "שפירא פייל אייל 330 מ\"ל", "expected": "beer-ale" },
  { "name": "בירה נגב אמבר אייל 330 מ\"ל", "expected": "beer-ale" },
  { "name": "בירה היינקן 0.0, ללא אלכוהול מארז שישייה", "expected": "beer-nonalc" },
  { "name": "בירה קרלסברג ללא אלכוהול - שישייה", "expected": "beer-nonalc" },
  { "name": "בירה בקס שישייה ללא אלכוהול", "expected": "beer-nonalc" },
  { "name": "בירה שנדי תפוח 330 מ\"ל", "expected": "beer-fruit" },
  { "name": "בירה לינדמנס דובדבן 250 מ\"ל", "expected": "beer-fruit" },
  { "name": "בירה נשר מאלט 1.5 ליטר", "expected": "malt-drink" },
  { "name": "מאלטי בירה שחורה", "expected": "malt-drink" },
  { "name": "משקה מאלט קוואס לחם 1.5 ליטר", "expected": "kvass" },
  { "name": "פחית קופרברג סיידר אגסים", "expected": "cider" },
  { "name": "בירה סיידר קראפט אגס וולפאס אנגלמן 500 מ\"ל", "expected": "cider" },
  { "name": "כוס בירה 330 מל", "expected": null },
  { "name": "שמרי בירה אבקה טבעית 250 גרם", "expected": null },
  { "name": "גינגר ביר 200 מ\"ל", "expected": "ginger-ale" },
  { "name": "טמנאוולין שרי פיניש סינגל מאלט 700 מ\"ל", "expected": null },
  { "name": "ארגז פלסטיק גולדסטאר", "expected": null },
  { "name": "שפירא סטאוט 330 מ\"ל", "expected": "beer-stout" },
  { "name": "מרפיס אייריש סטאוט פ", "expected": "beer-stout" },
  { "name": "באדוויזר לאגר פחית 500מל", "expected": "beer" },
  { "name": "שפירא הופי לאגר ח\"פ", "expected": "beer" },
  { "name": "בירה אובולון  פשניצנויה 1 ליטר", "expected": "beer-wheat" },
  { "name": "בירה קסטיל רוז ללא אלכוהול 330 מ\"ל", "expected": "beer-nonalc" },
  { "name": "בירה מכבי שנדי שישיי", "expected": "beer-fruit" },
  { "name": "נקניקיות פרנקפורטר 320 גרם", "expected": "sausage-wiener" },
  { "name": "משקה מאלט קווס לחם לידסקי 1.5 ליטר", "expected": "kvass" },
  { "name": "פקדון בקבוק בירה ריק", "expected": null }
];

for (const { name, expected } of CASES) {
  test(`assignConcept: "${name}" -> ${expected}`, () => {
    assert.equal(assignConcept(name, list), expected, name);
  });
}

test('the six beer leaves share the family beer and are missingOnly like the parent; malt-drink is its own family', () => {
  const ids = ['beer', 'beer-wheat', 'beer-fruit', 'beer-ale', 'beer-nonalc', 'beer-stout'];
  const rules = JSON.parse(readFileSync(RULES_FILE, 'utf8'));
  for (const id of ids) {
    const c = conceptById(id, list);
    assert.ok(c, `no concept ${id}`);
    assert.equal(resolveFamily(c, list).id, 'beer', id);
    assert.equal(rules.conceptPolicy[id], 'missingOnly', id);
  }
  assert.equal(resolveFamily(conceptById('malt-drink', list), list).id, 'malt-drink');
  assert.equal(rules.conceptPolicy['malt-drink'], undefined);
});

test('the rules keep colour as a kind, no generic lager/stout variant on beer, and no brand word in the stout leaf', () => {
  const rules = JSON.parse(readFileSync(RULES_FILE, 'utf8'));
  assert.equal(rules.variant.concepts.beer, undefined);
  assert.ok(rules.variant.groups.beer.dark && rules.variant.groups.beer.amber);
  assert.ok(!rules.variant.groups.beer.dark.includes('שחורה'));
  assert.ok(!rules.variant.groups['beer-wheat'].dark.includes('ויטוס'));
  assert.ok(!conceptById('beer-stout', list).synonyms.includes('גינס'));
});

test('verified records fix the two Guinness barcodes and the Carlsberg six-pack', () => {
  const v = loadVerified();
  assert.equal(v.get('g5000213014905').conceptId, 'beer-stout');
  assert.equal(v.get('g5000213000359').conceptId, 'beer-stout');
  assert.equal(v.get('g7290008909778').conceptId, 'beer');
  assert.equal(v.get('g7290008909778').category, 'משקאות');
});

// 3.11 toilet-cleaner split (gel/liquid | block | tablet) and the reusable serving tray. Opus review: scratchpad
// toilet-tray/REVIEW.md. One assertion per case, the name in the message. Behaviour, not config.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConcepts, assignConcept, conceptById, resolveFamily, CONCEPTS_DIR } from '../src/catalog/concepts.js';
import { RULES_FILE } from '../src/pricing/substituteRules.js';

const list = loadConcepts();

const CASES = [
  { "name": "נוזל לניקוי אסלה דאק רענן 750 מ\"ל", "expected": "toilet-cleaner" },
  { "name": "ג'ל לניקוי אסלות בניחוח לבנדר", "expected": "toilet-cleaner" },
  { "name": "מנקה אסלות 00 סנו 750 מ\"ל", "expected": "toilet-cleaner" },
  { "name": "דורגול מרסס WC לאסלה - מהיר ועוצמתי 600 מ\"ל", "expected": "toilet-cleaner" },
  { "name": "סנובון נוזל לניקוי אסלה בניחוח לבנדר סנו 750 מ\"ל", "expected": "toilet-cleaner" },
  { "name": "סנו JAVEL ג'ל בתוספת אקונומיקה לניקוי וחיטוי אסלות 750 מל", "expected": "toilet-cleaner" },
  { "name": "סבון אסלה כחול שלישייה", "expected": "toilet-cleaner-block" },
  { "name": "סנובון סבון אסלה כחול בניחוח לימון 3 יחידות", "expected": "toilet-cleaner-block" },
  { "name": "כדוריות סבון נתלה לאסלה בריזת אוקיינוס - 3 יח", "expected": "toilet-cleaner-block" },
  { "name": "אקווה בלו מבושם סבון אסלה למיכל ההדחה", "expected": "toilet-cleaner-block" },
  { "name": "סנובון Bubbles שלישיית כדוריות ג'ל אסלה", "expected": "toilet-cleaner-block" },
  { "name": "דאו קלין מדבקות הפלא לאסלה", "expected": "toilet-cleaner-block" },
  { "name": "אסטוניש טבליות הפלא לאסלה בניחוח אקליפטוס- 8 יח", "expected": "toilet-cleaner-tablet" },
  { "name": "המקציפה יעקבי- אבקה לניקוי פנימי יסודי לאסלה", "expected": "toilet-cleaner-tablet" },
  { "name": "דאק ג'ל אסלה בניחוח ים 55מל", "expected": null },
  { "name": "ניקוי אסלה WC MAXI זוג 110גר כחול", "expected": null },
  { "name": "סנובון לאסלה לימון סנו 3 יחידות", "expected": null },
  { "name": "סט לניקוי אסלות", "expected": null },
  { "name": "מקטין אסלה - לבן", "expected": null },
  { "name": "מברשת אסלה עם stand", "expected": "toilet-brush" },
  { "name": "סנו זאוול לאסלות מונבלאן 750 מל", "expected": "bleach" },
  { "name": "מנקה אסלות לימון 1ל XPO", "expected": "toilet-cleaner" },
  { "name": "תורכי אסלי 400 גרם", "expected": null },
  { "name": "מאסל קוביות ציר עוף 105 גרם", "expected": null },
  { "name": "מגש עגול נירוסטה 35 ס\"מ", "expected": "tray-reusable" },
  { "name": "מגש מהודר אקרילי עגול עם ידיות כסף בינוני כ33 -", "expected": "tray-reusable" },
  { "name": "מארז להגשת גבינות מגש במבוק + 2 סכיני גבינה", "expected": "tray-reusable" },
  { "name": "מגש פיצה להגשה מבמבוק קוטר 32 ס\"מ + ידית", "expected": "tray-reusable" },
  { "name": "מגש מלבני מהודר קשיח שקוף 34*23 ס\"מ", "expected": "tray-rect" },
  { "name": "מגש הגשה גדול עגול יוקרתי עם ידיות זהוב נצנצים", "expected": "tray-round" },
  { "name": "מגש מתכלה לפיצוחים", "expected": null }
];

for (const { name, expected } of CASES) {
  test(`assignConcept: "${name}" -> ${expected}`, () => {
    assert.equal(assignConcept(name, list), expected, name);
  });
}

test('the three toilet-cleaner leaves share one family and the rules refuse substitutes inside it', () => {
  const fams = ['toilet-cleaner', 'toilet-cleaner-block', 'toilet-cleaner-tablet'].map((id) => {
    const c = conceptById(id, list);
    assert.ok(c, `no concept ${id}`);
    return resolveFamily(c, list).id;
  });
  assert.deepEqual(new Set(fams), new Set(['toilet-cleaner']));
  const rules = JSON.parse(readFileSync(RULES_FILE, 'utf8'));
  assert.equal(rules.families['toilet-cleaner']?.substitutes, false, 'a block must never stand in for a gel');
});

test('tray-reusable lives in the serving-tray family, in the kitchenware group', () => {
  assert.equal(resolveFamily(conceptById('tray-reusable', list), list).id, 'serving-tray');
  const fam = JSON.parse(readFileSync(path.join(CONCEPTS_DIR, 'families.json'), 'utf8'));
  assert.ok(fam.groups['home-kitchenware'].families.includes('serving-tray'));
});

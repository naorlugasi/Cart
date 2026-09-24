import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * Round on config/concepts/pantry.json, department שימורים (24.9): רוטב / ממרח / מחית / שמן / אבקת / זרעי.
 * One capture + one near-miss per new concept, plus a regression test for the two pre-existing rules that
 * turned out to be dead (baking-powder's spelling, bouillon-stock's meat/mushroom sauce-powder pattern) -
 * see docs/skill TRAPS.md #6/#7 and the commit message for the full LOST-line accounting.
 */
const concepts = loadConcepts();

const cases = [
  // ---------- sauces ----------
  ['teriyaki-sauce', 'רוטב טריאקי 300 מ"ל', 'סלמון אטלנטי ברוטב טריאקי 120 גרם ויליפוד'],
  ['garlic-sauce', 'רוטב שום הלמנס 300 ג', 'אבקת שום 120 גרם'],
  ['thousand-island', 'רוטב אלף האיים 375 גר SPILVA', 'רוטב אלף 375 גר'],
  ['sriracha', 'רוטב סריראצ`ה חריף 455 מ"ל', "רוטב סריראצ'ה- רוטב צ'ילי חריף"],
  ['tabasco', 'רוטב טבסקו 60 מ"ל', 'טבסקו רוטב בפאלו לחיץ 254 גרם'],
  ['mushroom-sauce', 'רוטב פטריות 250 גר', 'אבקת רוטב פטריות אסם 30 גרם'],
  ['pomegranate-sauce', 'רוטב רימונים 320 גרם', 'מחית רימונים 320 גרם'],
  ['vinaigrette', 'רוטב ויניגרט בלסמי', 'מיונז רגיל 500 גרם'],
  ['caesar-dressing', 'רוטב קיסר 200 גרם', 'גבינת קיסר 200 גרם'],
  ['hoisin-sauce', 'רוטב הוי סין', 'רוטב הוי 100 מ"ל'],
  ['mirin', 'רוטב מירין לתיבול 50', 'סירופ מירינדה דייט 440מ"ל'],
  ['worcestershire-sauce', 'רוטב וורצסטר 284 מ"ל', 'רוטב וורצ 100 מ"ל'],
  ['horseradish', 'חזרת 180 גרם', 'סלט חזרת 250 גרם'],
  ['cranberry-sauce', 'רוטב חמוציות 240 גר רונה', 'מיץ חמוציות 1 ליטר'],
  ['plum-sauce', 'רוטב שזיפים', 'ריבת שזיפים 350 גרם'],
  ['fish-sauce', 'רוטב דגים 300 מ"ל', 'רוטב צ\'ילי ירוק לתיבול דגים 250 מ"ל'],
  ['buffalo-sauce', 'רוטב באפלו לכנפיים 3', 'רוטב טבסקו 60 מ"ל'],
  ['balsamic-glaze', 'רוטב בלסמי מצומצם קל', 'חומץ בלסמי 500 מ"ל'],
  ['curry-sauce', 'רוטב קארי אדום 100 גרם', 'אבקת קארי 100 גרם'],
  // ---------- spreads / pastes ----------
  ['artichoke-spread', 'ממרח ארטישוק 180 גרם', 'ממרח ארטישוק - סלט ארטישוק עם רוזמרין'],
  ['tomato-sundried', 'ממרח עגבניות מיובשות 180', 'עגבניות מיובשות בשמן זית'],
  ['eggplant-spread', 'מחית חצילים עם פלפלים אדומים 350 גר', 'סלט יאן ממרח חצילים'],
  ['zucchini-spread', 'ממרח קישואים חריף 720 גרם', 'סלט YAN ממרח קישואים 470 גר'],
  ['olive-spread-green', 'ממרח זיתים ירוקים 180 גר', 'זיתים ירוקים 300 גרם'],
  ['olive-spread-black', 'ממרח זיתים שחורים 200 גרם', 'זיתים שחורים 300 גרם'],
  ['olive-spread-kalamata', 'מאסטר שף ממרח זיתי קלמטה 180 גרם', 'זית קלמטה 355 גרם'],
  ['pesto', 'פסטו בזיליקום 180 גרם', 'רביולי במילוי גבינות 400 גר פסטות שטראוס'],
  ['almond-spread', 'ממרח 100% שקדים שקדיה 300 גר', 'ממרח פיסטוק 40% שקדיה 300 גרם'],
  ['preserved-lemon', 'לימון כבוש 250 גרם', 'לאבנה לימון כבוש 250 גרם'],
  ['harissa', 'ממרח אריסה 220 גרם', 'אריסה מתוקה עללחם 25'],
  ['chimichurri', 'ממרח צימיצורי 180 גרם', "צ'ימיצ'ורי עללחם"],
  ['roasted-pepper-spread', 'ממרח פלפלים קלויים 180 ג', 'אריסה מתוקה נפטון - ממרח פלפלים אדומים יבשים'],
  ['garlic-paste', 'ממרח שום 190 ג רמילוי', 'ממרח קישואים עם שום 720 גרם'],
  ['curry-paste', 'מחית קארי אדום 400 גרם', 'אבקת קארי 100 גרם'],
  ['tomato-puree', 'מחית עגבניות 690 גרם', 'עגבניות מרוסקות 400 גרם'],
  ['miso', 'מיסו בהיר-מחית פולי סויה', 'רוטב סויה 150 מ"ל'],
  // ---------- oils ----------
  ['oil-avocado', 'שמן אבוקדו 500 מ"ל', 'קרם ידיים דאב שמן אבוקדו 75 מ"ל'],
  ['oil-coconut', 'שמן קוקוס 1 ל', 'שמפו כיף לשיקום והזנה שמן קוקוס 700 מל'],
  ['oil-flaxseed', 'שמן פשתן 500 מל', 'מנקה רצפות שמן פשתן'],
  ['oil-grapeseed', 'שמן זרעי ענבים 1 ליטר קוריצלי', 'שמן זית 750 מ"ל'],
  ['oil-pumpkin-seed', 'שמן זרעי דלעת לא מזוכך 250 מל', 'גרעין דלעת לבן קלוי שקיל'],
  // ---------- powders ----------
  ['sugar-powdered', 'אבקת סוכר 500 גרם', 'סוכר לבן 1 קג'],
  ['cocoa-powder', 'אבקת קקאו 150 גר', 'אבקת סוכר 100 גרם'],
  ['gelatin-powder', "אבקת ג'לטין טהור ויליגר 28 גרם", 'אבקת קקאו 150 גר'],
  ['curry-powder', 'אבקת קארי 100 גרם', 'ממרח קארי אדום 400 גר טעמי אסיה'],
  ['psyllium-husk', 'אבקת פסיליום אורגני 300 גרם', 'אבקת קקאו 150 גר'],
  ['garlic-powder', 'אבקת שום בצנצנת 100 גרם', 'רוטב שום הלמנס 300 ג'],
  // ---------- seeds ----------
  ['chia-seeds', 'זרעי צ\'יה נטורלה Naturale', 'קרקר פשתן+ציה בזיליק175'],
  ['flax-seeds', 'זרעי פשתן 300 גר', 'שמן זרעי פשתן לא מזוכך 500 מל'],
];

test('pantry round: each new concept captures its real name and rejects its near-miss', () => {
  const failures = [];
  for (const [id, capture, nearMiss] of cases) {
    const got = assignConcept(capture, concepts);
    if (got !== id) failures.push(`CAPTURE ${id}: "${capture}" -> ${got ?? 'null'}`);
    const missed = assignConcept(nearMiss, concepts);
    if (missed === id) failures.push(`NEAR-MISS ${id}: "${nearMiss}" -> ${id} (should not match)`);
  }
  assert.deepEqual(failures, [], `pantry round failures:\n  ${failures.join('\n  ')}`);
});

// The round also fixed two existing pantry.json rules that had gone dead (concept-dead-rules.mjs /
// TRAPS.md #6): baking-powder only matched the double-yud spelling "אפייה", never the "אפיה" spelling
// every chain actually uses; bouillon-stock's "רוטב פטריות באבק" fragment matched nothing in the current
// catalog at all, so the meat/mushroom sauce-powder line was silently uncovered.
test('baking-powder and bouillon-stock: the spelling/pattern fix from this round still holds', () => {
  assert.equal(assignConcept('אבקת אפיה 100 גר', concepts), 'baking-powder', 'single-yud spelling, real chain spelling');
  assert.equal(assignConcept("אבקת אפייה 100 גר", concepts), 'baking-powder', 'double-yud spelling still matches too');
  assert.equal(assignConcept('אבקת רוטב צלי לבשר-22 גרם', concepts), 'bouillon-stock');
});

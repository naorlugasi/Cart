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

/**
 * Product-level review found this round's new concepts colliding with pre-existing rules, and one real
 * regression: preserved-lemon's "בלאדי" trigger caught baladi lemon, an ordinary fresh-lemon cultivar and
 * one of the most-searched produce items on the site - conflicting it with lemon-fresh (produce-deli-
 * frozen.json) on every single listing. Fixed by requiring the actual preserving word.
 */
test('preserved-lemon requires the preserving word - baladi is just a lemon cultivar, not a preserved product', () => {
  assert.notEqual(assignConcept('לימון בלאדי', concepts), 'preserved-lemon');
  assert.notEqual(assignConcept('לימון בלאדי ביתי', concepts), 'preserved-lemon');
  assert.equal(assignConcept('ממרח לימון כבוש 200 גרם', concepts), 'preserved-lemon', 'the preserving word still captures it');
  assert.equal(assignConcept('לימון כבוש 250 גרם', concepts), 'preserved-lemon');
});

/**
 * The general guard (one fix, not several special cases): a raw-ingredient concept - sold on its own,
 * not as a prepared sauce/dressing - refuses a name that declares itself one (רוטב/ויניגרט present
 * anywhere), because that word means a dish is using the ingredient as a component, not selling it raw.
 * Left to the actual sauce/dressing concept, which is a correct, unambiguous reassignment (never null)
 * in every case this round found. This is TRAP #1 (a prepared dish swallowed by the raw ingredient it
 * contains) recurring across five different ingredient concepts at once.
 */
test('a raw ingredient concept refuses a name that declares itself a prepared sauce or dressing', () => {
  assert.equal(assignConcept('רוטב דבש שום מייקי 566 גרם', concepts), 'garlic-sauce', 'not honey');
  assert.equal(assignConcept('דבש טהור 500 גרם', concepts), 'honey', 'plain honey still matches');
  assert.equal(assignConcept('רוטב טריאקי עם שומשום', concepts), 'teriyaki-sauce', 'not sesame-seeds');
  assert.equal(assignConcept('שומשום קלוי 200 גרם', concepts), 'sesame-seeds', 'plain sesame seeds still matches');
  assert.equal(assignConcept('עדשים עם ירקות קלויים ברוטב רימונים 200', concepts), 'pomegranate-sauce', 'not lentils');
  assert.equal(assignConcept('עדשים 500 גרם', concepts), 'lentils', 'plain lentils still matches');
  assert.equal(assignConcept('ויניגרט שום וזעתר', concepts), 'vinaigrette', 'not za-atar');
  assert.equal(assignConcept('זעתר 100 גרם', concepts), 'za-atar', 'plain za-atar still matches');
});

test('harissa defers to tahini-raw when harissa is only a flavour on a tahini product', () => {
  assert.equal(assignConcept('טחינה גולמית מעודנת אריסה', concepts), 'tahini-raw');
  assert.equal(assignConcept('ממרח אריסה 220 גרם', concepts), 'harissa', 'plain harissa still matches');
});

test('oil-olive refuses the "עץ הזית" private-label brand name on a non-olive oil (trap 2: brand read as content)', () => {
  assert.notEqual(assignConcept('שמן זרעי ענבים 1 ליטר עץ הזית', concepts), 'oil-olive');
  assert.notEqual(assignConcept('שמן קוקוס אורגני כתית עץ הזית 320 מ"ל', concepts), 'oil-olive');
  assert.equal(assignConcept('שמן זית 750 מ"ל FERNANDO', concepts), 'oil-olive', 'real olive oil still matches');
});

test('pesto catches the abbreviated גאוד. cheese-flavour label too, and pasta-sauce-tomato defers to tomato-puree on a passata-labelled sauce', () => {
  assert.notEqual(assignConcept('גאוד.פסטו אדום150גוש32%', concepts), 'pesto');
  assert.equal(assignConcept('רוטב עגבניות חתוכות דק פולפה יכין 240 גר', concepts), 'tomato-puree');
});

/**
 * Two inherited rules in OTHER files (snacks.json, produce-deli-frozen.json) turned out to be eating this
 * round's new pantry concepts - fixed here at the coordinator's direction since the collision is this
 * round's fallout, even though the files themselves are owned elsewhere. Both are minimal, surgical
 * additions (a none guard and a negative lookahead), not a redesign of either concept.
 */
test("chocolate-filled-snack (snacks.json) no longer swallows the טעמי אסיה brand or plain \"N טעמים\"", () => {
  assert.notEqual(assignConcept('ממרח קארי אדום 400 גר טעמי אסיה', concepts), 'chocolate-filled-snack');
  assert.equal(assignConcept('ממרח קארי אדום 400 גר טעמי אסיה', concepts), 'curry-paste');
  assert.notEqual(assignConcept('רוטב טריאקי 300 מל טעמי אסיה', concepts), 'chocolate-filled-snack');
  assert.notEqual(assignConcept('שמן אבוקדו טעמים 500 מ"ל', concepts), 'chocolate-filled-snack');
  assert.equal(assignConcept('טעמי עם שברי בייגלה', concepts), 'chocolate-filled-snack', 'the real טעמי-brand wafer snack still matches');
});

test('tomato (produce-deli-frozen.json, fresh tomato) defers to tomato-puree on a "פולפה"-labelled product', () => {
  assert.notEqual(assignConcept('עגבניות פולפה שלישיות 400*3', concepts), 'tomato');
  assert.equal(assignConcept('עגבניות פולפה שלישיות 400*3', concepts), 'tomato-puree');
  assert.equal(assignConcept('עגבניה טרייה', concepts), 'tomato', 'a plain fresh tomato still matches');
});

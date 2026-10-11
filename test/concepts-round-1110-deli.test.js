import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - מעדנייה round (docs/CONCEPTS.md): the receipt simulator (ops/review/receipt-sim-2026-10-11.md)
 * found 13.3% of basket lines carry no conceptId at all, so a chain missing one can never offer a substitute.
 * This round covers the deli department's 256 no-concept products sold in 3+ chains: new leaves for clusters
 * of 3+ products or 2+ chains, plus widening a few existing concepts that were one word away from the real
 * name chains use. Every new leaf gets one name it must capture and one close name it must refuse (the
 * refusal is what holds the rule); every widened concept keeps capturing what it always did. Names are real
 * chain names from the price files (data/products.json).
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

// --- new leaves -----------------------------------------------------------------------------------

// Opus review 11.10: plain שניצלונים are chicken-nuggets (that leaf was dead for them: kind fresh); this leaf is shapes only.
test('chicken-nugget-shapes: fun-shaped breaded chicken bites leave no-concept; bare "אצבעות שניצל" stays schnitzel-chicken\'s (its own synonym)', () => {
  is('שניצלונים עוף טוב 600 גרם', 'chicken-nuggets');
  is('כוכבי עוף בציפוי מעודן מאמא עוף 700 גרם', 'chicken-nugget-shapes');
  is("קראנצ'ים שומשום מאמא עוף 600 גרם", 'chicken-nugget-shapes');
  isNot('אצבעות שניצל ללא גלוטן מאמא עוף 600 גרם', 'chicken-nugget-shapes');
  is('אצבעות שניצל ללא גלוטן מאמא עוף 600 גרם', 'schnitzel-chicken');
  // a plain "שניצל" word (not "שניצלוני") stays schnitzel-chicken's, even with a fun-shape brand name
  is('שניצל עוף דינוזאור ר.טבעיים "עוף טוב" 600 גרם', 'schnitzel-chicken');
  isNot('שניצל עוף דינוזאור ר.טבעיים "עוף טוב" 600 גרם', 'chicken-nugget-shapes');
});

test('chicken-meatballs: ready-made chicken meatballs leave no-concept; a rice dish with chicken is not meatballs', () => {
  is('קציצות עוף אמיתיות מאמא עוף 700 גרם', 'chicken-meatballs');
  is("קציצות עוף ישרל'ה סיר 600 גרם עוף טוב", 'chicken-meatballs');
  isNot('קציצות עוף ואורז ארו', 'chicken-meatballs');
});

test('corned-beef: קורנדביף leaves no-concept; "נקניק קורנדביף" stays a sausage, not this leaf', () => {
  is('קורנדביף 120 גר טירת צבי', 'corned-beef');
  is('קורנדביף 4% יחיעם 180 גרם', 'corned-beef');
  isNot('נקניק קורנדביף', 'corned-beef');
});

test('roast-beef: רוסטביף leaves no-concept; a pastrami-style roast beef stays with the pastrami concepts', () => {
  is('רוסטביף ארוז 120 גרם', 'roast-beef');
  is('רוסטביף בקר צלוי 4%', 'roast-beef');
  isNot('פסטרמה רוסטביף יחיעם 150', 'roast-beef');
});

test('beef-shoulder-smoked: smoked beef shoulder leaves no-concept; the same cut without "מעושן" is a different (unsliced) product', () => {
  is('כתף בקר מעושן 2% 400 ג (12) טירת צבי', 'beef-shoulder-smoked');
  is('כתף בקר מפולפל מעושן 150 גרם יחיעם', 'beef-shoulder-smoked');
  isNot('כתף בקר בפלפל טורו במשקל', 'beef-shoulder-smoked');
});

test('fish-cakes: קציצות דג / געפילטע פיש leaves no-concept; a species-named fish cake stays with its own fish concept', () => {
  is('קציצות דג דלידג 700 גרם', 'fish-cakes');
  // Opus review 11.10: gefilte fish is one product whichever spelling the chain uses (גפילטע / געפילטע)
  is('געפילטע פיש גולד ללא תוספת סוכר 4 קציצות', 'gefilte-fish');
  isNot('קציצות דג אמנון מוקפא 450 גרם', 'fish-cakes');
});

test('ikra: fish-roe salad leaves deli-salad-other; the Russian vegetable "ikra" (eggplant spread) is not fish roe', () => {
  is('איקרה אדומה 200 גרם', 'ikra');
  is('סלט איקרה לבנה 180 גרם', 'ikra');
  isNot('איקרה חצילים נזין 450 גרם', 'ikra');
  is('איקרה חצילים נזין 450 גרם', 'eggplant-salad');
});

test('blintz: בלינצ\'ס (any filling) leaves no-concept; unfilled wrapper sheets are a different product', () => {
  is("בלינצ'ס במילוי גבינת טבורוג מוקפא 360 גר", 'blintz');
  is('בלינצס תפו"א ופטריות 400 גרם', 'blintz');
  isNot("עלי בלינצס 320 גר BABUSHKA ANYA", 'blintz');
});

// Opus review 11.10: frozen-vegetable-medley was keyed on "לקט" (a marketing word that also opens "לקטוז");
// a frozen vegetable mix is frozen-vegetables, named vegetables or not.
test('frozen vegetable mixes (לקט) are frozen-vegetables; "ללא לקטוז" is not a לקט', () => {
  is('לקט נורמנדי סנפרוסט 800 גרם', 'frozen-vegetables');
  is('לקט מוקפא לקוסקוס 800 גר סנפרוסט', 'frozen-vegetables');
  isNot('מיני פיצה ללא לקטוז קפוא לל"ג שר 280 גרם', 'frozen-vegetables');
  is('לקט אפונה וגזר סנפרוסט 800 גרם', 'frozen-vegetables');
});

// --- widened concepts -------------------------------------------------------------------------------

test('kreplach widened to כיסונים (any filling); a meat-filled כיסונים stays meat-filled-pastry\'s', () => {
  is('כיסונים במילוי תפוח אדמה ובצל קפואים', 'kreplach');
  is('כיסונים במילוי דובדבנים קפואים', 'kreplach');
  isNot('כיסונים במילוי בשר וכבש קווקזי קפוא1 קג', 'kreplach');
  is('כיסונים במילוי בשר וכבש קווקזי קפוא1 קג', 'meat-filled-pastry');
});

test('meat-filled-pastry (flavourIsIdentity): "בשר" after "במילוי" still counts, since here the filling IS the identity', () => {
  is('כיסונים במילוי בשר וכבש קווקזי קפוא1 קג', 'meat-filled-pastry');
  is('קובה אדום במילוי בשר 800 גר', 'meat-filled-pastry');
});

test('sausage-servelat widened: בסגנון סרוולד without the word נקניק still counts', () => {
  is('סרוולד בסגנון איטלקי פרימיום זוגלובק 150 גרם', 'sausage-servelat');
  is('סרוולט בסגנון הונגרי 200 גר', 'sausage-servelat');
  // the chicken sausage line it must not steal
  isNot('נקניקיות עוף קראנץ', 'sausage-servelat');
});

test('eggplant-salad widened: the Russian "ikra" spelling of eggplant salad counts, zucchini "ikra" still does not', () => {
  is('איקרה חצילים נזין 450 גרם', 'eggplant-salad');
  isNot('איקרה קישואים נזין 450 גרם', 'eggplant-salad');
});

test('frozen-vegetables widened: artichoke, corn and leek join the vegetable-name list; a dumpling does not leak in', () => {
  is('תחתיות ארטישוק סנפרוסט 400 גרם', 'frozen-vegetables');
  is('גרעיני תירס סנפרוסט 800 גרם', 'frozen-vegetables');
  is('כרישה חתוכה מוקפאת', 'frozen-vegetables');
  isNot('גיוזה בטטה 320 גר קפוא מזרע', 'frozen-vegetables');
});

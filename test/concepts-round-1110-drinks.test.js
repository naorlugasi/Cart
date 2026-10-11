import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - משקאות round (docs/CONCEPTS.md): the receipt simulator (ops/review/receipt-sim-2026-10-11.md)
 * found 13.3% of basket lines carry no conceptId at all, so a chain missing one can never offer a substitute.
 * This round covers the drinks department's 133 no-concept products sold in 3+ chains: new leaves for brand
 * lines and product types the existing concepts explicitly steered around (תפוזינה was already excluded from
 * soda-fruit-flavored's none list, waiting for its own leaf), plus widening a few existing concepts. Every new
 * leaf gets one name it must capture and one close name it must refuse (the refusal is what holds the rule);
 * every widened concept keeps capturing what it always did. Names are real chain names from the price files
 * (data/products.json).
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

// --- new leaves -----------------------------------------------------------------------------------

test('tapuzina: any flavour of the Tapuzina soft drink leaves no-concept; the same flavour word stays with its fresh/tea concept when it is not Tapuzina', () => {
  is('תפוזינה לימונענע 1.5', 'tapuzina');
  is('תפוזינה מנגו 1.5 ליט', 'tapuzina');
  is('תפוזינה תפוזים 1.5 ל', 'tapuzina');
  isNot('תיפוזינה לימונענע עם תה ירוק 1.5ל', 'tapuzina');
  is('תיפוזינה לימונענע עם תה ירוק 1.5ל', 'tea-green'); // Tapuzina's own green-tea line stays tea-green's
});

test('soda-lemonade: lemon-mint still drinks across brands (Prigat, Priniv, Primor, Nordic Mist, Spring) leave no-concept; plain lemon juice for cooking stays juice-lemon\'s', () => {
  is('משקה קל לימונדה בלאדי', 'soda-lemonade');
  is('נורדיק מיסט מוגז בטעם לימונדה 1 ליטר', 'soda-lemonade');
  is('סחוט לימונענע 1 ליטר', 'soda-lemonade');
  is('ספרינג לימונענע 1.5', 'soda-lemonade');
  isNot('מיץ לימונענע 400 מ"ל פרימור', 'soda-lemonade');
  is('מיץ לימונענע 400 מ"ל פרימור', 'juice-lemon');
});

test('prigat-juice: Prigat\'s squeezed/clear fruit lines (not soda, not lemon, not syrup) leave no-concept', () => {
  is('פריגת סחוט טרי קלמנטינה 2 ליטר', 'prigat-juice');
  is('פריגת צלול אננס 1.5', 'prigat-juice');
  isNot('פריגת סחוט לימון נענע 2 ליטר', 'prigat-juice'); // lemon-mint defers to soda-lemonade
  is('פריגת סחוט לימון נענע 2 ליטר', 'soda-lemonade');
});

test('fruit-veg-blend: the Fruit&Veg carton line (fruit+vegetable combos with no single matching concept) leaves no-concept', () => {
  is('פרוט&ווג\' תפוז מנדרינה גזר קרטונית 1 ליטר', 'fruit-veg-blend');
  is('פרוט אנד ווג`אננס בננה כורכום 1 ליטר', 'fruit-veg-blend');
  isNot('מיץ תפוזים וגזר 100% סחוט', 'fruit-veg-blend'); // orange-carrot blend without the Froot&Veg brand words
});

test('spring-fruit-drink: the Spring juice-box multipack (no מיץ/נקטר word) leaves no-concept; Spring\'s tea, nectar and hard-seltzer lines stay with their own concepts', () => {
  is('ספרינג אגס סברס תפוח 4*250 מ"ל', 'spring-fruit-drink');
  is('ספרינג ענבים 4*250 מ"ל', 'spring-fruit-drink');
  isNot('קרטונית נקטר ספרינג לימונענע 1 ליטר', 'spring-fruit-drink');
  is('קרטונית נקטר ספרינג לימונענע 1 ליטר', 'soda-lemonade');
  isNot('ספרינג אלכוהול אננס בננה 330 מל פחית', 'spring-fruit-drink');
});

test('chocolate-drink-powder: שוקולית cocoa drink powder leaves no-concept', () => {
  is('שוקולית 500 גרם', 'chocolate-drink-powder');
  is('שוקולית 850 גרם', 'chocolate-drink-powder');
  isNot('שוקולד מריר 70% 100 גרם', 'chocolate-drink-powder');
});

test('coconut-water: coconut water across brands leaves no-concept', () => {
  is('מי קוקוס אורגני גרין קוקו קרטונית 1 ליטר', 'coconut-water');
  is('משקה מי קוקוס 1 ליטר', 'coconut-water');
  isNot('קוביות קוקוס מיובש 200 גרם', 'coconut-water');
});

test('sports-drink: Gatorade/Powerade isotonic sports drinks leave no-concept', () => {
  is('גטורייד ספורט תפוז אדום 500 מ"ל', 'sports-drink');
  is('פאוורייד משקה ספורט איזוטוני זירו בטעם אננס 500 מ', 'sports-drink');
  isNot('בגד ספורט ילדים', 'sports-drink');
});

test('water-sparkling: imported San Pellegrino/San Benedetto sparkling water leaves no-concept; the mineral-labelled line stays water-still\'s and the iced-tea line stays iced-tea\'s', () => {
  is('שישיית מים סאן פלגרינו פלסט 500 מ"ל', 'water-sparkling');
  is('סן בנדטו - מוגז - שישיית 500 מל', 'water-sparkling');
  isNot('שישיית מים מינרליים מוגזים סן בנדטו 1.5 ליטר', 'water-sparkling');
  is('שישיית מים מינרליים מוגזים סן בנדטו 1.5 ליטר', 'water-still');
  isNot('סן בנדטו- תה קר בטעם אפרסק 400 מל', 'water-sparkling');
});

test('mogu-mogu: the lychee/coconut-jelly drink leaves no-concept; its melon and iced-tea lines stay with their own concepts', () => {
  is('מוגו מוגו ליצי עם חתיכות גלי קוקוס 1ל', 'mogu-mogu');
  is('מוגו מוגו בטעם מנגו עם חתיכות ג\'לי קוקוס', 'mogu-mogu');
  isNot('מוגו מוגו מלון עם חתיכות גלי קוקוס 320 מ', 'mogu-mogu');
  is('מוגו מוגו מלון עם חתיכות גלי קוקוס 320 מ', 'melon');
});

test('coffee-rtd-canned: Mokate/Starbucks ready-to-drink cold coffee cans leave no-concept; a bare cappuccino FLAVOUR on an unrelated product (granita, cookies, liqueur) is not this leaf', () => {
  is('מוקטה אס.פי. קפוצינו פחית בטעם כיף כף 200גר', 'coffee-rtd-canned');
  is('סטארבקס פרפוצינו קפה בקבוק 250 מ"ל', 'coffee-rtd-canned');
  isNot('קרחון גרניטה חלבי אייס קפוצ\'ינו 48', 'coffee-rtd-canned');
});

test('bubble-drink-mix: the Ice-T bubble drink powder leaves no-concept', () => {
  is('איסט משקה באבלס בטעם קפה 260 גר', 'bubble-drink-mix');
  is('איסט משקה באבלס בטעם תות260 גר', 'bubble-drink-mix');
  isNot('קפה עלית אבקה להכנת קפה נמס קר בטעם קלאסי', 'bubble-drink-mix');
});

// --- widened concepts -------------------------------------------------------------------------------

test('soda-orange widened: Mirinda joins Fanta as orange soda', () => {
  is('מירינדה 1.5 ליטר', 'soda-orange');
  is('בקבוק מירינדה', 'soda-orange');
  isNot('פאנטה תות', 'cola'); // sanity: the sibling orange-soda brand never becomes cola
});

test('water-still widened: bare נביעות (no מים word) is still still-water; the flavoured נביעות+ line stays water-flavored\'s', () => {
  is('נביעות פקק שטוח', 'water-still');
  is('נביעות 500 מל פקק ספורט', 'water-still');
});

test('flavored-syrup widened: a bare תרכיז fruit concentrate joins the concept; tomato paste and cleaning concentrates are guarded out', () => {
  is('תרכיז תפוחים פרי קטיף 1 ל', 'flavored-syrup');
  is('תרכיז מנגו פרי קטיף 1 ליטר', 'flavored-syrup');
  isNot('תרכיז עגבניות בשפופרת בלה איטליה 28%', 'flavored-syrup');
  isNot('פנטסטיק תרכיז ניקוי כללי יסמין סיף 4 ליטר', 'flavored-syrup');
});

test('alcoholic-mixed-drink widened: Smirnoff Ice joins the mixed-drink concept; plain Smirnoff vodka stays vodka\'s', () => {
  is('סמירנוף אייס פחית 250 מ"ל', 'alcoholic-mixed-drink');
  isNot('וודקה סמירנוף אדום700מ"ל', 'alcoholic-mixed-drink');
  is('וודקה סמירנוף אדום700מ"ל', 'vodka');
});

test('soda-fruit-flavored widened: a cider that also says "מוגז בטעם" defers to cider', () => {
  is('סיידר מוגז בטעם סק און דה ביץ Sex On The Beach', 'cider');
  isNot('סיידר מוגז בטעם סק און דה ביץ Sex On The Beach', 'soda-fruit-flavored');
});

test('aloe-drink widened: requires a drink word now, so a shaving gel or wax strip that merely mentions aloe no longer claims it', () => {
  is('משקה אלוורה 500 מל', 'aloe-drink');
  is('סאפה משקה אלוורה בטעם ענבים 300מל', 'aloe-drink');
  isNot('ג\'ל גילוח עם אלוורה Protect & Care', 'aloe-drink');
  isNot('רצועות שעווה לגוף מגע הדבש אלוורה 12+3יח', 'aloe-drink');
});

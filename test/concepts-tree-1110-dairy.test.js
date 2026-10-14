import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConcepts, assignConcept, conceptById } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - חלב וביצים: cluster-first tree round (docs/CONCEPTS.md, Naor's "group first, then build the
 * tree" + "as many levels as it needs" direction). Started from the department's 442 no-concept products
 * (data/products.json) clustered by what each product actually IS, not by its label. Real chain names below;
 * every `is` is a capture this round added or fixed, every `isNot` is the near-miss that proves the rule is
 * narrow enough (a name from a DIFFERENT real product, or the same brand selling something else).
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

// --- new leaf: a fourth cottage fat% (12%) sits beside the existing 3/5/9 --------------------------------

test('cottage-12: a fourth fat-percent leaf next to cottage-5/9/3; a different percent on the same shelf is not it', () => {
  is("קוטג 12% תנובה 250 גרם", 'cottage-12');
  isNot("קוטג' 9% תנובה", 'cottage-12');
  isNot("קוטג 12% תנובה 250 גרם", 'cottage-9');
});

// --- new leaf: tzatziki was entirely missing - explicitly excluded from Pirassos but never given its own leaf
// Opus review 11.10: both spellings (Gad prints צזיקי), the Greek-yogurt dip is tzatziki not yogurt-natural,
// and the "ארוחה בקטנה" snack kit with crackers is a different purchase - labaneh already refuses it.

test('tzatziki: the Greek yogurt-cucumber dip (and its drinkable form) was excluded from cheese-pirassos-* but had no leaf of its own; a labaneh line merely named "ציזיקי" stays labaneh\'s', () => {
  is('ציזיקי למריחה 5% 250 גרם', 'tzatziki');
  is('ציזיקי לשתיה 500 מ"ל', 'tzatziki');
  is('גד משקה צזיקי 2% 500', 'tzatziki');
  is('צזיקי למריחה 5% שומן', 'tzatziki');
  is('יוגורט יווני צזיקי 10% - מטבל יוגורט עם מלפפונים, שום ושמיר', 'tzatziki');
  isNot('ארוחה בקטנה ציזיקי עם קרקרים 150 גרם', 'tzatziki');
  isNot("גבינת לאבנה ציזיקי 5% מחלבות גד 250 גרם", 'tzatziki');
  is("גבינת לאבנה ציזיקי 5% מחלבות גד 250 גרם", 'labaneh');
});

// --- Opus review 11.10: milkshake-chocolate removed. drinks.json chocolate-milk-drink names "מילקשייק" in its
// own any-list on purpose; a second leaf for the same Yotvata bottle made a conflict and moved an 11-chain product.

test('milkshake-chocolate is gone: a Yotvata chocolate milkshake is chocolate-milk-drink (drinks.json); a fruit shake stays milkshake-fruit', () => {
  assert.equal(conceptById('milkshake-chocolate', concepts), null);
  is('מילקשייק שוקו עם סיר', 'chocolate-milk-drink');
  is('שייק תות בננה עם חלב', 'milkshake-fruit');
});

// --- new leaves: ready cream pasta sauces split by what they actually are, not lumped into cream-sauce-classic

test('cream-sauce-alfredo: a ready Alfredo sauce is its own leaf; cream-sauce-classic\'s own plain-cream territory is untouched', () => {
  is('רוטב אלפרדו שמנת 250 גרם', 'cream-sauce-alfredo');
  is('רוטב אלפרדו 220ג רמילוי', 'cream-sauce-alfredo');
  isNot('יטבתה רוטב שמנת קלאסי 9% 260 גרם', 'cream-sauce-alfredo');
  is('יטבתה רוטב שמנת קלאסי 9% 260 גרם', 'cream-sauce-classic');
});

test('cream-sauce-rose: a ready rosé sauce is its own leaf, not cream-sauce-classic\'s', () => {
  is('רוטב רוזה 220ג רמילוי', 'cream-sauce-rose');
  isNot('רוטב שמנת בזיליקום 220 מ"ל רמי לוי', 'cream-sauce-rose');
});

// --- new leaf: coconut milk (the carton drink) was entirely uncovered, and must not catch milk-chocolate+coconut

test('coconut-milk-drink: the literal adjacent phrase "חלב קוקוס" only - milk CHOCOLATE that also mentions coconut (wafers, bars, cereal bars) is a different product entirely', () => {
  is('קוקו מקס חלב קוקוס 1 ליטר קרטונית תריסר', 'coconut-milk-drink');
  is('רנדי חלב קוקוס 100% 1 ל', 'coconut-milk-drink');
  isNot('שוקולד חלב עם קוקוס', 'coconut-milk-drink');
  isNot("וופל גרנד פטיסרי שוקולד חלב וקוקוס", 'coconut-milk-drink');
  isNot("קורני חטיף דגנים עם שוקולד חלב וקוקוס", 'coconut-milk-drink');
});

// --- widened: dairy-jelly now covers אפרסק, guarded against a gummy-candy bundle that merely ends in "ג'לי"

test('dairy-jelly widened: peach is a flavour like the others; a Goodies gummy-candy bundle that happens to end in the truncated "ג\'לי" is not it', () => {
  is("ג'לי תנובה בטעם אפרסק 125 גרם", 'dairy-jelly');
  isNot('מאגדות גודיז לייט פרי תות שדה ואפרסק גלי', 'dairy-jelly');
});

// --- widened: pudding-fruit now covers banana like its sibling fruits

test('pudding-fruit widened: banana joins the existing fruit list for a cheese-and-yogurt dessert', () => {
  is('דניאלה מעדן גבינה ויוגורט בטעם בננה 5%', 'pudding-fruit');
});

// --- widened: cream-cheese now recognises טרטר/בורסאן (the brand IS the product: a herbed fresh cream cheese).
// Opus review 11.10: the bare "קרם" went - it is cream in a hundred names, and Tnuva's Ski "קרם גבינה" is a smooth
// white cheese the published catalog already files under white-cheese-5.

test('cream-cheese widened: the Tartare/Boursin herbed lines join Philadelphia; "קרם" alone is not cream cheese, and a melted cheese described as "קרמי" stays processed-cheese\'s', () => {
  is('גבינת טרטר עשבי תיבול 150 גרם', 'cream-cheese');
  is('גבינת בורסאן שום ועשבי תיבול 150 גר', 'cream-cheese');
  isNot('קרם גבינה 9% 500 גר סקי', 'cream-cheese');
  isNot('חלבון קרמי עוגת גבינה קרם לימון 55 גר a', 'cream-cheese');
  isNot('גבינה מותכת קרמי 14% שומן 70ג PRESIDENT', 'cream-cheese');
  is('גבינה מותכת קרמי 14% שומן 70ג PRESIDENT', 'processed-cheese');
  isNot('GO אבקת חלבון מי גבינה וניל קרמל 748 גרם', 'cream-cheese');
  isNot('גבינה קרמן מנצגו רוז', 'cream-cheese');
});

// --- widened: brie-cheese now covers the bare "מיני ברי" phrase, still guarded against berry flavour -------

test('brie-cheese widened: "מיני ברי" (a mini wheel, no "גבינה" word at all) joins the existing "גבינה"/"משולש" anchors; a berry-flavoured product with the bare word "ברי" is still refused by the existing anti-berry guard', () => {
  is('מיני ברי 125 גרם', 'brie-cheese');
  is('מיני ברי כחולה 125 גרם', 'brie-cheese');
});

// --- Opus review 11.10: כפיר is a maker, and a maker's name is never a product word (Naor 11.10, 22bad81).
// Edam resolves through the chains' own abbreviation "גב." (גבינת); smoked כפיר names that never say cheese stay out.

test('edam-cheese reads "גב." as cheese; כפיר alone decides nothing', () => {
  is('כפיר בנוסח גב.אדם הולנדי משקל', 'edam-cheese');
  is('גב.אדם אורגני פרוס 100ג', 'edam-cheese');
  isNot('כפיר מעושנת במשקל א', 'smoked-cheese');
  isNot('כפיר ט.מקסיקני חריף שקיל', 'edam-cheese');
  isNot('כפיר ט.מקסיקני חריף שקיל', 'smoked-cheese');
});

// --- widened: kashkaval-cheese now covers the קצ'קבל spelling (ש/צ transliteration variant) -----------------

test('kashkaval-cheese widened: קצ\'קבל is the same cheese as קשקבל, just transliterated through צ instead of ש', () => {
  is("גבינת גלעד קצ'קבל מח", 'kashkaval-cheese');
  is('קשקבל', 'kashkaval-cheese');
});

// --- widened: yellow cheese (shredded/sliced/block) now covers the נעם and סקנדינבית brand lines, guarded
// against the SAME style-word being used for herring, rye bread and deli salad elsewhere in the catalog -----

test('yellow-cheese-shredded/sliced/block widened: נעם (Tnuva) and סקנדינבית are yellow-cheese brand/style lines by form; the identical style word "סקנדינבי" on herring fillets, rye bread or a deli salad must never become cheese', () => {
  is('נעם 28 מגורדת כ250', 'yellow-cheese-shredded');
  is('נעם 9% מגורד כ 250 גרם', 'yellow-cheese-shredded');
  is('סקנדינבית מגורדת כ250 א', 'yellow-cheese-shredded');
  is('סקנדינבית31%פרוס כ-300 א', 'yellow-cheese-sliced');
  is('גבינה בסגנון סקנדינבי 31%', 'yellow-cheese-block');
  isNot('חתיכות פילה דג הרינג סקנדינבי מומלח בשמן מצונן 500', 'yellow-cheese-block');
  isNot('לחם שיפון פרוס בסגנון סקנדינבי', 'yellow-cheese-sliced');
  isNot('סלט הרינג במיונז בסגנון סקנדינבי 200 גרם', 'yellow-cheese-block');
});

// --- widened: יופלה is a yogurt-only brand across the whole catalog, so it anchors yogurt-plain/fruit/flavored
// even on the handful of lines that never say the word יוגורט at all -----------------------------------------

test('yogurt-plain/fruit/flavored-other widened: יופלה alone anchors these leaves, the same way it already does for yogurt-drink; a Yoplait-brand product miscategorised into a non-dairy department is still recognised correctly', () => {
  is('יופלה לבן 1.5%', 'yogurt-plain');
  is('יופלה לבן תנובה 200 מ"ל.', 'yogurt-plain');
  is('יופלה מארז תות 8 יח', 'yogurt-fruit');
  is('יופלה דיאט בטעם וניל 150 ג', 'yogurt-flavored-other');
  is('יופלה בד"צ 1.5% מעודן 8*150מל', 'yogurt-plain');
});

// --- fixed conflict: a cream sold explicitly "להקצפה" is whipping-cream's even when also labelled "מתוקה" ---

test('cream-sweet vs whipping-cream conflict fixed: a cream labelled both "מתוקה" and "להקצפה" is whipping cream, not a cream-sweet/whipping-cream conflict that the build would drop', () => {
  is('שמנת מתוקה להקצפה בטעם וניל', 'whipping-cream');
  isNot('שמנת מתוקה להקצפה בטעם וניל', 'cream-sweet');
  is('שמנת מתוקה 250 מל', 'cream-sweet'); // sweet with no whipping instruction is still cream-sweet's
});

// --- cross-file collisions, resolved in pantry.json by its own owner (live, uncommitted when this was written:
// pasta-sauce-tomato none "אלפרדו"/"רוזה", spice-black-pepper none "בורסאנ"). Commit together with pantry.json.

test('cross-file collisions resolved: Alfredo and rosé are not tomato sauce, a Boursin pepper cheese is not a spice', () => {
  is('רוטב אלפרדו גרנה פדנו - רוטב ריקוטה, גרנה פדנו וכרישה לפסטה', 'cream-sauce-alfredo');
  is('רוטב לפסטה רוזה 500 גר', 'cream-sauce-rose');
  is('גבינת בורסאן פלפל שחור 150 גרם', 'cream-cheese');
  isNot('אלפרדו קשיו גביע רוטב לבישול סגנון שמנ', 'cream-sauce-alfredo'); // cashew: a plant product
});

// --- every concept in the department now carries an explicit family (group lives in family.name) -------------
// Opus review 11.10: loadConcepts() fills `family` for every concept (resolveFamily), so the round's own version
// of this test could not fail. This reads the JSON as written. Three concepts keep a DERIVED family because a
// drinks.json sibling shares their id prefix (rice-pudding/rice-milk-drink, chocolate-mousse/chocolate-milk-drink,
// soy-spread/soy-milk-drink) and test/conceptFamilies.test.js forces one family per prefix - see the review report.

test('every dairy-eggs.json concept in חלב וביצים has an explicit family in the JSON, except the three a drinks.json prefix sibling holds hostage', () => {
  const raw = JSON.parse(readFileSync(new URL('../config/concepts/dairy-eggs.json', import.meta.url), 'utf8')).concepts;
  const hostage = new Set(['rice-pudding', 'chocolate-mousse', 'soy-spread']);
  const missing = raw.filter((c) => c.category === 'חלב וביצים' && !c.family && !hostage.has(c.id)).map((c) => c.id);
  assert.deepEqual(missing, []);
  // 14.10: the "גבינות / X" text convention became the group level (docs/CONCEPTS.md §17) - the family
  // name is the bare family, the group carries "גבינות"; ביצים has no group and sits under the department.
  assert.equal(conceptById('gouda-cheese', concepts).family.name, 'גאודה');
  assert.deepEqual(conceptById('gouda-cheese', concepts).group, { id: 'cheeses', name: 'גבינות' });
  assert.equal(conceptById('white-cheese-5', concepts).family.name, 'גבינה לבנה');
  assert.deepEqual(conceptById('white-cheese-5', concepts).group, { id: 'cheeses', name: 'גבינות' });
  assert.equal(conceptById('egg-regular', concepts).family.name, 'ביצים');
  assert.equal(conceptById('egg-regular', concepts).group, null);
  assert.equal(conceptById('cream-cheese', concepts).family.id, 'cream');
  assert.deepEqual(conceptById('cream-cheese', concepts).group, { id: 'cream-butter', name: 'שמנת וחמאה' });
  // The two prefix collisions are split by explicit families and land in the shelf's groups (Naor 14.10).
  assert.equal(conceptById('chocolate-mousse', concepts).group.id, 'yogurt-desserts');
  assert.equal(conceptById('chocolate-milk-drink', concepts).group.id, 'milk-drinks');
  assert.equal(conceptById('rice-pudding', concepts).group.id, 'yogurt-desserts');
  assert.equal(conceptById('rice-milk-drink', concepts).group.id, 'milk-drinks');
});

// ===================================== Opus review 11.10 ======================================================

test('Bulgarian cheese: fat % is identity - 5 / 16 / 24 are leaves; no %, a % with no leaf, or two percents stay in bulgarian-cheese', () => {
  is('גבינה בולגרית 5% גד 250 גרם', 'bulgarian-cheese-5');
  is('בולגרית% }5 גד שקיל', 'bulgarian-cheese-5'); // the chain printed the sign first
  is('בולגרית מעודנת 16%', 'bulgarian-cheese-16');
  is('בולגרית פיראוס 24% שומן 250 גרם', 'bulgarian-cheese-24');
  is('גבינה בולגרית 18% שומן ק"ג.', 'bulgarian-cheese');
  is('גבינה בולגרית מעודנת 250 גר', 'bulgarian-cheese');
  is('בולגרית 5% 16%  מעודנת- גד מעדניה', 'bulgarian-cheese');
  isNot('גבינה בולגרית 0.5%', 'bulgarian-cheese-5');
  isNot('בולגרית 15%', 'bulgarian-cheese-5');
  is('גבינה בולגרית מעודנת עיזים 5% 250 גר', 'goat-cheese-other'); // milk is identity
  is('בולגרית עיזים מעודנת 16%', 'goat-cheese-other');
});

test('Bulgarian cheese is the cheese: the masculine style word on pickled cabbage, salad, kebab or a perfume is not, nor a phyllo pastry or an eggplant spread', () => {
  for (const n of ['כרוב בולגרי כבוש 750 גר`מאמא מרי', 'כרוב בולגרי 500 גר', 'בולגרי פור הום אדט100מ"ל', 'אצבעות פילו בולגרית 700ג רמילוי', 'מעדן גבינה בולגרית עם חציל 9% ניצן 200 גרם']) {
    for (const id of ['bulgarian-cheese', 'bulgarian-cheese-5', 'bulgarian-cheese-16', 'bulgarian-cheese-24']) isNot(n, id);
  }
  is('סלט בולגרי 450 גרם', 'deli-salad-other');
  is('קבב בולגרי עם פטרוזי', 'kebab-frozen');
  is('גבינה קוביות בולגרי', 'bulgarian-cheese');
});

test('יופלה anchors yogurt, but "plain" is the absence of a flavour - so with only the brand, plain needs לבן/מעודן', () => {
  is('יופלה לבן 1.5%', 'yogurt-plain');
  is('יופלה בד"צ 1.5% מעודן 8*150מל', 'yogurt-plain');
  is('יופלה מארז תות 8 יח', 'yogurt-fruit');
  isNot('שמיניית דיאט יופלה 0% טעמים שונים 150 גרם', 'yogurt-plain');
  isNot('מאג 8*150ג יופלה פרי', 'yogurt-plain');
  isNot('יופלה', 'yogurt-plain');
  isNot('יופלה און טופ פצפוצים 157 גרם', 'yogurt-plain'); // yogurt + a topping cup, not plain yogurt
  isNot('יוגורט און טופ כוכבים', 'yogurt-plain');
  isNot('יופלה און טופ פקאן מצופה 4.3% 150 מל', 'yogurt-plain');
});

test('סקנדינבית is a yellow cheese by its feminine name or next to גבינה; נעם is a whole word', () => {
  is('סקנדינבית מגורדת כ250 א', 'yellow-cheese-shredded');
  is('פרוסות גבינה סקנדינבית 170 גרם', 'yellow-cheese-sliced');
  is('גבינה בסגנון סקנדינבי 31%', 'yellow-cheese-block');
  isNot('סלט הרינג במיונז בסגנון סקנדינבי 200 גרם', 'yellow-cheese-block');
  isNot('מגורדת נעמה', 'yellow-cheese-shredded');
  is('נעם 9% מגורד כ 250 גרם', 'yellow-cheese-shredded');
});

test('coconut-milk-drink is the carton drink; a 250-500 ml "חלב קוקוס" (Aroy-D) is canned cooking coconut milk', () => {
  is('קוקו מקס חלב קוקוס 1 ליטר', 'coconut-milk-drink');
  is('חלב קוקוס 100% 1 ל', 'coconut-milk-drink');
  isNot('חלב קוקוס AROY-D 250 מ"ל -מבצע', 'coconut-milk-drink');
  isNot('חלב קוקוס אורגני 330', 'coconut-milk-drink');
});

test('פטה is also pâté: goose and liver pâté are not feta; a breaded frozen mozzarella stick is not mozzarella', () => {
  isNot('ממרח פטה אווז 140 גר', 'feta-cheese');
  isNot('פטה כבד צרפתי ביין לבן 180 גר', 'feta-cheese');
  is('ממרח פטה עם כבד עוף', 'liver-pate');
  is('גבינה פטה בקר גרמני', 'feta-cheese'); // בקר here is cow's milk
  is('פטה כבשים 20% 250 גרם', 'feta-cheese');
  isNot('אצבעות מוצרלה בציפוי פירורי לחם קפוא', 'mozzarella');
  is('אצבעות מוצרלה עמק 172גרם', 'mozzarella');
});

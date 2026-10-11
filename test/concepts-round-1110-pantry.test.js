import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - pantry (שימורים) round: 554 no-concept products sold in 3+ chains (ops review
 * ops/review/receipt-sim-2026-10-11.md). Every new leaf gets one name it must capture and one close
 * name it must refuse (the refusal is what holds the rule). Names are real chain names from
 * data/products.json / the price files, not invented examples.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

// --- cereal family (the biggest open cluster: ~50 no-concept products, one leaf per brand/line) ------

test('cereal-branflakes: bran flakes across manufacturers, not a bran-flakes-flavoured cookie', () => {
  is('ברנפלקס אקסטרא פרוטיאין תלמה 375 גרם', 'cereal-branflakes');
  is('ברנפלקס לללא סוכר452 גר גרם {חתם סופר}', 'cereal-branflakes');
  isNot('עוגיות ברנפלקס בציפוי שוקולד', 'cereal-branflakes');
});

test('cereal-fitness: Fitness breakfast cereal, not the Fitness-brand cracker/cookie/crispbread/pretzel lines', () => {
  is('דגני בוקר פיטנס קלאסי 375 גרם', 'cereal-fitness');
  isNot('פיטנס קרקר דק בטטה 140 גרם', 'cereal-fitness');
  isNot('פיטנס בייגלה בטטה 150 גרם', 'cereal-fitness');
});

test('cereal-cheerios: Cheerios, not a honey-almond snack that merely tastes of honey', () => {
  is("דגני בוקר צ'יריוס מולטי עם 3 סוגי דגנים מלאים -פרווה", 'cereal-cheerios');
  isNot('חטיף שקדים ודבש', 'cereal-cheerios');
});

test("cereal-crunch: Nestle Crunch cereal, not a crunchy chip/corn-snack/granola that borrows the adjective", () => {
  is("דגני בוקר קראנץ' רולס 450 גרם", 'cereal-crunch');
  is("קראנץ' דגני בוקר בטעם שוקולד חלב 500 גרם נסטלה אסם", 'cereal-crunch');
  isNot("תפוצ'יפס קראנץ' בטעם טבעי עלית 200 גרם", 'cereal-crunch');
  isNot("צ'יטוס קראנצ' גבינה 70 גר", 'cereal-crunch');
});

test('cereal-trix: Trix, a leaf on its own (brand name doubles as the product)', () => {
  is('דגני בוקר טריקס בטעם פירות', 'cereal-trix');
  is('טריקס 480 גר נסטלה', 'cereal-trix');
});

test('cereal-kitkat / cereal-nesquik: the cereal line, not the candy bar / cocoa drink it is named after', () => {
  is('דגני בוקר קיטקט 330 גרם', 'cereal-kitkat');
  isNot('קיטקט שוקולד חלב 41.5 גרם', 'cereal-kitkat');
  is('דגני בוקר נסקוויק בטעם שוקולד 500 גרם', 'cereal-nesquik');
  isNot('נסקוויק משקה שוקו 1 ליטר', 'cereal-nesquik');
});

test('cereal-fiber-one / cereal-lion / cereal-honey-bunches / cereal-raisin-bran: one leaf each', () => {
  is('דגני בוקר פייבר וואן עתירי סובין FIBRE1', 'cereal-fiber-one');
  is('ליון דגני בוקר בטעם שוקולד וקרמל 480 גרם', 'cereal-lion');
  isNot('ליון תלמה וופל שוקולד', 'cereal-lion');
  is("האני באנצ' דגני בוקר עם שקדים פוסט 340 גרם", 'cereal-honey-bunches');
  is('דגני בוקר רייזן ברן 471 גרם', 'cereal-raisin-bran');
});

test('cereal-pebbles / cereal-weetabix / cereal-great-grains: one leaf each', () => {
  is('דגני קוקו פבלס - אורז תפוח ממותק עם קקאו', 'cereal-pebbles');
  is('פוסט דגני פרוטי פבלס 311גר', 'cereal-pebbles');
  is('דגני בוקר וויטביקס מחיטה מלאה 430 גר', 'cereal-weetabix');
  is('גרייט גריינס דגני בוקר עם פירות יבשים פוסט 453 גרם', 'cereal-great-grains');
});

test('cereal-rings: Minions rings share the ring shape with the plain "טבעות דגנים" leaf', () => {
  is('המיניונים דגני בוקר טבעות בתוספת דבש', 'cereal-rings');
  isNot('חטיף טבעות תירס', 'cereal-rings');
});

test('cereal-filled-pillows: a filled cereal pillow, not an actual pillow or a scouring pad', () => {
  is('כריות נוגט תלמה 686 גרם', 'cereal-filled-pillows');
  is('כריות במילוי קרם בטעם וניל פטיסייר 348 גרם תלמה', 'cereal-filled-pillows');
  isNot('זוג כריות שינה פוך נוצות', 'cereal-filled-pillows');
  isNot('3כריות קרצוף VIVI XL', 'cereal-filled-pillows');
});

test('cereal-golden-crisp: one leaf', () => {
  is('דגני שלווה מצופים בדבש Golden Crisp', 'cereal-golden-crisp');
});

test('cereal-sweetened-other: the catch-all needs the full "דגני בוקר" phrase, not a bread or candy bar that merely mentions grains', () => {
  is('דגני בוקר צבעוניים בטעם פירות טוטי פרוטיס', 'cereal-sweetened-other');
  is('דגני בוקר בראוניז ללא גלוטן 375ג', 'cereal-sweetened-other');
  isNot('לחם דגנים 600 גר', 'cereal-sweetened-other');
  isNot("קינדר שוקולד עם דגנים פרימיום", 'cereal-sweetened-other');
});

// --- sweeteners, colouring, baking ---------------------------------------------------------------

test('food-coloring: food colouring, one leaf for all four colours', () => {
  is('צבע מאכל צהוב 50 גרם', 'food-coloring');
  is('מימונס צבע מאכל אדום 50 גרם', 'food-coloring');
  isNot('צבע לשיער פרוטאין קולור- 10 בלונד בהיר מאוד', 'food-coloring');
});

test('baking-soda: baking soda, not a foot-bath or skin salt', () => {
  is('סודה לשתייה 100 גרם', 'baking-soda');
  is('סודה לשתיה בשקית מיה 80 גרם', 'baking-soda');
  isNot('מלח אמבט לכף הרגל 600מל', 'baking-soda');
});

test('breadcrumbs-schnitzel-coating: the seasoned schnitzel coating, a different product from plain breadcrumbs (bakery.json breadcrumbs excludes שניצל)', () => {
  is('ציפוי לשניצל עם עשבי תיבול', 'breadcrumbs-schnitzel-coating');
  is('פירורית בטעם ביסלי גריל אסם 200 גרם', 'breadcrumbs-schnitzel-coating');
  isNot('פנקו פירורי לחם אקסטרה קראנצי מוזהבים בסגנון יפני', 'breadcrumbs-schnitzel-coating');
});

// --- canned / preserved goods ---------------------------------------------------------------------

test('fruit-dessert-cup: San Delfort diet fruit dessert cups, not a dairy pudding', () => {
  is('מעדן אוכמניות כחולות לל"ס סאן דלפור 284 גרם', 'fruit-dessert-cup');
  isNot('מעדן תנובה שוקולד דל קלוריות 150 גרם', 'fruit-dessert-cup');
});

test('canned-fruit-light-syrup: fruit cocktail / pineapple in light syrup, not a savoury vegetable mix', () => {
  is('חתיכות אננס בסירופ קל וילי פוד137 גרם', 'canned-fruit-light-syrup');
  is('קוקטייל פירות טרופיים בסירופ קל תומר 825 גרם', 'canned-fruit-light-syrup');
  isNot('ירקות מעורבים בסגנון מזרחי 320 גרם בית השיטה', 'canned-fruit-light-syrup');
});

test('fruit-compote: לפתן (compote), not the crystal-candy product that also opens with the word', () => {
  is("לפתן דובדבנים חמוצים 680 גרם", 'fruit-compote');
  isNot("לפתן בדולח מרובע קרם- אר' 10", 'fruit-compote');
});

test('fava-beans-canned: פול leaves chickpeas/lentils, anchored so it never matches mid-word', () => {
  is('פול גדול 500 ג\' רמי לוי', 'fava-beans-canned');
  is('פול מצרי יכין 350 גרם', 'fava-beans-canned');
  isNot('פולי קפה קלויים', 'fava-beans-canned');
});

test('pickled-peppers: pickled hot peppers / pickled ginger, not black pepper spice or a fresh pepper', () => {
  is('פלפלים כבושים חריפים סרה 320 גרם', 'pickled-peppers');
  is("ג'ינגר לבן כבוש ללא מונוסודיום 190 גרם (כ)", 'pickled-peppers');
  isNot('פלפל שחור גרוס עבה 1', 'pickled-peppers');
});

test('garlic-pickled: pickled garlic, not garlic powder or sliced raw garlic', () => {
  is('שום צעיר כבוש בחומץ בצנצנת 330 גרם', 'garlic-pickled');
  isNot('שום טחון רמי לוי 100 גרם', 'garlic-pickled');
});

test('sprats-canned: שפרוטים, final mem folded so the plural actually matches', () => {
  is('שפרוטים מעושנים בשמן צמחי', 'sprats-canned');
  isNot('שימורי קרם קוקוס 20-22% 400 מ"ל (ASIATIC)(כ)', 'sprats-canned');
});

test('gefilte-fish: גפילטע פיש, not the generic fish-cakes leaf', () => {
  is('גפילטע פיש היימיש פיש 560 גרם', 'gefilte-fish');
  isNot('קציצות דג בתיבול עדין 700 ג רמילוי', 'gefilte-fish');
});

test('salmon-canned: canned/jarred Atlantic salmon in oil or sauce, not fresh or frozen salmon', () => {
  is('סלמון אטלנטי בשמן קנולה וילי פוד 120 גר', 'salmon-canned');
  isNot('פילה סלמון טרי', 'salmon-canned');
});

test('instant-mashed-potato: instant mash, not a fresh potato side dish', () => {
  is('קנור פירה עם בצל מטוגן להכנה מהירה', 'instant-mashed-potato');
  isNot('תפוחי אדמה טרי', 'instant-mashed-potato');
});

test('instant-ramen: ראמן leaves the dry-noodles leaf and the soup-cup leaf', () => {
  is('ראמן טבעוני 700 גרם', 'instant-ramen');
  isNot('סקיני סופ תבשיל מרק בטעם עוף 284 גרם', 'instant-ramen');
});

test('instant-mac-cheese: mac & cheese ready meal, one leaf for both Hebrew spellings', () => {
  is('מנה חמה מק אנד ציז אסם 58 גרם', 'instant-mac-cheese');
  isNot('ארוחת מקרוני ברוטב עגבניות ביתי', 'instant-mac-cheese');
});

// --- widened existing concepts (words only, no new leaf) ------------------------------------------

test('jam: construct-state ריבת-X (jam-of-X) now matches, but ריבת חלב (dulce de leche) stays its own concept', () => {
  is('ריבת אפרסקים', 'jam');
  is('קונפיטורת תפוח וקינמון 340 גרם יד מרדכי', 'jam');
  isNot('ריבת חלב 340 גרם', 'jam');
  isNot('גבינת שמנת ריבת בצל 24%', 'jam');
});

test('spice-cinnamon: a jam/compote that merely tastes of cinnamon is not the spice', () => {
  is('קינמון טחון 100 גרם', 'spice-cinnamon');
  isNot('קונפיטורת תפוח וקינמון 340 גרם יד מרדכי', 'spice-cinnamon');
});

test('pickles: מוחמצ (an unvowelled spelling of מוחמץ) now triggers pickles too', () => {
  is('מלפפונים מוחמצים', 'pickles');
});

test('tomato-paste: רכז / תרכיז (concentrate) are the same product as רסק', () => {
  is('רכז עגבניות DOPPIO בשפופרת 185 גרם', 'tomato-paste');
  is('תרכיז MUTTI עגבניות', 'tomato-paste');
});

test('pickled-mushrooms: canned/jarred mushrooms by brand name, not fresh loose mushrooms', () => {
  is('פטריות שמפיניון שלמות וילי פוד 230 גרם', 'pickled-mushrooms');
  is('ויליפוד פטריות שמפיניון חתוכות במי מלח 400 גרם', 'pickled-mushrooms');
  isNot('פטריות שמפיניון', 'pickled-mushrooms');
});

test('instant-noodles: מנה חמה / מנת השף / תאי נודלס cup noodles, not the dry noodles leaf', () => {
  is('מנה חמה נודלס בטעם בקר אסם 70 גרם', 'instant-noodles');
  is('תאי נודלס אטריות בטעם עוף', 'instant-noodles');
  isNot('אטריות אורז דקות 400 גר טעמי אסיה', 'instant-noodles');
});

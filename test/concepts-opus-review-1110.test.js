import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept, conceptById } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - reviewer pass (Opus) over the seven department rounds of the same day (8ef5c1f..016f63e).
 * Naor's verdict: the rounds "took the product name and sanctified every word". A name is
 * what-it-is + size + container + brand + maker + kind; a leaf is keyed on the what. Each test below is one
 * leaf the review changed, with real chain names: one it must now capture and the wrong one it must refuse.
 * Measured with scripts/concept-round.mjs (raw names, 110k): every name that left a concept is a wrong
 * assignment named here or in the round test files' "Opus review 11.10" comments.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);
const gone = (id) => assert.equal(conceptById(id, concepts), null, `${id} should be gone`);

test('a maker name is not a product word: "עוף טוב" / "מאמא עוף" do not make beef meatballs chicken', () => {
  is('קציצות עוף אמיתיות מאמא עוף 700 גרם', 'chicken-meatballs');
  isNot('עוף טוב קציצות בקר י', 'chicken-meatballs');
  isNot('מחפוד קבב כבש קציצות עוף ירושלים', 'chicken-meatballs');
});

test('nuggets: one product, one leaf - שניצלונים are chicken-nuggets in every spelling; the shapes leaf has no marketing "קראנץ"', () => {
  is('שניצלונים עוף טוב 600 גרם', 'chicken-nuggets');
  is('שניצלוני שומשום עוף טוב 600 גרם', 'chicken-nuggets');
  is('מיני שניצלונים בציפוי פריך מאמא עוף 500 גרם', 'chicken-nuggets');
  is('כוכבי עוף בציפוי מעודן מאמא עוף 700 גרם', 'chicken-nugget-shapes');
  isNot('נקנקיות קראנץ קפוא 1 קג מחפוד עוף ירושלי', 'chicken-nugget-shapes');
  isNot('רצועות חזה עוף קראנצ', 'chicken-nugget-shapes');
  isNot('חטיף עוף ואורז קראנצ\'ים', 'chicken-nugget-shapes');
});

test('gefilte fish is one leaf whichever spelling; fish cakes are fish cakes', () => {
  is('גפילטע פיש 450 גר', 'gefilte-fish');
  is('געפילטע פיש 6 קציצות', 'gefilte-fish');
  is('קציצות גפילטע פיש 7 קציצות 350 גרם תומר', 'gefilte-fish');
  is('קציצות דג דלידג 700 גרם', 'fish-cakes');
  isNot('געפילטע פיש 12 קציצות מדג קרפיון וכסיף', 'carp');
});

test('"לקט" is not a product: frozen-vegetable-medley is gone, a frozen mix is frozen-vegetables, "לקטוז" is no לקט', () => {
  gone('frozen-vegetable-medley');
  is('לקט נורמנדי סנפרוסט 800 גרם', 'frozen-vegetables');
  isNot('לקט לקוסקוס 800 גרם', 'couscous');
  isNot('מיני פיצה ללא לקטוז קפוא לל"ג שר 280 גרם', 'frozen-vegetables');
  isNot('לקט פירות יער מוקפאים', 'frozen-vegetables');
});

test('Fitness is a sub-brand: only its cereal is cereal-fitness', () => {
  is('דגני בוקר פיטנס קלאסי 375 גרם', 'cereal-fitness');
  is('פיטנס שקדים ודבש 355 גרם', 'cereal-fitness');
  isNot('דאו גל  פיטנס ליידי', 'cereal-fitness');
  isNot('פיטנס THIN כפרי', 'cereal-fitness');
  isNot('פיטנס ח.קינואה מלח ים ושמן זית', 'cereal-fitness');
  isNot('פיטנס בר דליס שוקולד חלב 6*22.5 גרם', 'cereal-fitness');
  isNot('פיטנס עוג\' מיני שוקולד80', 'cereal-fitness');
});

test('"קראנצי" is an adjective, not Nestle Crunch; a cereal brand beats its own flavour word', () => {
  is('דגני בוקר קראנץ\' פרוטאין 375 גרם', 'cereal-crunch');
  isNot('קלוגס דגני בוקר קראנצי בוטנים ודבש 460 ג', 'cereal-crunch');
  is('צ\'יריוס שיבולת שועל 500 גרם נסטלה', 'cereal-cheerios');
  is('האני באנצס עם קינמון 340 גר', 'cereal-honey-bunches');
});

test('St Dalfour "מעדן" is jam; the leaf keyed on the maker is gone', () => {
  gone('fruit-dessert-cup');
  is('מעדן משמש סנט דלפור', 'jam');
  is('סאנט דלפור תות שדה 284 גרם', 'jam');
  isNot('מעדן חלבון לל"ס שוקולד', 'jam');
  isNot('רוטב ריבת בצל אוליביה', 'jam');
  isNot('ריבת בצל', 'onion-yellow');
});

test('canned fruit: "בסירופ קל" is the liquid - one leaf per fruit, a seafood cocktail is not fruit', () => {
  gone('canned-fruit-light-syrup');
  gone('fruit-compote');
  is('פרוסות אננס בסירופ קל תומר 850 גרם', 'canned-pineapple');
  is('לפתן אפרסק בסירופ קל 4יח', 'canned-peaches');
  is('ליצ\'י שלמים בסירופ קל תומר', 'canned-lychee');
  is('משמש חצאים בסירופ קל 850גרם', 'canned-apricots');
  is('דובדבני אמרנה בסירופ 400 גרם', 'canned-cherries');
  is('קוקטייל פירות 820 גרם', 'fruit-cocktail-canned');
  isNot('קוקטייל פירות ים 500 גר', 'fruit-cocktail-canned');
  isNot('מחית קוקטייל פירות שלב 2', 'fruit-cocktail-canned');
});

test('pickled ginger is not a pickled pepper', () => {
  is('גינגר לסושי ורוד 250 גר טעמי אסיה', 'ginger-pickled');
  is('פלפל שיפקה בית השיטה 230 גרם', 'pickled-peppers');
  isNot('גינגר כבוש וורוד 160 גרם', 'pickled-peppers');
});

test('ramen: dry ramen noodles are noodles, gluten-free instant ramen is instant ramen', () => {
  is('אטריות ראמן ללא גלוטן אורז מלא בטעם בקר להכנה מהירה 55 גרם', 'instant-ramen');
  is('אטריות ראמן אורז מלא 280 גר', 'noodles-rice');
  is('אטריות ראמן מוכנות 200גר', 'noodles');
  is('ערכה להכנת מרק ראמן נודלס בטעם עוף 140 ג', 'instant-ramen');
});

test('"מנת השף" is a line name: plain dry noodles under it are noodles', () => {
  is('אטריות דקות מנת השף וילי פוד 400 גר', 'noodles');
  is('מנת השף נודלס בטעם תירס וילי פוד 70 גרם', 'instant-noodles');
});

test('mac and cheese: the boxed meal is the leaf, Gad\'s grated mix and sauce are not', () => {
  is('ארוחת מקרוני עם רוטב גבינה Mac&Cheese', 'instant-mac-cheese');
  is('דודלס ארוחת אטריות עם גבינה 206 גרם', 'instant-mac-cheese');
  isNot('מק אנד צ\'יז מגורר', 'instant-mac-cheese');
  isNot('רוטב מק אנד צ\'יז 250 גר', 'instant-mac-cheese');
});

test('Spring and Prigat are brands: their juices are juices of their fruit', () => {
  gone('spring-fruit-drink');
  gone('prigat-juice');
  is('ספרינג אפרסק 1.5 ליטר', 'juice-mixed');
  is('ספרינג תפוזים 1.5 לי', 'juice-orange');
  is('ספרינג רימונים 1ל', 'juice-pomegranate');
  is('פריגת ענבים מרלו 1.5 ליט', 'juice-mixed');
  isNot('ספרינג tea אפרסק 1.5', 'juice-mixed');
  isNot('ספרינג  וודקה חמוציות', 'juice-mixed');
});

test('lemonade is not a tea, a dressing, a spoon or a frozen slush', () => {
  is('פריגת לימונענע 1.5 ליטר', 'soda-lemonade');
  is('מיץ לימונענע 400 מ"ל פרימור', 'soda-lemonade');
  isNot('רוטב לסלט עם לימון ונענע', 'soda-lemonade');
  isNot('לימונענע 25 שקיקים גן קסום', 'soda-lemonade');
  isNot('משקה לימונענע מרוכז קפוא פריגת 280 מ"ל', 'soda-lemonade');
});

test('Neviot: normalizeText drops "+", so a flavoured Neviot was still water - it is flavoured water', () => {
  is('נביעות 1.5 ליטר', 'water-still');
  is('נביעות + תפוח 1.5 ליטר פיקדון', 'water-flavored');
  is('נביעות פלוס אפרסק 1.5 ליטר', 'water-flavored');
  isNot('נביעות + אפרסק 1.5 ל', 'peach');
  is('אויאן מים מינרליים 1 ליטר', 'water-still'); // "ליימ" inside מינרליימ is not lime
});

test('sparkling water is read from מוגז, not from two brand names', () => {
  is('מים מינרליים מוגזים', 'water-sparkling');
  is('שישיית סאן פלגרינו 250 מ"ל', 'water-sparkling');
  is('סן בנדטו - מינרלים 500 מל', 'water-still');
  isNot('סן בנדטו בטעם גזר תפוח', 'water-sparkling');
});

test('chocolate milk is one leaf; Rivyon joins it; cocoa drink powder is read from "אבקת שוקו", not one brand', () => {
  gone('chocolate-milk');
  is('ריוויון תנובה 1 ליטר', 'chocolate-milk-drink');
  is('אבקת שוקו 850 גרם', 'chocolate-drink-powder');
  is('שוקולית 850 גרם', 'chocolate-drink-powder');
});

test('maker leaves are gone: Milka, Loacker, Ferrero', () => {
  gone('chocolate-bar-milka');
  gone('loacker-wafer');
  is('מילקה חלב ולבן 90 גרם', 'chocolate-bar-white');
  is('לואקר קלאסיק אגוז', 'wafers');
  isNot('לואקר מיניס אגוז 150', 'walnuts');
  is('פררו רושה 300 גר\'', 'ferrero-rocher');
  is('רושר 375 גרם', 'ferrero-rocher');
  isNot('פררו ביצת הפתעה שלשייה', 'ferrero-rocher');
  isNot('פררו-קינדר דליס עשיר', 'ferrero-rocher');
  is('פררו קולקשיין 172 גר', 'chocolate-gift-box');
});

test('a word that starts another word is not the product: carambola, Milkinis, "שוקולד עם עדשים"', () => {
  isNot('קרמבולה', 'krembo');
  isNot('אצבעות מילקיניס מילקה 87.5 גרם', 'milky-pudding');
  is('מילקי בטעם שוקולד 170 גרם', 'milky-pudding');
  is('עדשי שוקולד בצנצנת 280 גרם', 'chocolate-lentils');
  isNot('מילקה שוקולד חלב עם עדשים 90ג', 'chocolate-lentils');
  isNot('מילקה שוקולד חלב עם עדשים 90ג', 'lentils');
});

test('"&" is dropped by normalizeText: M&M is matched as "m m"', () => {
  is('M&M בוטנים 150 גרם', 'candy-mm');
  is('אם אנד אמס מיניס 135', 'candy-mm');
  isNot('M&M בוטנים 150 גרם', 'peanuts-roasted');
});

test('two products in one leaf are two leaves: meringue, ladyfingers, kadayif dough', () => {
  is('קצפיות מרנג וניל 180 גרם', 'meringue');
  isNot('קיצפיות אחוה 180 גרם', 'krembo');
  is('בישקוטים - אצבעות מאפה ספוג', 'ladyfingers');
  is('עוגיות ביסקוטי איטלקיות עם שקדים קנטוצ\'י', 'biscotti');
  is('שערות קדאיף 450 גר מזוואי', 'kadayif-dough');
  is('קדאיף עדן קינוחים 82 גרם', 'kadayif-dessert');
  isNot('אטריות קדאיף 400גר', 'noodles');
});

test('Osem "דובונים" is a potato snack, not gummy bears', () => {
  is('חטיף דובונים בטעם שמנת בצל', 'potato-chip-herrs-shaped');
  is('יוגטה גומי דובונים מבריק 150 גרם', 'candy-gummy-bears');
  isNot('דובונים חטיף תפוחי אדמה אסם 40 גרם', 'candy-gummy-bears');
});

test('Pesek Zman as a flavour of something else is that something else', () => {
  is('חטיף פסק זמן חלב מגדים 45 גר.', 'pesek-zman');
  is('פסק זמן אצבעות שוקולד חלב במילוי ופל וקרם קרמל מלוח', 'pesek-zman'); // "קרמל מלוח" is not "מ\"ל"
  isNot('נמס אייס פסק זמן 250 מ"ל', 'pesek-zman');
  isNot('ממרח פסק זמן 500 גר עלית', 'pesek-zman');
  is('מילקי טעם פסק זמן שטראוס 133 מ"ל', 'milky-pudding');
});

test('dairy desserts: a coffee drink or mochi flavoured tiramisu is not tiramisu; Pirassos labneh and tzatziki are not Pirassos cheese', () => {
  isNot('מאסטר קפה טירמיסו 240 מ"ל', 'tiramisu-dessert');
  isNot('לבנה פיראוס 9% 500מ"ל', 'cheese-pirassos-9');
  isNot('ציזיקי פיראוס 9% שומן 250 גרם', 'cheese-pirassos-9');
  is('חמד פיראוס 16% שומן 250 גרם', 'cheese-pirassos-16');
  isNot('סנסודין רפיד רליף מלבי75', 'malabi');
});

test('cream sauce and flavoured hard cheese are keyed on the product, not on "קלאסי" / "רוטב"', () => {
  is('רוטב שמנת יטבתה9% 259גר', 'cream-sauce-classic');
  isNot('רוטב שמנת עם פטריות 9%', 'cream-sauce-classic');
  is('גבינה קשה שום שחור 35%', 'hard-cheese-flavored');
  isNot('גבינה הולנדית חצי קשה עם פסטו ירוק', 'hard-cheese-flavored');
});

test('"החלב החדש" (Remilk) is not a flavoured cow-milk drink', () => {
  isNot('החלב החדש וניל פלוס', 'milk-drink-flavored');
});

test('household: toilet wipes, stovetop pads, eyebrow gel, a knife set and a cutlery set are not what their word suggests', () => {
  isNot('מגבוני טואלט לחים קידס 48*3 טאצ', 'cleaning-wipes');
  isNot('סקוטש ברייט כרית ניקוי לכיריים מזכוכית', 'glass-cleaner');
  isNot('מאיה K גל לעיצוב גבות', 'hair-styling-gel');
  isNot('לקיטשן סט 6 סכינים ידית צבעונית', 'disposable-cutlery');
  isNot('סט סכו"ם 16 חלקים כסף מבריק - URBAN', 'metal-polish');
  isNot('Be רצועות להסרת שיער50יח', 'hair-removal-cream');
  isNot('מגבונים לניקוי הפנים', 'face-wash');
  is('מסיר אבנית מקומקומים אנטי קאלק', 'descaler'); // kettle descalers were pushed out by the round
  is('אנטי קאלק נוזל לניקוי כללי סנו 2 ליטר', 'all-purpose-cleaner');
});

test('frozen berries: the copied 213-entry exclusion pile is gone, and "טחינה" no longer refuses a frozen strawberry', () => {
  assert.ok(conceptById('blueberry-frozen', concepts).match.none.length < 10);
  is('תות שדה קפוא - מתאים להכנת שייקים ולטחינה דקה בלבד', 'strawberry-frozen');
  isNot('תות שדה קפוא בציפוי שוקולד מריר 150 גרם', 'strawberry-frozen');
});

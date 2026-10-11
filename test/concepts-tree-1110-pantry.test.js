import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept, conceptById } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - pantry (שימורים) tree round, per Naor's instruction: cluster first, then build the
 * tree (tuna worked example: medium + cut identity axes, packaging/size/brand/manufacturer stay
 * attributes), one capture + one near-miss per new leaf. Names are real chain names from
 * data/prices/*\/catalog.full.json and data/products.json, not invented examples.
 *
 * Opus review 11.10 (same day, "סוננט מבצע, אופוס מפקח"): the form is the product and the flavour is a
 * kind - the four flavour soup leaves are gone (a 400 g "מרק עוף" jar IS bouillon-stock, the cup is
 * soup-instant); lemon-spread was preserved-lemon under another label; chocolate-hazelnut-spread duplicated
 * snacks' chocolate-spread; vegan-mayo-spread keyed on "בטעם מיונז", which is the legal label of light mayo,
 * not of vegan mayo - it is mayonnaise-vegan now. A maker is not a none word either: "ריו מרה" and "גיאה"
 * had blocked real cans. Measured in isolation (HEAD of every other file): 0 new conflicts, every name that
 * left a concept named in the round's review notes.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);
const gone = (id) => assert.equal(conceptById(id, concepts), null, `${id} should be gone`);
const family = (id) => conceptById(id, concepts)?.family?.id;

// --- tuna-canned: ready meals, spreads, pet food and deli-smoked whole fish leave the branch ----------

test('tuna-canned: the can itself, not a meal, salad, spread or pet product that merely contains tuna', () => {
  is('טונה בהירה בשמן זית 160 גר CALIPO', 'tuna-canned');
  is('נתחי טונה בהירה במי מלח רביעייה ויקטורי', 'tuna-canned');
  isNot("ארוחת מג'דרה עם טונה", 'tuna-canned');
  isNot('פסטה עם טונה עגבניות מיובשות וזיתים בשמן זית', 'tuna-canned');
  isNot('מיאו מיקס מעדן נתחי טונה וסלמון ברוטב 78 גרם', 'tuna-canned');
  isNot('הרמס דג טונה מעושן חם', 'tuna-canned');
  isNot('דג טונה צהובת סנפיר', 'tuna-canned');
});

test('tuna-canned: a maker is not a none word - Rio Mare and the 900 g catering can are tuna; their meals are not', () => {
  is('טונה בשמן זית ריו מרה 160 גרם', 'tuna-canned');
  is('ריו מרה טונה במים 160 גרם', 'tuna-canned');
  is('טונה פיש  900גר גיאה', 'tuna-canned');
  isNot('ריו מרה טונה עם שעוע', 'tuna-canned');
  isNot('ריו מרה טונה מקסיקני 160', 'tuna-canned');
  isNot('ירקות גינה עם טונה160גרם', 'tuna-canned');
  isNot('לקט ירקות ופתיתי טונה ברוטב 160גר', 'tuna-canned');
});

test('tuna-canned: a sliced fillet in olive oil is the canned fillet; a bare sliced fillet is the fresh fish', () => {
  is('עץ הזית פילה טונה פרוס ושמן זית 84 גר', 'tuna-canned');
  is('פילה טונה פרוס בשמן זית לימון פלפל 120 ג', 'tuna-canned');
  is('פילה טונה פרוס טרי', 'tuna-fish');
  isNot('פילה טונה פרוס בוואקום', 'tuna-canned');
});

test('tuna-spread: the spread is its own leaf in the canned aisle, not the can', () => {
  is('ממרח טונה סטארקיסט', 'tuna-spread');
  is('ממרח דג טונה המה 100 גר', 'tuna-spread');
  isNot('טונה בהירה בשמן', 'tuna-spread');
  assert.equal(conceptById('tuna-spread', concepts).category, 'שימורים');
});

test('דגים בשימורים: the canned-fish leaves share one family; fish sauce is not in it', () => {
  for (const id of ['tuna-canned', 'tuna-spread', 'sardines-canned', 'sprats-canned', 'saira-canned', 'salmon-canned', 'cod-liver-canned', 'mussels-canned-smoked'])
    assert.equal(family(id), 'fish-canned', `${id} family`);
  assert.notEqual(family('fish-sauce'), 'fish-canned');
});

test('olives / chickpeas-dry: a tuna can in olive oil is not olives, a tuna meal is not chickpeas', () => {
  is('ק.טונה ש.זית פחית 160 גרם', 'tuna-canned');
  isNot('טונה עם גרגירי חומוס160ג', 'chickpeas-dry');
  isNot('טונה עם גרגירי חומוס160ג', 'tuna-canned');
});

// --- soups: the form is the product (powder jar / instant cup / ready borscht), the flavour is a kind -----

test('bouillon-stock: "מרק עוף 400 גרם" is the same powder jar as "אבקת מרק עוף 400 גרם"', () => {
  gone('soup-chicken');
  gone('soup-mushroom');
  gone('soup-tomato');
  gone('soup-vegetable');
  is('מרק עוף אמיתי בשרי קנור 400 גר כשל"פ', 'bouillon-stock');
  is('אבקת מרק עוף אמיתי בשרי אסם 400 גרם', 'bouillon-stock');
  is('מרק פטריות קנור 400 גרם', 'bouillon-stock');
  is('מרק בצל קנור 400 גרם', 'bouillon-stock');
  isNot('מרק עשיר עוף אטריות 74 גרם כפרית קנור', 'bouillon-stock');
  isNot('זוג מרק נמס טעם עוף', 'bouillon-stock');
  isNot('היינץ- מרק עגבניות שמנת 400 גרם', 'bouillon-stock');
});

test('soup-instant: the cup soup, whatever its flavour; not cup noodles, not a disposable bowl, not soup nuts', () => {
  is('זוג מרק נמס טעם עוף', 'soup-instant');
  is('מרק נמס בכוס עגבניות וקרוטונים 56 ג קנור', 'soup-instant');
  is('זוג מרק נמס פטריות בדצ אסם', 'soup-instant');
  isNot('מרק עם נודלס טעם עוף מנת השף  70 גר', 'soup-instant');
  isNot("מרק כלנית ורוד -אר' 8", 'soup-instant');
  isNot('נמס בכוס טעם עוף ושקדי מרק 2*25 גרם קנור', 'soup-instant');
});

test('soup-borscht: borscht soup (Hebrew or transliterated), not a "כלנית" bowl; the three soups share "מרקים"', () => {
  is('מרק בורשט אורגני אאוגה 400 גרם', 'soup-borscht');
  is('מרק 500 מ"ל BORSH', 'soup-borscht');
  isNot("מרק כלנית לבן -אר' 8", 'soup-borscht');
  for (const id of ['bouillon-stock', 'soup-instant', 'soup-borscht']) assert.equal(family(id), 'soup', `${id} family`);
});

// --- spice-sumac: the spice, not the "Sumak" blush/rouge cosmetics brand (same word, different thing) --

test('spice-sumac: the spice needs spice evidence (jar, ground, grams, by weight); the blush has none', () => {
  is('סומק בצנצנת 100 גרם', 'spice-sumac');
  is('סומק טחון', 'spice-sumac');
  is('סומק במשקל', 'spice-sumac');
  isNot('סומק בלאש כתום גוון 03', 'spice-sumac');
  isNot('סומק קרמי במרקם מוס', 'spice-sumac');
  isNot('מייב סומק טינק 03', 'spice-sumac');
  isNot('סומק פנינים 30 גרם', 'spice-sumac');
  isNot('סומק 150 טרו מאץ', 'spice-sumac');
});

// --- spice-poppy-seed: "פרג" is also the Pereg brand, so only "זרעי פרג" / "פרג טחון|שלם|כחול" ------------

test('spice-poppy-seed: the seed, never a Pereg product or a poppy pastry', () => {
  is('פרג שלם 100 גרם', 'spice-poppy-seed');
  is('פרג טחון', 'spice-poppy-seed');
  is('כמון פרג 250 גרם', 'spice-cumin');
  isNot('פרג לימון בלאדי 250', 'spice-poppy-seed');
  isNot('מלית פרג', 'spice-poppy-seed');
  isNot('עוגת שמרים פרג 400 ג', 'spice-poppy-seed');
});

// --- seasoning-mix-* dish family: one leaf per dish, "תבלין"/"תיבול"/"תערובת" all spelled --------------

test('seasoning-mix-beef: beef rub, not the fish or chicken rub', () => {
  is('תבלין לבשר בקר מגיה', 'seasoning-mix-beef');
  isNot('תבלין לדג 100 גר', 'seasoning-mix-beef');
});

test('seasoning-mix-fish: "תיבול" / "תבלין" / "תערובת תיבול", singular or plural "דג"', () => {
  is('תבלין לדג 100 גר', 'seasoning-mix-fish');
  is('תיבול לדגים 50 גר', 'seasoning-mix-fish');
  is('תערובת תיבול לדגים 4', 'seasoning-mix-fish');
  is('תערובת תיבול לדג 80 גרם', 'seasoning-mix-fish');
  isNot('תבלין לבשר 30 גר', 'seasoning-mix-fish');
});

test('seasoning-mix-shawarma: shawarma rub in every phrasing, not steak rub and not the meat', () => {
  is('תבלין לשווארמה 110 ג', 'seasoning-mix-shawarma');
  is('תיבול צהוב לשווארמה', 'seasoning-mix-shawarma');
  is('תערובת לשווארמה טורקית  100 גרם', 'seasoning-mix-shawarma');
  isNot('תבלין לסטייק 120 גרם', 'seasoning-mix-shawarma');
  isNot('שווארמה עוף 1 קג', 'seasoning-mix-shawarma');
});

test('seasoning-mix-steak: steak rub, not shawarma rub', () => {
  is('תבלין לסטייק 120 גרם', 'seasoning-mix-steak');
  isNot('תבלין לשווארמה בצנצנת 100 גרם', 'seasoning-mix-steak');
});

test('seasoning-mix-chicken: chicken rub in either word order, and the "תערובת תיבול" phrasing too', () => {
  is('תבלין לעוף 100 גר', 'seasoning-mix-chicken');
  is('תבלין עוף בגריל', 'seasoning-mix-chicken');
  is('תערובת תיבול לעוף קרנבל טעמים', 'seasoning-mix-chicken');
  isNot('תבלין לבשר טחון 30 ג', 'seasoning-mix-chicken');
});

test('seasoning-mix-meatballs: every spelling of "for meatballs"', () => {
  is('תבלין לקציצות בצנצנת 100 גרם', 'seasoning-mix-meatballs');
  is('תערובת תיבול לקציצות', 'seasoning-mix-meatballs');
  isNot('תבלין לעוף 100 גר', 'seasoning-mix-meatballs');
});

test('seasoning-mix-rice: a seasoning packet added to rice, in the seasoning family, not the rice family', () => {
  gone('rice-seasoning-mix');
  is('תערובת לאורז מגדרה', 'seasoning-mix-rice');
  isNot('אורז בסמטי', 'seasoning-mix-rice');
  for (const id of ['seasoning-mix-rice', 'seasoning-mix-fish', 'seasoning-mix-chicken', 'seasoning-mix-meatballs']) assert.equal(family(id), 'seasoning', `${id} family`);
  is('תערובת חמשת תבלינים', 'spice-mix');
});

// --- pickled ----------------------------------------------------------------------------------------

test('pickled-vegetables-mix: jarred mixed pickled vegetables, not frozen veg or baby food', () => {
  is('ירקות מעורבים כבושים חתוכים בצנצנת מוטולה', 'pickled-vegetables-mix');
  is('ירקות חמוצים בטעם ביתי 500 גרם', 'pickled-vegetables-mix');
  isNot('לקט ירקות מעורבים סנפרוסט 800 גרם', 'pickled-vegetables-mix');
  isNot('מטרנה מחית מרק ירקות מעורבים', 'pickled-vegetables-mix');
});

test('cabbage-pickled: salted/pickled cabbage, not fresh cabbage or a cabbage salad; the pickled leaves share one family', () => {
  is('כרוב כבוש בית השיטה', 'cabbage-pickled');
  isNot('כרוב לבן טרי', 'cabbage-pickled');
  isNot('כרוב בולגרי כבוש 750 גר`מאמא מרי', 'cabbage-pickled');
  for (const id of ['cabbage-pickled', 'pickled-vegetables-mix', 'pickled-peppers', 'pickles']) assert.equal(family(id), 'pickled', `${id} family`);
});

// --- spreads ------------------------------------------------------------------------------------------

test('mayonnaise-vegan: vegan / egg-free mayo in any phrasing; "בטעם מיונז לייט" is the light-mayo label, not vegan', () => {
  gone('vegan-mayo-spread');
  is('מיונז טבעוני 260 גרם', 'mayonnaise-vegan');
  is('ממרח בטעם מיונז טבעוני אורגני 340 גרם', 'mayonnaise-vegan');
  is('ממרח מיונז אורגני ללא ביצים 230 גר השד', 'mayonnaise-vegan');
  isNot('ממרח בטעם מיונז לייט מאסטר שף 480 גרם', 'mayonnaise-vegan');
  is('מיונז הלמנס ממרח לחיץ לייט 405 גרם', 'mayonnaise');
});

test('coconut-based-spread: the vegan coconut-base spread, not a vegan butter-flavour spread', () => {
  is('ממרח בטעם טבעי על בסיס רכיבי קוקוס 9%', 'coconut-based-spread');
  is('ממרח עם שום שמיר על בסיס רכיבי קוקוס 9%', 'coconut-based-spread');
  isNot('משומשו ממרח בטעם חמאה על בסיס שמן קוקוס', 'coconut-based-spread');
});

test('preserved-lemon: "ממרח לימון בלאדי" is the same lemon paste as "ממרח לימון כבוש"; harissa-lemon is harissa', () => {
  gone('lemon-spread');
  is('ממרח לימון בלאדי 250ג בקבוק לחיץ', 'preserved-lemon');
  is('ממרח לימון כבוש 250 גרם', 'preserved-lemon');
  isNot('ממרח אריסה לימון', 'preserved-lemon');
});

test('chocolate-hazelnut-spread is gone: a nutella jar is snacks\' chocolate-spread, a Cremissimo is ice cream', () => {
  gone('chocolate-hazelnut-spread');
  isNot('קרמיסימו קולקשיין בטעמי פקאן, וניל צ\'יפ ואגוזי לוז', 'chocolate-spread');
});

// --- ptitim: the pasta product, not cheese shreds, cereal bits or a cup meal --------------------------

test('ptitim: the pasta product in every shape (couscous-shaped too), not cheese shreds or a yogurt topping', () => {
  is('פתיתים אפויים טבעות', 'ptitim');
  is('פתיתים בצורת קוסקוס', 'ptitim');
  is('פתיתים אפויים קוסקוס 500 גרם סוגת', 'ptitim');
  isNot('עמק פתיתים 200 גרם ת', 'ptitim');
  isNot('כפיר פיצרלה פתיתים בד"צ 500 גר', 'ptitim');
  isNot("יוגורט פרו 20 גרם חלבון עם פתיתים בציפוי שוקולד מריר דנונה 178 גרם", 'ptitim');
  isNot('תבשיל פתיתים אפויים עם ירקות 130 גרם', 'ptitim');
  isNot('פתיתים אפויים קוסקוס', 'couscous');
  is('קוסקוס 1 ק"ג שקדיה', 'couscous');
});

// --- aioli-sauce: every aioli flavour is aioli; the maker-keyed bread-spread still owns "עללחם" ----------

test('aioli-sauce: plain and flavoured aioli (pesto, tomato) are aioli', () => {
  is('איולי חלפיניו 270 גר', 'aioli-sauce');
  is('איולי פסטו 250 גרם', 'aioli-sauce');
  is('איולי עגבניות 295 גר', 'aioli-sauce');
  is('פסטו 180 גרם', 'pesto');
  isNot('עללחם רוטב איולי שום', 'aioli-sauce');
});

// --- spices: cloves (not fingernails - same Hebrew word), nutmeg, ground coriander ------------------------

test('spice-cloves: the spice jar, never a nail-care product - "ציפורן" means both clove and fingernail', () => {
  is('ציפורן טחון 40 גרם', 'spice-cloves');
  is('ציפורן שלם', 'spice-cloves');
  isNot('קרם ידיים וציפורניים', 'spice-cloves');
  isNot('קוצץ ציפורניים', 'spice-cloves');
});

test('spice-nutmeg: nutmeg, not plain walnuts', () => {
  is('אגוז מוסקט טחון', 'spice-nutmeg');
  isNot('אגוזי מלך', 'spice-nutmeg');
});

test('spice-coriander-ground: ground coriander, not fresh cilantro', () => {
  is('כוסברה טחונה 80 גר', 'spice-coriander-ground');
  isNot('כוסברה ירוקה תבליני מימון 30 גרם', 'spice-coriander-ground');
});

// --- flours and grains: durum (pasta flour) vs plain flour; whole wheat berries vs beer, bread, puffed wheat --

test('flour-durum: durum/semolina pasta flour (Hebrew or Italian spelling), deferred from plain flour', () => {
  is('קמח דורום 1 ק"ג', 'flour-durum');
  is('קמח סמולינה דורום קאפוטו', 'flour-durum');
  isNot('קמח לבן', 'flour-durum');
});

test('wheat-whole-grain: whole wheat berries sold bare, not a wheat beer, a whole-wheat loaf or puffed wheat', () => {
  is('חיטה 1 ק"ג המושבה', 'wheat-whole-grain');
  isNot('פסטה ספגטי חיטה מלאה 500 גרם', 'wheat-whole-grain');
  isNot('טורטיה חיטה מלאה', 'wheat-whole-grain');
  isNot('חיטה תפוחה עם דבש 400 גר(שלווה)', 'wheat-whole-grain');
  isNot('חיטה פחית בודד 500 מל קרומבאכר', 'wheat-whole-grain');
  isNot('חיטה מלאה אנגל 750 ג', 'wheat-whole-grain');
});

// --- fried-onion-crispy: the crispy topping, not frozen sauteed onion, onion rings or a dish ---------------

test('fried-onion-crispy: the crispy topping itself, not frozen fried onion, onion rings or a dish that contains it', () => {
  is('שבבי בצל מטוגן 200 גר', 'fried-onion-crispy');
  is('שבבי בצל קירקלנד 335', 'fried-onion-crispy');
  isNot('דורות בצל מטוגן 400 גר', 'fried-onion-crispy');
  isNot('בצל מטוגן קפוא יוחאי ביטון 250 גרם', 'fried-onion-crispy');
  isNot('טוגני בצל בציפוי בלילה ופירורי לחם מטוגנות ומוקפאו', 'fried-onion-crispy');
  isNot('קנור פירה עם בצל מטוגן 120 גר', 'fried-onion-crispy');
  isNot('חומוס עם בצל מטוגן 380 גרם', 'fried-onion-crispy');
});

// --- corn / peas widenings: "מתוק" and "שימור" yes; snacks, seeds, fresh cobs, dried and frozen peas no -----

test('corn-canned: "תירס מתוק" cans join; corn-ball snacks, planting seeds and fresh packed cobs do not', () => {
  is('תירס מתוק 340 גר', 'corn-canned');
  is('פרי מבורך תירס מתוק 335 גרם', 'corn-canned');
  isNot('עלית כדורי תירס מתוק 45 גרם', 'corn-canned');
  isNot('תפיחוני תירס מתוקים 150 גר שלוה', 'corn-canned');
  isNot('זרעי תירס סופר מתוק צהוב', 'corn-canned');
  isNot('תירס לבן מתוק', 'corn-canned');
  isNot('תירס ארוז', 'corn-canned');
});

test('peas-canned: a can says so (שימורי / מהשדה / פחית / קופסה); bare "אפונה ירוקה" is dried or frozen', () => {
  is('שימורי אפונה ירוקה סוגת 420 גרם', 'peas-canned');
  is('אפונה עדינה מהשדה', 'peas-canned');
  isNot('אפונה ירוקה 1 ק"ג שורש', 'peas-canned');
  isNot('אפונה ירוקה טבעפרוסט 800 גר', 'peas-canned');
  isNot('סנאפי חטיפי אפונה ירוקה פריכים טבעי 108ג', 'peas-canned');
  isNot('אפונה מטוגנת בקופסא 200', 'peas-canned');
});

// --- baking extracts: flavourIsIdentity survives "בטעם X", one leaf per flavour ----------------------------

test('baking-extract-almond: almond extract, not rum extract', () => {
  is('תמצית אפיה בטעם שקדים', 'baking-extract-almond');
  isNot('תמצית אפיה בטעם רום', 'baking-extract-almond');
});

test('baking-extract-rum: rum extract, not almond extract', () => {
  is('תמצית בטעם רום 50 מ"ל', 'baking-extract-rum');
  isNot('תמצית אפיה שקדים', 'baking-extract-rum');
});

// --- canned/jarred fish: saira (real spelling), fish liver, smoked mussels --------------------------------

test('saira-canned: canned saira ("סאיירה" with the extra alef), not the "סיירה" tequila brand', () => {
  is('שימורי דג סאיירה במי', 'saira-canned');
  is('סאיירה בשמן צמחי 425', 'saira-canned');
  isNot('טקילה סיירה סילבר 700 מ"ל', 'saira-canned');
});

test('cod-liver-canned: canned fish liver, not canned beef/chicken liver', () => {
  is('שימורי כבד דג שיבוט 120 גרם ISLAND', 'cod-liver-canned');
  isNot('כבד דג פורל בשמן זית 220 גר', 'cod-liver-canned');
});

test('mussels-canned-smoked: smoked canned mussels', () => {
  is('שימורי מולים מעושנים', 'mussels-canned-smoked');
  isNot('מולים טריים', 'mussels-canned-smoked');
});

// --- widened existing leaves: catch a real spelling the chains use, without over-reaching --------------

test('garlic-powder: the "אבקה" spelling (without the ת) also counts as garlic powder', () => {
  is('תבלין שום אבקה 90 גר', 'garlic-powder');
  isNot('תבלין שום ועשבי תיבול 200 מ"ל', 'garlic-powder');
});

test('zucchini-spread: "מחית" counts as a spread word too, not only "ממרח"', () => {
  is('מחית קישואים עם גזר ושום 350 גר', 'zucchini-spread');
  isNot('זרעי קישוא זוקיני', 'zucchini-spread');
});

test('chickpeas-dry: the Shoresh "חומוס גדול" big-chickpeas line, not the Sabra-style prepared dip', () => {
  is('חומוס גדול 500 גרם שורש', 'chickpeas-dry');
  isNot('חומוס גדול 500 גרם', 'chickpeas-dry');
});

test('pasta-other: Barilla shape names (Girandole, Tortiglioni, Spaghettoni...) are still just pasta, the maker is not the product', () => {
  is('ברילה גירנדולה 500גרם', 'pasta-other');
  is('ברילה טורטליוני 500 גרם', 'pasta-other');
});

test('pasta-sauce-tomato: Arrabbiata/Pomodoro are tomato sauce, but Alfredo/rosé cream sauces are not', () => {
  is('ברילה רוטב ארביאטה 400 גרם', 'pasta-sauce-tomato');
  isNot('רוטב לפסטה רוזה', 'pasta-sauce-tomato');
  isNot('רוטב אלפרדו גרנה פדנו', 'pasta-sauce-tomato');
});

test('cereal-honey-bunches: the "האני בנץ" spelling without the inner alef is the same cereal', () => {
  is('דגני בוקר האני בנץ', 'cereal-honey-bunches');
  is("דגני בוקר האני באנצ'", 'cereal-honey-bunches');
});

test('rice-white / oats-rolled: Materna baby cereal ("דייסת") is not plain rice or oats', () => {
  isNot('דייסת אורז מטרנה 200', 'rice-white');
  isNot('דייסת שיבולת שועל 200 גר', 'oats-rolled');
});

test('spice-black-pepper: ground black pepper, not Boursin pepper-flavoured cheese', () => {
  is('פלפל שחור טחון', 'spice-black-pepper');
  isNot('גבינת בורסאן פלפל שחור 150 גרם', 'spice-black-pepper');
});

// --- guards other department reviews asked for (snacks / bakery rounds 11.10) -----------------------------

test('dates: a ma\'amoul or a "תמר" kaak is a pastry, the fruit is still dates', () => {
  is("תמר מג'הול", 'dates');
  isNot('מעמול תמרים 300 גרם', 'dates');
  isNot('כעכים מרוקאי "תמר"', 'dates');
});

test('sesame-seeds / yeast: a rugelach is a pastry, not its topping or its leavening', () => {
  is('שומשום מלא אורגני 300 גר', 'sesame-seeds');
  is('שמרים יבשים 100 גרם שמרית', 'yeast');
  isNot('רוגלך שומשום 400 גרם', 'sesame-seeds');
  isNot('רוגלך שמרים שוקולד 400 ג', 'yeast');
});

test('flour-spelt: a petit-beurre made of spelt flour is a biscuit, the flour is still flour', () => {
  is('קמח כוסמין מלא  1 ק"ג', 'flour-spelt');
  isNot('פתי בר קמח כוסמין 400 גר', 'flour-spelt');
});

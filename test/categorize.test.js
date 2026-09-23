import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, CATEGORIES } from '../src/catalog/categorize.js';
import { categoryLabels, displayNames, displayName } from '../src/catalog/categoryLabels.js';
import { conceptFiles, CONCEPTS_DIR, INDEX_FILE } from '../src/catalog/concepts.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Every name below is copied verbatim from data/products.json (including chain truncation and typos) so the
// test tracks real catalog failure modes, not idealized ones. The department each one belongs to is defined in
// docs/CATEGORIES.md; these cases are the ones the keyword fallback gets wrong when a rule is written loosely.
// The fallback is what classifies a product that appeared after the per-product review, so it is tested with
// no id: with an id, config/categories/labels.json decides and the rules never run.

test('categorize: the reviewed label wins over both the concept and the keywords', () => {
  const labels = categoryLabels();
  assert.ok(labels.size > 7000, `expected the whole catalog to be reviewed, got ${labels.size} labels`);
  for (const [id, { category }] of labels) {
    assert.ok(CATEGORIES.includes(category), `${id}: "${category}" is not one of the catalog departments`);
  }
  // A label is taken even when the name alone would say something else.
  const [someId] = [...labels.keys()];
  assert.equal(categorize('שם שלא אומר כלום', null, someId), labels.get(someId).category);
  assert.equal(categorize('שם שלא אומר כלום', null, 'g-no-such-product'), 'כללי');
});

test('categorize: the form of the product decides, never the flavour (the two cases the catalog was wrong on)', () => {
  // Raspberry *syrup* is a drink, not fruit - reported from the UI, where it sat in ירקות ופירות.
  assert.equal(categorize('סירופ בטעם פטל יכין'), 'משקאות');
  assert.equal(categorize('ויטמינצ\'יק פטל 1 ליטר'), 'משקאות');
  // Instant pudding *powder* is a pantry mix, not a dairy dessert - it sat in חלב וביצים.
  assert.equal(categorize('אסם פודינג אינסטנ'), 'שימורים');
  assert.equal(categorize('אינסטנט פודינג בטעם וניל צרפתי אסם 80 גרם'), 'שימורים');
  assert.equal(categorize('אבקה להכנת ג\'לי בטעם פטל אסם 85 גרם'), 'שימורים');
  // ...while the ready-to-eat dessert in a cup stays dairy.
  assert.equal(categorize('מעדן פודינג שוקולד 4 יחידות'), 'חלב וביצים');
});

test('categorize: coffee, tea and every other drink are משקאות, not pantry', () => {
  assert.equal(categorize('10קפסולות קפה עוצמה 10'), 'משקאות');
  assert.equal(categorize('קפה נמס עלית 200 גרם'), 'משקאות');
  assert.equal(categorize('תה ויסוצקי 1.5 קלאסי'), 'משקאות');
  assert.equal(categorize('צאי מסאלה 20שק תה הברון'), 'משקאות');
  // A milk-based drink belongs with the dairy it is made of (docs/CATEGORIES.md "הכרעות שחוזרות").
  assert.equal(categorize('משקה חלב בטעם בננה יטבתה 1 ליטר'), 'חלב וביצים');
  assert.equal(categorize('משקה יוגורט 1.5% בטעם בננה אפרסק יופלה 250 מ"ל'), 'חלב וביצים');
});

test('categorize: a sweet keeps its department when it names milk, and dairy keeps its own', () => {
  assert.equal(categorize('אצבעות שוקולד קינדר'), 'חטיפים וממתקים');
  assert.equal(categorize('בפלות שוקולד 200 גרם'), 'חטיפים וממתקים');
  assert.equal(categorize('אסם עוגיות שוקוצ\'יפס'), 'חטיפים וממתקים');
  assert.equal(categorize('גלידה קרמיסימו סרבט תות לימון 650 גרם'), 'חטיפים וממתקים');
  assert.equal(categorize('חלב תנובה 3% 1 ליטר'), 'חלב וביצים');
  assert.equal(categorize('גבינת חלומי 24% מחלב בקר 200 גר גד'), 'חלב וביצים');
  assert.equal(categorize('יוגורט תות 3% מולר 150 גרם'), 'חלב וביצים');
});

test('categorize: frozen goes to מעדנייה, except dough, ice cream and raw meat', () => {
  assert.equal(categorize('אפונה ירוקה מוקפאת 800ג'), 'מעדנייה');
  assert.equal(categorize('כרוב ניצנים סנפרוסט'), 'מעדנייה');
  assert.equal(categorize('גולד ציפס זיג זג 1.5 קג קפוא'), 'מעדנייה');
  assert.equal(categorize('בצק עלים קפוא 500 גרם'), 'מאפים ולחם');
  assert.equal(categorize('פיצה איטלקית דקה 320 גרם', 'frozen-pizza-ready'), 'מאפים ולחם');
  assert.equal(categorize('פילה סלמון קפוא 400 גרם'), 'בשר ועוף');
});

test('categorize: the deli counter takes the cured and smoked, raw meat stays בשר ועוף', () => {
  assert.equal(categorize('פסטרמה בסגנון רומני300ג'), 'מעדנייה');
  assert.equal(categorize('קבנוס צ\'ילי חריף 125 גרם'), 'מעדנייה');
  assert.equal(categorize('נקניקיות עוף 1 ק"ג'), 'מעדנייה');
  assert.equal(categorize('פילה סלמון מעושן פרו'), 'מעדנייה');
  assert.equal(categorize('שניצל עוף 700 גרם מאמו'), 'בשר ועוף');
  assert.equal(categorize('בשר בקר טחון טרי'), 'בשר ועוף');
  // canned fish is a pantry item, not the fish counter
  assert.equal(categorize('נתחי טונה בהירה במי מלח וילי פוד 4 * 160 גרם'), 'שימורים');
});

test('categorize: disposables and household paper are ניקיון וטואלטיקה, not כללי', () => {
  assert.equal(categorize('קשיות מנייר 6" 100 יחידו'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('קעריות מרק BASIC'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('צלחות מנה עיקרית BASIC'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('9תב.אלומי מלבניות שופרסל'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('15 שקיות זיפר להקפאה'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('סנו JAVEL אקונומיקה בריח לימון'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('קרפור מלח למדיח כלים'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('מרכך כביסה מקסימה בייבי בתוספת תמצית שיבולת שועל'), 'ניקיון וטואלטיקה');
});

test('categorize: the baby aisle and pet food are departments of their own (23.9)', () => {
  assert.equal(categorize('תרכובת מזון לתינוק מטרנה חלבי שלב 1 700 גרם'), 'תינוקות');
  assert.equal(categorize('חיתולים פרידום דריי 6-10 קילו שלב 3 האגיס 46 יחידות'), 'תינוקות');
  assert.equal(categorize('קמיל בלו שמפו לתינוק סנסיטיב אל דמע ד"ר פישר 1 ליטר'), 'תינוקות');
  assert.equal(categorize('מגבונים לחים בייבי ללא בישום רמי לוי 4 * 72 יחידות'), 'תינוקות');
  assert.equal(categorize('פריפלצת אגס גזר דלעת 120'), 'תינוקות');
  assert.equal(categorize('פריסקיז מזון יבש לחתול בטעם נתחי ברביקיו'), 'בעלי חיים');
  assert.equal(categorize('דוגלי בוגר עוף 3 ק"ג'), 'בעלי חיים');
  // Baby-scented household products are still household; a cheese brand with a cat in its name is cheese.
  assert.equal(categorize('בדין אקסטרה פלוס בייבי כחול 960 מ"ל'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('מגבוני רצפה -רמי לוי'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('צמרוני עץ רמי לוי 300 יח'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('פחמים פרמיום רמי לוי 4 ק"ג'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('דאב דאודורנט ספריי טלקו 150 מל'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('החתול המחייך גבינה מותכת 14% מון בלאן 120 גרם'), 'חלב וביצים');
  assert.equal(categorize('גבינת בייבי בל 100 ג'), 'חלב וביצים');
});

test('categorize: housewares go to בית וכלים, cleaning tools stay household, health items go to פארם ותוספים (23.9)', () => {
  assert.equal(categorize('סט 3 מזלגות נירוסטה'), 'בית וכלים');
  assert.equal(categorize('מטען קיר USB כפול לבן- רמי לוי'), 'בית וכלים');
  assert.equal(categorize('צידנית מתקפלת איכותית רמי לוי'), 'בית וכלים');
  assert.equal(categorize('מזרן קפיצים אורטופדי160'), 'בית וכלים');
  assert.equal(categorize('מנגל פחמים מהודר ברזילאי'), 'בית וכלים');
  assert.equal(categorize('דלי פיה סופר 12 ליטר'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('פחמים 2 ק"ג רמי לוי'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('משקפי קריאה 1.5+ שלישיה'), 'פארם ותוספים');
  assert.equal(categorize('BE מד לחץ דם אוטומטי יחי'), 'פארם ותוספים');
  assert.equal(categorize('סט 3 נשכנים'), 'תינוקות');
  // a food name that carries a houseware word is still food (the home rule runs after the food rules)
  assert.equal(categorize("קציצות עוף ישרל'ה סיר 600 גרם עוף טוב"), 'בשר ועוף');
  assert.equal(categorize('עוגת שיש 500 גרם'), 'מאפים ולחם');
});

test('categorize: the cosmetics counter is טיפוח ויופי (moved there 23.9, was ניקיון וטואלטיקה), and coupon rows are not products', () => {
  // Measured on a build with no chain threshold: cosmetics was the single largest group left in כללי -
  // 210 rows saying אדפ, 206 עפרון, 165 סרום, 121 שפתיים, 96 מסקרה - none of which the rules knew. First
  // routed to ניקיון וטואלטיקה (396c1ef); moved the same day to the new טיפוח ויופי department once it
  // opened, per the boundary "what a person puts on themselves to look a certain way".
  for (const n of ['1מיליון רויאל אדפ ג.100מ', '24 קראט אדט 75 מ"ל', 'בנפיט עפרון גבות 03', 'באלם לחות לשפתיים 28',
    '10N צבע לשיער נטורטינט', 'וונדר סנאץ פודרה', 'אידול מסקרה גוון חום', 'אינישיאליסט סרום לשיער', 'גלוס הוט האני 7']) {
    assert.equal(categorize(n), 'טיפוח ויופי', n);
  }
  // and the words must not reach through to food: a cake is a cake and a blond beer is a drink
  assert.equal(categorize('עוגת קרם וניל'), 'מאפים ולחם');
  assert.equal(categorize('בירה בלונד 500 מל'), 'משקאות');
});

test('categorize: a keyword must not fire from inside another word', () => {
  // "דג" (fish) inside "דגני" (cereal), "בקר" (cattle) inside "בקרדי" (Bacardi), "קשיו" (cashew) inside
  // "קשיות" (straws), "דאו" (the Dove line) inside "דאווט" (a rice brand), "גל" inside "גלידה".
  assert.equal(categorize('דגני בוקר בטעם פירות 375'), 'שימורים');
  assert.equal(categorize('בקרדי בריזר אננס 275'), 'משקאות');
  assert.equal(categorize('קשיו קלוי מומלח אורג'), 'חטיפים וממתקים');
  assert.equal(categorize('אורז בסמטי דאווט 1 ק'), 'שימורים');
  // "נקטר" (nectar, a drink) sits inside "נקטרינה" (nectarine, fresh fruit) - it silenced the whole fruit.
  assert.equal(categorize('נקטרינה', 'nectarine'), 'ירקות ופירות');
  assert.equal(categorize('נקטר אפרסק 1 ליטר'), 'משקאות');
  assert.equal(categorize('גלידה ונילה 1 ליטר'), 'חטיפים וממתקים');
  assert.equal(categorize('זוג סוללות אלקליין C רמי לוי'), 'ניקיון וטואלטיקה');
});

test('categorize: produce is fresh only; a processed form of the same word is not', () => {
  assert.equal(categorize('עגבניות', 'tomato'), 'ירקות ופירות');
  assert.equal(categorize('מלפפון', 'cucumber'), 'ירקות ופירות');
  assert.equal(categorize('אבוקדו בשל יח'), 'ירקות ופירות');
  assert.equal(categorize('עגבניות חתוכות קוביות בלה איטליה 3*400 גרם', 'tomato'), 'שימורים');
  assert.equal(categorize('מלפפון בחומץ 13-17 ב', 'pickles'), 'שימורים');
  assert.equal(categorize('טרו ריבת תות 250 גרם', 'strawberry-fresh'), 'שימורים');
  // a face mask, not fresh cucumber - moved to טיפוח ויופי 23.9 (was ניקיון וטואלטיקה before that department opened)
  assert.equal(categorize('מסכת מלפפון ותה ירוק400מ', 'cucumber'), 'טיפוח ויופי');
  assert.equal(categorize("אג'קס נוזל לניקוי כללי ורצפות בניחוח לימון", 'lemon-fresh'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('עוגת מאפין תפוז 500גרם', 'orange-fresh'), 'מאפים ולחם');
});

test('categorize: an unknown name falls through to כללי, and an unknown concept id is ignored', () => {
  assert.equal(categorize('דבר לא מוכר'), 'כללי');
  assert.equal(categorize('דבר לא מוכר', 'no-such-concept-id'), 'כללי');
  assert.equal(categorize('חלב תנובה בקרטון 1%', 'no-such-concept-id'), 'חלב וביצים');
  assert.equal(categorize('חלב תנובה בקרטון 1%', 'milk-1'), 'חלב וביצים');
});

test('config/concepts/index.json lists exactly the concept files on disk', () => {
  // The API reads config/ over HTTP, where there is no readdir: a concept file missing from this index does
  // not exist in production, and its concepts look like substitutes that quietly disappeared.
  const index = JSON.parse(readFileSync(path.join(CONCEPTS_DIR, INDEX_FILE), 'utf8'));
  assert.deepEqual(index.files, conceptFiles(), 'run `node scripts/build-products.mjs` to refresh the index');
});

// The flavour-position check ("no new concept takes a product whose name says its word is a flavour") used to
// be a ratchet test here, reading the published data. On 22.9 a single new olive product at one chain took it
// from 1 to 2, and because the runner publishes nothing when npm test is red, four runs that had recovered
// Carrefour, Yeinot Bitan, Quik and Victory published nothing. A quality metric must not cancel the day's
// publish: scripts/build-products.mjs now prints it as a warn: line in the run report, and the review that
// clears or fixes it stays with the categories session (node scripts/category-labels.mjs --concept-health).

test('a vegetable under a prepared-salad brand is a salad', () => {
  // "כרוב אדום צבר 400 גר" is red cabbage in mayonnaise (barcode 7290106577541, confirmed on osem-nestle):
  // the name says only the vegetable, and the brand is what says what it is.
  assert.equal(categorize('כרוב אדום צבר 400 גר'), 'מעדנייה');
  assert.equal(categorize('חציל על האש במיונז צבר'), 'מעדנייה');
  assert.equal(categorize('כרוב אדום רמי לוי מהדרין'), 'ירקות ופירות');
  assert.equal(categorize('כרוב'), 'ירקות ופירות');
});

// ---------------------------------------------------------------------------
// 23.9, later the same day: the 3-chain threshold was removed (9,238 -> 48,069 products) and ~7,977 of them
// fell into כללי. Two departments opened (CATEGORIES 13 -> 15, טיפוח ויופי and פארם ותוספים) and the existing
// 13 gained keyword coverage for the food tail and the non-food clusters still worth routing. Every test below
// pairs a real capture with a real near-miss copied verbatim from data/prices/<chain>/catalog.full.json, the
// same convention as the rest of this file.

test('CATEGORIES is 15 departments: the ten of 20.9, the three of 23.9 morning, and the two of 23.9 afternoon', () => {
  assert.equal(CATEGORIES.length, 15);
  assert.ok(CATEGORIES.includes('טיפוח ויופי'));
  assert.ok(CATEGORIES.includes('פארם ותוספים'));
});

test('categorize: טיפוח ויופי takes perfume, makeup, nail products, hair colour/styling, skincare and contact lenses - never shampoo/soap/toothpaste/deodorant/razors, which stay ניקיון וטואלטיקה ("shampoo stays with soap", 23.9)', () => {
  assert.equal(categorize('1מיליון רויאל אדפ ג.100מ'), 'טיפוח ויופי'); // perfume (eau de parfum)
  assert.equal(categorize('פלטת צלליות 6יחידות'), 'טיפוח ויופי'); // eyeshadow palette
  assert.equal(categorize('ליפסטיק קרמי - 902'), 'טיפוח ויופי'); // lipstick
  assert.equal(categorize('עפרון עיניים 04'), 'טיפוח ויופי'); // eye pencil
  assert.equal(categorize('10N צבע לשיער נטורטינט'), 'טיפוח ויופי'); // hair colour
  assert.equal(categorize('קרם לילה 50 מ"ל'), 'טיפוח ויופי'); // night cream (skincare)
  assert.equal(categorize('עדשות צבעוניות חודשיות'), 'טיפוח ויופי'); // monthly colour contact lenses
  assert.equal(categorize('מויסט עדשות -3.25'), 'טיפוח ויופי'); // contact lens solution, by power
  // near-misses: still restocking, not treating yourself - the toiletries department
  assert.equal(categorize('קמיל בלו שמפו לתינוק סנסיטיב אל דמע ד"ר פישר 1 ליטר'), 'תינוקות'); // shampoo (baby aisle here)
  assert.equal(categorize('דאב דאודורנט ספריי טלקו 150 מל'), 'ניקיון וטואלטיקה'); // deodorant
  assert.equal(categorize('משחת שיניים קולגייט'), 'ניקיון וטואלטיקה'); // toothpaste
});

test('categorize: פארם ותוספים takes vitamins, supplements, plasters/bandages and home medical devices, moved out of ניקיון וטואלטיקה (23.9)', () => {
  assert.equal(categorize('ויטמין סי + די + אבץ 100 כמוסות'), 'פארם ותוספים'); // vitamin capsules
  assert.equal(categorize('100 סולגאר ויטמין C-1000'), 'פארם ותוספים'); // Solgar brand
  assert.equal(categorize('אלפא ליפואית 600 מג (30) בדצ אלטמן'), 'פארם ותוספים'); // Altman brand
  assert.equal(categorize('BE מד לחץ דם אוטומטי יחי'), 'פארם ותוספים'); // blood pressure monitor
  assert.equal(categorize('משקפי קריאה 1.5+ שלישיה'), 'פארם ותוספים'); // reading glasses
  assert.equal(categorize('בקבוק מים חמים PVC+כיסוי'), 'פארם ותוספים'); // hot water bottle (home medical device)
  // near-miss: a plaster is now פארם, not ניקיון - but the surrounding toiletries words still are
  assert.equal(categorize('סבון בניחוח לימון'), 'ניקיון וטואלטיקה');
});

test('categorize: alcohol styles missing from the drinks rule (cognac, vermouth, sangria, kvass, aperitif, ouzo, château/Rioja wine, brandy) are משקאות (23.9)', () => {
  assert.equal(categorize('קוניאק דיאו 700 מ"ל VS'), 'משקאות');
  assert.equal(categorize('וורמוט מרטיני אדום מתוק 750 מ"ל'), 'משקאות');
  assert.equal(categorize('סנגריה 3 ליטר בקרטון +ברז'), 'משקאות');
  assert.equal(categorize('קוואס טאראס 1.5 ל'), 'משקאות');
  assert.equal(categorize('אפריטיף לילה בלאן לבן 750 מ"ל'), 'משקאות');
  assert.equal(categorize('אוזו פלומארי 700 מארז כוסות כשר'), 'משקאות'); // sold with a set of glasses - still the ouzo, not the cups
  assert.equal(categorize('שאטו לאטור קומבלאנה קוט דה בורדו 750 מל'), 'משקאות');
  assert.equal(categorize('אוגרטה ריוחה קוסצה 2012 750 מל'), 'משקאות');
  assert.equal(categorize('ברנדי 10 שנים 750 מ"ל'), 'משקאות');
});

test('categorize: fresh produce words missing from the list (blueberry, apricot, sprouts, broccoli, asparagus, leek, cherry) resolve to ירקות ופירות, but not a seed packet, a makeup shade, a cereal or a supplement extract carrying the same word (23.9)', () => {
  assert.equal(categorize('אוכמניות 125 גרם'), 'ירקות ופירות');
  assert.equal(categorize('משמש אוזבקי במשקל'), 'ירקות ופירות');
  assert.equal(categorize('מיקס נבטים'), 'ירקות ופירות');
  assert.equal(categorize('ברוקולי ארוז'), 'ירקות ופירות');
  assert.equal(categorize('אספרגוס ארוז'), 'ירקות ופירות');
  assert.equal(categorize('כרישה'), 'ירקות ופירות');
  assert.equal(categorize('דובדבן אדום טרי ארוז 250 גר` בראשית'), 'ירקות ופירות');
  // near-misses copied verbatim from the real catalog (23.9 measurement)
  assert.equal(categorize('זרעי ברוקולי לנבטים'), 'שימורים'); // seeds for planting/sprouting, not the vegetable
  // a blush shade named "cherry" - "בלאש" blocks the new דובדבן produce match; it still lands on the
  // pre-existing (and pre-existing-buggy) "סומק" pantry-spice keyword rather than staying unclassified, which
  // is outside this fix's scope - the point of this assertion is only that it must not become fresh fruit.
  assert.equal(categorize('סומק בלאש דובדבן גוון 01'), 'שימורים');
  assert.equal(categorize('פתיתי 5 דגנים עם משמש 200 גרם'), 'שימורים'); // a cereal flake, apricot is the flavour
  // a supplement extract, not fresh fruit - "תמצית" (added to the shared PROCESSED guard) blocks the produce
  // match; it lands on the pre-existing pantry "תמצית" keyword rather than פארם ותוספים, since "60כמ" here is
  // truncated short of the full "כמוסות" word the pharmacy rule matches on.
  assert.equal(categorize('תמצית אוכמניות SFP 60כמ'), 'שימורים');
  assert.equal(categorize('אסקימו אבטיח 80 גרם'), 'כללי'); // a popsicle brand, not fresh watermelon - stays כללי (no snack rule word)
  assert.equal(categorize('אנטון ברג-מרציפן תות שדה ושמפניה 220 גר'), 'כללי'); // marzipan chocolate, not fresh strawberry
});

test('categorize: cheese sold under its type name (Camembert, Gorgonzola, Philadelphia) is חלב וביצים, but the same word as a snack-cracker flavour is not (23.9)', () => {
  assert.equal(categorize('קממבר רגיל 140 גר'), 'חלב וביצים');
  assert.equal(categorize('גורגונזולה דולצה 150 גרם'), 'חלב וביצים');
  assert.equal(categorize('פילדלפיה'), 'חלב וביצים');
  // "צדר" (cheddar) was tried and rejected as a keyword (docs/CATEGORIES.md) precisely because of near-misses
  // like this one - a snack cracker flavoured cheddar-bacon, not a wedge of cheese:
  assert.equal(categorize('טופזלס שברי פרצל בטעם בייקון צדר 100 גרם'), 'כללי');
});

test('categorize: another prepared-salad brand (חסלט), a frozen-vegetable brand (טבעפרוסט) and cooked shrimp are מעדנייה, matching the existing צבר/אחלה/סנפרוסט precedent (23.9)', () => {
  assert.equal(categorize('ברוקולי חסלט'), 'מעדנייה'); // dressed/seasoned vegetable under the חסלט brand, not the plain vegetable
  assert.equal(categorize('גזר גמדי טבעפרוסט 800 גר'), 'מעדנייה'); // frozen, same "-פרוסט" pattern as סנפרוסט
  assert.equal(categorize('שרימפס מבושל 1 קג קפ'), 'מעדנייה'); // cooked shrimp, always sold prepared/frozen in this catalog
  // near-miss: the plain fresh vegetable, no brand, stays produce
  assert.equal(categorize('ברוקולי ארוז'), 'ירקות ופירות');
});

test('categorize: canned hearts of palm, schug, salsa and a fried-onion topping are שימורים (23.9)', () => {
  assert.equal(categorize('לבבות דקל שלמים 400ג רמילוי'), 'שימורים');
  assert.equal(categorize('סחוג אדום 150 גרם'), 'שימורים');
  assert.equal(categorize('סלסה עם צאדר 290 גר פוקו לוקו'), 'שימורים');
  assert.equal(categorize('שבבי בצל מטוגן 200 גר'), 'שימורים');
});

test('categorize: reusable/festive tableware and stationery are בית וכלים - the "disposables and kitchenware" cluster (23.9) - but a tray or a cup describing how a FOOD product is packaged is not (מגש/כוס must not steal a raw cut, a prepared salad or an instant-noodle cup, matching the produce rule\'s existing "מגש ירקות" caution)', () => {
  assert.equal(categorize('16סט צלחת נוגה גרז8+10'), 'בית וכלים'); // a boxed plate set
  assert.equal(categorize('כוס 200 מ"ל'), 'בית וכלים'); // a plain cup
  assert.equal(categorize('מגש אובלי בינוני לאירוח'), 'בית וכלים'); // a hosting tray
  assert.equal(categorize('מתקן לסכו"ם מנירוסטה'), 'בית וכלים'); // a steel cutlery holder (excluded from ניקיון by its own נירוסטה guard)
  assert.equal(categorize('סט 12 עפרונות HB'), 'בית וכלים'); // pencils
  assert.equal(categorize('טוש אקלה 01'), 'בית וכלים'); // a marker
  assert.equal(categorize('מחברת POP כריכה קשה דרדסים ספירלה A5 שורה 100 דפים'), 'בית וכלים'); // a notebook
  assert.equal(categorize('מספריים איכותיות'), 'בית וכלים'); // scissors
  assert.equal(categorize('זוג עטים כדוריים איכותיים'), 'בית וכלים'); // a pack of pens
  // near-misses: food described by its serving vessel, or a brand name truncated down to "עט"/"טוש"-looking text
  assert.equal(categorize('וייסבראטן עגלה מרעה גולן במגש'), 'כללי'); // veal sold "on a tray" - not caught by any meat word either, but must not become a houseware
  assert.equal(categorize('מגי-דרגון בול נודלס בכוס עוף שומשום 75'), 'שימורים'); // instant noodles "in a cup"
  // fruit-cocktail dessert cups: the כוס exclude correctly keeps this out of בית וכלים, and it is not itself
  // covered by any pantry/snack keyword (generic "פירות" is not, on purpose - see the produce rule) - so it
  // lands in כללי rather than a wrong department, the same precision-over-coverage trade-off as elsewhere.
  assert.equal(categorize('קוקטייל פירות בכוסות פלס. רביעיות 113 גר'), 'כללי');
  assert.equal(categorize('טושונקה עגל 400 גר'), 'כללי'); // Tushonka canned veal - "טוש" is only the start of the word, blocked by the word-boundary guard
});

test('a manual display name (config/categories/names.json) is loaded per product id, and the file is well formed', () => {
  const names = displayNames();
  assert.ok(names instanceof Map);
  for (const [id, name] of names) {
    assert.match(id, /^g\d+$/, `${id}: display names are keyed by product id`);
    assert.ok(name.length >= 4, `${id}: a display name says what the product is`);
  }
  // The case that motivated the file: six chains copy the supplier's series name, two say what is in the pack.
  assert.equal(displayName('g7290113195837'), 'מבחר קטניות מן הטבע 700 גרם');
  assert.equal(displayName('g0000000000000'), null);
  assert.equal(displayName(null), null);
});

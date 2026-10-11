import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - snacks tree round, second pass (after the Opus review in d4aafc5).
 *
 * Naor tonight: "אל תעשה מוצר מוצר. תנסה קודם לקבץ את המוצרים מאותה משפחה ואז לבנות להם עץ" - cluster first,
 * build the tree second. This round splits three shelves whose kind-groups in config/substitutes/rules.json
 * were already sitting on real sub-clusters, ready to become leaves: cookies (667 products: savory/mizrahi,
 * moroccan, maamoul, rugelach, oat, sandwich-filled, chocolate-chip, palmier - cantucci merged into the
 * existing biscotti leaf, since cantucci IS Tuscan biscotti, not a different product), candy-hard (345:
 * lollipop, toffee, toy-surprise, sour-sticks split out), wafers (296: cone split out). It also closes
 * several standalone no-concept clusters the department dump turned up (cheese-snack-bar, candy-licorice,
 * candy-whipped) and three small gaps in existing leaves (biscuit-petit-beurre missing the bare "פתי בר"
 * phrasing, biscuit-chocolate-coated missing "ציפוי", biscuit-sandwich-filled missing the "סנדויץ" spelling,
 * a percentage-gated Lindt Excellence fix on chocolate-bar-dark).
 *
 * Every new leaf below was measured against the live catalog (scripts/concept-round.mjs-style diff, raw
 * chain names) before being accepted; several early drafts turned out to collide with concepts outside this
 * file (water-soda, yogurt-fruit, marshmallow, dates, sesame-seeds, kebab-frozen, party-balloons...) and
 * were narrowed with `none` guards here, or - where the other side already deserved to win (a lollipop that
 * also says "סודה", a yogurt that also says "לקקן") - left alone rather than fought over a file this round
 * does not own.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

// --- cookies shelf split ---------------------------------------------------------------------------

test('cookies-savory: Mizrahi-style and salted-cheese cookies leave the generic cookies shelf; a sweet cookie stays there', () => {
  is('אחוה עוגיות מזרחיות בטעם שום בצל 400 גרם', 'cookies-savory');
  is('עוגיות גבינה מלוחות חלבי 250גר', 'cookies-savory');
  isNot('עוגיות שוקולד צ\'יפס', 'cookies-savory');
  is('עוגיות שוקולד צ\'יפס', 'cookies-chocolate-chip');
});

test('cookies-moroccan: Moroccan-style cookies leave the generic shelf; an unrelated Moroccan-spiced kebab never gets it', () => {
  is('עוגיות מרוקאיות 500 גרם', 'cookies-moroccan');
  is('עוגיות אניס מרוקאיות מכוסמין מלא 230 גר', 'cookies-moroccan');
  isNot('קבב מרוקאי 500 גר', 'cookies-moroccan');
});

test('cookies-maamoul: maamoul (date-filled shortbread) leaves no-concept, including bare names; an energy date bar stays protein-bar\'s', () => {
  is('עוגיות מעמול רמי לוי 500 גרם', 'cookies-maamoul');
  is('מעמול מיני לל"ס', 'cookies-maamoul');
  isNot('חטיף מארז פרי אנרגיה תמרים עם קשיו 125', 'cookies-maamoul');
});

test('cookies-rugelach: rugelach leaves no-concept even without the word "עוגיות"; raw yeast dough and a brioche cake are not it', () => {
  is('עוגיות רוגלך טעם שוקולד 400ג.', 'cookies-rugelach');
  is('רוגלך מיני פרימיום בטעם וניל 350 גרם', 'cookies-rugelach');
  // Opus review 11.10: a yeast-dough rugelach IS rugelach; the "שמרימ" guard only exists because
  // pantry.json's yeast concept has no rugelach guard yet. Once it has, drop the guard and assert
  // is('רוגלך שמרים שוקולד 400 ג', 'cookies-rugelach'). A frozen to-bake pack is not the pastry.
  isNot('מארז רוגלך קפוא צנעני 600 גרם', 'cookies-rugelach');
  isNot('עוגת בריוש רוגלך 600', 'cookies-rugelach');
});

test('cookies-rugelach releases walnuts: a walnut-filled rugelach is rugelach, not loose walnuts', () => {
  isNot('רוגלך אגוזים 400 גרם', 'walnuts');
  is('רוגלך אגוזים 400 גרם', 'cookies-rugelach');
  is('אגוזי מלך 500 גרם', 'walnuts');
});

test('cookies-oat: oatmeal cookies leave the generic shelf; an oat protein bar stays protein-bar\'s', () => {
  is('עוגיות שיבולת שועל 500 ג', 'cookies-oat');
  is('עוגיות קוואקר 350 גרם', 'cookies-oat');
  isNot('חטיף חלבון שיבולת שועל בננה 40 גר', 'cookies-oat');
});

test('cookies-sandwich-filled: a filled/sandwich cookie leaves the generic shelf; a plain unfilled cookie stays there', () => {
  is('לוטוס עוגיות סנדוויץ במילוי וניל 150 גרם', 'cookies-sandwich-filled');
  is("אוראו עוגיות סנדוויץ' בטעם שוקולד ממולאות קרם בטעם וניל", 'cookies-sandwich-filled');
  isNot('עוגיות מרבה שוקולד צ\'יפס במרקם רך', 'cookies-sandwich-filled');
  // cookie-dough ice cream is ice cream, not a filled cookie
  isNot('גלידת סנדוויץ עוגיות טורטינה לואקר', 'cookies-sandwich-filled');
});

test('cookies-chocolate-chip: a chocolate-chip cookie leaves the generic shelf; cookie-dough ice cream is not a cookie', () => {
  is('מרבה עוגיות 37% שוקולד ציפס', 'cookies-chocolate-chip');
  is('אחוה עוגיות שוקולד ציפס בדלי 400 גרםנ.ל.פ', 'cookies-chocolate-chip');
  isNot('גלידה וניל+בצק עוגיות ושוקולד ציפס 473ג', 'cookies-chocolate-chip');
});

test('cookies-palmier: palmier/"ears" pastry leaves no-concept, bare or as a cookie; an unrelated "Palmini" meat pastry never gets it', () => {
  is('אוזני פיל', 'cookies-palmier');
  is('עוגיות פלמיי 200 גר', 'cookies-palmier');
  isNot('פלמיני בשר 600 גרם שלושת האופים', 'cookies-palmier');
});

test('cantucci merges into the existing biscotti leaf (cantucci IS Tuscan biscotti); an unrelated plain cookie stays off it', () => {
  is('עוגיות קנטוציני שקדים 175 גרם SAPORI', 'biscotti');
  is('מאריני-קנטוציני עוגיות עם שקדים 200 ג', 'biscotti');
  isNot('עוגיות שיבולת שועל 500 ג', 'biscotti');
});

// --- candy-hard shelf split ------------------------------------------------------------------------

test('candy-lollipop: lollipops/stick candy leave candy-hard; a kebab skewer and a balloon-on-a-stick never get it', () => {
  is('לוקיטוס סוכריות על מקל בטעם תות שדה - 12 יחידות', 'candy-lollipop');
  is('אירופה - סוכריות מקל סבא בטעם דובדבן 170', 'candy-lollipop');
  isNot('סוכריות טיק טק מנטה', 'candy-lollipop');
  is('סוכריות טיק טק מנטה', 'candy-hard');
  isNot('קבב על מקל קינמון - בלדי', 'candy-lollipop');
});

test('candy-toffee: toffee leaves no-concept; "שטופים" (washed, e.g. washed lettuce) never falsely matches on the substring', () => {
  is('טופי אצבעות בטעם תפוח', 'candy-toffee');
  is('סוכריות טופי בטעם חלב רושן', 'candy-toffee');
  isNot('עלי חסה שטופים', 'candy-toffee');
  isNot('מקלוני טופי בטעם פירות', 'candy-toffee');
  is('מקלוני טופי בטעם פירות', 'candy-stick');
});

// Opus review 11.10: one leaf held two products - a chocolate surprise egg (~20 g egg + toy) and a
// toy that comes with 3-10 g of dextrose candy. A parent asking for a surprise egg does not accept a
// toy fan, so they are two leaves: candy-surprise-egg and candy-toy-surprise.
test('candy-surprise-egg / candy-toy-surprise: a surprise egg and a toy-with-candy are two products; Kinder\'s own egg line stays kinder-surprise-egg\'s (Opus review 11.10)', () => {
  is('שלישיית ביצי שוקולד', 'candy-surprise-egg');
  is('שלישיית ביצי שוקולד(חלב ישראל) – חד קרן', 'candy-surprise-egg');
  is('ביצת הפתעה עם סוכריות צ\'ואי - מפרץ ההרפתקאות', 'candy-surprise-egg');
  is('צעצוע עם ממתק היפו סוויט בוקס 10 גר', 'candy-toy-surprise');
  is('ממתק צעצוע מאוורר ידני בארבי עם סוכריות דקסטרוז 3 גר', 'candy-toy-surprise');
  isNot('ביצת הפתעה קינדר', 'candy-surprise-egg');
  isNot('ביצת הפתעה קינדר', 'candy-toy-surprise');
  // a plain chocolate egg with no surprise is neither (and not a milk-chocolate bar either)
  isNot('ביצי שוקולד חלב מיני 100 גרם', 'candy-surprise-egg');
});

test('candy-sour-sticks: the Sour Sticks brand phrase leaves no-concept; the belt-shaped candy stays candy-sour-strips\'s', () => {
  is('סאוור סטיקס Sour Sticks בטעם תות שדה', 'candy-sour-sticks');
  isNot('יוגטה שטיחים חמוצים בטעם תות שדה', 'candy-sour-sticks');
  is('יוגטה שטיחים חמוצים בטעם תות שדה', 'candy-sour-strips');
});

// --- wafers shelf split -----------------------------------------------------------------------------

test('wafers-cone: ice-cream cone wafers leave no-concept; a wafer snack bar stays wafers\'s', () => {
  is('גביעי גלידה אמריקאי רמי לוי 24 יח', 'wafers-cone');
  is('24 גביעי גלידה ממותקים 95 גרם', 'wafers-cone');
  isNot('וופל קראנץ עלמה 60 יח', 'wafers-cone');
  is('וופל קראנץ עלמה 60 יח', 'wafers');
});

// --- standalone new leaves ---------------------------------------------------------------------------

test('cheese-snack-bar: the sweet cheese-flavoured snack bar leaves no-concept; Cheetos and a cheesecake-flavoured protein bar never get it', () => {
  is('חטיף גבינה וניל 45 גר', 'cheese-snack-bar');
  is('חטיף גבינה דובדבן שו', 'cheese-snack-bar');
  isNot('ציטוס חטיף גבינה8*30ג', 'cheese-snack-bar');
  isNot('חטיף חלבון סופט עוגת גבינה פטל', 'cheese-snack-bar');
});

test('candy-licorice: licorice leaves no-concept; a watermelon-flavoured line is ceded to the watermelon concept rather than conflicting with it', () => {
  is('לקריץ 6 צבעים 90גר', 'candy-licorice');
  is('לקריץ במשקל', 'candy-licorice');
  isNot('לקריץ שטוח אבטיח מסו', 'candy-licorice');
});

test('candy-whipped: Russian-style whipped/aerated stick candy leaves no-concept; dried cranberries stay cranberries-dried\'s', () => {
  is('ממתק מוקצף בטעם וניל וחתיכות מרמלדה 220ג', 'candy-whipped');
  isNot('ממתק מוקצף חמוציות 2', 'cranberries-dried');
  is('ממתק מוקצף חמוציות 2', 'candy-whipped');
});

// --- gaps closed in existing leaves -------------------------------------------------------------------

test('biscuit-petit-beurre: the bare "פתי בר" phrasing (no "ביסקוויט" word) is captured; a filled/sandwich biscuit is a different leaf', () => {
  is('פתי בר מופחת סוכר 500 גרם אסם', 'biscuit-petit-beurre');
  is('פתי בר ללא גלוטן קלאסי 200 גרם אסם', 'biscuit-petit-beurre');
  isNot('ביסקוויט סנדויץ וניל 150 גרם', 'biscuit-petit-beurre');
});

test('biscuit-chocolate-coated: "בציפוי שוקו" (coating, not chips) is captured; a chocolate-chip biscuit stays uncaptured by this leaf', () => {
  is('ביסקוויט בציפוי שוקו', 'biscuit-chocolate-coated');
  isNot('ביסקוויט שוקוציפס דרדסים 200 גר', 'biscuit-chocolate-coated');
});

test('biscuit-sandwich-filled: the "סנדויץ" spelling (missing the double vav) is captured alongside "סנדוויץ"', () => {
  is('ביסקוויט סנדויץ וניל 150 גרם', 'biscuit-sandwich-filled');
  is('ביסקוויט סנדוויץ וניל 150 גרם', 'biscuit-sandwich-filled');
});

test('chocolate-bar-dark: a high-percentage Lindt Excellence bar is captured (percentage-gated, not by the maker\'s name alone); a milk or unlabelled-percentage Excellence bar is not swept in', () => {
  is('לינדט אקסלנס 70% מוצקי קקאו 100 גרם', 'chocolate-bar-dark');
  is('לינדט אקסלנס 90% מוצקי קקאו 100 גרם', 'chocolate-bar-dark');
  isNot('לינדט אקסלנס שוקולד חלב 100 גרם', 'chocolate-bar-dark');
  is('לינדט אקסלנס שוקולד חלב 100 גרם', 'chocolate-bar-milk');
  // no percentage at all - left alone rather than guessed
  isNot('לינדט אקסלנס מנטה 100 גרם', 'chocolate-bar-dark');
});

test('chocolate-bar-dark: an AXE/Dove deodorant stick scented "dark chocolate" never gets it (home-department request, 11.10)', () => {
  isNot('דאו סטיק ריח שוקולד מריר', 'chocolate-bar-dark');
  is('שוקולד מריר 70% 100 גרם', 'chocolate-bar-dark');
});

// --- Opus review 11.10 --------------------------------------------------------------------------------
// Measured in isolation (HEAD for every other concept file): the Sonnet pass sent 40 products from a
// concept to none. 35 of them were the same trap - "במילוי X", "בטעם X סאוור סטיקס", "בתוספת שוקולד
// צ'יפס" are flavour phrases, stripped before a concept's positive patterns are read, while `none` reads
// the whole name. So the parent shelf excluded "במילוי" and the leaf could never see it. Every cookie
// leaf that the parent shelf steps back for now reads the whole name (flavourIsIdentity, the same as
// biscuit-sandwich-filled), and carries the vocabulary of the retired kind it replaces.

test('a filled cookie named only by "במילוי ..." reaches cookies-sandwich-filled instead of no concept (Opus review 11.10)', () => {
  is('עוגיות במילוי חלווה160ג', 'cookies-sandwich-filled');
  is('לוטוס עוגיות במילוי קרם לוטוס 150 גרם', 'cookies-sandwich-filled');
  is('עוגיות היט Hit במילוי קרם בטעם שוקולד', 'cookies-sandwich-filled');
  is("עוגיות שוקולד צ'יפס במילוי קרם בטעם שוקולד", 'cookies-sandwich-filled');
  is('עוגיות סנדביץ במילוי קרם וניל 900גרם', 'cookies-sandwich-filled');
  is('עוגיות אלפחורס 260 גרם', 'cookies-sandwich-filled');
  is('עוגיות אוראו 176 גרם', 'cookies-sandwich-filled');
  // a chocolate bar with cookie bits, a wafer, an ergaliyot cone and ice cream are not filled cookies
  isNot("סו מאצ' שוקולד חלב במילוי קרם בטעם וניל ושברי עוגיות", 'cookies-sandwich-filled');
  isNot('עוגיות קרמוגית במילוי קרם שוקולד אסם 200 גרם', 'cookies-sandwich-filled');
  isNot('ערגליות עוגיות במילוי שוקולד אסם 300 גרם', 'cookies-sandwich-filled');
  isNot('גלידה עוגיות במילוי', 'cookies-sandwich-filled');
  // the Milka-Oreo bar stays a chocolate bar: "סנדביצ" contains "ביצ", which is no longer an egg guard
  is('שוקולד מילקה אוראו סנדביץ 92 גרם', 'chocolate-bar-milk');
});

test('chocolate chip: "בתוספת שוקולד צ\'יפס" counts; cookie dough and a cookie mix are not cookies (Opus review 11.10)', () => {
  is("עוגיות מיני קוקיס בתוספת שוקולד צ'יפס אמיתי", 'cookies-chocolate-chip');
  is('עוגיות שוקולד צאנקס לבן מריר 180ג רמי לוי', 'cookies-chocolate-chip');
  isNot('בצק עוגיות שוקוציפס 680 ג', 'cookies-chocolate-chip');
  isNot('תערובת לעוגיות שוקולד ציפס', 'cookies-chocolate-chip');
});

test('oat, salty, Moroccan and palmier leaves carry every spelling the retired kinds did (Opus review 11.10)', () => {
  is('KUHM עוגיות שבולת שועל 270 גר', 'cookies-oat');
  is('עוגיות ש. שועל קלאסיק 320 גרם פוסידלקינו', 'cookies-oat');
  is('עוגיות קואקר ללת"ס 300ג', 'cookies-oat');
  is('עוגיות מלוחות קריספי 350', 'cookies-savory');
  isNot('עוגיות קרמוגית במילוי קרם בטעם קרמל מלוח', 'cookies-savory');
  is('עוגיות מיני מרקאיות 500גר רמילוי', 'cookies-moroccan');
  is('עוגיות אוזניים 200 גרם', 'cookies-palmier');
  is('עוגיות בצק עלים "אוזניים" 350 גרם עם קינמון', 'cookies-palmier');
  isNot('אוזניות בלוטות\' אלחוטיות', 'cookies-palmier');
  isNot('אוזני פיל קפואות בצק עלים', 'cookies-palmier');
});

// Opus review 11.10: "Sour Sticks" is one maker's name for a commodity product - sour candy sticks
// (חמצוצים / מקלות חמוצים), which Yogeta, Paskesz and Gouri sell too. Not a Pringles-style line, so the
// leaf is keyed on the product and the brand is one of its spellings.
test('candy-sour-sticks is the product חמצוצים, whoever makes it; gummies, licorice and sour belts are not it (Opus review 11.10)', () => {
  is('סוכריות חמצוצים בטעם פטל סאוור סטיקס 50 גרם', 'candy-sour-sticks');
  is('סוכריות חמצוצים תפוח עץ סאוור סטיקס 50 גרם', 'candy-sour-sticks');
  is('יוגטה מקלות חמוצים בטעם קולה', 'candy-sour-sticks');
  is('מקלות חמצוצים פטל פשקז 50 גרם', 'candy-sour-sticks');
  is('חמצוצים 4 טעמים טבעי 100 ג`', 'candy-sour-sticks');
  isNot('סוכריות גומי חמצוצים בטעמים שונים סאוור סטיקס 40 גרם', 'candy-sour-sticks');
  is('יוגטה שטיחים חמוצים בטעם תות שדה', 'candy-sour-strips');
  is('ממתק ליקריץ שטיחים 100 ג\' - תות ורוד לבן - הלו קיטי 8*12', 'candy-sour-strips');
  is('מקלוני טופי בטעם פירות', 'candy-stick');
  is('יוגטה לקריץ ממולא אדום מסוכר 1ק"ג עדה חרדית', 'candy-licorice');
});

test('candy-toffee: a toffee dessert or drink is not candy; toffee candies "in stick shape" stay toffee (Opus review 11.10)', () => {
  isNot('פודינג טופי', 'candy-toffee');
  isNot('מעדן טופי', 'candy-toffee');
  isNot('דנ.פרו לת"ס בננה טופי200', 'candy-toffee');
  isNot('גלידת טופי קרמל 500 מל', 'candy-toffee');
  is('סוכריות טופי בצורת מקלות 350גר', 'candy-toffee');
  is('מקלוני טופי בטעם פירות', 'candy-stick');
});

test('cheese-snack-bar is the sweet cheese bar only: pizza bites, smoked or blue-cheese snacks are not it (Opus review 11.10)', () => {
  is('חטיף גבינה לבנה וניל', 'cheese-snack-bar');
  isNot('חטיפי פיצה גבינה מעדנות 650 גרם', 'cheese-snack-bar');
  isNot('חטיפי גבינה מעושן 75 גר', 'cheese-snack-bar');
  isNot('הר חטיף גבינה בפאלו גבינה כחול 198 ג', 'cheese-snack-bar');
});

test('lollipop and licorice: fruit on a stick and licorice tea are not candy (Opus review 11.10)', () => {
  isNot('אבטיח על מקל', 'candy-lollipop');
  is('סוכריה על מקל טעם תות בשקית 21 גרם', 'candy-lollipop');
  is('סוכריות עגולות על מק', 'candy-lollipop'); // a chain-truncated "על מקל"
  isNot('תה לקריץ', 'candy-licorice');
});

test('petit beurre: whole-spelt and butter-flavoured petit beurre are still petit beurre (a kind, not another product) (Opus review 11.10)', () => {
  is('פתי בר אורגני - ביסקוויט מקמח כוסמין מלא 400 גרם', 'biscuit-petit-beurre');
  is('פתי בר ביסקוויט בטעם חמאה', 'biscuit-petit-beurre');
});

test('wafers-cone: a wafer cup is a cone even without the word "גלידה" (Opus review 11.10)', () => {
  is('גביעי וופל מצופים בשוקולד חלב 120 גרם', 'wafers-cone');
  isNot('גביע יוגורט 200 גרם', 'wafers-cone');
});

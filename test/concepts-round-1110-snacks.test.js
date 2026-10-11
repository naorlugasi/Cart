import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - חטיפים וממתקים round (docs/CONCEPTS.md): the receipt simulator (ops/review/receipt-sim-
 * 2026-10-11.md) found 13.3% of basket lines carry no conceptId, so a chain missing one can never offer a
 * substitute. This round covers snacks' 505 no-concept products sold in 3+ chains (measured live via
 * assignConcept over data/products.json, not the stale conceptId field - see the commit message for both
 * counts). New leaves for clusters of 3+ products or 2+ chains, split out of the `cookies`/`candy-hard`
 * shelves where a cluster was clear, plus a leaf per iconic brand line (Kinder, Lindor, Twix, Pringles,
 * M&M's, Ferrero Rocher, Smarties, Pesek Zman, Ben & Jerry's) the same way the cereal round split Cheerios/
 * Fitness/Trix. Every new leaf gets one name it must capture and one close name it must refuse (the refusal
 * is what holds the rule); every widened concept keeps capturing what it always did. Names are real chain
 * names from the price files (data/products.json).
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

// --- new leaves -----------------------------------------------------------------------------------

// Opus review 11.10: קיצפיות are meringue (the names say "מרנג"), not krembo; "קרמבולה" is the carambola fruit.
test('krembo: the dome-on-biscuit treat leaves no-concept; meringue and carambola are not krembo; an ice-pop version stays icecream-stick\'s', () => {
  is('קרמבו בטעם וניל - מארז שמינייה פרווה', 'krembo');
  is('קיצפיות - מרנג בטעם וניל ותות', 'meringue');
  isNot('קרמבולה', 'krembo');
  isNot('קרמבו 8יח ארטיק מוקה', 'krembo');
});

test('kinder-surprise-egg: the surprise egg leaves no-concept; a plain Kinder chocolate bar is not an egg', () => {
  is('ביצת הפתעה קינדר - הדינוזאורים של נטונס', 'kinder-surprise-egg');
  is('ביצת הפתעה קינדר', 'kinder-surprise-egg');
  isNot('קינדר שוקולד מיני 120 גר', 'kinder-surprise-egg');
});

test('kinder-joy: Kinder Joy/Goy leaves no-concept; the surprise egg line is its own leaf, not this one', () => {
  is("קינדר ג'וי סופר מריו מארז שלישייה", 'kinder-joy');
  is('קינדר גוי בודד 72 יחידות (חדש)', 'kinder-joy');
  isNot('ביצת הפתעה קינדר', 'kinder-joy');
});

test('kinder-cards: Kinder Cards leaves no-concept; a plain Kinder chocolate mini is a different line', () => {
  is('קינדר קארדס 128 גרם', 'kinder-cards');
  is('קינדר קארדס 25.6 גרם', 'kinder-cards');
  isNot('קינדר שוקולד מיני 120 גר', 'kinder-cards');
});

test('kinder-chocolate-mini: Kinder\'s mini chocolate shapes leave no-concept; Kinder Bueno fingers stay chocolate-filled-snack\'s', () => {
  // Opus review 11.10: Kinder Country, Schoko-bons, Happy Hippo and Kinderini (a biscuit) are Kinder lines of their own
  is('קינדר שוקולד מיני 120 גר', 'kinder-chocolate-mini');
  is('קינדר שוקולד עם דגנים פרימיום', 'kinder-country');
  is('שוקובון קינדר 125 גר פרימיום', 'kinder-schokobons');
  is('חטיף קינדר הפי היפו 5יח', 'kinder-happy-hippo');
  is('קינדר קינדריני מאגדת 100 גרם', 'kinder-kinderini');
  isNot('אצבעות שוקולד קינדר Kinder ארבע יחידות', 'kinder-chocolate-mini');
  is('אצבעות שוקולד קינדר Kinder ארבע יחידות', 'chocolate-filled-snack');
});

test('lindt-lindor: the Lindor truffle line leaves no-concept; a plain Lindt Excellence bar (no "לינדור") is not Lindor', () => {
  is('שוקולד לינדור לינדט מילק 100 גר', 'lindt-lindor');
  is('שוקולד לינדור סטיקס 38 גרם', 'lindt-lindor');
  isNot('לינדט אקסלנס שוקולד מריר מעולה 99% מוצקי קקאו', 'lindt-lindor');
});

test('pringles: the brand leaves no-concept; a generic chips SKU without the brand name stays potato-chip-seasoned\'s', () => {
  is('פרינגלס אורגינל 149', 'pringles');
  is('פרינגלס ברביקיו 158 גרם', 'pringles');
  isNot('חטיף ציפס מלוח 150 גרם', 'pringles');
});

test('candy-mm: M&M\'s leaves no-concept; a plain milk-chocolate bar that merely mixes in M&Ms stays chocolate-bar-milk\'s', () => {
  is('אם אנד אמס בטעם בוטנים 45 גרם', 'candy-mm');
  is('סוכריות אם אנד אמס M&M בוטנים 150 גרם', 'candy-mm');
  isNot('שוקולד חלב עם סמארטיס', 'candy-mm');
});

test('smarties: leaves no-concept; a milk-chocolate bar containing Smarties as a mix-in stays chocolate-bar-milk\'s', () => {
  is('סמארטיס מיני 187 גרם', 'smarties');
  isNot('שוקולד חלב עם סמארטיס', 'smarties');
  is('שוקולד חלב עם סמארטיס', 'chocolate-bar-milk');
});

test('ferrero-rocher: leaves no-concept; a bonbonniere box of the same pralines stays chocolate-gift-box\'s', () => {
  is('פררו רושה קולקשיין 172גר', 'ferrero-rocher');
  isNot('בונבוניירה פררו רושר 375 גר', 'ferrero-rocher');
  is('בונבוניירה פררו רושר 375 גר', 'chocolate-gift-box');
});

test('ergaliyot: Osem\'s twisted strip cookie leaves no-concept; the generic cookies shelf defers to it', () => {
  is('ערגליות במילוי תמרים אסם 270 גרם', 'ergaliyot');
  is('ערגליות במילוי תפוח וקינמון אסם 270 גרם', 'ergaliyot');
  isNot('עוגיות שוקולד צ\'יפס', 'ergaliyot');
});

// Opus review 11.10: ביסקוטי (Italian twice-baked biscotti) and בישקוטים (ladyfingers, "אצבעות מאפה ספוג") are two products.
test('biscotti and ladyfingers are two leaves; the generic cookies shelf defers to both', () => {
  is('ביסקוטי כוסמין שוקולד אגוזי לוז 200 גרם', 'biscotti');
  is('בישקוטים בונומי 200 גרם', 'ladyfingers');
  is('עוגיות בישקוטים וניל', 'ladyfingers');
  isNot('עוגיות שוקולד צ\'יפס', 'biscotti');
});

test('pretzel-cream-filled: the cream-filled pretzel the pretzels concept already deliberately excludes leaves no-concept', () => {
  is('קרם בייגלה מתוק מלוח סוויטארט 400 גר', 'pretzel-cream-filled');
  isNot('בייגלה קלאסית 200 גרם', 'pretzel-cream-filled');
});

test('pesek-zman: the Elite wafer-bar brand leaves no-concept; a cookie merely naming it ("פינוקיות פסק זמן") stays cookies\'', () => {
  is('חטיף פסק זמן חלב מגדים 45 גר.', 'pesek-zman');
  isNot('מיני פינוקיות פסק זמן - עוגיות ממולאות בקרם אגוזים ושברי אגוזי לוז', 'pesek-zman');
  is('מיני פינוקיות פסק זמן - עוגיות ממולאות בקרם אגוזים ושברי אגוזי לוז', 'cookies');
});

test('candy-sour-strips: the sour-belt shape leaves no-concept; a literal rug/carpet never gets it', () => {
  is('יוגטה שטיחים חמוצים בטעם תות שדה', 'candy-sour-strips');
  is('שטיח חספוסים יוגטה טעם מעורב 50 גר', 'candy-sour-strips');
  isNot('שואב שוטף רצפות ושטיחים אלחוטי BISSEL OmniForce edge pro 4000N', 'candy-sour-strips');
});

test('candy-gummy-bears: bear-shaped gummy snacks leave no-concept; Haribo\'s own "סוכריות גומי" phrasing stays candy-gummy\'s', () => {
  is('יוגטה גומי דובונים מבריק 150 גרם', 'candy-gummy-bears');
  // Opus review 11.10: Osem "חטיף דובונים" is a potato snack, not gummy bears
  is('מארז אריזות מיני חטיף דובונים - 5 יח', 'potato-chip-herrs-shaped');
  is('דובונים חטיף תפוחי אדמה אסם 40 גרם', 'potato-chip-herrs-shaped');
  isNot('הריבו סוכריות גומי דובונים 70 גרם', 'candy-gummy-bears');
  is('הריבו סוכריות גומי דובונים 70 גרם', 'candy-gummy');
});

test('candy-gummy-shapes: snake/fruit-shaped gummy leaves no-concept; a plastic cover that merely has an elastic ("גומי") never gets it', () => {
  is('יוגטה גומי נחשים מסו', 'candy-gummy-shapes');
  is('גומי צורות תות חמוץ מסוכר 150 גרם', 'candy-gummy-shapes');
  isNot('כיסוי ניילון עם גומי ניצמד 30 יחידות', 'candy-gummy-shapes');
});

test('candy-decoration-sprinkles: cake-decoration candy leaves no-concept (candy-hard already deliberately excludes "לקישוט")', () => {
  is('סוכריות לקישוט חומות', 'candy-decoration-sprinkles');
  is('סוכריות לקישוט צבעוני הנמל 200 גרם', 'candy-decoration-sprinkles');
  isNot('סוכריות קשות בטעם פירות', 'candy-decoration-sprinkles');
});

test('date-snack-filled: the filled date-bite snack leaves no-concept; an energy bar that also contains dates stays protein-bar\'s', () => {
  is('מארז 6 חטיפי תמרים במילוי חמאת בוטנים שקד תבור', 'date-snack-filled');
  is('חטיף בריאות תמרים ובוטנים פרי 5 יחידות', 'date-snack-filled');
  isNot('חטיף מארז פרי אנרגיה תמרים עם קשיו 125', 'date-snack-filled');
  is('חטיף מארז פרי אנרגיה תמרים עם קשיו 125', 'protein-bar');
});

test('date-spread: date spread leaves no-concept; a chocolate-spread naming dates among its flavours is unaffected', () => {
  is('ממרח תמרים הנמל 450', 'date-spread');
  is('ממרח תמרים מיה 450 גרם', 'date-spread');
  isNot('ממרח שוקולד ואגוזים', 'date-spread');
});

test('halva-spread: halva spread leaves no-concept (halva itself already deliberately excludes "ממרח")', () => {
  is('ממרח חלבה אלמנדוס 350 גרם', 'halva-spread');
  isNot('חלווה טחינה 400 גרם', 'halva-spread');
});

test('chocolate-truffle-balls: unbranded chocolate balls leave no-concept; a branded ball (Klik, Lindor) stays that brand\'s', () => {
  is('כדורי שוקולד פרווה 300 ג', 'chocolate-truffle-balls');
  isNot('חטיף כדורים שוקולד חלב 65 גר קליק', 'chocolate-truffle-balls');
  is('חטיף כדורים שוקולד חלב 65 גר קליק', 'chocolate-filled-snack');
});

test('chocolate-lentils: unbranded chocolate lentils leave no-concept', () => {
  is('עדשי שוקולד בצנצנת 280 גרם', 'chocolate-lentils');
  isNot('עדשים אדומות 500 גרם', 'chocolate-lentils');
});

test('dried-apple: dried apple rings/chips leave no-concept; an apple-chip-FLAVOURED potato chip never gets it', () => {
  is('מארז תפוחונים מיובשים (Apple Chips) 88 גרם', 'dried-apple');
  isNot('האופה מארז רביעיית ציפס תפוחונים 88 גרם', 'dried-apple');
});

test('cauliflower-snack: cauliflower crisps leave no-concept', () => {
  is('חטיפי כרובית קראנצ\'ית 400 גר', 'cauliflower-snack');
  isNot('כרובית קפואה 500 גרם', 'cauliflower-snack');
});

test('nuts-cranberry-mix: an unlabelled nuts+cranberry snack leaves no-concept; one that says "תערובת" stays nuts-mix\'s', () => {
  is('חטיף אגוזים חמוציות ללא ת.סוכר', 'nuts-cranberry-mix');
  isNot('תערובת אגוזים וחמוציות קליית גת 150 גרם', 'nuts-cranberry-mix');
  is('תערובת אגוזים וחמוציות קליית גת 150 גרם', 'nuts-mix');
});

test('protein-snack-crisps: protein chips/rings leave no-concept; a snack that also says "חטיף" stays protein-bar\'s', () => {
  is("אולאין צ'יפס חלבון בטעם פפריקה", 'protein-snack-crisps');
  is('טבעות חלבון בטעם שוקולד 250 גרם ללא גלוטן', 'protein-snack-crisps');
  isNot('חטיף חלבון שוקו ציפס אורגני 40 גר', 'protein-snack-crisps');
});

test('soup-nuts: Shkedei Marak leaves no-concept (almonds-snack already deliberately excludes it, both spellings)', () => {
  is('שקדי מרק רכיבים טבעיים 400 גרם-מיכל', 'soup-nuts');
  is('שקדיה מרק בטעם עוף , מתכון ביתי', 'soup-nuts');
  isNot('שקדים קלויים 200 גרם', 'soup-nuts');
});

test('candied-cherries: sugared cherries leave no-concept', () => {
  is('דובדבנים מסוכרים 100', 'candied-cherries');
  isNot('דובדבנים טריים', 'candied-cherries');
});

test('chocolate-baking-couverture: baking/cooking chocolate leaves no-concept', () => {
  is('צימקאו שוקולד לבישול ואפיה 400 גרם', 'chocolate-baking-couverture');
  isNot('שוקולד חלב', 'chocolate-baking-couverture');
});

test('corn-snack-rings: the Apropo Tuvs ring-shaped corn snack leaves no-concept', () => {
  is('אפרופו טיובס טבעות בצל 50 גרם', 'corn-snack-rings');
  is('אפרופו טיובס חמוץ חריף 50 גרם', 'corn-snack-rings');
  isNot('טבעות בצל קפואות', 'corn-snack-rings');
});

test('twix: leaves no-concept, including a "חטיף שוקולד" phrasing that the generic chocolate-bar-snack shelf now defers to it', () => {
  is('טוויקס מיני 333 גרם', 'twix');
  is('טוויקס לבן חטיף בודד 46 גרם', 'twix');
  is('חטיף שוקולד טוויקס אגוזי לוז 46 גרם', 'twix');
  isNot('חטיף שוקולד חלב 46 גרם', 'twix');
});

test('ben-jerry-bar: the brand on a bar leaves no-concept; the same brand on a tub stays icecream-tub\'s', () => {
  is('טילון בן אנד ג\'ריס טופי קראנץ 400מ"ל', 'ben-jerry-bar');
  isNot('גלידה בן & ג\'ריס צ\'רי גרסיה 500 מ"ל', 'ben-jerry-bar');
  is('גלידה בן & ג\'ריס צ\'רי גרסיה 500 מ"ל', 'icecream-tub');
});

// Opus review 11.10: Loacker is a wafer maker - its wafers are wafers whether or not the chain wrote "וופל".
test('Loacker wafers are wafers; a Loacker bonbonniere is a gift box', () => {
  is('לואקר מיניס 150גרם שוקולד פרווה', 'wafers');
  is('בונבוניירה לואקר', 'chocolate-gift-box');
  is('וופל לואקר קקאו 175', 'wafers');
});

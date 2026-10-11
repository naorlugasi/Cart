import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - כללי round: products that got no department at all (receipt-sim target: 5,089 no-concept
 * products, 393 of them sold in 3+ chains; after the day's other six rounds, 4,954 / 351). Every new leaf
 * gets one name it must capture and one close name it must refuse (the refusal is what holds the rule).
 * Names are real chain names from data/products.json.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

// --- incontinence / children's bedwetting pants --------------------------------------------------

test('incontinence-underwear: disposable absorbent underwear for adults, not plain kids underwear', () => {
  is('דיפנד תחתון סופג לארג נשים לילה 14יח', 'incontinence-underwear');
  is('תחתונים אולוויז דיסקריט מידה L לבריחת שתן', 'incontinence-underwear');
  isNot('תחתוני בנות כותנה', 'incontinence-underwear');
});

test('incontinence-underwear must not swallow a panty liner ("מגן תחתון")', () => {
  isNot('מגן תחתון לבריחת שתן אורגניק 24 יחידות', 'incontinence-underwear');
});

test('bedwetting-pants-kids: Drynites, a different product/age-group from adult incontinence underwear', () => {
  is('תחתוני ספיגה לילדים Drynites בנות לגילאי 8-13', 'bedwetting-pants-kids');
  isNot('דיפנד תחתון סופג לארג גברים לילה 14יח', 'bedwetting-pants-kids');
});

// --- hair removal / hair styling -------------------------------------------------------------------

test('hair-removal-cream: depilatory cream/spray, not the wax-strip concept', () => {
  is('אורנה 19 קרם להסרת שיער', 'hair-removal-cream');
  is('ספריי להסרת שיער לעור רגיל - VEET', 'hair-removal-cream');
  isNot('ויט רצועות שעווה להסרת שיער פנים 40 יח', 'hair-removal-cream');
});

test('hair-removal-cream must not catch the IPL device or the epilator spring', () => {
  isNot('IPL מכשיר להסרת שיער', 'hair-removal-cream');
  isNot('קפיץ להסרת שיער שופרסל', 'hair-removal-cream');
});

test('hair-spray: Wella Flex / Syoss styling spray, not a root-colour touch-up spray', () => {
  is('ספריי לעיצוב אקסטרה גמיש וולה פלקס', 'hair-spray');
  is('סאיוס ספריי מקס הולד 400 מ"ל', 'hair-spray');
  isNot('תרסיס לכיסוי שורשי השיער Magic Retouch שחור', 'hair-spray');
});

test('hair-mousse widened to the brand alone (Wella Flex / Syoss), still excludes body/face mousse', () => {
  is('וולה פלקס מוס לנפח ליומיים 200 מל', 'hair-mousse');
  isNot('מוס רחצה לגוף', 'hair-mousse');
});

test('hair-color-spray widened to תרסיס + "לכיסוי שורש", not the generic wordless spray', () => {
  is('תרסיס לכיסוי מיידי של שורשי השיער חום', 'hair-color-spray');
  isNot('תרסיס לגיהוץ קל 500 מ"ל TNX', 'hair-color-spray');
});

// --- baby / party goods ------------------------------------------------------------------------------

test('baby-teether: נשכן, any teether shape, not a real banana or a standalone toothbrush', () => {
  is('נשכן שרשרת חרוזים נובי', 'baby-teether');
  is('נשכן בננה מברשת שיני', 'baby-teether');
  isNot('בננה 1 קג', 'baby-teether');
});

test('party-balloons: בלון/בלונים for a party, not the hair-colour "בלונד" homonym', () => {
  is('מארז בלונים על מקל לניפוח עצמי happy bir', 'party-balloons');
  is('בלון פסטל שמחה זה אנחנו) (50', 'party-balloons');
  isNot('בירה לף בלונד פחית 500מל', 'party-balloons');
});

test('party-streamers: קישקשים (streamers)', () => {
  is('קישקשים מנייר 12 יח צבעוני', 'party-streamers');
});

// --- cigarette brands (same leaf style as the existing Pall Mall / Winston / LM / LD) ----------------

test('cigarettes-marlboro: one leaf for every pack size', () => {
  is('מרלבורו גולד קצר בודד', 'cigarettes-marlboro');
  is('מרלבורו רד קצר בודד.', 'cigarettes-marlboro');
});

test('cigarettes-parliament: one leaf', () => {
  is('פרלמנט נייט קצר פאקט', 'cigarettes-parliament');
});

test('cigarettes-next: "נקסט" is always this tobacco line in the catalog, never the clothing brand', () => {
  is('נקסט ריסס ארוך פקאט 10 יחידות', 'cigarettes-next');
  is('סיגריות נקסט (בודד)', 'cigarettes-next');
});

// --- pantry: coconut cream vs. desiccated coconut vs. coconut water ----------------------------------

test('coconut-cream: canned/carton coconut cream or milk, not a wafer filled with it', () => {
  is('קרם קוקוס בקרטון מאסטר שף 250 מ"ל', 'coconut-cream');
  is('AVEL נוזל קוקוס תאיל', 'coconut-cream');
  isNot('גרנד פטיסרי עם קרם קוקוס מצופה שוק. 100', 'coconut-cream');
});

test('coconut-desiccated: ground/dried coconut, not coconut water or a muesli that merely contains it', () => {
  is('קוקוס לבן טחון 400 ג', 'coconut-desiccated');
  is('קוקוס מיובש 160 גר`קופסא', 'coconut-desiccated');
  isNot('מי קוקוס 400 מל טעמי אסיה', 'coconut-desiccated');
  isNot('מוזלי עם שוקולד מריר ושבבי קוקוס שקדיה 850 גרם', 'coconut-desiccated');
});

// --- pantry: bare spice leaves, by brand (תבליני מימון / טעם וריח), never the brand itself -----------

test('spice-white-pepper: ground white pepper, a leaf of its own', () => {
  is('פלפל לבן טחון 40 גרם', 'spice-white-pepper');
});

test('spice-ginger-ground: ground ginger / זנגביל', () => {
  is('מיכל קטן ג\'ינג\'ר טחון (זנגויל) 30גרם', 'spice-ginger-ground');
});

test('spice-saffron: זעפרן', () => {
  is('תבליני מימון זעפרן 0', 'spice-saffron');
});

test('spice-caraway: ground caraway (קימל), not the caraway-flavoured oblaty candy', () => {
  is('תבלינים קימל טחון בצנצנות 40 גרם', 'spice-caraway');
  isNot('אובלטים קימל 300 גר', 'spice-caraway');
});

test('spice-nigella: bare קצח needs the "תבלינ" context, so it never swallows a cracker or cheese that merely has nigella seeds on top', () => {
  is('תבלינים קצח בצנצנות זכוכית 50 גרם', 'spice-nigella');
  isNot('עוגיות מלוחות עם קצח 450ג פרווה', 'spice-nigella');
});

test('spice-baharat: בהרט the spice, excluded from the generic spice-mix bucket it would otherwise double with', () => {
  is('תבלינים בהרט בצנצנת 40 גרם', 'spice-baharat');
});

test('spice-hawaij: both common spellings of Yemenite חאוויג\'', () => {
  is('חוואיג במיכל 100 גרם', 'spice-hawaij');
  is('חאוויג\' תימני מיה 50 גרם', 'spice-hawaij');
});

test('spice-chili-ground: ground/crushed chili, not the chili sauce', () => {
  is('צ\'ילי גרוס 70ג צנצנת כשלפ', 'spice-chili-ground');
  isNot('רוטב צ\'ילי מתוק', 'spice-chili-ground');
});

test('seasoning-mix-meatballs / seasoning-mix-fish: the exact Mimon phrase, not the generic תערובת תיבול concept it would otherwise conflict with', () => {
  is('תיבול לקציצות תבליני מימון 100 גרם', 'seasoning-mix-meatballs');
  is('תיבול לדג תבליני מימון 100 גרם', 'seasoning-mix-fish');
  isNot('תערובת תיבול לקציצות', 'seasoning-mix-meatballs');
});

test('curry-powder widened to a bare brand+קארי name, still refuses a curry-flavoured ready meal', () => {
  is('מימון קארי 100 גרם', 'curry-powder');
  isNot('ארוחת קארי עדשים כתומות אורגני 300 גרם', 'curry-powder');
});

test('garlic-powder widened to ground (טחון) garlic, not just the powder/crystals wording', () => {
  is('שום טחון 100 גרם', 'garlic-powder');
});

test('sweetener widened to bare Stevia, not a Stevia-sweetened chocolate bar', () => {
  is('סטיביה 150 טבליות', 'sweetener');
  isNot('שוק מריר 74% ל.ת.ס עם סטיביה 100 גר', 'sweetener');
});

test('oats-rolled widened to bare קוואקר (Quaker), not the Quaker-brand cookie', () => {
  is('קוואקר עדין אורגני 500 גר', 'oats-rolled');
  isNot('עוגיות קוואקר 350 גרם', 'oats-rolled');
});

// --- drinks: cocktail mixer, melon-flavoured Mogu Mogu, Muscat without the word יין ------------------

test('cocktail-rtd: the La Coq ready-to-drink cocktail line, not the La Coq WINE line', () => {
  is('קוקטייל מרגריטה אה לה קוק 330 מ"ל', 'cocktail-rtd');
  isNot('יין אדום לה קוק מלבק', 'cocktail-rtd');
});

test('mogu-mogu: the melon flavour was wrongly excluded by its own none word; fixed to allow "בטעם מלון"', () => {
  is('מוגו מוגו בטעם מלון עם חתיכות קוקוס 1 ליטר', 'mogu-mogu');
});

test('wine-white widened to bare Muscat (no יין word needed)', () => {
  is('דלתון כנען מוסקאטו750מ"ל', 'wine-white');
});

// --- snacks: Milka / Oreo / Maltesers / Reese's / caraway-wafer candy, each its own leaf --------------

// Opus review 11.10: Milka is a brand across tablets, cookies, biscuits, wafers and ice cream, each of which
// has its own leaf. The Milka leaf held an ice-cream pint and a wafer bar; a Milka tablet is milk chocolate.
test('a Milka tablet is chocolate-bar-milk even without the word שוקולד; a Milka ice cream or wafer bar is not', () => {
  is('מילקה אקסטרה קקאו 90 גרם', 'chocolate-bar-milk');
  is('שוק.חלב אגוז לוז90 מילקה', 'chocolate-bar-milk');
  is('מילקה שוקולד חלב', 'chocolate-bar-milk');
  isNot('פיינט מילקה קרמל 300 גרם', 'chocolate-bar-milk');
  isNot('מילקה נוסיני 31.5 גרם', 'chocolate-bar-milk');
});

test('cookies-oreo: bare Oreo packs with no "עוגיות" word, never double-claiming what "cookies" already owns', () => {
  is('אוראו מאגדת סנדויץ 6*33ג', 'cookies-oreo');
  isNot('פיינט אוראו 300 גרם', 'cookies-oreo'); // Opus review 11.10: a pint is ice cream, not Oreo cookies
  isNot('עוגיות אוראו 176 גרם', 'cookies-oreo');
});

test('candy-maltesers: one leaf, including the long descriptive name candy-hard\'s own none list excludes', () => {
  is('מלטיזרס כדורים פריכים בציפוי שוקולד חלב', 'candy-maltesers');
});

test('chocolate-reeses-minis: the exact Reese\'s Minis phrase, distinct from the Next-brand cigarette "ריסס" spelling', () => {
  is('ריזס מיניס ארזה משפחתית 215ג', 'chocolate-reeses-minis');
  isNot('נקסט ריסס ארוך פקאט 10 יחידות', 'chocolate-reeses-minis');
});

test('candy-wafer-oblaty: needs קימל too, so it never swallows the much larger organic-wafer-sheet family', () => {
  is('אובלטים קימל 300 גר', 'candy-wafer-oblaty');
  isNot('אובלטים שומשום 300 גרם', 'candy-wafer-oblaty');
});

// --- household: mosquito-repellent refill wording, metal polish, Dorgol bathroom/descaler -----------

test('mosquito-repellent widened to "להרחקת יתושים" refill wording, not just "דוחה יתושים"', () => {
  is('מילוי נוזלי להרחקת יתושים', 'mosquito-repellent');
});

test('metal-polish: silver/stainless polish, never a plain stainless pot or kettle', () => {
  is('חומר לניקוי והברקת כלי כסף', 'metal-polish');
  is('מלרוד מנקה ומבריק נירוסטה ומתכות 500 מל', 'metal-polish');
  isNot('קומקום חשמלי נירוסטה 1.8 ליטר K300', 'metal-polish');
});

test('bathroom-cleaner / descaler widened for the Dorgol brand name standing in for the missing cleaning verb', () => {
  is('דורגול נוסחה מרוכזת בחדר אמבט 750מל', 'bathroom-cleaner');
  is('דורגול פורטה לאבנית וכתמי שתן 1 ליטר', 'descaler');
});

test('toilet-cleaner widened to a bare מרסס/תרסיס spray, not only ניקוי/סבון/טבליות/ג\'ל', () => {
  is('דורגול מרסס WC לאסלה - מהיר ועוצמתי 600 מ"ל', 'toilet-cleaner');
});

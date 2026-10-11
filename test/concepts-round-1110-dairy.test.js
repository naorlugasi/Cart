import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - חלב וביצים round (docs/CONCEPTS.md): the receipt simulator (ops/review/receipt-sim-2026-10-11.md)
 * found 13.3% of basket lines carry no conceptId, so a chain missing one can never offer a substitute.
 * This round covers dairy-eggs's 535 no-concept products, 144 of them sold in 3+ chains. New leaves for
 * clusters of 3+ products or 2+ chains (yogurt by brand/fat%, Milky-style pudding vs plain chocolate/vanilla,
 * malabi, dairy jelly, rice/oatmeal pudding, spreadable butter salted/unsalted, cheese by brand/form...), plus
 * widening existing concepts (גיל/אשל as yogurt brands, קרם מסקרפונה as whipping cream, שייק as a protein-drink
 * anchor) that were one word away from the real chain name. Every new leaf gets one name it must capture and
 * one close name it must refuse - the refusal is what holds the rule, and several of them are real products
 * from the SAME brand that must land on a neighbouring concept instead (Pirassos is feta/labaneh/bulgarian as
 * often as it is the plain Greek cheese; "בוואריה" is also a sausage line; "קדאיף" is also a pasta and a
 * chocolate-bar filling). Names are real chain names from the price files (data/products.json).
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

// --- new leaves: yogurt shelf ------------------------------------------------------------------------

test('yogurt-cornflake-coated: yogurt with a cornflake-coated-chocolate mix-in leaves no-concept (yogurt-flavored-other\'s own none excludes "קורנפלקס" on purpose); plain fruit yogurt is untouched', () => {
  is('מולר מיקס יוגורט עם קורנפלקס מצופה שוקולד', 'yogurt-cornflake-coated');
  is('יוגורט טופ קורנפלקס מצופה שוקולד', 'yogurt-cornflake-coated');
  isNot('יוגורט תות', 'yogurt-cornflake-coated');
});

test('milkshake-fruit: a fruit milkshake with plain milk leaves no-concept; a shaker appliance or shake cups are not a drink', () => {
  is('שייק תות בננה עם חלב', 'milkshake-fruit');
  isNot('בלנדר שייקר 1.5 ליטר שחור BL9008', 'milkshake-fruit');
  isNot('כוסות לשייקים/ברד 50 יח` הנמל', 'milkshake-fruit');
});

// --- widened concepts: yogurt --------------------------------------------------------------------------

test('yogurt-drink widened: אקטימל is recognised as the brand it is, without a bare "אקטימל" needing the word יוגורט too', () => {
  is('אקטימל בטעם תות מארז 16 יח', 'yogurt-drink');
});

test('yogurt-plain/yogurt-flavored-other/yogurt-fruit widened: גיל and אשל count as yogurt brands only next to a fat percent, not on an unrelated "age 3" product', () => {
  is('גיל 3% 200 מל מהדרין פיקוח תנובה', 'yogurt-plain');
  is('אשל 4.5% שומן 200 מל מהדרין פיקוח תנוב', 'yogurt-plain');
  is('גיל בטעם וניל 3% שומן', 'yogurt-flavored-other');
  is('גיל בטעם תות 3% 125 גרם', 'yogurt-fruit');
  isNot('מצופים לידיים גיל 3-', 'yogurt-plain');
});

test('protein-milk-drink widened: שייק is a valid anchor only together with a protein word; a plain milk shake is not protein', () => {
  is('שייק מנגו עם חלבון 4', 'protein-milk-drink');
  isNot('שייק תות בננה עם חלב', 'protein-milk-drink');
});

// --- new leaves: pudding/dessert shelf ------------------------------------------------------------------

test('milky-pudding: Milky-style pudding with cream leaves no-concept, kept apart from plain chocolate/vanilla pudding; a Milky mini-cake stays its own (cake-individual) concept', () => {
  is('מילקי טופ מגולגלת', 'milky-pudding');
  is('מילקי מעדן שוקולד עם קצפת שטראוס 133 מ"ל', 'milky-pudding');
  isNot('מילקי עוגה אישית במילוי קרם חלב 34 גרם', 'milky-pudding');
});

test('pudding-chocolate/pudding-vanilla widened none: a Milky-branded, oatmeal-based or rice-based pudding no longer double-counts as plain chocolate/vanilla pudding', () => {
  isNot('מעדן מילקי בטעם שוקולד עם אקסטרה קצפת', 'pudding-chocolate');
  isNot('מעדן שיבולת שועל וניל אורגני 2*130 גרם', 'pudding-vanilla');
  isNot('מעדן אורז שוקולד אורגני 2*130 גרם', 'pudding-chocolate');
});

test('rice-pudding: rice-based milk dessert leaves no-concept; a plain chocolate pudding with no rice stays pudding-chocolate\'s', () => {
  is("פילגד סטיקי רייס מנגו - מעדן אורז וקוקוס עם מנגו", 'rice-pudding');
  is('ירח מתוק מעדן חלב עם אורז 3% גד 150 גרם', 'rice-pudding');
  isNot('מעדן שוקולד', 'rice-pudding');
});

test('pudding-oatmeal: oatmeal milk dessert leaves no-concept regardless of flavour; a plain vanilla pudding with no oats stays pudding-vanilla\'s', () => {
  is('גד מעדן שיבולת שועל וחלב 2% שומן', 'pudding-oatmeal');
  is('מעדן שיבולת שועל וניל אורגני 2*130 גרם', 'pudding-oatmeal');
  isNot('מעדן וניל', 'pudding-oatmeal');
});

test('malabi: malabi leaves no-concept; a malabi-flavoured coffee creamer, syrup, yogurt drink or ice cream stays with its own concept', () => {
  is('מעדן חלב מלבי 5% גד 170 גרם', 'malabi');
  is('מלבי חלבי 165 גרם', 'malabi');
  isNot('חלבית מלבין קפה חלבי', 'malabi');
  isNot('גלידה מלבי 1.8 ליטר.', 'malabi');
  isNot('סירופ מלבי', 'malabi');
});

test('dairy-jelly: Tnuva-style dairy jelly leaves no-concept; jelly candy, a jelly-mix powder or jelly bits in iced tea are not it', () => {
  is("ג'לי תנובה בטעם ענבים", 'dairy-jelly');
  is("ג'לי תנובה בטעם לימון", 'dairy-jelly');
  isNot("סוכריות ג'לי פטל כחו", 'dairy-jelly');
  isNot("אבקה להכנת ג'לי בטעם אננס אסם 85 גרם", 'dairy-jelly');
  isNot("מוגו מוגו אייס טי לימון עם חתיכות ג'לי קוקוס", 'dairy-jelly');
});

test('bavarian-cream-dessert / tiramisu-dessert: the Eden dessert line leaves no-concept regardless of dairy/parve; Bavarian-style SAUSAGES and a tiramisu-flavoured cookie/cake are not desserts', () => {
  is('קינוחי עדן בוואריה חלבית 95 ג', 'bavarian-cream-dessert');
  is('קינוחי עדן טירמיסו חלבי 82 ג', 'tiramisu-dessert');
  is('טירמיסו פרווה 75 גרם', 'tiramisu-dessert');
  isNot('נקניקיות בוואריה', 'bavarian-cream-dessert');
  isNot('עוגיות אוראו רמיקס טירמיסו 157 גר', 'tiramisu-dessert');
  isNot('עוגת פס מוס טירמיסו', 'tiramisu-dessert');
});

test('kadayif-dessert: plain kadayif leaves no-concept; kadayif noodles (pasta) and a kadayif-filled chocolate bar are not it', () => {
  is('קדאיף 82 גרם', 'kadayif-dessert');
  isNot('איטריות קדאיף 400 גר', 'kadayif-dessert');
  isNot('קינוח DUBAI CRUNCH פיסטוק קדאיף בשוקולד פיינט 240 גרם', 'kadayif-dessert');
});

test('coffee-creamer-dairy: a dairy coffee whitener leaves no-concept; whitening toothpaste that merely mentions coffee stains is not it', () => {
  is('חלבית מלבין קפה חלבי', 'coffee-creamer-dairy');
  isNot('משחת שיניים מלבינה ווייט גלו להסרת כתמי קפה ותה', 'coffee-creamer-dairy');
});

test('chocolate-mousse: chocolate mousse leaves no-concept; a Milky-branded mousse stays milky-pudding\'s. "שוקולית" itself is left to drinks.json\'s chocolate-drink-powder - a same-day concurrent round claimed that brand name first', () => {
  is('מוס שוקולד 75 גרם', 'chocolate-mousse');
  isNot('מעדן מוס שוקולד בלונדי 133 גר מילקי', 'chocolate-mousse');
});

// --- new leaves: butter/margarine/spread shelf ----------------------------------------------------------

test('butter widened: the Lurpak "ממרח מחמאת" (spreadable-from-butter) construct counts as butter, matching the existing house rule that spreadable Lurpak IS butter (test/concepts-flavour-words.test.js, 28.9 round) - not a new concept', () => {
  is('ממרח מחמאת לורפק ללא מלח 500', 'butter');
  is('ממרח מחמאת לורפק עם מלח 500', 'butter');
  is('חמאה', 'butter');
});

test('margarine-substitute: a margarine substitute leaves no-concept, even under a brand (נטורינה) that also sells an unrelated butter-flavoured spread', () => {
  is('נטורינה תחליף מרגרינה לבישול ואפיה קוקוס שמרית 200 גרם', 'margarine-substitute');
  isNot('נטורינה בטעם חמאה שמ', 'margarine-substitute');
});

test('butter-flavor-spread-vegan: a butter-FLAVOURED vegan/parve baking fat leaves no-concept, never the animal חמאה concept', () => {
  is('נטורינה בטעם חמאה שמ', 'butter-flavor-spread-vegan');
  is('ממרח שומן טבעוני בטעם חמאה לאפייה', 'butter-flavor-spread-vegan');
  isNot('חמאה', 'butter-flavor-spread-vegan');
});

test('soy-spread: a soy-based savoury spread leaves no-concept; the soy-based sweet DESSERT (מעדן) is a different leaf', () => {
  is('ממרח סויה 9% שומן בטעם טבעי תנובה 250 גרם', 'soy-spread');
  is('ממרח על בסיס סויה בסגון שמנת טופוטי 340 גרם', 'soy-spread');
  isNot('מעדן סויה', 'soy-spread');
});

// --- widened concepts: butter/milk spread --------------------------------------------------------------

test('whipping-cream widened: mascarpone cream sold for whipping counts; a plain mascarpone tub with no "להקצפה" stays mascarpone-cheese\'s', () => {
  is('קרם מסקרפונה להקצפה עם זרעי וניל', 'whipping-cream');
  isNot('מסקרפונה 40% שמנת מתוקה קשה בסגנון איטלקי', 'whipping-cream');
});

test('milk-jam widened: a plain milk spread (also under its diminutive, "בטעם חלב") counts; a chocolate-hazelnut spread or a halva spread that merely contains "ממרח...חלב" does not, nor does a cake FILLED with milk jam', () => {
  is('השחר ממרח חלב 350 גרם', 'milk-jam');
  is('ממרחית בטעם חלב בד"צ 500 גרם', 'milk-jam');
  isNot('ממרח חלבה מלאה 350 גר שקד תבור אלמנדוס', 'milk-jam');
  isNot("ממרח חלב וממרח אגוזי לוז עם קקאו צ'וקטה 350 גרם", 'milk-jam');
  isNot('טורט דבש (מאדוביק)במילוי ריבת חלב 350 גר', 'milk-jam');
});

test('milk-3 widened: the רמת הגולן "4%-3.6%" range label counts as whole milk; the milk+rice dessert that happens to say "חלב" and "3%" is not milk (milk-3\'s own none now excludes אורז)', () => {
  is('חלב טבעי 4%-3.6% מחלבת רמת הגולן', 'milk-3');
  isNot('ירח מתוק מעדן חלב עם אורז 3% גד 150 גרם', 'milk-3');
});

test('milk-drink-flavored widened: the "החלב החדש" brand counts as a flavoured milk drink even without the word משקה', () => {
  is('החלב החדש וניל פלוס', 'milk-drink-flavored');
});

// --- new leaves: cheese shelf ---------------------------------------------------------------------------

test('mascarpone-cheese: plain mascarpone leaves no-concept; mascarpone-FLAVOURED ice cream or candy stays with its own concept, and a sauce built on it stays pasta-sauce-tomato\'s own (pre-existing) territory', () => {
  is('מסקרפונה שמנת עשירה בסגנון איטלקי 40% שומן', 'mascarpone-cheese');
  is('גבינה מסקרפונ 41% 250 גר', 'mascarpone-cheese');
  isNot('גלידת מסקרפונה 1.2 ליטר עם עוגיות ונטיפי שוקולד חלב', 'mascarpone-cheese');
});

test('cream-sauce-classic: the יטבתה classic cream pasta sauce leaves no-concept; a different ready sauce (rosé/mascarpone) is a different product, not covered by this leaf', () => {
  is("יטבתה רוטב שמנת קלאסי 9% 260 גרם", 'cream-sauce-classic');
  isNot('רוטב רוזה מסקרפונה - רוטב מסקרפונה ועגבניות לפסטה', 'cream-sauce-classic');
});

test('hard-cheese-flavored / semi-hard-cheese: a hard cheese wheel with a flavoured topping/sauce swirl is one leaf, a plain semi-hard cheese by style/cut is a different one; a BRANDED semi-hard cheese (gouda, "נעם", sliced) keeps its own concept', () => {
  is('גבינה קשה 200 גרם 35% שומן ומחית פטריות כמהין UHKHPUS', 'hard-cheese-flavored');
  is('גבינה קשה 200 גרם 35% שומן עם רוטב פסטו', 'hard-cheese-flavored');
  is('גבינה קשה למחצה הולנד 24.5% 160 גר`', 'semi-hard-cheese');
  is('גבינה חצי קשה-אצבעות 25% שומן 200 גרם', 'semi-hard-cheese');
  isNot('גבינה חצי קשה נעם 28', 'semi-hard-cheese');
  isNot('פרוסות גבינה חצי קשה 28% אריזה משפחתית', 'semi-hard-cheese');
});

test('resta-cheese: the רסטה cheese line leaves no-concept regardless of brine/fat-% phrasing; an unrelated "style" cheese is not it', () => {
  is('גבינת רסטה 200 גרם 20% שומן', 'resta-cheese');
  is('גבינת רסטה במי מלח 20% שומן', 'resta-cheese');
  isNot('גבינה בסגנון סקנדינבי 31%', 'resta-cheese');
});

test('string-cheese: plain cheese strings/laces leave no-concept; a SMOKED string cheese stays smoked-cheese\'s', () => {
  is('שערות גבינה 200 גרם 25% שומן CHEESE LONG', 'string-cheese');
  isNot('חוטי גבינה מעושנת 10', 'string-cheese');
});

test('four-cheese-blend-shredded: a four-cheese shredded blend (by either chain spelling) leaves no-concept; a plain shredded yellow cheese is not a four-cheese blend', () => {
  is("קוואטרו פורמאג'י 4 גבינות מגוררות", 'four-cheese-blend-shredded');
  is("תערובת 4 גבינות מגורדות - מוצרלה, גאודה, פרמז'ן וצ'דר", 'four-cheese-blend-shredded');
  isNot('גבינה צהובה מגורדת', 'four-cheese-blend-shredded');
});

test('cheese-pirassos-5/9/16: the Pirassos Greek-style cheese by fat percent leaves no-concept; the SAME brand making feta, labaneh or bulgarian cheese stays with THOSE concepts, never a generic "Pirassos" bucket', () => {
  is('פיראוס חמד לייט 5% 2', 'cheese-pirassos-5');
  is('גבינת פיראוס יווני 9% שומן על בסיס יוגור', 'cheese-pirassos-9');
  is('חמד פיראוס 16% שומן 250 גרם', 'cheese-pirassos-16');
  isNot('בולגרית למריחה פיראוס 5% שומן 200 גרם', 'cheese-pirassos-5');
  isNot('פטה כבשים פיראוס 5% שומן 250 גרם', 'cheese-pirassos-5');
  isNot('לאבנה פיראוס 9% שומן 750 גרם', 'cheese-pirassos-9');
});

// --- widened concepts: cheese shelf ---------------------------------------------------------------------

test('brie-cheese widened: a "משולש" (triangle) brie counts without the word גבינה; a camembert triangle from the same line does not steal the concept', () => {
  is('משולש ברי צרפתי 160ג גד', 'brie-cheese');
  isNot('משולש קממבר צאן בקר 25% מחלבות גד', 'brie-cheese');
});

test('cheddar-cheese / gouda-cheese none widened: a protein pretzel merely flavoured "cheddar" is not cheddar cheese; a processed/melted gouda-flavoured cheese stays processed-cheese\'s', () => {
  isNot("בייגלה חלבון קריספאוור עם צ'דר 50 גרם", 'cheddar-cheese');
  isNot('גבינה מותכת גאודה18.3%שומן 150גPRESIDENT', 'gouda-cheese');
  is('גבינה מותכת גאודה18.3%שומן 150גPRESIDENT', 'processed-cheese');
});

test('mozzarella / parmesan-cheese none widened: a four-cheese blend that lists mozzarella/parmesan as ingredients is not either single-cheese concept (it is four-cheese-blend-shredded\'s)', () => {
  isNot("תערובת 4 גבינות מגורדות - מוצרלה, גאודה, פרמז'ן וצ'דר", 'mozzarella');
  isNot("תערובת 4 גבינות מגורדות - מוצרלה, גאודה, פרמז'ן וצ'דר", 'parmesan-cheese');
});

test('kashkaval/iberico/manchego/goat-cheese-other none widened: a multi-cheese assortment box ("טאפאס") is a shelf, not any one of the cheeses it lists', () => {
  assert.equal(assignConcept("טאפאס גבינות- מארז גבינות מסוג קסטלאנו, איבריקו וקשקבל", concepts), null);
  assert.equal(assignConcept("טאפאס גבינות מסוג: מנצ'גו, איבריקו, קשקבל, גבינת עיזים", concepts), null);
});

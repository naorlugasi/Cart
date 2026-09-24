import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * Round: חלב וביצים (dairy & eggs), 24.9. Two cases per new concept - one capture (a real name from
 * data/products.json this round is meant to catch) and one near-miss (a real name, usually from a
 * collision this round found and guarded against, that must NOT resolve to the new concept). The
 * near-miss is what holds: a rule that captures without rejecting anything is unverified.
 *
 * גבינת/גבינה round (18 named cheese varieties: ברי, קממבר, חלומי, פקורינו, קשקבל, טבורוג/tvorog,
 * מנצ'גו, אמנטל, פילדלפיה, גרנה פדנו, פרמזן, איבריקו, מאסדם, סנט מור, רוקפור, קירי, ריקוטה, קאש).
 * Near-misses are the traps this round actually found while writing the rules: "בריא" swallows "ברי"
 * unless the גבינ gate holds; "חלומי" (halloumi) collides with "חלום"-rooted cleaning/bread brands;
 * "פקורינו" is also an Italian wine grape; "טבורוג" (tvorog/quark) is real when sold plain but not when
 * it is the filling inside frozen latkes ("לביבות..."); "אמנטל"/"פרמזן" are swallowed by domestic cheese
 * marked "בסגנון" (style-of) and by parmesan-flavoured chips; "מאסדם" a processed-cheese variant defers to
 * processed-cheese; "סנט מור" a two-word phrase must not swallow the "סנט מוריץ" cleaning brand; "קירי" a
 * bare loanword must not swallow "קירין" beer; "ריקוטה" a real cheese is not the same as ricotta inside a
 * pasta sauce; "קאש" is anchored so it never swallows its own sibling "קשקבל".
 *
 * מעדן round (pudding-fruit/protein/soy): a fruit-flavoured milk pudding is not the pet-food brand
 * "פריסקיז" (its own name happens to start with "פרי"), a protein-fortified pudding always wins over a
 * plain fruit one when both words are present (mirrors the existing yogurt-protein/yogurt-natural split),
 * and a soy dessert that also carries a protein claim goes to pudding-protein, not pudding-soy.
 *
 * משקה round (milk-drink-flavored/almond-milk/kefir-drink/protein-milk-drink): a flavoured milk drink
 * defers to the existing iced-coffee-drink concept when the flavour is coffee; "משקה שקדים" needs the
 * שקד word itself, not just any "משקה"; "עלי קפיר" (kefir lime leaves, a cooking herb) is not the kefir
 * drink; a branded protein milk drink defers to yogurt-drink when the brand is a yogurt brand.
 *
 * יוגורט round (yogurt-sheep, yogurt-plain): sheep-milk yogurt is its own concept the same way
 * yogurt-goat already was (yogurt-natural's own `none` gained כבשימ to match); yogurt-plain is the
 * fallback for a plain יוגורט name with no flavour/natural/protein/drink marker, but it excludes brands
 * ("פומאז") that borrow the word "יוגורט" for an unrelated almond snack.
 *
 * חלב round (condensed-milk): "מרוכז" (concentrated) milk is condensed milk, but "מרוכז" is also a
 * laundry-softener marketing word ("מרכך כביסה... מרוכז חלב ודבש") - a live collision this round found.
 */

const concepts = loadConcepts();

test('brie-cheese: captures a real ברי wedge, not the unrelated word "בריאות" (health)', () => {
  assert.equal(assignConcept('גבינת ברי 125 גר', concepts), 'brie-cheese');
  assert.notEqual(assignConcept('חטיף ניישטר וואלי 1/5 בריאות מעורב 210 ג', concepts), 'brie-cheese');
});

test('camembert-cheese: captures a real wedge, not a camembert-scented body lotion', () => {
  assert.equal(assignConcept('קממברט בקר25% יעקבס כ150', concepts), 'camembert-cheese');
  assert.notEqual(assignConcept('לה רונד תחליב שומן צמחי בטעם קממבר', concepts), 'camembert-cheese');
});

test('halloumi-cheese: the גבינ gate keeps out the "חלומית" cleaning-cloth brand (same root, different word)', () => {
  assert.equal(assignConcept('גבינת חלומי 21%', concepts), 'halloumi-cheese');
  assert.notEqual(assignConcept('סנו סושי מטלית חלומית לריצפה - זוג', concepts), 'halloumi-cheese');
});

test('pecorino-cheese: captures a real wedge, not the Pecorino wine grape', () => {
  assert.equal(assignConcept('גבינת פקורינו', concepts), 'pecorino-cheese');
  assert.notEqual(assignConcept('יין ציטרה סיסטינה פקורינו 750 מ"ל', concepts), 'pecorino-cheese');
});

test('kashkaval-cheese: captures a real wedge, not kashkaval-flavoured savoury cookies', () => {
  assert.equal(assignConcept('גבינת קשקבל 200 גרם', concepts), 'kashkaval-cheese');
  assert.notEqual(assignConcept('עוגיות מלוחות קשקבל', concepts), 'kashkaval-cheese');
});

test('tvorog-cheese (טבורוג): captures the plain cheese, not tvorog used as a frozen-latke filling', () => {
  assert.equal(assignConcept('גבינת טבורוג 5%', concepts), 'tvorog-cheese');
  assert.notEqual(assignConcept('לביבות גבינת טבורוג קפואים', concepts), 'tvorog-cheese');
});

test('manchego-cheese: captures a real wedge, not a multi-variety tapas platter naming four cheeses at once', () => {
  assert.equal(assignConcept("גבינת מנצ'גו 150 גרם", concepts), 'manchego-cheese');
  assert.notEqual(assignConcept("טאפאס גבינות מסוג: מנצ'גו, איבריקו, קשקבל, גבינת עיזים", concepts), 'manchego-cheese');
});

test('emmental-cheese: captures a real wedge, not a domestic cheese merely "בסגנון" (styled like) Emmental', () => {
  assert.equal(assignConcept('אמנטל 27% ויליפוד', concepts), 'emmental-cheese');
  assert.notEqual(assignConcept('גבינה טל עמק בסגנון אמנטל 9%', concepts), 'emmental-cheese');
});

test('philadelphia-cheese: captures the real cream cheese, not a "Philadelphia-style" spice-mix seasoning', () => {
  assert.equal(assignConcept('גבינת פילדלפיה 11% 175 גר', concepts), 'philadelphia-cheese');
  assert.notEqual(assignConcept('תערובת תיבול פילדלפיה100', concepts), 'philadelphia-cheese');
});

test('grana-padano-cheese: captures a real wedge, not the sunflower-oil brand "גרנה"', () => {
  assert.equal(assignConcept('גבינת גרנה פדנו מגורדת 29% שומן', concepts), 'grana-padano-cheese');
  assert.notEqual(assignConcept('שמן חמניות לא מזוכך גרנה 850 מ"ל', concepts), 'grana-padano-cheese');
});

test('parmesan-cheese: captures a real wedge, not parmesan-flavoured chips', () => {
  assert.equal(assignConcept('גבינה פרמזן הכפר הלב', concepts), 'parmesan-cheese');
  assert.notEqual(assignConcept('ציפס גלי שום פרמזן 45 גרם אסם', concepts), 'parmesan-cheese');
});

test('iberico-cheese: captures a real wedge, not a two-variety tapas combo pack', () => {
  assert.equal(assignConcept('גבינת איבריקו 31% שומן', concepts), 'iberico-cheese');
  assert.notEqual(assignConcept('טאפאס גבינות- מארז גבינות מסוג קסטלאנו, איבריקו וקשקבל', concepts), 'iberico-cheese');
});

test('maasdam-cheese: captures a real wedge, defers to processed-cheese for a "גבינה מותכת מאסדם" slice', () => {
  assert.equal(assignConcept('גבינת מאסדם 28% שומן', concepts), 'maasdam-cheese');
  assert.notEqual(assignConcept('גבינה מותכת מאסדם 17% 150 גר` PRESIDENT', concepts), 'maasdam-cheese');
});

test('saint-maure-cheese: the two-word phrase does not swallow the unrelated "סנט מוריץ" cleaning brand', () => {
  assert.equal(assignConcept('גבינת סנט מור 150 גר', concepts), 'saint-maure-cheese');
  assert.notEqual(assignConcept('סנט מוריץ מטבחים מסיר לכלוך קשה ודביק. קל לניגוב', concepts), 'saint-maure-cheese');
});

test('roquefort-cheese: captures a real wedge, not an unrelated fresh-milk product', () => {
  assert.equal(assignConcept('גבינת רוקפור 30%', concepts), 'roquefort-cheese');
  assert.notEqual(assignConcept('חלב טרי 3% 1 ליטר רמי לוי', concepts), 'roquefort-cheese');
});

test('kiri-cheese: the anchored loanword does not swallow "קירין" beer', () => {
  assert.equal(assignConcept('גבינה לה וואש קירי 12 192 גרם', concepts), 'kiri-cheese');
  assert.notEqual(assignConcept('בירה קירין איציבאן 330 מ"ל', concepts), 'kiri-cheese');
});

test('ricotta-cheese: captures the real cheese, not ricotta as an ingredient in a pasta sauce', () => {
  assert.equal(assignConcept('גבינת ריקוטה פרסקה 9% גד 300 גרם', concepts), 'ricotta-cheese');
  assert.notEqual(assignConcept('רוטב לפסטה ריקוטה 500 גרם', concepts), 'ricotta-cheese');
});

test('kash-cheese: the end-anchored word never swallows its own sibling קשקבל', () => {
  assert.equal(assignConcept('גבינת קאש 9% המושבה', concepts), 'kash-cheese');
  assert.notEqual(assignConcept('גבינת קשקבל 200 גרם', concepts), 'kash-cheese');
});

test('pudding-fruit: captures a real fruit dessert, not the pet-food brand "פריסקיז" (starts with the same letters as פרי)', () => {
  assert.equal(assignConcept('מעדן דובדבן ברטה 284 גרם', concepts), 'pudding-fruit');
  assert.notEqual(assignConcept('פריסקיז מזון יבש לחתול מעדני החתול', concepts), 'pudding-fruit');
});

test('pudding-protein: a protein-fortified pudding wins over the plain-fruit reading (mirrors yogurt-protein/yogurt-natural)', () => {
  assert.equal(assignConcept('מעדן חלב מעושר בחלבון בטעם פסק זמן 150גר', concepts), 'pudding-protein');
  assert.notEqual(assignConcept('מעדן תות שדה 100% 284 גרם', concepts), 'pudding-protein');
});

test('pudding-soy: captures a plain soy dessert, defers to pudding-protein when a protein claim is also present', () => {
  assert.equal(assignConcept('מעדן סויה שוקולד אורגני 2*130 גרם', concepts), 'pudding-soy');
  assert.notEqual(assignConcept('מעדן סויה גו 20 גר חלבון תות 200 גר', concepts), 'pudding-soy');
});

test('milk-drink-flavored: captures a fruit-flavoured milk drink, defers to iced-coffee-drink for a coffee one', () => {
  assert.equal(assignConcept('משקה חלב בטעם בננה 1.5% שומן', concepts), 'milk-drink-flavored');
  assert.notEqual(assignConcept("משקה חלב עם קפה אייס קפוצ'ינו 1.5%", concepts), 'milk-drink-flavored');
});

test('almond-milk: requires the שקד word itself, not just any "משקה"', () => {
  assert.equal(assignConcept('משקה שקדים ואורז אורגני', concepts), 'almond-milk');
  assert.notEqual(assignConcept('משקה אורז אורגני', concepts), 'almond-milk');
});

test('kefir-drink: captures the real drink, not kefir lime leaves (a cooking herb sharing the word קפיר)', () => {
  assert.equal(assignConcept('משקה חלבי קפיר 500 מ"ל', concepts), 'kefir-drink');
  assert.notEqual(assignConcept('עלי קפיר ליים יבשים מזרח ומערב 30 גרם', concepts), 'kefir-drink');
});

test('protein-milk-drink: captures a real protein milk drink, defers to yogurt-drink for a yogurt-branded one', () => {
  assert.equal(assignConcept('משקה וניל פרו Pro מועשר בחלבון 1.5% שומן', concepts), 'protein-milk-drink');
  assert.notEqual(assignConcept('משקה יופלה גו חלבון500מ', concepts), 'protein-milk-drink');
});

test('yogurt-sheep: captures כבשים yogurt, not a plain cow-milk tub (which falls to yogurt-plain)', () => {
  assert.equal(assignConcept('יוגורט כבשים 600 גרם', concepts), 'yogurt-sheep');
  assert.notEqual(assignConcept('יוגורט תנובה 1.5% 8*15', concepts), 'yogurt-sheep');
});

test('yogurt-plain: captures a flavourless tub yogurt, not the "פומאז" almond-snack brand that borrows the word', () => {
  assert.equal(assignConcept('יוגורט תנובה 1.5% 8*15', concepts), 'yogurt-plain');
  assert.notEqual(assignConcept('פומאז יוגורט טבעוני שקדים 120 גרם', concepts), 'yogurt-plain');
});

test('condensed-milk: captures the real product, not a "concentrated" milk-and-honey scented fabric softener', () => {
  assert.equal(assignConcept('חלב מרוכז 340 גר', concepts), 'condensed-milk');
  assert.notEqual(assignConcept('מקסימה מרכך כביסה מרוכז חלב ודבש סנו 1 ליטר', concepts), 'condensed-milk');
});

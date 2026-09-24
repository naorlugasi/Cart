import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * Capture / near-miss pairs for the מאפים ולחם round: bread's missing varieties (sourdough,
 * multigrain, gluten-free, rustic, flax, brioche, borodinsky), the עוגה family split by what the
 * shopper is buying (honey / cheese / chocolate / English loaf / bar / yeast / muffin / individual),
 * the פריכיות/פרכיות crispbread family, croissant, two dough varieties, two מאפה varieties, צנימים
 * (rusks, scattered across seven departments before this round), and the widened tortilla-wrap,
 * baguette, phyllo-dough and frozen-pizza-ready rules. The near-miss is the one that holds
 * (docs/CONCEPTS.md, .claude/skills/taxonomy/TRAPS.md): a pattern that captures its target but also
 * grabs the neighbour it must not is a regression whichever line you read first.
 */

const concepts = loadConcepts();
const has = (name, id) => assert.equal(assignConcept(name, concepts), id, name);
const not = (name, id) => assert.notEqual(assignConcept(name, concepts), id, name);

// --- bread: the family already had concepts (rye/whole-wheat/spelt/white-sliced) that were both too
// broad and too narrow at once, same shape as the mushroom bug - so every new sibling defers to the
// grain word an existing sibling already owns.

test('bread-sourdough: captures a plain sourdough loaf, cedes a rye or whole-wheat sourdough to that sibling', () => {
  has('לחם מחמצת אגוזים 550 גרם', 'bread-sourdough');
  not('לחם מחמצת שיפון 550 גרם', 'bread-sourdough'); // goes to bread-rye
  not('לחם מחמצת חיטה מלאה', 'bread-sourdough'); // goes to bread-whole-wheat
});

test('bread-multigrain: captures לחם דגנים, not the "דגנית" bakery brand that merely starts the same', () => {
  has('לחם דגנים 630 גר קונדיטוריה דואט', 'bread-multigrain');
  not('לחם אחיד פרוס דגנית', 'bread-multigrain'); // "דגנית" is a brand (Dganit), not the word דגנים
  not('לחם ירוק מקמח מלא 750 גר דגנית עין בר', 'bread-multigrain'); // same brand, plus מלא already bread-whole-wheat's
});

test('bread-gluten-free: captures a gluten-free loaf, not gluten-free breadcrumbs', () => {
  has('לחם ללא גלוטן פאן בלנקו 250 גר', 'bread-gluten-free');
  not('פירורי לחם ללא גלוטן 200 גרם עתיד ירוק', 'bread-gluten-free'); // breadcrumbs, not a loaf
});

test('bread-rustic: captures לחם כפרי, cedes a rustic rye loaf to bread-rye', () => {
  has('לחם כפרי ללא סוכר 700גר Green lite', 'bread-rustic');
  not('לחם שיפון כפרי 500 גרם', 'bread-rustic');
});

test('bread-flax: captures לחם פשתן, not a plain כפרי loaf with no flax', () => {
  has('לחם פשתן פרוס מזרעי פשתן טחונים 450 גר', 'bread-flax');
  not('לחם כפרי ללא סוכר 700גר Green lite', 'bread-flax');
});

test('bread-brioche: captures a bread-aisle brioche loaf, not a brioche-style cake', () => {
  has('לחם בריוש 410 גר בוטיק האופה', 'bread-brioche');
  not('עוגת בריוש 350 גרם wb חברים', 'bread-brioche');
});

test('bread-borodinsky: both spellings resolve to one concept, cedes a plain rye-labelled loaf to bread-rye', () => {
  has('לחם בורדינסקי 350 גרם', 'bread-borodinsky');
  has('לחם בורודינסקי 350 ג', 'bread-borodinsky');
  not('לחם שיפון בורודינסקי 500 גר', 'bread-borodinsky'); // says שיפון too - bread-rye wins
});

// --- dough: two varieties the family was missing, plus a widened phyllo-dough (פילאס is the same
// dough under a different transliteration, not caught by "פילו" alone).

test('dough-shortcrust: captures a crispy pastry dough, not a crispbread cracker', () => {
  has('בצק פריך מלוח 900ג רמילוי', 'dough-shortcrust');
  not('פריכיות דגנים מצופות', 'dough-shortcrust');
});

test('dough-yeast: captures plain yeast dough, cedes a yeasted puff pastry to puff-pastry-dough', () => {
  has('בצק שמרים קלאסי 1 קג', 'dough-yeast');
  not('בצק שמרים עלים מרודד קפוא', 'dough-yeast');
});

test('phyllo-dough (widened): captures the פילאס spelling too, not a shortcrust dough', () => {
  has('בצק פילאס שלושת האופים 500 גרם', 'phyllo-dough');
  has('בצק פילו יוון קפוא', 'phyllo-dough');
  not('בצק פריך מלוח 900ג רמילוי', 'phyllo-dough');
});

// --- מאפה: two real varieties found while mapping the cluster.

test('pastry-pastel-de-nata: captures the pastel de nata line, not a phyllo pastry', () => {
  has('מאפה פסטל דה נטה רפר', 'pastry-pastel-de-nata');
  not('מאפה פילו במילוי תרד', 'pastry-pastel-de-nata');
});

test('pastry-phyllo-filled: captures a filled phyllo pastry, cedes the feta one to feta-cheese', () => {
  has('מאפה פילו במילוי תרד', 'pastry-phyllo-filled');
  not('מאפה פילו ממולא גבינת פטה 400 גר', 'pastry-phyllo-filled');
});

// --- crispbread: פריכיות/פרכיות is the same product with and without the yud (Naor's complaint) -
// both spellings must resolve to the same concept, cedes the already-owned grain splits (rice/corn/
// legume/buckwheat) to their siblings.

test('פריכיות and פרכיות (no yud) resolve to the same concept', () => {
  const withYud = assignConcept('פריכיות משולשות פלפל', concepts);
  const withoutYud = assignConcept("חטיף פרכיות משולשים 65 גרם שר פיטנס רמי לוי", concepts);
  assert.equal(withYud, 'crispbread-mixed-grain');
  assert.equal(withoutYud, 'crispbread-mixed-grain');
  assert.equal(withYud, withoutYud);
});

test('crispbread-mixed-grain: cedes buckwheat and rice crispbread to their own concepts', () => {
  has('פריכיות 3 דגנים דקות', 'crispbread-mixed-grain');
  not('פריכיות כוסמת 150 גרם', 'crispbread-mixed-grain'); // buckwheat-crispbread
});

test('crispbread-wheat: captures wheat crispbread, cedes rice crispbread to crackers-rice', () => {
  has('פריכיות חיטה מלאה 100 גרם', 'crispbread-wheat');
  not('פריכיות אורז מלא 110 גרם', 'crispbread-wheat');
});

test('crispbread-protein: captures a protein crispbread bar, not a plain wheat one', () => {
  has("פרו אנרג'י פריכיות חלבון בטעם צ'ילי ליים", 'crispbread-protein');
  not('פריכיות חיטה טבעי 70', 'crispbread-protein');
});

// --- croissant: filling flavour is not identity (the engine already strips "במילוי X" before
// matching) - the real split is size/format, so ביס/קטן get their own concept.

test('croissant: captures a plain or filled croissant, cedes the mini/bite pack to croissant-mini', () => {
  has('קרואסון בטעם שוקולד', 'croissant');
  has('מאפה קרואסון עם מילוי שוקולד 300 גר', 'croissant');
  not('קרואסון ביס שוקולד 4יח א', 'croissant');
});

test('croissant-mini: captures the ביס/קטן pack, not a full-size croissant', () => {
  has('קרואסון ביס בטעמים ח', 'croissant-mini');
  not('קרואסון בטעם שוקולד', 'croissant-mini');
});

// --- rusks (added mid-round): צנים is the construct/singular of צנימים, same shape as
// רצפה/רצפות - a plain "צנימ" stem already covers both, but a cookie styled after rusks
// ("עוגיות צנים") must not become a rusk.

test('rusks: captures צנימים wherever it sits today (scattered across seven departments), not a "rusk-style" cookie', () => {
  has('צנימים עם צימוקים 250 גרם POSOLSKIE', 'rusks');
  has('בייק רולס חטיף צנימים בטעם שום', 'rusks'); // currently sits in חטיפים וממתקים
  not('עוגיות צנים פקאן וצי', 'rusks'); // a cookie flavoured "rusk", not a rusk - already "cookies"
});

// --- עוגה: not one concept. Format (yeast dough / muffin / bar-slice / individual pack / English
// loaf) beats flavour (honey / cheese / chocolate), because a flavour word alone is not what the
// shopper is choosing between - and a cake-flavoured protein bar or yogurt is none of them.

test('cake-honey: captures a honey cake, cedes an individual honey-flavoured cake to cake-individual', () => {
  has('עוגת דבש אחווה 400 ג', 'cake-honey');
  not("צוקטה עוגות אישיות  דבש 250גר", 'cake-honey');
});

test('cake-cheese: captures a cheesecake, not a cheesecake-flavoured yogurt or protein snack', () => {
  has('עוגת גבינה פירורים 92 גרם', 'cake-cheese');
  not('יוגורט עוגת גבינה תות 3% 150 גר יופלה', 'cake-cheese');
  not("אול אין חטיף חלבון קרמי עוגת גבינה 42 גר", 'cake-cheese');
});

test('cake-chocolate: captures a chocolate cake, cedes an individual chocolate-flavoured cake to cake-individual', () => {
  has('עוגת הבית שוקולד 400', 'cake-chocolate');
  not("עוגות אישיות בטעם שוקולד עם סוכריות במילוי שוקולד", 'cake-chocolate');
});

test('cake-english: captures the English loaf cake, not a honey cake', () => {
  has('עוגה אנגלית', 'cake-english');
  not('עוגת דבש אחווה 400 ג', 'cake-english');
});

test('cake-bar: captures the עוגת פס bar-slice format, not a same-flavour cake outside that line', () => {
  has('עוגת פס נפוליאון 400 גרם', 'cake-bar');
  not('עוגת נפוליאון 700 גרם', 'cake-bar');
});

test('cake-yeast: captures a yeast cake, not the raw baking-yeast dough it is made from', () => {
  has('עוגת שמרים 400 גרם', 'cake-yeast');
  not('בצק שמרים קלאסי 1 קג', 'cake-yeast');
});

test('cake-muffin: captures the muffin format, beats the honey flavour it also carries', () => {
  has('עוגת מאפין דבש 450 גרם', 'cake-muffin');
  not('עוגת דבש אחווה 400 ג', 'cake-muffin');
});

test('cake-individual: captures an individual cake pack, cedes the muffin format to cake-muffin', () => {
  has('עוגות אישיות רכות עם מילוי קרם בטעם וניל', 'cake-individual');
  not('עוגת מאפין דבש 450 גרם', 'cake-individual');
});

// --- tortilla-wrap (widened): the family already had a concept, but it needed a flour-type word
// (קמח) it did not have - and the same "טורטי" root also names an unrelated wafer/candy line
// ("טורטית", "טורטינה") and a chip snack, both of which must stay out.

test('tortilla-wrap (widened): captures a flour-labelled tortilla sheet, not the טורטית wafer/candy line', () => {
  has('עלי טורטייה מקמח מלא 360 גרם האופה', 'tortilla-wrap');
  has('טורטיה דורום 18*90 ג', 'tortilla-wrap');
  not('טורטית שוקולד לבן 40', 'tortilla-wrap');
  not("חטיף טורטיה בטעם שום בצל 60 גרם אסם", 'tortilla-wrap');
});

// --- baguette (widened): most of the catalog spells it באגט (with an alef) and the old "בגט" pattern
// never matched it - but "לבגט" ("for a baguette") also rides along on deli-meat sandwich fillers and
// mini dinner rolls, both of which must stay out.

test('baguette (widened): captures the באגט spelling, not deli meat "for a baguette" or a mixed rolls/baguette pack', () => {
  has('באגט כפרי', 'baguette');
  has('באגט מאפית', 'baguette');
  not('פסטרמה פרגיות לבגט 1', 'baguette');
  not('מארז 10 לחמניות ביס, לבחירה: בגט לבן / כפרי', 'baguette');
});

// --- frozen-pizza-ready: the existing none-list excluded "זיתי" outright, which blocked every real
// olive-topped pizza along with the snack nibbles it was meant to stop - replaced with a narrower
// exclusion so the nibbles still miss and the real pizzas no longer do.

test('frozen-pizza-ready (widened): captures an olive-topped pizza, not a pizza-flavoured snack nibble', () => {
  has('פיצה מרגריטה זיתים 340 גר רמי לוי', 'frozen-pizza-ready');
  has('פיצה איטלקית דקה בתוספת טבעות זיתים', 'frozen-pizza-ready');
  not('נשנושי פיצה מרגריטה', 'frozen-pizza-ready');
});

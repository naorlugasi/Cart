import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * Capture / near-miss pairs for every concept added to config/concepts/snacks.json in the
 * חטיפים וממתקים round (חטיף/חטיפי, גרעיני, צ'יפס, שוקולד, ביסקוויט). The near-miss is the one that
 * holds: a pattern that captures its target but also grabs the neighbour it must not is a regression
 * whichever line you read first (docs/CONCEPTS.md, .claude/skills/taxonomy/TRAPS.md).
 */

const concepts = loadConcepts();
const has = (name, id) => assert.equal(assignConcept(name, concepts), id, name);
const not = (name, id) => assert.notEqual(assignConcept(name, concepts), id, name);

test('seeds-sunflower: captures roasted sunflower seeds, not a "לחמנייה" bread roll', () => {
  has('גרעיני חמניה 400 גרם', 'seeds-sunflower');
  not('רוסטיק לחמנייה דגנים וגרעינים', 'seeds-sunflower'); // "חמני" sits inside "לחמנייה" (bread roll)
});

test('seeds-pumpkin: captures pumpkin seeds, not sunflower seeds', () => {
  has('גרעיני דלעת 200 גר', 'seeds-pumpkin');
  not('גרעיני חמניה 300 גרם', 'seeds-pumpkin');
});

test('seeds-watermelon: captures watermelon seeds, not the fresh fruit', () => {
  has('גרעיני אבטיח קלויים', 'seeds-watermelon');
  not('אבטיח פרוס טרי', 'seeds-watermelon');
});

test('seeds-popcorn-kernels: captures popping corn, not canned sweet corn', () => {
  has('גרעיני תירס לפופקורן 500 גרם', 'seeds-popcorn-kernels');
  not('גרעיני תירס מתוק 285 גר', 'seeds-popcorn-kernels');
});

test("potato-chip-seasoned: captures a bare \"צ'יפס\" bag, not a fresh potato", () => {
  has('צ\'יפס קלאסי 1.5 ק"ג', 'potato-chip-seasoned');
  not('תפוח אדמה לבן', 'potato-chip-seasoned');
});

test('potato-chip-herrs-shaped: captures the חטיף תפוח אדמה line, not frozen bourekas', () => {
  has('דובונים חטיף תפוח אדמה בטעם שמנת בצל', 'potato-chip-herrs-shaped');
  not('בורקס תפו"א 800 גרם', 'potato-chip-herrs-shaped');
});

test('potato-chip-sweet: captures a room-temperature sweet-potato chip bag, not the frozen fry', () => {
  has('צ\'יפס בטטה עם שום ורוזמרין', 'potato-chip-sweet');
  not('ציפס בטטה קפוא 500ג', 'potato-chip-sweet');
});

test('tortilla-chips-snack: captures the חטיף טורטיה snack, not a plain wrap', () => {
  has('חטיף טורטיה 200 גרם', 'tortilla-chips-snack');
  not('טורטיה חיטה 320 גר רמי לוי', 'tortilla-chips-snack');
});

test('veggie-straws-snack: captures a vegetable-mix straw, not the potato-chip brand that mentions ירקות', () => {
  has('חטיף מיקס ירקות 40 גרם', 'veggie-straws-snack');
  not('חטיף תפוציפס גורמה ירקות שוש 45 גר', 'veggie-straws-snack'); // already תפוצ'יפס
});

test('seaweed-snack: captures a seaweed snack, cedes a sesame-topped one to sesame-seeds', () => {
  has('חטיף אצות ים עם מלח 40.5 גר', 'seaweed-snack');
  not('חטיף אצות ים שקדים ושומשום 50 גר', 'seaweed-snack');
});

test('rice-chip-snack: captures a bold-flavoured rice chip, not a plain rice cracker', () => {
  has('חטיף אורז בטעם מתוק מלוח 120 גרם', 'rice-chip-snack');
  not('חטיפי פריכונים מאורז מלא ודבש אסם 80 גרם', 'rice-chip-snack');
});

test('peanut-snack-bar: captures a generic peanut snack bar, cedes Bamba to its own concept', () => {
  has('חטיף בוטנים עם פצפוצים', 'peanut-snack-bar');
  not('במבה חטיף בוטנים אסם 80 גרם', 'peanut-snack-bar');
});

test('coconut-roll-snack: captures the חטיף רולים קוקוס line, not loose shredded coconut', () => {
  has('חטיף רולים קוקוס טבעי לל"ג אורגני 100 גר', 'coconut-roll-snack');
  not('קוקוס טחון 200 גרם', 'coconut-roll-snack');
});

test('freeze-dried-fruit-snack: captures the "מיובש בהקפאה" phrasing, not a crunchy-dried one', () => {
  has('חטיף תפוח מיובש בהקפאה 20 גרם', 'freeze-dried-fruit-snack');
  not('חטיף מנגו קראנצי20ג פרי', 'freeze-dried-fruit-snack');
});

test('chocolate-bar-snack: captures a branded chocolate snack bar, cedes a protein bar', () => {
  has('חטיף שוקולד ריסז', 'chocolate-bar-snack');
  not('חטיף חלבון פרוטאין מקס טעם שוקולד 55 גרם', 'chocolate-bar-snack');
});

test('chocolate-bar-filled-cream: captures the Dubai-style bar, not a plain milk bar', () => {
  has('שוקולד דובאי במילוי כנאפה וקרמל מלוח', 'chocolate-bar-filled-cream');
  not('שוקולד חלב 100 גרם עלית', 'chocolate-bar-filled-cream');
});

test('chocolate-chips-baking: captures loose baking chips, not a cookie made with them', () => {
  has('שוקולד ציפס מריר 48% מוצקי קקאו', 'chocolate-chips-baking');
  not('עוגיות שוקו ציפס ללא גלוטן 200 גרם', 'chocolate-chips-baking');
});

test('corn-snack-cheese: captures a generic cheese corn puff, cedes the Doritos brand', () => {
  has('חטיף תירס בטעם גבינה 85 גרם', 'corn-snack-cheese');
  not('דוריטוס חטיף תירס בטעם חריף אש עלית 70 גרם', 'corn-snack-cheese');
});

test('biscuit-caramel: captures the Lotus-style biscuit, not the spread jar made from it', () => {
  has('ביסקוויט קרמל לוטוס 217 גרם', 'biscuit-caramel');
  not('ממרח ביסקוויט קרמל לוטוס 400 גרם', 'biscuit-caramel');
});

test('biscuit-nutella: captures the Nutella biscuit stick, not a Petit Beurre pack', () => {
  has('נוטלה ביסקוויט 166 גרם', 'biscuit-nutella');
  not('ביסקוויטים פתי בר', 'biscuit-nutella');
});

test('biscuit-chocolate-coated: captures a chocolate-coated biscuit, cedes a Petit Beurre flavour', () => {
  has('ביסקוויט מצופה שוקולד חלב 200 גר מילקה', 'biscuit-chocolate-coated');
  not('ביסקוויט פתי בר שוקולד אסם 500 גרם', 'biscuit-chocolate-coated');
});

test('biscuit-sandwich-filled: captures a cream-sandwich biscuit, cedes the caramel one', () => {
  has('ביסקוויט סנדוויץ במילוי קרם 250 גר', 'biscuit-sandwich-filled');
  not('ביסקוויט קרמל לוטוס 217', 'biscuit-sandwich-filled');
});

test("biscuit-petit-beurre: captures the פתי בר line, not a plain tea biscuit", () => {
  has('ביסקוויט פתי בר 500 גר', 'biscuit-petit-beurre');
  not('ביסקוויט לתה 335 גרם', 'biscuit-petit-beurre');
});

test('biscuit-plain-tea: captures a Maria/tea biscuit, not the Petit Beurre line', () => {
  has('ביסקוויט מריה 270 גר', 'biscuit-plain-tea');
  not('ביסקוויט פתי בר 500 גר', 'biscuit-plain-tea');
});

test('biscuit-animal-shaped: captures an animal-shaped biscuit, not a plain tea biscuit', () => {
  has('ביסקוויט בצורת חיות בטעם וניל', 'biscuit-animal-shaped');
  not('ביסקוויט לתה 335 גרם', 'biscuit-animal-shaped');
});

test('the two English flavour spellings the chocolate-bar concepts were missing now resolve', () => {
  has('שוקולד לינדור לינדט דארק 60% 100 גר', 'chocolate-bar-dark');
  has('שוקולד לינדור לינדט וואיט 100 גר', 'chocolate-bar-white');
});

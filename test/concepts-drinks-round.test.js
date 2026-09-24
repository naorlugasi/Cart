import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * Round: משקאות (drinks), 24.9. Two cases per new concept - one capture (a real name from
 * data/products.json this round is meant to catch) and one near-miss (a real name, usually from a
 * collision this round found and guarded against, that must NOT resolve to the new concept). The
 * near-miss is what holds: a rule that captures without rejecting anything is unverified.
 *
 * Wine (wine-red/white/rose already existed; this round widened their `any` to catch grape/style words
 * the color words alone missed, added wine-sparkling as a sibling, and found two live false positives
 * along the way - "מרלוזה" (hake fish) swallowed by "מרלו", "רוטב רוזה" (pink pasta sauce) swallowed by
 * "רוזה" - both now guarded and covered here.
 *
 * Spirits (וויסקי/ויסקי, וודקה, ליקר, קוניאק, ברנדי, טקילה, אוזו, וורמוט, קוואס) are one concept per
 * variety, anchored on the spirit word and never the brand that follows it, per the round's brief. Each
 * spirit's near-miss is a real collision this round measured and guarded: whiskey glasses, a vodka-flavoured
 * dairy spread, chocolate bonbons filled with liqueur, cognac-flavoured salami, and a candy branded "Brandy".
 *
 * Juice varieties (juice-apple/tomato/pomegranate/plum/pineapple/cherry/vegetable/beet/grape) split the
 * existing catch-all juice-mixed by named fruit. juice-tomato's near-miss is the round's other live find -
 * canned peeled/crushed tomatoes ("...קלופות במיץ עגבניות") are not tomato juice.
 */

const concepts = loadConcepts();

test('wine-sparkling: captures an explicit sparkling marker, not a color word alone', () => {
  assert.equal(assignConcept('יין מבעבע ארטיומובסק', concepts), 'wine-sparkling');
  assert.equal(assignConcept('יין אדום יבש קברנה סוביניון ויז\'ן טפרברג 750 מ"ל', concepts), 'wine-red');
});

test('wine-sparkling: does not swallow plain sparkling mineral water', () => {
  assert.notEqual(assignConcept('מים מינרלים מבעבעים 1ל נבגלבי', concepts), 'wine-sparkling');
});

test('wine-red: widened grape vocabulary catches a real Malbec with no color word', () => {
  assert.equal(assignConcept('יין אלאמוס מאלבק 750', concepts), 'wine-red');
});

test('wine-red: "מרלו" does not swallow the hake fish "מרלוזה" (a live collision this round found)', () => {
  assert.notEqual(assignConcept('קציצות דג לבישול פילה נסיכה ופילה מרלוזה דלידג 750 גרם', concepts), 'wine-red');
});

test('wine-white: widened grape vocabulary catches a real Riesling with no color word', () => {
  assert.equal(assignConcept('יין בלו נאן ריזלינג', concepts), 'wine-white');
});

test('wine-white: still requires the יין word - a vitamin drink is not wine', () => {
  assert.notEqual(assignConcept('משקה סויה מועשר סידן וויטמינים 1 ליטר', concepts), 'wine-white');
});

test('wine-rose: "רוזה" does not swallow pink pasta sauce (a live collision this round found)', () => {
  assert.notEqual(assignConcept('רוטב לפסטה רוזה 500 גר', concepts), 'wine-rose');
  assert.equal(assignConcept('יין ממורו רוזאטו 750', concepts), 'wine-rose');
});

test('whiskey: captures both common spellings, anchored on the spirit word not the brand', () => {
  assert.equal(assignConcept('וויסקי אברלור 12 שנה 700 מל', concepts), 'whiskey');
  assert.equal(assignConcept('ויסקי ג\'וני ווקר בלאק לייבל סקוטי', concepts), 'whiskey');
});

test('whiskey: does not capture whiskey glasses ("כוסות ויסקי")', () => {
  assert.notEqual(assignConcept('כוסות ויסקי 10 יח`PP הנמל', concepts), 'whiskey');
});

test('vodka: captures a real bottle', () => {
  assert.equal(assignConcept('וודקה אבסולוט 700 מ"ל', concepts), 'vodka');
});

test('vodka: does not capture a vodka-flavoured dairy spread', () => {
  assert.notEqual(assignConcept('וודקה חלבני דאר', concepts), 'vodka');
});

test('liqueur: captures a real bottle', () => {
  assert.equal(assignConcept('ליקר אמרולה 700 מ"ל', concepts), 'liqueur');
});

test('liqueur: does not capture a chocolate bonbon filled with liqueur', () => {
  assert.notEqual(assignConcept('בונבוניירה ממתקי שוקולד מריר עם ליקר רום SHOOTERS RUM', concepts), 'liqueur');
});

test('cognac: captures a real bottle', () => {
  assert.equal(assignConcept('קוניאק דיאו 700 מ"ל VS', concepts), 'cognac');
});

test('cognac: does not capture cognac-flavoured salami', () => {
  assert.notEqual(assignConcept('נקניק סלמי קוניאק זוגלובק 300 גרם', concepts), 'cognac');
});

test('brandy: captures a real bottle', () => {
  assert.equal(assignConcept('ברנדי 10 שנים 750 מ"ל', concepts), 'brandy');
});

test('brandy: does not capture a candy branded "Brandy"', () => {
  assert.notEqual(assignConcept('גראנד ברנדי 555 תפוז', concepts), 'brandy');
});

test('tequila: captures a real bottle', () => {
  assert.equal(assignConcept('טקילה דון חוליו 1942', concepts), 'tequila');
});

test('tequila: does not capture tequila-branded glassware', () => {
  assert.notEqual(assignConcept('כוסיות טקילה 6 יח מסיבה', concepts), 'tequila');
});

test('ouzo: captures a real bottle', () => {
  assert.equal(assignConcept('אוזו פלומארי 1 ליטר', concepts), 'ouzo');
});

test('ouzo: does not capture an unrelated juice', () => {
  assert.notEqual(assignConcept('מיץ תפוזים 500 מ"ל קשת', concepts), 'ouzo');
});

test('vermouth: captures a real bottle', () => {
  assert.equal(assignConcept('וורמוט מרטיני אדום מתוק 750 מ"ל', concepts), 'vermouth');
});

test('vermouth: an ordinary sweet red wine is wine-red, not vermouth', () => {
  assert.equal(assignConcept('יין אדום מתוק ברקן 750 מל', concepts), 'wine-red');
  assert.notEqual(assignConcept('יין אדום מתוק ברקן 750 מל', concepts), 'vermouth');
});

test('kvass: captures both the standard and the short spelling', () => {
  assert.equal(assignConcept('קוואס אוצקובסקי 2 ליטר', concepts), 'kvass');
  assert.equal(assignConcept('משקה מאלט קווס לחם לידסקי 1.5 ליטר', concepts), 'kvass');
});

test('kvass: an ordinary flavoured soft drink is not kvass', () => {
  assert.notEqual(assignConcept('משקה קל בטעם ענבים קש שלוקים', concepts), 'kvass');
});

test('alcoholic-mixed-drink: captures a real RTD can, both כהלי spellings', () => {
  assert.equal(assignConcept('ספרינג אלכוהול וודקה חמוציות 330מ"ל פחית', concepts), 'alcoholic-mixed-drink');
  assert.equal(assignConcept('משקה כהלי מוגזל מתובל ברימון', concepts), 'alcoholic-mixed-drink');
});

test('alcoholic-mixed-drink: does not capture the same brand\'s plain (non-alcoholic) nectar', () => {
  assert.notEqual(assignConcept('ספרינג נקטר אפרסקים', concepts), 'alcoholic-mixed-drink');
});

test('juice-apple: captures apple juice, including the raw-catalog "תפוע" typo', () => {
  assert.equal(assignConcept('מיץ תפוחים 100% 1 ליטר CIDO', concepts), 'juice-apple');
  assert.equal(assignConcept('מיץ 100% תפוע 3 ל', concepts), 'juice-apple');
});

test('juice-apple: fresh apple produce (no juice word) is not juice-apple', () => {
  assert.notEqual(assignConcept('תפוח גאלה טרי ארוז', concepts), 'juice-apple');
});

test('juice-tomato: captures tomato juice', () => {
  assert.equal(assignConcept('מיץ עגבניות 1 ליטר VITA', concepts), 'juice-tomato');
});

test('juice-tomato: does not capture canned peeled tomatoes packed in tomato juice (a live collision this round found)', () => {
  assert.notEqual(assignConcept('עגבניות אדומות קלופות במיץ עגבניות 680גר', concepts), 'juice-tomato');
});

test('juice-pomegranate: captures pomegranate juice', () => {
  assert.equal(assignConcept('מיץ רימונים 100% סחוט טבעי', concepts), 'juice-pomegranate');
});

test('juice-pomegranate: fresh pomegranate produce is not juice-pomegranate', () => {
  assert.notEqual(assignConcept('רימון טרי במשקל', concepts), 'juice-pomegranate');
});

test('juice-plum: captures plum juice', () => {
  assert.equal(assignConcept('מיץ שזיפים 946 מ"ל', concepts), 'juice-plum');
});

test('juice-plum: fresh plums are not juice-plum', () => {
  assert.notEqual(assignConcept('שזיף אדום טרי', concepts), 'juice-plum');
});

test('juice-pineapple: captures pineapple juice', () => {
  assert.equal(assignConcept('מיץ אננס אורגני 250 מ"ל', concepts), 'juice-pineapple');
});

test('juice-pineapple: canned pineapple slices in syrup are not juice-pineapple', () => {
  assert.notEqual(assignConcept('פרוסות אננס בסירופ קל ויליפוד 490 גרם', concepts), 'juice-pineapple');
});

test('juice-cherry: captures cherry juice', () => {
  assert.equal(assignConcept('מיץ דובדבן 100% 1 ליטר תוצרת גרוזיה', concepts), 'juice-cherry');
});

test('juice-cherry: cherry beer (flavour phrase "בתוספת מיץ דובדבנים") stays beer, not juice-cherry', () => {
  assert.equal(assignConcept('בקבוק בירה צ\'רי שוף - בירה חזקה בתוספת מיץ דובדבנים', concepts), 'beer');
});

test('juice-vegetable: captures mixed vegetable juice', () => {
  assert.equal(assignConcept('מיץ ירקות טבעי 1.36 ליטר V8', concepts), 'juice-vegetable');
});

test('juice-vegetable: pure tomato juice is juice-tomato, not the generic vegetable bucket', () => {
  assert.equal(assignConcept('מיץ עגבניות 1 ל', concepts), 'juice-tomato');
  assert.notEqual(assignConcept('מיץ עגבניות 1 ל', concepts), 'juice-vegetable');
});

test('juice-beet: captures beet juice', () => {
  assert.equal(assignConcept('מיץ סלק אורגני נטורפוד 750 מ"ל', concepts), 'juice-beet');
});

test('juice-beet: fresh beet produce is not juice-beet', () => {
  assert.notEqual(assignConcept('סלק אדום טרי במשקל', concepts), 'juice-beet');
});

test('juice-grape: captures tirosh (grape juice) under both word orders', () => {
  assert.equal(assignConcept('מיץ ענבים תירוש אדום', concepts), 'juice-grape');
  assert.equal(assignConcept('מיץ תירוש ענבים 700 מ"ל יקבי כרמל', concepts), 'juice-grape');
});

test('juice-grape: "תירוש" does not capture the unrelated Tirosh cookie brand', () => {
  assert.notEqual(assignConcept('ביסקוויט תירוש חצי מצופה בטעם שוקולד', concepts), 'juice-grape');
});

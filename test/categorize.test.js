import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize } from '../src/catalog/categorize.js';

// Every name below is copied verbatim from data/products.json (including chain truncation and typos) so the
// test tracks real catalog failure modes, not idealized ones. conceptId is whatever build-products.mjs actually
// assigned that product at the time this test was written - re-check with `node scripts/build-products.mjs` if a
// concept file changes and this test starts failing on a case whose point isn't the concept itself.

test('categorize: meat/chicken false positives from bare substrings and flavour words', () => {
  // "דג" (fish) is a substring of "דגני" (cereal) - a bare keyword must not cross a word boundary.
  assert.equal(categorize('דגני בוקר בטעם פירות 375'), 'שימורים');
  // "בקר" (cattle) is a prefix of "בקרדי" (Bacardi) - same boundary bug, different word.
  assert.equal(categorize('בקרדי בריזר אננס 275'), 'משקאות');
  // בקר also means "cow's milk" - a cheese naming its milk source is not meat.
  assert.equal(categorize('גבינת חלומי 24% מחלב בקר 200 גר גד'), 'חלב וביצים');
  // טחון (ground) is also "ground spice" - כורכום here is turmeric powder, not ground meat.
  assert.equal(categorize('כורכום טחון בשקית 100גרם'), 'שימורים');
  // a real chicken sausage/schnitzel is still meat - the guards above must not overreach.
  assert.equal(categorize('נקניקיות עוף 1 ק"ג', 'chicken-sausage'), 'בשר ועוף');
  assert.equal(categorize('שניצל עוף 700 גרם מאמו', 'schnitzel-chicken'), 'בשר ועוף');
  // a soup base flavoured "chicken" is soup, not chicken - "עוף" here is a flavour, not the product.
  assert.equal(categorize('מרק עשיר עוף אטריות'), 'שימורים');
  // same idea with the alternate spelling of the seasoning-mix word (תבול vs תיבול).
  assert.equal(categorize('תערובת תבול גריל עוף100ג'), 'כללי');
});

test('categorize: dairy/bakery keyword collisions', () => {
  // fruit words are also flavours - the dairy word (יוגורט) must win over the fruit word (תות).
  assert.equal(categorize('יוגורט דיאט תות 0% י', 'yogurt-fruit'), 'חלב וביצים');
  // "גיל" (the Tnuva yogurt-drink brand) is a prefix of "גילוח" (shaving) - a shaving gel is not dairy.
  assert.equal(categorize("ג'ל גילוח סנסיטיב לע"), 'ניקיון וטואלטיקה');
  // cheesecake is a cake first, like every other עוגה - not dairy just because it says גבינה.
  assert.equal(categorize('יופלה יוגורט בטעם עוגת גבינה ותות 3% שומן', 'yogurt-fruit'), 'חלב וביצים');
  // a real frozen pizza is bakery...
  assert.equal(categorize('פיצה איטלקית דקה 320 גרם', 'frozen-pizza-ready'), 'מאפים ולחם');
  // ...but a pizza-*flavoured* snack (חטיף) is a snack, not bakery.
  assert.equal(categorize('חטיף דובונים בטעם פיצה'), 'חטיפים וממתקים');
});

test('categorize: snack/drink keyword collisions', () => {
  // "משקה" (a drink) beats שקד (almond) - almond milk is a drink, not a nut snack.
  assert.equal(categorize('אלפרו משקה שקדים 1 ליטר'), 'משקאות');
  // a real roasted cashew/pistachio is still a snack - the drink guard above must not overreach.
  assert.equal(categorize('פיסטוק קלוי עם מלח 1', 'pistachios'), 'חטיפים וממתקים');
  // "XL" is also a size marker on non-drink products (pillows, gloves, trash bags) - it must not
  // stand alone as an energy-drink signal.
  assert.equal(categorize('XL TEN משקה אנרגיה פתוח ללא סוכר 250 מ"ל', 'apple-fresh'), 'משקאות');
  assert.equal(categorize('כרית חלום XL יוחננוף'), 'כללי');
});

test('categorize: produce concepts over-matching processed/prepared/non-food forms', () => {
  // a canned/chopped tomato product still carries the "tomato" concept, but it is not fresh produce.
  assert.equal(categorize('עגבניות חתוכות קוביות בלה איטליה 3*400 גרם', 'tomato'), 'שימורים');
  // the fresh version of the same concept must still work.
  assert.equal(categorize('עגבניות', 'tomato'), 'ירקות ופירות');
  assert.equal(categorize('מלפפון', 'cucumber'), 'ירקות ופירות');
  // dried fruit is a snack-shaped product, not fresh produce.
  assert.equal(categorize('מנגו מיובש ללת"ס 200 גרם'), 'כללי');
  // pickled cucumber is a pantry item.
  assert.equal(categorize('מלפפון בחומץ 13-17 ב', 'pickles'), 'שימורים');
  // "מלון" (melon) is also the second half of "בית מלון" (hotel) - a hotel floor cloth is not a fruit.
  assert.equal(categorize('10מ.רצפה בית מלון VIVI'), 'כללי');
  // a jam and a cooking oil both ride the fruit's own concept ("strawberry-fresh", "grapes") but are pantry goods.
  assert.equal(categorize('טרו ריבת תות 250 גרם', 'strawberry-fresh'), 'שימורים');
  assert.equal(categorize('שמן זרעי ענבים מזוכך750מ', 'grapes'), 'שימורים');
  // a face mask and a floor cleaner ride "cucumber"/"lemon-fresh" the same way - cosmetic/cleaning wins.
  assert.equal(categorize('מסכת מלפפון ותה ירוק400מ', 'cucumber'), 'כללי');
  assert.equal(categorize("אג'קס נוזל לניקוי כללי ורצפות בניחוח לימון", 'lemon-fresh'), 'כללי');
  // a muffin and a sorbet ride "orange-fresh"/"strawberry-fresh" - the dessert word wins.
  assert.equal(categorize('עוגת מאפין תפוז 500גרם', 'orange-fresh'), 'מאפים ולחם');
  assert.equal(categorize('גלידה קרמיסימו סרבט תות לימון 650 גרם', 'strawberry-fresh'), 'חטיפים וממתקים');
  // aioli (a condiment) rides "lemon-fresh" - it is a pantry spread, not fresh lemon.
  assert.equal(categorize('איולי שום לימון עללח', 'lemon-fresh'), 'שימורים');
});

test('categorize: generic packaging/container/quantity words are not category signals', () => {
  // "קשיו" (cashew) is a prefix of "קשיות" (drinking straws) - a real roasted cashew is unaffected.
  assert.equal(categorize('קשיות מנייר 6" 100 יחידו'), 'כללי');
  assert.equal(categorize('קשיו קלוי מומלח אורג'), 'חטיפים וממתקים');
  // "לק" (nail polish) is a prefix of "לקט" (a vegetable/salad mix) - not a cleaning-aisle product.
  assert.equal(categorize('לקט בנגקוק להקפצה 800ג'), 'כללי');
  // "יין" (wine) is a substring of "אלקליין" (alkaline, as in batteries) - not a drink.
  assert.equal(categorize('זוג סוללות אלקליין C רמי לוי'), 'כללי');
  // "שקית" (bag) describes the packaging of almost anything - it must not make a spice a cleaning product.
  assert.equal(categorize('כורכום טחון בשקית 100גרם'), 'שימורים');
  // a real trash bag is still cleaning.
  assert.equal(categorize('שקיות אשפה 50*50 רמי לוי', 'trash-bags'), 'ניקיון וטואלטיקה');
});

test('categorize: tableware/toiletry words beat the "dish" or "aisle" word they sit next to', () => {
  // "קעריות מרק" is soup bowls, not soup; "צלחות מנה" is dinner plates, not a prepared dish.
  assert.equal(categorize('קעריות מרק BASIC'), 'כללי');
  assert.equal(categorize('צלחות מנה עיקרית BASIC'), 'כללי');
  // dishwasher salt and an oat-scented fabric softener are cleaning products, not pantry items.
  assert.equal(categorize('קרפור מלח למדיח כלים'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('מרכך כביסה מקסימה בייבי בתוספת תמצית שיבולת שועל'), 'ניקיון וטואלטיקה');
});

test('categorize: a brand name can accidentally spell a different concept', () => {
  // "הקולה" is a nuts vendor's own brand name, not Coca-Cola - a concept match.all of "קולה" without a
  // "none" exclusion for it wrongly tags roasted cashews as a cola drink.
  assert.equal(categorize('קשיו טבעי קלוף250 הקולה'), 'חטיפים וממתקים');
  assert.equal(categorize('קוקה קולה 1 ליטר.', 'cola'), 'משקאות');
});

test('categorize: concept category wins over keywords, and an unknown conceptId falls back to keywords', () => {
  // a plain milk product: the concept ("milk-1") decides even though nothing here is ambiguous.
  assert.equal(categorize('חלב תנובה בקרטון 1%', 'milk-1'), 'חלב וביצים');
  // a conceptId this build has never heard of (e.g. stale data, or a typo) must not throw - it just
  // falls back to the keyword rules, same as no concept at all.
  assert.equal(categorize('חלב תנובה בקרטון 1%', 'no-such-concept-id'), 'חלב וביצים');
  assert.equal(categorize('דבר לא מוכר', 'no-such-concept-id'), 'כללי');
});

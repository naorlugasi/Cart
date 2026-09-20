import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, CATEGORIES } from '../src/catalog/categorize.js';
import { categoryLabels } from '../src/catalog/categoryLabels.js';
import { conceptFiles, CONCEPTS_DIR, INDEX_FILE } from '../src/catalog/concepts.js';
import { flavourPollution } from '../scripts/category-labels.mjs';
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
    assert.ok(CATEGORIES.includes(category), `${id}: "${category}" is not one of the ten departments`);
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
  assert.equal(categorize('מסכת מלפפון ותה ירוק400מ', 'cucumber'), 'ניקיון וטואלטיקה');
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

test('no new concept takes a product whose name says its word is a flavour', () => {
  // A ratchet, not a target. The walnut concept still holds a chocolate bar "במילוי קרם אגוזים", because the
  // chains that spell the filling out are outvoted by the ones that cut the name short - so the test holds
  // today's count and lets it fall.
  // When a concept round lowers it, lower BASELINE with it; a rise means a new rule matched a flavour word.
  const BASELINE = 51;
  const rows = flavourPollution();
  const total = rows.reduce((n, r) => n + r.hit.length, 0);
  const worst = rows.slice(0, 3).map((r) => `${r.id} ${r.hit.length}/${r.items.length}`).join(', ');
  assert.ok(total <= BASELINE, `${total} products carry their concept's word as a flavour (was ${BASELINE}): ${worst}`);
});

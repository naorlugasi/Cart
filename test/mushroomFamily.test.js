/**
 * The פטריות (mushroom) family review (24.9, Naor's audit of the published catalog). Four separate bugs,
 * measured against the real names in data/prices/<chain>/catalog.full.json (239 products contain "פטרי" in
 * data/products.json):
 *
 * A. WRONG INSIDE the family - a blintz or a cheese named by type (ברי/גאודה, no literal "גבינה") carried
 *    mushroom-button, and the department guard couldn't save them because a fresh-produce concept survives
 *    on ANY ירקות ופירות-labelled product (docs/CONCEPTS.md §12 only catches food/non-food, not this).
 * B. MISSING from the family - שיטאקי, שימאג'י/שימגי, שינוקי and an exotic/duet mix pack had no concept at
 *    all (config/concepts/produce-deli-frozen.json now has mushroom-shiitake/-shimeji/-enoki/-mix).
 * C. INCONSISTENT - portobello spelled four ways (פורטבלה/פורטובלה/פורטבלו/פורטובלו), only three of which
 *    reached mushroom-portobello; a two-variety "דואט"/"צמד"/"מיקס" pack matched button or portobello
 *    arbitrarily instead of matching neither (the same rule already applied to grapes-red/grapes-black for
 *    "ענבים אדומים/שחורים").
 * D. A farm name ("חוות פטריות תקוע") made unrelated garlic/shallot products appear in a mushroom search.
 *
 * Plus the department fix (src/catalog/categorize.js rule 6, חלב וביצים): the blintz/cheese products from A
 * were also wrong on their own, with no concept involved at all - "בלינצ" already routes to מעדנייה
 * (rule 4 already lists it), but "ברי"/"גאודה" were missing from the cheese-by-type-name cluster, so removing
 * the concept alone would have left them falling through to ירקות ופירות via the bare "פטרי" keyword.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept, familiesForCategory } from '../src/catalog/concepts.js';
import { categorize } from '../src/catalog/categorize.js';
import { conceptForCategory } from '../scripts/build-products.mjs';

const concepts = loadConcepts();

/** End-to-end, the same shape conceptCategory.test.js uses: pick a concept, categorize (concept category
 * wins first), then drop the concept if the food/non-food or fresh-department guard rejects it. */
function finalConcept(name) {
  const picked = assignConcept(name, concepts);
  const category = categorize(name, picked);
  return conceptForCategory(picked, category, concepts);
}
function finalDept(name) {
  const picked = assignConcept(name, concepts);
  return categorize(name, picked);
}

test('A: the four wrong-department products no longer carry mushroom-button, and land in their real department', () => {
  const cases = [
    ['בלינצס פטריות 7 יח 4', 'מעדנייה'],
    ['בלינצס תפו"א ופטריות 400 גרם', 'מעדנייה'],
    ['ברי עם פטריות Kaiserei במשקל', 'חלב וביצים'],
    ['גאודה הולנדית פטריות כמהין במשקל', 'חלב וביצים'],
  ];
  for (const [name, dept] of cases) {
    assert.notEqual(assignConcept(name, concepts), 'mushroom-button', `"${name}" must not be mushroom-button`);
    assert.equal(finalDept(name), dept, `"${name}" must land in ${dept}`);
  }
});

test('A near-miss: a real champignon still keeps mushroom-button after the cheese/blintz refusals', () => {
  assert.equal(assignConcept('פטריות שמפיניון', concepts), 'mushroom-button');
  assert.equal(assignConcept('פטריות טרי במגש', concepts), 'mushroom-button');
  assert.equal(assignConcept('פטריות עם שום טרי', concepts), 'mushroom-button', 'garlic as an ingredient, not the farm-name refusal');
});

test('A: truffle is not champignon - a truffle sauce/cheese/mayo never gets a mushroom concept (it may keep its own)', () => {
  for (const name of [
    'מיונז עם פטריות כמהין מאסטר שף 242 גרם',
    'רוטב פטריות כמהין 5%',
    'רביולי פטריות כמהין 330ג',
    'גבינה קשה פטריות כמהין 35%',
  ]) {
    const id = assignConcept(name, concepts);
    assert.ok(id === null || !id.startsWith('mushroom'), `"${name}" must not carry any mushroom concept, got ${id}`);
  }
});

test('B: the previously-missing species each resolve to their own concept', () => {
  // Real names measured from the catalog (24.9) - a bare "... 300 גר"/"גרם" weight suffix trips an
  // unrelated, pre-existing "גר( |$)"/"גרמ" exclusion shared by every concept in this file (button and
  // portobello lose real matches to it too, e.g. "פטריות פורטובלה בייבי מיני 300 גר" - out of scope here).
  const cases = [
    ['פטריות שיטאקי טרי', 'mushroom-shiitake'],
    ['פטריות שיטאקי ארוז', 'mushroom-shiitake'],
    ['פטריות שיטאקי מיובשות', 'mushroom-shiitake', 'dried is still shiitake, sold both ways (like the herb concepts)'],
    ["פטריות שימאג'י לבנות", 'mushroom-shimeji'],
    ['פטריות שימגי חום', 'mushroom-shimeji'],
    ['פטריות שי-מג\'י חוות תקוע', 'mushroom-shimeji', 'hyphen/space variant'],
    ['פטריות שינוקי יחידה', 'mushroom-enoki'],
    ['פטריות אנוקי', 'mushroom-enoki'],
    ['מיקס פטריות אקזוטי 250ג', 'mushroom-mix'],
    ['פטריות צמד אקזוטי', 'mushroom-mix'],
  ];
  for (const [name, id, why] of cases) {
    assert.equal(assignConcept(name, concepts), id, `"${name}" -> ${id}${why ? ` (${why})` : ''}`);
  }
});

test('B near-miss: the geresh in שימאג\'י is stripped by normalizeText, so the pattern is written against the normalized text', () => {
  // Every real spelling variant found in the catalog: attached geresh, attached backtick, hyphen+geresh,
  // and the plain "שימגי" short form - all must normalize down to something mushroom-shimeji's `any` catches.
  const spellings = [
    "פטריות שימאג'י לבן",
    'פטריות שימאג`י לבן חום',
    "פטריות שי-מג'י חוות תקוע",
    'פטריות שי מג\'י לבן תקוע',
    'פטריות שימגי לבנות טרי',
  ];
  for (const name of spellings) assert.equal(assignConcept(name, concepts), 'mushroom-shimeji', name);
});

test('C: all four portobello spellings resolve to mushroom-portobello, never mushroom-button', () => {
  const spellings = ['פורטבלה', 'פורטובלה', 'פורטבלו', 'פורטובלו'];
  for (const word of spellings) {
    const name = `פטריות ${word} ארוז`;
    assert.equal(assignConcept(name, concepts), 'mushroom-portobello', name);
  }
  // Four of the five real names the review flagged as button today (the fifth, "...בייבי מיני 300 גר",
  // trips two pre-existing, unrelated quirks at once - the shared "גר( |$)" weight-suffix exclusion every
  // concept in this file carries, and the תינוקות ("בייבי") department keyword - both out of scope here).
  for (const name of [
    'פטריות פורטבלה אר',
    'פטריות פורטובלה א.אדמה',
    'פטריות פורטובלה מיני',
    'פטריות פורטובלה ערוג',
  ]) {
    assert.equal(assignConcept(name, concepts), 'mushroom-portobello', name);
  }
});

test('C: a two-variety דואט/צמד/מיקס pack matches neither button nor portobello (same rule as grapes-red/black)', () => {
  const cases = [
    'דואט פטריות שמפניון ופורטובלו ארוזות',
    'צמד פטריות שמפיניון',
    'מארז צמד פטריות בייבי פורטבלה',
    'פטריות דואט חום ולבן 600ג',
  ];
  for (const name of cases) {
    const id = assignConcept(name, concepts);
    assert.notEqual(id, 'mushroom-button', name);
    assert.notEqual(id, 'mushroom-portobello', name);
  }
  // They land in mushroom-mix instead of being conceptless.
  assert.equal(assignConcept('דואט פטריות שמפניון ופורטובלו ארוזות', concepts), 'mushroom-mix');
  assert.equal(assignConcept('צמד פטריות שמפיניון', concepts), 'mushroom-mix');
});

test('D: the "חוות פטריות תקוע" farm name does not drag garlic or shallot into any mushroom concept', () => {
  assert.equal(assignConcept('שום פנינה יבש חוות פטריות תקוע 200 גרם', concepts), null);
  assert.equal(assignConcept('בצלצלי שאלוט חוות פטריות תקוע 350 גרם', concepts), null);
  // A real mushroom sold by the same farm still gets its concept - only the farm's non-mushroom lines are refused.
  assert.equal(assignConcept('פטריות שיטאקי חוות תקוע', concepts), 'mushroom-shiitake');
  assert.equal(assignConcept('לקט פטריות למרק חוות תקוע 25 גרם', concepts), null, 'a soup mix, not a fresh mushroom - unrelated to the farm refusal');
});

test('familiesForCategory: the mushroom family now has six members and still needs no families.json change', () => {
  const fams = familiesForCategory('ירקות ופירות', concepts);
  const mushroom = fams.find((f) => f.id === 'mushroom');
  assert.ok(mushroom, 'mushroom family missing');
  assert.deepEqual(
    new Set(mushroom.conceptIds),
    new Set(['mushroom-button', 'mushroom-portobello', 'mushroom-shiitake', 'mushroom-shimeji', 'mushroom-enoki', 'mushroom-mix']),
  );
  assert.equal(mushroom.name, 'פטריות');
});

test('categorize.js rule 6: ברי/גאודה cheese sold by type name reach חלב וביצים even with no concept at all', () => {
  assert.equal(categorize('ברי עם פטריות Kaiserei במשקל', null), 'חלב וביצים');
  assert.equal(categorize('גאודה הולנדית פטריות כמהין במשקל', null), 'חלב וביצים');
  assert.equal(categorize('משולש ברי צרפתי 160 גר', null), 'חלב וביצים');
  assert.equal(categorize('גאודה עיזים כמהין במשקל', null), 'חלב וביצים');
});

test('categorize.js rule 6 near-miss: "ברי" is also the transliterated word for "berry" - only the cheese reaches dairy', () => {
  // Measured against the real catalog (24.9): these all carry no other dairy word either, and would
  // otherwise have landed in חלב וביצים purely off the bare "ברי" stem.
  const notCheese = [
    ['ליסטרין קידס ברי 500', 'כללי'], // a kids' mouthwash, berry-flavoured
    ['משחת כלים סנוסאן ברי', 'כללי'], // dish polish
    ['וינסטון קומפקט ברי פאקט', 'כללי'], // cigarettes
    ["גוג'י ברי", 'כללי'], // goji berries, not brie
    ['גלי בוני פרוט ברי מי', 'כללי'], // a fruit drink/candy
    ['לחם עננים בסגנון ברי', 'מאפים ולחם'], // bread merely styled "in a Brie manner" - it is still bread
  ];
  for (const [name, dept] of notCheese) assert.equal(categorize(name, null), dept, name);
});

test('categorize.js near-miss: "שברי" (shards/crumbs of) must not read as "ש" (with) + "ברי" (Brie)', () => {
  // Same trap docs/CONCEPTS.md documents for "חלבה" inside "מחלבה": a bare stem's word-start boundary
  // normally accepts one glued Hebrew prefix letter (ב/ה/ו/כ/ל/מ/ש), which is exactly wrong here - "ברי"
  // uses its own hard lookbehind instead of the shared wordRule START for this reason.
  assert.notEqual(categorize('שברי פרצל מלוח 200 גרם', null), 'חלב וביצים');
  assert.notEqual(categorize("שברי עוגיות קרמל בטעם שוקולד", null), 'חלב וביצים');
});

test('the four wrong products and the two farm products are all confirmed out of the mushroom family', () => {
  const outOfFamily = [
    'בלינצס פטריות 7 יח 4',
    'בלינצס תפו"א ופטריות 400 גרם',
    'ברי עם פטריות Kaiserei במשקל',
    'גאודה הולנדית פטריות כמהין במשקל',
    'שום פנינה יבש חוות פטריות תקוע 200 גרם',
    'בצלצלי שאלוט חוות פטריות תקוע 350 גרם',
  ];
  for (const name of outOfFamily) {
    const id = assignConcept(name, concepts);
    assert.ok(id === null || !id.startsWith('mushroom'), `"${name}" must not carry a mushroom concept, got ${id}`);
  }
});

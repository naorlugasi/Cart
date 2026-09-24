/**
 * The פטריות (mushroom) family review (24.9, Naor's audit of the published catalog), plus the 24.9
 * re-measure that found the first pass was still too narrow and had introduced one conflict. Measured
 * against the real names in data/prices/<chain>/catalog.full.json (553 unique names contain "פטרי";
 * 239 of them are in data/products.json).
 *
 * First pass - four bugs:
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
 * Department fix (src/catalog/categorize.js rule 6, חלב וביצים): "בלינצ" already routes to מעדנייה (rule 4
 * already lists it), but "ברי"/"גאודה" were missing from the cheese-by-type-name cluster, so removing the
 * concept alone would have left the two cheeses falling through to ירקות ופירות via the bare "פטרי" keyword.
 *
 * Re-measure (24.9, second pass) - accepting all four widened matching from "fresh only" to also allow real
 * sliced/dried forms, which surfaced a fifth bug and three more gaps:
 * E. CONFLICT - widening mushroom-portobello's spellings made it also match beef-steak on "פטריות סטייק
 *    פורטובלה" (a mushroom cap marketed as a steak). A conflict is dropped by the build entirely, worse
 *    than no concept. Fixed on the beef-steak side (config/concepts/meat-fish.json): "פטריות" in its own
 *    `none` - a product about mushrooms is never a beef cut, whatever else it says.
 * F. TOO NARROW - the shared "גר( |$)"/"גרמ" none-entries (used file-wide as a generic exclusion) ate real
 *    button/portobello matches ending in a bare gram weight ("...300 גר"), including one of the five
 *    products this review's item C listed as wrongly-button. Scoped out of the mushroom concepts only
 *    (removed from their `none`, left untouched everywhere else in the file) rather than changed globally.
 * G. TOO NARROW again - the central "kind: fresh" type-word guard (config/concepts/type-words.json) blocked
 *    a sliced ("חתוכ") or dried ("מיובש") mushroom from its own fresh concept, and a SEPARATE department-level
 *    copy of the same guard (categorize.js PROCESSED) then routed the sliced one to שימורים. All six original
 *    mushroom concepts became `kind: "any"` (like the herb concepts - sold both fresh and a legitimate cut/
 *    dried form) with a manually-curated `none` covering the real processed dishes (רוטב/מרק/לקט/פשטידה/...)
 *    that free protection would otherwise have caught; categorize.js's PROCESSED gate is scoped by concept id
 *    (MUSHROOM_CONCEPT_IDS) rather than changed for every ירקות ופירות concept.
 * H. Two more real species were still outside the family with no concept: oyster (אוייסטר) and king oyster /
 *    eryngii (מלך היער, and its own catalog's shorthand "פטריות יער" - see the concept's own comment on why
 *    the bare word is folded in). A pickled/preserved Russian-import range (אופיאטה/גרוזדי/מסליאטה/ברוביצקי/
 *    אסורטי and friends, ~20 real rows once true species duplicates are counted once) is a DELIBERATE
 *    non-concept: several different wild species and brands sold in brine, a pantry item, not one comparable
 *    fresh product - see mushroom-button's `none` and the department-inconsistency note filed in
 *    docs/QUESTIONS-FOR-NAOR.md. Two processed-food classes riding the family word also got explicit
 *    refusals: veggie burgers ("בורגר פטריות טבעוני") and dumplings/shawarma/kebab that merely contain
 *    mushroom as a filling (the same processed-vs-fresh mistake as the blintz in A).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { loadConcepts, assignConcept, matchingConcepts, familiesForCategory } from '../src/catalog/concepts.js';
import { categorize } from '../src/catalog/categorize.js';
import { conceptForCategory } from '../scripts/build-products.mjs';

const concepts = loadConcepts();
const MUSHROOM_FAMILY = new Set([
  'mushroom-button', 'mushroom-portobello', 'mushroom-shiitake', 'mushroom-shimeji',
  'mushroom-enoki', 'mushroom-mix', 'mushroom-oyster', 'mushroom-king-oyster',
]);

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

test('A-class near-miss: a veggie burger or a dumpling/shawarma/kebab with mushroom filling is not fresh mushroom either', () => {
  for (const name of ['בורגר פטריות טבעוני', 'מיני בורגר פטריות טב', 'בורגר פטריות טבעוני 260 גר מרינה']) {
    assert.equal(assignConcept(name, concepts), null, name);
    assert.equal(finalDept(name), 'ירקות ופירות', `${name}: burger still falls to produce via the bare "פטרי" keyword - a pre-existing, unrelated gap outside this review`);
  }
});

test('B: the previously-missing species each resolve to their own concept', () => {
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
    ['פטריות צמד אקזוטי 400 גר', 'mushroom-mix', '24.9 re-measure: this exact row had no concept until the גר/גרמ scoping (bug F)'],
  ];
  for (const [name, id, why] of cases) {
    assert.equal(assignConcept(name, concepts), id, `"${name}" -> ${id}${why ? ` (${why})` : ''}`);
  }
});

test('B near-miss: the geresh in שימאג\'י is stripped by normalizeText, so the pattern is written against the normalized text', () => {
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
    assert.equal(assignConcept(`פטריות ${word} ארוז`, concepts), 'mushroom-portobello', word);
  }
  // All five real names the review flagged as wrongly-button - the fifth ("...בייבי מיני 300 גר") needed
  // bug F fixed first (it carries a bare gram weight the shared none used to reject).
  for (const name of [
    'פטריות פורטבלה אר',
    'פטריות פורטובלה א.אדמה',
    'פטריות פורטובלה בייבי מיני 300 גר',
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

test('E: a portobello "steak" cut no longer conflicts with beef-steak - it resolves to mushroom-portobello alone, in ירקות ופירות', () => {
  const cases = [
    'פטריות סטייק פורטובלה יחידה',
    'סטייק פטריות פורטובלה XL',
    'פטריות סטייק פורטבלה ארוז',
  ];
  for (const name of cases) {
    assert.deepEqual(matchingConcepts(name, concepts).map((c) => c.id), ['mushroom-portobello'], name);
    assert.equal(assignConcept(name, concepts), 'mushroom-portobello', name);
    assert.equal(finalDept(name), 'ירקות ופירות', name);
  }
  // A steak with no "פטריות" in its name is unaffected - the fix excludes "פטריות" from beef-steak, not
  // "סטייק" itself.
  assert.equal(assignConcept('סטייק עוף', concepts), 'beef-steak');
});

test('F/G: plain and sliced/dried button mushrooms - the core of the family - now have a concept and the right department', () => {
  const cases = [
    ['פטריות כפתורים 600 גרם', 'mushroom-button', 'ירקות ופירות'],
    ['פטריות חתוכות רמי לוי 230 גרם', 'mushroom-button', 'ירקות ופירות'],
    ['פטריות חתוך 290 ג 5.5', 'mushroom-button', 'ירקות ופירות'],
    ['פטריות שמפיניון מיובשות 25 גרם', 'mushroom-button', 'ירקות ופירות'],
    ['פטריות שמפניון יבשות בשקית תקוע 25 גרם', 'mushroom-button', 'ירקות ופירות', '"יבש" is a second, separate PROCESSED alternative from "מיובש" and needed its own exemption'],
    ['מארז פטריות בייבי פורטבלה', 'mushroom-portobello', 'ירקות ופירות', '"מארז" (packaging) exempted too - otherwise this fell through to the תינוקות "בייבی" keyword rule, filed in ops/taxonomy/'],
    ['דואט פטריות איטלקי', 'mushroom-mix', 'ירקות ופירות', 'NON_FOOD_SIGNAL\'s bare "טלק" matches inside "איטלקי" - the same substring trap as קולה/גוטוקולה'],
    ['פטריות צמד חמד איטלק', 'mushroom-mix', 'ירקות ופירות', 'a chain-truncated "איטלק" (missing the trailing י) must trip the same guard'],
  ];
  for (const [name, id, dept, why] of cases) {
    assert.equal(assignConcept(name, concepts), id, name);
    assert.equal(finalDept(name), dept, `${name}: department${why ? ` (${why})` : ''}`);
  }
});

test('G near-miss: the "טלק inside איטלקי" and "מארז"/"יבש" department exemptions are scoped to the mushroom family only', () => {
  // A non-mushroom ירקות ופירות concept must still be rejected by the ordinary, unscoped guards.
  assert.notEqual(categorize('עגבניות איטלקיות קלופות בקופסה', 'tomato'), 'ירקות ופירות', 'tomato gets no "איטלקי" exemption');
  // A genuine cosmetic/talc product must still be rejected even when named alongside a mushroom concept id
  // in this test's synthetic call (nonFoodSignalRejects only forgives the exact "טלק inside איטלקי" collision).
  assert.notEqual(categorize('אבקת טלק לתינוקות', 'mushroom-button'), 'ירקות ופירות');
});

test('G near-miss: a real processed dish (sauce, soup, dumpling, spice mix) still gets no mushroom concept, kind: "any" or not', () => {
  for (const name of [
    'רוטב פטריות', 'מרק פטריות', 'לקט פטריות לפסטה', 'תיבולית פטריות קנור', 'פשטידת פטריות 600 גר',
  ]) {
    const id = assignConcept(name, concepts);
    assert.ok(id === null || !id.startsWith('mushroom'), `"${name}" must not carry a mushroom concept, got ${id}`);
  }
  // The department-level scoping (PROCESSED_MINUS_MUSHROOM_FORM) is keyed by concept id, not by category -
  // an unrelated ירקות ופירות concept (tomato) is still blocked from a processed cut by the ordinary PROCESSED gate.
  assert.notEqual(categorize('עגבניות חתוכות בקופסה', 'tomato'), 'ירקות ופירות');
});

test('H: oyster and king-oyster/forest mushrooms now have their own concept', () => {
  const cases = [
    ['פטריות אוייסטר שלמות', 'mushroom-oyster'],
    ['פטריות מלך היער', 'mushroom-king-oyster'],
    ['פטריות בייבי מלך היער', 'mushroom-king-oyster'],
    ['פטריות מלך היער (תקו', 'mushroom-king-oyster', 'a chain-truncated name'],
    ['פטריות יער אורגניות', 'mushroom-king-oyster', "this catalog's own shorthand for מלך היער - see the concept file"],
  ];
  for (const [name, id, why] of cases) {
    assert.equal(assignConcept(name, concepts), id, `${name}${why ? ` (${why})` : ''}`);
    assert.equal(finalDept(name), 'ירקות ופירות', name);
  }
});

test('H: the pickled/preserved Russian-import range is a deliberate non-concept, not a gap', () => {
  for (const name of [
    'פטריות אופיאטה מוחמצ',
    'פטריות אסורטי בחומץ 880 מ"ל',
    'פטריות ברוביצקי במי מלח פוסולסקי דבור680',
    'פטריות גרוזדי בחומץ 880 מ"ל',
    'פטריות לבנות מוחמצות',
    'פטריות מסלטה מוחמצות',
    'לצו פטריות 680 גר',
  ]) {
    const id = assignConcept(name, concepts);
    assert.ok(id === null || !id.startsWith('mushroom'), `"${name}" must not carry a mushroom concept, got ${id}`);
  }
});

test('familiesForCategory: the mushroom family now has eight members and still needs no families.json change', () => {
  const fams = familiesForCategory('ירקות ופירות', concepts);
  const mushroom = fams.find((f) => f.id === 'mushroom');
  assert.ok(mushroom, 'mushroom family missing');
  assert.deepEqual(new Set(mushroom.conceptIds), MUSHROOM_FAMILY);
  assert.equal(mushroom.name, 'פטריות');
});

test('categorize.js rule 6: ברי/גאודה cheese sold by type name reach חלב וביצים even with no concept at all', () => {
  assert.equal(categorize('ברי עם פטריות Kaiserei במשקל', null), 'חלב וביצים');
  assert.equal(categorize('גאודה הולנדית פטריות כמהין במשקל', null), 'חלב וביצים');
  assert.equal(categorize('משולש ברי צרפתי 160 גר', null), 'חלב וביצים');
  assert.equal(categorize('גאודה עיזים כמהין במשקל', null), 'חלב וביצים');
});

test('categorize.js rule 6 near-miss: "ברי" is also the transliterated word for "berry" - only the cheese reaches dairy', () => {
  const notCheese = [
    ['ליסטרין קידס ברי 500', 'כללי'],
    ['משחת כלים סנוסאן ברי', 'כללי'],
    ['וינסטון קומפקט ברי פאקט', 'כללי'],
    ["גוג'י ברי", 'כללי'],
    ['גלי בוני פרוט ברי מי', 'כללי'],
    ['לחם עננים בסגנון ברי', 'מאפים ולחם'],
  ];
  for (const [name, dept] of notCheese) assert.equal(categorize(name, null), dept, name);
});

test('categorize.js near-miss: "שברי" (shards/crumbs of) must not read as "ש" (with) + "ברי" (Brie)', () => {
  assert.notEqual(categorize('שברי פרצל מלוח 200 גרם', null), 'חלב וביצים');
  assert.notEqual(categorize('שברי עוגיות קרמל בטעם שוקולד', null), 'חלב וביצים');
});

test('conflict scan: every name containing "פטרי" in the real catalog has at most one mushroom-family concept', () => {
  // data/prices is a temporary symlink used only for this kind of measurement (removed before commit,
  // docs/CONCEPTS.md §9) - when it is absent (a fresh checkout, CI) this test has nothing to scan and skips
  // rather than fails; re-run with the symlink in place to actually exercise it.
  let files;
  try {
    files = execSync('find -L data/prices -iname catalog.full.json 2>/dev/null').toString().trim().split('\n').filter(Boolean);
  } catch {
    files = [];
  }
  if (files.length === 0) return;
  const names = new Set();
  for (const f of files) {
    const data = JSON.parse(readFileSync(f, 'utf8'));
    for (const it of data.items) if (it.name && it.name.includes('פטרי')) names.add(it.name);
  }
  const mushroomConflicts = [];
  const otherConflicts = [];
  for (const name of names) {
    const hits = matchingConcepts(name, concepts);
    if (hits.length <= 1) continue;
    const ids = hits.map((c) => c.id);
    if (ids.filter((id) => MUSHROOM_FAMILY.has(id)).length > 1) mushroomConflicts.push([name, ids]);
    else if (ids.some((id) => MUSHROOM_FAMILY.has(id))) otherConflicts.push([name, ids]);
  }
  assert.deepEqual(mushroomConflicts, [], 'no name may match two mushroom-family concepts at once');
  // A mushroom concept conflicting with an unrelated dish concept (gyoza-dimsum/shawarma-meat/kebab-frozen)
  // is a pre-existing, separate class of bug (measured: 14 rows, none introduced by this review) - not
  // re-litigated here, just capped so a regression that adds more of them still fails this test.
  assert.ok(otherConflicts.length <= 14, `mushroom-vs-other-concept conflicts grew: ${otherConflicts.length}\n${otherConflicts.map(([n, ids]) => `  ${n} -> ${ids.join(', ')}`).join('\n')}`);
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

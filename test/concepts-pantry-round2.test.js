import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
import { categorize } from '../src/catalog/categorize.js';

/**
 * Round 2 on config/concepts/pantry.json (27.9): synonym coverage for the 42 thin concepts, coverage for
 * the שימורים department (turmeric, skhug, pearl barley/corn grits, oregano/rosemary, hearts of palm,
 * rolled oats, croutons, vanilla extract, corn/coconut/almond flour, diced/peeled/pickled/sundried-piece
 * tomato, ras el hanout), the two missing product types (nuts-pecan restricted to bulk/pantry pecans,
 * instant-noodles/instant-rice for תבשיל), and the coordinator-delegated pickled-mushrooms concept.
 * One capture + one near-miss per new concept - the near-miss is what proves the guard, not the capture.
 */
const concepts = loadConcepts();

const cases = [
  // ---------- coverage: שימורים department ----------
  ['turmeric', 'כורכום טחון 80 גרם', 'חליטת כורכום הדרים 80 גר'],
  ['skhug-red', 'סחוג אדום 150 גרם', 'סחוג ירוק 150 גרם'],
  ['skhug-green', 'סחוג ירוק 200 גרם', 'סחוג אדום 200 גרם'],
  ['pearl-barley', 'גריסי פנינה 1 ק"ג', 'גריסי תירס 700 גר'],
  ['corn-grits', 'גריסי תירס 700 גר', 'גריסי פנינה 1 ק"ג'],
  ['herb-oregano', 'אורגנו 10 גר', "סטרטיני-קרקר עם אורגנו ועגבנייה 250 גרם"],
  ['herb-rosemary', 'רוזמרין 60 גר', 'מרכך רוזמרין מחייה וולדה 150 מ"ל'],
  ['hearts-of-palm', 'לבבות דקל 400 גרם', 'עוגיות בצק עלים לבבות דקל פרנצלוטה 350 ג'],
  ['oats-rolled', 'שיבולת שועל 500 גרם', 'שמפו קמיל בלו סנסיטיב שיבולת שועל 1 ליטר'],
  ['croutons', 'קרוטונים אפויים 400 גר', 'קרוטוני סלט מנה עגבניות'],
  ['vanilla-extract', 'תמצית וניל 50 מ"ל', 'תמצית שקדים 50 גרם'],
  ['flour-corn', 'קמח תירס 1 ק"ג', 'טורטייה קמח תירס 320'],
  ['flour-coconut', 'קמח קוקוס אורגני 500 גרם', 'עוגיות קוקוס לוז מקמח שקדים 230 גרם'],
  ['flour-almond', 'קמח שקדים 250 גר', 'קרקרים מקמח שקדים 120 גרם'],
  ['tomato-diced', 'עגבניות חתוכות דק 400 גר', 'עגבניות מרוסקות 400 גרם'],
  ['tomato-peeled', 'עגבניות מקולפות 400 גרם', 'פולפה עגבניות מקולפות חתוכות דק 690 גרם'],
  ['tomato-pickled', 'עגבניות בחומץ 680 גר', 'עגבניות שרי בחומץ 93'],
  ['tomato-sundried-pieces', 'עגבניות מיובשות בשמן 250 גרם', 'ממרח עגבניות מיובשות 180 גרם'],
  ['ras-el-hanout', 'ראס אל חנות 100 גרם', 'נפטון תערובת תיבול ראס אל חנות'],
  // ---------- missing product type: פקאן, kept to bulk/pantry pecans ----------
  ['nuts-pecan', 'אגוזי פקאן 150 גר', 'דנונה בר פקאן 183 גר'],
  // ---------- missing product type: תבשיל instant dishes ----------
  ['instant-noodles', 'תבשיל אישי נודלס בטעם עוף', 'אטריות 250 גרם'],
  ['instant-rice', 'תבשיל אורז בסגנון מקסיקני', 'אורז לבן 1 ק"ג'],
  // ---------- coordinator-delegated: pickled wild mushrooms ----------
  ['pickled-mushrooms', 'פטריות אופיאטה פוסולסקי דבור 680 גר', 'רוטב פטריות 250 גר'],
];

test('pantry round 2: each new concept captures its real name and rejects its near-miss', () => {
  const failures = [];
  for (const [id, capture, nearMiss] of cases) {
    const got = assignConcept(capture, concepts);
    if (got !== id) failures.push(`CAPTURE ${id}: "${capture}" -> ${got ?? 'null'}`);
    const missed = assignConcept(nearMiss, concepts);
    if (missed === id) failures.push(`NEAR-MISS ${id}: "${nearMiss}" -> ${id} (should not match)`);
  }
  assert.deepEqual(failures, [], `pantry round 2 failures:\n  ${failures.join('\n  ')}`);
});

/**
 * Synonyms job: a sample of the 42 thin concepts must carry a phrase beyond their own display name -
 * concept-synonyms.mjs --file pantry.json is the authoritative check, this locks a few of them in place
 * so a future edit can't quietly drop the new forms.
 */
test('synonym coverage: new forms are present on the previously-thin concepts', () => {
  const byId = Object.fromEntries(concepts.map((c) => [c.id, c]));
  const expectations = [
    ['spice-paprika', 'תבלין פפריקה'],
    ['oil-olive', 'כתית מעולה'],
    ['honey', 'דבש טהור'],
    ['dates', 'תמר'],
    ['mayonnaise', 'מיונז אמיתי'],
    ['spice-cinnamon', 'קנמון'],
    ['couscous', 'קוסקוס ישראלי'],
    ['tuna-salad', 'טונה במיונז'],
  ];
  const failures = [];
  for (const [id, synonym] of expectations) {
    const concept = byId[id];
    if (!concept) { failures.push(`${id}: concept not found`); continue; }
    if (!(concept.synonyms ?? []).includes(synonym)) {
      failures.push(`${id}: missing synonym "${synonym}" (has [${(concept.synonyms ?? []).join(', ')}])`);
    }
  }
  assert.deepEqual(failures, [], `missing synonyms:\n  ${failures.join('\n  ')}`);
});

/**
 * Coordinator's specific ask: three "...פוסולסקי דבור" pickled-mushroom products (gtins 4607065411312,
 * 4607065411329, 4607065411343) sat in ירקות ופירות because their names carry a species word but none of
 * the pickling words the department rule keys on. pickled-mushrooms' category (שימורים) routes them
 * because categorize() consults the concept's category before falling through to CATEGORY_RULES.
 */
test('pickled-mushrooms concept routes the three misfiled פוסולסקי דבור products to שימורים', () => {
  const products = [
    'פטריות אופיאטה פוסול',
    'פטריות מסליאטה פוסולסקי דבור 680 גר',
    'פטריות אסורטי פוסולסקי דבור 680 גר',
  ];
  const failures = [];
  for (const name of products) {
    const conceptId = assignConcept(name, concepts);
    if (conceptId !== 'pickled-mushrooms') {
      failures.push(`${name}: concept -> ${conceptId ?? 'null'} (expected pickled-mushrooms)`);
      continue;
    }
    const dept = categorize(name, conceptId);
    if (dept !== 'שימורים') failures.push(`${name}: department -> ${dept} (expected שימורים)`);
  }
  assert.deepEqual(failures, [], `pickled-mushrooms routing failures:\n  ${failures.join('\n  ')}`);
});

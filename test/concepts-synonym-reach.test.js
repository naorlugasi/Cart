import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept, matchingConcepts } from '../src/catalog/concepts.js';

/**
 * scripts/audit-synonym-reach.mjs (27.9) found 50 synonyms that real products carry but whose own
 * concept claimed none of - the silent-inert shape (garlic-paste/"שום כתוש"): the concept's `match`
 * rule could never reach the very phrase it lists as a synonym. For every rule widened to close one of
 * those gaps, this file captures a real product the fix was for, and a near-miss the widen must still
 * reject - the rejection is what proves the widen was measured, not a blanket loosening
 * (.claude/skills/taxonomy/TRAPS.md #4, #14). Product names are taken verbatim from
 * scripts/concept-round.mjs --diff output against the real catalog.
 */

const concepts = loadConcepts();

/** assignConcept requires a clean single match; matchingConcepts lets a reject assert "not claimed by
 * this concept" even when the name legitimately belongs to a neighbour (so the assertion still holds
 * when the reject is a real product of a sibling concept, not just an unrelated string). */
function claims(id, name) {
  return matchingConcepts(name, concepts).some((c) => c.id === id);
}

const cases = [
  // general.json
  ['baking-paper', 'נייר אפיה 50 יח', 'תבניות אלומיניום פלוס נייר אפייה 32/26 ס"מ L'],
  ['disposable-cups', "כוסות אספרסו 40 יח' רמי לוי", 'כוס אספרסו זכוכית'],

  // beauty.json
  ['nail-polish', '15לקיםLOL מפרידי אצבעות', 'סט צלחות 24 חלקים לבנות'],
  ['brow-pencil', 'עיפרון גבות 25', 'עיפרון עיניים עמיד מים01'],
  ['eye-pencil', 'עיפרון עיניים עמיד מים01', 'עיפרון גבות 25'],
  ['lip-pencil', 'סלפי עיפרון שפתיים 850', 'עיפרון גבות 25'],
  ['eye-liner', 'איילנר טוש שחור', "עיפרון אייליינר שחור"],

  // household.json
  ['body-lotion', 'תחליב גוף לעור יבש', 'אולטרסול בייבינטורל תחליב גוף לתינוק'],
  ['deodorant', 'אקס דיאודורנט דגם אפולו ייבוא', 'קרם גוף רגיל ניוואה'],
  ['hand-soap', 'סבון לידיים בניחוח לבנדר', 'אל סבון לידיים בניחוח אורכידאה'],
  ['plate-disposable-small', 'צלחת קטנה 100 יחידות', 'צלחת קטנה מזכוכית'],
  ['plate-disposable-large', 'צלחת גדולה', 'צלחת גדולה מזכוכית'],
  ['laundry-detergent-powder', 'וניש אבקה לכביסה לבנה', "וניש ג'ל כביסה קונצנטרט"],
  ['dryer-sheets', 'דפי בישום למייבש כביסה בניחוח מרכך כביסה Pure Love', 'מרכך כביסה קונצנטרט 3 ליטר'],
  ['trash-bags', 'שקית אשפה 90*75 גליל רמי לוי', 'שקיות אחסון גדולות למקפיא'],
  ['drain-opener', 'נוזל לפתיחת סתימות ט', 'פותחן קופסאות שימורים'],
  // 29.9, from the frontend's 100 real shopping lists: the words people write, not the words chains print
  ['cloth-floor', 'שלישיית סחבות רצפה', 'מגבונים לחים לרצפה'],
  ['paper-towel', "נייר מגבת תלת שכבתית 3 יח' TNX", 'נייר טואלט 32 גלילים'],

  // pantry.json / pharmacy.json
  ['garlic-powder', 'שום גבישי 100 גר', 'שום טרי קלוף'],
  ['pearl-barley', 'גריסים 500 גרם', 'גריסיני קלאסי מלך הג'],
  ['coffee-instant', 'נס קפה רד מאג טעם חד', 'קפה טורקי טחון'],
  ['spice-cinnamon', 'קנמון טחון במיכל גדול80ג', 'משקה פרו מאפה קינמון לל"ס'],
  ['sweetener', 'תחליף סוכר סביטאנגו', 'סוכר לבן רגיל 1 קג'],

  // dairy-eggs.json
  ['yogurt-goat', 'יוגורט עזים דלי 600ג 5%', 'יוגורט טבעי 3% 200 גרם'],
  ['protein-milk-drink', 'משקה פרו קפה יטבתה 350 מל', 'משקה חלב בטעם תות'],

  // meat-fish.json
  ['lamb-shoulder', 'כתף כבש טרי', 'כתף בקר טרי'],
  ['shawarma-meat', 'שוארמה הודו נ.טרי ארוז', 'חטיף דוריטוס טעם שווארמה'],
  ['turkey-wings', 'כנף הודו טרי', 'כנף עוף חצוי טרי'],
  ['chicken-wings', 'כנף עוף חצוי פרמיום טרי ארוז', 'כנף הודו טרי'],
  ['veggie-meat-chunks', 'נתחונים צמחוניים על בסיס חלבון סויה בטעם שווארמה', 'נתח כתף בקר טרי'],

  // snacks.json
  ['icecream-stick', 'ארטיק קרח דובדבן אננס', 'לקקן פופ ארטיק חמישי'],
  ['cookies', 'עוגיית קרם קפה נמס 200 גר', 'חטיף עוגיית תמר'],
  ['chocolate-gift-box', 'בונבוניירות לינדור 6', 'בונבוניירת ברנדי משובחת'],

  // produce-deli-frozen.json
  ['pear', 'אגסים', 'סיידר קופרברג אגסים'],
  ['bruschetta-topping', 'ברוסקטה בטעם עגבניות', 'עגבניות שרי טריות'],
  ['frozen-fruit', 'פירות קפואים תות 300 גר סנפרוסט', 'פירות טריים מיובאים'],
  ['arugula', 'מיקס ארוגולה צבעוני 300 גר', 'סבון רחצה בניחוח ארוגולה'],

  // bakery.json
  ['bread-white-sliced', 'לחם לבן פרוס בתוספת שמן זית', 'לחם עננים לבן בסגנון בריוש עם פרוסות עבות'],

  // drinks.json
  ['tea-black-other', 'תה שחור בטעם לימון 2', 'תה שחור קלאסי רגיל'],

  // home.json
  ['spoon-serving', 'זוג כפות הגשה ניו יורק שחור', 'כף מטבח רגילה'],
];

for (const [id, hit, reject] of cases) {
  test(`${id}: reaches its own synonym`, () => {
    assert.equal(assignConcept(hit), id, `expected "${hit}" to resolve to ${id}, got ${assignConcept(hit)}`);
  });
  test(`${id}: still rejects the near-miss`, () => {
    assert.equal(claims(id, reject), false, `expected "${reject}" NOT to be claimed by ${id}`);
  });
}

/**
 * A synonym that names a different product is not a reach gap - it is a bad synonym, and the fix was to
 * remove it (TRAPS #2, #18), not to widen the rule to match it. Lock in that these stay unclaimed.
 */
const removedBadSynonyms = [
  ['baking-powder', 'סודה לשתייה 500 גר', 'baking soda is a different product from baking powder'],
  ['cereal-bar', 'מחית לפתן פירות חטיפטף ללא תוספת סוכר', '"חטיפטף" is a baby-food purée brand, not a cereal bar'],
  ['chocolate-bar-filled-cream', "עוגיות סנדוויץ' בטעם שוקולד ממולאות קרם בטעם וניל", 'a filled sandwich cookie is not Dubai-style chocolate'],
  ['water-still', 'בקבוק מים חמים PVC+כיסוי', 'a hot-water bottle is not bottled drinking water'],
  ['almond-milk', 'סבון נוזלי חלב שקדים', 'almond-milk-scented soap is not the almond milk drink'],
];

for (const [id, name, reason] of removedBadSynonyms) {
  test(`${id}: does not claim "${name}" (${reason})`, () => {
    assert.equal(claims(id, name), false);
  });
}

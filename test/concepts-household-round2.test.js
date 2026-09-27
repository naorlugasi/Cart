import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * Second concept round on config/concepts/household.json (27.9): synonym coverage for the 23 thin
 * concepts (findable by one phrasing only), department coverage for ניקיון וטואלטיקה (tablecloths,
 * razor blades, laundry pods, clothespins, bathroom cleaner, plus match widenings for singular/plural
 * and abbreviated forms found in the raw chain catalogs), and the מברשות/toothbrush escape (brand-only
 * names with no "שיניים" word, and truncated names missing the final letter). One capture case and one
 * near-miss per new concept or widening - the near-miss is the one that proves the guard.
 */
const concepts = loadConcepts();

// ---- new concepts ----

test('tablecloth: captures a disposable/roll tablecloth, not a napkin', () => {
  assert.equal(assignConcept('מפת שולחן אלבד עם רנר מודפס', concepts), 'tablecloth-disposable');
  assert.equal(assignConcept('8 מפות שולחן ניילון חתוכות', concepts), 'tablecloth-disposable');
  assert.notEqual(assignConcept('מפיות אירוח', concepts), 'tablecloth-disposable');
});

test('tablecloth: refuses a decorative-name collision with an unrelated concept (תמר/קריסטלי)', () => {
  // "תמר" and "קריסטלי" here are print/colour names on the tablecloth, not a fruit or a syrup brand -
  // guarded off instead of fighting another file's concept for the name (dates / flavored-syrup).
  assert.notEqual(assignConcept('מפה PVC לשולחן 137*240 ס"מ - תמר', concepts), 'tablecloth-disposable');
  assert.notEqual(assignConcept('מפות שישיות עבה במיוחד קריסטלי כחול שמאי', concepts), 'tablecloth-disposable');
});

test('razor-blades: captures a razor blade refill, not a shaving gel', () => {
  assert.equal(assignConcept('16 סכיני גילוח פיוזן', concepts), 'razor-blades');
  assert.notEqual(assignConcept("ג'ל גילוח לעור רגיש ניוואה 200 מ\"ל", concepts), 'razor-blades');
});

test('laundry-detergent-pods: captures a laundry capsule, not a dishwasher capsule', () => {
  assert.equal(assignConcept("אריאל קפסולות לכביסה 50 יחידות", concepts), 'laundry-detergent-pods');
  assert.notEqual(assignConcept('פיירי קפסולות למדיח אורגינל 71 יחידות', concepts), 'laundry-detergent-pods');
});

test('clothespins: captures a clothespin, not a disposable cutlery pack', () => {
  assert.equal(assignConcept('אטבי כביסה 24 יחידות', concepts), 'clothespins');
  assert.notEqual(assignConcept('מזלגות חד פעמי 100 יחידות', concepts), 'clothespins');
});

test('bathroom-cleaner: captures a bathroom cleaner, not a descaler or a disinfectant spray', () => {
  assert.equal(assignConcept('אנטרטיק לניקוי אמבטיה 1 ליטר', concepts), 'bathroom-cleaner');
  // Combined with a descaler claim, the descaler concept owns it (avoids a new conflict).
  assert.notEqual(assignConcept('מסיר אבנית ומנקה לאמבטיה 00', concepts), 'bathroom-cleaner');
  // Combined with a disinfectant claim, disinfectant-spray owns it instead.
  assert.notEqual(assignConcept('מתז לחיטוי וניקוי אמבטיה 99.9% 750 מ"ל', concepts), 'bathroom-cleaner');
});

// ---- match widenings (existing concepts) ----

test('dishwasher-tablets: now also captures a dishwasher capsule, not just a tablet', () => {
  assert.equal(assignConcept('פיירי קפסולות למדיח מירקל 60 יח', concepts), 'dishwasher-tablets');
  assert.equal(assignConcept('טבליות למדיח פיניש', concepts), 'dishwasher-tablets');
});

test('scouring-pad: now also captures the plural "כריות קרצוף", not a sponge or a general cleaner', () => {
  assert.equal(assignConcept('כריות קרצוף נירוסטה', concepts), 'scouring-pad');
  // A pad-and-sponge combo stays sponge's (pre-existing behaviour, preserved by the "ספוג" guard).
  assert.notEqual(assignConcept('כריות קרצוף עם ספוג מקציף, 6 יחידות', concepts), 'scouring-pad');
  // A pad explicitly marketed as a general cleaner stays all-purpose-cleaner's.
  assert.notEqual(assignConcept('כריות קרצוף לניקוי כללי סנו סושי 3 יחידות', concepts), 'scouring-pad');
});

test('cloth-floor: now also captures the singular "מטלית", not a wet wipe', () => {
  assert.equal(assignConcept('מטלית הפלא לרצפה סנו', concepts), 'cloth-floor');
  assert.notEqual(assignConcept('מטלית לחות לרצפה', concepts), 'cloth-floor');
});

test('facial-tissue: now also captures "ממחטות" (nose/pocket tissues), not a baby wipe', () => {
  assert.equal(assignConcept('ממחטות אף קלינקס לושן סופט', concepts), 'facial-tissue');
  assert.notEqual(assignConcept('מגבוני תינוקות רכים', concepts), 'facial-tissue');
});

test('fabric-softener: now also captures the "מ.כביסה" abbreviation, not the detergent it is prefixed to', () => {
  assert.equal(assignConcept('מ.כביסה מרוכז ורוד 1ל LU', concepts), 'fabric-softener');
});

test('toothpaste: now also captures the "מ.שיניים" abbreviation and the plural "משחות שיניים"', () => {
  assert.equal(assignConcept('מ.שיניים פרודונטקס רגישות ורענות 75 מ"ל', concepts), 'toothpaste');
  assert.equal(assignConcept('אורביטול משחות שיניים שלישיה מנטה', concepts), 'toothpaste');
});

test('air-freshener: now also captures "מטהר אוויר" and "בושם לבית", not a floor cleaner', () => {
  assert.equal(assignConcept('סנו מטהר אוויר פרש א', concepts), 'air-freshener');
  assert.equal(assignConcept('סנומוד ליידי קוקו בושם לבית', concepts), 'air-freshener');
  assert.notEqual(assignConcept('נוזל רצפות בניחוח לבנדר', concepts), 'air-freshener');
});

test('floor-cleaner: now also captures plural "רצפות" and "פרקט", not a general-purpose combo', () => {
  assert.equal(assignConcept('אקופרינד-נוזל רצפות 4 ליטר', concepts), 'floor-cleaner');
  assert.equal(assignConcept('נוזל לניקוי פרקט TNX', concepts), 'floor-cleaner');
  // "כללי" in the name means it is a general-purpose cleaner that also does floors - all-purpose-cleaner's.
  assert.notEqual(assignConcept('נוזל לניקוי כללי ורצפות', concepts), 'floor-cleaner');
});

test('all-purpose-cleaner: now also captures "ניקוי רב תכליתי", not a cleaning cloth', () => {
  assert.equal(assignConcept('נוזל ניקוי רב תכליתי', concepts), 'all-purpose-cleaner');
  assert.notEqual(assignConcept('מטלית הפלא לניקוי כללי, מיקרופייבר', concepts), 'all-purpose-cleaner');
});

test('toothbrush: now also captures a brand-only name with no "שיניים" word, and a truncated plural', () => {
  assert.equal(assignConcept('2 מברשות קולגייט סנסטיב', concepts), 'toothbrush');
  assert.equal(assignConcept("ג'ורדן מברשת לילדים 6-9מארז זוג", concepts), 'toothbrush');
  // An electric toothbrush is a different price point/product; excluded so it never mixes with manual ones.
  assert.notEqual(assignConcept('מברשת שיניים חשמלית', concepts), 'toothbrush');
  // A generic cleaning/dust brush is cleaning-brush's, not toothbrush's.
  assert.notEqual(assignConcept('מברשת ניקוי לשיש', concepts), 'toothbrush');
});

test('cleaning-brush: refuses the גורדן/ג\'ורדן dental brand now that toothbrush claims it', () => {
  assert.equal(assignConcept("ג'ורדן מברשת טוטאל קלין סופט", concepts), 'toothbrush');
  assert.notEqual(assignConcept("ג'ורדן מברשת טוטאל קלין סופט", concepts), 'cleaning-brush');
});

// ---- synonym forms (job 1) are present on the thin concepts they were added to ----

test('new synonym forms are present on the previously-thin concepts', () => {
  const byId = new Map(concepts.filter((c) => c.file.endsWith('household.json')).map((c) => [c.id, c]));
  const has = (id, syn) => byId.get(id).synonyms.includes(syn);
  assert.ok(has('deodorant', 'דיאודורנט'));
  assert.ok(has('toothbrush', 'מברשות שיניים'));
  assert.ok(has('toothpaste', 'משחות שיניים'));
  assert.ok(has('fabric-softener', 'מרככי כביסה'));
  assert.ok(has('fabric-softener', 'מרכך לכביסה'));
  assert.ok(has('trash-bags', 'שקית אשפה'));
  assert.ok(has('trash-bags', 'שקיות זבל'));
  assert.ok(has('air-freshener', 'מטהר אוויר'));
  assert.ok(has('air-freshener', 'בושם לבית'));
  assert.ok(has('mouthwash', 'שטיפת פה'));
  assert.ok(has('broom', 'מטאטאים'));
  assert.ok(has('laundry-detergent-powder', 'אבקה לכביסה'));
  assert.ok(has('plate-disposable-large', 'צלחת גדולה'));
  assert.ok(has('body-lotion', 'תחליב גוף'));
  assert.ok(has('plate-disposable-small', 'צלחת קטנה'));
  assert.ok(has('hand-soap', 'סבון לידיים'));
  assert.ok(has('candle-tealight', 'נריות חימום'));
  assert.ok(has('tampons', 'טמפון'));
  assert.ok(has('soap-bar', 'סבון קשיח'));
  assert.ok(has("shaving-gel", "ג'ל לגילוח"));
  assert.ok(has('candle-shabbat', 'נר שבת'));
  assert.ok(has('drain-opener', 'פתיחת סתימות'));
  assert.ok(has('plate-disposable-dessert', 'צלחת לפתן'));
  assert.ok(has('candle-hanukkah', 'נר חנוכה'));
  assert.ok(has('dryer-sheets', 'דפי בישום למייבש'));
  assert.ok(has('shampoo', 'שמפו יבש'));
});

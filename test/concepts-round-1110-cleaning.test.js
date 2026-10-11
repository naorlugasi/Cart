import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - the cleaning round (ניקיון וטואלטיקה, receipt-sim target: 318 no-concept products sold in
 * 3+ chains). Every new leaf gets one name it must capture and one close name it must refuse (the refusal
 * is what holds the rule). Names are real chain names from data/products.json / catalog.full.json.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

test('insect-killer: קוטל (spray/bait) vs דוחה יתושים (repellent, a different concept)', () => {
  is('קוטל חרקים קיי 300 630 מל סנו', 'insect-killer');
  is('רייד קוטל ג\'וקים, נמלים וזוחלים אחרים', 'insect-killer');
  isNot('סנו-די דוחה יתושים כדורי סנו 50 גרם', 'insect-killer');
});

test('mosquito-repellent: דוחה יתושים, not the kill-on-contact concept', () => {
  is('סנו-די דוחה יתושים כדורי סנו 50 גרם', 'mosquito-repellent');
  is('נר ציטרונלה בכוס זכוכית דוחה יתושים 20ש', 'mosquito-repellent');
  isNot('קוטל חרקים קיי 300 630 מל סנו', 'mosquito-repellent');
});

test('moth-repellent: דוחה עש for the closet, not a mosquito product', () => {
  is('הפי ג\'ל דוחה עש ומבשם לארון הבגדים יעקבי', 'moth-repellent');
  isNot('סנו-די דוחה יתושים כדורי סנו 50 גרם', 'moth-repellent');
});

test('kitchen-cleaner: a kitchen spray, not a bathroom one', () => {
  is('אסטוניש מרסס לניקוי המטבח נוסחה מרוכזת 750 מ"ל יעקבי', 'kitchen-cleaner');
  is('דטול תרסיס ניקוי וחיטוי למטבח', 'kitchen-cleaner');
  isNot('אסטוניש פרימיום מרסס לניקוי המקלחון 750 מ"ל יעקבי', 'kitchen-cleaner');
});

test('matches: גפרור, but a grill-brand name that merely contains the stem stays grill-bbq', () => {
  is('גפרור מטבח רגיל 10 יחידות', 'matches');
  is('גפרורי בטיחות - גפרורים ארוכים', 'matches');
  isNot('המנגליסט גפרורים עשירה', 'matches'); // grill-branded accessory, stays grill-bbq
});

test('charcoal-lighter: the firelighter (cubes/liquid); loose charcoal itself stays unassigned (home-round decision, concepts-general-home-round2.test.js: "unassigned charcoal" vs grill-bbq\'s מנגל)', () => {
  is('הפי קוביות דלק לפחמים 24 יחידות יעקבי', 'charcoal-lighter');
  is('מדליק פחם מוצק 40 יחידות', 'charcoal-lighter');
  isNot('פחם למנגל 2 ק"ג', 'charcoal-lighter');
  assert.equal(assignConcept('פחם למנגל 2 ק"ג', concepts), null);
});

test('bamboo-skewers: disposable grilling skewers, not a chicken-thigh skewer meat product', () => {
  is('שיפודי במבוק ג\'מבו 5 ממ 50 יחידות', 'bamboo-skewers');
  isNot('שיפודי פרגית 500 גרם קפוא', 'bamboo-skewers');
});

test('roasting-bags: שקיות צליה, not a plain trash bag', () => {
  is('שקיות צליה הוסטס 10י', 'roasting-bags');
  isNot('שקיות אשפה', 'roasting-bags');
});

test('battery-aa vs battery-aaa: the two sizes never share a concept', () => {
  is('אנרג\'ייזר מקס שמיניית סוללות AA', 'battery-aa');
  isNot('שמיניית סוללות AAA דורסל סימפלי', 'battery-aa');
  is('שמיניית סוללות AAA דורסל סימפלי', 'battery-aaa');
  isNot('אנרג\'ייזר מקס שמיניית סוללות AA', 'battery-aaa');
});

test('battery-c vs battery-d: same split, different sizes', () => {
  is('סוללות פלוס פאוור C דורסל 2 יח', 'battery-c');
  isNot('סוללות מקס D אנרגייזר2יח', 'battery-c');
  is('סוללות מקס D אנרגייזר2יח', 'battery-d');
});

test('battery-lithium-coin: a coin cell, not an AA/AAA/C/D cylinder', () => {
  is('זוג סוללות ליתיום 2016 דורסל', 'battery-lithium-coin');
  isNot('סוללות מקס D אנרגייזר2יח', 'battery-lithium-coin');
});

test('laundry-scent-beads: beads/pearls dropped in the wash, not the fabric softener itself', () => {
  is('לנור כדוריות הבושם אוקיינוס 270 גרם', 'laundry-scent-beads');
  is('מקסימה FOREVER פניני בישום לכביסה fresh linen', 'laundry-scent-beads');
  isNot('מרכך כביסה', 'laundry-scent-beads');
});

test('color-catcher: dye-trapping laundry sheets, named either way', () => {
  is('קולור קאצ\'ר- לוכד צבעים בכביסה 22 דפים', 'color-catcher');
  is('וולייט דפים לשמירה על צבע הבגד 20 יח', 'color-catcher');
  isNot('מרכך כביסה', 'color-catcher');
});

test('dryer-spray: a spray-on dryer product, not the dryer sheet format', () => {
  is('בדין תרסיס למייבש כביסה כחול 500 מ"ל', 'dryer-spray');
  isNot('דפי מייבש', 'dryer-spray');
});

test('makeup-remover-pads: cosmetic remover pads, not plain cotton pads', () => {
  is('פדים להסרת איפור בלונס שלישיה 3*80 יח\'', 'makeup-remover-pads');
  isNot('צמר גפן', 'makeup-remover-pads');
});

test('waxing-strips: ready-made hair-removal wax strips, not a shaving product', () => {
  is('ויט רצועות שעווה מוכנות להסרת שיער לעור רגיל 12 יחידות', 'waxing-strips');
  isNot('קצף גילוח גילט - רגיל 200 מ"ל', 'waxing-strips');
});

test('shaving-foam: shaving foam, sibling of the existing shaving-gel concept', () => {
  is('קצף גילוח גילט - רגיל 200 מ"ל', 'shaving-foam');
  isNot('ג\'ל גילוח', 'shaving-foam');
});

test('aftershave: after-shave balm/cream, not the shaving foam itself', () => {
  is('אפטר שייב קרם לעור רגיש 100 מל', 'aftershave');
  is('קרם לאחר גילוח להזנת העור בתוספת ויטמין E', 'aftershave');
  isNot('קצף גילוח גילט - רגיל 200 מ"ל', 'aftershave');
});

test('hand-sanitizer-gel: alcohol hand gel, not an alcohol wipe for surfaces', () => {
  is('אלכו- ג\'ל H ג\'ל לשמירה על הגיינת הידיים', 'hand-sanitizer-gel');
  isNot('אלכוג\'ל מגבונים למשטחים', 'hand-sanitizer-gel');
});

test('face-wash: a facial cleanser, not a thorough/internal toilet-powder ("פנימי" is not "פנים")', () => {
  is('תרחיץ פנים לכל סוגי העור מכיל 25% קרם לחות', 'face-wash');
  is('MEN גל ניקוי לפנים אפקטיב קר 3 ב 1 150 מ', 'face-wash');
  isNot('המקציפה יעקבי- אבקה לניקוי פנימי יסודי לאסלה', 'face-wash');
});

test('hair-styling-gel: a styling gel, not an eyebrow-mascara gel', () => {
  is('ג\'ל חוחובה חזק שיק קולור', 'hair-styling-gel');
  isNot('BROWITY מסקרה גל לגבות', 'hair-styling-gel');
});

test('hair-mousse: styling mousse for hair, not a bath mousse', () => {
  is('וולה פלקס מוס לשיער גלי ומתולתל 200 מ"ל', 'hair-mousse');
  isNot('מוס רחצה כיף בניחוח קרם עוגיות 150 מ"ל', 'hair-mousse');
});

test('hair-wax: styling wax for hair, distinct from a shoe-polish wax', () => {
  is('ווקס לשיער פנינה רוזנבלום', 'hair-wax');
  isNot('נוזל להברקת נעליים עם ספוג - בצבע שחור YAK', 'hair-wax');
});

test('dustpan: יעה/כף אשפה, but a combo dustpan+broom/brush set gets neither concept', () => {
  is('יעה מתקפל שקוף', 'dustpan');
  is('כף אשפה קטן', 'dustpan');
  isNot('יעה מתקפל+מטאטא יחידה', 'dustpan');
  isNot('יעה מתקפל+מטאטא יחידה', 'broom');
});

test('baking-tray-paper: a cardboard/paper disposable baking tray, out of the aluminum-tray concept', () => {
  is('תבנית אפייה מקרטון מרובעת 3 יחידות', 'baking-tray-paper');
  is('תבניות אפייה מנייר, אינגלישקייק בגודל 6.5*26 ס"מ,', 'baking-tray-paper');
  isNot('תבנית אלומניום 5יח ניקול', 'baking-tray-paper');
});

test('elastic-cover: a stretch nylon/foil cover for bowls or trays, by size letter', () => {
  is('כיסוי ניילון גומי 30 יחידות, L', 'elastic-cover');
  is('כיסוי אלומיניום עם גומי במידה L', 'elastic-cover');
});

test('plate-disposable-medium: the "בינוני" size tier that was missing between small and large', () => {
  is('צלחת בינוני חושן לבן', 'plate-disposable-medium');
  isNot('צלחת ענק צבעוני 25 י', 'plate-disposable-medium');
  is('צלחת ענק צבעוני 25 י', 'plate-disposable-xl');
});

test('widened: disposable-aluminum-trays now also catches the "אלומניום" misspelling (without the extra י)', () => {
  is('תבנית אלומניום 5יח ניקול', 'disposable-aluminum-trays');
});

test('widened: disposable-cutlery now also catches color words and the "ליפתן" teaspoon slang', () => {
  is('מזלגות לבן 100 יחידות', 'disposable-cutlery');
  is('ליפתניות צבעוני 25 י', 'disposable-cutlery');
});

test('widened: descaler now also catches אנטי-קאלק phrasing, but defers to all-purpose-cleaner/toilet-cleaner for their own words', () => {
  is('אנטיקאלק תרסיס להסרת אבנית סנו 1 ליטר', 'descaler');
  is('אנטי קאלק מקלחון דוחה כתמי מים', 'descaler');
  isNot('אנטי קאלק נוזל לניקוי כללי סנו 2 ליטר', 'descaler'); // "כללי" -> all-purpose-cleaner
});

test('widened: all-purpose-cleaner now also catches the "רסס נגב" (spray & wipe) phrasing', () => {
  is('אסטוניש רסס נגב נוסחה מרוכזת 750 מ"ל יעקבי', 'all-purpose-cleaner');
});

test('widened: bathroom-cleaner now also catches "אמבט" (not just "אמבטיה") and "מקלחון"', () => {
  is('KH7 סופר קלינר לחדר האמבט 750 מ"ל', 'bathroom-cleaner');
  is('אסטוניש פרימיום מרסס לניקוי המקלחון 750 מ"ל יעקבי', 'bathroom-cleaner');
});

test('widened: cleaning-wipes now also catches "טואלט" wipes, but defers to toilet-paper for "נייר טואלט"', () => {
  is('מגבוני טואלט לחים בוב ספוג סנו סופט שלישיה 3*48 יחידות', 'cleaning-wipes');
  isNot('מגבוני נייר טואלט 120יח מארז שלישייה', 'cleaning-wipes'); // stays toilet-paper
});

test('widened: body-wash now also catches "מוס רחצה" (bath foam/mousse)', () => {
  is('מוס רחצה כיף בניחוח קרם עוגיות 150 מ"ל', 'body-wash');
});

test('widened: glass-cleaner now also catches a bare "ניקוי חלונות" verb, but defers to squeegee for the tool', () => {
  is('אג\'קס ספריי לניקוי חלונות ומשטחים', 'glass-cleaner');
  isNot('מגב לניקוי חלונות', 'glass-cleaner'); // a squeegee, not a liquid cleaner
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept, conceptById } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - cluster-first round over the three departments owned by this session: ניקיון וטואלטיקה
 * (household.json), בית וכלים (home.json) and the תינוקות/כללי leftovers in general.json. Method:
 * scripts/concept-clusters.mjs (corrected to read the product's own conceptId, not re-test its display
 * name) found the real no-concept clusters; scripts/concept-round.mjs's isolation method (HEAD copies of
 * every other concept file + this session's three, loadConcepts(dir), matched against a products.json
 * snapshot) measured the diff. Every leaf below has one name it must capture and one close name that
 * holds the rule by being refused.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

// --- household.json fixes -------------------------------------------------

test('deodorant: "דאו" is the chains\' own shorthand for דאודורנט, not only the spelled-out word', () => {
  is('דאו אקס ספריי אנטיפרספירנט בלאק 150 מ"ל', 'deodorant');
  is('ניוואה דאו רול און דיפ 50 מ"ל', 'deodorant');
  // Opus review 11.10: the round had a `none` that kept this name OUT of deodorant so it would stay in
  // chocolate-bar-dark - a deodorant filed as chocolate. Without it the name conflicts (null), which drops the
  // wrong chocolate assignment; the real fix is chocolate-bar-dark refusing "דאו" (snacks.json).
  assert.equal(assignConcept('דאו סטיק ריח שוקולד מריר', concepts), null);
  is('דאו אקס ספריי גוף לגבר שוקולד 150 מ"ל', 'deodorant'); // the same patch had emptied these from deodorant
});

test('deodorant (Opus review 11.10): "דאו" is also a "deo" scent word on pads, toilet stickers and a textile disinfectant', () => {
  isNot('תחבושות אולוויז דאו', 'deodorant');
  isNot('דאו קלין מדבקות הפלא לאסלה', 'deodorant');
  isNot('דאו טקסטיל לחיטוי בג', 'deodorant');
});

test('deodorant: the short word still needs a dedicated chocolate-flavoured deodorant to win over chocolate-bar-dark', () => {
  is('אקס דאודורנט בודי ספריי שוקולד Dark Temptation', 'deodorant'); // spelled-out form always wins regardless of scent
});

test('squeegee: bare מגב is the identity (no "לרצפה/לחלונות" marker needed), but מגבת (towel) must not collide', () => {
  is('מגב אייפל ענק פטנט', 'squeegee');
  is('מגב איכותי 55 ס"מ', 'squeegee');
  isNot('מגבת גוף 140*70 ס"מ - מיקס צבעים', 'squeegee'); // bare "מגב" is a prefix of "מגבת" - word-end boundary holds it
});

test('squeegee: a broom/squeegee combo tool stays broom (combo convention), not squeegee too', () => {
  is('מטאטא רגיל', 'broom');
  isNot('מטאטא/מגב סיליקון', 'squeegee');
});

test('candle-party: a numeral birthday candle ("ספרה 7") is still a birthday candle without the word "הולדת"', () => {
  is('נר גדול ספרה 7 עם מע', 'candle-party');
  isNot('נר 48 שעות בכוס זכוכ', 'candle-party'); // a plain glass candle carries none of the party markers
});

test('disposable-cutlery: "קרם" is the cream colour of the plastic, not a flavour filling to strip', () => {
  is('כפיות איכותיות קרם ב', 'disposable-cutlery');
  isNot('כפיות איכותיות בלו ש', 'disposable-cutlery'); // no colour/pattern marker at all - stays uncovered on purpose
});

test('cotton-pads: "100% כותנה" on a bare פדים name is the same product as "צמר גפן", a nursing pad is not', () => {
  is('פדים 100% כותנה מקסי', 'cotton-pads');
  isNot('פדים להנקה 30 יחידות', 'cotton-pads'); // nursing pads are a different product, no cotton word at all
});

test('face-wash: "סבון לפנים" (face soap) is the same product as "ניקוי פנים", a brow soap is not', () => {
  is('סבון פנים לעור יבש 200מל', 'face-wash');
  isNot('סבון גבות חום', 'face-wash'); // eyebrow soap - no "פנים" word
});

test('new leaf: bucket (דלי), with the vegan brand "טבע דלי" and a bucket-packaged wipes product excluded', () => {
  is('דלי אובלי 15 ליטר שופרסל', 'bucket');
  isNot('קבב מהצומח 350 גרם טבע דלי', 'bucket'); // "טבע דלי" is a brand, not a bucket
  isNot('דלי מגבונים לניקוי כללי (400 יח\') רמי לוי', 'bucket'); // the product is wipes; the bucket is packaging
});

test('new leaf: lighter (מצית)', () => {
  is('מצית גז בטיחותית קלי', 'lighter');
  isNot('מדליק פחמים', 'lighter'); // a different product: fire starter fluid/cubes, not a hand lighter
});

test('new leaf: drinking-straws (קשיות), a sour-powder candy stick and a cup-with-straw are not straws', () => {
  is('קשיות מנייר 6" 100 יחידו', 'drinking-straws');
  isNot('קשיות עם אבקה בטעם חמוץ', 'drinking-straws'); // candy, not a straw
  isNot('כוס פלסטיק עם קשית 200 מ"ל - LOL #', 'drinking-straws'); // the product is the cup, the straw is a feature
});

test('new leaf: carpet-cleaner (מנקה שטיחים), a carpet "shampoo" must not also fire the hair-shampoo concept', () => {
  is('תרסיס לניקוי שטיחים', 'carpet-cleaner');
  is('שמפו קצף לנ.שטיחים וניש קליה גולד 600 מל', 'carpet-cleaner');
  isNot('שמפו קצף לנ.שטיחים וניש קליה גולד 600 מל', 'shampoo');
  isNot('שמפו יבש', 'carpet-cleaner'); // plain hair shampoo stays out
});

test('new leaf: toilet-wipes (מגבוני טואלט לחים), distinct from the dry toilet-paper concept', () => {
  is('מגבוני טואלט 5*48 יח LU', 'toilet-wipes');
  isNot('נייר טואלט דו שכבתי 24 גלילים', 'toilet-wipes');
});

test('new leaf: intimate-wash (סבון/ג\'ל לשטיפה אינטימית), distinct from plain liquid soap', () => {
  is('סבון לשטיפה אינטימית250מ', 'intimate-wash');
  isNot('סבון נוזלי לידיים', 'intimate-wash');
});

// --- home.json (בית וכלים) --------------------------------------------------

test('new leaf: towel-bath (מגבת גוף/פנים), kitchen and baby towels are different leaves', () => {
  is('מגבת גוף איכותית (140*70) אפור', 'towel-bath');
  // Opus review 11.10: "פודרה" is the towel's colour. The round excluded it so the towel stayed in face-powder;
  // now it conflicts (null) instead, which is the lesser wrong until face-powder refuses "מגבת" (beauty.json).
  assert.notEqual(assignConcept('מגבת גוף איכותית (140*70) פודרה', concepts), 'face-powder');
  is('רביעיית מגבות ידיים (33*33 ס"מ)', 'towel-bath'); // a hand towel is the third size of the same towel
  isNot('שלישיית מגבות מטבח', 'towel-bath');
});

test('new leaf: towel-kitchen (מגבת מטבח), not the paper towel concept', () => {
  is('שלישיית מגבות מטבח', 'towel-kitchen');
  isNot('מגבות נייר דאבל פאן', 'towel-kitchen');
});

test('new leaf: bed-sheet (סדין), a baby cot sheet stays out (different size tier, not covered here)', () => {
  is('סדין זוגי 200*160 ס"מ - לבן', 'bed-sheet');
  isNot('סדין עם גומי למיטת תינוק 64*140 ס\'\'מ', 'bed-sheet');
});

test('new leaf: pillow (כרית שינה/ישיבה) is a different product from a heating pad with the same head word', () => {
  is('כרית ויסקו', 'pillow');
  isNot('כרית חימום', 'pillow');
});

test('new leaf: heating-pad (כרית חימום), the axis that splits it from the bed pillow above', () => {
  is('כרית חימום לצואר-מדיקספא', 'heating-pad');
  isNot('כרית ויסקו איכותית', 'heating-pad');
});

// --- general.json (תינוקות / כללי) -----------------------------------------

test('new leaf: feeding-bottle (בקבוק לתינוק), a reusable sport water bottle is a different concept', () => {
  is('בקבוק לתינוק 260 מ"ל', 'feeding-bottle');
  isNot('בקבוק אלומיניום 600 מל - מיקי מאוס', 'feeding-bottle');
});

test('new leaf: feeding-training-cup (כוס אימון / כוס הפלא)', () => {
  is('כוס אימון בנים 300מ"ל', 'feeding-training-cup');
  isNot('כוס 200 מ"ל', 'feeding-training-cup');
});

test('new leaf: diaper-rash-cream (קרם/משחת החתלה), a general baby lotion is a different concept', () => {
  is('קמיל בלו קרם החתלה קלנדולה 120 גר דר פיש', 'diaper-rash-cream');
  isNot('קרם לחות לתינוק לפני השינה', 'diaper-rash-cream');
});

test('new leaf: babycare-body-oil (שמן גוף לתינוק), narrowed to oil only so it does not take body-wash down with it', () => {
  is('שמן גוף בייבי כיף 500 מ"ל', 'babycare-body-oil');
  isNot('תחליב רחצה בייבי כיף 1 ליטר', 'babycare-body-oil'); // a liquid wash, stays on the existing body-wash concept
});

test('new leaf: babycare-talc (טלק לתינוק), adult foot talc is excluded', () => {
  is('טלק לתינוק 200 גר תירס', 'babycare-talc');
  isNot('טלק לכפות הרגליים פארם אייד 200 מ"ל', 'babycare-talc');
});

test('new leaf: baby-cereal (דייסת), narrowed away from the rice/oats concepts it would otherwise conflict with', () => {
  is('דייסת וניל מטרנה 200 גרם', 'baby-cereal');
  isNot('דייסת אורז 200 גר מטרנה אסם', 'baby-cereal'); // named loss: falls to rice-white instead of conflicting
});

test('new leaf: feeding-spoon (כפית האכלה), a nursing pad is unrelated', () => {
  is('כפית האכלה מסיליקון רך', 'feeding-spoon');
  isNot('כפית לאספרסו', 'feeding-spoon');
});

test('new leaf: feeding-bib (סינר לתינוק)', () => {
  is('סינר האכלה לתינוק אר', 'feeding-bib');
  isNot('סינר מטבח למבוגרים', 'feeding-bib');
});

test('new leaf: changing-pad (משטח החתלה)', () => {
  is('משטח החתלה (10 יח\') - פישר פרייס', 'changing-pad');
  isNot('קרם החתלה קמיל בלו סנסיטיב 200 גרם', 'changing-pad');
});

// --- Opus review 11.10 of this round: each leaf below was keyed on a word that is not what the product is ---

test('bucket: "דלי" is also the tub a yogurt, pickles or cream cheese is sold in, and a beach toy - the bucket opens the name', () => {
  is('דלי שקוף עם פיה 12 ליטר', 'bucket');
  isNot('יוגורט עיזים דלי 750', 'bucket');
  assert.equal(assignConcept('יוגורט עיזים דלי 750', concepts), 'yogurt-goat'); // the round had turned it into a conflict
  isNot('דלי חמוצים יפנים מונטה קרלו 450 גרם', 'bucket');
  isNot('קרם ציז דלי 16% במשקל', 'bucket');
  isNot('דלי לים הבנאי הצעיר', 'bucket');
});

test('drinking-straws: the straw is the product only when the name opens with it', () => {
  is('225קשיות פלסטיק שחורות', 'drinking-straws');
  isNot('יגרמייסטר 70 ס"ל במארז + קשיות מתכת', 'drinking-straws');
  isNot('קערת פלסטיק עם קשית', 'drinking-straws');
  isNot('קשית להכנת משקה חלב טעם שוקו 30 גרם', 'drinking-straws'); // a flavour straw is a drink mix
  isNot("קשיות 100 יח' משפחתי עם אבקת פרי", 'drinking-straws');
});

test('squeegee: "מגב\'" / "מגב." is also the chains\' abbreviation of מגבונים', () => {
  is('מגב לשיש מתכת להב גומי 25ס"מ', 'squeegee');
  isNot('מגב.הסרת איפור ע.רגי', 'squeegee');
  isNot("מגב' קוויק לניקוי כללי וחיטוי 10יח", 'squeegee');
  isNot('מגב.האגיס ללא בישום 4*56', 'squeegee');
});

test('candle-party: a singular "נר" is a party candle only as a numeral/star/spiral/sparkler; a holder or a scented candle is not', () => {
  is('נר מספר כסף חלק 7', 'candle-party');
  is('נר ספירלה לבן / ורוד', 'candle-party');
  isNot('מעמד נר רגל 11 ס"מ לבן / שחור', 'candle-party');
  isNot('נר ואנילה מאסק לבן 450 ג', 'candle-party');
  isNot('נרות צבעוני 6 שעות ה', 'candle-party'); // a burn time is a Shabbat/holiday candle
});

test('lighter / intimate-wash: fire-starter fluid is not a lighter, a lubricant is not a wash', () => {
  isNot('חומר מצית פחם ועץ', 'lighter');
  isNot('פמינה גל סיכוך אינטימי', 'intimate-wash');
});

test('towel-kitchen is the textile towel; "מגבות מטבח" by the roll or under a paper brand is paper-towel', () => {
  is('זוג מגבות מטבח 100% כותנה 40*60 ס"מ פסים', 'towel-kitchen');
  isNot('מגבות מטבח ניקול שיש', 'towel-kitchen');
  isNot('מגבות מטבח אסותא שיש', 'towel-kitchen');
  is('מגבות מטבח 6גליל כפול כדור פורח', 'paper-towel');
  is('מגבות הפלא בגליל כפול, 6 גלילים במארז', 'paper-towel');
});

test('bed-sheet: "סדיניות" are disposable underpads, not bed linen', () => {
  is('סדין יחיד 200*90 ס"מ - לבן', 'bed-sheet');
  isNot('סדיניות 24 יחידות דיפנד', 'bed-sheet');
  isNot('סדיניות ח"פ 60*90 10 יחי', 'bed-sheet');
});

test('pillow: the plural and a feather pillow are pillows too', () => {
  is('זוג כריות שינה פוך נוצות', 'pillow');
  is('כרית נוצות "עדי" 70*50 ס"מ', 'pillow');
  isNot('כריות יפניות 6 יח', 'pillow');
});

test('cotton-pads: cotton candy is a sweet and cotton swabs are swabs', () => {
  is('צמר גפן רפואי 100 גרם', 'cotton-pads');
  isNot('MOOOSH צמר גפן מתוק', 'cotton-pads');
  isNot('מכונת סוכר צמר גפן מתוק', 'cotton-pads');
  is('מקלוני צמר גפן la belle עץ 300 יח', 'cotton-swabs-picks');
});

test('baby-cereal: an oat or maple porridge is the adult breakfast porridge', () => {
  isNot('דייסת ש.שועל עם פטל אובלקה 5*40גר', 'baby-cereal');
  isNot('שופרייט דייסת מייפל סוכר חום 430 גר', 'baby-cereal');
  is('מטרנה דייסת סולת 200 גרם', 'baby-cereal');
});

test('feeding-spoon: a bowl or a squeeze bottle that comes with a spoon is the bowl / the bottle', () => {
  isNot('קערת האכלה נצמדת עם כפית', 'feeding-spoon');
  isNot('בקבוק האכלה רך עם כפית ומכסה נובי', 'feeding-spoon');
});

test('carpet-cleaner reaches a carpet word 23 characters away', () => {
  is('שמפו לניקוי וחיטוי שוטף של שטיחים ובדי ריפוד', 'carpet-cleaner');
});

test('families (Opus review 11.10): bottles, cups, spoons and bibs are האכלה and oil/talc/diaper cream/changing pad are החתלה וטיפוח - not "מזון תינוקות"', () => {
  const fam = (id) => conceptById(id, concepts).family;
  for (const id of ['feeding-bottle', 'feeding-training-cup', 'feeding-spoon', 'feeding-bib']) assert.deepEqual(fam(id), { id: 'feeding', name: 'האכלה' }, id);
  for (const id of ['babycare-body-oil', 'babycare-talc', 'diaper-rash-cream', 'changing-pad']) assert.deepEqual(fam(id), { id: 'babycare', name: 'החתלה וטיפוח' }, id);
  assert.equal(fam('baby-cereal').id, 'baby'); // the porridge IS baby food
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * The concept round on department כללי (25.9): config/concepts/general.json plus targeted extensions
 * to beauty.json and household.json for the four cosmetic clusters sitting in כללי by mistake (מרכך,
 * עפרון, ספריי, מבשם) and for the largest honest-miscellaneous clusters (clothing, appliances,
 * tobacco brands, beauty tools). See .claude/skills/taxonomy/SKILL.md and TRAPS.md for the procedure.
 * One capture case and one near-miss case per concept touched this round - the near-miss is the one
 * that proves the guard, not the capture. Several near-misses are the exact collisions the round's own
 * measurement surfaced (fabric-softener-shaped מרכך, Lindt/wine אקסלנס, dryer-sheet מבשם, chocolate
 * "אל אם", a skin cream, a dental-floss combo) - not invented examples.
 */
const concepts = loadConcepts();

// --- general.json: clothing --------------------------------------------------------------------

test('boxer-shorts: captures boxer underwear, not plain men\'s briefs', () => {
  assert.equal(assignConcept('זוג בוקסר בנים (12-14) P.JEANS', concepts), 'boxer-shorts');
  assert.notEqual(assignConcept('זוג תחתון גבר (L) BLACK BULL', concepts), 'boxer-shorts');
});

test('mens-underwear: captures men\'s briefs, not absorbent/incontinence underwear', () => {
  assert.equal(assignConcept('זוג תחתון גבר (L) BLACK BULL', concepts), 'mens-underwear');
  // The תחתון headword is dominated by incontinence/absorbent briefs in this catalog - the guard is
  // the missing "גבר", not a none list.
  assert.notEqual(assignConcept('תחתונים סופגים לנשים לאחר לידה M', concepts), 'mens-underwear');
});

test('kids-underwear: captures a basic kids 4-pack, not absorbent training pants', () => {
  assert.equal(assignConcept('רביעיית תחתוני בנים 2-4 בייסיק', concepts), 'kids-underwear');
  assert.notEqual(assignConcept('תחתוני ספיגה לילדים Drynites בנים לגילאי 4-7', concepts), 'kids-underwear');
});

// --- general.json: baby --------------------------------------------------------------------------

test('baby-bottle-nipple: captures a bottle teat, not an unrelated bottle product', () => {
  assert.equal(assignConcept('זוג פטמות זרימה בינונית', concepts), 'baby-bottle-nipple');
  assert.notEqual(assignConcept('בקבוק מים 500 מ"ל', concepts), 'baby-bottle-nipple');
});

// --- general.json: appliances (בית וכלים) ----------------------------------------------------

test('vacuum-cleaner: captures a dry vacuum, not a wet/mop vacuum', () => {
  assert.equal(assignConcept('שואב אבק רובוט ROBO', concepts), 'vacuum-cleaner');
  assert.notEqual(assignConcept('שואב שוטף אלחוטי TINECO S9 ARTIST 40S', concepts), 'vacuum-cleaner');
});

test('wet-dry-vacuum: captures the machine, not the cleaning fluid sold for it', () => {
  assert.equal(assignConcept('שואב שוטף טינקו I5 STRECH PLUS', concepts), 'wet-dry-vacuum');
  // "ריצפז לשואב שוטף" is the Ritzpaz floor-cleaning liquid, not the appliance.
  assert.notEqual(assignConcept('ריצפז לשואב שוטף 1.5 ליטר', concepts), 'wet-dry-vacuum');
});

test('air-conditioner-split: captures a split unit, not a portable one', () => {
  assert.equal(assignConcept('מזגן מפוצל 2 כ"ס אינוורטר', concepts), 'air-conditioner-split');
  assert.notEqual(assignConcept('מזגן נייד 1 כ"ס AURA', concepts), 'air-conditioner-split');
});

test('air-conditioner-portable: captures a portable unit, not a split one', () => {
  assert.equal(assignConcept('מזגן נייד 1.25 כ"ס AURA', concepts), 'air-conditioner-portable');
  assert.notEqual(assignConcept('מזגן מפוצל 2.5 כ"ס אינוורטר', concepts), 'air-conditioner-portable');
});

test('slushie-machine: captures a slush machine, not an ice maker', () => {
  assert.equal(assignConcept('מכונת ברד NINJA FS301', concepts), 'slushie-machine');
  assert.notEqual(assignConcept('מכונת קרח ביתית דגם HZB-12 Q', concepts), 'slushie-machine');
});

test('ice-maker: captures an ice maker, not a slush machine', () => {
  assert.equal(assignConcept('מכונת קרח קרם BH-9941IL', concepts), 'ice-maker');
  assert.notEqual(assignConcept('מכונת ברד 2.5 ליטר NINJA FS301 ME', concepts), 'ice-maker');
});

test('sewing-machine: captures a sewing machine, not a hair clipper', () => {
  assert.equal(assignConcept('מכונת תפירה singer 3323', concepts), 'sewing-machine');
  assert.notEqual(assignConcept('מכונת תספורת METAL אסקו', concepts), 'sewing-machine');
});

test('pressure-washer: captures a pressure washer, not a wet vacuum', () => {
  assert.equal(assignConcept('מכונת שטיפה בלחץ AXON', concepts), 'pressure-washer');
  assert.notEqual(assignConcept('שואב שוטף אלחוטי TINECO S9 ARTIST 40S', concepts), 'pressure-washer');
});

// --- general.json: cigarette brands (כללי stays honest - brand is identity here) --------------

test('cigarettes-pall-mall: captures Pall Mall, not a Winston pack', () => {
  assert.equal(assignConcept('פאל מאל כחול ארוך בודד', concepts), 'cigarettes-pall-mall');
  assert.notEqual(assignConcept('וינסטון כחול בוקס 10 יח', concepts), 'cigarettes-pall-mall');
});

test('cigarettes-winston: captures Winston, not a Pall Mall pack', () => {
  assert.equal(assignConcept('וינסטון אקווה ארוך פאקט', concepts), 'cigarettes-winston');
  assert.notEqual(assignConcept('פאל מאל אדום ארוך בודד', concepts), 'cigarettes-winston');
});

test('cigarettes-lm: captures L&M cigarettes, not the "אל אם" chocolate capsule snack', () => {
  assert.equal(assignConcept('אל אם בלו לייבל קצר', concepts), 'cigarettes-lm');
  // The round's own measurement found this real collision: a chocolate snack also named "אל אם".
  assert.notEqual(assignConcept('אל אם קפסולה קליק פאקט', concepts), 'cigarettes-lm');
});

test('cigarettes-ld: captures LD, not the sibling L&M brand', () => {
  assert.equal(assignConcept('אל די כחול פאקט', concepts), 'cigarettes-ld');
  assert.notEqual(assignConcept('אל אם בלו לייבל קצר', concepts), 'cigarettes-ld');
});

// --- general.json: cotton-swabs-picks extended to toothpicks -----------------------------------

test('cotton-swabs-picks: captures a plain toothpick pack, not a floss-combo pick (dental-floss wins)', () => {
  assert.equal(assignConcept('קיסמי שיניים דנטליים 180 יח', concepts), 'cotton-swabs-picks');
  assert.notEqual(assignConcept('קיסמי שיניים משולב בחוט דנטלי פחם 36 יח', concepts), 'cotton-swabs-picks');
});

// --- beauty.json: new concepts -------------------------------------------------------------------

test('skin-tint: captures a standalone skin tint, not a tint foundation stick', () => {
  assert.equal(assignConcept('טיינט אידול אולטרה 105W', concepts), 'skin-tint');
  // The round's own measurement found this: "טיינט" as a modifier on an explicit foundation stick.
  assert.notEqual(assignConcept('טיינט מייק אפ סטיק 032', concepts), 'skin-tint');
});

test('hair-color-excellence: captures the L\'Oreal Excellence hair-dye shade, not Lindt Excellence chocolate', () => {
  assert.equal(assignConcept('אקסלנס קרם 5 חום טבעי', concepts), 'hair-color-excellence');
  // The round's own measurement found this real collision: אקסלנס is also a Lindt chocolate line.
  assert.notEqual(assignConcept('לינדט אקסלנס 70% 100 גרם', concepts), 'hair-color-excellence');
});

test('beauty-tweezers: captures tweezers, not a nail clipper from the same brand', () => {
  assert.equal(assignConcept('TITANIA פינצטה ישרה 9.5 ס"מ', concepts), 'beauty-tweezers');
  assert.notEqual(assignConcept('TITANIA קוצץ צפרניים קטן 6 סמ', concepts), 'beauty-tweezers');
});

test('nail-file: captures a nail file, not tweezers from the same brand', () => {
  assert.equal(assignConcept('TITANIA פצירה סולינגן 17 סמ', concepts), 'nail-file');
  assert.notEqual(assignConcept('TITANIA פינצטה ישרה סולינגן 8 סמ', concepts), 'nail-file');
});

test('nail-clipper: captures nail clippers, not a nail file from the same brand', () => {
  assert.equal(assignConcept('TITANIA קוצץ צפרניים גדול 8 סמ', concepts), 'nail-clipper');
  assert.notEqual(assignConcept('TITANIA פצירה סולינגן 19.5 סמ', concepts), 'nail-clipper');
});

test('pedicure-tool: captures a TITANIA pedicure tool, not a TITANIA nail clipper', () => {
  assert.equal(assignConcept('TITANIA 17 CM מכשיר פדי מנירוסטה', concepts), 'pedicure-tool');
  assert.notEqual(assignConcept('TITANIA קוצץ צפרניים קטן 5.3 סמ', concepts), 'pedicure-tool');
});

test('body-mist-brazilian: captures the Brazilian body-mist line, not the DAVE deodorant spray', () => {
  assert.equal(assignConcept('ברזיליאן מיסט 40 90 מ"ל', concepts), 'body-mist-brazilian');
  assert.notEqual(assignConcept('ספריי DAVE אינויזיבל פרש 150 מל', concepts), 'body-mist-brazilian');
});

test('hair-clipper: captures a hair clipper, not a sewing machine', () => {
  assert.equal(assignConcept('מכונת תספורת C.B.D', concepts), 'hair-clipper');
  assert.notEqual(assignConcept('מכונת תפירה singer 3323', concepts), 'hair-clipper');
});

// --- beauty.json: existing concepts widened this round -----------------------------------------

test('lip-pencil widened: captures the DUCK PLUMP variety of עפרון תוחם, not the LINE LOUD (eye) variety', () => {
  assert.equal(assignConcept('עפרון תוחם 01 DUCK PLUMP', concepts), 'lip-pencil');
  assert.notEqual(assignConcept('עפרון תוחם 03 LINE LOUD', concepts), 'lip-pencil');
});

test('eye-pencil widened: captures עינים spelled without the extra vav, not the DUCK PLUMP (lip) variety', () => {
  assert.equal(assignConcept('עפרון עינים הי פרסיזן02', concepts), 'eye-pencil');
  assert.notEqual(assignConcept('עפרון תוחם 02 DUCK PLUMP', concepts), 'eye-pencil');
});

test('contact-lens-clear widened: captures Dailies AquaComfort Plus, not a colored lens', () => {
  assert.equal(assignConcept('1.25 AquaComfort plus', concepts), 'contact-lens-clear');
  assert.notEqual(assignConcept('עדשות מגע צבעוניות טורקיז', concepts), 'contact-lens-clear');
});

// --- household.json: existing concepts widened this round --------------------------------------

test('conditioner-hair widened: captures a cream-form conditioner, not a hand cream that merely says מרכך', () => {
  assert.equal(assignConcept('מרכך קרמה מן קרטין ושמן ארגן 500 מ"ל', concepts), 'conditioner-hair');
  // The round's own measurement found this real collision before the קרמ(?!ה) fix.
  assert.notEqual(assignConcept('קרם ידיים מרכך ומזין בוטני 125 מ"ל', concepts), 'conditioner-hair');
});

test('air-freshener widened: captures a fabric-spray freshener, not a dryer-sheet scent booster', () => {
  assert.equal(assignConcept('מבשם בדים 350מ"ל ארומטי', concepts), 'air-freshener');
  assert.notEqual(assignConcept('מבשם ומרכך למייבש כביסה Blue Blossom', concepts), 'air-freshener');
});

test('deodorant widened: captures the DAVE body spray, not the unrelated Brazilian body mist', () => {
  assert.equal(assignConcept('ספריי DAVE אינויזיבל פרש 150 מל', concepts), 'deodorant');
  assert.notEqual(assignConcept('ברזיליאן מיסט 40 90 מ"ל', concepts), 'deodorant');
});

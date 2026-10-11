import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * Second round on config/concepts/general.json and config/concepts/home.json (27.9):
 *
 *   1. synonyms - 14 general.json + 12 home.json concepts were findable by exactly one phrasing
 *      (node scripts/concept-synonyms.mjs). Added the singular/plural/construct/spelling forms a
 *      shopper actually types, verified against the chains' raw names.
 *   2. coverage - the two worst departments (כללי 87% without a concept, בית וכלים 84%): widened
 *      disposable-cutlery to the brand/style variants that never say "חד פעמי" (Conchetto, "שקוף",
 *      "קרם", "נצנץ"...), and wrote new concepts for families the department clusters turned up
 *      (disposable-bowls, קומקום חשמלי, מנגל, בלנדר, מלקחיים, מספריים).
 *   3. מפה (tablecloth) - a missing product type, split disposable vs reusable the way cups/plates are.
 *
 * One capture case and one near-miss case per new or widened concept - the near-miss is the one that
 * proves the guard, not the capture. Several near-misses are the exact collisions this round's own
 * measurement (concept-round.mjs --diff) surfaced: a razor blade, a foot cream, a bowl bundled with a
 * mixer, ramen noodles served "in a bowl", a grill-cleaning brush, charcoal "for the grill", a candy
 * shaped like rock-paper-scissors, soy sauce in a plastic bottle - not invented examples.
 * See .claude/skills/taxonomy/SKILL.md and TRAPS.md for the procedure.
 */
const concepts = loadConcepts();

// --- 1. SYNONYMS -----------------------------------------------------------------------------

/** Every phrase this round added, per concept - the singular/plural/spelling-variant trap TRAPS.md
 * keeps naming. Checked against the synonyms array a downstream free-text resolver (cartBackend's
 * GET /catalog/concepts) reads separately from this file's match engine. */
test('round-2 synonym additions are present on their concepts', () => {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const expected = {
    // general.json
    pacifier: ['מוצץ', 'מוצצים'],
    'disposable-plates': ['צלחות חד פעמיות', 'צלחת חד פעמית'],
    'plastic-wrap': ['ניילון נצמד', 'ניילונית נצמד'],
    'baking-paper': ['נייר אפייה', 'נייר אפיה'],
    'cigarettes-pall-mall': ['פאל מאל', 'פאלמאל'],
    'cigarettes-winston': ['וינסטון', 'ווינסטון'],
    'nail-polish-remover': ['מסיר לק', 'אצטון'],
    'air-conditioner-split': ['מזגן מפוצל', 'מזגנים מפוצלים'],
    'reading-glasses': ['משקפי קריאה', 'משקפיים לקריאה'],
    'vacuum-cleaner': ['שואב אבק', 'שואבי אבק'],
    'cooler-bag': ['צידנית', 'צידניות'],
    'air-conditioner-portable': ['מזגן נייד', 'מזגנים ניידים'],
    'ice-maker': ['מכונת קרח', 'מכונות קרח'],
    'sewing-machine': ['מכונת תפירה', 'מכונות תפירה'],
    // home.json
    'plate-melamine': ['צלחת מלמין', 'צלחות מלמין'],
    'plate-glass': ['צלחת זכוכית', 'צלחות זכוכית'],
    'tray-oval': ['מגש אובלי', 'מגשים אובלים'],
    'tray-round': ['מגש עגול', 'מגשים עגולים'],
    'tray-square': ['מגש מרובע', 'מגשים מרובעים'],
    'pot-stainless': ['סיר נירוסטה', 'סירים נירוסטה'],
    'pan-stainless': ['מחבת נירוסטה', 'מחבתות נירוסטה'],
    'bowl-melamine': ['קערית מלמין', 'קעריות מלמין'],
    'bowl-set': ['סט קערות', 'מארז קערות'],
    'spoon-serving': ['כף הגשה', 'כפות הגשה'],
    'storage-box-set': ['סט קופסאות', 'מארז קופסאות'],
    'bottle-opener-set': ['שלישיית פותחנים', 'סט פותחנים'],
  };
  const missing = [];
  for (const [id, phrases] of Object.entries(expected)) {
    const c = byId.get(id);
    assert.ok(c, `concept ${id} still exists`);
    for (const phrase of phrases) {
      if (!c.synonyms.includes(phrase)) missing.push(`${id}: missing "${phrase}"`);
    }
  }
  assert.deepEqual(missing, [], `synonym forms missing:\n  ${missing.join('\n  ')}`);
});

/** node scripts/concept-synonyms.mjs --file general.json / --file home.json must report 0 thin
 * concepts for both files once this round lands - checked here so a future edit that quietly drops
 * a synonym trips a test instead of waiting for the next manual run of that script. */
test('no general.json or home.json concept is findable by only one phrasing', () => {
  const thin = [];
  for (const c of concepts) {
    if (c.file !== 'general.json' && c.file !== 'home.json') continue;
    const phrases = new Set([c.name, ...(c.synonyms ?? [])].filter(Boolean));
    if (phrases.size <= 1) thin.push(c.id);
  }
  assert.deepEqual(thin, [], `thin concepts remaining: ${thin.join(', ')}`);
});

// --- 2. COVERAGE: disposable-cutlery widened --------------------------------------------------

test('disposable-cutlery: captures a Conchetto-brand party fork with no "חד פעמי" in its name, not a disposable razor', () => {
  assert.equal(assignConcept("מזלג קונצ'טו (10יח') ורוד זהב CONCHETO", concepts), 'disposable-cutlery');
  // "6סכין גילוח חדפ גילט" has both a cutlery word (סכין) and the "חדפ" trigger, but it is a shaving
  // razor, not a knife - the exact false positive concept-round.mjs --diff caught this round.
  assert.notEqual(assignConcept("ג`ילט סכיני גילוח חדפ לגבר יבוא מקביל", concepts), 'disposable-cutlery');
});

test('disposable-cutlery: still refuses a foot cream even with the new "קרם" trigger ("כפות" means soles here, not spoons)', () => {
  assert.equal(assignConcept('כפות חד"פ קרם50יחידות', concepts), 'disposable-cutlery');
  assert.equal(assignConcept('קרם לכפות הרגליים ארגן', concepts), null);
});

// --- 2. COVERAGE: disposable-bowls (new) ------------------------------------------------------

test('disposable-bowls: captures a plain party bowl with no material word, not a reusable melamine one', () => {
  assert.equal(assignConcept('קערה מרובעת בינונית', concepts), 'disposable-bowls');
  assert.notEqual(assignConcept('קערית מלמין מעוטרת - דגם איטליה', concepts), 'disposable-bowls');
});

test('disposable-bowls: steps aside for a bowl bundled with a mixer and cup-noodles served "in a bowl"', () => {
  // Both false positives concept-round.mjs --diff surfaced: "קערה" naming an accessory of a different
  // appliance (no concept claims the mixer name itself), and a food product describing its own serving
  // format (the noodles concept, correctly, still claims it).
  assert.equal(assignConcept('מיקסר יד חשמלי+קערה 300W יונדאי', concepts), null);
  assert.equal(assignConcept('נונגשים ראמאן-נודלס חריף בקערה כחול 100ג', concepts), 'noodles');
});

// --- 2. COVERAGE: kettle-electric (new) -------------------------------------------------------

test('kettle-electric: captures a plain electric kettle, not a Shabbat hot-water urn', () => {
  assert.equal(assignConcept('קומקום חשמלי נירוסטה 1.8 ל`', concepts), 'kettle-electric');
  assert.notEqual(assignConcept('קומקום שבת "עטרת" אדום 2.5 ליטר', concepts), 'kettle-electric');
});

test('kettle-electric: refuses a descaler for kettles and a glass teapot', () => {
  // Both real conflicts the first diff caught: "אבנית" (limescale) and "תה" (a steeping teapot) each
  // share the bare word קומקום with a genuine electric kettle.
  assert.notEqual(assignConcept('מסיר אבנית מקומקום', concepts), 'kettle-electric');
  assert.notEqual(assignConcept("קומקום תה אלסקה + פילטר זכוכית", concepts), 'kettle-electric');
});

// --- 2. COVERAGE: grill-bbq (new) -------------------------------------------------------------

test('grill-bbq: captures a charcoal grill, not a one-time disposable tray grill', () => {
  assert.equal(assignConcept('מנגל נירוסטה ענק', concepts), 'grill-bbq');
  assert.notEqual(assignConcept('מנגל חד פעמי קטן הנמל', concepts), 'grill-bbq');
});

test('grill-bbq: steps aside for a cleaning brush, unassigned charcoal and a grilled-vegetable salad, all "for the grill" rather than the grill itself', () => {
  // "מברשת למנגל" / "פחם למנגל" / "סלט מנגל" all contain מנגל without being the grill itself - the
  // wordStartTester boundary accepts the ל-prefix attachment ("for the grill"), so these need an
  // explicit exclusion rather than relying on the word-start guard. Each still resolves the way a
  // human would read it (a genuine cleaning brush, no concept for loose charcoal, a deli salad) -
  // grill-bbq just no longer fights another concept for the name.
  assert.equal(assignConcept('מברשת למנגל', concepts), 'cleaning-brush');
  assert.equal(assignConcept('פחם למנגל 2 ק"ג', concepts), null);
  assert.equal(assignConcept('סלט מנגל 630 גר', concepts), 'deli-salad-other');
});

// --- 2. COVERAGE: blender-immersion (new) -----------------------------------------------------

test('blender-immersion: captures a stick/hand blender regardless of brand', () => {
  assert.equal(assignConcept('בלנדר מוט לוקסור נירוסטה 150', concepts), 'blender-immersion');
  assert.notEqual(assignConcept('מיקסר יד חשמלי+קערה 300W יונדאי', concepts), 'blender-immersion');
});

// --- 2. COVERAGE: tongs-kitchen (new) ---------------------------------------------------------

test('tongs-kitchen: captures grill/kitchen tongs, including the "for the grill" phrasing grill-bbq must refuse', () => {
  assert.equal(assignConcept('מלקחיים נירוסטה', concepts), 'tongs-kitchen');
  assert.equal(assignConcept('מלקחיים למנגל', concepts), 'tongs-kitchen');
});

// --- 2. COVERAGE: scissors-nail / scissors-general (new) ---------------------------------------

test('scissors-nail: captures both spellings of nail scissors (ציפורניים and צפורניים), not general kitchen scissors', () => {
  assert.equal(assignConcept('מספריים לציפורניים', concepts), 'scissors-nail');
  assert.equal(assignConcept('מספריים לצפורניים', concepts), 'scissors-nail');
  assert.notEqual(assignConcept('מספריים איכותיות', concepts), 'scissors-nail');
});

test('scissors-general: captures general-purpose scissors, not a candy shaped like rock-paper-scissors', () => {
  assert.equal(assignConcept('מספריים גמבו', concepts), 'scissors-general');
  // "סוכריות סודה בצורת אבן נייר ומספריים" is a rock-paper-scissors candy toy - "מספריים" names the
  // game, not an actual pair of scissors. Exact conflict concept-round.mjs --diff caught this round.
  assert.equal(assignConcept('גוגלס טוי סוכריות סודה בצורת "אבן נייר ומספריים', concepts), null);
});

// --- 2. COVERAGE: water-bottle widened ----------------------------------------------------------

test('water-bottle: captures a generic reusable plastic bottle, not soy sauce sold in a plastic bottle', () => {
  assert.equal(assignConcept('בקבוק פלסטיק 500 מ"ל', concepts), 'water-bottle');
  assert.notEqual(assignConcept('רוטב סויה קיקומן בקבוק פלסטיק 500 מ"ל', concepts), 'water-bottle');
});

// --- 2. COVERAGE: cigarettes-pall-mall widened -------------------------------------------------

test('cigarettes-pall-mall: captures the no-space "פאלמאל" spelling some chains use', () => {
  assert.equal(assignConcept('פאלמאל כחול ארוך פאקט', concepts), 'cigarettes-pall-mall');
  assert.equal(assignConcept('פאל מאל כחול ארוך סטרים פילטר עשירייה', concepts), 'cigarettes-pall-mall');
});

// --- 3. מפה (tablecloth) - a missing product type, new -----------------------------------------

test('tablecloth-disposable: captures a roll of non-woven (אלבד) party tablecloth material, not a real fabric tablecloth', () => {
  assert.equal(assignConcept('מפת גליל אלבד שחור 12 מטר * 1.4 מטר', concepts), 'tablecloth-disposable');
  assert.notEqual(assignConcept('מפה לשולחן 250*140 ס"מ לבן עם פס כסף 100% פוליאסטר', concepts), 'tablecloth-disposable');
});

test('tablecloth-reusable: captures a flannel-backed or elastic-fitted reusable tablecloth, not a plain disposable one', () => {
  assert.equal(assignConcept('מפת פלנל עם גומי 22*30 ס"מ', concepts), 'tablecloth-reusable');
  assert.equal(assignConcept('מפה עם גומי לשולחן מתקפל 180x75 ס"מ לשימוש רב פעמי', concepts), 'tablecloth-reusable');
  assert.notEqual(assignConcept('מפה חד פעמי', concepts), 'tablecloth-reusable');
});

test('tablecloth concepts step aside for a Haribo "keys" gummy candy, and now correctly claim a PVC-sheen tablecloth instead of ceding it to the crystal-brand syrup concept', () => {
  // "הריבו מפתחות" (keys) shares the construct form "מפת" with "מפת שולחן" - a bare "מפת" prefix (no
  // negative lookahead) swallowed this candy the first time this round was measured. The candy concept,
  // correctly, still claims it.
  assert.equal(assignConcept('הריבו מפתחות 90 גרם', concepts), 'candy-gummy');
  // "קריסטלי" describing a PVC tablecloth's shine used to collide with another file's crystal-brand
  // flavored-syrup concept, which also claimed bare "קריסטל" - tablecloth-disposable excluded "קריסטל"
  // to dodge that conflict (TRAPS.md #14: a conflict is worse than one concept losing a borderline item),
  // ceding the item to flavored-syrup instead. A later round (11.10) tightened flavored-syrup's own
  // match.none to exclude dishware/cosmetics/pet-litter words bleeding in on bare "קריסטל" - "מפות" among
  // them - which removed the conflict risk, so tablecloth-disposable's "קריסטל" exclusion was lifted and
  // this now resolves to the tablecloth it actually is.
  assert.equal(assignConcept('מפות 45 מטר עבה מאוד קריסטלי שמאי', concepts), 'tablecloth-disposable');
});

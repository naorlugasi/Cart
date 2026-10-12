/**
 * Naor 12.10: three matcher fixes, measured one at a time with scripts/concept-round.mjs
 * (docs/CONCEPTS.md §1/§12). This file covers the engine-level behaviour; concept-content fixes that
 * a round's measurement required (a `none` word that relied on the old, unanchored substring match for
 * a real compound/loanword, or a brand-new `none` word to resolve a conflict the round's fix exposed)
 * are tested here too, each marked with the fix it belongs to.
 *
 * FIX 2 - a `none` entry gets the same word-start boundary `all`/`any` already have (wordStartTester),
 * but ONLY when it is a bare word (Hebrew/Latin letters only, no regex metacharacters, no spaces) -
 * `isPlainWordPattern`. A regex `none` entry or a multi-word phrase keeps matching as a substring of
 * the whole name, unchanged. The boundary is never anchored at the END (a stem must still catch its
 * own plural).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConcepts, assignConcept, matchingConcepts, isPlainWordPattern, withoutFlavourPhrases, hasFlavourMarker } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';

const concepts = loadConcepts();
const core = (name) => withoutFlavourPhrases(normalizeText(name));

test('FIX 2: isPlainWordPattern - bare word vs regex vs phrase', () => {
  assert.equal(isPlainWordPattern('קרמבו'), true);
  assert.equal(isPlainWordPattern('ליימ'), true);
  assert.equal(isPlainWordPattern('cola'), true);
  // regex metacharacters disqualify it - stays unanchored, exactly as before the fix
  assert.equal(isPlainWordPattern('מ.?ל'), false);
  assert.equal(isPlainWordPattern('(קולה|קוקה)'), false);
  assert.equal(isPlainWordPattern('נקטר(?!ינ)'), false);
  // a space disqualifies it too - a multi-word phrase keys off a substring of the whole name on purpose
  assert.equal(isPlainWordPattern('בטעם לימון'), false);
  assert.equal(isPlainWordPattern('(^| )עופ( |$)'), false);
});

test('FIX 2: a bare-word none no longer fires on an unrelated word it merely sits inside', () => {
  // banana's none carries "יינ" (wine) to keep a real banana-and-wine product out of the banana
  // concept; before the fix it also fired as a bare substring of "אונליינ" (the normalized form of
  // "אונליין", online), unrelated to wine, and silently dropped every banana product a chain tagged
  // "(online)". node scripts/concept-round.mjs --diff showed this as a real gain, no regression.
  assert.equal(assignConcept('אשכול בננה )אונליין(', concepts), 'banana');
  // the exclusion still does its real job: a genuine standalone "יין" (space-separated, not embedded
  // in a longer word) still blocks the concept, same one-prefix-letter tolerance as all/any.
  assert.notEqual(assignConcept('קוקטייל בננה ויין אדום', concepts), 'banana');
});

test('FIX 2: a bare-word none still catches its own plural - no end anchor', () => {
  // tea-black's none carries "ירוק" (green) as a bare word; "ירוקים" (plural) must still be caught,
  // exactly like all/any stems already rely on no end-anchor for plurals ("זית" catching "זיתים").
  assert.notEqual(assignConcept('תה ירוקים משובח', concepts), 'tea-black');
});

test('FIX 2 content fix: beef-entrecote/beef-asado/beef-steak still refuse a burger made from that cut', () => {
  // the shared meat-concepts none list carries a bare "בורגר" to keep burger-shaped products out of
  // every raw-cut concept. Before the fix that worked by substring accident inside "המבורגר" (the
  // Hebrew loanword for hamburger, not a Hebrew prefix + "בורגר") and "סטייקבורגר" (steak-burger) -
  // real matches the single-prefix-letter tolerance cannot recognize (two or more letters sit in
  // front of "בורגר" there, not one). Re-anchoring it with the boundary would have let
  // "המבורגר אנטריקוט"/"המבורגר אסאדו"/"סטייקבורגר בקר טיבון" start matching the raw-cut concept
  // too, turning a correct single assignment into a conflict (null) - a real regression the round's
  // measurement caught. Fixed by writing the shared entry as "[א-ת]*בורגר" - the documented way to say
  // "anywhere inside a word" in a none (docs/CONCEPTS.md §12): it is a regex, so it is not anchored, and
  // it would stay correct even if regex entries were ever anchored too, because the match then starts at
  // the word's own first letter.
  assert.equal(assignConcept('המבורגר אנטריקוט 400 גרם', concepts), 'burger-beef');
  assert.notEqual(assignConcept('המבורגר אנטריקוט 400 גרם', concepts), 'beef-entrecote');
  assert.equal(assignConcept('המבורגר אסאדו 400 גרם', concepts), 'burger-beef');
  assert.notEqual(assignConcept('המבורגר אסאדו 400 גרם', concepts), 'beef-asado');
  assert.equal(assignConcept('סטייקבורגר בקר טיבון ויל 400 גרם', concepts), 'burger-beef');
  assert.notEqual(assignConcept('סטייקבורגר בקר טיבון ויל 400 גרם', concepts), 'beef-steak');
});

test('FIX 2 content fix: margarine still refuses a jachnun sold "without margarine"', () => {
  // margarine's none carried a bare "חנונ" to keep ג'חנון (jachnun, a Yemenite pastry often sold
  // "ללא מרגרינה") out of the margarine concept by substring accident - "גחנון" (apostrophe stripped)
  // has only one letter ("ג") in front of "חנונ", which is not one of the seven Hebrew prefix
  // letters, so the boundary fix silently broke the exclusion. Fixed the same way: "[א-ת]*חנונ".
  assert.equal(assignConcept('ג"חנון ללא מרגרינה 650 גרם שגב', concepts), 'jachnun');
  assert.notEqual(assignConcept('ג"חנון ללא מרגרינה 650 גרם שגב', concepts), 'margarine');
});

test('FIX 2 content fix: tea-black does not claim the bottled Spring-brand iced tea', () => {
  // "ספרינג תה אפרסק" (Spring brand iced tea, peach) was kept out of tea-black only because its own
  // none word "פרי" (fruit) happened to sit, unanchored, inside "ספרינג" (the brand name, unrelated
  // to fruit) - an accidental shield, not a real rule. Once the boundary fix removed that accident,
  // tea-black's generic "(^| )תה( |$)" rule picked up every bottled Spring iced tea too, conflicting
  // with iced-tea's own, more specific rule. Fixed with a real exclusion: tea-black's none now also
  // carries "ספרינג" directly.
  assert.equal(assignConcept('ספרינג תה אפרסק 0.5', concepts), 'iced-tea');
  assert.notEqual(assignConcept('ספרינג תה אפרסק 0.5', concepts), 'tea-black');
});

test('FIX 2 content fix: hot-pepper (fresh) does not claim a jar of ground cayenne', () => {
  // "פלפל קיינה" (cayenne pepper) was kept out of the fresh hot-pepper concept only because "יינ"
  // (wine) happened to sit, unanchored, inside "קיינה" - cayenne has nothing to do with wine. Once
  // the boundary fix removed that accident, the fresh concept picked up a ground spice jar too.
  // Fixed with a real exclusion: hot-pepper's none now also carries "קיינה" directly - cayenne is
  // always sold as a ground spice here, never as the fresh vegetable.
  assert.equal(assignConcept("צ'ילי כתוש חריף (פלפל קיינה)", concepts), 'spice-chili-ground');
  assert.notEqual(assignConcept("צ'ילי כתוש חריף (פלפל קיינה)", concepts), 'hot-pepper');
});

test('FIX 2 content fix: flavored-syrup does not claim a lip gloss', () => {
  // flavored-syrup's none carries "גלוס" (gloss) to keep "ליפגלוס" (lip gloss) products out by
  // substring; "ליפ" (lip) in front of it is three letters, not one Hebrew prefix, so the boundary
  // fix broke it the same way. Fixed with a direct exclusion: "ליפגלוס" added to the none list
  // (existing test/conceptRules.test.js:241 already covers this name and must keep passing).
  assert.notEqual(assignConcept('ליפגלוס קריסטל לייטס501', concepts), 'flavored-syrup');
});

/**
 * FIX 1 - the flavour/filling stripper (withoutFlavourPhrases) must not delete the product itself.
 * (a) "קרמ" + a skincare/haircare product word (ידיים/פנים/יום/לילה/עיניים/גוף/שיער/רב שימושי/הגנה/
 *     תלתלים/מגדיר/אנטי, with the ordinary "ל" prefix) is the product's own name, never a filling.
 * (b) a stripped "בטעם X ..." span stops before a number. (The first version also stopped before any
 *     concept's one-word head noun; the Opus review removed it - it leaked the second word of every
 *     flavour list into the core, see docs/CONCEPTS.md §16.)
 * (c) withoutFlavourPhrases takes no concept list: cartBackend vendors this file without a config dir.
 */
test('FIX 1a: "קרמ" + a skincare product word is the product, not a filling to strip', () => {
  assert.equal(core('לוריאל קרם יום'), 'לוריאל קרמ יומ');
  assert.equal(core('קרם ידיים לאחר שטיפה'), 'קרמ ידיימ לאחר שטיפה');
  assert.equal(assignConcept('לוריאל קרם יום', concepts), 'skin-face-cream');
  assert.equal(assignConcept('קרם ידיים לאחר שטיפה', concepts), 'skin-hand-cream');
  // a filling that is NOT one of the exempted words is still stripped as before.
  assert.notEqual(assignConcept('טעמי אקס קרם אגוזים', concepts), 'walnuts');
});

test('FIX 1b: the flavour span stops before a number, and nowhere else', () => {
  // the number stops the span: "50%" and what follows stay in the core.
  assert.equal(core('חלוה בטעם וניל 50% שומשום'), 'חלוה 50% שומשומ');
  assert.equal(assignConcept('חלוה בטעם וניל 50% שומשום', concepts), 'halva');
  assert.equal(assignConcept('יוגורט בטעם וניל 25 חלבון 0% שומן', concepts), 'yogurt-protein');
  // ...and no other word does: up to three words after the marker are the flavour, as before.
  assert.equal(core('שמרים בטעם שוקולד עוגות הבית'), 'שמרימ');
  assert.equal(core('חטיף בטעם שוקולד ממולא קרם בוטנים 272 גר'), 'חטיפ בוטנימ 272 גר');
  assert.equal(assignConcept('חטיף בטעם שוקולד ממולא קרם בוטנים 272 גר', concepts), 'peanut-snack-bar');
  assert.equal(assignConcept('מוס רחצה כיף בניחוח קרם עוגיות 150 מ"ל', concepts), 'body-wash');
  assert.equal(core('וופל במילוי קרם אגוזים'), 'וופל', 'the filling is still stripped');
  assert.equal(assignConcept('סבון ידיים בניחוח קרם קוקוס', concepts), 'hand-soap', 'a scent is not a hand cream');
});

test('FIX 1b (Opus review): the second word of a flavour list never leaks into the core', () => {
  // Each of these went to the flavour's concept, or lost its own, under the head-noun stop.
  assert.equal(assignConcept('גיוזה במילוי בשר בקר', concepts), 'gyoza-dimsum');
  assert.equal(assignConcept('קרפלך במילוי בשר בקר', concepts), 'kreplach');
  assert.equal(assignConcept('חמאה בתוספת ריחן, שום ופפריקה', concepts), 'butter');
  assert.equal(assignConcept('חטיף חלבון בטעם סמורס מרשמלו', concepts), 'protein-bar');
  for (const [name, wrong] of [["ג'ונסונס ADULT תרחיץ גוף תמצית פרחי רימון", 'pomegranate'], ['ופל בטעם שוקולד קמח', 'flour-white'],
    ['רוטב בטעם גבינת צדר 250 ג', 'cheddar-cheese'], ['טורקי בטעם קקאו קינמון 112 גר', 'spice-cinnamon'], ['ספרינג משקה בטעם מנגו אננס תות', 'juice-pineapple']]) {
    assert.notEqual(assignConcept(name, concepts), wrong, name);
  }
});

test('FIX 1c: withoutFlavourPhrases needs no concept list (cartBackend vendors concepts.js with no config dir)', async () => {
  // Mirror the backend's vendor layout: catalog/{concepts,matching,brands}.js and nothing else around them.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vendor-'));
  try {
    mkdirSync(path.join(dir, 'catalog'));
    for (const f of ['concepts.js', 'matching.js', 'brands.js']) copyFileSync(path.join(here, '..', 'src', 'catalog', f), path.join(dir, 'catalog', f));
    const vendored = await import(pathToFileURL(path.join(dir, 'catalog', 'concepts.js')).href);
    assert.equal(vendored.withoutFlavourPhrases('וופל במילוי קרמ אגוזימ'), 'וופל');
    assert.equal(vendored.hasFlavourMarker('וופל במילוי קרם אגוזים'), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FIX 1c: a filling still counts as a marker for the vote; a day cream is no longer a filling', () => {
  assert.equal(hasFlavourMarker('גלילי וופל במילוי קרם בטעם אגוז'), true);
  assert.equal(hasFlavourMarker('אקונומיקה בניחוח לימון'), true);
  assert.equal(hasFlavourMarker('טעמי אקס קרם אגוזים'), true);
  assert.equal(hasFlavourMarker('לוריאל קרם יום'), false);
});

test('FIX 1: flavourIsIdentity comes off where the fixed stripper makes it unnecessary, stays where the flavour is the product', () => {
  // measured with every name in data/products.json and every chain's raw catalog: 0 names change.
  for (const id of ['skin-eye-cream', 'skin-hand-cream', 'diaper-rash-cream', 'hair-removal-cream', 'candy-mm', 'kinder-joy', 'cookies-savory', 'ergaliyot']) {
    assert.equal(concepts.find((c) => c.id === id).flavourIsIdentity, false, `${id} should no longer carry flavourIsIdentity`);
  }
  // the cream words those flags covered for are now the product, not a filling.
  assert.equal(assignConcept('מיי ביביי קרם החתלה', concepts), 'diaper-rash-cream');
  assert.equal(assignConcept('ויט קרם להסרת שיער לעור רגיש 100 מ"ל', concepts), 'hair-removal-cream');
  assert.equal(assignConcept("הידרו בוסט קרם ג'ל לידיים", concepts), 'skin-hand-cream');
  // kept: the flavour/filling IS the identity (cake-honey, filled cookies), or the stripper cannot tell
  // the cream apart from a filling (coconut cream, cream-coloured cutlery, "קרם רוזמרין" hair cream).
  for (const id of ['cake-honey', 'cake-yeast', 'cookies-sandwich-filled', 'coconut-cream', 'disposable-cutlery', 'hair-cream', 'skin-face-cream', 'candy-sour-strips', 'coconut-based-spread']) {
    assert.equal(concepts.find((c) => c.id === id).flavourIsIdentity, true, `${id} keeps flavourIsIdentity`);
  }
});

/**
 * FIX 3 - the specific concept beats the general one, when the rules prove it: A refines B when A's `all`
 * is a strict superset of B's AND B's `any` (if any) is already guaranteed by A (one of B's `any` sits in
 * A's `all`, or A's own `any` is a subset of B's). The Opus review added the `any` condition; with `all`
 * alone, 542 concept pairs qualified, many of them backwards (pizza-base over pizza-sauce).
 */
const mk = (id, all, any) => ({ id, name: id, category: 'מזווה', match: { all, ...(any ? { any } : {}) } });
function tinyList(defs) {
  // loadConcepts compiles; build the same shape through a temp concepts dir so the real loader is used.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'concepts-'));
  writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ concepts: defs }));
  try { return loadConcepts(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('FIX 3: a refinement wins; a superset of `all` that ignores B\'s `any` does not', () => {
  const L1 = tinyList([mk('general', ['אבג']), mk('specific', ['אבג', 'דהו'])]);
  assert.deepEqual(matchingConcepts('אבג דהו', L1).map((c) => c.id), ['specific']);
  const L2 = tinyList([mk('sauce', ['אבג'], ['רוטב']), mk('base', ['אבג', 'בסיס'])]);
  assert.deepEqual(matchingConcepts('רוטב לבסיס אבג', L2).map((c) => c.id).sort(), ['base', 'sauce'], 'B\'s any is its identity - stays a conflict');
  const L3 = tinyList([mk('sauce', ['אבג'], ['רוטב']), mk('sauce-hot', ['אבג', 'רוטב', 'חריפ'])]);
  assert.deepEqual(matchingConcepts('רוטב אבג חריף', L3).map((c) => c.id), ['sauce-hot'], 'A carries B\'s any in its all');
  const L4 = tinyList([mk('x', ['אבג'], ['דהו']), mk('y', ['אבג'], ['זחט'])]);
  assert.equal(matchingConcepts('אבג דהו זחט', L4).length, 2, 'same all, different any: a conflict, never a guess');
});

test('FIX 3: cat litter is cat litter - via the content fix, the rule is not what decides it', () => {
  // pet-food-cat's any carried "חול לחתול" (from before cat-litter existed); that, not an engine rule,
  // was why every litter name conflicted.
  assert.ok(!concepts.find((c) => c.id === 'pet-food-cat').match.any.includes('חול לחתול'));
  assert.equal(assignConcept('קלבר קט חול לחתול לבנדר 10 ליטר', concepts), 'cat-litter');
  assert.equal(assignConcept('דגני בוקר וויטביקס מחיטה מלאה 430 גר', concepts), 'cereal-weetabix');
});

test('FIX 3 content fix: dead none words removed where the catalog shows zero effect either way', () => {
  // chocolate-bar-snack's "סניקרס"/"קינדר בואנו"/"מארס"/"כנאפה"/"קדאיפ"/... and cereal-sweetened-
  // other's "גרנולה"/"קרקר"/"מרק"/... were measured (every name in data/products.json + every chain's
  // raw catalog) to change NOTHING when removed - not even a resolved conflict, genuinely dead weight
  // predating both concepts ever actually colliding on a real name.
  const chocBarSnack = concepts.find((c) => c.id === 'chocolate-bar-snack');
  for (const w of ['כנאפה', 'קדאיפ', 'ביסקוויט', 'מארס', 'גרנולה']) {
    assert.ok(!chocBarSnack.match.none.includes(w), `chocolate-bar-snack none should no longer carry "${w}"`);
  }
  const cerealOther = concepts.find((c) => c.id === 'cereal-sweetened-other');
  for (const w of ['מוזלי', 'מרק', 'תבשיל', 'גרנולה', 'קרקר', 'חמאת', 'קמח', 'מזונ']) {
    assert.ok(!cerealOther.match.none.includes(w), `cereal-sweetened-other none should no longer carry "${w}"`);
  }
  // words that DID change a real assignment stay - removing them would reopen a conflict or regress.
  // (Opus review: סניקרס/פיטנס/תמר/יוגורט/נייטשר ואלי were removed as dead but the raw chain names
  // still need them - Snickers and the Pitness rice-cake bar conflicted, a date bar and Nature Valley
  // became chocolate bars.)
  for (const w of ['קליק', 'סניקרס', 'פיטנס', 'תמר', 'יוגורט', 'נייטשר ואלי']) assert.ok(chocBarSnack.match.none.includes(w), w);
  assert.equal(assignConcept('חטיף שוקולד בר סניקרס 50 גר', concepts), 'chocolate-filled-snack');
  assert.ok(cerealOther.match.none.includes('קורנפלקס'));
  // "כריות" stays: without it the pillow names ("כריות דגני בוקר") voted the filled-pillows barcode into
  // the generic concept (measured at product level, Opus review).
  assert.ok(cerealOther.match.none.includes('כריות'));
  assert.notEqual(assignConcept('כריות דגני בוקר פייל', concepts), 'cereal-sweetened-other');
});

test('Opus review content fixes: names that were right only by substring accident stay right', () => {
  // "רצפ"/"סלט"/"נבט" used to block by substring; with the boundary each needed a precise word.
  assert.notEqual(assignConcept('נוזל לניקוי כללי ולרצפה בניחוח פרחי בר', concepts), 'all-purpose-cleaner');
  assert.notEqual(assignConcept('טונה ריו מארה אינסלט', concepts), 'tuna-canned');
  assert.notEqual(assignConcept('פנטסטיק לניקוי לימון 4ל', concepts), 'lemon-fresh');
  assert.notEqual(assignConcept('טורטייה מעדשים כתומות מונבטות 180 גר', concepts), 'lentils');
  assert.equal(assignConcept('עדשים שחורות מונבטות', concepts), 'lentils');
  assert.notEqual(assignConcept('להקרמריה פיסטוק מוקה 1.4', concepts), 'pistachios');
  assert.notEqual(assignConcept('מגבונים to go לפנים ולידיים 30 יח', concepts), 'baby-wipes');
  assert.notEqual(assignConcept('מגבוני קוויק לניקוי וחיטוי נצפות בניחוח מאושן 10 מטליות', concepts), null);
  assert.equal(assignConcept('שוקולד פרה בטעם רבע לשבע 100 גרם', concepts), 'chocolate-bar-milk');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * Drift audit, 12.10.2026 afternoon: the published data/products.json (built by the runner at 08:10,
 * on the config as of commit d45c800) was compared against a fresh local build on HEAD's code+config
 * (1bc23c7) over the same product ids. 292 products changed conceptId (118 lost it, 174 moved); every
 * one was traced to its root cause with concept-why.mjs + git log -p, not guessed from the LOST line
 * alone (docs says a null is silent, not a veto).
 *
 * Verdict: zero were a config regression. The local machine's data/prices/ (git-ignored, refreshed
 * outside this checkout's git history) had already moved past what built the published file by the
 * time this audit ran, so every "lost" product either had its vote-deciding chain listing disappear
 * (chains count dropped) or had its name text itself change at the surviving chain (truncation,
 * rephrasing, a spelling variant) - price-data drift, not a config matter. Every "moved" product with
 * NO such drift signal (24 of 292 - identical name set, identical chain count, before and after) turned
 * out to be one of today's deliberate reclassifications (0e461bd, 1bc23c7) correctly landing on a new,
 * more specific concept. This file locks in six of those 24 that no other test file already captures
 * (concepts-decisions-1210.test.js and concepts-pantry-round.test.js already cover Oreo, charcoal,
 * lentils->soup-ready, grape juice, alcoholic-mixed-drink and sriracha), plus the two products the Opus
 * review named as "look like regressions" - both investigated here and found to be drift, not bugs.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

test('Opus-named suspect 1: קוואקר 500 גר (g7290008961561) lost oats-rolled to a chain respelling it, not to a rule change', () => {
  // The published name (two chains, one spelled it "קוואקר") still resolves exactly as before.
  is('קוואקר 500 גר', 'oats-rolled');
  // The built name is the ONE surviving chain's own spelling, "קווקר" (no א) - it never matched
  // oats-rolled's all pattern ["(שיבולת שועל|קוואקר)"] in the old build either (pantry.json's
  // oats-rolled block is byte-identical between d45c800 and HEAD - git diff confirms it). The chain
  // that spelled it correctly is the one that disappeared between the 08:10 build and this audit.
  isNot('קווקר 500 גרם', 'oats-rolled');
  assert.equal(assignConcept('קווקר 500 גרם', concepts), null);
});

test('Opus-named suspect 2: לנור קפסולות בניחוח X was already conceptless in the published file - it never had laundry-detergent-pods to lose', () => {
  // Lenor fabric-softener capsules: no "כביסה"/"לכביסה" word, so laundry-detergent-pods' `any` never
  // fires. True in the published build (conceptId was already null there) and true now - unchanged.
  // The product later vanished from the catalog entirely (chain delisted it), which is why it looked
  // like a build regression; it is a catalog-presence change, not a concept-assignment one.
  isNot('לנור קפסולות בניחוח אמטיסט 60 יחידות', 'laundry-detergent-pods');
  assert.equal(assignConcept('לנור קפסולות בניחוח אמטיסט 60 יחידות', concepts), null);
  // The boundary is real, not accidental: an actual laundry pod merely Lenor-scented still matches,
  // because its own name carries "לכביסה".
  is('אריאל קפסולות לכביסה בניחוח לנור 41 יח', 'laundry-detergent-pods');
});

test('clean reclassifications (no catalog drift signal) from the 12.10 engine/decision rounds, not yet captured elsewhere', () => {
  // "קפוא" (frozen) in the name - fresh and frozen are separate concepts (Naor, 28.9).
  is('המבורגר אנטריקוט XL ארוז בד"ץ קפוא.', 'burger-beef-frozen');
  isNot('המבורגר אנטריקוט XL ארוז בד"ץ קפוא.', 'burger-beef');
  // Shallot bulbs are their own concept, not a yellow-onion variant.
  is('מארז בצלצלי שאלוט (ק)', 'shallot');
  isNot('מארז בצלצלי שאלוט (ק)', 'onion-yellow');
  // A deli-brand prepared dessert, not a fresh fruit - "רגע של דובדבן ... המעדניה של נינה" is a pudding.
  is('רגע של דובדבן 1 ק"ג המעדניה של נינה', 'pudding-fruit');
  isNot('רגע של דובדבן 1 ק"ג המעדניה של נינה', 'cherry-fresh');
  // No "מוגז" (carbonated) word - plain mineral water defaults to still, not sparkling.
  is('מים מינרלים מירגורודסקיה 1.5 ל', 'water-still');
  isNot('מים מינרלים מירגורודסקיה 1.5 ל', 'water-sparkling');
  // A flavoured black tea is the "other" leaf beside plain tea-black.
  is('תה שחור פירות יער 20 שקיקים CURTIS', 'tea-black-other');
  // "קרם גוף" (body cream) is body-lotion, not a mist - the 1bc23c7 FILLING_PHRASE fix.
  is('ברזיליאן קרם גוף 75 מ"ל', 'body-lotion');
  isNot('ברזיליאן קרם גוף 75 מ"ל', 'body-mist-brazilian');
});

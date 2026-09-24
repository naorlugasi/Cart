import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * Round on config/concepts/dairy-eggs.json, snacks.json and pantry.json: four everyday words the
 * frontend's shopping-list importer resolves to no concept at all - ביצים (eggs), גלידה (ice cream),
 * קורנפלקס (corn flakes) and צימוקים (raisins) - each mapped as a real family, not a single product.
 * One capture + one near-miss per new concept, plus the five bare-word resolution cases the round exists
 * to fix, plus a Hebrew construct-form check (גלידת/ביצת/צימוקי) after a sibling round found that shape
 * missing systemically. See the commit message for the full LOST-line accounting from concept-round.mjs.
 */
const concepts = loadConcepts();

const cases = [
  // ---------- eggs (dairy-eggs.json): size (M/L/XL) is packaging, not identity - one concept per
  // size the same way milk-3/milk-1 differ by fat %, not by carton size. Type (organic/free-range/
  // omega) IS identity, so each gets its own concept, mutually exclusive via `none`. ----------
  ['egg-regular', 'ביצים 12 יח L', 'אטריות ביצים 300 גרם'],
  ['egg-organic', '12 ביצים L אורגני מ.לסר', '12ביצים אורגנ.L+אומגה3'],
  ['egg-free-range', 'ביצים חופש 12 יחידות גדול', 'ביצי דג אדום בצנצנת 200 גרם'],
  ['egg-omega', 'ביצים אומגה 3 12 יחידות גדול', 'ביצים 12 יח L'],
  // ---------- ice cream (snacks.json): tub / single stick-or-cone / multipack, plus non-dairy and
  // sorbet as their own concepts - must never reach a cake, a wafer or an ice-cream-flavoured anything.
  // ----------
  ['icecream-tub', 'גלידה שמנת בטעם וניל 400 גרם', '24גביעי וופל לגלידהMONRO'],
  ['icecream-stick', 'גלידה אסקימו פלומביר', 'גלידה שמנת בטעם וניל 400 גרם'],
  ['icecream-multipack', 'חמישיית גלידה סניקרס', 'גלידה אסקימו פלומביר'],
  ['icecream-nondairy', 'גלידה פרווה בטעמי וניל עוגיות שוקולד רום', 'גלידה שמנת בטעם וניל 400 גרם'],
  ['sorbet', 'שלגון שרבט לימון ליים 85', 'שפתון דיסני סורבה אבטיח'],
  // ---------- breakfast cereal (pantry.json): קורנפלקס is one letter from corn-starch's קורנפלור -
  // measured before writing anything, no shared substring between the two patterns. ----------
  ['cereal-cornflakes', 'קורנפלקס תלמה 400 גר', 'קורנפלור 500 גרם'],
  ['cereal-muesli', 'מוזלי פירות 7 פירות', 'מוזלי עם אגוזים 600 גר'],
  ['cereal-rings', 'טבעות דגנים עם דבש ל', "טבעונים חטיף טבעות דגנים מלאים"],
  // ---------- dried fruit (pantry.json): raisins plus the sibling the round asked for (dried apricot -
  // dried cranberries was attempted and dropped, see below). ----------
  ['dried-raisins', 'צימוק חום 300 גר ששו', 'עוגיות עם צימוקים'],
  ['dried-apricot', 'משמש מיובש 250ג', 'משמש'],
];

test('everyday-words round: each new concept captures its real name and rejects its near-miss', () => {
  const failures = [];
  for (const [id, capture, nearMiss] of cases) {
    const got = assignConcept(capture, concepts);
    if (got !== id) failures.push(`CAPTURE ${id}: "${capture}" -> ${got ?? 'null'}`);
    const missed = assignConcept(nearMiss, concepts);
    if (missed === id) failures.push(`NEAR-MISS ${id}: "${nearMiss}" -> ${id} (should not match)`);
  }
  assert.deepEqual(failures, [], `everyday-words round failures:\n  ${failures.join('\n  ')}`);
});

/**
 * The point of the round, verified directly: a shopping-list line that is just the bare word - nothing
 * else in the name - has to resolve to the concept a shopper means. Before this round, ביצים resolved to
 * אטריות ביצים (egg noodles, the only concept that happened to contain the string), גלידה/קורנפלקס/צימוקים
 * resolved to nothing, and מלפפון חמוץ already worked (only the plural display name failed the frontend's
 * separate free-text matcher, which is not this engine - see the pickles synonym assertion below).
 */
test('the five bare words each resolve to the concept a shopper means', () => {
  assert.equal(assignConcept('ביצים', concepts), 'egg-regular');
  assert.equal(assignConcept('גלידה', concepts), 'icecream-tub');
  assert.equal(assignConcept('קורנפלקס', concepts), 'cereal-cornflakes');
  assert.equal(assignConcept('צימוקים', concepts), 'dried-raisins');
  assert.equal(assignConcept('מלפפון חמוץ', concepts), 'pickles', 'singular form, already matched before this round');
  assert.equal(assignConcept('מלפפונים חמוצים', concepts), 'pickles', 'plural display name also matches (was never broken here)');
});

/**
 * A sibling round measured that the Hebrew CONSTRUCT form (סמיכות) - גלידת X, not just גלידה - is a
 * separate miss from the bare noun, the same shape as רצפה/רצפות and מפה/מפות found elsewhere: 61
 * products start with גלידת alone. Every concept above matches on a short stem ("גליד", "ביצ[היות]",
 * "צימוק") that is already a prefix of the construct form, not the full word, so the fix was already in
 * place by construction - this asserts it stays that way.
 */
test('construct forms (סמיכות) resolve the same as the bare noun, not just גלידה/ביצים/צימוקים', () => {
  assert.equal(assignConcept('גלידת שוקולד', concepts), 'icecream-tub', 'גלידת, not just גלידה');
  assert.equal(assignConcept('גלידת', concepts), 'icecream-tub', 'bare construct form alone');
  assert.equal(assignConcept('ביצת חופש', concepts), 'egg-free-range', 'ביצת, not just ביצה/ביצים');
  assert.equal(assignConcept('ביצת', concepts), 'egg-regular', 'bare construct form alone');
  assert.equal(assignConcept('צימוקי גן עדן', concepts), 'dried-raisins', 'צימוקי, not just צימוקים');
});

/**
 * Eggs: size (M/L/XL/ענק) is packaging, never a separate concept - "ביצים 12 יח L" and the same carton
 * in M are both egg-regular. Type is the real fork, and the four types are mutually exclusive by
 * construction: a name naming two types (אורגני+אומגה, or חופש+אורגני) lands on exactly one of them,
 * never a conflict.
 */
test('egg size is packaging, not identity - and multi-type names resolve to exactly one type', () => {
  assert.equal(assignConcept('ביצים 12 יח M', concepts), 'egg-regular');
  assert.equal(assignConcept('ביצים 30 יח XL', concepts), 'egg-regular', 'same concept as M/L, size is not the fork');
  assert.equal(assignConcept('12ביצים אורגנ.L+אומגה3', concepts), 'egg-omega', 'organic+omega: omega wins, not a conflict');
  assert.equal(assignConcept('12ביצים חופש אורגניות M', concepts), 'egg-free-range', 'free-range+organic: free-range wins, not a conflict');
});

/**
 * Eggs must not reach fish roe (already its own concept, meat-fish.json), egg noodles/pasta, egg-shaped
 * candy, mayonnaise made with eggs, or an unrelated Hebrew/English collision: "בייטס" transliterates
 * "beach" through a normalized ביץ that is indistinguishable from ביצ once final letters are folded, so
 * the pattern requires a real Hebrew suffix (ה/י/ו/ת) after ביצ, not a bare 3-letter stem.
 */
test('eggs stop at the family boundary: roe, noodles, chocolate eggs, mayo, and the ביץ/beach collision', () => {
  assert.notEqual(assignConcept('ביצי דג אדום בצנצנת 200 גרם', concepts), 'egg-regular');
  assert.equal(assignConcept('ביצי דג אדום בצנצנת 200 גרם', concepts), 'fish-roe');
  assert.equal(assignConcept('אטריות ביצים דקות 400ג רמילוי', concepts), 'noodles');
  assert.equal(assignConcept('פסטה ביצים ותרד 250 גר Agnesi', concepts), 'pasta-other');
  assert.notEqual(assignConcept('שלישיית ביצי שוקולד', concepts), 'egg-regular', 'chocolate-egg candy, not a real egg');
  assert.notEqual(assignConcept('מיונז מאחייב ביצים 50.5% 800 גרם', concepts), 'egg-regular');
  assert.equal(assignConcept('מיונז מאחייב ביצים 50.5% 800 גרם', concepts), 'mayonnaise');
  assert.notEqual(assignConcept('סוכריות ממבה ביץ בייטס 160 גר', concepts), 'egg-regular', 'transliterated "beach", not ביצה');
});

/**
 * Ice cream must not reach a cake, a wafer, or an ice-cream-FLAVOURED thing that is really something
 * else (walnuts/pistachios/halva/honey/pretzels/peanuts as a mix-in name the ingredient concept would
 * otherwise swallow - TRAP #17, the same shape as honey/lentils/sesame in the pantry round). Those five
 * concepts (snacks.json/pantry.json, both mine) were given a `גליד` guard as part of this round.
 */
test('ice cream stops at the family boundary: wafers, and flavour words that belong to a different concept', () => {
  assert.equal(assignConcept('24גביעי וופל לגלידהMONRO', concepts), 'wafers', 'wafer cups FOR ice cream, not ice cream');
  assert.notEqual(assignConcept('12גביעי ופל גלידריהMONRO', concepts), 'icecream-tub', 'same wafer-cup product, single-vav spelling');
  assert.notEqual(assignConcept('גלידת פיינטים בננה אגוזים בן גריס', concepts), 'walnuts');
  assert.equal(assignConcept('אגוזי מלך 200 גרם', concepts), 'walnuts', 'plain walnuts still matches');
  assert.notEqual(assignConcept('גלידת שמנת משובחת פיסטוק פיינט 330 גרם', concepts), 'pistachios');
  assert.notEqual(assignConcept('גלידת חלבון פרו חלוה 120 גרם', concepts), 'halva');
  assert.notEqual(assignConcept('גלידת שמנת משובחת עם וניל, דבש וחתיכות פאדג', concepts), 'honey');
  assert.equal(assignConcept('דבש טהור 500 גרם', concepts), 'honey', 'plain honey still matches');
});

/**
 * קורנפלקס and קורנפלור are one letter apart (ADR / TRAPS.md #4-adjacent) - measured against the raw
 * catalog before writing either pattern, and the two share no matched substring.
 */
test('cereal-cornflakes and corn-starch never collide, one letter apart or not', () => {
  assert.equal(assignConcept('קורנפלור 500 גרם', concepts), 'corn-starch');
  assert.notEqual(assignConcept('קורנפלור 500 גרם', concepts), 'cereal-cornflakes');
  assert.equal(assignConcept('קורנפלקס 750 גר פתיתי תירס קלויים ויקט', concepts), 'cereal-cornflakes');
  assert.notEqual(assignConcept('קורנפלקס 750 גר פתיתי תירס קלויים ויקט', concepts), 'corn-starch');
  assert.equal(assignConcept('דגני בוקר - פתיתי תירס', concepts), 'cereal-cornflakes', 'the פתיתי תירס phrasing also matches');
});

/**
 * cereal-bar (חטיף דגנים) already existed and is a different product from cereal-rings (טבעות דגנים) -
 * a vegan snack BAR whose own name happens to contain the words "טבעות דגנים" must stay with cereal-bar,
 * not be swallowed by the new cereal-rings concept.
 */
test('cereal-rings does not swallow cereal-bar, a different product that shares two words', () => {
  assert.equal(assignConcept('טבעונים חטיף טבעות דגנים מלאים', concepts), 'cereal-bar');
  assert.notEqual(assignConcept('טבעונים חטיף טבעות דגנים מלאים', concepts), 'cereal-rings');
});

/**
 * Raisins must not reach a dish that merely contains raisins as an ingredient (bread, cookies, muesli,
 * cheese, a chocolate bar) - TRAP #1's shape again, this time for a dried fruit rather than a fresh one.
 * dried-apricot requires the actual dried/origin marker (מיובש or אוזבקי, the same word the catalog uses
 * for dried raisins) so a bare, unqualified "משמש" (which could be the fresh produce item) stays out.
 */
test('dried fruit stops at prepared dishes, and dried-apricot requires the dried/origin marker', () => {
  assert.notEqual(assignConcept('חלה מתוקה קלועה עם צימוק', concepts), 'dried-raisins');
  assert.equal(assignConcept('חלה מתוקה קלועה עם צימוק', concepts), 'challah');
  assert.notEqual(assignConcept('גרנולה צימוקים ופקאן', concepts), 'dried-raisins');
  assert.equal(assignConcept('גרנולה צימוקים ופקאן', concepts), 'granola');
  assert.notEqual(assignConcept('טובלרון חלב צימוק 100 גר', concepts), 'dried-raisins');
  assert.equal(assignConcept('משמש אוזבקי 400 גר', concepts), 'dried-apricot', 'אוזבקי is the catalog\'s dried-apricot origin marker');
  assert.notEqual(assignConcept('משמש', concepts), 'dried-apricot', 'a bare, unqualified apricot is not asserted dried');
});

/**
 * dried-cranberries was attempted and measured (concept-round.mjs --diff) to collide too broadly to
 * ship: חמוציות alone also names cranberry juice/nectar, cranberry sauce (already its own concept),
 * pickled cabbage, tea, vitamin-C supplements, pet food and cosmetics (body wash, lipstick, wet wipes) -
 * about twenty of the round's conflicts came from this one concept alone. No concept beats a leaky one
 * (TRAPS.md #14), so חמוציות was left unassigned rather than shipped with a dozen brittle exceptions.
 */
test('dried-cranberries: left unassigned on purpose, not silently swallowed by something', () => {
  assert.equal(assignConcept('חמוציות 250 גרם', concepts), null, 'no concept claims plain חמוציות - documented, not a bug');
  assert.equal(assignConcept('רוטב חמוציות 240 גר רונה', concepts), 'cranberry-sauce', 'the sauce concept still works');
});

/** pickles: the concept already matched both forms before this round (config/concepts/pantry.json
 * `any: ["חמוצ"]` has no singular/plural distinction) - only the synonyms list, which a downstream
 * free-text matcher reads separately from this match engine, was missing the singular display phrase. */
test('pickles synonyms carry both the singular and plural forms people type', () => {
  const pickles = concepts.find((c) => c.id === 'pickles');
  assert.ok(pickles.synonyms.includes('מלפפון חמוץ'), 'singular form added this round');
  assert.ok(pickles.synonyms.includes('מלפפונים חמוצים'), 'plural display name (was already there)');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept, conceptById } from '../src/catalog/concepts.js';

/**
 * Naor 14.10.2026: dissolve bread-spread. His receipt showed "לימון בלאדי ביתי" (g7290017121390, 6 chains)
 * offered schug, harissa and aioli as substitutes - because bread-spread (bakery.json) was keyed on the
 * maker עללחם ("all": ["עללחמ"], nothing else) rather than on what each product IS. It was a single concept
 * covering 24 different products of one maker: harissa (green/hot/sweet), schug (red/green/fire), pesto,
 * chimichurri, artichoke spread, sun-dried tomato spread, olive tapenade (green/kalamata), roasted pepper
 * spread, garlic & herb paste, horseradish, preserved lemon, peanut butter, a cocoa-free biscuit spread and
 * a chocolate-peanut spread, plus "פלפל צ'ומה" (Tunisian chuma pepper, sold by many makers, not only עללחם).
 * Every sibling leaf already existed except skhug-fire, biscuit-spread and pepper-chuma (new here); each one
 * had carried its own "none": ["עללחמ"] guard that deferred עללחם's names to bread-spread unconditionally.
 *
 * Fixed in the same round: preserved-lemon required "כבוש" or "ממרח" and so never caught the jar when a chain
 * named it only "לימון בלאדי ..." - those names voted null or lemon-fresh. Naor: "לימון בלאדי חייב לקבל רק
 * לימון בלאדי" - and a maker's name is never a product word (the build strips the chain's manufacturer field
 * before matching, so a rule keyed on עללחם/פרג may not even see it). The supervising review (14.10)
 * replaced the first draft's maker trigger with packaging signals only: next to "בלאדי"/"בלדי", a three-digit
 * weight ("250", "250גר", "180 גרם"), "גר"/"גרם", "ביתי" (homemade), "לחיץ" (squeeze bottle) or "צנצנת".
 * A bare "לימון בלאדי" (no weight, no packaging word) is the fresh cultivar and stays lemon-fresh - one of the
 * site's most-searched produce items (test/concepts-pantry-round.test.js, the 24.9 round). preserved-lemon's
 * first pattern is lemon-fresh's own "(^| )לימונ", so where both match the jar refines the fruit
 * (resolveSpecificity) instead of the two conflicting - lemon-fresh itself is untouched.
 *
 * Both of Naor's receipt barcodes now vote preserved-lemon on every chain name that says anything:
 * g7290017121390 6/6 ("לימון בלאדי ביתי" x3 included), g7290003078738 4 of 7 (Yochananof publishes the same
 * barcode as "פלפל צומה" x2, Hazi Hinam as a bare "לימון בלאדי" - a prefix of the fuller names, which
 * pickConcept drops before the vote) - scripts/concept-why.mjs.
 *
 * Measured in isolation (HEAD of every other file, node scripts/concept-round.mjs --diff): 140 names moved,
 * all of them bread-spread's 93 names landing on their real leaf; verdict shows assigned +15 / conflict -2
 * over data/products.json - a strictly cleaner round, not just a different conflict. Names below are real
 * chain names from data/prices/*\/catalog.full.json.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);
const gone = (id) => assert.equal(conceptById(id, concepts), null, `${id} should be gone`);

test('bread-spread is gone: the עללחם shelf no longer exists as one maker-keyed concept', () => {
  gone('bread-spread');
});

test("Naor's receipt: the packaged לימון בלאדי names are preserved-lemon - never schug, harissa or aioli", () => {
  const jar = ['עללחם לימון בלאדי 250גר', 'לימון בלדי עללחם 250', 'פרג לימון בלאדי 250', 'לימון בלאדי פרג 250', 'לימון בלאדי 250 גרם', 'לימון בלאדי ביתי',
    // the same names once the build has stripped the maker out of them
    'לימון בלדי 250', 'לימון בלאדי 250', 'לימון בלאדי 250גר',
    'ממרח לימון בלאדי 250ג בקבוק לחיץ', 'לימון בלאדי 250 גר תבליני ביטון יוחאי', 'לימון בלדי של רומיה 250 גר'];
  for (const name of jar) {
    is(name, 'preserved-lemon');
    for (const other of ['skhug-red', 'skhug-green', 'harissa', 'aioli-sauce', 'lemon-fresh']) isNot(name, other);
  }
});

test('preserved-lemon reads the package, never the maker: no brand word in its rule', () => {
  const rule = conceptById('preserved-lemon', concepts).match;
  const words = [...rule.all, ...(rule.any ?? [])].join(' ');
  for (const maker of ['עללחמ', 'פרג', 'ביטונ', 'מדשא', 'רומיה']) assert.ok(!words.includes(maker), `maker "${maker}" in preserved-lemon's rule`);
});

test('a bare לימון בלאדי (no weight, no packaging word) stays the fresh-produce cultivar (24.9 regression guard)', () => {
  for (const name of ['לימון בלאדי', 'לימון', 'לימון טרי ארוז 10 יח', 'מארז לימון אורגני']) {
    is(name, 'lemon-fresh');
    isNot(name, 'preserved-lemon');
  }
});

test('preserved-lemon does not swallow לימונדה (lemonade) just because a maker/size-marked בלאדי now triggers it', () => {
  isNot('משקה קל לימונדה בלאדי', 'preserved-lemon');
  isNot('מיץ לימונדה בלדי 2 ליטר', 'preserved-lemon');
});

test('harissa: every עללחם flavour (green, hot, sweet) is harissa like any other maker', () => {
  is('אריסה ביתית ירוקה 250 גר עללחם', 'harissa');
  is('אריסה חריפה עללחם 250 גרם', 'harissa');
  is('עללחם אריסה ביתית מתוקה 250 גר', 'harissa');
});

test('skhug-red / skhug-green / skhug-fire: the three עללחם schug colours land on three leaves', () => {
  is('סחוג אדום עללחם 140', 'skhug-red');
  is('סחוג ירוק עללחם 140', 'skhug-green');
  is('סחוג אש עללחם 140 גר', 'skhug-fire');
  isNot('סחוג אש עללחם 140 גר', 'skhug-red');
  isNot('סחוג אש עללחם 140 גר', 'skhug-green');
});

test('skhug-fire does not steal a colour-labelled hot schug that merely uses "אש" as an intensity word', () => {
  is('סחוג ירוק חריף אש נפטון', 'skhug-green');
  isNot('סחוג ירוק חריף אש נפטון', 'skhug-fire');
});

test('aioli-sauce: every עללחם aioli flavour (garlic, tomato, smoked onion, pesto) is aioli', () => {
  is('עללחם רוטב איולי שום', 'aioli-sauce');
  is('איולי עגבניות 295 גרם עללחם', 'aioli-sauce');
  is('איולי בצל מעושן עללחם 295 גרם', 'aioli-sauce');
  is('איולי פסטו עללחם 295 גרם', 'aioli-sauce');
});

test('pesto and chimichurri: the עללחם jars are the same product as any other maker\'s', () => {
  is('פסטו ביתי עללחם 180', 'pesto');
  is("צ'ימיצ'ורי עללחם", 'chimichurri');
});

test('artichoke-spread, tomato-sundried, olive tapenade, roasted-pepper-spread, garlic-paste: the עללחם jars join their existing leaf', () => {
  is('ממרח ארטישוק עללחם 180 גרם', 'artichoke-spread');
  is('עללחם ממרח עגבניות מיובשות 180 גר', 'tomato-sundried');
  is('טפנד זיתי קלמטה עללחם 180 גרם', 'olive-spread-kalamata');
  is('עללחם ממרח טפנד זיתים ירוקים 180 גר', 'olive-spread-green');
  is('ממרח פלפלים קלויים עללחם 180 גרם', 'roasted-pepper-spread');
  is('עללחם ממרח שום ועשבי תיבול 180 גר', 'garlic-paste');
});

test('horseradish and nut-butter: the עללחם jars join their existing leaf too', () => {
  is('עללחם חזרת 250 גרם', 'horseradish');
  is('ממרח חמאת בוטנים טבעית עללחם 350 גרם', 'nut-butter');
});

test('biscuit-spread (new): the cocoa-free עללחם cookie spread is its own leaf, not chocolate-spread', () => {
  is('ממרח פתי בר עללחם 400 גרם', 'biscuit-spread');
  is('ממרח מביסקוויט פתי-בר עללחם', 'biscuit-spread');
  isNot('ממרח פתי בר עללחם 400 גרם', 'chocolate-spread');
});

test('chocolate-spread: the cocoa עללחם biscuit spread and the chocolate-peanut שוקובוטן jar are chocolate-spread', () => {
  is('ממרח פתי בר עם קקאו עללחם 400 גרם', 'chocolate-spread');
  is('ממרח שוקובוטן עללחם 400 גרם', 'chocolate-spread');
});

test('pepper-chuma (new): פלפל צ\'ומה is its own leaf, keyed on the product and not only עללחם\'s', () => {
  is("פלפל צ'ומה עללחם 250 גר", 'pepper-chuma');
  is('פלפל צומה עללחם 250', 'pepper-chuma');
  is('פלפל צומה של רומיה 250 גר', 'pepper-chuma');
  is('פרג פלפל צ\'ומה 250 ג', 'pepper-chuma');
  isNot('קלמנטינה סצומה', 'pepper-chuma');
});

test('aioli-sauce does not swallow a pickle jar that happens to be aioli-flavoured', () => {
  is('איולי שיפקה ומלפפון חמוץ עללחם 295 גרם', 'aioli-sauce');
  isNot('איולי שיפקה ומלפפון חמוץ עללחם 295 גרם', 'pickles');
});

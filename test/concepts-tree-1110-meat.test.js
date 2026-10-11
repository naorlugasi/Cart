import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept, conceptById, stripManufacturer } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - בשר ועוף tree round (Naor: cluster first, build the tree for the whole family, not one
 * product at a time). Clustered every unassigned product of the department, then measured every change in
 * isolation (HEAD of every other concept file + this round's meat-fish.json / meat-fish-frozen.json /
 * type-words.json) over every chain's raw name with its manufacturer stripped, the way the build votes:
 * 0 products lost a concept, 0 new conflicts, +45 barcodes / +89 raw names gained one, 2 barcodes moved
 * (Of Tov's beef meatballs out of beef-cuts, עטרה's "שריר לא מעובד" out of the frozen twin).
 *
 * The cluster's root cause was "מעובד": the Israeli meat-counter disclosure that a cut was frozen and
 * thawed. It sat in the central `processed` vocabulary (config/concepts/type-words.json), so the kind guard
 * refused every real cut carrying it. The first draft of this round switched 17 cut concepts to
 * `kind: "any"` and re-added "פסטרמ" etc. to their `none` by hand; the Opus review replaced that with the
 * central fix: "מעובד" is a frozen-twin word (frozenTwins.word - a thawed cut is the frozen product, Naor
 * 28.9), so the twin's own `all` names it and the guard lets the twin through, while the fresh concept keeps
 * the full guard. "לא מעובד" (not processed) is neither a frozen nor a processed word - both patterns carry
 * the same lookbehind.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

test('new leaf: שניצל דג (schnitzel-fish) - breaded fish schnitzel is its own leaf, not a cut of any one fish and not chicken/beef schnitzel', () => {
  is('שניצל דג אמנון בציפוי טמפורה 600 גרם רוזנרס', 'schnitzel-fish');
  is('שניצל דג בציפוי שומשום 700 גר מאמעס קפוא', 'schnitzel-fish');
  isNot('שניצל בקר טרי', 'schnitzel-fish');
  isNot('שניצלי עוף', 'schnitzel-fish');
  isNot('פילה אמנון טרי', 'schnitzel-fish'); // a raw fillet, not breaded
  isNot('שניצל בסגנון דג טבעוני', 'schnitzel-fish'); // vegan is its own product (central guard)
});

test('new leaf: קציצות בקר (beef-meatballs) - keyed on the animal; entrecote is a beef cut, ground beef FOR meatballs is ground beef', () => {
  is('קציצות אנטריקוט 800', 'beef-meatballs');
  is('קציצות עגל 700 גר`נתח קצבים', 'beef-meatballs');
  is(stripManufacturer('עוף טוב קציצות בקר י', 'עוף טוב', concepts), 'beef-meatballs'); // the maker is stripped, not named in a rule
  is('בשר בקר טחון לקציצות', 'beef-ground');
  isNot('קציצות עוף ובקר 600 גרם', 'beef-meatballs'); // a chicken-and-beef mix is not beef meatballs
  isNot('קציצות עוף', 'beef-meatballs');
  isNot('אנטריקוט מעובד מופשר', 'beef-meatballs'); // the raw cut, no קציצ
});

test('new leaf: טושונקה (beef-tushonka) - canned stewed beef, a processed product', () => {
  is('טושיונקה בקר רוסית 400 גרם', 'beef-tushonka');
  is('בשר בקר טושונקה פיקנטי פ.דבור 400 גר', 'beef-tushonka');
  assert.equal(conceptById('beef-tushonka', concepts).kind, 'processed');
  isNot('גולש בקר קפוא עטרה', 'beef-tushonka');
  isNot('טושונקה בקר עם כוסמת 400 גרם', 'beef-tushonka'); // buckwheat with tushonka is a ready dish
  isNot('טושטונקה לבן 340 גרם', 'beef-tushonka'); // "לבן" is the beef concepts' pork marker
});

test('"מעובד" is the thawed product: it goes to the frozen twin, and "לא מעובד" stays fresh', () => {
  is('כתף בקר מעובד מופשר', 'beef-shoulder-frozen');
  is('בשר מס 5 חלק מעובד', 'beef-shoulder-roast-frozen');
  is('בשר מס 6 מעובד מוכשר', 'beef-cut-numbered-frozen');
  is('צלעות בקר מעובד מופש', 'ribs-fresh-frozen'); // a truncated "מופשר" is still the thawed cut
  is('סטייק עין מעובד מופש', 'beef-entrecote-frozen');
  is('סטייק אנטריקוט מוצר בשר מעובד מופשר', 'beef-entrecote-frozen');
  is('צוואר כבש מעובד מופש', 'lamb-neck-frozen');
  is('שריר לא מעובד עטרה מספר 8', 'beef-shank');
  isNot('סטייק עין מעובד מופש', 'beef-entrecote');
  // the fresh cut concepts keep kind fresh, so the central guard still refuses the processed products
  // named after the same cuts - no per-concept "פסטרמ"/"חטיפ"/"מרק" list needed
  for (const id of ['beef-shoulder', 'beef-brisket', 'beef-asado', 'beef-goulash', 'beef-entrecote', 'ribs-fresh', 'beef-cut-numbered']) {
    assert.equal(conceptById(id, concepts).kind, 'fresh', `${id} stays kind fresh`);
  }
  isNot('פסטרמה כתף בקר חצי זילבר', 'beef-shoulder');
  isNot('פסטרמה חזה בקר דק דק', 'beef-brisket');
  isNot('אסאדו ברוטב אסייתי', 'beef-asado');
  isNot('חטיפי אסאדו טרי', 'beef-asado');
  isNot('מרק גולש 400 גר', 'beef-goulash');
});

test('a lamb "כתף שוק" (fore-shank) is the shank, not both shank and shoulder', () => {
  is('כתף שוק טלה מעובד מו', 'lamb-shank-frozen');
});

test('beef-ground: a maker whose name says עוף is stripped as the manufacturer, the rule only names the animal', () => {
  const ground = conceptById('beef-ground', concepts);
  assert.ok(!ground.match.none.some((p) => /ירושלימ|טוב/.test(p)), 'no maker name inside the rule');
  is(stripManufacturer('בשר בקר טחון עוף טוב', 'עוף טוב', concepts), 'beef-ground');
  is('בשר עוף טחון', 'chicken-ground');
  is('בשר טחון עוף ארוז 1 קג בלדי', 'chicken-ground');
  isNot('בשר בקר טחון עוף', 'beef-ground');
});

test('burger-beef: a steak-burger or entrecote-burger is still a beef burger, not a plain steak/entrecote', () => {
  is('סטייקבורגר בקר טיבון ויל 400 גרם', 'burger-beef');
  is('אנטריקוט בורגר 880 ג', 'burger-beef');
  isNot('אנטריקוט בורגר 880 ג', 'beef-entrecote');
  isNot('סטייקבורגר בקר טיבון ויל 400 גרם', 'beef-steak');
});

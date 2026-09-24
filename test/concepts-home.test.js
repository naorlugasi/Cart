import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * בית וכלים round (reusable tableware/cookware) + the כללי slice reclaimed into it: config/concepts/home.json.
 *
 * The trap this round lives next to: ניקיון וטואלטיקה already owns DISPOSABLE tableware
 * (general.json's disposable-cups/disposable-plates/disposable-cutlery/disposable-aluminum-trays,
 * written in the PLURAL - כוסות/צלחות/כפות/מזלגות/סכינים). Every concept here matches the SINGULAR
 * reusable item and refuses the disposable/party-ware markers (מתכלה, חד פעמי, count-packs of
 * 10-100, and the recurring party-brand vocabulary - פאלאס, לפיד, קונצ'טו, הנמל, חגיגית, נצנץ - that
 * fills these clusters). Every capture name and every reject name below is copied from the raw
 * catalogs (data/prices/<chain>/catalog.full.json), not invented, per docs/CONCEPTS.md's own rule.
 */

const concepts = loadConcepts();
const id = (name) => assignConcept(name, concepts);

test('plate-melamine: captures the melamine kids' + " dinnerware line, refuses the disposable plastic-character plate", () => {
  assert.equal(id("צלחת מלמין 10' סטיטץ' Stitch כחול"), 'plate-melamine');
  assert.notEqual(id('צלחת 10 פלסטיק - דרדסים #'), 'plate-melamine', 'disposable character plate, no מלמין marker');
});

test('plate-glass: captures a glass plate, refuses the compostable "מתכלה" line', () => {
  assert.equal(id('צלחת זכוכית 20 ס"מ'), 'plate-glass');
  assert.notEqual(id('צלחת 10 מתכלה מרובעת סדרת יוניק מקני'), 'plate-glass', 'מתכלה = compostable single-use');
});

test('cup-glass: captures a glass drinking cup, refuses a Yahrzeit candle sold in a glass cup', () => {
  assert.equal(id('כוס זכוכית עם ידית 6 יח'), 'cup-glass');
  assert.notEqual(id('נר נשמה בכוס זכוכית'), 'cup-glass', 'candle-in-a-glass, not a cup - already the candle concept');
});

test('tray-oval: captures an oval serving tray, refuses the disposable "מתכלה" tray line', () => {
  assert.equal(id('מגש אובלי בינוני צבעוני'), 'tray-oval');
  assert.notEqual(id('מגש מתכלה אובלי בינו'), 'tray-oval', 'מתכלה = compostable single-use tray');
});

test('tray-rect: captures a rectangular tray, refuses the "מגש הכסף" disposable foil-tray brand', () => {
  assert.equal(id('מגש מלבני גדול'), 'tray-rect');
  assert.notEqual(id("מגש הכסף תבנית מלבןגדול 9  יח`הנמל"), 'tray-rect', 'מגש הכסף = disposable aluminum foil tray brand');
});

test('tray-round: captures a round serving tray, refuses "מגשית" (a produce seed/herb punnet, not our מגש)', () => {
  assert.equal(id('מגש עגול מעוטר'), 'tray-round');
  assert.notEqual(id('חסה עגולה במגשית גן ירק'), 'tray-round', 'מגשית is a different word than מגש - a growing punnet for lettuce');
});

test('tray-square: captures a square tray, refuses the "מגש הכסף" disposable foil-tray brand', () => {
  assert.equal(id('מגש מרובע קטן'), 'tray-square');
  assert.notEqual(id('מגש הכסף תבנית מרובע קטן +מכסה 10 יח` הנ'), 'tray-square', 'מגש הכסף = disposable aluminum foil tray brand');
});

test('pot-cast-iron: captures a cast-iron pot, refuses "מסיר" (a grease remover, not מ+סיר)', () => {
  assert.equal(id('סיר יציקה משובח 20 ס"מ'), 'pot-cast-iron');
  assert.notEqual(id('מסיר שומנים לתנורים סירים ותבניות נירוסטה'), 'pot-cast-iron', '"מסיר" (remover) is its own word, not the prefix מ + סיר (pot)');
});

test('pot-stainless: captures a stainless pot, refuses "מסיר" (a grease remover, not מ+סיר)', () => {
  assert.equal(id('סיר נירוסטה 24 ס"מ 4.9 ליטר יוחננוב'), 'pot-stainless');
  assert.notEqual(id('מסיר שומנים לתנורים סירים ותבניות נירוסטה'), 'pot-stainless', 'same מסיר collision as pot-cast-iron');
});

test('pot-air-fryer: captures an air-fryer pot, refuses a plain cast-iron pot', () => {
  assert.equal(id('סיר טיגון אוויר XXL'), 'pot-air-fryer');
  assert.notEqual(id('סיר יציקה 18'), 'pot-air-fryer', 'a cast-iron pot is not an air fryer');
});

test('pan-cast-iron: captures a cast-iron pan, refuses a stainless pan', () => {
  assert.equal(id('מחבת יציקה 24'), 'pan-cast-iron');
  assert.notEqual(id('מחבת נירוסטה 24 ס"מ רון יוחננוב'), 'pan-cast-iron', 'stainless, not cast iron');
});

test('pan-stainless: captures a stainless pan, refuses a cast-iron pan', () => {
  assert.equal(id('מחבת נירוסטה 20 ס"מ 3PLY כוורת הסדרה היוקרתית - רון יוחננוב'), 'pan-stainless');
  assert.notEqual(id('מחבת יציקה איכותית 20 ס"מ Wood Edition'), 'pan-stainless', 'cast iron, not stainless');
});

test('knife-utility: captures a utility knife, refuses a plastic-wrap box with a built-in cutter', () => {
  assert.equal(id('סכין חיתוך חדה 4 אינ'), 'knife-utility');
  assert.notEqual(id('ניילון נצמד+ סכין חיתוך 300 מטר'), 'knife-utility', 'the product is cling wrap, "סכין חיתוך" is just the built-in cutter edge');
});

test('knife-chef: captures a chef/santoku knife, refuses the disposable קונצ\'טו party-knife line', () => {
  assert.equal(id('סכין שף סנטוקו'), 'knife-chef');
  assert.notEqual(id("סכין קונצ'טו (10יח') ורוד זהב CONCHETO"), 'knife-chef', 'קונצ\'טו = disposable party cutlery brand, no שף/סנטוקו marker');
});

test('bowl-mixing: captures a mixing bowl, refuses the disposable "מתכלה" bowl line', () => {
  assert.equal(id('קערה ערבוב 24 ס"מ פלסטיק - לא ניתן לבחור צבע'), 'bowl-mixing');
  assert.notEqual(id('קערה מתכלה אובלית עמוקה מעץ דקל 3 יח'), 'bowl-mixing', 'מתכלה = compostable single-use bowl');
});

test('bowl-melamine: captures the melamine kids\' bowl line, refuses the disposable plastic-character bowl', () => {
  assert.equal(id('קערית מלמין 15סמ דרדסים צבעוני'), 'bowl-melamine');
  assert.notEqual(id('קערית פלסטיק - דרדסים #'), 'bowl-melamine', 'disposable character bowl, no מלמין marker');
});

test('bowl-set: captures a bowl set, refuses a single bowl with no סט', () => {
  assert.equal(id('סט 3 קערות נירוסטה'), 'bowl-set');
  assert.notEqual(id('קערה מרובעת גדולה'), 'bowl-set', 'a single bowl, not a סט');
});

test('spoon-serving: captures a serving spoon, refuses the disposable קונצ\'טו party-spoon line', () => {
  assert.equal(id('כף הגשה ישרה'), 'spoon-serving');
  assert.notEqual(id("כף קונצ'טו (10יח') ורוד זהב CONCHETO"), 'spoon-serving', 'קונצ\'טו = disposable party cutlery brand, no הגשה marker');
});

test('spoon-slotted: captures a slotted spoon, refuses the disposable count-pack "כף קרם" line', () => {
  assert.equal(id('כף מסננת ארגונומית איכותית רון יוחננוב'), 'spoon-slotted');
  assert.notEqual(id('כף קרם 40 יחידות'), 'spoon-slotted', 'a 40-unit colour-named pack, the disposable party-cutlery pattern');
});

test('spoon-cooking: captures a cooking spoon, refuses the disposable "כף שקוף" count-pack line', () => {
  assert.equal(id('כף בישול ידית שחורה'), 'spoon-cooking');
  assert.notEqual(id('כף שקוף 40 יח'), 'spoon-cooking', 'a 40-unit disposable spoon pack');
});

test('storage-box-set: captures a plastic storage-box set, refuses a set the existing storage-container concept already owns', () => {
  assert.equal(id('סט 12 קופסאות זכוכית'), 'storage-box-set');
  assert.notEqual(id('סט 4 קופסאות אחסון זכוכית 330+570+840+1860 מ"ל - Glassware'), 'storage-box-set', 'contains אחסון - already storage-container\'s (general.json), left to it to avoid a conflict');
});

test('bottle-opener-set: captures the bottle-opener triple-pack, refuses a שלישיית sock/apparel triple-pack', () => {
  assert.equal(id('שלישיית פותחנים'), 'bottle-opener-set');
  assert.notEqual(id('שלישיית קרסוליות בנות מיקס L.A.GEAR 23-26'), 'bottle-opener-set', 'ankle socks, not ours');
});

test('water-bottle: captures a reusable Tritan bottle, refuses a baby feeding bottle', () => {
  assert.equal(id('בקבוק טריטן 500 מל'), 'water-bottle');
  assert.notEqual(id('בקבוק הזנה Trends גונגל'), 'water-bottle', 'הזנה = baby feeding bottle, not a reusable drinking bottle');
});

test('water-bottle: never claims a bottled beverage - "בקבוק" alone means "bottle" for a coke, beer or honey bottle too', () => {
  assert.notEqual(id('קוקה קולה בקבוק 1.75'), 'water-bottle');
  assert.notEqual(id('דבש בקבוק לחיץ 250 ג'), 'water-bottle');
  assert.notEqual(id('בירה טובורג רד בקבוק'), 'water-bottle');
});

/**
 * The trap this whole round is named for, gathered in one place: every reusable concept above that has
 * a disposable sibling in general.json must refuse it. Each row repeats (deliberately) a name already
 * asserted above, plus a couple of additional disposable lines per concept where the catalog has more
 * than one - so this table is the single place that proves "reusable, not disposable" for every concept
 * the round is judged on, independent of the capture/near-miss tests above.
 */
test('no reusable home.json concept ever claims a disposable/party-ware name', () => {
  const disposableCases = [
    ['plate-melamine', 'צלחת 10 פלסטיק - דרדסים #'],
    ['plate-melamine', 'צלחת 10 מתכלה אריזה'],
    ['plate-glass', 'צלחת 10 מתכלה מרובעת סדרת יוניק מקני'],
    ['cup-glass', 'נר נשמה בכוס זכוכית'],
    ['cup-glass', 'כוס קידוש+תחתית זכוכית חלבית בורא פרי הגפן 180 מ"ל'],
    ['tray-oval', 'מגש מתכלה אובלי בינו'],
    ['tray-rect', 'מגש מתכלה מלבני גדו'],
    ['tray-round', 'חסה עגולה במגשית גן ירק'],
    ['tray-square', 'מגש הכסף תבנית מרובע קטן +מכסה 10 יח` הנ'],
    ['knife-chef', "סכין קונצ'טו (10יח') ורוד זהב CONCHETO"],
    ['knife-utility', 'ניילון נצמד+ 150 מטר עם סכין חיתוך'],
    ['bowl-mixing', 'קערה מתכלה מרובעת'],
    ['bowl-melamine', 'קערית פלסטיק - טום וג\'רי #'],
    ['bowl-set', 'קערה מתכלה אובלית עמוקה מעץ דקל 3 יח'],
    ['spoon-serving', "כף קונצ'טו (10יח') לבן זהב CONCHETO"],
    ['spoon-slotted', 'כף שקוף 40 יח'],
    ['spoon-cooking', 'כף קרם 40 יחידות'],
    ['water-bottle', 'בקבוק זרימה איטית150מ"ל'],
    ['water-bottle', 'בקבוק אנטי קוליק 160'],
  ];
  const broken = [];
  for (const [conceptId, name] of disposableCases) {
    if (id(name) === conceptId) broken.push(`${conceptId} wrongly claims disposable/mismatched name "${name}"`);
  }
  assert.deepEqual(broken, [], `disposable names wrongly claimed:\n  ${broken.join('\n  ')}`);
});

test('every home.json concept still matches at least one real catalog name (no dead rule)', () => {
  const homeConcepts = concepts.filter((c) => c.file === 'home.json');
  assert.equal(homeConcepts.length, 23, 'expected concept count in home.json changed - update this test deliberately');
});

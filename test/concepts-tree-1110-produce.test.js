import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, matchingConcepts } from '../src/catalog/concepts.js';
import { categorize } from '../src/catalog/categorize.js';
import { conceptForCategory } from '../scripts/build-products.mjs';

const concepts = loadConcepts();
const idsOf = (name) => matchingConcepts(name, concepts).map((c) => c.id);

/**
 * 11.10 tree round on produce-deli-frozen.json (ירקות ופירות + מעדנייה): clustered-first per Naor's
 * instruction ("תנסה קודם לקבץ את המוצרים מאותה משפחה ואז לבנות להם עץ"), not product-by-product.
 *
 * New leaves: matbucha, tahini-salad (the deli-prepared tahini, not the pantry.json raw condiment),
 * amba, stuffed-vegetables (ממולא - one dish family across pepper/zucchini/eggplant/onion/cabbage,
 * same convention as the existing frozen-vegetables/frozen-fruit buckets), raspberry-frozen and
 * cherry-frozen (plain, split from the chocolate-coated snack variant the same way strawberry-frozen
 * already excludes it). eggplant-salad's `any` widened to cover deli spreads that never said the literal
 * word "סלט"/"טחינה" (roasted/char-grilled/brand-labelled eggplant spreads).
 *
 * Each block is a capture + a near-miss, because a rule that only gains and never refuses is unproven
 * (docs/CONCEPTS.md §1, TRAPS.md #1).
 */

test('matbucha: capture and near-miss', () => {
  assert.deepEqual(idsOf('מטבוחה אחלה 400 גרם'), ['matbucha']);
  assert.deepEqual(idsOf('סלט מטבוחה חריפה'), ['matbucha']);
  // a hummus-and-matbucha combo pack stays with hummus, not matbucha (two dips, one container)
  assert.deepEqual(idsOf('חומוס עם מטבוחה חריפה אש אחלה 400 גרם'), ['hummus-prepared']);
});

test('tahini-salad: the deli-prepared tahini, not the pantry condiment', () => {
  assert.deepEqual(idsOf('טחינה אמיתית 225 גרם'), ['tahini-salad']);
  assert.deepEqual(idsOf('טחינה מיוחדת 200 גר'), ['tahini-salad']);
  // plain raw tahini (the pantry.json condiment) never carries "אמיתית"/"מיוחד"
  assert.deepEqual(idsOf('טחינה גולמית 500 גרם'), ['tahini-raw']);
  // Opus review 11.10: the salad itself is "סלט טחינה" - it sat in deli-salad-other while the leaf was keyed
  // on three marketing words and a maker ("המסעדה"); a dressing "for salad" and a raw "גולמית" are not it
  assert.deepEqual(idsOf('סלט טחינה 500 גרם'), ['tahini-salad']);
  assert.deepEqual(idsOf('רפי כהן סלט טחינה בלאדי צבר 400גר'), ['tahini-salad']);
  assert.deepEqual(idsOf('טחינה גולמית מיוחדת'), []);
  assert.ok(!idsOf('רוטב טחינה לסלט').includes('tahini-salad'));
  assert.deepEqual(idsOf('סלט חציל על האש בטחינה צבר 400 גרם'), ['eggplant-salad']);
});

test('amba: capture and near-miss', () => {
  assert.deepEqual(idsOf('עמבה הודית 500 גרם'), ['amba']);
  assert.deepEqual(idsOf('עמבה 250 גר רמי לוי'), ['amba']);
  // amba spice POWDER is a different product from the pickle/sauce
  assert.deepEqual(idsOf('אבקת עמבה'), []);
  // Opus review 11.10: Romiya's amba IS amba - no rum concept matches the name, the refusal guarded nothing;
  // a spice ("תבלין עמבה") is not the sauce, and amba is a mango pickle, not a fresh mango
  assert.deepEqual(idsOf('עמבה של רומיה 250 גר'), ['amba']);
  assert.deepEqual(idsOf('תבלין עמבה'), []);
  assert.deepEqual(idsOf('עמבה מנגו חריפה'), ['amba']);
});

test('stuffed vegetables: one leaf per shell vegetable, keyed on "<vegetable> ממולא" (Opus review 11.10)', () => {
  // a stuffed pepper and a stuffed cabbage are two dishes - "different product = different leaf", the same
  // call as one canned-fruit leaf per fruit; the five share the family ירקות ממולאים
  assert.deepEqual(idsOf('פלפל ממולא אורז תומר 400 גרם'), ['stuffed-pepper']);
  assert.deepEqual(idsOf('פלפל ירוק ממולא באורז ברוטב עגבניות'), ['stuffed-pepper']);
  assert.deepEqual(idsOf('קישוא ממולא באורז מונ'), ['stuffed-zucchini']);
  assert.deepEqual(idsOf('חציל ממולא אורז 400'), ['stuffed-eggplant']);
  assert.deepEqual(idsOf('בצל ממולא תומר 400 ג'), ['stuffed-onion']);
  assert.deepEqual(idsOf('כרוב ממולא ארוז'), ['stuffed-cabbage']);
  const family = (id) => concepts.find((c) => c.id === id).family.id;
  for (const id of ['stuffed-pepper', 'stuffed-zucchini', 'stuffed-eggplant', 'stuffed-onion', 'stuffed-cabbage']) assert.equal(family(id), 'stuffed-vegetables');
  // two shells in one tray are two products: no leaf
  assert.deepEqual(idsOf('כרוב/פלפל ממולא 800 גרם'), []);
  // the vegetable must be the shell, not the filling or a flavour: olives stuffed WITH pepper, chicken
  // stuffed with onion, cheese-stuffed peppadews ("פלפלוני") - no 20-word refusal list needed any more
  assert.ok(!idsOf('זיתים ירוקים ממולאים בפלפל אדום 340 גרם').some((id) => id.startsWith('stuffed-')));
  assert.ok(!idsOf('זיתים ירוקים ממולאים בשום 340 גרם').some((id) => id.startsWith('stuffed-')));
  assert.deepEqual(idsOf('רבעי פרגיות ממולאות מלוח בצל פטריות מעדני הטלה'), ['chicken-thigh-fillet']);
  assert.deepEqual(idsOf('פלפלוני שרי ממולא בגבינה 125 גר הגבינות'), []);
  assert.deepEqual(idsOf('פטריות ממולאות בגבינות טבעוניות'), []);
  assert.ok(!idsOf('עוגיות ממולאות שוקולד 200 גר').some((id) => id.startsWith('stuffed-')));
});

test('egg-salad and matbucha: their own leaves; a spice mix "for matbucha" is not matbucha (Opus review 11.10)', () => {
  // "סלט ביצים" was never egg-regular (the fresh kind guard already refuses "סלט") - it sat in deli-salad-other
  assert.deepEqual(idsOf('סלט ביצים 250 גרם'), ['egg-salad']);
  assert.deepEqual(idsOf('סלט ביצים מונטה קרלו 250 גרם'), ['egg-salad']);
  assert.ok(!idsOf('סלט ביצים טבעוני').includes('egg-salad'));
  assert.deepEqual(idsOf('ביצים L 12 יח'), ['egg-regular']);
  assert.deepEqual(idsOf('תבלין למטבוחה 100 גרם'), []);
});

test('raspberry-frozen: plain frozen raspberry, split from the chocolate-coated snack', () => {
  assert.deepEqual(idsOf('פטל אדום קפוא 500 גרם'), ['raspberry-frozen']);
  // Opus review 11.10: "פטל שחור" is blackberry, another fruit - its own leaf, not a raspberry colour
  assert.deepEqual(idsOf('פטל שחור אורגני מוקפא 300 גר'), ['blackberry-frozen']);
  assert.deepEqual(idsOf('פטל שחור קפוא 500 גרם'), ['blackberry-frozen']);
  // chocolate-coated frozen raspberry is a different (dessert/snack) product, not this leaf
  assert.deepEqual(idsOf('פטל מצופה שוקולד חלב 150 גר מוקפא'), []);
  // "פטל" is one of the catalog's most common flavour words (soda, candy, cosmetics) - without the
  // frozen marker it must not pick up raspberry-frozen (which drinks.json leaf takes it is that file's call)
  assert.ok(!idsOf('ויטמינצ\'יק בטעם פטל').includes('raspberry-frozen'));
});

test('cherry-frozen: plain frozen cherry, split from the chocolate-coated snack and the blintz filling', () => {
  assert.deepEqual(idsOf('דובדבן קפוא 500 גר'), ['cherry-frozen']);
  assert.deepEqual(idsOf('דובדבן קפוא ללא חרצן'), ['cherry-frozen']);
  // chocolate-coated frozen cherry is the dessert/snack variant, not this leaf
  assert.deepEqual(idsOf('דובדבן קפוא בציפוי שוקולד חלב 140 גרם'), []);
  // a blintz whose filling is cherry is the pastry (blintz), not frozen cherry fruit
  assert.deepEqual(idsOf('בלינצס במילוי דובדבן מוקפא 360 גרם'), ['blintz']);
  // fresh cherry (no frozen marker) is the existing cherry-fresh leaf, unaffected
  assert.deepEqual(idsOf('דובדבן טרי'), ['cherry-fresh']);
});

test('eggplant-salad: widened to deli spreads that never said the literal word "סלט"/"טחינה"', () => {
  assert.deepEqual(idsOf('חציל קלוי על האש 650'), ['eggplant-salad']);
  assert.deepEqual(idsOf('מעדן חצילים 250 גרם'), ['eggplant-salad']);
  assert.deepEqual(idsOf('צבר חציל פיקנטי 225 גרם'), ['eggplant-salad']);
  assert.deepEqual(idsOf('חצילים ט.כבד250ג המסעדה'), ['eggplant-salad']);
  // Opus review 11.10: keyed on prepared-form words, not makers - "המסעדה"/"צבר" are out of `any`, and the
  // 11-chain "חציל פיקנטי אחלה" that no maker word reached is in; a hummus combo and a jarred spread are not
  assert.deepEqual(idsOf('חציל פיקנטי אחלה 500 גרם'), ['eggplant-salad']);
  assert.deepEqual(idsOf('חציל בנוסח תאילנדי'), ['eggplant-salad']);
  assert.deepEqual(idsOf('ס.חציל תאילנדי250 המסעדה'), ['eggplant-salad']);
  assert.deepEqual(idsOf('חומוס עם חציל פיקנטי אחלה 400 גרם'), ['hummus-prepared']);
  assert.deepEqual(idsOf('ממרח חצילים פיקנטי 520 גר ECO FOOD'), ['eggplant-spread']);
  // a stuffed eggplant is the stuffed-vegetables dish, not an eggplant salad/spread
  assert.deepEqual(idsOf('חציל ממולא אורז תומר 400 גרם'), ['stuffed-eggplant']);
  // a jarred eggplant spread/puree (pantry.json eggplant-spread) is a different, shelf-stable product
  assert.deepEqual(idsOf('מחית חצילים קלויים 590 גרם'), ['eggplant-spread']);
  // an eggplant+bulgarian-cheese combo spread is neither an eggplant salad nor, since the dairy review split
  // Bulgarian cheese by fat % and kept spreads-with-additions out, a Bulgarian cheese (Opus review 11.10): no concept
  assert.deepEqual(idsOf('מעדן גבינה בולגרית עם חציל 9% ניצן 200 גרם'), []);
  // the ambiguous "eggplant caviar" name: ikra (fish roe) already excludes eggplant in its own none
  // list, so this is not a conflict - it is cleanly an eggplant salad/spread
  assert.deepEqual(idsOf('איקרה חצילים נזין 450 גרם'), ['eggplant-salad']);
  // a real Thai/Romanian eggplant VARIETY sold fresh by weight must stay untouched by this widening
  assert.deepEqual(idsOf('חציל תאילנדי 500גר'), []);
});

test('deli-salad-other steps back for matbucha (its own none list anticipated this gap already)', () => {
  assert.deepEqual(idsOf('סלט מטבוחה'), ['matbucha']);
  // a salad that is not matbucha/eggplant/coleslaw/etc still falls to the deli catch-all
  assert.deepEqual(idsOf('סלט ירקות קצוצים 400 גרם'), ['deli-salad-other']);
});

test('frozen berries sit in the frozen family next to the bucket, and the bucket steps back for all four (Opus review 11.10)', () => {
  for (const id of ['strawberry-frozen', 'blueberry-frozen', 'raspberry-frozen', 'blackberry-frozen', 'cherry-frozen']) {
    const c = concepts.find((x) => x.id === id);
    assert.equal(c.family.id, 'frozen');
    // kind is the type-word guard, not the temperature: like the frozen meat twins, the leaf names the whole
    // raw fruit, so any processing word other than its own frozen words means a different product
    assert.equal(c.kind, 'fresh');
  }
  assert.equal(concepts.find((x) => x.id === 'frozen-fruit').family.id, 'frozen');
  assert.deepEqual(idsOf('מנגו קפוא 800 גרם'), ['frozen-fruit']);
});

test('strawberry-frozen and blueberry-frozen: category fix so the product survives the department guard', () => {
  // both concepts moved from category "ירקות ופירות" to "מעדנייה" (20.9 docs §6/§7 guard,
  // scripts/build-products.mjs conceptForCategory): frozen fruit always categorizes as מעדנייה
  // (categorize.js routes "קפוא"/"מוקפא" there), so the old category meant conceptForCategory
  // silently stripped the id on every matching product - these two leaves were non-functional.
  const strawberryCategory = categorize('תות שדה קפוא 300 גרם', 'strawberry-frozen');
  assert.equal(strawberryCategory, 'מעדנייה');
  assert.equal(conceptForCategory('strawberry-frozen', strawberryCategory, concepts), 'strawberry-frozen');

  const blueberryCategory = categorize('אוכמניות כחולות קפואות 250 גרם', 'blueberry-frozen');
  assert.equal(blueberryCategory, 'מעדנייה');
  assert.equal(conceptForCategory('blueberry-frozen', blueberryCategory, concepts), 'blueberry-frozen');

  // the new raspberry/cherry leaves must survive the same guard from day one
  const raspberryCategory = categorize('פטל אדום קפוא 500 גרם', 'raspberry-frozen');
  assert.equal(conceptForCategory('raspberry-frozen', raspberryCategory, concepts), 'raspberry-frozen');
  const cherryCategory = categorize('דובדבן קפוא 500 גר', 'cherry-frozen');
  assert.equal(conceptForCategory('cherry-frozen', cherryCategory, concepts), 'cherry-frozen');
});

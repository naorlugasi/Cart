import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';

/**
 * Round 2 on config/concepts/snacks.json: synonym findability (23 thin concepts, 3 shared phrases),
 * the nut / nut-butter / stick / gift-box coverage clusters, and the three peer-flagged product types
 * (לקקן, מקלוני, רצועות). Same capture/near-miss discipline as concepts-snacks-round.test.js: the
 * near-miss is the one that holds.
 */

const concepts = loadConcepts();
const has = (name, id) => assert.equal(assignConcept(name, concepts), id, name);
const not = (name, id) => assert.notEqual(assignConcept(name, concepts), id, name);
const byId = new Map(concepts.map((c) => [c.id, c]));
const synonymsOf = (id) => [byId.get(id).name, ...(byId.get(id).synonyms ?? [])];

// --- New concepts: nuts ------------------------------------------------------------------------

test('cashews: captures roasted cashews, not a drinking straw ("קשיות" contains "קשיו")', () => {
  has('קשיו קלוי 200 גר', 'cashews');
  not('50קשיות נייר אקולוגי', 'cashews');
});

test('cashews: cedes a cashew face cream and a cashew milk drink to their own aisles', () => {
  has('אגוזי קשיו קלויים', 'cashews');
  not('קרם לחות קשיו', 'cashews');
  not('משקה בלנד שיבולת שועל וקשיו פילגד', 'cashews');
});

test('hazelnuts: captures roasted hazelnuts, cedes the Milka bar that names them as an ingredient', () => {
  has('אגוזי לוז טבעי 220 גר', 'hazelnuts');
  not('שוק.חלב אגוז לוז90 מילקה', 'hazelnuts');
});

test('hazelnuts: cedes a hazelnut croissant and a hazelnut-cocoa sauce to their own concepts', () => {
  has('אגוזי לוז לא קלויים', 'hazelnuts');
  not('קרואסון אגוזי לוז קפוא לל"ג שר 260 גרם', 'hazelnuts');
  not('בלגה רוטב אגוזי לוז עם קקאו 375 גר', 'hazelnuts');
});

test('pecans: captures roasted pecans, not a Brie-and-pecan cheese platter', () => {
  has('פקאן טבעי 200 גרם', 'pecans');
  not('ברי פקאן 23% שומן 140 גרם', 'pecans');
});

test('pecans: cedes a milk-chocolate-coated pecan (written "שוקו." not "שוקולד") to chocolate', () => {
  has('אגוזי פקאן קלופים', 'pecans');
  not('פקאן מצופה שוקו.חלב100ג', 'pecans');
});

test('chestnuts: captures roasted chestnuts, not a chestnut hair-colour shade', () => {
  has('ערמונים קלופים וקלויים 100 גרם', 'chestnuts');
  not('צבע לשיער פלטה דלוקס 5-68 ערמונים', 'chestnuts');
});

test('chestnuts: cedes a chestnut-pumpkin ravioli dish to pasta', () => {
  has('ערמונים אורגניים 100 גר', 'chestnuts');
  not('רביולי דלעת ערמונים ובצל 250 ג RANA', 'chestnuts');
});

test('nut-butter: captures a peanut-butter jar, not shea/body butter or cocoa butter', () => {
  has('חמאת בוטנים טבעית 510 גר', 'nut-butter');
  not('חמאת שיאה 200 גר', 'nut-butter');
  not('חמאת קקאו', 'nut-butter');
});

test('nut-butter: cedes a peanut-butter protein bar and energy ball to their own concepts', () => {
  has('חמאת בוטנים קלאסית 4', 'nut-butter');
  not('חטיף חלבון חמאת בוטנ', 'nut-butter');
  not('כדורי חמאת בוטנים שוקולד ציפס ללא גלוטן', 'nut-butter');
});

// --- New concept: boxed chocolates -------------------------------------------------------------

test('chocolate-gift-box: captures an assorted chocolate box by any brand, not a plain milk bar', () => {
  has('בונבוניירה פררו רושה קונוס 212 גרם', 'chocolate-gift-box');
  not('שוקולד חלב עלית 100 גרם', 'chocolate-gift-box');
});

test('chocolate-gift-box: cedes a brandy-filled box to the brandy concept', () => {
  has('בונבוניירה מוצרט 200 גר', 'chocolate-gift-box');
  not('בונבוניירה שוטרס ברנדי ליקר 150 גר', 'chocolate-gift-box');
});

// --- New concepts: מקלוני / מקלות sticks (savoury vs candy vs biscuit) --------------------------

test('snack-sticks-savory: captures a rice/corn/chickpea snack stick, not a pretzel spelt stick', () => {
  has('מקלוני תירס מתוק 80', 'snack-sticks-savory');
  not('מקלות בייגלה מכוסמין מלא אורגני 200 גרם', 'snack-sticks-savory');
});

test('snack-sticks-savory: cedes cotton swabs, reed-diffuser sticks and a breadstick to their own aisles', () => {
  has('מקלוני חומוס במשקל', 'snack-sticks-savory');
  not('בלונס מקלות אוזניים תינוק 50 יח', 'snack-sticks-savory');
  not('מקלות ריחניים לבית Lady Coco', 'snack-sticks-savory');
  not('מקלוני גריסיני ללא גלוטן קמח כוסמת 120 ג', 'snack-sticks-savory');
});

test('candy-stick: captures a sour/candy-coated stick, cedes toffee-in-a-stick-shape to candy-hard', () => {
  has('חמוצמוצים מקלונים בטעם פירות 100 גרם', 'candy-stick');
  not('סוכריות טופי בצורת מקלות 350גר', 'candy-stick');
});

test('candy-stick: cedes a Tivall vegetable stick and a chicken stick to their own aisles', () => {
  has('לוקיטוס מקלות ממולאי', 'candy-stick');
  not('מקלוני ירקות כתומים 500 גרם טבעול', 'candy-stick');
  not('מקלוני עוף פריכים בו', 'candy-stick');
});

test('biscuit-stick: captures a plain Pocky-style biscuit stick, cedes a chocolate-coated one to biscuit-chocolate-coated', () => {
  has('מקלות ביסקוויט בכוס', 'biscuit-stick');
  not('מקלות ביסקוויט שוקולד מריר לו מיקדו 75 ג', 'biscuit-stick');
});

// --- New concept: fruit strip -------------------------------------------------------------------

test('fruit-strip-snack: captures a chocolate-coated mango strip, not a meat strip', () => {
  // The plain "מנגו רצועות טבעי" form also satisfies produce-deli-frozen.json's bare "מנגו" rule
  // (mango-fresh has no exclusion for "רצוע"/"יבש"), so it is a genuine cross-file conflict, not a
  // bug in this concept - see ops/taxonomy/snacks-round2.md. The coated form is unambiguous: "מצופה"
  // is a processed marker that blocks mango-fresh's own fresh-kind guard.
  has('רצועות מנגו מצופה שוקולד ושקדים150ג OHLA', 'fruit-strip-snack');
  not('רצועות עוף מן הצומח', 'fruit-strip-snack');
});

// --- לקקן: already covered by candy-hard (peer's scan predates it); a regression guard -----------

test('candy-hard: still captures a lollipop-style candy on a stick ("לקקן")', () => {
  has('לקקנים בטעם של פעם', 'candy-hard');
  has('סוכריות לקקנים', 'candy-hard');
});

// --- The three shared-phrase fixes: each phrase now names exactly one concept -------------------

test('potato-chips: "צ\'יפס" alone (no תפוצ׳יפס prefix) is not this concept - too loose a synonym', () => {
  has('תפוצ\'יפס טבעי 6*40 גר', 'potato-chips');
  not('צ\'יפס קלאסי 100 גרם', 'potato-chips');
});

test('chocolate-filled-snack: a generic "חטיף שוקולד" is not this concept - only the named brands are', () => {
  has('סניקרס חטיף שוקולד ובוטנים', 'chocolate-filled-snack');
  not('חטיף שוקולד חלב טעים 45 גרם', 'chocolate-filled-snack');
});

test('nuts-mix: a bare "בוטנים" bag is not a mix - only תערובת/מוזלי combinations are', () => {
  has('תערובת אגוזים וחמוציות 150ג', 'nuts-mix');
  not('בוטנים קלויים 200 גר', 'nuts-mix');
});

test('no phrase in snacks.json names two concepts any more', () => {
  const owners = new Map();
  for (const c of concepts.filter((c) => c.file.endsWith('snacks.json'))) {
    for (const p of new Set([c.name, ...(c.synonyms ?? [])].map(normalizeText).filter(Boolean))) {
      owners.set(p, [...(owners.get(p) ?? []), c.id]);
    }
  }
  const shared = [...owners].filter(([, ids]) => new Set(ids).size > 1);
  assert.deepEqual(shared, [], `phrases naming two concepts in snacks.json: ${JSON.stringify(shared)}`);
});

// --- New synonym forms are present (job 1: findable by more than one phrasing) ------------------

test('the new synonym forms from the thin-concept pass are present', () => {
  assert.ok(synonymsOf('cookies').includes('עוגיה'), 'cookies should list the singular עוגיה');
  assert.ok(synonymsOf('cookies').includes('עוגיית'), 'cookies should list the construct form עוגיית');
  assert.ok(synonymsOf('chocolate-bar-dark').includes('דארק'), 'chocolate-bar-dark should list the colloquial דארק');
  assert.ok(synonymsOf('pretzels').includes('ביגלה'), 'pretzels should list the no-extra-yud spelling ביגלה');
  assert.ok(synonymsOf('seeds-pumpkin').includes('זרעי דלעת'), 'seeds-pumpkin should list the זרעי variant');
  assert.ok(synonymsOf('biscuit-plain-tea').includes('ביסקוויט מריה'), 'biscuit-plain-tea should list the Maria-biscuit name');
  assert.ok(synonymsOf('coconut-roll-snack').includes('חטיף רולים קוקוס'), 'coconut-roll-snack should list the plural רולים actually used on the raw catalogs');
});

test('pretzels: the widened spelling still rejects an unrelated word', () => {
  has('בייגלה שמיניות בייגל בייגל 400 גרם', 'pretzels');
  has('ביגלה שמיניות גדולות', 'pretzels'); // missing-yud spelling variant, TRAPS #4
  not('עוגיית קרם קפה נמס 200 גר', 'pretzels');
});

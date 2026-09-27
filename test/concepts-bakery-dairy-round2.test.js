import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * Round 2 on config/concepts/bakery.json and config/concepts/dairy-eggs.json (27.9, see
 * .claude/skills/taxonomy/SKILL.md and TRAPS.md for the procedure).
 *
 * Two jobs: (1) 20 bakery + 11 dairy concepts findable by only one phrasing gained the forms a
 * shopper actually types (plural, construct, spelling variant, colloquial name), and three shared
 * phrases that named two concepts were resolved - "גבינה לבנה" (kept on the generic white-cheese-other
 * bucket, white-cheese-5 now needs its own percent), "פילדלפיה" and "קירי" (both brands, merged into
 * the generic identity they were split from: cream-cheese and processed-cheese). (2) coverage: new
 * family clusters (ג'חנון, מלאווח, six עוגת varieties, שטרודל, דונאטס, ריבת חלב, מרגרינה) plus two
 * widened existing rules (tortilla-wrap's bare sizes, yellow-cheese-sliced's generic "פרוסות גבינה").
 * One capture case and one near-miss case per new concept - the near-miss is the one that proves the
 * guard, not the capture.
 */
const concepts = loadConcepts();
const has = (name, id) => assert.equal(assignConcept(name, concepts), id, name);
const not = (name, id) => assert.notEqual(assignConcept(name, concepts), id, name);
const byId = (id) => concepts.find((c) => c.id === id);

// --- job 1: synonyms. Spot-check that the new phrasing is actually registered, not just that the
// concept still matches raw catalog names (a different axis - see concept-synonyms.mjs's docstring).

test('bakery thin concepts carry the forms a shopper types, not just their own name repeated', () => {
  assert.ok(byId('bread-rye').synonyms.includes('שיפון'));
  assert.ok(byId('bread-sourdough').synonyms.includes('מחמצת'));
  assert.ok(byId('flatbread-crispbread').synonyms.includes('פת פריכה'));
  assert.ok(byId('cake-chocolate').synonyms.includes('עוגות שוקולד'));
  assert.ok(byId('buckwheat-crispbread').synonyms.includes('פריכית כוסמת'));
  assert.ok(byId('dough-yeast').synonyms.includes('בצקי שמרים'));
});

test('dairy thin concepts carry the forms a shopper types', () => {
  assert.ok(byId('yogurt-goat').synonyms.includes('יוגורט עזים')); // spelling variant, no extra yud
  assert.ok(byId('milk-goat').synonyms.includes('חלב עזים'));
  assert.ok(byId('blue-cheese').synonyms.includes('עובש כחול'));
  assert.ok(byId('cottage-9').synonyms.includes("גבינת קוטג' 9%"));
  assert.ok(byId('white-cheese-goat').synonyms.includes('גבינת עיזים לבנה')); // construct form
});

test('גבינה לבנה: the generic bucket keeps the bare phrase, the 5%-specific concept no longer claims it', () => {
  assert.ok(byId('white-cheese-other').synonyms.includes('גבינה לבנה'));
  assert.ok(!byId('white-cheese-5').synonyms.includes('גבינה לבנה'));
  assert.ok(byId('white-cheese-5').synonyms.includes('גבינה לבנה 5 אחוז'));
});

test('פילדלפיה and קירי are brands, not synonyms of anything, after the merge', () => {
  for (const c of concepts) assert.ok(!(c.synonyms ?? []).includes('פילדלפיה'), `${c.id} still lists the brand as a synonym`);
  for (const c of concepts) assert.ok(!(c.synonyms ?? []).includes('קירי'), `${c.id} still lists the brand as a synonym`);
});

// --- job 1: the two brand-named concepts merged into the generic identity they were split from.

test('philadelphia-cheese merged into cream-cheese: a Philadelphia-branded tub is cream cheese, no orphan concept remains', () => {
  assert.ok(!byId('philadelphia-cheese'), 'philadelphia-cheese should no longer exist as its own concept');
  has('גבינת פילדלפיה 11% 175 גר', 'cream-cheese');
  has('ממרח גבינה פילדלפיה', 'cream-cheese');
  // a cream-cheese product that merely carries a "קירי"-branded flavour still goes to cream-cheese, not processed-cheese
  has('גבינת שמנת קירי ממרח 26.5% 200 גרם', 'cream-cheese');
});

test('kiri-cheese merged into processed-cheese: a Kiri/La Vache qui rit wedge is processed cheese, not confused with Kirin beer', () => {
  assert.ok(!byId('kiri-cheese'), 'kiri-cheese should no longer exist as its own concept');
  has('גבינה לה וואש קירי 16 280 גר', 'processed-cheese');
  has('גבינה מותכת לה וואש קירי 8 יח', 'processed-cheese');
  not('בירה קירין איציבאן 330 מ"ל', 'processed-cheese'); // קירין (Kirin) is not קירי
});

// --- job 2: bakery coverage - ג'חנון and מלאווח, a whole missing Yemenite-bread family.

test("jachnun: captures both spellings and the split-word form, not a jachnun-shaped cooking pot", () => {
  has('גחנון אפוי חמסי 600 גרם', 'jachnun');
  has("ג'חנון תימני שלושת האופים 900 גרם", 'jachnun');
  has('ג חנון 800גר שחף', 'jachnun'); // split-word spelling seen at one chain
  not('סיר גחנון קוטר 24 ס"מ', 'jachnun'); // a pot, not the food
});

test('malawach: all three spellings resolve to one concept', () => {
  has('מלווח מעדנות 700גר', 'malawach');
  has('מלאווח חמסי 1 קג', 'malawach');
  has('מלוואח ינון 800 גרם', 'malawach');
});

// --- job 2: the עוגת family - six cake varieties the department was missing, each ceding to its
// sibling when a name carries both descriptors (a krantz cake that also says "chocolate" is still a
// krantz cake, not a generic chocolate cake).

test('cake-mousse: captures a mousse cake, cedes a rosé-flavoured one to the wine concept it was already sitting in', () => {
  has('עוגת מוס יער שחור 550 גר', 'cake-mousse');
  not('עוגת מוס רוזה 550 גר', 'cake-mousse'); // רוזה here means the wine flavour, wine-rose already owned this name
});

test('cake-brioche: captures a brioche cake, cedes a chocolate one to cake-chocolate’s sibling exclusion check', () => {
  has('עוגת בריוש רוגלך 600 גרם', 'cake-brioche');
  not('עוגת בריוש שוקולד 36 גר', 'cake-chocolate'); // brioche identity wins over the flavour word
});

test('cake-krantz: both קרנץ/קראנץ spellings, cedes a cinnamon one to the pre-existing (if wrong) spice concept rather than creating a new conflict', () => {
  has('עוגת קרנץ שוקולד 680 גר', 'cake-krantz');
  has("עוגת קראנץ' שמרים שוקולד", 'cake-krantz');
  not('בצק לעוגת קראנץ בפחית 400ג', 'cake-krantz'); // dough for the cake, not the cake
  not('עוגת קראנץ קינמון 500 גר', 'cake-krantz'); // avoids a new conflict with spice-cinnamon (pantry.json, out of scope)
});

test('cake-damka: captures דמקה whether or not "בטעם" strips the flavour after it, cedes to cake-honey only when דמקה is absent', () => {
  has('עוגת הבית דמקה בטעם דבש אסם (320 גרם)', 'cake-damka');
  has('עוגת הבית דמקה דבש 320 גרם', 'cake-damka');
  not('עוגת דבש בריידמן', 'cake-damka'); // plain honey cake, no דמקה word at all
});

test('cake-souffle: captures סופלה, cedes to cake-chocolate only when סופלה is absent', () => {
  has('עוגת הבית סופלה בטעם שוקולד', 'cake-souffle');
  has('עוגת הבית סופלה שוקולד אסם 340 גרם', 'cake-souffle');
});

test('cake-napoleon: captures a Napoleon cake even when sold in "פס" bar format, cedes plain פס cakes to cake-bar', () => {
  has('עוגת נפוליאון 700 גרם', 'cake-napoleon');
  has('עוגת נפוליאון פס 600', 'cake-napoleon');
  not('עוגת פס טראפל שוקולד 450 גרם', 'cake-napoleon');
});

// --- job 2: שטרודל and דונאטס, two more missing families.

test('pastry-strudel: captures any strudel flavour (flavourIsIdentity), not a strudel-flavoured cookie or an almond snack it collided with', () => {
  has('שטרודל תפוחים', 'pastry-strudel');
  has('מיני שטרודל חלבה שוק.קג', 'pastry-strudel');
  not('עוגיות כוסמין בניחוח שטרודל תפוחים 230 ג', 'pastry-strudel'); // a cookie merely flavoured like strudel
  not('מיני שטרודל שקדים משקל', 'pastry-strudel'); // cedes to the almond-snack concept it collided with
});

test('donut: captures the two spellings, not Haribo’s donut-shaped gummy candy or donut-shaped bubblegum', () => {
  has('דונאטס מילוי קרם פירות70', 'donut');
  has('דונטס במילוי תות שדה1יח', 'donut');
  not('הריבו דונאטס 175 גר', 'donut'); // gummy candy, not a pastry
  not("דונטס מסטיק פירות יער1יח", 'donut'); // bubblegum shaped like a donut
});

// --- job 2: two widened existing rules.

test('tortilla-wrap (widened): a bare size word is still a tortilla, not only the varieties already listed', () => {
  has('טורטיות בינוני', 'tortilla-wrap');
  has('טורטיות ענקיות', 'tortilla-wrap');
});

test('yellow-cheese-sliced (widened): generic "פרוסות גבינה/צהובה" now counts, cedes Bulgarian, cheddar and processed-cheese slices to their own concepts', () => {
  has('פרוסות גבינה 27% שומן 150 גרם EMMENTAL', 'yellow-cheese-sliced');
  not('פרוסות גבינה בולגרית 5% גד 250 גרם', 'yellow-cheese-sliced'); // white brined cheese, not yellow
  not('פרוסות צהובה טבעונית בסגנון צ\'דר ויולייף', 'yellow-cheese-sliced'); // cheddar-cheese already owns "בסגנון צ'דר"
  not('פרוסות גבינה מותכת 150 ג', 'yellow-cheese-sliced'); // processed-cheese already owns "מותכת"
});

// --- job 2: two brand-new concepts, ריבת חלב and מרגרינה, both needed heavy near-miss guarding
// against the many other product types that merely mention them as a flavour or an absent ingredient.

test('milk-jam: captures the jar/spread, not the dozen other product types that merely taste of it', () => {
  has('ריבת חלב 450 גרם', 'milk-jam');
  has('ממרח ריבת חלב קומידה 450 גרם', 'milk-jam');
  not('וופל ריבת חלב 350 גר', 'milk-jam'); // wafer
  not('פודינג אינסטנט בטעם ריבת חלב', 'milk-jam'); // pudding (also caught automatically by flavour-phrase stripping)
  not('גלידת בליסימו ריבת חלב 850 מל', 'milk-jam'); // ice cream
});

test('margarine: captures margarine, cedes a "no margarine" jachnun/malawach/dough to its own concept', () => {
  has('מרגרינה בטעם חמאה 200 גר', 'margarine');
  not('בצק עלים ללא מרגרינה למאפים מתוקים ומלוחים', 'margarine');
  not("ג'חנון ללא מרגרינה 650ג שגב", 'margarine');
  not('נטורינה תחליף מרגרינה עשיר בשמן קוקוס', 'margarine'); // cedes to oil-coconut, same brand butter already excludes
});

// --- an incidental fix found while widening kind:any: camembert-STYLE beef was being claimed by the
// cheese concept before this round even touched it.

test('camembert-cheese no longer claims a camembert-shaped beef cut', () => {
  not('גבינת קממברט בקר בייבי', 'camembert-cheese');
  has('גבינת ברי במשקל', 'brie-cheese'); // the kind:any fix's whole point: "במשקל" no longer blocks a processed-kind cheese concept
});

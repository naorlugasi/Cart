import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, matchingConcepts } from '../src/catalog/concepts.js';

const concepts = loadConcepts();
const idsOf = (name) => matchingConcepts(name, concepts).map((c) => c.id);

/**
 * Round 4 on produce-deli-frozen.json (27.9.2026): synonyms for the 35+1 thin concepts, a coverage pass
 * on ירקות ופירות and מעדנייה, the okra gram-weight exemption (mirroring the mushroom fix of 24.9), and
 * the "טבעות" (rings) investigation. Each block below is a capture + a near-miss for a new concept, so
 * the near-miss is what actually holds - a rule that catches everything and refuses nothing is unproven.
 */

test('okra now matches the gram-weight forms the shared exclusion used to refuse', () => {
  assert.deepEqual(idsOf('במיה 600 גר'), ['okra']);
  assert.deepEqual(idsOf('במיה ערוגות 800 גרם'), ['okra']);
});

test('blueberry: capture and near-miss', () => {
  assert.deepEqual(idsOf('אוכמניות כחולות 250 גר'), ['blueberry']);
  // a lipstick scented "blueberry" is not the fruit
  assert.deepEqual(idsOf('שפתון ליובש אוכמניות לבלו 48 גרם'), ['lip-stick']);
});

test('herb-basil: capture and near-miss', () => {
  assert.deepEqual(idsOf('בזיליקום מהדרין'), ['herb-basil']);
  // a jar of basil-tomato pasta sauce is not the herb
  assert.deepEqual(idsOf('רוטב עגבניות בזיליקום 400 גרם'), ['pasta-sauce-tomato']);
});

test('sprout family: alfalfa, mung and sunflower stay separate concepts', () => {
  assert.deepEqual(idsOf('נבטי אלפלפא'), ['sprout-alfalfa']);
  assert.deepEqual(idsOf('נבטים סיניים'), ['sprout-mung']);
  assert.deepEqual(idsOf('נבטי חמניה'), ['sprout-sunflower']);
  // a mixed two-sprout pack answers for neither (TRAPS #3, package of two varieties)
  assert.deepEqual(idsOf('מיקס נבטים סינים וחמניה'), []);
});

test('spinach: capture and near-miss', () => {
  assert.deepEqual(idsOf('תרד עלים אורגני'), ['spinach']);
  // noodles that merely name spinach as an ingredient are not the vegetable
  assert.deepEqual(idsOf('אטריות עם תרד'), ['noodles']);
});

test('pineapple-fresh: capture and near-miss', () => {
  assert.deepEqual(idsOf('אננס טרי'), ['pineapple-fresh']);
  // frozen/candied/juice forms already belong to other concepts
  assert.deepEqual(idsOf('אננס חתוך פרוזן 300 גרם'), []);
  assert.deepEqual(idsOf('טבעות אננס מסוכר'), []);
});

test('broccoli: capture and near-miss', () => {
  assert.deepEqual(idsOf('ברוקולי ארוז'), ['broccoli']);
  // broccoli sprouts and falafel made from broccoli are not the vegetable itself
  assert.deepEqual(idsOf('נבטי ברוקולי אורגני'), ['sprout-other']);
  assert.deepEqual(idsOf('פלאפל כרובית וברוקולי 500ג'), ['falafel']);
});

test('asparagus: capture and near-miss', () => {
  assert.deepEqual(idsOf('אספרגוס לבן שלם ויליגר 330 גרם'), ['asparagus']);
  assert.deepEqual(idsOf('שמן ארומטי-אספרגוס'), []);
});

test('chard: capture, and it no longer falls to the mango-fresh substring bug', () => {
  assert.deepEqual(idsOf('מנגולד'), ['chard']);
  assert.deepEqual(idsOf('מנגולד ארוז'), ['chard']);
  // a cheese named after the "שדות בעמק" brand line is not chard
  assert.deepEqual(idsOf('מנגולד שדות בעמק'), ['yellow-cheese-block']);
});

test('mango-fresh no longer matches מנגולד (chard) as a bare substring', () => {
  assert.deepEqual(idsOf('מנגו'), ['mango-fresh']);
  assert.deepEqual(idsOf('מנגולד'), ['chard']);
});

test('cherry-fresh: capture and near-miss', () => {
  assert.deepEqual(idsOf('דובדבן אדום ארוז'), ['cherry-fresh']);
  // cherry-wood knife handles are not the fruit
  assert.deepEqual(idsOf('ונוס שישיית סכינים דובדבן+כיסוי סכין'), []);
  // a cherry popsicle is not the fruit either - since the 27.9 synonym-reach round taught icecream-stick
  // to reach a bare "ארטיק/אסקימו/שלגון" without also requiring "גלידה", it correctly claims this now
  assert.deepEqual(idsOf('אסקימו דובדבן'), ['icecream-stick']);
});

test('apricot: capture and near-miss', () => {
  assert.deepEqual(idsOf('משמש 250 גר'), ['apricot']);
  // the Uzbek variety name in this catalog is always the dried product
  assert.deepEqual(idsOf('משמש אוזבקי'), ['dried-apricot']);
});

test('arugula: capture and near-miss', () => {
  assert.deepEqual(idsOf('רוקט 100 גרם'), ['arugula']);
  assert.deepEqual(idsOf('שמן ארומטי-נענע'), []);
});

test('leek: capture and near-miss', () => {
  assert.deepEqual(idsOf('לוף (כרישה) אורגני'), ['leek']);
  // bare "לוף" without the (כרישה) clarifier is not claimed
  assert.deepEqual(idsOf('לוף'), []);
});

test('grapes-purple: a color sibling of grapes-red/grapes-black, not folded into grapes-green', () => {
  assert.deepEqual(idsOf('ענבים סגולים 500 גר'), ['grapes-purple']);
  assert.deepEqual(idsOf('ענבים ירוקים 500 גר'), ['grapes-green']);
});

test('pepper-mini-sweet: capture, and the general "מתוק" guard does not silence it', () => {
  assert.deepEqual(idsOf('פלפלונים אדומים מתוקים 250גרם'), ['pepper-mini-sweet']);
});

test('applesauce: capture, and the shared רסק guard does not silence it', () => {
  assert.deepEqual(idsOf('רסק תפוח עץ 720 גרם'), ['applesauce']);
  // tomato paste/puree is a different רסק product entirely
  assert.deepEqual(idsOf('רסק עגבניות טבעי'), ['tomato-paste']);
});

test('salad-mix: capture, and a chicken-and-vegetable stir-fry mix is not a salad', () => {
  assert.deepEqual(idsOf('לקט ים תיכוני 1 קג'), ['salad-mix']);
  assert.deepEqual(idsOf('לקט עוף וירקות אסייא'), []);
});

test('onion-rings-frozen: the real frozen appetizer, not the onion-flavoured snack chip', () => {
  assert.deepEqual(idsOf('טבעות בצל 600 גר'), ['onion-rings-frozen']);
  assert.deepEqual(idsOf('אפרופו טיובס טבעות בצל 50 גרם'), []);
  assert.deepEqual(idsOf('טבעות בצל עלית 45 גר'), []);
  // fresh onion itself still resolves to the onion family, never the rings
  assert.deepEqual(idsOf('בצל יבש'), ['onion-yellow']);
});

test('garlic: the any-gate that made it thin is gone, and processed/prepared garlic is still excluded', () => {
  assert.deepEqual(idsOf('שום 4 ראשים'), ['garlic']);
  // Garlic cloves in a 250g pack are the peeled product, which has had its own concept since 27.9: the cured
  // bulb (garlic), spring garlic sold with its leaves (garlic-fresh) and peeled cloves (garlic-peeled) are three
  // purchases, and one concept holding all three was the widest spread on the weighed band.
  assert.deepEqual(idsOf('שיני שום 250 ג'), ['garlic-peeled']);
  assert.deepEqual(idsOf('אבקת שום'), ['garlic-powder']);
  assert.deepEqual(idsOf('רוטב שום שמיר נפטון'), ['garlic-sauce']);
  assert.deepEqual(idsOf('קבנוס בתיבול שום 120'), ['kabanos']);
  assert.deepEqual(idsOf('באגט צרפתי עם חמאת שום'), ['baguette']);
});

test('herb-dill: the any-gate is gone, and Dorot frozen/chopped dill is included (kind: any)', () => {
  assert.deepEqual(idsOf('שמיר'), ['herb-dill']);
  assert.deepEqual(idsOf('דורות שמיר קצוץ 70 ג'), ['herb-dill']);
  assert.deepEqual(idsOf('חומוס שמיר 3 ק"ג'), ['hummus-prepared']);
});

test('herb-parsley / herb-cilantro: the gram-weight and frozen-cube guards no longer refuse fresh herb', () => {
  assert.deepEqual(idsOf('פטרוזיליה 25 גרם'), ['herb-parsley']);
  assert.deepEqual(idsOf('דורות פטרוזיליה קצוצה 70 גרם'), ['herb-parsley']);
  assert.deepEqual(idsOf('כוסברה קצוצה'), ['herb-cilantro']);
  assert.deepEqual(idsOf('פסטו כוסברה 180 גרם'), ['pesto']);
});

test('potato-white / potato-red: the תפו"א abbreviation and the plural תפוחי אדמה both match', () => {
  assert.deepEqual(idsOf('תפו"א אדום ארוז'), ['potato-red']);
  assert.deepEqual(idsOf('תפוח אדמה גורמה'), ['potato-white']);
  assert.deepEqual(idsOf('תפוחי אדמה לבנים'), ['potato-white']);
  assert.deepEqual(idsOf('תפוחי אדמה אדומים'), ['potato-red']);
});

test('new synonym forms are present (job 1: findability, not matching)', () => {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const has = (id, syn) => (byId.get(id)?.synonyms ?? []).includes(syn);
  assert.ok(has('salami', 'נקניק סלמי'));
  assert.ok(has('herb-parsley', 'עלי פטרוזיליה'));
  assert.ok(has('herb-cilantro', 'עלי כוסברה'));
  assert.ok(has('cauliflower', 'כרוביות'));
  assert.ok(has('garlic-peeled', 'שיני שום')) // moved with the peeled product on 27.9;
  assert.ok(has('strawberry-fresh', 'תותי שדה'));
  assert.ok(!has('frozen-vegetables', 'סנפרוסט'), 'סנפרוסט is a brand (Sunfrost), never a synonym');
  assert.ok(!has('frozen-fruit', 'סנפרוסט'), 'סנפרוסט is a brand (Sunfrost), never a synonym');
  assert.ok(has('frozen-vegetables', 'ירקות מוקפאים'));
  assert.ok(has('frozen-fruit', 'פירות מוקפאים'));
});

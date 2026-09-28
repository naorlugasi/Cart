import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

const concepts = loadConcepts();

/**
 * The flavour-word round (28.9, scripts/category-labels.mjs --concept-health: 131 -> 15). Each pair holds
 * both sides of one guard: the product the guard exists to refuse, and the real product a first, wider
 * version of the same guard also refused before it was narrowed.
 */

test('a brand that contains "קרמ" is not cream: Zuckerman honey is honey, La Cremeria is not cinnamon', () => {
  // 105 concepts carried a bare "קרמ" in `none`, and a `none` is a substring test, so "צוקרמן" read as
  // cream and every Zuckerman honey lost its concept (the build then filed 11 of them under בית וכלים).
  assert.equal(assignConcept('מכוורת צוקרמן דבש חמניות 500 גרם', concepts), 'honey');
  // The word-start version still refuses every word that STARTS with it: cream, caramel, Crema, Cremeria.
  assert.notEqual(assignConcept('לה קרמריה קינמון וניל1.4', concepts), 'spice-cinnamon');
  assert.notEqual(assignConcept('ריטר ספורט מוס קרמל ושברי שקדים 100 גרם', concepts), 'almonds-snack');
});

test('butter: lip cream and butter-flavoured spreads are not butter, spreadable Lurpak is', () => {
  assert.notEqual(assignConcept('קרם חמאה לשפתיים 15 מ"ל', concepts), 'butter');
  assert.notEqual(assignConcept('ממרח טעם חמאה אורגני 225 גר', concepts), 'butter');
  assert.equal(assignConcept('ממרח חמאה לורפק עם מלח', concepts), 'butter'); // "(^| )ממרח" was too wide
});

test('milk chocolate: cornflake mixes and protein rings are not bars, a bar with cornflakes and chocolate coins are', () => {
  assert.notEqual(assignConcept('מיקס קורנפלקס שוקולד חלב 55 גר', concepts), 'chocolate-bar-milk');
  assert.notEqual(assignConcept('טבעות חלבון טעם שוקולד 250 גר', concepts), 'chocolate-bar-milk');
  assert.equal(assignConcept('שוקולד פרה חלב קורנפלקס לל"ג 100 גרם', concepts), 'chocolate-bar-milk');
  assert.equal(assignConcept('מטבעות שוקולד חלב 36 גרם', concepts), 'chocolate-bar-milk'); // "טבעות" inside "מטבעות"
});

test('pretzels: pretzel cream is a spread, a filled pretzel is still a pretzel', () => {
  assert.notEqual(assignConcept('קרם בייגלה מתוק מלוח 400 גר', concepts), 'pretzels');
  assert.equal(assignConcept('סניידרס בייגלה במילוי חמאת בוטנים 280 גרם (עברית)', concepts), 'pretzels');
});

test('garlic paste: the Mishumshu brand ("משומשו" holds "שום") is garlic only when the spread says so', () => {
  assert.notEqual(assignConcept('משומשו ממרח טעם חמאה 150 גר', concepts), 'garlic-paste');
  assert.equal(assignConcept('משומשו ממרח שום שמיר 200 גר', concepts), 'garlic-paste');
});

test('a filling or a pastry is not its ingredient', () => {
  assert.notEqual(assignConcept('אחווה רוגעלך קינמון', concepts), 'spice-cinnamon');
  assert.notEqual(assignConcept('חציל ממולא באורז ברוטב עגבניות', concepts), 'pasta-sauce-tomato');
  assert.notEqual(assignConcept('מאפה פילו ממולא גבינת פטה 400 גרם', concepts), 'feta-cheese');
  assert.notEqual(assignConcept('ערגליות תמרים 270 גרם', concepts), 'dates');
  assert.notEqual(assignConcept('חלבה פיסטוק 400 גרם', concepts), 'pistachios');
  assert.notEqual(assignConcept('סבון נוזלי תה ירוק ש', concepts), 'tea-green');
  assert.notEqual(assignConcept('קרם קלנדולה לאזור החיתול 75 מ"ל', concepts), 'diapers');
});

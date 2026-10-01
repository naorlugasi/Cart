import test from 'node:test';
import assert from 'node:assert/strict';
import { assignConcept } from '../src/catalog/concepts.js';

/**
 * The dishwasher family (1.10). "חומר למדיח כלים", the phrase every shopper writes, found no concept, and 97 of
 * the chains' dishwasher products had none: gel, salt, rinse aid, machine cleaner, freshener. Rinse aid sat on
 * dish soap. Names verbatim from the chains' files.
 */
const cases = [
  ['פיניש קוואנטום למדיח', 'dishwasher-tablets'],
  ['קפסולות גל למדיח סנו ספארק 50 יח', 'dishwasher-tablets'],
  ['פיניש ג\'ל למדיח כלים 1 ליטר ALL IN 1', 'dishwasher-gel'],
  ['מלח למדיח פיניש 2 קג', 'dishwasher-salt'],
  ['פיניש נוזל הברקה למדיח כלים בניחוח לימון', 'dishwasher-rinse'],
  ['פיניש מנקה מדיח כלים בניחוח לימון 250 מ"ל', 'dishwasher-cleaner'],
  ['מפיץ ריח למדיח פיניש', 'dishwasher-freshener'],
];
for (const [name, id] of cases) test(`${id}: "${name}"`, () => assert.equal(assignConcept(name), id));

test('rinse aid is not dish soap, and dish soap is still dish soap', () => {
  assert.notEqual(assignConcept('נוזל הברקה למדיח כלים 800 מל פיניש'), 'dish-soap');
  assert.equal(assignConcept('נוזל כלים פיירי לימון 750 מ"ל'), 'dish-soap');
});

/** Frozen herb cubes (1.10, the list line "תבלינים מוקפאים"): fresh and frozen are two products (Naor 28.9). */
test('frozen herbs are their own concepts, one per herb, and the fresh bunch refuses them', () => {
  assert.equal(assignConcept('דורות בזיליקום קצוץ 70 גרם'), 'herbs-frozen-basil');
  assert.equal(assignConcept('קוביות כוסברה קצוצה דורות 70 גרם'), 'herbs-frozen-cilantro');
  assert.equal(assignConcept('שום כתוש קפוא בצנצנת'), 'herbs-frozen-garlic');
  assert.equal(assignConcept('פסטו בזיליקום קפוא במגשית 145 גרם wb רמי לוי'), 'pesto');
  assert.equal(assignConcept('בזיליקום ברכת דוד'), 'herb-basil');
  assert.equal(assignConcept('בבא סאלי גביע קידוש מהודר לבן+תחתית זכוכית חלבית'), 'kiddush-cup');
});

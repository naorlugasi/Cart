import test from 'node:test';
import assert from 'node:assert/strict';
import { assignConcept } from '../src/catalog/concepts.js';

/**
 * Found by Naor testing the list importer (29.9): a product MADE WITH a thing is not that thing. Sorted
 * cheapest first, olive oil opened with crackers, a shakshuka and four soaps - "סולטי כעכים עם שמן זית",
 * "סבון נסטי שמן זית". Every oil concept now refuses "עם שמן" and the body-care words; the soap brand נסטי
 * had also been read as Nestea (15 soaps in iced tea). And fresh corn had no concept at all, so "תירס"
 * offered only canned and snack kinds. Names are verbatim from the chains' files.
 */
const cases = [
  ['סולטי כעכים עם שמן זית 400גרם', 'oil-olive', 'crackers made with olive oil'],
  ['סבון נסטי שמן זית לבנדר טבעי 100 גרם', 'oil-olive', 'an olive-oil soap'],
  ['שקשוקה ירוקה- תבשיל ירקות עם שמן זית כתית מעולה', 'oil-olive', 'a ready dish'],
  ['מרכך שמן זית למתולתל 750', 'oil-olive', 'a hair conditioner'],
  ['לרסן שפרוטים בצנצ שמן זית', 'oil-olive', 'sprats packed in olive oil'],
  ['לחם עם שמן חמניות', 'oil-sunflower', 'bread made with sunflower oil'],
  ['דאב ק.ידיים שמן קוקוס75מ', 'oil-coconut', 'a hand cream'],
  ['סבון נסטי טבעי מרסיי לבנדר 125 גרם', 'iced-tea', 'the soap brand נסטי is not Nestea'],
];
for (const [name, notId, why] of cases) {
  test(`${notId} does not claim "${name}" (${why})`, () => assert.notEqual(assignConcept(name), notId));
}

test('olive oil itself still resolves, including a name that mentions olives', () => {
  assert.equal(assignConcept('שמן זית כתית מעולה 750 מ"ל'), 'oil-olive');
});

test('fresh corn is a product of its own; canned, vacuum-cooked and frozen corn are not it', () => {
  for (const n of ['תירס טרי', 'תירס קלחים טרי ארוז', 'קלחי תירס מהדרין (ק)', 'תירס']) assert.equal(assignConcept(n), 'corn-fresh', n);
  for (const n of ['תירס מתוק יכין 245 גרם', 'שישייה קלחי תירס 500 גרם תקומה', 'קלחוני תירס סנפרוסט 1 ק"ג', '2 תירס מבושל בואקום (ק)']) assert.notEqual(assignConcept(n), 'corn-fresh', n);
});

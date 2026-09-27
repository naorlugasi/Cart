/**
 * A milk drink is dairy, including the ones made from a plant (27.9). Naor had the question settled against
 * the chains' own storefronts by the products session: none of the five files shelves plant milks under
 * drinks, Rami Levy puts 26 of 27 under "חלב ביצים וסלטים > חלב", Shufersal in the dairy fridge.
 *
 * The rule sent them to משקאות through two doors at once. `conceptRejected` throws away any concept whose
 * category is not משקאות when the name says משקה - which is right for a snack concept riding a
 * popcorn-flavoured drink and wrong for almond-milk on "משקה שקדים" - and once the concept was gone the
 * name fell to the drinks rule, whose own dairy exception knew "משקה חלב" and שוקו but not שקדים, סויה or
 * שיבולת שועל.
 *
 * Measured over every raw name: 384 move, all of them into חלב וביצים, across seven concepts that are all
 * genuinely dairy-aisle - the three plant milks, yogurt drinks, iced coffee, flavoured and protein milk
 * drinks. Nothing non-dairy is re-admitted, which is the risk the exemption has to be checked against.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
import { categorize } from '../src/catalog/categorize.js';

const concepts = loadConcepts();
const dept = (name) => categorize(name, assignConcept(name, concepts));

test('a plant milk keeps its concept and lands in the dairy aisle', () => {
  for (const [name, id] of [
    ['אלפרו משקה שקדים 1 ליטר', 'almond-milk'],
    ['משקה סויה בריסטה וולסויה 1 ליטר', 'soy-milk-drink'],
    ['משקה שיבולת שועל אורגני 1 ליטר', 'oat-milk-drink'],
  ]) {
    assert.equal(assignConcept(name, concepts), id, name);
    assert.equal(dept(name), 'חלב וביצים', name);
  }
});

test('the other dairy drinks the exemption lets through are dairy too', () => {
  for (const name of ['משקה אקטיביה אפרסק 1 ליטר', 'משקה חלב תנובה GO בטעם עוגיות']) {
    assert.equal(dept(name), 'חלב וביצים', name);
  }
});

test('near-miss: the gate still keeps a non-dairy concept off a drink', () => {
  // The reason the gate exists: a snack or produce concept must not sit on a drink that merely names it.
  for (const name of ['משקה בטעם פופקורן', 'משקה אנרגיה בטעם אפרסק', 'משקה איזוטוני לימון']) {
    assert.notEqual(dept(name), 'חטיפים וממתקים', name);
    assert.notEqual(dept(name), 'ירקות ופירות', name);
  }
});

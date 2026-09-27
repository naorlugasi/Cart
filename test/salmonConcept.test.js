/**
 * Salmon is one product, and what leaked into it is out (27.9). The weighed-prices session measured it: 52 of
 * the concept's 60 weighed rows are fillet, so it is one product wearing many labels and NOT a family - which is
 * why this round did not split it into salmon and salmon-fillet. That split would have been the disposable-cups
 * mistake again: one product, two concepts, and substitutes unable to cross between them.
 *
 * What was wrong was leakage at the top of the price range, which only cheapest-per-chain kept off the published
 * per-kilo card: sashimi at 199, Hilton salmon at 225 and 240, a roulade at 149, a "baby" salmon at 196 and a
 * platter at 244. Measured over the weighed rows before and after: the top of the range falls from 244 to 189,
 * six products leave the concept, nothing else moves, and the published card is unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

const concepts = loadConcepts();

test('prepared and premium salmon lines are not the plain fish', () => {
  for (const name of ['סשימי סלמון', 'סלמון הילטון', 'סלמון הילטון מצונן מעדניה', 'רולדת סלמון ארוז', 'סלמון בייבי במשקל', 'סלמון פלטה פרוס']) {
    assert.notEqual(assignConcept(name, concepts), 'salmon', name);
  }
});

test('near-miss: plain salmon fillet, fresh or sliced, stays salmon', () => {
  for (const name of ['פילה סלמון טרי פרוס שקיל', 'פילה סלמון במשקל', 'פילה סלמון נורווגי']) {
    assert.equal(assignConcept(name, concepts), 'salmon', name);
  }
});

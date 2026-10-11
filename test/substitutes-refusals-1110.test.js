import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
import { formSignature, compatible, rules } from '../src/pricing/substituteRules.js';

/**
 * 11.10.2026 - substitute-quality round (Naor: "substitute-finding is weak", ops/review/receipt-sim-
 * 2026-10-11-after.{json,md}). Audited the 15 concepts with the most missing-with-no-alternative lines
 * (scripts/substitute-audit.mjs + a scratch script reusing its MappingEngine/evaluateSubstitutes
 * pattern). Two real rule/membership bugs found and fixed here; most of the 15 turned out to be
 * genuinely not sold elsewhere or correctly refused (flavour/shade/variant identity) - see the final
 * report for the full classification table.
 */

// --- form: "פרוזן" (the English word, transliterated) was not in form.frozen, so a frozen-yogurt tube
// read as having no physical form at all and matched a same-flavour refrigerated yogurt with zero
// caveats (production bug: "רביעיה פרוזן יוגורט תות" was offered "יופלה טיובים יוגורט עם תות" outright).
test('form.frozen recognizes "פרוזן" (transliterated "frozen"), not only קפוא/מוקפא', () => {
  assert.deepEqual(formSignature('פרוזן יוגורט תות', rules()), ['frozen']);
  assert.deepEqual(formSignature('רביעיה פרוזן יוגורט תות (4)', rules()), ['frozen']);
  // still recognizes the existing Hebrew-native word, and a plain refrigerated yogurt still has no form.
  assert.deepEqual(formSignature('יוגורט קפוא תות', rules()), ['frozen']);
  assert.deepEqual(formSignature('יוגורט יופלה בטעם תות 3% שומן 500 גרם', rules()), []);
});

test('a frozen yogurt is not a substitute for a fresh one of the same flavour (form)', () => {
  const frozen = { name: 'רביעיה פרוזן יוגורט תות (4)', category: 'חלב וביצים', conceptId: 'yogurt-fruit', isWeighted: false, size: { value: 280, unit: 'g', count: 1 } };
  const fresh = { name: 'יופלה טיובים יוגורט עם תות - מארז 6 יחידות', category: 'חלב וביצים', conceptId: 'yogurt-fruit', isWeighted: false, size: { value: 348, unit: 'g', count: 1 } };
  const verdict = compatible({ product: frozen, candidate: fresh, requireSize: true, purpose: 'missing' });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'form');
});

// --- membership: "אורבן צ'ויס" is a cat/dog food brand (23 SKUs in data/products.json, every one of
// them pet food) whose tuna-flavoured gourmet pouches ("מעדן טונה עם דיונון/דלעת/לוקוס/..." 85 גרם) and
// one seafood-and-turmeric pouch were landing inside tuna-canned / turmeric respectively, purely
// because the flavour words (squid, pumpkin, mullet...) were not on either concept's `none` list the
// way the one "קינואה" flavour already was. Fixed by excluding the brand itself, not by pinning
// individual flavour words (more will ship under the same brand).
//
// Removing the brand from tuna-canned alone unmasked a second bug: "מעדן טונה עם אמנון/בקלה/דניס/לברק"
// (tilapia/cod/sea-bream/sea-bass "flavours" of the same cat pate) used to be a silent conflict between
// tuna-canned and the matching WHOLE-FISH concept (two hits -> assignConcept returns null, invisible but
// safe); once tuna-canned stopped matching, the fish concept became the lone hit and the pate started
// resolving to amnon-whole/cod/denis-whole/lavrak-whole. Same brand guard added to all four.
test('tuna-canned, turmeric and the whole-fish concepts reject the "אורבן צ\'ויס" pet-food brand, not individual flavour words', () => {
  const concepts = loadConcepts();
  const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
  const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);
  isNot("אורבן צ'ויס מעדן טונה בג'לי 85 גרם", 'tuna-canned');
  isNot("אורבן צ'ויס מעדן טונה עם דיונון 85 גרם", 'tuna-canned');
  isNot("אורבן צ'ויס מעדן טונה עם דלעת 85 גרם", 'tuna-canned');
  isNot("אורבן צ'ויס מעדן טונה עם וויטבייטס 85 גרם", 'tuna-canned');
  isNot("אורבן צ'ויס מעדן טונה עם לוקוס 85 גרם", 'tuna-canned');
  isNot("אורבן צ'ויס מעדן טונה עם מולית אדומה 85 גרם", 'tuna-canned');
  isNot("אורבן צ'ויס מעדן טונה עם שרימפס 85 גרם", 'tuna-canned');
  isNot("אורבן צ'ויס סקוויז פירות ים וכורכום 100 גרם", 'turmeric');
  assert.equal(assignConcept("אורבן צ'ויס מעדן טונה עם אמנון 85 גרם", concepts), null, 'not amnon-whole either');
  assert.equal(assignConcept("אורבן צ'ויס מעדן טונה עם בקלה 85 גרם", concepts), null, 'not cod either');
  assert.equal(assignConcept("אורבן צ'ויס מעדן טונה עם דניס 85 גרם", concepts), null, 'not denis-whole either');
  assert.equal(assignConcept("אורבן צ'ויס מעדן טונה עם לברק 85 גרם", concepts), null, 'not lavrak-whole either');
  // real human food with the same words still matches.
  is('טונה 960ג במים', 'tuna-canned');
  is('כורכום טחון 100 גרם', 'turmeric');
  is('אמנון שלם טרי 500 גרם', 'amnon-whole');
  is('פילה בקלה טרי', 'cod');
  is('דניס שלם 500 גרם', 'denis-whole');
  is('לברק שלם טרי', 'lavrak-whole');
});

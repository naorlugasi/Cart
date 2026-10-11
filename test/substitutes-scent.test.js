import test from 'node:test';
import assert from 'node:assert/strict';
import { variantSignature, rules } from '../src/pricing/substituteRules.js';

/** Naor, 3.10: for Huggies "בישום עדין" Hatzi Hinam was offered an unscented pack, while its own mild-scent pack
 * was refused - "בניחוח עדין" read as the variant "עדין", "בבישום עדין" and "ללא בישום" as no variant at all. */
test('baby wipes: scented and unscented are the variant, however the chain spells it', () => {
  const v = (n) => variantSignature(n, rules(), 'baby-wipes');
  assert.deepEqual(v('רביעיית מגבון האגיס נטורל קר בישום עדין 56'), ['kind:scented']);
  assert.deepEqual(v('בייביסיטר מארז 4 חבילות מגבונים לחים לתינוק בבישום עדין'), ['kind:scented']);
  assert.deepEqual(v('מגבונים לחים לתינוק בניחוח עדין- מארז רביעיה'), ['kind:scented']);
  assert.deepEqual(v('מגבונים לחים לעור רגיש ללא בישום - מארז רביעיה'), ['kind:unscented']);
  assert.deepEqual(v('מגבוני האגיס שלישייה ללא בישום 56*3'), ['kind:unscented']);
  assert.deepEqual(v('מגבונים לחים פרש וואנס סנסיטיב - רביעייה'), []);
  // other concepts keep the generic reading
  assert.deepEqual(variantSignature('יוגורט בטעם תות', rules(), 'yogurt-fruit'), ['תות']);
});

test('variantSignature: a kind group ADDS kind:<id> to the flavour words instead of replacing them (11.10) - except a variant.groupsOnly concept', () => {
  // oil-olive has kind groups; the flavour words still count next to the kind.
  assert.deepEqual(variantSignature('שמן זית כתית מעולה 750 מל', rules(), 'oil-olive'), ['kind:extra-virgin']);
  assert.deepEqual(variantSignature('שמן זית כתית מעולה בטעם לימון 250 מל', rules(), 'oil-olive'), ['kind:extra-virgin', 'לימונ']);
  assert.deepEqual(variantSignature('שמן זית 750 מל', rules(), 'oil-olive'), [], 'no kind, no flavour');
  // baby-wipes is groupsOnly: its scent words are the whole identity and the generic flavour reading stays off.
  assert.deepEqual(variantSignature('מגבונים לחים אלוורה ללא בישום 64 יח', rules(), 'baby-wipes'), ['kind:unscented']);
});

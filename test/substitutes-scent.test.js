import test from 'node:test';
import assert from 'node:assert/strict';
import { variantSignature, rules } from '../src/pricing/substituteRules.js';

/** Naor, 3.10: for Huggies "בישום עדין" Hatzi Hinam was offered an unscented pack, while its own mild-scent pack
 * was refused - "בניחוח עדין" read as the variant "עדין", "בבישום עדין" and "ללא בישום" as no variant at all. */
test('baby wipes: scented and unscented are the variant, however the chain spells it', () => {
  const v = (n) => variantSignature(n, rules(), 'baby-wipes');
  assert.deepEqual(v('רביעיית מגבון האגיס נטורל קר בישום עדין 56'), ['scented']);
  assert.deepEqual(v('בייביסיטר מארז 4 חבילות מגבונים לחים לתינוק בבישום עדין'), ['scented']);
  assert.deepEqual(v('מגבונים לחים לתינוק בניחוח עדין- מארז רביעיה'), ['scented']);
  assert.deepEqual(v('מגבונים לחים לעור רגיש ללא בישום - מארז רביעיה'), ['unscented']);
  assert.deepEqual(v('מגבוני האגיס שלישייה ללא בישום 56*3'), ['unscented']);
  assert.deepEqual(v('מגבונים לחים פרש וואנס סנסיטיב - רביעייה'), []);
  // other concepts keep the generic reading
  assert.deepEqual(variantSignature('יוגורט בטעם תות', rules(), 'yogurt-fruit'), ['תות']);
});

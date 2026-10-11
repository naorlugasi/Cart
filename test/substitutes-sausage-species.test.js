import test from 'node:test';
import assert from 'node:assert/strict';
import { variantSignature, rules } from '../src/pricing/substituteRules.js';

/** Kind reviewers found sausage-other's species list (config/substitutes/rules.json variant.concepts)
 * lacked עגל (veal), unlike its siblings (meat-filled-pastry, kebab-frozen, pastrami-other) - a veal
 * sausage could have been offered as a substitute for a chicken or beef one. Added in the same style
 * as the existing entries (11.10). */
test('sausage-other: veal (עגל) is its own variant, not folded into another species', () => {
  const v = (n) => variantSignature(n, rules(), 'sausage-other');
  assert.deepEqual(v('נקניקיות עגל אורגניות 400 גרם'), ['עגל']);
  assert.deepEqual(v('נקניקיות בקר 400 גרם'), ['בקר']);
  assert.notDeepEqual(v('נקניקיות עגל אורגניות 400 גרם'), v('נקניקיות בקר 400 גרם'));
});

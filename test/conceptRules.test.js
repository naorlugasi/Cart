import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';

const concepts = loadConcepts();

/**
 * An exclusion that matches the concept's own name (or one of its synonyms) silences the concept
 * entirely: every product it exists to catch is thrown away, silently and with no conflict reported.
 * It happened twice with short unanchored patterns - "רסק" (purée) sits inside "אפרסק" (peach) and
 * "נקטר" (nectar) inside "נקטרינה" (nectarine), so no peach and no nectarine ever got a concept.
 * The fix is an anchored pattern that still allows a single attached Hebrew prefix, e.g.
 * `(?<![א-ת])[בהוכלמש]?רסק` or a negative lookahead, `נקטר(?!ינ)`.
 */
test('no exclusion silences its own concept', () => {
  const broken = [];
  for (const concept of concepts) {
    const own = [concept.name, ...(concept.synonyms ?? [])].map(normalizeText).filter(Boolean);
    (concept.match.none ?? []).forEach((pattern, i) => {
      for (const term of own) {
        if (concept._none[i].test(term)) broken.push(`${concept.id} (${concept.file.split('/').pop()}): none "${pattern}" matches its own "${term}"`);
      }
    });
  }
  assert.deepEqual(broken, [], `exclusions that silence their own concept:\n  ${broken.join('\n  ')}`);
});

/** The same trap in reverse: a concept that can never match anything, because `all` and `none` overlap. */
test('every concept still matches its own name', () => {
  const dead = [];
  for (const concept of concepts) {
    const own = normalizeText(concept.name);
    if (!own) continue;
    const matchesAll = concept._all.every((re) => re.test(own));
    // Only meaningful when the name itself is what the rules describe; a concept named more loosely
    // than its patterns (e.g. "בצל יבש/אדום") is not a defect.
    if (matchesAll && concept._none.some((re) => re.test(own))) dead.push(`${concept.id}: "${concept.name}"`);
  }
  assert.deepEqual(dead, [], `concepts excluded by their own rules:\n  ${dead.join('\n  ')}`);
});

test('patterns never contain a final-form letter, which normalized names never carry', () => {
  const offenders = [];
  for (const concept of concepts) {
    for (const group of ['all', 'any', 'none']) {
      for (const pattern of concept.match[group] ?? []) {
        if (/[ךםןףץ]/.test(pattern)) offenders.push(`${concept.id}.${group}: ${pattern}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('canned fruit packed in syrup is not drinking syrup, and a concentrate is not fresh fruit', () => {
  assert.equal(assignConcept('אפרסקים בסירופ 820 גרם', concepts), null);
  assert.equal(assignConcept('אננס פרוס בסירופ', concepts), null);
  assert.equal(assignConcept('תרכיז תות', concepts), null);
  assert.equal(assignConcept('סירופ פטל 750 מל', concepts), 'flavored-syrup');
  assert.equal(assignConcept('אפרסק טרי', concepts), 'peach');
  assert.equal(assignConcept('נקטרינה צהובה', concepts), 'nectarine');
});

/**
 * A product is not the thing it merely tastes, smells or is filled with. Because a shared conceptId is
 * what makes one product a substitute for another, "וופל במילוי קרם אגוזים" landing in the walnut concept
 * means a wafer offered in place of walnuts. The marker and the words it governs are removed before the
 * positive rules run; exclusions still see the whole name.
 */
test('a flavour, a filling or a scent never makes a product that thing', () => {
  const cases = [
    ['וופל במילוי קרם אגוזים', 'walnuts'],
    ['הפי היפו במילוי אגוזים', 'walnuts'],
    ['אג\'קס נוזל לניקוי בניחוח לימון', 'lemon-fresh'],
    ['פיניש מפיץ ריח למדיח בניחוח לימון', 'lemon-fresh'],
    ['צ\'יטוס בטעם קטשופ', 'ketchup'],
    ['משקה חלב בטעם אייס קפה', 'iced-coffee-drink'],
    ['מסטיק בטעם ענבים', 'grapes'],
    ['יוגורט בטעם אפרסק', 'peach'],
  ];
  for (const [name, forbidden] of cases) {
    assert.notEqual(assignConcept(name, concepts), forbidden, `"${name}" must not be ${forbidden}`);
  }
});

test('the flavour rule does not strip a word that is part of the product itself', () => {
  assert.equal(assignConcept('גבינת קרם שמנת 200 גרם', concepts), 'cream-cheese', 'no marker, nothing stripped');
  assert.equal(assignConcept('אגוזי מלך קלופים 200 גרם', concepts), 'walnuts');
  assert.equal(assignConcept('קטשופ 750 גרם TOMO', concepts), 'ketchup');
  assert.equal(assignConcept('לימון טרי ארוז 10 יח', concepts), 'lemon-fresh');
});

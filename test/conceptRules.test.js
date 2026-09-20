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

test('hasFlavourMarker tells the build which of a barcode\'s names knows more about the product', async () => {
  const { hasFlavourMarker } = await import('../src/catalog/concepts.js');
  assert.equal(hasFlavourMarker('גלילי וופל במילוי קרם בטעם אגוז'), true);
  assert.equal(hasFlavourMarker('אקונומיקה בניחוח לימון'), true);
  assert.equal(hasFlavourMarker('רולים אגוז עלמה 100'), false, 'the truncated name that loses "במילוי"');
  assert.equal(hasFlavourMarker('לימון טרי'), false);
  assert.equal(hasFlavourMarker(''), false);
});

test('other nuts are not walnuts', () => {
  for (const name of ['אגוזי לוז בציפוי שוקולד', 'נוזל אגוז קוקוס AROY-D', 'אגוזי אדמה קלויים', 'אגוזי ברזיל 100 גרם']) {
    assert.notEqual(assignConcept(name, concepts), 'walnuts', name);
  }
  assert.equal(assignConcept('אגוזי מלך קלופים 200 גרם', concepts), 'walnuts');
  assert.equal(assignConcept('אגוז מלך 150גר ששון', concepts), 'walnuts');
});

test('a filling written without the preposition counts too, unless the cream is the product', async () => {
  const { hasFlavourMarker } = await import('../src/catalog/concepts.js');
  // "טעמי X קרם אגוזים" is a filling just like "במילוי קרם אגוזים"; most chains write it without the preposition.
  assert.notEqual(assignConcept('טעמי אקס קרם אגוזים 100', concepts), 'walnuts');
  assert.notEqual(assignConcept('וופל קרם אגוזים', concepts), 'walnuts');
  assert.equal(hasFlavourMarker('טעמי אקס קרם אגוזים'), true, 'so the build prefers this name over a truncated one');
  // ...but not where the cream IS the product.
  assert.equal(assignConcept('גבינת קרם שמנת 200 גרם', concepts), 'cream-cheese');
  assert.equal(assignConcept('קרם קרקר', concepts), 'crackers', 'a name opening with קרם keeps everything');
});

test('a concept whose identity IS the flavour reads the whole name', () => {
  // The general rule strips "בטעם X"; for these concepts that phrase is the product, not a decoration.
  assert.equal(assignConcept('נביעות+ מים מינרליים בטעם תפוח 1.5 ליטר', concepts), 'water-flavored');
  assert.equal(assignConcept('מולר פרופ מוקצף בטעם אפרסק', concepts), 'yogurt-fruit');
  assert.equal(assignConcept('משקה מוגז בטעם ענבים', concepts), 'soda-fruit-flavored');
  assert.equal(assignConcept('פיוז טי בטעם מנגו אננס', concepts), 'iced-tea');
  // ...and the products those flavours merely decorate still get nothing.
  for (const name of ['סוכריות על מקל בטעם קולה', 'נטורינה בטעם חמאה', 'יטבתה משקה חלב בטעם בננה']) {
    assert.notEqual(assignConcept(name, concepts), 'cola', name);
    assert.notEqual(assignConcept(name, concepts), 'butter', name);
    assert.notEqual(assignConcept(name, concepts), 'banana', name);
  }
});

test('the drinks the review found had no concept at all now have one', () => {
  assert.equal(assignConcept('נורדיק מיסט מוגז בטעם אננס נענע 1 ליטר', concepts), 'soda-fruit-flavored');
  assert.equal(assignConcept('משקה אלוורה בטעם אפרסק', concepts), 'aloe-drink');
  assert.equal(assignConcept('נסטי אפרסק 500 מל', concepts), 'iced-tea');
  assert.equal(assignConcept('קמיל בלו סנסטיב שמפו לתינוק', concepts), 'shampoo', '"נסטי" must not match inside "סנסטיב"');
});

test('infant formula never crosses a stage: a stage-1 tin is not a substitute for a stage-3 one', () => {
  // Substitutes offer the cheapest product sharing a conceptId, so stage has to be part of the concept.
  assert.equal(assignConcept('מטרנה מהדרין שלב 1 700 גרם', concepts), 'baby-formula-stage-1');
  assert.equal(assignConcept('נוטרילון שלב 2 800 גרם', concepts), 'baby-formula-stage-2');
  assert.equal(assignConcept('סימילאק גולד שלב 3 700', concepts), 'baby-formula-stage-3');
  assert.equal(assignConcept('מטרנה קומפורט 700 גר', concepts), 'baby-formula', 'no stage stated: the generic concept');
  // Porridge and puree are not formula, whatever brand is on the tin.
  assert.notEqual(assignConcept('מטרנה דייסת אורז 200 גרם', concepts), 'baby-formula');
  assert.equal(assignConcept('מטרנה מחית תפוח פאוץ', concepts), 'baby-food-puree');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';

/** Snacks round 3.11.2026 (Opus decisions: concept-health report + shelf leftovers). Each case is a chain
 * name (as the chain prints it, without the manufacturer strip the build adds) and the concept it must land
 * on; `not` = it must NOT land on that concept. Names only - the build's vote over a barcode's names is
 * measured separately. */
const CASES = [
  // A1 rule fixes
  { name: 'גלידת שמנת משובחת CANNOLI CRUNCH קרמל בגליל וופל 60ג', concept: null },
  { name: 'מאגדת מיני קראנץ שוקו עוגיות 5 יח', not: 'cookies' },
  { name: 'שוקולד בלונדי עם שברי עוגיות', not: 'cookies' },
  { name: 'גלילי ופל בק. אגוזי לוז', not: 'hazelnuts' },
  { name: 'מאפה עלים מילוי אגוזי לוז', not: 'hazelnuts' },
  { name: 'חטיף טעמי X חמאת בוטנים סוכריות קופצות', not: 'candy-hard' },
  { name: 'קרם האמבט עם אקונומיקה 500 מ"ל יעקבי', not: 'bleach' },
  { name: 'סולייל קריסטל א.ד.פ100מל', not: 'flavored-syrup' },
  { name: 'בושם א.ד.פ 100 מל', not: 'flavored-syrup' },
  { name: "קריסטל אננס 2ל' מוגז", concept: 'soda-fruit-flavored' },
  { name: 'משקה קריסטל למון ליים מוגז 2 ל', concept: 'soda-lemon-lime' },
  { name: 'קריסטל גזוז בטעם קולה', not: 'flavored-syrup' },
  { name: 'אשכול בננה', concept: 'banana' },
  { name: 'בננות', concept: 'banana' },
  { name: 'פוסט בננה נאט קראנץ', not: 'banana' },
  { name: 'קליפס בננה שטוח', not: 'banana' },
  { name: 'לפתניות שקופות 36', concept: 'disposable-bowls' },
  { name: 'קרם לפתניה (20יח\') בסט וליו', concept: 'disposable-bowls' },
  { name: 'עוגת טורט ריבת חלב קפולסקי', not: 'jam' },
  { name: 'מחטא בגדים דטול 1.5 ליטר', not: 'disinfectant-spray' },
  { name: 'קטשופ כריות 100 יח', not: 'ketchup' },
  { name: 'מגנום חמאה חומה גלידה', not: 'butter' },
  { name: 'מסקרפונה עם קרמל מלוח 1.2', not: 'mascarpone-cheese' },
  { name: 'גלידת טילון אקסטרים מאגדת', not: 'milk-jam' },
  { name: 'קרם זיתים שחורים מסיאלו', not: 'olives' },
  { name: 'אבקת לימונדה זיפ 100 גרם', not: 'soda-lemonade' },
  { name: 'אבקת לימונדה זיפ 100 גרם', not: 'flavored-syrup' },
  { name: 'קרם ניקוי עם אקונומיקה לאמבט אסטוניש', not: 'bleach' },
  { name: 'תה שחור א.ד.פ', not: 'tea-black' },
  // B1 new leaves
  { name: 'וופל אפיפית שוקו 200ג עלית', concept: 'wafers-afifit' },
  { name: 'אפיפית בטעם טורטית 200גר כשל"פ', concept: 'wafers-afifit' },
  { name: 'קוביות אפיפית ללא גלוטן 200 גר קוביס', concept: 'wafers-cubes' },
  { name: 'סוכריות מנטה עטוף במשקל', concept: 'candy-mints' },
  { name: 'קלפני סוכריות קשות בטעם מנטה מרענן בפחית', concept: 'candy-mints' },
  { name: 'טיק טק בטעם מנטה חזק 16 גרם', not: 'candy-mints' },
  { name: 'סוכריות מנטוס מנטה ללא סוכר', not: 'candy-mints' },
  // B2 rule gaps
  { name: 'סוכריות במילוי בטעם קפה עם חלב רושן COFFEE LIKE', concept: 'candy-filled' },
  { name: 'ראפי שוקולד כריות וופל מגולגלות במילוי קרם', concept: 'wafers-rolls' },
  { name: 'סוכריות צבעוניות לעוגה 100 גרם', concept: 'candy-decoration-sprinkles' },
  { name: 'ביסקויט מתוק גן חיות', concept: 'biscuit-animal-shaped' },
  { name: 'ביסקויט קרמל לוטוס', concept: 'biscuit-caramel' },
  { name: 'ממרח לוטוס ביסקויט קרמל', concept: 'biscuit-spread' },
  { name: 'פרה שוקולד לבן עוגיות', not: 'cookies' },
  { name: 'שוקולד פרה לבן עם עוגיות', concept: 'chocolate-bar-white' },
  { name: 'שוקולד פרה חלב עם עוגיות', concept: 'chocolate-bar-milk' },
];

const concepts = loadConcepts();
test('snacks round 3.11: every case lands as decided', () => {
  const failures = [];
  for (const c of CASES) {
    const got = assignConcept(c.name, concepts);
    if ('concept' in c ? got !== c.concept : got === c.not) failures.push(`${c.name}: ${'concept' in c ? `expected ${c.concept}` : `must not be ${c.not}`}, got ${got}`);
  }
  assert.deepEqual(failures, []);
});

test('א.ד.פ perfume: the dotted form normalizes to spaced letters and the none pattern hits', () => {
  assert.match(normalizeText('בושם א.ד.פ 100 מל'), /(^| )א ?ד ?פ(?![א-ת])/);
});

test('A5: no concept pattern still carries a dot-optional that normalizeText can never match', () => {
  const dir = new URL('../config/concepts/', import.meta.url);
  const bad = [];
  for (const id of ['flavored-syrup', 'tea-black', 'tea-green', 'tea-herbal']) {
    const c = concepts.find((x) => x.id === id);
    if (c.match.none.some((p) => p === 'א\\.?ד\\.?פ')) bad.push(id);
  }
  assert.deepEqual(bad, []);
  assert.ok(dir);
});

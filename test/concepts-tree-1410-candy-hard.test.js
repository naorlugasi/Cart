import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/** Shelf-to-tree round 14.10.2026, shelf "candy-hard" (Sonnet built, Opus reviewed, Naor: "תפצל את המדפים").
 * Each case is a chain name and the concept it must land on after the split; null = no concept. */
const CASES = [
  {
    "name": "טיק טק בטעם מנטה חזק 16 גרם",
    "concept": "candy-tic-tac"
  },
  {
    "name": "מארז סוכריות טיק טק Tic tac בטעם תפוז",
    "concept": "candy-tic-tac"
  },
  {
    "name": "סוכריות טיק טק הטעם הסודי 16 גרם",
    "concept": "candy-tic-tac"
  },
  {
    "name": "סוכריות טיק טק מנדרינה ולימון ליים 16 גר",
    "concept": "candy-tic-tac"
  },
  {
    "name": "מארז סוכריות מנטוס Mentos תות",
    "concept": "candy-mentos"
  },
  {
    "name": "מנטוס בקבוק עגול בטעם מנטה 60 גרם",
    "concept": "gum"
  },
  {
    "name": "סוכריות לעיסה מנטוס מנטה רביעיה 150 גרם",
    "concept": "candy-mentos"
  },
  {
    "name": "מארז סוכריות מנטוס בטעם פאנטה תפוז",
    "concept": "candy-mentos"
  },
  {
    "name": "בקבוק סוכריות סקיטלס בטעם פירות",
    "concept": "candy-skittles"
  },
  {
    "name": "סוכריות סקיטלס חמוצים 152 גר",
    "concept": "candy-skittles"
  },
  {
    "name": "סקיטלס ענק סוכריות לעיסות בטעם פירות חמוצים",
    "concept": "candy-skittles"
  },
  {
    "name": "יוגטה סוכריות לעיסה טעם פירות 100 גר",
    "concept": "candy-chewy-fruit"
  },
  {
    "name": "סוכריות לעיסה דאמיס בטעמי פירות",
    "concept": "candy-chewy-fruit"
  },
  {
    "name": "סוכריות ממבה ביץ בייטס 160 גר",
    "concept": "candy-chewy-fruit"
  },
  {
    "name": "סוכריות לעיסה במגוון טעמים",
    "concept": "candy-chewy-fruit"
  },
  {
    "name": "100 סוכריות ריקולה בפחית",
    "concept": "candy-herbal-throat"
  },
  {
    "name": "וויקס סוכריות עם דובדבן ואוקליפ ללא סוכר",
    "concept": "candy-herbal-throat"
  },
  {
    "name": "סוכריות ריקולה צמחים",
    "concept": "candy-herbal-throat"
  },
  {
    "name": "סוכריות לימון מנטה ריקולה 50 גרם",
    "concept": "candy-herbal-throat"
  },
  {
    "name": "סוכריות חמאה מאסט ללא סוכר בטעם קרמל - חלבי",
    "concept": "candy-butterscotch"
  },
  {
    "name": "סוכריות מאסט ללס ריבת חלב",
    "concept": "candy-butterscotch"
  },
  {
    "name": "סוכריות וורטר ללא סוכר קפה 80 גרם",
    "concept": "candy-butterscotch"
  },
  {
    "name": "מאסט סוכריות חמאה לל",
    "concept": "candy-butterscotch"
  },
  {
    "name": "סוכריות מאסט ממולאות ללא סוכר בטעם לימון",
    "concept": "candy-filled"
  },
  {
    "name": "סוכריות במילוי בטעם קפה עם חלב רושן COFFEE LIKE",
    "concept": "candy-hard"
  },
  {
    "name": "סאוור מדנס סוכריות חמוצות",
    "concept": "candy-sour"
  },
  {
    "name": "סוכריות חמוצות בטיוב",
    "concept": "candy-sour"
  },
  {
    "name": "fire סאוור מדנס סוכריות חמוצות 60 גר",
    "concept": "candy-sour"
  },
  {
    "name": "סוכריות קופצות בטעם",
    "concept": "candy-popping"
  },
  {
    "name": "סוכריות קופצות פשקס",
    "concept": "candy-popping"
  },
  {
    "name": "סוכריות פאזל סביבון",
    "concept": "candy-hard"
  },
  {
    "name": "סוכריות מנטה עטוף במשקל",
    "concept": "candy-hard"
  },
  {
    "name": "סוכריות בצורת מקלות דקים בטעמי פירות",
    "concept": "candy-hard"
  },
  {
    "name": "קלפני סוכריות קשות בטעם מנטה מרענן בפחית",
    "concept": "candy-hard"
  },
  {
    "name": "סוכריות ללא תוספת סוכר בטעם תות מיה 80 גרם",
    "concept": "candy-hard"
  },
  {
    "name": "פרוטלה טופי בטעם תות 135 גרם",
    "concept": "candy-toffee"
  },
  {
    "name": "יוגטה מקלות מבריקים ממולאים פירות 190 גרם",
    "concept": "candy-stick"
  },
  {
    "name": "יוגטה מקלות חמוצים 80גר12X",
    "concept": "candy-sour-sticks"
  },
  {
    "name": "מנטוס קלין ברט מנטה עדינה 90 גרם",
    "concept": "candy-mentos"
  },
  {
    "name": "סוכריות מנטוס בגליל תות",
    "concept": "candy-mentos"
  },
  {
    "name": "מנטוס בקבוק עגול בטעם אבטיח 60 גרם",
    "concept": "gum"
  },
  {
    "name": "מנטוס פיור וויט 90ג 6יח ספרמינט",
    "concept": "gum"
  },
  {
    "name": "מנטוס בבלפרש6X בק' מעוגל",
    "concept": "gum"
  },
  {
    "name": "סוכריות רושן במילוי",
    "concept": "candy-filled"
  },
  {
    "name": "פרוטלה סוכריות פירות",
    "concept": "candy-chewy-fruit"
  },
  {
    "name": "סוכריות מייק ואייק מגה מיקס 120ג",
    "concept": "candy-chewy-fruit"
  },
  {
    "name": "סוכריות פז למילוי",
    "concept": "candy-pez"
  },
  {
    "name": "פז סוכריות בובה+ 3 סוכריות",
    "concept": "candy-pez"
  },
  {
    "name": "סוכריות מילוי PEZ",
    "concept": "candy-pez"
  },
  {
    "name": "סוכריות צמיד 48 יחידות",
    "concept": "candy-bracelet"
  },
  {
    "name": "סוכריות שעון 30 יחידות",
    "concept": "candy-bracelet"
  },
  {
    "name": "סוכריות שעון עם לב סודה 10 גרם 24 יח",
    "concept": "candy-bracelet"
  },
  {
    "name": "סוכריות וורטר שוקולד",
    "concept": "candy-butterscotch"
  },
  {
    "name": "סוכריות סודה בצורת לגו",
    "concept": "candy-hard"
  },
  {
    "name": "סוכריות ריקולה צמחים דיאט פטל חמוציות",
    "concept": "candy-herbal-throat"
  },
  {
    "name": "סוכריות קורובקה 500 גרם",
    "concept": "candy-hard"
  },
  {
    "name": "סוכריות חמאה וורטר אורגינל גליל בודד 50",
    "concept": "candy-butterscotch"
  }
];

const concepts = loadConcepts();
test('shelf candy-hard: every chain name lands on its leaf', () => {
  const failures = [];
  for (const { name, concept } of CASES) {
    const got = assignConcept(name, concepts);
    if (got !== concept) failures.push(`${name}: expected ${concept}, got ${got}`);
  }
  assert.deepEqual(failures, []);
});

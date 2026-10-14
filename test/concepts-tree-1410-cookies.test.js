import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/** Shelf-to-tree round 14.10.2026, shelf "cookies" (Sonnet built, Opus reviewed, Naor: "תפצל את המדפים").
 * Each case is a chain name and the concept it must land on after the split; null = no concept. */
const CASES = [
  {
    "name": "עוגיות חמאה",
    "concept": "cookies-butter"
  },
  {
    "name": "עוגיות בטעם חמאה 500 גרם",
    "concept": "cookies-butter"
  },
  {
    "name": "ווקרס עוגיות חמאה פינגרס 150 גרם",
    "concept": "cookies-butter"
  },
  {
    "name": "עוגיות דניות 450ג  פרווה אדל",
    "concept": "cookies-butter"
  },
  {
    "name": "עוגיות חיטה מלאה בטעם חמאה ללא תוספת סוכר",
    "concept": "cookies-whole-wheat"
  },
  {
    "name": "פיטנס עוגיות שוקולד מריר 180 גרם",
    "concept": "cookies-chocolate"
  },
  {
    "name": "זהבה ושלושת הדובים עוגיות בטעם שוקולד",
    "concept": "cookies-chocolate"
  },
  {
    "name": "מרבה עוגיות קוואדרוטי קקאו 200 גרם",
    "concept": "cookies-chocolate"
  },
  {
    "name": "עוגיות כעכים קקאו 500גר רמילוי",
    "concept": "cookies-chocolate"
  },
  {
    "name": "גודיס עוגיות מצופות שוקולד חלב",
    "concept": "cookies-chocolate-coated"
  },
  {
    "name": "עוגיות פיליפינוס שוקולד חלב 120 גרם",
    "concept": "cookies-chocolate-coated"
  },
  {
    "name": "עוגיות עד חצות אצבעות",
    "concept": "cookies-chocolate-coated"
  },
  {
    "name": "דה פרוטאין דיל עוגיות בציפוי שוקולד חלב",
    "concept": "cookies-chocolate-coated"
  },
  {
    "name": "עוגיות גרנולה 450 גרם",
    "concept": "cookies-granola"
  },
  {
    "name": "עוגיות גרנולה קינמון ללא תוספת סוכר",
    "concept": "cookies-granola"
  },
  {
    "name": "עוגיות עם גרנולה ושוקולד 168 גר מילקה",
    "concept": "cookies-granola"
  },
  {
    "name": "עוגיות חיטה מלאה 300ג",
    "concept": "cookies-whole-wheat"
  },
  {
    "name": "אסם עוגיות הפסקת קפה",
    "concept": "cookies-whole-wheat"
  },
  {
    "name": "גולון - עוגיות ח.מלאה דיאגסטיב 425 גר",
    "concept": "cookies-whole-wheat"
  },
  {
    "name": "עוגיות כוסמין קוקוס",
    "concept": "cookies-spelt"
  },
  {
    "name": "עוגיות כוסמין בניחוח שטרודל תפוחים 230 ג",
    "concept": "cookies-spelt"
  },
  {
    "name": "גנדולה עוגיות כוסמין שקדים אורגני 250",
    "concept": "cookies-spelt"
  },
  {
    "name": "עוגיות לקפה",
    "concept": "cookies-coffee"
  },
  {
    "name": "עוגיות לקפה 350 גר רמי לוי",
    "concept": "cookies-coffee"
  },
  {
    "name": "עוגיות לקפה 200 גרם ברמן",
    "concept": "cookies-coffee"
  },
  {
    "name": "עוגיות 360 גרם CHOCO-PIE",
    "concept": "cookies-choco-pie"
  },
  {
    "name": "עוגיות שוקו פאי תות",
    "concept": "cookies-choco-pie"
  },
  {
    "name": "עוגיות 360 גר ORION* CHOCO-PIE CHERRY",
    "concept": "cookies-choco-pie"
  },
  {
    "name": "עוגיות כתר ריבה",
    "concept": "cookies-jam"
  },
  {
    "name": "עוגיות נסיכה מיקס 500 גר",
    "concept": "cookies-jam"
  },
  {
    "name": "עוגיות משקפיים 250גרם",
    "concept": "cookies-jam"
  },
  {
    "name": "עוגיות פרח+ריבת תות200ג",
    "concept": "cookies-jam"
  },
  {
    "name": "עוגיות חמאה ריבת תות",
    "concept": "cookies-jam"
  },
  {
    "name": "עוגיות מגולגלות תמרים 500ג דל",
    "concept": "cookies-date-filled"
  },
  {
    "name": "עוגיות רולדת תמרים 400 ג",
    "concept": "cookies-date-filled"
  },
  {
    "name": "עוגיות עינוגי תמרים רמי לוי 500 גרם",
    "concept": "cookies-date-filled"
  },
  {
    "name": "עוגיות חיוכים וניל עלית 150 גרם בד\"צ",
    "concept": "cookies-sandwich-filled"
  },
  {
    "name": "עוגיות בלזן היט קקאו 220 גרם",
    "concept": "cookies-sandwich-filled"
  },
  {
    "name": "עוגיות עם מילוי תות שדה 168 גר LOVITA",
    "concept": "cookies-sandwich-filled"
  },
  {
    "name": "עוגיות אלפאחורס 280",
    "concept": "cookies-sandwich-filled"
  },
  {
    "name": "עוגיות מיני שוקוצ'יפ",
    "concept": "cookies-chocolate-chip"
  },
  {
    "name": "עוגיות שוקולד עם חתיכות שוקולד 150 גר",
    "concept": "cookies-chocolate-chip"
  },
  {
    "name": "עוגיות רושן \"LOVITA\" קקאו עם נטיפי קקאו 152 גרם",
    "concept": "cookies-chocolate-chip"
  },
  {
    "name": "עוגיות ריפאת 500 גרם",
    "concept": "cookies-moroccan"
  },
  {
    "name": "עוגיות ריפ'את 350 גרם",
    "concept": "cookies-moroccan"
  },
  {
    "name": "עוגיות מציות אניס אר",
    "concept": "cookies-moroccan"
  },
  {
    "name": "1.2 מסקרפונה עם עוגיות  ונטיפי שוקולד חלב",
    "concept": "cookies"
  },
  {
    "name": "עוגיות פרפריות 450ג דל",
    "concept": "cookies"
  },
  {
    "name": "עוגיות קיפל וניל 500ג דל",
    "concept": "cookies"
  },
  {
    "name": "עוגיות לה סיאסטה קוקוס 240 גר YARYCH",
    "concept": "cookies"
  },
  {
    "name": "עוגיות פטל 420 גר LOVITA",
    "concept": "cookies"
  },
  {
    "name": "עוגיות חלבון שוקולד 180 גרם",
    "concept": "cookies"
  },
  {
    "name": "שוקולד פרה לבן עם עוגיות 100 גרם",
    "concept": "cookies"
  },
  {
    "name": "עוגיות טעם חלבה 500ג פרווה אדל",
    "concept": "cookies"
  },
  {
    "name": "פרוטאין מקס 62 גר' בטעם עוגיות שוקולד",
    "concept": null
  },
  {
    "name": "סו מאצ' שוקולד חלב קרם וניל ועוגיות 150 גר עלית",
    "concept": null
  },
  {
    "name": "שוקולד חלב עם מילוי קרם חלב, פתיתי קורנפלקס ופירורי עוגיות",
    "concept": null
  }
];

const concepts = loadConcepts();
test('shelf cookies: every chain name lands on its leaf', () => {
  const failures = [];
  for (const { name, concept } of CASES) {
    const got = assignConcept(name, concepts);
    if (got !== concept) failures.push(`${name}: expected ${concept}, got ${got}`);
  }
  assert.deepEqual(failures, []);
});

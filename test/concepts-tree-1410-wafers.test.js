import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/** Shelf-to-tree round 14.10.2026, shelf "wafers" (Sonnet built, Opus reviewed, Naor: "תפצל את המדפים").
 * Each case is a chain name and the concept it must land on after the split; null = no concept. */
const CASES = [
  {
    "name": "קוביות וופל קואדרטיני Quadratini שוקולד",
    "concept": "wafers-cubes"
  },
  {
    "name": "וופל קוביות אגוזים 250 גר אלדי",
    "concept": "wafers-cubes"
  },
  {
    "name": "קוביות אפיפית ללא גלוטן 200 גר קוביס",
    "concept": "wafers-cubes"
  },
  {
    "name": "וופל קוודרטיני אגוז",
    "concept": "wafers-cubes"
  },
  {
    "name": "קוביות וופל סנדוויץ Sandwich עם שוקולד",
    "concept": "wafers-cubes"
  },
  {
    "name": "גלילי וופל במילוי קרם אגוזי לוז וקקאו",
    "concept": "wafers-rolls"
  },
  {
    "name": "גליליות וופל בטעם שוקולד",
    "concept": "wafers-rolls"
  },
  {
    "name": "וופל רול טעם אגוז 100ג רמילוי",
    "concept": "wafers-rolls"
  },
  {
    "name": "גלילי וופל עם קרם וניל בציפוי שוקולד חלב אמיצילי",
    "concept": "wafers-rolls"
  },
  {
    "name": "מימונס ג'וני גלילית וופל למילוי 18 יחידות",
    "concept": "wafers-rolls"
  },
  {
    "name": "וופל טורטינה Tortina אישי",
    "concept": "wafers-tortina"
  },
  {
    "name": "לואקר טורטינה שוקולד לבן",
    "concept": "wafers-tortina"
  },
  {
    "name": "מארז וופל שוקולד טורטינה Tortina שוקולד מריר",
    "concept": "wafers-tortina"
  },
  {
    "name": "לואקר טורינה שוקולד חלב 189 גרם",
    "concept": "wafers-tortina"
  },
  {
    "name": "אסם קרמוגית מיניס קרמל מלוח",
    "concept": "wafers-kremugit"
  },
  {
    "name": "עוגיות קרמוגית במילוי קרם שוקולד אסם 200 גרם",
    "concept": "wafers-kremugit"
  },
  {
    "name": "קרמוגית מיניס קרם בייגלה אסם 200 גרם",
    "concept": "wafers-kremugit"
  },
  {
    "name": "עוגיות קרמוגית קראנץ' קקאו -קרם בטעם וניל ושברי עוגיות",
    "concept": "wafers-kremugit"
  },
  {
    "name": "וופל גרדנה Gardena שוקולד",
    "concept": "wafers-chocolate-coated"
  },
  {
    "name": "אצבעות וופל גרדנה Gardena שוקולד לבן",
    "concept": "wafers-chocolate-coated"
  },
  {
    "name": "טורטית חטיף וופל מצופה",
    "concept": "wafers-chocolate-coated"
  },
  {
    "name": "וופל במילוי קרם קקאו בציפוי שוקולד חלב",
    "concept": "wafers-chocolate-coated"
  },
  {
    "name": "מארז וופלים מצופים שוקולד 20 גר*40",
    "concept": "wafers-chocolate-coated"
  },
  {
    "name": "אצבעות וופל רבע לשבע  160 גר",
    "concept": "wafers-chocolate-coated"
  },
  {
    "name": "וופל במילוי קרם אגוזי לוז",
    "concept": "wafers"
  },
  {
    "name": "וופל ממולא בטעם חלב מרוכז 272 ג",
    "concept": "wafers"
  },
  {
    "name": "וופל אפיפית שוקו 200ג עלית",
    "concept": "wafers"
  },
  {
    "name": "אפיפית בטעם טורטית 200גר כשל\"פ",
    "concept": "wafers"
  },
  {
    "name": "וופל בלגי בטעם לימון 200 גר טוסו",
    "concept": "wafers"
  },
  {
    "name": "וופל בלגי קלאסי 220 גרם וילי פוד",
    "concept": "wafers"
  },
  {
    "name": "שוקולד חלב רבע לשבע במילוי קרם אגוזי לוז ושברי גלילי וופל",
    "concept": "wafers"
  },
  {
    "name": "גלידת שמנת משובחת CANNOLI CRUNCH קרמל בגליל וופל 60ג",
    "concept": "wafers"
  },
  {
    "name": "עוגת וופל מצופה מישקה 220 גרם",
    "concept": "wafers"
  },
  {
    "name": "ופל בטעם וניל ללא תוספת סוכר גולון 180 גרם",
    "concept": null
  },
  {
    "name": "בונבוניירה המיטב של לואקר 176 גרם",
    "concept": "chocolate-gift-box"
  },
  {
    "name": "חטיפי לואקר חלב ודגנים רביעיות 100 גרם",
    "concept": "cereal-bar"
  },
  {
    "name": "מילקי אצבעות שוקולד חלב במילוי וופל קקאו וקרם בטעם וניל",
    "concept": "milky-pudding"
  },
  {
    "name": "גביעי וופל לגלידה 12 יח",
    "concept": "wafers-cone"
  }
];

const concepts = loadConcepts();
test('shelf wafers: every chain name lands on its leaf', () => {
  const failures = [];
  for (const { name, concept } of CASES) {
    const got = assignConcept(name, concepts);
    if (got !== concept) failures.push(`${name}: expected ${concept}, got ${got}`);
  }
  assert.deepEqual(failures, []);
});

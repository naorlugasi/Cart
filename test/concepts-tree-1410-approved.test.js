import test from "node:test";
import assert from "node:assert/strict";
import { loadConcepts, assignConcept } from "../src/catalog/concepts.js";

/** Naor 14.10 evening, approving the Opus review recommendations: a frozen Belgian waffle is a bakery leaf, not a snack
 * wafer (a Tusso 200 g "וופל בלגי" snack stays on wafers); KitKat is its own leaf keyed on the brand name alone (14 names in the corpus, 10 of them cereal; the bar is barely sold here) (Kinder Bueno
 * already lives in chocolate-filled-snack); animal-shaped biscuits accept names written "עוגיות". */
const CASES = [
  {
    "name": "וופל בלגי קפוא 280 גרם",
    "concept": "waffle-belgian-frozen"
  },
  {
    "name": "וופל בלגי קלאסי מוקפא 220 גר",
    "concept": "waffle-belgian-frozen"
  },
  {
    "name": "וופל טוסט בלגי 6 יח 250 גרם בקרסלנד",
    "concept": "waffle-belgian-frozen"
  },
  {
    "name": "וופל בלגי אפוי מסוכר275ג",
    "concept": "waffle-belgian-frozen"
  },
  {
    "name": "וופל בלגי  ב.קראנצ 2",
    "concept": "waffle-belgian-frozen"
  },
  {
    "name": "וופל בלגי בטעם אגוז טוסו 200 גר",
    "concept": "wafers"
  },
  {
    "name": "וופל בלגי שוקולד 200 גרם",
    "concept": "wafers"
  },
  {
    "name": "וופל בסגנון בלגי בטעם לימון",
    "concept": "wafers"
  },
  {
    "name": "וופל בלגי ללא גלוטן",
    "concept": "wafers"
  },
  {
    "name": "קיט קט אצבעות רביעייה 41.5 ג חטיף וופל עם שוקולד נסטלה",
    "concept": "wafers-kitkat"
  },
  {
    "name": "וופל קיטקט מצופה שוקולד חלב 125 גר",
    "concept": "wafers-kitkat"
  },
  {
    "name": "אצבעות וופל קיט קט ציפוי שוקולד לבן",
    "concept": "wafers-kitkat"
  },
  {
    "name": "חטיף קיט קט צאנקי פאנקי",
    "concept": "wafers-kitkat"
  },
  {
    "name": "קינדר בואנו 2 יחידות",
    "concept": "chocolate-filled-snack"
  },
  {
    "name": "וופל מיני קנופרס 200 גרם",
    "concept": "wafers-chocolate-coated"
  },
  {
    "name": "וופל גרדנה שוקולד 200 גרם",
    "concept": "wafers-chocolate-coated"
  },
  {
    "name": "רבע לשבע טורטית 120 גרם",
    "concept": "chocolate-filled-snack"
  },
  {
    "name": "טורטית לבנה 40 גרם",
    "concept": null
  },
  {
    "name": "עוגיות גן חיות",
    "concept": "biscuit-animal-shaped"
  },
  {
    "name": "ביסקוויט בצורת חיות",
    "concept": "biscuit-animal-shaped"
  },
  {
    "name": "עוגיות קרנבל אותיות 250 גרם",
    "concept": "biscuit-animal-shaped"
  },
  {
    "name": "עוגיות חיות שוקו 250 גרם",
    "concept": "biscuit-animal-shaped"
  },
  {
    "name": "המיניונים עוגיות בצורת גן חיות 250 גר",
    "concept": "biscuit-animal-shaped"
  },
  {
    "name": "עוגיות שוקולד צ'יפס",
    "concept": "cookies-chocolate-chip"
  },
  {
    "name": "עוגיות מזרחיות עם זעתר 400 גרם",
    "concept": "cookies-savory"
  },
  {
    "name": "עוגיות חמאה",
    "concept": "cookies-butter"
  }
];
const concepts = loadConcepts();
test("approved 14.10 decisions: every chain name lands where Naor decided", () => {
  const failures = [];
  for (const { name, concept } of CASES) { const got = assignConcept(name, concepts); if (got !== concept) failures.push(name + ": expected " + concept + ", got " + got); }
  assert.deepEqual(failures, []);
});

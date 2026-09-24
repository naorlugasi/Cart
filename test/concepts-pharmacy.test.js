import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
import { categorize } from '../src/catalog/categorize.js';

const concepts = loadConcepts();

/**
 * פארם ותוספים round (config/concepts/pharmacy.json): the smallest department, 274 products and zero
 * concepts before this round. Two cases per concept - a real capture from the raw names, and a near-miss
 * that must be rejected. The near-miss for every single-nutrient concept (C/D/B12/E/magnesium/zinc) is a
 * real cosmetic, haircare or food product that also carries the nutrient's name as a marketing ingredient
 * claim ("מועשר בויטמין...", a shampoo, a serum, a dairy drink) - that is the actual failure mode measured
 * in this round (concept-round.mjs --diff), not a hypothetical.
 */

test('vitamin-c: capsules capture, a vitamin-C serum/shampoo/candy does not', () => {
  assert.equal(assignConcept('ויטמין C 500 100 כמוסות', concepts), 'vitamin-c');
  assert.equal(assignConcept('ויטמין סי ברא 60 כמוסות', concepts), 'vitamin-c');
  assert.notEqual(assignConcept('סרום ויטמין סי לילה 30מל', concepts), 'vitamin-c');
  assert.notEqual(assignConcept('שמפו ויטמין C וקרטין לשיער פגום ומפוצל', concepts), 'vitamin-c');
  assert.notEqual(assignConcept('סוכריות תפוז עם ויטמין סי', concepts), 'vitamin-c');
});

test('vitamin-d: capsules/drops capture, a dairy drink "fortified with vitamin D" does not', () => {
  assert.equal(assignConcept('ויטמין D 1000 100 כמוסות', concepts), 'vitamin-d');
  assert.equal(assignConcept('ויטמין די 400 טיפות לילדים', concepts), 'vitamin-d');
  assert.notEqual(assignConcept('קרטון חלב 3% מועשר ויטמין די 1ליטר', concepts), 'vitamin-d');
  assert.notEqual(assignConcept('שמיניית אקטימל ויטמין די בטעם פטל 864 גר', concepts), 'vitamin-d');
});

test('vitamin-b12: methylcobalamin capsules capture, thiamine (B1) does not', () => {
  assert.equal(assignConcept('ויטמין B12 מתיל קובלאמין', concepts), 'vitamin-b12');
  assert.equal(assignConcept('ויטמין B-12 פלוס (120) אלטמן כשר', concepts), 'vitamin-b12');
  assert.notEqual(assignConcept('ויטמין B-1 סולגאר100טב', concepts), 'vitamin-b12');
});

test('vitamin-e: softgel capsules capture, a hair mask/deodorant with vitamin E does not', () => {
  assert.equal(assignConcept('ויטמין E400 סופטגל 90 כמוסות', concepts), 'vitamin-e');
  assert.equal(assignConcept('ויטמין E טוקופרולים100כמ', concepts), 'vitamin-e');
  assert.notEqual(assignConcept('מסכת קרטין + ויטמין E', concepts), 'vitamin-e');
  assert.notEqual(assignConcept('דאודורנט סטיק דרמה מכיל ויטמין E', concepts), 'vitamin-e');
});

test('vitamin-multi: a multivitamin tablet captures, a "multivitamin" flavoured juice does not', () => {
  assert.equal(assignConcept('מולטי ויטמין לנשים 60 טבליות', concepts), 'vitamin-multi');
  assert.equal(assignConcept('יומי מולטי ויטמין פלוס', concepts), 'vitamin-multi');
  assert.notEqual(assignConcept('נקטר מולטיויטמין 1.93 ליטר נאש סוק', concepts), 'vitamin-multi');
  assert.notEqual(assignConcept('קידס מולטי ויטמין שמפו 1ליטר', concepts), 'vitamin-multi');
});

test('magnesium: any salt form captures, a magnesium deodorant roll-on does not', () => {
  assert.equal(assignConcept('מגנזיום ציטראט (60) כשר', concepts), 'magnesium');
  assert.equal(assignConcept('מגנזיום ביסגליצינאט אלטמן 60 כמוסות', concepts), 'magnesium');
  assert.notEqual(assignConcept('דאו.רול מגנזיום50מ גרניה', concepts), 'magnesium');
  assert.notEqual(assignConcept('גרנייה דאודורנט רול און מכיל מגנזיום', concepts), 'magnesium');
});

test('zinc: a plain zinc supplement captures, a calcium+magnesium+zinc combo does not conflict', () => {
  assert.equal(assignConcept('אבץ פיקולינט', concepts), 'zinc');
  assert.equal(assignConcept('אבץ 50 מ"ג 100טבליות', concepts), 'zinc');
  assert.notEqual(assignConcept('קלציום מגנזיום אבץ100טבל', concepts), 'zinc');
  assert.notEqual(assignConcept('אבץ+ויטמין C סופהרב 60', concepts), 'zinc');
});

test('omega-3: fish-oil capsules capture, omega-3 eggs and enriched cooking oil do not', () => {
  assert.equal(assignConcept('אומגה 3 "950" 100 כמוסות', concepts), 'omega-3');
  assert.equal(assignConcept('אומגה DHA 60 טבליות', concepts), 'omega-3');
  assert.notEqual(assignConcept('ביצים אומגה 3 12 יחידות גדול', concepts), 'omega-3');
  assert.notEqual(assignConcept('שמן קנולה פלוס אומגה 3 1 ליטר עץ הזית', concepts), 'omega-3');
});

test('probiotic: both spellings (פרוביוטיקה/פרוביוטיק) capture, "probiotic" dish soap does not', () => {
  assert.equal(assignConcept('פרוביוטיקה פלוס 24כמוסות', concepts), 'probiotic');
  assert.equal(assignConcept('פרוביוטיק פמינה', concepts), 'probiotic');
  assert.notEqual(assignConcept('נוזל כלים מעושר בפרוביוטיקה לבנדר פרש', concepts), 'probiotic');
  assert.notEqual(assignConcept('כביסכל מבשם פרוביוטי רב תכליתי בניחוח ארומטי', concepts), 'probiotic');
});

test('protein-powder: whey/plant powder captures, a protein bar/cereal/hair-dye product does not', () => {
  assert.equal(assignConcept('אבקת חלבון מי גבינה', concepts), 'protein-powder');
  assert.equal(assignConcept('אבקת חלבון אפונה אורגנית 100 גרם', concepts), 'protein-powder');
  assert.notEqual(assignConcept('חטיף חלבון פרוטאין מקס טעם וניל 55 גרם', concepts), 'protein-powder');
  assert.notEqual(assignConcept('גרנולה פרוטאין בתוספת חלבון ואגוזים 300', concepts), 'protein-powder');
  assert.notEqual(assignConcept('צבע לשיער פרוטאין קולור- 1 שחור', concepts), 'protein-powder');
});

test('creatine: monohydrate captures, an unrelated supplement does not', () => {
  assert.equal(assignConcept('קריאטין מונוהידראט 300גר', concepts), 'creatine');
  assert.equal(assignConcept('GS קריאטין אבקה 500 גר', concepts), 'creatine');
  assert.notEqual(assignConcept('מגנזיום ציטראט', concepts), 'creatine');
});

test('sweetener: table sweeteners of every brand capture, sugar itself does not', () => {
  assert.equal(assignConcept('ממתיק על בסיס סוכרלוז - טבליות', concepts), 'sweetener');
  assert.equal(assignConcept('סוכרזית קלאסי כפית לכפית ממתיק על בסיס אריתריטול וסכרין', concepts), 'sweetener');
  assert.notEqual(assignConcept('סוכר לבן 1 קג', concepts), 'sweetener');
});

test('bandage-elastic: "אגד" (singular) captures, "מאגדת" (a bundle pack) does not', () => {
  assert.equal(assignConcept('אגד אלסטי מתמתח 5 ס"מ', concepts), 'bandage-elastic');
  assert.equal(assignConcept('אגד מתמתח 10 סמ', concepts), 'bandage-elastic');
  assert.notEqual(assignConcept('מאגדת גלידה מיני מגנום שוקולד 5 יח שטראוס', concepts), 'bandage-elastic');
  assert.notEqual(assignConcept('בונ אגדות העיר 241 ג', concepts), 'bandage-elastic');
});

test('thermometer: מד חום captures, מד לחץ דם (a different device) does not', () => {
  assert.equal(assignConcept('מד חום דיגיטלי', concepts), 'thermometer');
  assert.equal(assignConcept('מד חום לאוזן אינפרא רד', concepts), 'thermometer');
  assert.notEqual(assignConcept('מד לחץ דם 300 מטריקס', concepts), 'thermometer');
});

test('blood-pressure-monitor: מד לחץ דם captures, a thermometer does not', () => {
  assert.equal(assignConcept('מד לחץ דם 300 מטריקס', concepts), 'blood-pressure-monitor');
  assert.equal(assignConcept('מד לחץ דם לכף היד מדיק ס', concepts), 'blood-pressure-monitor');
  assert.notEqual(assignConcept('מד חום דיגיטלי', concepts), 'blood-pressure-monitor');
});

test('inhaler-device: מכשיר אינהלציה captures, a different pharmacy device does not', () => {
  assert.equal(assignConcept('מכשיר אינהלציה מדיק ספא', concepts), 'inhaler-device');
  assert.equal(assignConcept('מכשיר אינהלציה קומפקט', concepts), 'inhaler-device');
  assert.notEqual(assignConcept('מד לחץ דם 300 מטריקס', concepts), 'inhaler-device');
});

test('energy-gel: a sports energy gel captures, a generic cleaning gel does not', () => {
  assert.equal(assignConcept('גל אנרגיה אספרסו 35 גרם', concepts), 'energy-gel');
  assert.equal(assignConcept("ג`ל אנרגיה אספרסו 32 גרם", concepts), 'energy-gel');
  assert.notEqual(assignConcept('אג\'קס ג\'ל ניקוי שירותים עם אקונומיקה בניחוח רענן', concepts), 'energy-gel');
});

/**
 * The point of this round: categorize(name, conceptId) reads a concept's own category before the
 * department keyword rules, so writing "category": "פארם ותוספים" on these concepts is what actually
 * pulls the stranded products out of שימורים/ניקיון וטואלטיקה/כללי/משקאות on the next build.
 */
test('a concept written here also re-categorizes the product it names, out of the department it was stranded in', () => {
  assert.equal(categorize('אבקת חלבון מי גבינה', 'protein-powder'), 'פארם ותוספים'); // was שימורים
  assert.equal(categorize('קריאטין מונוהידראט 300גר', 'creatine'), 'פארם ותוספים'); // was כללי
  assert.equal(categorize('ממתיק סוויטאנגו 280 גרם', 'sweetener'), 'פארם ותוספים'); // was כללי
  assert.equal(categorize('גל אנרגיה אספרסו 35 גרם', 'energy-gel'), 'פארם ותוספים'); // was ניקיון וטואלטיקה
});

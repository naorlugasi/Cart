import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSize, sizeWithinTolerance, describeSize } from '../src/catalog/size.js';

test('grams: spelled out, abbreviated, glued to the number', () => {
  assert.deepEqual(parseSize('קוטג\' תנובה 5% 250 גרם'), { value: 250, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('פסטרמה הודו 400 גר'), { value: 400, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('חלבה מסולסלת 450 גרם'), { value: 450, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('אחלה כרוב אדום 500גר'), { value: 500, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('קוקוס טחון לבן 100 ג'), { value: 100, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('גבינת בייבי בל 100 ג\''), { value: 100, unit: 'g', count: 1 });
});

test('kilograms: ק"ג / ק״ג / קג / קילו / glued, normalized to grams', () => {
  assert.deepEqual(parseSize('אורז פרסי סוגת 1 ק"ג'), { value: 1000, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('קמח תופח מנופה 1 קג'), { value: 1000, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('קריספי ציפס קלאסי 1.25קג אסם'), { value: 1250, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('סוכרזית קנקן 1200 גר'), { value: 1200, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('אבקת כביסה שושן 1.25 קג'), { value: 1250, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('בננה סוגת 2ק"ג'), { value: 2000, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('תפוחים 1.5 ק״ג'), { value: 1500, unit: 'g', count: 1 });
});

test('millilitres: מ"ל / מ״ל / מל / glued', () => {
  assert.deepEqual(parseSize('סירופ מייפל טהור יד מרדכי 189 מ"ל'), { value: 189, unit: 'ml', count: 1 });
  assert.deepEqual(parseSize('בירה קרומבכר פילס 500 מל'), { value: 500, unit: 'ml', count: 1 });
  assert.deepEqual(parseSize('פלמוליב סבון ידיים שקדים 300 מ"ל'), { value: 300, unit: 'ml', count: 1 });
  assert.deepEqual(parseSize('מים 330מל'), { value: 330, unit: 'ml', count: 1 });
  assert.deepEqual(parseSize('תרסיס מיקרו קפסולרי 750 מ”ל'), { value: 750, unit: 'ml', count: 1 });
});

test('liters: ליטר / ל\' / ל / L, including hard-truncated "לי"', () => {
  assert.deepEqual(parseSize('נביעות+ מים מינרליים 1.5 ליטר'), { value: 1500, unit: 'ml', count: 1 });
  assert.deepEqual(parseSize('משקה אלוורה בטעם תפוח סאפה 1 ליטר'), { value: 1000, unit: 'ml', count: 1 });
  assert.deepEqual(parseSize('אלפרו משקה סויה בריסטה בקירור 1ל'), { value: 1000, unit: 'ml', count: 1 });
  assert.deepEqual(parseSize('מי עדן פקק ספורט 1 ל'), { value: 1000, unit: 'ml', count: 1 });
  assert.deepEqual(parseSize('גיל 3% בד"צ 125 מ"ל'), { value: 125, unit: 'ml', count: 1 });
  // Upstream feed truncates long names mid-word - "ליטר" is regularly cut to "לי".
  assert.deepEqual(parseSize('פאנטה ווילד ברי (פירות יער) 1.5 לי'), { value: 1500, unit: 'ml', count: 1 });
  assert.deepEqual(parseSize('ריצפז פרש יסמין 2 לי'), { value: 2000, unit: 'ml', count: 1 });
});

test('unit counts: יח\' / יחידות / יח, standalone or after מארז', () => {
  assert.deepEqual(parseSize('קפיצות עוגיות מיני 12 יח\''), { value: 1, unit: 'unit', count: 12 });
  assert.deepEqual(parseSize('נעמה גבינה מותכת 25% שומן - 16 יחידות'), { value: 1, unit: 'unit', count: 16 });
  assert.deepEqual(parseSize('גבינה מותכת לה וואש קירי 8 יח\' 18.5% שומן'), { value: 1, unit: 'unit', count: 8 });
  assert.deepEqual(parseSize('מארז 8 יחידות מעדן מילקי'), { value: 1, unit: 'unit', count: 8 });
  assert.deepEqual(parseSize('פריכיות מארז 4 יח'), { value: 1, unit: 'unit', count: 4 });
});

test('generic count nouns without a יח word are still a pack size', () => {
  assert.deepEqual(parseSize('נייר טואלט קלינקס פרימיום - מארז 9 גלילים'), { value: 1, unit: 'unit', count: 9 });
  assert.deepEqual(parseSize('20 שקיות זיפר בגודל 19*20 ס"מ'), { value: 1, unit: 'unit', count: 20 });
  assert.deepEqual(parseSize('טבליות למדיח פאוארבול 60 טבליות'), { value: 1, unit: 'unit', count: 60 });
  assert.deepEqual(parseSize('הגן הקסום תה הילולי 25 שקיקים'), { value: 1, unit: 'unit', count: 25 });
  assert.deepEqual(parseSize('קפסולות אספרסו 40 קפסולות'), { value: 1, unit: 'unit', count: 40 });
});

test('multi-pack "count*value unit" - value is per single unit', () => {
  assert.deepEqual(parseSize('מים מינרלים 6*330 מ"ל'), { value: 330, unit: 'ml', count: 6 });
  assert.deepEqual(parseSize('יוגורט תנובה 3% 8*15 גרם'), { value: 15, unit: 'g', count: 8 });
  assert.deepEqual(parseSize('פודינג 4 * 160 גרם'), { value: 160, unit: 'g', count: 4 });
  assert.deepEqual(parseSize('חטיף מלוח 10*25 גר'), { value: 25, unit: 'g', count: 10 });
  assert.deepEqual(parseSize('מים 10 * 40 מ"ל'), { value: 40, unit: 'ml', count: 10 });
});

test('multi-pack "value x count unit" and the value-before-count ordering', () => {
  assert.deepEqual(parseSize('מים מינרלים 330 מ"ל x6'), { value: 330, unit: 'ml', count: 6 });
  assert.deepEqual(parseSize('נתחי טונה בהירה בשמן 108x4 גר פוסידון'), { value: 108, unit: 'g', count: 4 });
  assert.deepEqual(parseSize('יוגורט 3% דנונה 150x8 גר אקטיביה'), { value: 150, unit: 'g', count: 8 });
});

test('Hebrew word-form packs: זוג, שלישייה..עשירייה, with or without a printed size', () => {
  assert.deepEqual(parseSize('זוג כפפות גומי'), { value: 1, unit: 'unit', count: 2 });
  assert.deepEqual(parseSize('שלישיית גרעיני תירס'), { value: 1, unit: 'unit', count: 3 });
  assert.deepEqual(parseSize('רביעיית שוקולד פרה מריר 100 גרם'), { value: 100, unit: 'g', count: 4 });
  assert.deepEqual(parseSize('בירה גולדסטאר מארז שישייה, בקבוק 330 מ"ל'), { value: 330, unit: 'ml', count: 6 });
  assert.deepEqual(parseSize('סן בנדטו - מוגז - שישיית 500 מל'), { value: 500, unit: 'ml', count: 6 });
  assert.deepEqual(parseSize('קוקה קולה פרידגפק סליק 330 מ"ל שישייה'), { value: 330, unit: 'ml', count: 6 });
  assert.deepEqual(parseSize('קינדר ג\'וי סופר מריו מארז שלישייה'), { value: 1, unit: 'unit', count: 3 });
  assert.deepEqual(parseSize('מארז שמינייה מולר יוגורט ביו'), { value: 1, unit: 'unit', count: 8 });
  assert.deepEqual(parseSize('עשיריית פיתות אנג\'ל'), { value: 1, unit: 'unit', count: 10 });
});

test('fat and alcohol percentages are never a size', () => {
  assert.equal(parseSize('יוגורט אננס 3% יופלה'), null);
  assert.equal(parseSize('פיראוס פטה כבשים 20%'), null);
  assert.deepEqual(
    parseSize('בירה גולדסטאר SlowBrew 10%, מארז שישייה'),
    { value: 1, unit: 'unit', count: 6 },
    'no printed size next to the pack word - falls back to just the count, never the 10%',
  );
  assert.equal(parseSize('גבינה בולגרית 24% שומן משק צוריאל'), null);
  assert.equal(parseSize('יין רוזה חצי יבש 12% אלכוהול'), null);
  // A real size elsewhere in the name must still be found despite the percentage noise.
  assert.deepEqual(parseSize('יין הר חרמון רוזה 12% אלכוהול 750 מ"ל'), { value: 750, unit: 'ml', count: 1 });
});

test('ranges use the first number; decimal commas are normalized', () => {
  assert.deepEqual(parseSize('חזה עוף 150-200 גרם'), { value: 150, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('מלפפונים בחומץ 10-12 גרם'), { value: 10, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('אריאל ג\'ל ניחוח הרים 1,5 ליטר'), { value: 1500, unit: 'ml', count: 1 });
  assert.deepEqual(parseSize('חלב טבעי 1,5 ק"ג'), { value: 1500, unit: 'g', count: 1 });
});

test('two sizes in one name prefer the per-unit x count form', () => {
  assert.deepEqual(parseSize('מים מינרלים 6*330 מ"ל 1.98 ליטר'), { value: 330, unit: 'ml', count: 6 });
});

test('weighted produce and meat sold loose have no size', () => {
  assert.equal(parseSize('מלפפון בלאדי'), null);
  assert.equal(parseSize('עגבניות שקיל'), null);
  assert.equal(parseSize('בננה במשקל'), null);
  assert.equal(parseSize('חזה עוף טרי'), null);
  assert.equal(parseSize(''), null);
  assert.equal(parseSize(null), null);
  assert.equal(parseSize(undefined), null);
});

test('diaper baby-weight ranges are never read as the product size', () => {
  // The real pack size is the trailing יחידות count, not the kg figure describing the baby.
  assert.deepEqual(
    parseSize('חיתולים 5-7 קילו שלב 2 האגיס אקסטרה קייר 42 יחידות'),
    { value: 1, unit: 'unit', count: 42 },
  );
  assert.deepEqual(
    parseSize('חיתולים פרידום דריי 10-14 קילו שלב 4+ האגיס 36 יחידות'),
    { value: 1, unit: 'unit', count: 36 },
  );
  assert.deepEqual(
    parseSize('חיתולי פמפרס פרימיום מידה 3 32 יח'),
    { value: 1, unit: 'unit', count: 32 },
  );
  // No unit count printed anywhere and the only number is the baby's weight -> no size, not 5kg.
  assert.equal(parseSize('חיתולי בייביסיטר מידה 3 , 5-9 ק"ג'), null);
});

test('describeSize renders the Hebrew display strings from CONCEPTS.md §2', () => {
  assert.equal(describeSize({ value: 1000, unit: 'ml', count: 1 }), '1 ליטר');
  assert.equal(describeSize({ value: 500, unit: 'g', count: 1 }), '500 גרם');
  assert.equal(describeSize({ value: 330, unit: 'ml', count: 6 }), '6 × 330 מ"ל');
  assert.equal(describeSize({ value: 1500, unit: 'g', count: 1 }), '1.5 ק"ג');
  assert.equal(describeSize({ value: 1, unit: 'unit', count: 12 }), '12 יח\'');
  assert.equal(describeSize(null), '');
});

test('sizeWithinTolerance compares total quantity (value x count), same unit required', () => {
  assert.equal(sizeWithinTolerance({ value: 1000, unit: 'ml', count: 1 }, { value: 900, unit: 'ml', count: 1 }), true);
  assert.equal(sizeWithinTolerance({ value: 330, unit: 'ml', count: 6 }, { value: 1980, unit: 'ml', count: 1 }), true, 'same total, different packaging');
  assert.equal(sizeWithinTolerance({ value: 1000, unit: 'ml', count: 1 }, { value: 700, unit: 'ml', count: 1 }), false, 'outside +-25%');
  assert.equal(sizeWithinTolerance({ value: 500, unit: 'g', count: 1 }, { value: 500, unit: 'ml', count: 1 }), false, 'g and ml are different units');
  assert.equal(sizeWithinTolerance(null, { value: 1, unit: 'g', count: 1 }), false);
  assert.equal(sizeWithinTolerance({ value: 1, unit: 'g', count: 1 }, null), false);
  assert.equal(sizeWithinTolerance({ value: 100, unit: 'g', count: 1 }, { value: 125, unit: 'g', count: 1 }, 0.25), true, 'exactly +-25%');
  assert.equal(sizeWithinTolerance({ value: 100, unit: 'g', count: 1 }, { value: 126, unit: 'g', count: 1 }, 0.2), false, 'tighter custom pct');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSize, sizeWithinTolerance, describeSize,
  normalizeUnitOfMeasure, sizeFromChainFields, resolveChainFieldSize, loadSizeUnitsConfig, sizeUnitsTableForChain,
} from '../src/catalog/size.js';

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

test('parseSize: a dash followed by a much larger number is a label and a size, not a range', () => {
  assert.deepEqual(parseSize('פולי אספרסו עוצמה 10- 450 גרם'), { value: 450, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('נקניקיות 150-200 גרם'), { value: 150, unit: 'g', count: 1 }, 'a real range keeps its first number');
});

// 1.10: a bag count followed by one bag's weight is the count times that weight, and the chains' cut forms of
// יחידות / שקיקים are counts. Before, a 25-bag box of tea weighed 1.5 g and "50 יחיד" had no size at all.
test('parseSize: a bag count with the weight of one bag, and the cut count words', () => {
  assert.deepEqual(parseSize('תה ירוק נענע 25 שק*1.5גר'), { value: 1.5, unit: 'g', count: 25 });
  assert.deepEqual(parseSize('תה ירוק נענע 25 שקיקים 1.5 גרם'), { value: 1.5, unit: 'g', count: 25 });
  assert.deepEqual(parseSize('דוחן 6 שקיות * 66.66 גר MAKFA'), { value: 66.66, unit: 'g', count: 6 });
  assert.deepEqual(parseSize('תה ירוק נענע 50 יחיד'), { value: 1, unit: 'unit', count: 50 });
  assert.deepEqual(parseSize('תה ירוק נענע 25 שק'), { value: 1, unit: 'unit', count: 25 });
  assert.deepEqual(parseSize('פיטנס חטיף דגנים שוק.6יח'), { value: 1, unit: 'unit', count: 6 });
  // without a "*", a weight big enough to be the whole box is the box
  assert.deepEqual(parseSize('תה ירוק נענע 20 שקיות גרינפילד 34 גר'), { value: 34, unit: 'g', count: 1 });
  assert.deepEqual(parseSize('חטיף 6 יח 150 גרם'), { value: 150, unit: 'g', count: 1 });
  assert.notDeepEqual(parseSize('אקסלנס בלונד מס9.3 יחיד'), { value: 1, unit: 'unit', count: 3 }); // shade 9.3, not 3 units
});

// 3.10: the chains' ~20-character cut often lands inside the pack word; the cut forms still say the pack.
test('parseSize: a pack word cut by a chain still counts', () => {
  assert.deepEqual(parseSize('מגבוני האגיס אקסטרה קר ללא בישום רביעיי'), { value: 1, unit: 'unit', count: 4 });
  assert.deepEqual(parseSize('דובונים 20 גר חמישיי'), { value: 20, unit: 'g', count: 5 });
});

// 10.10.2026: package size from the chains' own price-file fields (Quantity/UnitOfMeasure/UnitQty),
// a fallback for when no chain NAME yields a size - see config/size-units.json and
// data/local/size-from-chain-fields-report.md for the real-world buckets this is built from.

test('normalizeUnitOfMeasure: trims, collapses spaces, strips bidi marks (no final-letter folding - it would corrupt words that already end correctly)', () => {
  assert.equal(normalizeUnitOfMeasure('100 גרם  '), '100 גרם');
  assert.equal(normalizeUnitOfMeasure('  100   גרם'), '100 גרם');
  assert.equal(normalizeUnitOfMeasure('1‎ קילוגרם'), '1 קילוגרם', 'mck embeds a left-to-right mark');
  assert.equal(normalizeUnitOfMeasure(''), '');
  assert.equal(normalizeUnitOfMeasure(null), '');
  assert.equal(normalizeUnitOfMeasure(undefined), '');
});

const ramilevyTable = {
  '100 גרם': { unit: 'g', quantityIs: 'amount', scale: 1 },
  '100 מ"ל': { unit: 'ml', quantityIs: 'amount', scale: 1 },
  '1 ק"ג': { unit: 'g', quantityIs: 'amountInUnit', scale: 1000 },
  '1 ליטר': { unit: 'ml', quantityIs: 'amountInUnit', scale: 1000 },
};
const hazihinamTable = {
  'UQ:יחידות': { unit: 'unit', quantityIs: 'count', scale: 1 },
  'UQ:מיליליטר': { unit: 'ml', quantityIs: 'amount', scale: 1 },
};

test('sizeFromChainFields: a derived size over 20 kg / 20 L is a chain data slip and returns null', () => {
  const table = { 'ליטר': { unit: 'ml', quantityIs: 'amountInUnit', scale: 1000 } };
  assert.equal(sizeFromChainFields({ quantity: 1320, unitOfMeasure: 'ליטר' }, table), null);
  assert.deepEqual(sizeFromChainFields({ quantity: 1.32, unitOfMeasure: 'ליטר' }, table), { value: 1320, unit: 'ml', count: 1 });
});

test('sizeFromChainFields: "100 גרם"/"100 מ"ל" basis - Quantity already is the amount, scale x1', () => {
  assert.deepEqual(
    sizeFromChainFields({ quantity: 250, unitOfMeasure: '100 גרם' }, ramilevyTable),
    { value: 250, unit: 'g', count: 1 },
    'דובדבן אדום כ-250 גרם - ramilevy, real row',
  );
  assert.deepEqual(
    sizeFromChainFields({ quantity: 112, unitOfMeasure: '100 גרם  ' }, ramilevyTable), // trailing spaces, unnormalized
    { value: 112, unit: 'g', count: 1 },
  );
  assert.deepEqual(
    sizeFromChainFields({ quantity: 500, unitOfMeasure: '100 מ"ל' }, ramilevyTable),
    { value: 500, unit: 'ml', count: 1 },
  );
});

test('sizeFromChainFields: "1 ק"ג"/"1 ליטר" basis - Quantity is in the basis unit, scale x1000, and already carries the multipack total', () => {
  assert.deepEqual(
    sizeFromChainFields({ quantity: 1.5, unitOfMeasure: '1 ק"ג' }, ramilevyTable),
    { value: 1500, unit: 'g', count: 1 },
  );
  // keshet real example: a 6x330ml beer pack reports Quantity=1.98 under the ליטר basis, not 330.
  assert.deepEqual(
    sizeFromChainFields({ quantity: 1.98, unitOfMeasure: '1 ליטר' }, ramilevyTable),
    { value: 1980, unit: 'ml', count: 1 },
  );
});

test('sizeFromChainFields: "יחידות"-type (count) basis is unit-count, scale applies to the count not a weight', () => {
  const mckTable = { 'יחידות 1': { unit: 'unit', quantityIs: 'count', scale: 1 } };
  assert.deepEqual(
    sizeFromChainFields({ quantity: 4, unitOfMeasure: 'יחידות 1' }, mckTable),
    { value: 1, unit: 'unit', count: 4 },
  );
});

test('sizeFromChainFields: falls back to UQ:<unitQty> only when the unitOfMeasure lookup itself is empty (hazihinam)', () => {
  assert.deepEqual(
    sizeFromChainFields({ quantity: 200, unitOfMeasure: '', unitQty: 'מיליליטר' }, hazihinamTable),
    { value: 200, unit: 'ml', count: 1 },
  );
  assert.deepEqual(
    sizeFromChainFields({ quantity: 100, unitOfMeasure: '', unitQty: 'יחידות' }, hazihinamTable),
    { value: 1, unit: 'unit', count: 100 },
    '835811004677 גביעי נייר מס 4 - real gain example from the report',
  );
  // unitOfMeasure resolves on its own at a chain that fills it - the UQ: fallback must not kick in.
  assert.deepEqual(
    sizeFromChainFields({ quantity: 250, unitOfMeasure: '100 גרם', unitQty: 'יחידות' }, ramilevyTable),
    { value: 250, unit: 'g', count: 1 },
  );
});

test('sizeFromChainFields: null for a weighed item, a non-positive/missing quantity, a missing table, or an unmapped bucket - never a guess', () => {
  assert.equal(sizeFromChainFields({ quantity: 1, unitOfMeasure: '1 ק"ג', isWeighted: true }, ramilevyTable), null);
  assert.equal(sizeFromChainFields({ quantity: 0, unitOfMeasure: '100 גרם' }, ramilevyTable), null);
  assert.equal(sizeFromChainFields({ quantity: -5, unitOfMeasure: '100 גרם' }, ramilevyTable), null);
  assert.equal(sizeFromChainFields({ quantity: 250, unitOfMeasure: '100 גרם' }, null), null);
  assert.equal(sizeFromChainFields({ quantity: 250, unitOfMeasure: 'Unknown' }, ramilevyTable), null);
  assert.equal(sizeFromChainFields({ quantity: 250, unitOfMeasure: '' }, ramilevyTable), null, 'no unitQty to fall back to either');
});

test('sizeUnitsTableForChain: victory is excluded (corrupted UnitOfMeasure text), an unmeasured chain falls back to the universal "*" bucket, a chain with its own table is never merged with it', () => {
  const config = {
    chains: new Map([['keshet', new Map([['100 גרם', { unit: 'g', quantityIs: 'amount', scale: 1 }]])]]),
    fallback: new Map([['יחידות', { unit: 'unit', quantityIs: 'count', scale: 1 }], ['100 גרם', { unit: 'g', quantityIs: 'amount', scale: 1, _fromFallback: true }]]),
    chainReliability: { keshet: 0.97, victory: 0 },
    excludedChains: new Set(['victory']),
  };
  assert.equal(sizeUnitsTableForChain('victory', config), null);
  assert.equal(sizeUnitsTableForChain('some-future-chain', config), config.fallback, 'no table of its own -> the universal fallback');
  const keshetTable = sizeUnitsTableForChain('keshet', config);
  assert.equal(keshetTable, config.chains.get('keshet'));
  assert.equal(keshetTable.has('יחידות'), false, 'keshet is not allow-listed for the unit-count basis, and the fallback must not restore it');
});

test('resolveChainFieldSize: reliability-weighted majority on the total amount (value x count), one candidate per chain family', () => {
  // Two reliable chains agree on 85g, one less-reliable chain says 1000g (yochananof misreading a cat-food
  // sachet under the קילוגרם basis - the exact example from the report) - the agreeing pair wins.
  assert.deepEqual(
    resolveChainFieldSize([
      { size: { value: 85, unit: 'g', count: 1 }, weight: 0.96 },
      { size: { value: 85, unit: 'g', count: 1 }, weight: 0.9 },
      { size: { value: 1000, unit: 'g', count: 1 }, weight: 0.86 },
    ]),
    { value: 85, unit: 'g', count: 1 },
  );
});

test('resolveChainFieldSize: a single candidate is trusted outright', () => {
  assert.deepEqual(resolveChainFieldSize([{ size: { value: 500, unit: 'g', count: 1 }, weight: 0.9 }]), { value: 500, unit: 'g', count: 1 });
});

test('resolveChainFieldSize: candidates within 5% of each other on the total agree (not a conflict)', () => {
  assert.deepEqual(
    resolveChainFieldSize([
      { size: { value: 100, unit: 'g', count: 1 }, weight: 0.9 },
      { size: { value: 103, unit: 'g', count: 1 }, weight: 0.9 },
    ]),
    { value: 100, unit: 'g', count: 1 },
  );
});

test('resolveChainFieldSize: an evenly-weighted, >5%-apart disagreement returns null rather than guessing', () => {
  assert.equal(
    resolveChainFieldSize([
      { size: { value: 100, unit: 'g', count: 1 }, weight: 0.9 },
      { size: { value: 200, unit: 'g', count: 1 }, weight: 0.88 },
    ]),
    null,
  );
});

test('resolveChainFieldSize: a dominant winner (weight gap > 0.15) wins even when it disagrees by more than 5%', () => {
  assert.deepEqual(
    resolveChainFieldSize([
      { size: { value: 100, unit: 'g', count: 1 }, weight: 0.96 },
      { size: { value: 200, unit: 'g', count: 1 }, weight: 0.5 },
    ]),
    { value: 100, unit: 'g', count: 1 },
  );
});

test('resolveChainFieldSize: a g candidate and an ml candidate never merge into one group, an empty input is null, and a zero-weight candidate (e.g. victory) never wins alone', () => {
  // Same numeric total, different units: two separate groups, same total weight each - the group the
  // candidates were pushed in first order wins (deterministic, not an ambiguous same-unit conflict).
  assert.deepEqual(
    resolveChainFieldSize([
      { size: { value: 500, unit: 'ml', count: 1 }, weight: 0.9 },
      { size: { value: 500, unit: 'g', count: 1 }, weight: 0.9 },
    ]),
    { value: 500, unit: 'ml', count: 1 },
  );
  assert.equal(resolveChainFieldSize([]), null);
  assert.equal(resolveChainFieldSize([{ size: { value: 1, unit: 'g', count: 1 }, weight: 0 }]), null, 'zero-weight (e.g. victory) never wins alone');
});

test('loadSizeUnitsConfig reads the real config/size-units.json: normalizes bucket keys, excludes victory, keeps the UQ: hazihinam fallback and a universal "*" bucket', () => {
  const config = loadSizeUnitsConfig();
  assert.ok(config.chains.get('ramilevy')?.has('100 גרם'));
  assert.ok(config.chains.get('hazihinam')?.has('UQ:יחידות'));
  assert.equal(sizeUnitsTableForChain('victory', config), null);
  assert.ok(typeof config.chainReliability.keshet === 'number');
  assert.ok(config.fallback.size > 0);
  // The יחידות allow-list lives in the DATA, not in code: only hazihinam/mck/shukcity may vote on it.
  for (const chainId of ['ramilevy', 'shufersal', 'carrefour', 'yochananof', 'yochananof_b', 'osherad', 'ybitan', 'tivtaam', 'keshet', 'quik']) {
    const table = config.chains.get(chainId);
    assert.equal([...table.keys()].some((k) => k.includes('יחיד')), false, `${chainId} must not vote on a unit-count basis`);
  }
});

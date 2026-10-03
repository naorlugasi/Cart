/**
 * Size ("גודל"): parses the package size out of a Hebrew supermarket product name
 * (docs/CONCEPTS.md §2). `value` is always per single unit, normalized to grams or
 * millilitres; `count` is the pack size (default 1). Fat/alcohol percentages are
 * never a size. Returns null when the name has no discernible size (e.g. weighted
 * produce/meat sold loose).
 */

// Scraped catalog data is inconsistent about how it types a Hebrew abbreviation mark:
// a real gershayim/geresh (״ ׳), a plain ASCII quote, curly quotes, or two single quotes
// typed in a row. One class covers every spot ("ק"ג", "ק״ג", "מ''ל", "מ'ל", "ל'", "יח'"...).
const QUOTE = '(?:\'\'|"|״|”|“|\'|׳)';

// Longest-first per unit family so the alternation doesn't stop at a shorter prefix
// (e.g. "גר" before "גרם" would greedily eat "גר" out of "גרם" and then fail the
// no-trailing-letter lookahead - listing "גרם" first avoids that entirely).
// "לי" covers names hard-truncated mid-word ("1.5 לי" for "1.5 ליטר") - very common upstream.
const UNIT_ALT = String.raw`קילו|ק${QUOTE}ג|קג|kg|גרם|גר|ג${QUOTE}|ג|g|ליטר|לי|ל${QUOTE}|ל|L|מ${QUOTE}ל|מל|ml`;
// Plural "count nouns" that stand in for a bare pack size: "60 טבליות", "20 שקיות", "9 גלילים".
// "יחיד" and "שק" are the chains' cuts of יחידות and שקיקים ("תה ירוק נענע 50 יחיד", "25 שק*1.5גר", 1.10).
const UNIT_COUNT_ALT = String.raw`יחידות|יחיד|יח${QUOTE}|יח|שקיות|שקיקים|שקיק|שק|גלילים|טבליות|קפסולות|כמוסות|מגבונים|מנות`;

const KG_RE = new RegExp(`^(?:קילו|ק${QUOTE}ג|קג|kg)$`, 'i');
const GRAM_RE = new RegExp(`^(?:גרם|גר|ג${QUOTE}|ג|g)$`, 'i');
const LITER_RE = new RegExp(`^(?:ליטר|לי|ל${QUOTE}|ל|L)$`);
const ML_RE = new RegExp(`^(?:מ${QUOTE}ל|מל|ml)$`, 'i');

/** number, optionally a "150-200" range (only the first number is kept), then a size unit. The range's second
 * number is captured (group 2) because a dash is not always a range: "פולי אספרסו עוצמה 10- 450 גרם" is strength
 * 10 and 450 grams, and reading it as the range 10-450 made the product 10 g (28.9). See rangeValue. */
const SIZE_TOKEN_RE = new RegExp(String.raw`(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?\s*(${UNIT_ALT})(?![\p{L}])`, 'giu');
/** A real range spans a small ratio ("150-200 גרם", a baby's "5-9 ק"ג"); a second number more than three times the
 * first is the size itself, and the first belongs to something else on the label. */
const rangeValue = (m) => (m[2] && toNum(m[2]) > 3 * toNum(m[1]) ? toNum(m[2]) : toNum(m[1]));

/** "330 מ"ל x6" / "500 גרם *4" - unit sits right after the first (per-unit) number. */
const MULT_MID_RE = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*(${UNIT_ALT})(?![\p{L}])\s*[*x×X]\s*(\d+)`, 'gu');

/** "6*330 מ"ל" / "108x4 גר" - unit sits after both numbers; magnitude decides which is the count. */
const MULT_END_RE = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*[*x×X]\s*(\d+(?:[.,]\d+)?)\s*(${UNIT_ALT})(?![\p{L}])`, 'gu');

/** Bare unit count: "12 יח'", "40 יחידות" (also matches inside "מארז 4 יח"). */
const UNIT_COUNT_RE = new RegExp(String.raw`(?<!\d)(?<!\d[.,])(\d+)\s*(${UNIT_COUNT_ALT})(?![\p{L}])`, 'gu');

/** "25 שקיקים * 1.5 גרם" / "25 שק*1.5גר" / "25 שקיקים 1.5 גרם": a count of bags, then what ONE bag weighs. Read
 * this way only with an explicit "*", or when the weight is too small to be the whole box (3 g or less for ten
 * or more bags) - "20 שקיות 34 גר" is the box. Before 1.10 the bag weight was read as the product: a 25-bag box of
 * tea weighed 1.5 g. */
const COUNT_THEN_EACH_RE = new RegExp(String.raw`(?<!\d)(?<!\d[.,])(\d+)\s*(?:${UNIT_COUNT_ALT})(?![\p{L}])\s*([*x×X])?\s*(\d+(?:[.,]\d+)?)\s*(${UNIT_ALT})(?![\p{L}])`, 'gu');

/** Hebrew "N-pack" nouns. Construct-state forms ("שישיית") are included alongside the plain ones. */
const PACK_WORDS = {
  'זוג': 2,
  'שלישיה': 3, 'שלישייה': 3, 'שלישיית': 3,
  'רביעיה': 4, 'רביעייה': 4, 'רביעיית': 4,
  'חמישיה': 5, 'חמישייה': 5, 'חמישיית': 5,
  'שישיה': 6, 'שישייה': 6, 'שישיית': 6,
  'שביעיה': 7, 'שביעייה': 7, 'שביעיית': 7,
  'שמיניה': 8, 'שמינייה': 8, 'שמינייתה': 8,
  'תשיעיה': 9, 'תשיעייה': 9,
  'עשיריה': 10, 'עשירייה': 10, 'עשיריית': 10,
  // The chains' ~20-character cut lands inside the pack word often enough to matter: "מגבוני האגיס אקסטרה קר
  // ללא בישום רביעיי" (Naor's search, 3.10) read as 56 units off its "56 יח'" instead of a 4-pack.
  'שלישיי': 3, 'רביעיי': 4, 'חמישיי': 5, 'שישיי': 6, 'שמיניי': 8, 'עשיריי': 10,
};
const PACK_WORD_RE = new RegExp(
  String.raw`(?<![\p{L}])(${Object.keys(PACK_WORDS).sort((a, b) => b.length - a.length).join('|')})(?![\p{L}])`,
  'u',
);

/** Baby diapers print the *baby's* weight ("5-7 קילו שלב 2", "עד 6 קילו", "5-9 ק"ג") right next
 * to the real pack size ("42 יחידות") - a kg/g figure there is never the product's own size. */
const DIAPER_RE = /חיתול/;

function toNum(token) {
  return parseFloat(String(token).replace(',', '.'));
}

function isIntToken(token) {
  return !/[.,]/.test(String(token));
}

/** g/1000 or ml/1000 factor for a matched unit token, or null if it isn't a recognized size unit. */
function classifyUnit(token) {
  if (KG_RE.test(token)) return { unit: 'g', factor: 1000 };
  if (GRAM_RE.test(token)) return { unit: 'g', factor: 1 };
  if (LITER_RE.test(token)) return { unit: 'ml', factor: 1000 };
  if (ML_RE.test(token)) return { unit: 'ml', factor: 1 };
  return null;
}

/**
 * `parseSize(name) -> { value, unit, count } | null`
 * `unit` is 'g' | 'ml' | 'unit'. `value` is per single unit (already ×1000 for kg/liter).
 * `count` is the pack size, 1 by default.
 */
export function parseSize(name) {
  const text = String(name ?? '');
  if (!text.trim()) return null;

  const isDiaper = DIAPER_RE.test(text);
  const diaperGuarded = (cls) => isDiaper && cls.unit === 'g' && cls.factor === 1000;

  // 1. "330 מ"ל x6" style: the unit is unambiguous (bound to the first number).
  MULT_MID_RE.lastIndex = 0;
  for (let m; (m = MULT_MID_RE.exec(text)); ) {
    const cls = classifyUnit(m[2]);
    if (!cls || diaperGuarded(cls)) continue;
    const count = Math.max(1, Math.round(toNum(m[3])));
    return { value: toNum(m[1]) * cls.factor, unit: cls.unit, count };
  }

  // 2. "6*330 מ"ל" / "108x4 גר": unit trails both numbers - the smaller one is the count
  // (a count can't be fractional, so a decimal number is always the value).
  MULT_END_RE.lastIndex = 0;
  for (let m; (m = MULT_END_RE.exec(text)); ) {
    const cls = classifyUnit(m[3]);
    if (!cls || diaperGuarded(cls)) continue;
    const [raw1, raw2] = [m[1], m[2]];
    const [n1, n2] = [toNum(raw1), toNum(raw2)];
    const [int1, int2] = [isIntToken(raw1), isIntToken(raw2)];
    let count, value;
    if (int1 && !int2) [count, value] = [n1, n2];
    else if (!int1 && int2) [count, value] = [n2, n1];
    else [count, value] = n1 <= n2 ? [n1, n2] : [n2, n1];
    return { value: value * cls.factor, unit: cls.unit, count: Math.max(1, Math.round(count)) };
  }

  // 2b. "25 שקיקים * 1.5 גרם": a bag count, then the weight of one bag (COUNT_THEN_EACH_RE).
  COUNT_THEN_EACH_RE.lastIndex = 0;
  for (let m; (m = COUNT_THEN_EACH_RE.exec(text)); ) {
    const cls = classifyUnit(m[4]);
    if (!cls || diaperGuarded(cls)) continue;
    const count = Math.round(toNum(m[1]));
    const each = toNum(m[3]) * cls.factor;
    if (count > 1 && (m[2] || (cls.unit === 'g' && each <= 3 && count >= 10))) return { value: each, unit: cls.unit, count };
  }

  // 3. Word-form pack ("שישיית 330 מ"ל", "330 מ"ל שישייה", "זוג" on its own).
  const packMatch = PACK_WORD_RE.exec(text);
  if (packMatch) {
    const count = PACK_WORDS[packMatch[1]];
    SIZE_TOKEN_RE.lastIndex = 0;
    for (let m; (m = SIZE_TOKEN_RE.exec(text)); ) {
      const cls = classifyUnit(m[3]);
      if (!cls || diaperGuarded(cls)) continue;
      return { value: rangeValue(m) * cls.factor, unit: cls.unit, count };
    }
    return { value: 1, unit: 'unit', count };
  }

  // 4. A single plain size ("500 גרם", "1.5 ליטר", "150-200 גרם" -> first number).
  SIZE_TOKEN_RE.lastIndex = 0;
  for (let m; (m = SIZE_TOKEN_RE.exec(text)); ) {
    const cls = classifyUnit(m[3]);
    if (!cls || diaperGuarded(cls)) continue;
    return { value: rangeValue(m) * cls.factor, unit: cls.unit, count: 1 };
  }

  // 5. A bare unit count with no weight/volume ("12 יח'", "מארז 4 יח", "42 יחידות").
  UNIT_COUNT_RE.lastIndex = 0;
  const um = UNIT_COUNT_RE.exec(text);
  if (um) return { value: 1, unit: 'unit', count: Math.max(1, Math.round(toNum(um[1]))) };

  return null;
}

/** Same unit required; compares total quantity (value×count) within ±pct. Either null -> false. */
export function sizeWithinTolerance(a, b, pct = 0.25) {
  if (!a || !b) return false;
  if (a.unit !== b.unit) return false;
  const totalA = a.value * a.count;
  const totalB = b.value * b.count;
  if (totalA === totalB) return true;
  const denom = Math.max(totalA, totalB);
  if (denom === 0) return false;
  return Math.abs(totalA - totalB) / denom <= pct;
}

function formatNum(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Hebrew display string: "1 ליטר", "500 גרם", "6 × 330 מ"ל", "1.5 ק"ג", "12 יח'". */
export function describeSize(size) {
  if (!size) return '';
  const { value, unit, count } = size;
  let num;
  let label;
  if (unit === 'unit') {
    return `${Math.round(count)} יח'`;
  } else if (unit === 'g') {
    if (value >= 1000) { num = value / 1000; label = 'ק"ג'; }
    else { num = value; label = 'גרם'; }
  } else if (unit === 'ml') {
    if (value >= 1000) { num = value / 1000; label = 'ליטר'; }
    else { num = value; label = 'מ"ל'; }
  } else {
    return '';
  }
  const text = `${formatNum(num)} ${label}`;
  return count > 1 ? `${count} × ${text}` : text;
}

/**
 * Product categories for the UI (10 fixed categories, docs/PIPELINE-CONTRACT.md §2.1).
 *
 * The price files carry NO category at all, so this is ours. Two signals, in order:
 *   1. the product's concept (config/concepts/*.json) - every concept declares its category;
 *   2. keyword rules on the name (first matching rule wins, produce last: fruit words are also flavours).
 */
import { conceptById } from './concepts.js';

/** Category rules: first matching keyword wins (order matters). Produce is last on purpose: fruit and vegetable
 * words are also flavours ("יוגורט תות", "אקונומיקה בריח לימון"), so a product-type word must get the first say. */
export const CATEGORIES = ['ירקות ופירות', 'בשר ועוף', 'חלב וביצים', 'מאפים ולחם', 'חטיפים וממתקים', 'משקאות', 'שימורים', 'ניקיון וטואלטיקה', 'מעדנייה', 'כללי'];

// A keyword written bare matches as a *substring* of any other Hebrew word that starts the same way - and most
// of our keywords are deliberately truncated stems so they still match plurals/construct forms ("עגבני" must
// still catch "עגבניות", "נקניק" must still catch "נקניקיות"). So the one boundary that's always safe to require
// is at the START of the match: the character right before it must not be a Hebrew letter. That alone fixes every
// bug where a keyword sits *inside* another word - "יין" inside "אלקליין" (batteries), "טופי" inside "שטופים"
// (washed), "חלבה" inside "מחלבה" (creamery), "טישו" inside "ארטישוק" (artichoke) - without breaking the
// deliberate prefixes above (which have nothing before them to block).
// A handful of short/complete keywords are ALSO a prefix of an unrelated longer word ("דג" fish → "דגני" cereal,
// "בקר" cattle → "בקרדי" Bacardi, "קשיו" cashew → "קשיות" straws, "לק" nail polish → "לקט" mix, "גיל" the Tnuva
// yogurt brand → "גילוח" shaving). Those get an explicit end lookahead inline, same idea as the trailing space
// some of these keywords already used ("מרק ", "פול ", "נר ", "סלט ") - written as a lookahead instead of a
// literal space so it also matches at the end of a (possibly truncated) name.
const HEB = '\\u05d0-\\u05ea';
const NOT_HEB_AHEAD = `(?![${HEB}])`;
function wordRule(category, source, exclude = null) {
  return [category, new RegExp(`(?<![${HEB}])(?:${source})`), exclude];
}

// Toiletry/cleaning/laundry context that steals a food-category word used as an ingredient or scent elsewhere:
// "קרם ידיים מועשר בשמן" (hand cream, not oil), "אבקת טלק" (talc, not a food powder), "מרכך כביסה...תמצית
// שיבולת שועל" (oat-scented fabric softener, not oats), "קרפור מלח למדיח כלים" (dishwasher salt, not table salt).
const NON_FOOD_SIGNAL = /מדיח|כביסה|מייבש|מבשם|מרכך|דאודורנט|רחצה|תחליב|גילוח|לשיער|שיער|לעור|קרם ידיים|קרם גוף|תמרוק|בושם|רול און|חוחובה|לפנים|איפור|טלק|ניקוי|מסכ(ה|ת)|הברקה|בניחוח/;

// A name that opens by declaring itself a snack beats a meat/dairy/bakery word inside it: "חטיפי עוף" is a
// chicken-*flavoured* puff, not chicken; "חטיף חיטה בטעם שווארמה" is not lamb; "חטיפי פיצה גבינה" is not cheese.
const SNACK_SELF_DECLARE = /חטיפ|חטיף|צ'יטוס|ציטוס|דוריטוס|ביסלי|במבה/;

// Tableware words that steal a "dish" word from a product that is actually the tableware, not food:
// "קעריות מרק" = soup bowls, not soup; "צלחות מנה עיקרית" = dinner plates, not a prepared dish.
const TABLEWARE_SIGNAL = /קעריות|צלחות|כוסות|כפות חד|מזלגות/;

export const CATEGORY_RULES = [
  wordRule('בשר ועוף',
    `עוף|הודו|בקר${NOT_HEB_AHEAD}|בשר|כבש|שניצל|קבב|המבורגר|נקניק|סטייק|אנטריקוט|צלעות|כרעיים|שוקיים|כנפיים|פרגית|טחון|נתחי|כבד|דג${NOT_HEB_AHEAD}|סלמון|טונה טרי|אמנון|בורי|דניס|לברק|נסיכה|פילה`,
    (name) => {
      if (SNACK_SELF_DECLARE.test(name)) return true;
      if (/פריסקיז|וויסקס|פדיגרי/.test(name)) return true; // pet food, not human meat
      // a soup/noodle/seasoning-mix carrier means the meat word is just the flavour, not the product
      // ("מרק... טעם עוף" is Knorr soup base; "תיבול לגריל עוף" is a spice mix; "איטריות נודלס בטעם בקר" is instant noodles).
      if (/מרק|נודלס|איטריות|תיבול|תבול|דגש טעם|נמס בכוס/.test(name)) return true;
      const strongMeatWord = /עוף|בשר|שניצל|קבב|המבורגר|נקניק|סטייק|אנטריקוט|צלעות|כרעיים|שוקיים|כנפיים|פרגית|נתחי|כבד|דג|סלמון|פילה/.test(name);
      // בקר/כבש double as "cow/sheep milk" - only meat when a stronger meat word backs them up
      // ("גבינת חלומי מחלב בקר" is cheese; "בשר בקר טחון" is meat).
      if (!strongMeatWord && /גבינ|יוגורט|חלב(?!ה)|חלומי|קממבר/.test(name)) return true;
      // טחון (ground) also means "ground spice/coffee" - a spice/coffee word without another meat word wins.
      if (!strongMeatWord && /טחון/.test(name) && !/בקר|כבש/.test(name) && /כורכום|קינמון|קנמון|כמון|קוקוס|פלפל לבן|קפה|שום|ג'ינג'ר/.test(name)) return true;
      return false;
    }),
  wordRule('חלב וביצים',
    `חלב(?!ה)|גבינ|קוטג|יוגורט|שמנת|חמאה|ביצים|אשל|גיל${NOT_HEB_AHEAD}|מעדן חלב|פודינג|מילקי|דנונה|יופלה|אקטימל|משקה חלב|קפיר|מוצרלה|צהובה|עמק|גלבוע|טל העמק|פטה|בולגרית|צפתית|לאבנה|מסקרפונה|ריקוטה|חלב סויה|שקדים משקה|שיבולת שועל משקה|גמדים|סימפוניה|גביע|דניאלה|מולר|פרופ|מעדן|נפוליאון|פרילי`,
    (name) => SNACK_SELF_DECLARE.test(name) || /עוג[הת]|עוגות|עוגי /.test(name)), // "עוגת גבינה" (cheesecake) is a cake first, like every other עוגה
  wordRule('מאפים ולחם',
    "לחם|פיתה|פיתות|חלה|לחמני|בגט|טורטי|קרואסון|עוגה|עוגת|עוגיות|מאפה|בורקס|ג'חנון|מלאווח|פיצה|בצק|טוסט|קרקר|פריכיות|לחמית|ביסקוויט|וופל",
    (name) => SNACK_SELF_DECLARE.test(name)), // "חטיף...בטעם פיצה"/"צ'יטוס איקס עיגול פיצה" are pizza-flavoured snacks, not pizza
  wordRule('חטיפים וממתקים',
    `במבה|ביסלי|אפרופו|תפוצ'יפס|צ'יפס|חטיף|שוקולד|ממתק|סוכרי|מסטיק|ופל|טופי|קליק|פסק זמן|כיף כף|מקופלת|פרה|עלית|שטראוס חטיף|תפוציפס|דוריטוס|צ'יטוס|פופקורן|בוטנים|פיצוח|אגוז|שקד|קשיו${NOT_HEB_AHEAD}|פיסטוק|גרעינ|תמר|צימוק|פירות יבשים|חלבה|גלידה|שלגון|ארטיק|קרמבו|נוגט|מרשמלו|ג'לי|לקריץ|ערגליות|נשנוש|בייגלה|לעיסה|בפלות|חטיפ|טוגנ|מצופ|מקלות|תפוחוני|גודיז|גלי${NOT_HEB_AHEAD}|כיפלי|פוף${NOT_HEB_AHEAD}|קראנצ|ציפס|בזוקה|ללתס`,
    (name) => {
      if (/משקה/.test(name)) return true; // "משקה שקדים"/"משקה GO בטעם קפה אגוזי לוז" are drinks, not a nut snack
      if (NON_FOOD_SIGNAL.test(name)) return true; // "ת.רחצה שקדים" (almond-scented body wash)
      if (/מקלות אוזניים|מקלות ניקוי/.test(name)) return true; // cotton swabs, not candy sticks
      if (/קפוא|מוקפא/.test(name)) return true; // frozen (fries, frozen corn) belongs with the frozen/deli bucket
      return false;
    }),
  wordRule('משקאות',
    `קולה|קוקה|פפסי|ספרייט|פאנטה|מים${NOT_HEB_AHEAD}|מים מינרל|סודה|מיץ|משקה|בירה|יין|יינות|וודקה|ויסקי|עראק|ליקר|שנדי|תה${NOT_HEB_AHEAD}|קפה|נס קפה|אספרסו|קפסול|שוקו|לימונדה|פריגת|טמפו|יפאורה|נביעות|עין גדי|מי עדן|נסטי|פיוז|אנרגיה|מונסטר|רד בול|פרימור|תפוזינה|סיידר|נקטר|קרליטו|מאלט|פחית|ספרינג|ווטר|סירופ|ויטמינצ|ג'?אמפ|גאמפ|בריזר|סומרסבי|מוגז|חליט|סמוזי|שוופס|וואטר|פרוט ?& ?ווג|פרוט ווג`,
    (name) => {
      if (NON_FOOD_SIGNAL.test(name)) return true; // hair/skin products, not a beverage
      if (/כפי(ו)?ת|כוסות/.test(name)) return true; // espresso spoons/cups, not the coffee itself
      return false;
    }),
  wordRule('שימורים',
    `שימור|טונה|סרדינ|רסק|טחינה|חומוס|פול${NOT_HEB_AHEAD}|אפונה|תירס|זיתים|מלפפון חמוץ|חמוצים|רוטב|קטשופ|מיונז|חרדל|ריבה|דבש|ממרח|חמאת בוטנים|נוטלה|קונפיטור|שקשוקה|לפתן|תמצית|אורז|פסטה|ספגטי|אטריות|פתיתים|קוסקוס|בורגול|קמח|סוכר|מלח|שמן|חומץ|תבלין|פלפל שחור|כמון|פפריקה|כורכום|אבקת|פירורי|קורנפלור|שמרים|סולת|עדשים|שעועית|חומוס יבש|גריסים|קינואה|צ'יה|שיבולת שועל|דגני|קורנפלקס|גרנולה|מוזלי|שקדי מרק|מרק${NOT_HEB_AHEAD}|אבקת מרק|קרוטונ|בחומץ|במלח|כתוש|מחית|ריבת|בסירופ|כבוש|מרוסק|חתוכות|קוביות|פולפה|מטבוחה|איולי|יכין|וילי ?פוד|בית השיטה|דורות|מטרנה|אבקה|רביולי|ניוקי|נודלס|תיבולית|קנור|רכז|תרכיז|צנצנת|שפופרת|קלוי|שיפקה|קבוצת יבנה|ויליגר`,
    (name) => NON_FOOD_SIGNAL.test(name) || TABLEWARE_SIGNAL.test(name)),
  wordRule('ניקיון וטואלטיקה',
    `נייר טואלט|טואלט|מגבת|מגבונ|נייר סופג|טישו|סבון|שמפו|מרכך|ג'ל רחצה|דאודורנט|משחת שיניים|מברשת|חוט דנטלי|מי פה|תחבושת|טמפון|פד${NOT_HEB_AHEAD}|חיתול|מטלית|אקונומיקה|כלור|ניקוי|אבקת כביסה|ג'ל כביסה|מרכך כביסה|מדיח|כלים|ספוג|סקוטש|שקיות (אשפה|גדולות|גופייה|מזון|ענקיות|צליה|קרח)|שקית (אשפה|זיפר|בד|ענק)|נייר אפייה|נייר כסף|ניילון|קיסמים|מפית|כוסות חד|צלחות חד|סכו"?ם|גפרור|מצית|נר${NOT_HEB_AHEAD}|סוללה|מטהר אוויר|קוטל|חרקים|קרם|תחליב|לק${NOT_HEB_AHEAD}|מסיר|תמרוק|בושם|אפטר|גילוח|תער${NOT_HEB_AHEAD}|קצף|ג'אוול|סנו`),
  wordRule('מעדנייה',
    `סלט${NOT_HEB_AHEAD}|סלטים|מטבל|חומוס אחלה|צנוברים|טחינה מוכנה|ממולא|פסטרמה|נקניקיות|קבנוס|סלמי|מעושן|הרינג|מלוח|דגים מלוחים|קוויאר|זיתים מעורב|טאפנד|פלאפל|לאפה|בשר מעובד|מוכן|ארוחה|מנה|טורטיה מוכנה|פיצה קפואה|קפוא|קפואים|פירורי|קציצ|שווארמה|מוקפא|סנפרוסט|סלטי|צבר|גיוזה|סיגרים`,
    (name) => TABLEWARE_SIGNAL.test(name)), // "צלחות מנה עיקרית" is disposable plates, not a prepared dish
  wordRule('ירקות ופירות',
    "עגבני|מלפפון|תפוח|בננ|אבוקדו|לימון|בצל|גזר|פלפל|תפו\"?א|חסה|כרוב|אבטיח|(?<!בית )מלון|ענב|תות|אגס|אפרסק|שזיף|נקטרינ|קלמנטינ|תפוז|אשכולית|קישוא|חציל|בטטה|פטרוזיליה|כוסבר|שמיר|נענע|פטרי|תירס טרי|רימון|מנגו|קיווי|אננס|דלעת|סלרי|שום|ג'ינג'ר|צנון|סלק|שעועית ירוקה|במיה|ארטישוק"),
];

/** Anything with a processing/packaging word is not fresh produce, whatever fruit it names. Applied both to the
 * keyword rule above and (in categorize()) to a concept that resolves to ירקות ופירות: concepts like "tomato",
 * "lemon-fresh" or "mushroom" match canned/chopped/dried/flavoured/cooked forms of the same word too
 * ("שלישיית עגבניות קצוצ", "מנגו מיובש", "פסטו כוסברה", "תיבולית פטריות קנור", "גלידה...תות לימון",
 * "עוגת מאפין תפוז"). A bare percentage is included too: fresh produce is never sold "3%" - that is always a
 * fat-content dairy label riding along on a fruit/veg word ("מולר פרופ לימון 3%", "סימפוניה גבינה...בצל...5%"). */
const PROCESSED = /בטעם|טעם |סירופ|מחית|קפוא|מוקפא|כבוש|בסירופ|ריב[הת]|חטיפ|טוגנ|מצופ|גומי|מ"ל|ליטר|בקבוק|פחית|קופס|קלוי|מטוגן|רצועות|שלישיית|רביעיית|מארז|רכז|תרכיז|צנצנת|שפופרת|במילוי|קצוצ|חתוכ|מיובש|ממתק|כיסונ|קוביות|ממרח|רוטב|פרוט ?(&|אנד) ?ווג|גלידה|סרבט|פסטה|פסטו|תיבולית|עוג[הת]|מאפין|מרק|נמס בכוס|מנה חמה|שימור|לפתן|פריפלצת|מיונז|סלט|ברוסקט|חטיף|קאיין|טחון|מעדן|לחם|בריזר|צ'?יפס|שמן|איולי|משקה|\d\s*%/;

// A concept can also mismatch onto a cosmetic/cleaning product riding the same word ("מסכת מלפפון ותה ירוק" is a
// face mask, not fresh cucumber; "אג'קס...בניחוח לימון" is a floor cleaner, not fresh lemon; "מלח למדיח" is
// dishwasher salt with a "salt" concept, not a pantry item) - so NON_FOOD_SIGNAL gates every *non-cleaning*
// concept category (a genuine ניקיון וטואלטיקה concept is expected to contain these very words). The same thing
// happens both directions between drinks and snacks: a "popcorn"-concept product can actually be a popcorn-
// *flavoured* milk drink ("טרה משקה חלב בטעם פופקורן"), and a "chocolate-milk-drink"-concept product can actually
// be a cereal bar ("חטיף דגנים שוגי שוקו") - so "משקה" and a snack self-declaration each gate every concept
// category that isn't already their own. PROCESSED (fresh-vs-processed) additionally gates ירקות ופירות.
function conceptRejected(name, conceptCategory) {
  if (conceptCategory !== 'ניקיון וטואלטיקה' && NON_FOOD_SIGNAL.test(name)) return true;
  if (conceptCategory !== 'משקאות' && /משקה/.test(name)) return true;
  if (conceptCategory !== 'חטיפים וממתקים' && SNACK_SELF_DECLARE.test(name)) return true;
  if (conceptCategory === 'ירקות ופירות' && PROCESSED.test(name)) return true;
  return false;
}

export function categorize(name, conceptId = null) {
  const concept = conceptId ? conceptById(conceptId) : null;
  const conceptCategory = concept?.category && CATEGORIES.includes(concept.category) ? concept.category : null;
  if (conceptCategory && !conceptRejected(name, conceptCategory)) {
    return conceptCategory;
  }
  for (const [category, re, exclude] of CATEGORY_RULES) {
    if (!re.test(name)) continue;
    if (exclude?.(name)) continue;
    if (category === 'ירקות ופירות' && (PROCESSED.test(name) || NON_FOOD_SIGNAL.test(name))) continue;
    return category;
  }
  return 'כללי';
}
export const ICONS = { 'ירקות ופירות': '🥬', 'בשר ועוף': '🍗', 'חלב וביצים': '🥛', 'מאפים ולחם': '🍞', 'חטיפים וממתקים': '🍫', 'משקאות': '🥤', 'שימורים': '🥫', 'ניקיון וטואלטיקה': '🧴', 'מעדנייה': '🧀', 'כללי': '🛒' };

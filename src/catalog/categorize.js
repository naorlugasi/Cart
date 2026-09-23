/**
 * Product categories for the UI (13 fixed categories, docs/PIPELINE-CONTRACT.md §2.1: the ten of 20.9 plus
 * תינוקות, בעלי חיים and בית וכלים, opened 23.9 because every chain shelves those groups in departments of their own).
 *
 * The price files carry NO category at all, so this is ours. Three signals, in order:
 *   1. the product's own reviewed label (config/categories/labels.json, docs/CATEGORIES.md);
 *   2. the product's concept (config/concepts/*.json) - every concept declares its category;
 *   3. keyword rules on the name (first matching rule wins, produce last: fruit words are also flavours).
 * 2 and 3 only ever decide for a product that appeared after the review - a GTIN new to today's price files.
 */
import { conceptById } from './concepts.js';
import { categoryLabel } from './categoryLabels.js';

/** Category rules: first matching keyword wins (order matters). Produce is last on purpose: fruit and vegetable
 * words are also flavours ("יוגורט תות", "אקונומיקה בריח לימון"), so a product-type word must get the first say. */
export const CATEGORIES = ['ירקות ופירות', 'בשר ועוף', 'חלב וביצים', 'מאפים ולחם', 'חטיפים וממתקים', 'משקאות', 'שימורים', 'ניקיון וטואלטיקה', 'מעדנייה', 'תינוקות', 'בעלי חיים', 'בית וכלים', 'כללי'];

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
// Hebrew glues its one-letter prefixes onto the word (ל+מדיח = "למדיח", ב+חומץ = "בחומץ", ה+לחם = "הלחם"),
// so requiring "nothing but a non-letter before the keyword" loses every prefixed form. The boundary therefore
// accepts either the start of a word or exactly one prefix letter (בהוכלמש) that itself starts a word.
const START = `(?:(?<![${HEB}])|(?<=(?<![${HEB}])[\u05d1\u05d4\u05d5\u05db\u05dc\u05de\u05e9]))`;
function wordRule(category, source, exclude = null) {
  return [category, new RegExp(`${START}(?:${source})`), exclude];
}

// ---------------------------------------------------------------------------
// Cross-cutting signals. A Hebrew product name is a bag of words with no grammar - brand, flavour, size and
// packaging all sit side by side - so most mistakes come from a word that belongs to the *flavour* or the
// *ingredient* stealing the department. These four guards are what stops that, and they are applied both to
// the keyword rules below and to a concept that matched the same way.

// Toiletry/cleaning/laundry context that steals a food word used as an ingredient or a scent:
// "קרם ידיים מועשר בשמן" (hand cream, not oil), "אבקת טלק" (talc, not a food powder), "מרכך כביסה...תמצית
// שיבולת שועל" (oat-scented softener), "קרפור מלח למדיח כלים" (dishwasher salt). The Dove line is spelled out
// in full ("דאב סטיק", "דאו' ספריי") on purpose: bare "דאו"/"סטיק" also sit inside "דאווט" (a rice brand)
// and "סטיקס" (a snack), and a guard that fires on those throws real food out of its department.
const NON_FOOD_SIGNAL = /מדיח|כביסה|מייבש|מבשם|מרכך|דאודורנט|דאב סטיק|דאב ספריי|דאב רול|דאו'|רחצה|תחליב|גילוח|לשיער|שיער|לעור|קרם ידיים|קרם גוף|קרם פנים|קרם לחות|תמרוק|בושם|רול און|חוחובה|לפנים|איפור|טלק|ניקוי|מסכ(ה|ת)|הברקה|בניחוח/;

// A name that opens by declaring itself a snack beats a meat/dairy/bakery word inside it: "חטיפי עוף" is a
// chicken-*flavoured* puff, "חטיף חיטה בטעם שווארמה" is not lamb, "חטיפי פיצה גבינה" is not cheese.
const SNACK_SELF_DECLARE = /חטיפ|חטיף|צ'יטוס|ציטוס|דוריטוס|ביסלי|במבה/;

// Disposables are named after the food they are meant to hold, and they are NOT that food: "קעריות מרק" are
// soup bowls, "לפתניה"/"ליפתניות" are compote cups, "גביע גלידה" can be an empty cone sleeve, "צלחות מנה
// עיקרית" are dinner plates (docs/CATEGORIES.md, "הכרעות שחוזרות").
const DISPOSABLE_SIGNAL = /חד ?פעמי|חד"פ|קעריות|צלחות|מזלגות|כפיות חד|כפות חד|סכו"?ם|קשיות|קשים|מפיות|ליפתני|לפתני|תבניות/;

// A dry mix is a pantry item, never the thing it makes: "אבקת פודינג"/"אבקה להכנת ג'לי" is not a dairy dessert,
// "תערובת לאפיית עוגה" is not a cake, "אבקת מרק" is not soup (docs/CATEGORIES.md).
const POWDER_MIX = /אבקה|אבקת|להכנת|תערובת|אינסטנ|מיידי|תמצית|שקיקי/;

// Baby-scented household products stay household: laundry, floor and air care, general-purpose and toilet
// wipes, make-up wipes, toothpaste; adult diapers are not the baby aisle either.
const BABY_NOT = /כביסה|כבי$|לבגדי|פרסיל|מקסימה|בדין|כביסכל|TNX|תינוקלין|רצפ|מבשם|כתמים|ניקוי|מדיח|מייבש|טואלט|איפור|שעווה|שיניים|סבון ידיים|בדים|משטחים|למבוגרים|מים חמים|פותחן|דאודורנט/;

const RAW_MEAT = /טרי|נא |קפוא|שלם|פרוס|נתח|טחון|שניצל|חזה|שוק|כרעיים|כנפיים|צלעות|אנטריקוט|סטייק|פילה/;

export const CATEGORY_RULES = [
  // 0. The two aisles every chain keeps apart (23.9): pet food and the baby aisle. Before the toiletries rule,
  //    because "שמפו לתינוק" and "מגבונים לתינוק" carry toiletry words - but baby-scented laundry, floor and air
  //    products are still cleaning products, and cotton buds are only baby items when the name says so.
  wordRule('בעלי חיים',
    `לחתול|לחתולים|חתולים|לכלב|לכלבים|כלבים|פריסקיז|פנסי פיסט|פרמיו(?!ם)|דוגלי|בונזו|פדיגרי|וויסקס|רויאל קנין|פרו ?פלאן|לבעלי חיים|חול מתגבש|מזון יבש`,
    (name) => /המחייך|לשונות חתול/.test(name)),
  wordRule('תינוקות',
    `לתינוק|תינוקות|תינוק${NOT_HEB_AHEAD}|לפעוט|פעוטות|מטרנה|סימילאק|נוטרילון|תמ"ל|תרכובת מזון|גרבר|חטיפטף|פרינוק|פריפלצת|האגיס|פמפרס|בייביסיטר|במבינו|טיטולים|חיתול|החתלה|מוצץ|נשכנ|כוס הפלא|קערת האכלה|ג'ונסונס|קמיל בלו|טלק${NOT_HEB_AHEAD}|ניו ?בורן|בקבוק לתינוק|בקבוק לגדולים|כפיות סיליקון|בייבי(?! בל)`,
    (name) => BABY_NOT.test(name)),
  // 1. Not food at all. First, because a cleaning or cosmetic product carries food words freely
  //    ("סבון בניחוח לימון", "מרכך כביסה שיבולת שועל") while food never carries cleaning words.
  wordRule('ניקיון וטואלטיקה',
    `אקונומיקה|כלור|סנו${NOT_HEB_AHEAD}|סנובון|בדין|וניש|פרסיל|אריאל|אסטוניש|ברזלית|ג'?ל${NOT_HEB_AHEAD}|ג'ל |ג'ילט|אינטואישן|או דה קלון|אטמי אוזניים|מקלות אוזניים|צמרוני|פחמים|פחם${NOT_HEB_AHEAD}|שיפודי|מדליק פחמים|נוזל להדלקת|דלי${NOT_HEB_AHEAD}|דליים|יעה|מגב${NOT_HEB_AHEAD}|כף אשפה|פומפה|מקל מחוזק|מקל עץ|סטנסיל|תבנ|תב\\.|דאו(?!ו)|דאב${NOT_HEB_AHEAD}|וזלין|רצפה|מסכ(?:ה|ת)|מיקרופייבר|מקרופיבר|קרצוף|ספוגית|מפות|מפת|שקיות(?! ?(תה|קפה))|שקית(?! ?(תה|קפה))|3 ?ב ?1|לגבר${NOT_HEB_AHEAD}|אג'קס|ג'אוול|כביסה|מדיח|נוזל כלים|לכלים|ניקוי|מנקה|מטהר|קוטל|חרקים|ספוג|סקוטש|מטלית|מטליות|מגב${NOT_HEB_AHEAD}|מגבונ|נייר טואלט|טואלט|נייר סופג|מגבות נייר|טישו|ממחט|סבון|שמפו|ג'ל רחצה|רחצה|דאודורנט|גילוח|תער${NOT_HEB_AHEAD}|אפטר|משחת שיניים|מברשת שיניים|חוט דנטלי|מי פה|שפתון|לק${NOT_HEB_AHEAD}|אצטון|איפור|קרם ידיים|קרם גוף|קרם פנים|קרם לחות|קרם הגנה|תחליב|בושם|תמרוק|חיתול|טמפון|תחבוש|מגן יומי|פד${NOT_HEB_AHEAD}|פדים|פלסטר|אגד${NOT_HEB_AHEAD}|סולל|נר${NOT_HEB_AHEAD}|נרות|נרונים|גפרור|מצית|שקיות אשפה|שקית אשפה|נייר אפייה|נייר כסף|רדיד|ניילון נצמד|אלומיניום|כפפות|חד ?פעמי|חד"פ|קשיות|קשים לשתיה|מפיות|קעריות|צלחות|מזלגות|כפיות חד|סכו"?ם|ליפתני|לפתני`,
    // Steel cutlery and a barbecue grill carry disposable-aisle words (מזלגות, פחמים) but are housewares (rule 2).
    (name) => /נירוסטה|^מנגל/.test(name)),
  // 2. What is left that is not food: supplements, over-the-counter health, optics.
  wordRule('כללי',
    `ויטמין|תוסף תזונה|אומגה|מגנזיום|פרוביוטי|משקפי|מד חום|מד לחץ|אינהלציה|ממתיק`),
  // 3. Drinks - anything you drink or dilute to drink, coffee and tea included. A milk-based drink is left to
  //    the dairy rule ("שוקו תנובה", "קפה קר בבקבוק"), which is where the shopper looks for it.
  wordRule('משקאות',
    `קולה|קוקה|פפסי|ספרייט|פאנטה|מים${NOT_HEB_AHEAD}|מים מינרל|סודה|מיץ|נקטר(?!ינ)|תרכיז|רכז${NOT_HEB_AHEAD}|סירופ|משקה|בירה|יין${NOT_HEB_AHEAD}|יינות|וודקה|ויסקי|עראק|ליקר|טקילה|ג'ין${NOT_HEB_AHEAD}|שנדי|תה${NOT_HEB_AHEAD}|חליט|צאי|קפה|אספרסו|קפסול|לימונדה|פריגת|טמפו|יפאורה|נביעות|עין גדי|מי עדן|נסטי|פיוז|אנרגיה|מונסטר|רד בול|פרימור|תפוזינה|סיידר|קרליטו|מאלט|פחית|ספרינג|ווטר|וואטר|ויטמינצ|בריזר|סומרסבי|מוגז|סמוזי|שוופס`,
    (name) => {
      if (NON_FOOD_SIGNAL.test(name)) return true;
      if (/מיץ לימון|לימון משומר/.test(name)) return true; // a cooking acid, shelved next to the vinegar
      // a milk drink is a dairy-aisle product (docs/CATEGORIES.md "הכרעות שחוזרות")
      if (/משקה חלב|שוקו|קפה קר|אייס קפה|מילקשייק|חלב(?!ה)|יוגורט|אקטימל|יופלה|מולר|דנונה|אירן|כפיר/.test(name) && !POWDER_MIX.test(name)) return true;
      return false;
    }),
  // 4. The deli counter and the freezer, before raw meat: a sausage or a smoked fish is a deli product even
  //    though its name says meat or fish.
  wordRule('מעדנייה',
    `פסטרמה|סלמי|קבנוס|נקניק|מעושן|מעושנת|הרינג|איקרה|קוויאר|טופו|טבעול|סייטן|פלאפל|מטבל|ממולא|מנה מוכנה|ארוחה מוכנה|גיוזה|סושי|קובה|כיסונ|בלינצ|קציצ|שווארמה|רוסטביף|סלט${NOT_HEB_AHEAD}|סלטי|סלטים|אחלה|צבר${NOT_HEB_AHEAD}|שמיר גורמה|מטבוח|במיונז|גוואקמול|סקורדיל|צבר${NOT_HEB_AHEAD}|על האש|פלפלים קלויים|טרי(?:ות|ים)|קפוא|קפואה|קפואים|מוקפא|מוקפאת|סנפרוסט`,
    (name) => {
      if (DISPOSABLE_SIGNAL.test(name) || /רוטב|קרוטונ|תיבול|מיונז לסלט/.test(name)) return true;
      if (/בצק|בורקס|פיצה|מאפה|לחם|לחמני|קרואסון|עוג[הת]|מלאווח|ג'חנון/.test(name)) return true; // frozen dough is bakery
      if (/גלידה|שלגונ|ארטיק|קרמבו|קרחון/.test(name)) return true; // ice cream is a sweet
      // frozen *raw* meat or fish stays in its own department; only the fried/ready forms are deli
      if (/עוף|בשר|דג${NOT_HEB_AHEAD}|דגים|סלמון|שניצל|קבב|המבורגר|אנטריקוט|כרעיים|חזה/.test(name)
        && !/מטוגן|נאגטס|מוכן|קריספי|אצבעות/.test(name) && !/נקניק|פסטרמה|סלמי|קבנוס|מעושן/.test(name)) return true;
      return false;
    }),
  // 5. Raw meat, poultry and fish.
  wordRule('בשר ועוף',
    `עוף|הודו|בקר${NOT_HEB_AHEAD}|בשר|כבש|טלה|שניצל|קבב|המבורגר|סטייק|אנטריקוט|צלעות|כרעיים|שוקיים|כנפיים|פרגית|נתחי|כבד${NOT_HEB_AHEAD}|דג${NOT_HEB_AHEAD}|דגים|סלמון|אמנון|בורי|דניס|לברק|נסיכה|פילה|טחון`,
    (name) => {
      if (SNACK_SELF_DECLARE.test(name)) return true;
      if (/מרק|נודלס|איטריות|תיבול|תבול|דגש טעם|נמס בכוס|רוטב/.test(name)) return true; // the meat word is the flavour
      if (/טונה|סרדינ|שימור/.test(name)) return true; // canned fish is pantry
      const strongMeatWord = /עוף|בשר|שניצל|קבב|המבורגר|סטייק|אנטריקוט|צלעות|כרעיים|שוקיים|כנפיים|פרגית|נתחי|כבד|דג|סלמון|פילה/.test(name);
      if (!strongMeatWord && /גבינ|יוגורט|חלב(?!ה)|חלומי|קממבר/.test(name)) return true; // "מחלב בקר" is cheese
      if (!strongMeatWord && /טחון/.test(name) && !/בקר|כבש/.test(name)) return true; // ground spice/coffee
      if (/נאגטס|מטוגן|מוכן|ארוחה/.test(name) && !RAW_MEAT.test(name)) return true; // fried-and-frozen is deli
      return false;
    }),
  // 6. The dairy fridge, including plant milks and the ready-to-eat desserts - but never a dry mix.
  wordRule('חלב וביצים',
    `חלב(?!ה)|גבינ|קוטג|יוגורט|שמנת|חמאה|מרגרינה|ביצים|אשל|גיל${NOT_HEB_AHEAD}|מעדן|פודינג|מילקי|דנונה|יופלה|אקטימל|קפיר|מוצרלה|צהובה|עמק${NOT_HEB_AHEAD}|גלבוע|טל העמק|פטה${NOT_HEB_AHEAD}|בולגרית|צפתית|לאבנה|מסקרפונה|ריקוטה|שוקו|אלפרו|גמדים|סימפוניה|דניאלה|מולר|פרופ|נפוליאון|פרילי|יטבתה|קצפת`,
    (name) => {
      if (SNACK_SELF_DECLARE.test(name)) return true;
      if (POWDER_MIX.test(name)) return true; // "אסם פודינג אינסטנט", "אבקת מעדן" - a pantry mix
      // "שוקולד חלב", "בפלות...קרם חלבי", "עוגיות שוקוצ'יפס": the milk word is an ingredient of a sweet.
      // Only a word that names an actual dairy product keeps it here.
      if (/שוקולד|ופל|וופל|בפלות|אפיפיות|ביסקוויט|עוגי|בונבונ|חלווה|חלבה|בראוני|טופי|סוכריות|מסטיק|קרמבו|מרשמלו/.test(name)
        && !/גבינ|יוגורט|קוטג|שמנת|חמאה|מעדן|גביע|מילקי|דנונה|יופלה|אקטימל|לאבנה|קפיר|ביצים|מרגרינה|מוצרלה|צהובה|פטה|בולגרית|צפתית|קצפת/.test(name)) return true;
      if (/עוג[הת]|עוגות|עוגי /.test(name)) return true; // cheesecake is a cake
      if (/גלידה|שלגונ|ארטיק|קרמבו/.test(name)) return true; // ice cream is a sweet
      return false;
    }),
  // 7. Bread and pastry, fresh or frozen.
  wordRule('מאפים ולחם',
    `לחם|פיתה|פיתות|חלה${NOT_HEB_AHEAD}|לחמני|לחמית|בגט|טורטי|לאפה|קרואסון|עוגה|עוגת|עוגות|מאפה|מאפין|בורקס|ג'חנון|מלאווח|פיצה|בצק|טוסט|מצה${NOT_HEB_AHEAD}|מצות|קרקר|פריכיות|רוגלך|שטרודל|דונאט|סופגני|באגט`,
    (name) => SNACK_SELF_DECLARE.test(name) || /פירור/.test(name)), // "פירורי לחם" is a pantry item
  // 8. Snacks, sweets and ice cream.
  wordRule('חטיפים וממתקים',
    `במבה|ביסלי|אפרופו|תפוצ'יפס|צ'יפס|חטיף|שוקולד|ממתק|סוכרי|מסטיק|ופל|וופל|טופי|קליק|פסק זמן|כיף כף|מקופלת|עלית|תפוציפס|דוריטוס|צ'יטוס|נאצ'וס|פופקורן|בוטנים|פיצוח|אגוז|שקד|קשיו${NOT_HEB_AHEAD}|פיסטוק|גרעינ|תמר|צימוק|פירות יבש|חלבה|גלידה|שלגונ|ארטיק|קרמבו|נוגט|מרשמלו|ג'לי|לקריץ|ערגליות|נשנוש|בייגלה|לעיסה|בפלות|חטיפ|טוגנ|מצופ|תפוחוני|גודיז|כיפלי|פוף${NOT_HEB_AHEAD}|קראנצ|ציפס|בזוקה|עוגיות|עוגיה|ביסקוויט|מקרונ|בונבונ|חלווה|גומי|מנטוס|טיק טק|אם אנד אמס|טים טם|קרמוגית|בישקוטים|אפיפיות|בראוני|דרז'ה|מקלות מלוחים|חיספוסים|לחמית שוקולד`,
    (name) => {
      if (/משקה/.test(name)) return true;
      if (NON_FOOD_SIGNAL.test(name)) return true;
      if (POWDER_MIX.test(name)) return true; // "אבקה להכנת ג'לי" is a pantry mix
      if (/מקלות אוזניים|מקלות ניקוי/.test(name)) return true;
      if (/גרנולה|דגני|קורנפלקס|מוזלי|פירורי|פירורית|מוסקט/.test(name)) return true; // cereal shelf / breadcrumbs / a spice
      if (/קפוא|מוקפא/.test(name) && !/גלידה|שלגונ|ארטיק/.test(name)) return true;
      return false;
    }),
  // 9. Fresh produce - last among the food rules, because every fruit and vegetable word is also a flavour.
  // Housewares, textile, furniture, tools, electronics: the home department (23.9; Shufersal "מטבח, אירוח",
  // "חדר שינה", "DIY", "אלקטרוניקה", Rami Levy "הכל לבית / מוצרי חשמל"). Cleaning tools stay in rule 1. Placed
  // after every food rule: a food name may carry a houseware word ("קציצות עוף בסיר 600 גרם", "עוגת שיש") while a
  // houseware name almost never carries a food-type word.
  wordRule('בית וכלים',
    `מזרון|מזרן|כרית|שמיכ|סדין|ציפה|ציפית|מיטה|מגבת${NOT_HEB_AHEAD}|מגבות(?! נייר)|גרבי|גרביונ|חולצ|תיק${NOT_HEB_AHEAD}|תיק קניות|שקית בד|עגלת|צידנית|מטען|סוללת מטען|כבל|אוזני|נורה|פנס|מברג|סולם|צעצוע|משחק|עציץ|סיר${NOT_HEB_AHEAD}|מחבת|מסחטה|קומקום|מיכלי אחסון|קופסאות אחסון|קופסת אחסון|כוורת|אטבי|שולחן|כיסא|כסא|מזלג${NOT_HEB_AHEAD}|מזלגות|כפיות|כפות${NOT_HEB_AHEAD}|סכינים|סכין${NOT_HEB_AHEAD}|מלקחיים|פותחן|מחלק מנות|מייבש כלים|כירת גז|כיריים|מנגל|סוכה|פלנצ|טוסטר|מיקסר|בלנדר|סופר גלו|דבק`),
  wordRule('ירקות ופירות',
    `עגבני|מלפפון|תפוח|בננ|אבוקדו|לימון|בצל|גזר|פלפל|תפו"?א|חסה|כרוב|אבטיח|(?<!בית )מלון|ענב|תות|אגס|אפרסק|שזיף|נקטרינ|קלמנטינ|תפוז|אשכולית|קישוא|חציל|בטטה|פטרוזיליה|כוסבר|שמיר|נענע|פטרי|תירס טרי|רימון|מנגו|קיווי|אננס|דלעת|סלרי|שום|ג'ינג'ר|צנון|סלק|שעועית ירוקה|במיה|ארטישוק|בזיליקום|תרד|רוקט|מיקס עלי`),
  // 10. Everything else edible: the pantry.
  wordRule('שימורים',
    `שימור|טונה|סרדינ|רסק|טחינה|חומוס|פול${NOT_HEB_AHEAD}|אפונ|תירס|זיתים|מלפפון חמוץ|חמוצים|רוטב|קטשופ|מיונז|חרדל|ריבה|דבש|סילאן|ממרח|חמאת בוטנים|נוטלה|קונפיטור|שקשוקה|לפתן|תמצית|אורז|פסטה|ספגטי|אטריות|פתיתים|קוסקוס|בורגול|קמח|סוכר|מלח|שמן|חומץ|תבלין|פלפל שחור|כמון|פפריקה|כורכום|אבקת|פירורי|קורנפלור|שמרים|סולת|עדשים|שעועית|גריסים|קינואה|צ'יה|שיבולת שועל|דגני|קורנפלקס|גרנולה|מוזלי|שקדי מרק|מרק${NOT_HEB_AHEAD}|קרוטונ|בחומץ|במלח|כתוש|מחית|בסירופ|כבוש|מרוסק|פולפה|חתוכ|קוביות|ריב[הת]|בחומץ|משומר|מיץ לימון|גריס|חיטה|גרישה|זרע|פשתן|שומשום|כוסמת|שיפון|סובין|דוחן|ברנפלקס|מוסקט|יבש|חזרת|תאנים|פרג${NOT_HEB_AHEAD}|טפיוק|מייפל|מטבוחה|איולי|יכין|וילי ?פוד|בית השיטה|דורות|רביולי|ניוקי|נודלס|תיבולית|קנור|צנצנת|קלוי|קקאו|שוקוצ'יפס|אפייה|להכנת|תערובת|אינסטנ|אורגנו|רוזמרין|טימין|זעתר|סומק|הל${NOT_HEB_AHEAD}|ציפורן|מיורן|טרגון|בזיליקום יבש|צ'ריוס|האני נאט|נסקוויק|ריזוטו|פריקה|פירה|מייפל|טפיוקה|ג'לטין|סודה לשתייה|אבקת אפי`,
    (name) => NON_FOOD_SIGNAL.test(name) || DISPOSABLE_SIGNAL.test(name)),
];

/** Anything with a processing/packaging word is not fresh produce, whatever fruit it names. Applied both to the
 * keyword rule above and (in categorize()) to a concept that resolves to ירקות ופירות: concepts like "tomato",
 * "lemon-fresh" or "mushroom" match canned/chopped/dried/flavoured/cooked forms of the same word too
 * ("שלישיית עגבניות קצוצ", "מנגו מיובש", "פסטו כוסברה", "תיבולית פטריות קנור", "גלידה...תות לימון",
 * "עוגת מאפין תפוז"). A bare percentage is included too: fresh produce is never sold "3%" - that is always a
 * fat-content dairy label riding along on a fruit/veg word ("מולר פרופ לימון 3%", "סימפוניה גבינה...בצל...5%"). */
const PROCESSED = /יבש|מתבל|חומץ|משומר|מיץ|נקטר(?!ינ)|בטעם|טעם |סירופ|מחית|קפוא|מוקפא|כבוש|בסירופ|ריב[הת]|חטיפ|טוגנ|מצופ|גומי|מ"ל|ליטר|בקבוק|פחית|קופס|קלוי|מטוגן|רצועות|שלישיית|רביעיית|מארז|רכז|תרכיז|צנצנת|שפופרת|במילוי|קצוצ|חתוכ|מיובש|ממתק|כיסונ|קוביות|ממרח|רוטב|פרוט ?(&|אנד) ?ווג|גלידה|סרבט|פסטה|פסטו|תיבולית|עוג[הת]|מאפין|מרק|נמס בכוס|מנה חמה|שימור|לפתן|פריפלצת|מיונז|סלט|ברוסקט|חטיף|קאיין|טחון|מעדן|לחם|בריזר|צ'?יפס|שמן|איולי|משקה|\d\s*%/;

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

export function categorize(name, conceptId = null, id = null) {
  // 1. the reviewed label for this exact product, when it has one (docs/CATEGORIES.md): a decision taken
  //    while looking at the product always beats a guess from the words in its name.
  const labeled = categoryLabel(id);
  if (labeled && CATEGORIES.includes(labeled)) return labeled;
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
export const ICONS = { 'ירקות ופירות': '🥬', 'בשר ועוף': '🍗', 'חלב וביצים': '🥛', 'מאפים ולחם': '🍞', 'חטיפים וממתקים': '🍫', 'משקאות': '🥤', 'שימורים': '🥫', 'ניקיון וטואלטיקה': '🧴', 'מעדנייה': '🧀', 'תינוקות': '🍼', 'בעלי חיים': '🐾', 'בית וכלים': '🏠', 'כללי': '🛒' };

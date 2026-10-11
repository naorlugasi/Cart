import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept, conceptById } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - drinks (משקאות) family-tree round. Naor: cluster first, build the tree, a flavour is a
 * kind not a leaf, size/pack/diet are not identity unless stated otherwise. Every test below is a real
 * chain name (data/prices/<chain>/catalog.full.json), one capture and one near-miss per new leaf or per rule
 * that changed. Measured with scripts/concept-round.mjs (raw names, 113,667 unique) - see the round report
 * for the full before/after table.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);
const gone = (id) => assert.equal(conceptById(id, concepts), null, `${id} should be gone`);

test('new leaf water-distilled: "מים מזוקקים" is distilled water, not mineral water and not rendered fat', () => {
  is('מים מזוקקים 2 ליטר', 'water-distilled');
  is('מים מזוקקים 4 ליטר מקסול', 'water-distilled');
  isNot('מים מינרליים', 'water-distilled');
  isNot('שומן בקר מזוקק 180 גרם', 'water-distilled');
});

test('new leaf kombucha: fermented tea, not a brewed ice tea and not a bare "קמבוצה" coincidence', () => {
  is('קמבוצה חיה - קלאסי 330', 'kombucha');
  is('משקה קמבוצה נענע אורגני 330 מ"ל', 'kombucha');
  is('משקה אורגני ע"ב קמבוצה ותה ירוק 400 מל', 'kombucha');
  isNot('תה ירוק לימונית וגינ', 'kombucha');
});

test('new leaf gin: the bottle, not "גינה" (garden), "גינס" (Guinness), ginseng soap, ginger or a flavoured chocolate/lipstick', () => {
  is("ג'ין בומביי ספייר Bombay Sapphire", 'gin');
  is('גין גורדון 700 מ"ל', 'gin');
  is('גין הנדריקס 700 מ"ל', 'gin');
  isNot('אפונת גינה מוקפאת 80', 'gin');
  isNot('בירה גינס בקבוק 330 מל', 'gin');
  isNot("אל סבון תמציות ג'ינסנג", 'gin');
  isNot("בריטוויק ג'ינג'ר אייל מוגז 200מ\"ל", 'gin');
  isNot('מולטי גין אקטיגל 50 מל', 'gin');
  isNot('שוקולד קמיל בלוך גין מריר 100 גר', 'gin');
  isNot('גין טוניק פרייטאג  330 מ"ל', 'gin');
  is("ג'ין וויטלי ניל רוברב וג'ינג'ר", 'gin'); // a ginger-flavoured gin: "גינגר" was a needless none word
});

test('new leaf rum: the bottle, not "רומא/רומני/רומו/רומבוטס/מרום/כרום" (all start the same three letters), not a baking extract, candy, lipstick or ice-cream flavour', () => {
  is('רום בקרדי לבן 1 ליטר', 'rum');
  is('רום קפטן מורגן ספייסד 750 מ"ל', 'rum');
  is('רום כהה מתובל קראקן 700 מ"ל', 'rum');
  isNot('קבב רומני 400 גר', 'rum');
  isNot('פסטה רומו פוזילי', 'rum');
  isNot('קפה רומבוטס עם פילטר מתכלה 70 גר', 'rum');
  isNot('מרום גליל מרלו סינגל 750 מ"ל', 'rum');
  isNot('כרום פיקולינט (CHROMAX) 500 מקג כשר', 'rum');
  isNot('תמצית רום 50 מ"ל', 'rum');
  isNot('שפתון סופר לסטרוס רום 08', 'rum');
  isNot('בונבוניירה שוטרס רום ליקר 150 גר', 'rum');
  isNot('אנטון ברג-מרציפן דובדבן ברום 220 גר', 'rum');
  // Opus review: the bottle's name starts with the spirit (or says "על בסיס רום"); a word-anywhere "רום" took these
  is('בקרדי מוחיטו על בסיס רום', 'rum');
  isNot('אודם רום', 'rum');
  isNot('לק ג\'ל רום', 'rum');
  isNot('צימוקים ברום', 'rum');
  isNot('קרם רום', 'rum');
});

test('new leaf ginger-ale: a non-alcoholic carbonated soda, distinct from gin ("גינגר" is not "גין") and from "בירה...ג\'ינג\'ר" ginger beer', () => {
  is("ג'ינג'ר אייל תומס הנרי", 'ginger-ale');
  is('גינגר אייל 275 מל', 'ginger-ale');
  is('סודה ג\'ינג\'ר אייל שוופס 1.5 ליטר', 'ginger-ale');
  isNot('בריטוויק בטעם בירה ג\'ינג\'ר 200מ"ל', 'ginger-ale');
});

test('soda-lemon-lime: "שוופס" alone is not lemon-lime - Sprite/7up, any drink that says lemon-lime, and Schweppes\' own lemon soda; a Schweppes strawberry-lime is a fruit soda', () => {
  is('ספרייט 1.5 ליטר', 'soda-lemon-lime');
  is('פחית שוופס מוגז למון ליים 330 מ"ל', 'soda-lemon-lime');
  is('שוופס FRUITS לימונים 330 מ"ל', 'soda-lemon-lime');
  isNot('גזוז בטעם תות ליים שוופס 4 * 330 מ"ל', 'soda-lemon-lime');
  isNot('מארז שוופס סודה 1.5 ליטר- רביעייה', 'soda-lemon-lime');
  isNot('טוניק ללא סוכר שוופס 1.5 ליטר', 'soda-lemon-lime');
  isNot('מים בטעם אננס שוופס 1.5 ליטר', 'soda-lemon-lime');
  isNot('פחית שוופס קוקטייל בטעם רום אבטיח', 'soda-lemon-lime');
});

// Opus review 11.10: Schweppes is a range brand (soda water, tonic and mixers, fruit sodas, flavoured water, ginger
// ale, a 5% alcohol cocktail can), not one product - so it is no leaf of its own (not Coca-Cola / Pepsi). Each line
// goes to the product it is, and the fruit sodas join soda-fruit-flavored with the flavour as a kind (rules.json).
test('Schweppes fruit sodas (מוגז פירות / מוגז עדין / מ.ע / a bare "שוופס <fruit>") are soda-fruit-flavored; the flavour is a kind, not a leaf', () => {
  is('גזוז בטעם תות ליים שוופס 4 * 330 מ"ל', 'soda-fruit-flavored');
  is('שוופס מוגז עדין ענבי ריזלינג 1.5 ליטר', 'soda-fruit-flavored');
  is('שוופס מ.ע אבטיח 1.5 ל\'', 'soda-fruit-flavored');
  is('שוופס אפרסק 330 מ"ל', 'soda-fruit-flavored');
  is('מוגז עדין 1.5 ליטר אננס שוופס', 'soda-fruit-flavored');
  is('שוופס ליים מוחיטו 1.5 ליטר', 'soda-fruit-flavored');
  is('משקה דל קל גמונגוסטין 330מ"ל פחית', 'soda-fruit-flavored');
  isNot('משקה מוגז על בסיס מים מינרלים בורג\'ומי', 'soda-fruit-flavored'); // naturally sparkling mineral water
  isNot("ג'ל רחצה פלמוליב ארומה סנסיישן טוניק של בוקר", 'soda-fruit-flavored');
  isNot('משקה רד בול מוגז פחית 250 מ"ל', 'soda-fruit-flavored');
});

test('new leaf tonic-water: tonic, bitter lemon and Russchian are quinine mixers - an orange soda is no stand-in for a tonic; a gin & tonic can and a Clarins toner are not tonic water', () => {
  is('מי טוניק 1.5 ליטר', 'tonic-water');
  is('בריטוויק מי טוניק מוגזים 200מ"ל', 'tonic-water');
  is('שוופס טוניק 1.5 ליטר', 'tonic-water');
  is('שוופס ביטר למון לייט 1.5ל', 'tonic-water');
  is('שוופס ראשן 1.5 ליטר', 'tonic-water');
  is('סודה טוניק 275 מ"ל', 'tonic-water');
  is('נורדיק מיסט טוניק עם נגיעות הל 1 ליטר', 'tonic-water');
  isNot('טוניק קונפורט 400 מ"ל', 'tonic-water'); // 280 NIS for 400 ml - a facial toner
  isNot('גין טוניק פרייטאג  330 מ"ל', 'tonic-water');
  is('גין טוניק פרייטאג  330 מ"ל', 'alcoholic-mixed-drink');
  is('גין טוניק רוזה פרייטאג 330 מ"ל', 'alcoholic-mixed-drink'); // was wine-rose
});

test('cocktail-rtd is keyed on the cocktail, not on two brands: the Schweppes Cocktail cans (5% alcohol), La Coq\'s truncated names and unbranded RTD cans', () => {
  is('שוופס קוקטייל מוחיטו 5% אלכוהול', 'cocktail-rtd');
  is('שוופס קוקטייל בטעם רום אננס 280 מ"ל', 'cocktail-rtd');
  is('קוקטייל רום אננס 280מל', 'cocktail-rtd');
  is('קוקטייל לה קוק מוחיט', 'cocktail-rtd');
  isNot('קוקטייל פירות 820 גרם', 'cocktail-rtd');
  isNot('נקניקיות קוקטייל 500 גרם זילבר', 'cocktail-rtd');
  isNot('שוופס מוחיטו ללא סוכר 1.5 ליטר', 'cocktail-rtd'); // the non-alcoholic mojito soda
});

test('Schweppes Water / Frut Water is flavoured water, Schweppes lemonade is lemonade, Schweppes Ginger is ginger ale', () => {
  is('שוופס ווטר אפרסק0.5', 'water-flavored');
  is('שוופס WATER ענבים 1.5 ליטר', 'water-flavored');
  isNot('מקסימה ג\'ל כביסה מרוכז Bio Cold Water', 'water-flavored');
  is('שוופס מוגז פירות לימונדה 330 מ"ל', 'soda-lemonade');
  is('שוופס לימונייד 500 מ"ל', 'soda-lemonade');
  is('שוופס גינגר 1.5 ליטר', 'ginger-ale');
  is('שוופס סודה לימון 1.5', 'water-soda');
});

test('ginger-ale also holds non-alcoholic ginger beer (a kind); Crabbie\'s alcoholic ginger beer stays beer', () => {
  is("ג'ינג'ר ביר תומס הנרי", 'ginger-ale');
  is('טרי סנטס משקה קל מוגז בירה גינגר 200 מ"ל', 'ginger-ale'); // was beer
  is('בירה קראביס גינגר 330 מ"ל ללא גלוטן', 'beer');
});

test('water-still: Aqua Nova/Panna, Evian and a plain "תריסר" (dozen) pack are still plain water, same as a Neviot/Mey Eden typo', () => {
  is('מים אקווה נובה 2 ליטר', 'water-still');
  is('מים 500 מל אוויאן', 'water-still');
  is('מים תריסר 500 מ"ל', 'water-still');
  isNot('מים מיסלריים 400 מ"ל', 'water-still');
  isNot('אקווה דה גיו ג.דאו.150מ', 'water-still');
});

test('water-flavored: "פרוט ווטר" (Froot Water) is flavoured water, not a fruit-veg blend and not juice', () => {
  is('פרוט ווטר אבטיח 1.5 ליטר', 'water-flavored');
  is('שוופס פרוט ווטר אננס 1.5 ל', 'water-flavored');
  isNot('פרוט אנד ג\'י אננס תפוח וגזר 350 מל', 'water-flavored');
});

test('oat-milk-drink: "ש.שועל" (truncated שיבולת שועל) is still oat milk, but a dairy Activia with oat flakes and an iced coffee on an oat base are not', () => {
  is('משקה ש.שועל להקצפה בריסטה 1 ליטר', 'oat-milk-drink');
  is('אוטלי משקה ש.שועל בריסטה מעודן 1 ליטר', 'oat-milk-drink');
  isNot('משקה אקטיביה עם ש.שועל', 'oat-milk-drink');
  isNot('משקה קפה קר ש.שועל230מ"ל', 'oat-milk-drink');
});

test('iced-tea: Snapple is iced tea even without the word "קר"', () => {
  is('סנאפל תה בטעם אפרסק 473 מ"ל', 'iced-tea');
  is('סנאפל תה בטעם לימון (פלסטיק) 473 מ"ל', 'iced-tea');
  isNot('תה אריסטוקרט 300 גרם', 'iced-tea');
});

test('juice brand routing: Vitaminchik and Britvic are brands, not products - their juices are juices of their fruit (same standard as Spring/Prigat)', () => {
  is("ויטמינצ'יק אננס 1 ליטר אסם", 'juice-pineapple');
  is("ויטמינצ'יק ענבים 1 ליטר", 'juice-mixed');
  is("ויטמינצ'יק פטל 1 ליטר", 'juice-mixed');
  is('בריטוויק מיץ עגבניות מתובל 200מ"ל', 'juice-tomato');
  isNot("ויטמינצ'יק אננס 1 ליטר אסם", 'juice-mixed');
});

test('juice-grape: "תירוש" alone is grape juice, but "תירוש" inside a wine name (sparkling, rosé, or plain "יין") is wine, not juice', () => {
  is('תירוש אדום לקידוש אפרת רכיבים טבעיים 1 לי', 'juice-grape');
  is('מיץ ענבים תירוש רוזה יקבי כרמל 1 ליטר', 'juice-grape');
  isNot('תירוש אדום מבעבע יקבי כרמל', 'juice-grape');
  isNot('יין תירוש אדום 100%ה טבעי 1 ליטר', 'juice-grape');
  isNot('תירוש חצי מצופה קרמל', 'juice-grape'); // the Tirosh biscuit
});

test('mogu-mogu is the coconut-jelly drink, whatever the brand: Niko and the unbranded bottles are the same product; Niko\'s spice grinders and a jelly dessert are not', () => {
  is("ניקו משקה גלי קוקוס-אננס 320 מ\"ל", 'mogu-mogu');
  is('מוגו מוגו ליצי עם חתיכות גלי קוקוס 1ל', 'mogu-mogu');
  is('משקה אננס 290מ"ל ג`לי קוקוס בקבוק זכוכ', 'mogu-mogu');
  is("משקה בטעם פסיפלורה עם חתיכות ג'לי קוקוס", 'mogu-mogu');
  isNot('ניקול שקיות אשפה עם ידיות', 'mogu-mogu');
  isNot('ניקו מלח ים עם יוד במטחנה 56 גרם גונץ', 'mogu-mogu');
  isNot("קינוח ג'לי קוקוס", 'mogu-mogu');
});

test('beer: a craft style name that never prints the word "בירה" (Pale Ale, IPA, Amber Ale) is still beer', () => {
  is('בירה קרומבאכר חיטה 500 מל', 'beer');
  is('שפירא פייל אייל 330 מ"ל', 'beer');
  is('שפירא IPA  בקבוק 330', 'beer');
  is('שקמה אייל ענברי', 'beer');
  isNot("זוג מטחנות מלח/פלפל אקרילי שקוף 6.5 ס\"מ OLIPAC", 'beer');
});

test('cocktail-rtd: Kopparberg\'s real alcoholic gin cocktail cans get the leaf; a canned fruit cocktail and a kiddush-wine brand "לה קוק" do not', () => {
  is("פחית קופרברג קוקטייל גין ותות ליים 250", 'cocktail-rtd');
  is("קופרברג קוקטייל גין ומיקס פירות 250 מל", 'cocktail-rtd');
  isNot('קוקטייל פירות 820 גרם', 'cocktail-rtd');
  isNot('יין לה קוק קברנה סוב', 'cocktail-rtd');
});

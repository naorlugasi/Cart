import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * 11.10.2026 - cluster-first round over my four owned files (config/concepts/beauty.json,
 * pharmacy.json, pets.json, bakery.json). Naor: "תנסה קודם לקבץ את המוצרים מאותה משפחה ואז לבנות
 * להם עץ" - every leaf below came from expanding a whole cluster (concept-clusters.mjs /
 * concept-round.mjs --raw over 110k+ raw chain names), not from a single product. Each test is one
 * capture + one near-miss; the near-miss is what proves the rule is keyed on identity, not on a
 * marketing word or a sibling's territory.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

test('beauty: a brand line before "קרם" is still a face cream - normalizeText\'s filling-phrase stripper was eating the identity (flavourIsIdentity fix)', () => {
  is('לוריאל קרם יום עם פעולה משולשת לעור רגיל ומעורב', 'skin-face-cream');
  isNot('תחליב פילינג לפנים בתוספת גרגירים קרמה 180 גרם', 'skin-face-cream'); // a peeling scrub, not a cream
});

test('beauty: a brand line before "קרם ידיים" is still hand cream; a hand WASH is not', () => {
  is('אפקטיב קר קרם ידיים לעור יבש במיוחד Intensive', 'skin-hand-cream');
  isNot('קרמה תחליב רחצה לניקוי וטיפוח הידיים מלפפון ואלוורה', 'skin-hand-cream'); // רחצה = wash, not lotion
});

test('beauty (Opus review 11.10): flavourIsIdentity makes a cream concept read "בניחוח קרם" too, so soap, shampoo, hair and SPF products are excluded by what they ARE', () => {
  isNot('סבון ידיים בניחוח קרם קוקוס', 'skin-hand-cream');
  isNot('שמפו לשיער בניחוח קרם וניל', 'hair-cream');
  isNot('סבון מוצק מועשר בקרם לחות 4*100 גרם', 'skin-face-cream');
  isNot('got2b חלק ושיק - קרם אנטי פריז', 'skin-face-cream'); // anti-frizz is a hair cream
  isNot('סקין גארד קרם פנים ילדים 50', 'skin-face-cream'); // a children's face cream on this shelf is sunscreen
  isNot('תחליב לחות לפנים נגד פגמי עור אס פי אף 50 גרנייה', 'skin-face-cream'); // SPF spelled in Hebrew, same rule as SPF
});

test('beauty (Opus review 11.10): a face lotion is "תחליב לחות"; a bare "תחליב" (Seri Expert hair lotion, Skinguard sunscreen) and "תחליב ידיים" (often a hand wash) are not', () => {
  is('ויזבלי קליר תחליב לחות50', 'skin-face-cream');
  isNot('סקינגארד תחליב לפנים', 'skin-face-cream');
  isNot('סרי אקספרט ויטמינו תחליב', 'skin-face-cream');
  isNot('תחליב ידיים אשכולית פמלי שחור לבן 500 מ', 'skin-hand-cream');
});

test('beauty (Opus review 11.10, home-department review): a towel whose colour is "פודרה" is not face powder', () => {
  isNot('מגבת גוף איכותית (140*70) פודרה', 'face-powder');
  isNot('מגבת פנים איכותית (90*50) פודרה', 'face-powder');
  is('פודרה קומפקטית', 'face-powder');
});

test('beauty: dotted א.ד.ט/א.ד.פ is still the EDT/EDP marker once normalizeText turns the dots into spaces; a bare brand name with no marker at all stays unassigned on purpose', () => {
  is('212 א.ד.ט לגבר 100 מ"ל', 'perfume');
  is('א.ד.פ רוז אוד 100 מ"ל', 'perfume');
  isNot('בוס בוטלד 100 מ"ל', 'perfume'); // no EDP/EDT/בושם marker in the name at all - brand recognition only, left open
});

test('pets: a cat collar is its own leaf; "קולרבי" (kohlrabi) only shares a prefix', () => {
  is('בובו קולר לחתול ורוד', 'cat-collar');
  isNot('קולרבי', 'cat-collar');
});

test('pets: "מעדן" (paste dessert) is wet cat food when it says לחתול; a coffee dessert that merely shares the word is not', () => {
  is('מעדן לחתול מיגליאור', 'cat-food-wet');
  isNot('מעדן קפה', 'cat-food-wet');
});

test('pharmacy: standalone "אבקה" (not just construct-state "אבקת") is still whey protein powder; baking powder is not', () => {
  is('אבקה חלבון GO עם WHEY בטעם וניל', 'protein-powder');
  isNot('אבקת אפייה', 'protein-powder');
});

test('bakery: matzah is its own leaf; matzah MEAL (flour) is not matzah', () => {
  is('מצות חמץ יהודה 400 ג', 'matzah');
  isNot('קמח מצה', 'matzah');
});

test('bakery: כעכים (kaak rings) is a bread product; a cookie that borrows the word ("עוגיות כעכים") is a cookie', () => {
  is('כעכים עם שומשום 225 גרם', 'kaak-rings');
  isNot('עוגיות כעכים 500 גרם פרווה אדל', 'kaak-rings');
});

test('bakery (Opus review 11.10): orange, apple, marble, cherry and wild-berry are FLAVOURS of one loaf cake, not five leaves - the flavour words (variant.words) and the marble word (variant.concepts) keep them apart as substitutes', () => {
  is('עוגת הבית תפוז 400 גרם', 'cake-loaf');
  is('עוגת תפוחים ללא תוספת סוכר', 'cake-loaf');
  is('עוגת תפוח עץ פרורים', 'cake-loaf'); // singular תפוח - the five-leaf version missed it
  is('עוגת שיש אחוה 450 גר', 'cake-loaf');
  is('עוגת דובדבנים', 'cake-loaf');
  is('עוגת פירות יער ללא תוספת סוכר', 'cake-loaf');
  isNot('שישיית עוגות קקאו וניל 180גר', 'cake-loaf'); // שישייה is a six-pack, not marble
  isNot('תערובת עוגת פירות יער', 'cake-loaf'); // a cake MIX is not the cake
});

test('bakery (Opus review 11.10): a form leaf beats the loaf cake when both words are present (type beats flavour)', () => {
  is('עוגת מאפין תפוז 500גרם', 'cake-muffin');
  is('עוגת שמרים תפוחי עץ', 'cake-yeast');
  is('עוגת פס דובדבן 650ג נטלי', 'cake-bar');
  isNot('עוגת מאפין תפוז 500גרם', 'cake-loaf');
  isNot('עוגת פס דובדבן 650ג נטלי', 'cake-loaf');
});

test('bakery (Opus review 11.10): a yogurt or ice cream that tastes of a cake is not the cake - flavourIsIdentity stays off the cheesecake and the form leaves', () => {
  isNot('יוגורט go עוגת תפוחים', 'cake-loaf');
  isNot('גלידה בטעם עוגת גבינה', 'cake-cheese');
  isNot('HI SAM עוגת ספוג יפנית בטעם גבינה 95 גרם', 'cake-cheese'); // a cheese-flavoured sponge is not a cheesecake
  is('עוגה בטעם דבש 350גר', 'cake-honey'); // honey cake IS the product: chains write it as a flavour
});

test('bakery (Opus review 11.10): a matzah baked from another flour is matzah; matzah meal and matzah-meal pasta are not', () => {
  is('מצות מקמח כוסמין שוו', 'matzah');
  isNot('פירורים מקמח מצה', 'matzah');
  isNot('צ\'ק מצה פנה טרקולור 500 גרם', 'matzah');
});

test('cross-file (Opus review 11.10): yeast, dates and potato give up the cake, the kaak and the matzah they shared a word with', () => {
  is('שמרים בטעם שוקולד קלאסית עוגות הבית', 'cake-yeast');
  isNot('עוגות שמרים פרימיום 500גר', 'yeast');
  is('שמרים לעוגות', 'yeast'); // baker\'s yeast FOR cakes stays yeast
  is('כעכים מרוקאי "תמר"', 'kaak-rings'); // תמר is the bakery, not dates
  is('מצות תפו"א ללא גלוטן', 'matzah');
});

test('bakery: "אינגליש" is the same English cake as "אנגלית" (chain transliteration), and it is not chocolate cake even when chocolate-flavoured', () => {
  is('עוגת אינגליש בטעמים', 'cake-english');
  is('עוגת אינגליש שוקולד 500 גר', 'cake-english');
  isNot('עוגת אינגליש שוקולד 500 גר', 'cake-chocolate');
});

test('bakery: a frozen-pizza concept should not swallow a pizza KNIFE or pizza SEASONING sold in the same aisle', () => {
  isNot('סכין לפיצה', 'frozen-pizza-ready');
  isNot('תבלין לפיצה 150 גרם', 'frozen-pizza-ready');
});

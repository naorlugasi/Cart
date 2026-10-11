import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
import { readFileSync } from 'node:fs';
import { RULES_FILE, variantSignature } from '../src/pricing/substituteRules.js';

const rawGroups = () => JSON.parse(readFileSync(RULES_FILE, 'utf8')).variant.groups;

/**
 * 11.10.2026 - the taxonomy items the owner left to us (docs/CONCEPTS.md §15). Every new leaf gets one name it
 * must capture and one close name it must refuse (the refusal is what holds the rule), and every source
 * concept is checked to have let go of what moved out. Names are real chain names from the price files.
 */
const concepts = loadConcepts();
const is = (name, id) => assert.equal(assignConcept(name, concepts), id, `${name} -> ${id}`);
const isNot = (name, id) => assert.notEqual(assignConcept(name, concepts), id, `${name} must not be ${id}`);

// --- step 1: leaves out of a generic concept ------------------------------------------------------

test('flour-spelt: spelt flour leaves flour-whole-wheat; a product made FROM spelt flour is not flour', () => {
  is('קמח כוסמין לבן מנופה 1קג', 'flour-spelt');
  is('קמח כסמין 80% מנופה', 'flour-spelt');
  isNot('גליליות אורגניות מקמח כוסמין 100 גר', 'flour-spelt');
  isNot('מאמאמיה פיצה מרגריטה קמח כוסמין 470 גר', 'flour-spelt');
  is('קמח חיטה מלא 100% מנופה', 'flour-whole-wheat');
});

test('flour-rye: rye flour, not a rye crispbread', () => {
  is('קמח שיפון מלא 1 ק"ג סוגת', 'flour-rye');
  isNot('פת פריכה קמח שיפון 275 גר', 'flour-rye');
});

test('flour-chickpea / flour-potato: out of flour-white, without the matzos and wafers made from them', () => {
  is('קמח חומוס ללא גלוטן 400 גרם', 'flour-chickpea');
  isNot('אובלטים אורגניים מקמח חומוס בתוספת שומשום', 'flour-chickpea');
  is('קמח תפו"א 500 גרם שקית', 'flour-potato');
  isNot('מצות מקמח תפוחי אדמה 300 גרם', 'flour-potato');
  is('קמח לבן מנופה הנחתום', 'flour-white');
});

test('gnocchi: potato gnocchi leave pasta-other; dry gnocchi-shaped pasta (sardi, shells, Liguori) stays pasta', () => {
  is('ניוקי תפוחי אדמה 500 גרם', 'gnocchi');
  is('ניוקי ללא גלוטן 400גר רמילוי', 'gnocchi');
  isNot('פסטה ניוקי סרדי500ליגורי', 'gnocchi');
  is('L.M פסטה איטלקית קונכיות ניוקי 500 גרם', 'pasta-other');
});

test('noodles-rice: rice noodles and rice sticks, not a rice-noodle ready meal or a rice-stick snack', () => {
  is('אטריות אורז דקות 400 גר טעמי אסיה', 'noodles-rice');
  is('מקלוני אורז ללא גלוטן 5 מ"מ 400 גרם', 'noodles-rice');
  is('מקלות אורז 3 מ"מ', 'noodles-rice');
  isNot('דודלס ארוחת אטריות אורז עם גבינה ללא גלוטן 170 גרם', 'noodles-rice');
  isNot('אסם תבשיל אורז עם אטריות וירקות בסגנון סיני', 'noodles-rice');
  isNot('אטריות אורז דקות 400 גר טעמי אסיה', 'noodles');
  isNot('אטריות ראמן ללא גלוטן אורז מלא 280 גרם', 'rice-brown');
});

test('rice-puffed: puffed rice, not a chocolate bar or cereal with puffed rice in it', () => {
  is('פצפוצי אורז מלא דגש 350 גרם', 'rice-puffed');
  is('אורז תפוח 500 גרם בשקית (פיצפוצי אורז)', 'rice-puffed');
  isNot('שוקולד פרה פצפוצי אורז', 'rice-puffed');
  isNot('דגני קוקו פבלס - אורז תפוח ממותק עם קקאו', 'rice-puffed');
  isNot('פצפוצי אורז לבן 350 גר', 'rice-white');
});

test('coffee-beans: whole beans leave coffee-ground; a protein bar with coffee beans is not coffee', () => {
  is('פולי קפה לוואצה קרמה ארומה 1 ק"ג', 'coffee-beans');
  is('פולי אספרסו עוצמה 14 450 גר', 'coffee-beans');
  isNot('JOMO PRO חטיף חלבון אספרסו ופולי קפה 60', 'coffee-beans');
  is('קפה לוואצה קלוי וטחון חוזק 5 אורו 250 גר', 'coffee-ground');
});

test('bok-choy: every spelling, out of lettuce; seeds and a baby-leaf mix are not the vegetable', () => {
  is('באקצוי', 'bok-choy');
  is("פאקצ'וי יבולי הכפר", 'bok-choy');
  is('חסה באק צ`וי א. אדמה', 'bok-choy');
  isNot("בייבי מיקס באק-צ'וי", 'bok-choy');
  isNot('זרעי כרוב סיני', 'bok-choy');
});

test('pizza-base: a pizza base leaves frozen-pizza-ready; a base-mix and "על בסיס גבינה" are not one', () => {
  is('בסיס לפיצה ללא גלוטן 300 גרם', 'pizza-base');
  is('תחתיות לפיצה מנת השף קוטר 26 ס"מ 480 גר', 'pizza-base');
  isNot('תערובת להכנת בסיס לפיצה ללא גלוטן 500 גר', 'pizza-base');
  isNot('פתיתים מיוחדים לפיצה על בסיס גבינה 500 ג', 'pizza-base');
  isNot('בסיס לפיצה ללא גלוטן 300 גרם', 'frozen-pizza-ready');
});

// --- step 2: bundled concepts split into the real objects -------------------------------------------

test('brushes: each kind of brush is its own concept; cleaning-brush keeps the household cleaning brushes', () => {
  is('מברשת אסלה לשירותים', 'toilet-brush');
  is('מברשת כלים עגולה שופרסל', 'dish-brush');
  isNot('מברשת כלים עגולה שופרסל', 'cleaning-brush');
  is('מברשת שיער להתרת קשרים', 'hair-brush');
  is('מברשת פן ציקלון 32 מ"מ', 'hair-brush');
  isNot('מברשת לסומק משיער טבעי', 'hair-brush'); // natural-hair bristles: a makeup brush
  is('מברשת לסומק משיער טבעי', 'makeup-brush');
  is('מברשת להנחת צלליות', 'makeup-brush');
  isNot('מברשת בקבוקים אוונט', 'makeup-brush'); // "קבוקי" inside "בקבוקים"
  isNot('עפרון גבות+מברשת 20', 'makeup-brush');
  is('ראש למברשת חשמלית סנסטיב', 'toothbrush-head');
  isNot('ראש מברשת לניקוי תקרה1יח', 'toothbrush-head');
  is('מברשת שיניים חשמלית לילדים בלואי +3', 'toothbrush-electric');
  is('מברשת שיניים חשמלית קיפ דיפ עם ראש מתחלף', 'toothbrush-electric');
  is('מברשת אינטרדנטלית סו', 'interdental-brush');
  isNot('פארו מברשת שיניים 742', 'interdental-brush');
  is('זוג מברשות סנסודיין', 'toothbrush');
  is('מברשת לניקוי מנגל', 'cleaning-brush');
  is('מברשת אבק שופרסל', 'cleaning-brush');
});

test('cotton-swabs-picks keeps the ear swabs (every spelling); dental-picks owns toothpicks and floss picks', () => {
  is('צימרוני אוזניים מעץ 300 יחידות', 'cotton-swabs-picks');
  is('מקלוני כותנה לתינוק בלונס 50 יחידות', 'cotton-swabs-picks');
  is('קיסמי אוזניים פלסטיק 200יח קופסא שווה', 'cotton-swabs-picks');
  is('קיסמי שיניים מבמבוק במלחיה - 300 יחידות', 'dental-picks');
  is('פלאקרס פלוסר חוט דנטלי וקיסם מתקפל מנטה - 36 יח', 'dental-picks');
  isNot('קיסמים מעוטרים 12 סמ', 'dental-picks');
  isNot('קיסמי אוזניים פלסטיק 200יח קופסא שווה', 'dental-picks');
  is('חוט דנטאלי 50 מטר רפואי', 'dental-floss');
});

test('dental-picks: a floss pick is a variant of its own - never offered for a plain toothpick', () => {
  assert.ok(rawGroups()['dental-picks']?.floss, 'rules.json variant.groups["dental-picks"].floss');
  assert.notDeepEqual(variantSignature('קיסמים עם חוט דנטלי פלאקרס 35 יחידות', undefined, 'dental-picks'),
    variantSignature('קיסמי שיניים מבמבוק במלחיה - 300 יחידות', undefined, 'dental-picks'));
});

test('sponges: dish, magic, steel, shoe and makeup sponges are their own concepts; sponge is the bath sponge', () => {
  is('ספוג ניקוי דו צדדי אדום צהוב מאמי סקראב דדי', 'dish-sponge');
  is('ספוג כלים אקולוגי 4 יח GF', 'dish-sponge');
  isNot('ספוג הפלא - מארז 6 יח\' סנו סושי', 'dish-sponge');
  is('ספוג הפלא - מארז 6 יח\' סנו סושי', 'sponge-magic');
  is('ספוגיות מתכת אל חלד לניקוי סנו 3 יחידות', 'steel-wool');
  is('צמר פלדה רמי לוי 100 גרם', 'steel-wool');
  isNot('כרית קרצוף עם סיבי נירוסטה', 'steel-wool');
  is('יאק ספוג מבריק נעליים שקוף', 'shoe-sponge');
  isNot('משחה להברקת נעליים עם ספוג - שחור YAK', 'shoe-sponge');
  is('מארז שתי ספוגיות מייק אפ', 'makeup-sponge');
  isNot('קונסילר ספוג 00 יח', 'makeup-sponge');
  is('ספוג רחצה 3 יח', 'sponge');
  isNot('ברני עוגת ספוג במילוי קרם שוקולד 150 גרם', 'sponge');
  isNot('אטמי ספוג לאוזניים', 'sponge');
});

test('bandage-elastic is the elastic wrap (every chain\'s spelling); gauze is its own concept', () => {
  is('תחבושת אלסטית 7.5 ס"מ', 'bandage-elastic');
  isNot('תחבושת אלסטית 7.5 ס"מ', 'sanitary-pads');
  is('אגד מתמתח 10 סמ', 'bandage-elastic');
  is('אגד גזה נמתח', 'gauze');
  is('פד סטרילי 10*10', 'gauze');
  isNot('שלישיית בקבוקי הגזה מהדורת אביב', 'gauze');
});

test('departments follow the shelves: makeup and hair brushes sit in טיפוח ויופי, gauze in פארם ותוספים', () => {
  const cat = (id) => concepts.find((c) => c.id === id).category;
  assert.equal(cat('makeup-brush'), 'טיפוח ויופי');
  assert.equal(cat('makeup-sponge'), 'טיפוח ויופי');
  assert.equal(cat('hair-brush'), 'טיפוח ויופי');
  assert.equal(cat('gauze'), 'פארם ותוספים');
  for (const id of ['toilet-brush', 'dish-brush', 'toothbrush-head', 'toothbrush-electric', 'interdental-brush', 'dental-picks', 'dish-sponge', 'sponge-magic', 'steel-wool', 'shoe-sponge']) {
    assert.equal(cat(id), 'ניקיון וטואלטיקה', id);
  }
});

test('rules.json: the kind groups the new leaves replace are gone', () => {
  const groups = rawGroups();
  assert.equal(groups['flour-whole-wheat'], undefined);
  assert.equal(groups['coffee-ground'], undefined);
  assert.equal(groups['flour-white']?.chickpea, undefined);
  assert.equal(groups['flour-white']?.potato, undefined);
  assert.equal(groups['pasta-other']?.gnocchi, undefined);
  assert.equal(groups['dental-floss'], undefined);
});

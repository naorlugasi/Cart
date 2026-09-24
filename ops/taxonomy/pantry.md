# Department misroutes found while working שימורים (pantry.json round, 24.9)

Found while running `node scripts/concept-clusters.mjs --department "שימורים" --expand <head>` on
רוטב / ממרח / מחית / שמן / אבקת / זרעי. Not fixed here — `src/catalog/categorize.js` is shared by
several concurrent sessions and out of scope for this round. Format: product name, current department,
correct department, keyword that likely routed it.

## סטטוס (25.9, סבב המחלקות - src/catalog/categorize.js)

- [x] **1. זרעי גינון** - תוקן, בצורה זהירה: הכלל הראשון שניסיתי ("אין יחידת משקל בשם") תפס גם מוצרי מזון אמיתיים ("זרעי צ'יה טיב הטבע", "מחית עם זרעי וניל") שלא הזכירו משקל בשם המקוצר - נזרק. הכלל שנשאר הוא חיובי בלבד: שם שמכיל `\d+ זרעים`, `\d+ יחיד`, `לשתילה` או `לנבטים` יוצא מהחריג. אין מחלקת "גינון" בין 15 המחלקות הקבועות - המוצרים נופלים ל"כללי" ותועד כשאלה פתוחה (docs/QUESTIONS-FOR-NAOR.md כבר יש שאלה 2 על נושא קרוב; זה לא נוסף שם כי אין החלטה מיידית דרושה, רק פתיחת מחלקה עתידית).
- [x] **2. שמן קוסמטי (~70-100)** - רובם כבר נכון live דרך מילות מפתח קיימות (משחת שיניים/סבון ידיים/דאודורנט/תחליב רחצה כבר תופסים - הממצא נמדד מול `data/products.json` הישן, TRAPS #15). נוסף במפורש: `ארגן` (בלי "שמן" צמוד), `שמן ארומטי|שמן אתרי|שמן טיפולי|שמן עיסוי|שמן לשיזוף` לרול טיפוח ויופי, עם שומר שלא לגנוב שמפו/תחליב רחצה/פוליויקס אמיתיים.
- [x] **3. שמן מאור/נרות** - תוקן: `למאור` נוסף לרול בית וכלים (נבדק לפני שימורים).
- [x] **4. מנקה רצפות שמן פשתן** - כבר נכון live (`ניקיון וטואלטיקה` דרך "מנקה") - הממצא היה שגוי/מיושן. "נוזל רצפות שמן אורנים" (בלי "מנקה"/"ניקוי" בשם) עדיין שגוי - חשף תקלה נפרדת גדולה יותר, ר' דוח.
- [ ] **5. צבעי שמן (אמנות)** - לא תוקן: מוצר בודד, ואין מחלקת "אמנות/צרכי כתיבה" נפרדת - לא הוצדק שינוי כלל.
- [ ] **6. מחית פרי לתינוקות (~37)** - לא תוקן: אין סמן כללי בטוח שמבדיל "מחית תינוקות" מ"מחית" רגילה בלי הרחבה שברירית למותגים ספציפיים (שלב 3/ילדוד/קטיף) - בדיוק כמו שהסבב המקורי בחר שלא לגעת בזה. נשאר כממצא.
- [x] **7. אבקת חלבון/גלוטמין/קריאטין (~27+11)** - תוקן: `אבקת חלבון|גלוטמין|קריאטין` נוסף לרול פארם ותוספים (נבדק לפני שימורים).

## 1. Garden/planting seeds routed by "זרעי"/"זרעים" (~89 products)

These are seed packets for home gardening, not a pantry ingredient. `CATEGORY_RULES` is almost certainly
keying off the bare word "זרעי"/"זרעים", which also means "seeds [of a plant]" in the food sense
(sesame seeds, chia seeds) — the rule needs to distinguish "N seeds to plant" from "grams of seeds to eat".

| product | current dept | correct dept | keyword |
|---|---|---|---|
| גזר לבן 100זרעים | שימורים | גינון / home & garden | זרעים |
| זרעי חסה מיקס 20 זרעים | שימורים | גינון / home & garden | זרעי |
| זרעי כרוב לבן 20 זרעים | שימורים | גינון / home & garden | זרעי |
| זרעי פלפל אדום 10 זרעים | שימורים | גינון / home & garden | זרעי |
| זרעי מלפפון 10 יחידות | שימורים | גינון / home & garden | זרעי |
| זרעי עגבניות שרי מיקס | שימורים | גינון / home & garden | זרעי |
| טגטס מיקס זרעי פרחים יח | שימורים | גינון / home & garden | זרעי |
| מגוון זרעי ירקות לשתילה | שימורים | גינון / home & garden | זרעי |
| זרעים ארטישוק / זרעים בצל / זרעים כוסברה / זרעים תרד (and ~15 more `זרעים <vegetable>` singles) | שימורים | גינון / home & garden | זרעים |

~89 products total match this pattern (every name is `<vegetable/herb/flower> <N> זרעים` or
`זרעי <vegetable> <N זרעים\|לנבטים\|לשתילה>`). None of them were given a concept in this round — they
are not food, and no pantry concept should claim them.

## 2. Cosmetic / body-care "שמן" products routed by "שמן" (~70-100 products)

The task brief already flagged `שמן 100% ארגן טהור 30 מ"ל` (argan oil, cosmetic) — it turned out to be one
of a much larger group. `שמן` means both "cooking oil" and "[essential/body] oil", and the department
keyword doesn't distinguish them. **Refused** — no `oil-argan` concept was written, and the argan item was
left unmatched on purpose so it doesn't get priced against cooking oil.

| product | current dept | correct dept | keyword |
|---|---|---|---|
| שמן 100% ארגן טהור30מל | שימורים | טיפוח ויופי | שמן |
| שמן ארומטי לימון / אורן / לבנדר / נענע / עשב לימון | שימורים | טיפוח ויופי | שמן ארומטי |
| שמן אתרי לבנדר צרפת10 מל | שימורים | טיפוח ויופי | שמן אתרי |
| שמן טיפולי (50 מ"ל / אמול קלאסי / אמולפורטה 500מ / קלאס500מ) | שימורים | טיפוח ויופי | שמן טיפולי |
| שמן עיסוי עם ארניקה100מל / שמן עיסוי פרינאום | שימורים | טיפוח ויופי | שמן עיסוי |
| שמן לשיזוף אבטיח 100 מ"ל | שימורים | טיפוח ויופי | שמן |
| שמן משמש לטיפוח הציפורן / שמן פוליגונום לציפורניים | שימורים | טיפוח ויופי | שמן |
| בוטניק שמן פנים 30 מ"ל / פירמזה שמן גוף 100מ"ל | שימורים | טיפוח ויופי | שמן פנים / שמן גוף |
| נטורל פורמולה לחות עם שמן קוקוס לתלתול טבעי | שימורים | טיפוח ויופי | שמן קוקוס (hair) |
| פנטן שמן מועשר בקוקוס לתלתלים מושלמים | שימורים | טיפוח ויופי | שמן (in a shampoo line) |
| מגן שמן בליסימו / סרי אקספרט שמן מטאל דיטו | שימורים | טיפוח ויופי | שמן (hair-color protectant) |
| קרם ידיים דאב שמן אבוקדו / שמן קוקוס 75 מ"ל | שימורים | טיפוח ויופי | שמן אבוקדו / שמן קוקוס |
| סבון ידיים שמן קוקוס עץ התה 500 מ"ל | שימורים | טיפוח ויופי | שמן קוקוס |
| תחליב רחצה שמן קוקוס (פינוק, several SKUs) | שימורים | טיפוח ויופי | שמן קוקוס |
| שמפו/מרכך שמן קוקוס וקרטין (כיף, נקה 7, several SKUs) | שימורים | טיפוח ויופי | שמן קוקוס |
| משחת שיניים מלבינה עם שמן קוקוס + מברשת | שימורים | טיפוח ויופי | שמן קוקוס |
| דאודורנט אבן קריסטל ושמן קוקוס | שימורים | טיפוח ויופי | שמן קוקוס |
| קרם גוף מועשר בשמן אבוקדו / בשמן קוקוס | שימורים | טיפוח ויופי | שמן אבוקדו / קוקוס |

Given how many cosmetic products carry "שמן קוקוס"/"שמן אבוקדו" (real cooking-oil ingredient words), the
five new cooking-oil concepts written this round (`oil-avocado`, `oil-coconut`, `oil-flaxseed`,
`oil-grapeseed`, `oil-pumpkin-seed`) all needed explicit `none` guards against שמפו/מרכך/תחליב
רחצה/קרם/סבון/משחת שיניים/דאודורנט/מנקה/מסכה/פינוק — see the concept-health notes in the commit. That
keeps the concepts correct regardless of what happens to the department rule.

## 3. Lamp / candle oil routed by "שמן" (~3 products)

| product | current dept | correct dept | keyword |
|---|---|---|---|
| שמן צמחי למאור 1 ליטר בני פאוזי | שימורים | יודאיקה / נרות, or בית וכלים | שמן |
| שמן פראפין 1 ליטר שלהבת | שימורים | יודאיקה / נרות, or בית וכלים | שמן |
| שמן פראפין למאור 1 ל | שימורים | יודאיקה / נרות, or בית וכלים | שמן |

Excluded from the new oil concepts (none guard not needed — "למאור"/"פראפין"/"שלהבת" don't collide with
any cooking-oil `any` pattern), but still sitting in the wrong department.

## 4. Household cleaning products routed by "שמן" (2+ products)

| product | current dept | correct dept | keyword |
|---|---|---|---|
| מנקה רצפות שמן פשתן | שימורים | בית וכלים | שמן |
| נוזל רצפות ע"ב שמן אורנים | שימורים | בית וכלים | שמן |

## 5. Art supplies routed by "שמן" (1 product seen)

| product | current dept | correct dept | keyword |
|---|---|---|---|
| 12צבעי שמן | שימורים | stationery/art, not currently a department in this catalog | שמן (oil paint) |

## 6. Baby fruit purée routed by "מחית" (~37 products)

Per the task brief: this overlaps the תינוקות department, owned by dairy-eggs.json and general.json — not
touched here, filed as a finding only. All squeeze-pouch / jarred fruit purées ("שלב 3", "ילדודס",
"קרפ", plain fruit + fruit combos) currently sit in שימורים instead of תינוקות.

| product | current dept | correct dept | keyword |
|---|---|---|---|
| מחית תפוח עץ 100% פרי נטורלה 90 גרם | שימורים | תינוקות | מחית |
| מחית בננה שלב 3 טעמן | שימורים | תינוקות | מחית |
| מחית תפו"ע אגס ילדוד / מחית תפוע ובננה קטיפ / מחית תפוע קטיפקידס | שימורים | תינוקות | מחית |
| סקוויז מחית תפו"ע 100 גרם / סקוויז מחית תפו"ע ואגס 100 גרם | שימורים | תינוקות | מחית |
| מחית אגס ובננה אורגנית 120 גרם (and ~25 more `מחית <fruit combo> אורגני/ת 100-200 גרם`) | שימורים | תינוקות | מחית |

The two pantry concepts this round DOES claim under "מחית" (`tomato-puree`, `curry-paste`, `miso`) were
deliberately scoped with `any: ["עגבני"]` / `["קארי"]` / `["מיסו"]` so they can never reach into this
fruit-purée group — verified by re-running the diff after writing them (no LOST lines against any baby/
תינוקות concept).

## 7. Protein powder / sports supplements routed by "אבקת" (~27 products)

`אבקת חלבון ...` (whey, pea, soy, vegan blends, flavoured) reads as a supplements-aisle product, not a
pantry/canned-goods item. Left unmatched by design this round (no pantry concept written for it).

| product | current dept | correct dept | keyword |
|---|---|---|---|
| אבקת חלבון איזו 1 בטעם עוגיות 1.8 ק"ג | שימורים | פארם ותוספים | אבקת |
| GO אבקת חלבון מי גבינה וניל קרמל 748 גרם | שימורים | פארם ותוספים | אבקת |
| אבקת ל-גלוטמין 300 גרם / אולאין אבקת קריאטין240גר | שימורים | פארם ותוספים | אבקת |
| טודיי אבקת חלבון בטעם מילקשייק שוקולד | שימורים | פארם ותוספים | אבקת |

(`psyllium-husk`, `sugar-powdered`, `cocoa-powder`, `gelatin-powder`, `curry-powder`, `garlic-powder` were
kept as pantry concepts this round — they're genuinely baking/cooking powders, not supplements.)

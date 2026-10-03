# סבב סקירה: אותו מוצר, כמה ברקודים

כלי עזר ידני (לא רץ בפייפליין) שמוצא לנאור "חשודים" לכינוי GTIN (docs/ALIASES.md) ולא רק את הזוגות
ה"חזקים" ש-`scripts/alias-candidates.mjs` כבר מוצא לבד, אלא גם צרורות גדולים יותר (שרשרת זוגות שמתחברת
ל-3+ ברקודים) ואת מה שתור הבדיקה (`data/review-queue.json`, כלל `same-product`) מזהה. התוצר הסופי זהה
לזה של `alias-candidates.mjs`: שורות ב-`config/products/aliases.json`, עם `why` שמנמק - אבל כאן ההחלטה
עצמה נעשית בעמוד סקירה, לא בעיון ידני בקובץ JSON.

## הזרימה המלאה

```
1. node scripts/alias-candidates.mjs                 # כותב data/local/alias-candidates.json
2. node scripts/same-product-review-export.mjs        # כותב data/local/same-product-review(.min).json
3. פותחים tools/review/same-product.html, טוענים את הקובץ ה-min, מחליטים צרור-צרור
4. מורידים (כפתור "ייצוא החלטות") -> same-product-decisions.json
5. node scripts/same-product-review-import.mjs <הקובץ שהורד>
6. בודקים את השינוי ב-config/products/aliases.json / not-aliases.json, ועושים commit
```

שום דבר לא משתנה בקטלוג בלי שלב 6 - commit בפועל. ההורדה בשלב 4 יושבת רק בדפדפן של נאור; עד שהיא עוברת
דרך הייבוא (שלב 5) ונכנסת ל-commit, שום רשת לא רואה שינוי.

## שלב 1-2: בניית הקלט (`scripts/same-product-review-export.mjs`)

קורא (קריאה בלבד, אף פעם לא כותב ל-`data/`):

- **`data/local/alias-candidates.json`** - פלט `alias-candidates.mjs`: זוגות `strong` (אותה קידומת
  יצרן), `variant` (אותה קידומת אבל שם בתוך הרשתות חולק על מילת תוכן - נפסל שם כווריאציה, לא כאותו מוצר)
  ו-`weak` (קידומת שונה). **צריך להריץ את `alias-candidates.mjs` לפני** - הסקריפט הזה לא מריץ אותו לבד.
- **`data/review-queue.json`** - פריטים שה-checks שלהם כוללים `rule: "same-product"` (סוכן מקביל מוסיף
  אותם; אם הקובץ עוד לא קיים או אין בו כאלה, פשוט אין תרומה משם). כל פריט כזה שייך לברקוד אחד (ה-`id`
  שלו); כל ברקוד נוסף שמופיע בטקסט ה-`detail`/`suggestion` של הבדיקה נקרא כ"אותו מוצר כמו הברקוד הזה"
  והופך לזוג, ברמה `queue`.
- **`config/products/not-aliases.json`** - צרורות שנאור כבר קבע "שונה" (שלב 5 כותב לכאן): כל זוג
  שמופיע יחד באחד מהצרורות הרשומים שם מוסר *לפני* הקיבוץ, כדי שצרור שנדחה לא יחזור, וגם לא ידביק בטעות
  שני צרורות לא קשורים דרך אותו ברקוד.
- **`data/local/identity-clusters.json`** (תוספתי, 4.10, docs/ALIASES.md) - פלט `scripts/identity-merge.mjs`:
  צרורות **מוכנים מראש** (לא זוגות) מכלי האיחוד הזהותי, עם `verdict: "auto"|"review"` ו-`differing`/`impact`
  משלהם - אלה נכנסים כ-`tier` עצמאי (`identity-auto`/`identity-review`, לפני כל שאר הרמות) ולא עוברים את
  ה-union-find למטה; גם עליהם חל `not-aliases.json` (כל זוג חסום בתוך הצרור מוריד את הצרור כולו).

כל הזוגות (משני המקורות הראשונים) עוברים **union-find**: שני זוגות ששניהם נוגעים באותו ברקוד מתמזגים לצרור אחד -
כך ש-A-B ו-B-C הופכים לצרור תלת-ברקודי אחד, לא לשני זוגות נפרדים. רמת הצרור (`tier`) היא הרמה הכי
"חזקה" מבין הזוגות שבו (identity-auto > identity-review > strong > queue > variant > weak).

לכל צרור: שם, גודל (טקסט עברי דרך `src/catalog/size.js` `describeSize`), attrs, והרשתות שמוכרות כל
ברקוד (ממחירוני `data/catalogs/<chain>.json`) - וגם:

- **`differing`** - מילים בשם שלא מופיעות בכל חברי הצרור (אותו נירמול/גזירה כמו שאר הקטלוג,
  `src/catalog/matching.js`), פלוס מפתחות attrs שהערך שלהם לא זהה בין החברים (`attrs.state` וכו').
- **`impact`** - כמה מ-7 הרשתות שהעגלה באמת משרתת (`shufersal`, `ramilevy`, `carrefour`, `yochananof`,
  `hazihinam`, `victory`, `osherad`) **יקבלו מחיר אם ממזגים**: הברקוד עם הכי הרבה רשתות נחשב "קנוני";
  `impact` סופר רשתות ששייכות לרשימה הזו, לא מוכרות את הקנוני, אבל כן מוכרות ברקוד אחר בצרור.

כותב שני קבצים ל-`data/local/` (מוחרג מ-git, כמו כל `data/local/`):

- `same-product-review.json` - כל צרור, מלא.
- `same-product-review.min.json` - אותו דבר בשדות מצומצמים (בלי השם הגולמי שכל רשת נתנה לברקוד, רק
  `chain`+`price`), מוגבל ל-1,500 הצרורות הראשונים לפי `impact` (ה-`includedClusters`/`totalClusters`/
  `truncated` בראש הקובץ אומרים אם נחתך). זה הקובץ שהעמוד טוען.

```
node scripts/alias-candidates.mjs
node scripts/same-product-review-export.mjs
```

## שלב 3: הסקירה עצמה (`tools/review/same-product.html`)

קובץ HTML בודד, בלי build, בלי תלות ברשת (חוץ מגופן Google Fonts). פותחים אותו ישירות (כפול-קליק /
`open`), או דרך שרת סטטי קטן. בעלייה הוא מנסה `fetch('./same-product.min.json')` - זה עובד רק אם הקובץ
יושב **באותה תיקייה** והעמוד מוגש דרך שרת http (לא `file://`, שחוסם `fetch` לקובץ שכן). שתי דרכים
פשוטות:

```
# א. שרת סטטי זמני מהתיקייה הזו (python כבר מותקן בכל מק)
cp data/local/same-product-review.min.json tools/review/same-product.min.json
python3 -m http.server 8743 --directory tools/review
# פותחים http://localhost:8743/same-product.html

# ב. פשוט יותר: פותחים את same-product.html ישירות מהדיסק ולוחצים "טעינת קובץ"
# ובוחרים את data/local/same-product-review.min.json
```

(הקובץ שהועתק ל-`tools/review/` הוא עותק עבודה בלבד - לא ל-commit; `data/local/` לא עולה לגיט, ואותו
דבר צריך לחול על עותק שיושב מחוץ לה. עדיף פשוט למחוק אותו בסוף הסשן.)

בעמוד: צרור אחד בכל פעם, כרטיס לכל ברקוד (שם עם המילים השונות מודגשות, גודל, attrs כ-chips, הרשתות
שמוכרות אותו והמחיר), "משפיע על X רשתות", ומונה "12 / 480". שלושה כפתורים - **אותו מוצר** / **שונה** /
**לא בטוח** - עם מקשים `1`/`2`/`3`, וחיצים לדפדוף בין צרורות בלי להחליט. ההחלטות נשמרות אוטומטית
ב-localStorage (רענון דף חוזר לצרור הראשון שעוד לא הוחלט) ומיוצאות בלחיצה אחת:

- **"ייצוא החלטות"** - `same-product-decisions.json`, כל מה שכבר הוחלט (גם "לא בטוח").
- **"ייצוא לא הוחלט"** - `same-product-undecided.json`, רשימת מה שנשאר, לסשן המשך.

## שלב 5: ייבוא ההחלטות (`scripts/same-product-review-import.mjs`)

```
node scripts/same-product-review-import.mjs ~/Downloads/same-product-decisions.json
```

לכל החלטה:

- **"אותו מוצר"** - שורה אחת ב-`config/products/aliases.json` לכל ברקוד שאינו הקנוני בצרור (`alias`
  הוא הברקוד, `canonical` מה שהעמוד בחר כקנוני - הברקוד עם הכי הרבה רשתות). `why` נכתב אוטומטית: `נאור,
  <תאריך>: אותו מוצר - <שם הכינוי> / <שם הקנוני>`. כל שורה עוברת את אותה `validateGtinAliases()` ש-
  `scripts/build-products.mjs` מריץ בבנייה עצמה (ברקוד לא תקין, כינוי כפול, שרשרת כינויים) - שורה שנכשלת
  מדולגת עם הסיבה, לא עוצרת את שאר הייבוא. כינוי שכבר קיים (לאותו ברקוד) מדולג בלי לגעת בו.
- **"שונה"** - שורה אחת ב-`config/products/not-aliases.json` (`{ gtins, why, since }`) - כדי
  שהצרור הזה לא ייבנה שוב בריצה הבאה של `same-product-review-export.mjs`. צרור עם בדיוק אותה קבוצת
  ברקודים שכבר רשום מדולג.
- **"לא בטוח"** - לא נוגע בשום קובץ; נספר בסיכום בלבד, כדי להריץ עליו עוד סבב מאוחר יותר.

הסקריפט לא נוגע ב-`data/` בשום שלב - קורא את `data/products.json` רק כדי לשלוף שם מוצר לטקסט ה-`why`.
בסוף מדפיס סיכום (כמה הוחלט מכל סוג, כמה נוספו, כמה דולגו ולמה).

## שלב 6: ה-commit

`config/products/aliases.json` ו-`config/products/not-aliases.json` הם קבצי config רגילים ב-git - לא
`data/`. **שום דבר מזה לא נכנס לקטלוג עד שה-commit הזה עולה** וה-build הבא (אצל מרלוג) קורא אותם -
אותו עיקרון בדיוק כמו `alias-candidates.mjs` הידני (docs/ALIASES.md): זו תמיד החלטה של אדם, שנכנסת
לפייפליין רק דרך commit מפורש, אף פעם לא אוטומטית.

## בדיקות

`test/same-product-review-export.test.js` - קיבוץ union-find (כולל שרשרת זוגות לצרור אחד, ובחירת הרמה
הכי "חזקה"), `impact`, `differing`, החסימה דרך `not-aliases.json`, וההגבלה ל-1,500 בקובץ ה-min.
`test/same-product-review-import.test.js` - הוספת כינויים, דילוג על כינוי קיים/ולא תקין, דילוג על צרור
"שונה" שכבר נרשם, וצרור תלת-ברקודי שמייצר יותר משורת כינוי אחת. `npm test` צריך להישאר ירוק ("fail 0")
- הכלל של "Green before push" חל גם כאן.

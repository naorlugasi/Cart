# מה לעדכן בפרונט (cartFrontend) ובבק (cartBackend) אחרי 19.9.2026

מקור האמת לנתונים: `docs/PIPELINE-CONTRACT.md` (§2.1, §2.2, §4.3). עיצוב התחליפים: `docs/CONCEPTS.md`. מימוש ייחוס: `server/app.js`, `src/pricing/compare.js`, `src/pricing/substitutes.js`, `src/pricing/promotions.js`, `src/pricing/pooling.js` בריפו Cart. **כלל ברזל נשאר**: מחירים ומבצעים רק מהקבצים המפורסמים; אין קריאה לאתרי הרשתות.

## Backend (cartBackend)

### 1. נתונים חדשים בקבצים
- `products.json` גדל מ-4,000 ל-~7,200 (2.8MB). שדות חדשים לכל מוצר: `conceptId`, `size {value, unit, count}`, `privateLabelOf`. מוצרי מותג פרטי נמכרים ברשת אחת בלבד, אז `chains` יכול להיות 1.
- פריטי קטלוג: `promotions[]` בסכמה החדשה (`type: multi|unit|percent|bundleFree|second|discount`, `club`, `clubLabel`, `validTo`, `maxQty`, `promotionId`, `description`), ו-`privateLabel: true` על פריט מותג פרטי.
- `config/concepts/*.json` (326 מושגים): לטעון יחד עם products כדי לקבל `name`/`synonyms`/`sizeUnit` של מושג (לחיפוש ולתצוגת "אותו מושג").

### 2. תמחור: לא לכתוב מחדש, להעתיק את המודולים
`src/pricing/promotions.js` (`priceLine`, `upsellHint`), `src/pricing/pooling.js` (`poolBundles`), `src/pricing/substitutes.js` (`findSubstitute`), ו-`src/pricing/compare.js` (`compareCart`). הם ללא תלויות. הבדלים מהותיים מהגרסה הקודמת:
- מחיר מועדון **לא נכנס לסכום**. `priceLine` מחזיר `total` (לכולם) ו-`club` (רק אם זול יותר).
- `maxQty`: מעבר לו היחידות במחיר מדף. `bundleFree` (2+1), `second` (השני ב-X%).
- איגוד "מגוון": יחידות משורות שונות באותו `promotionId` מקבלות יחד את "N ב-X".
- תחליפים בתוך `compareCart` לפי `substitutes` (ראה 4).

### 3. תשובת `/api/compare` - שדות חדשים
לשורה: `club {lineTotal, promo, savings, label}|null`, `hint {addQty, lineTotal, promo}|null`, `pooled {promotionId, with[]}|undefined`, `substituteReason 'missing'|'cheaper'|null`, `alternative {productId, name, storeItemName, unitPrice, lineTotal, savings, privateLabel, reason}|null`.
לרשת: `club {subtotal, grandTotal, savings, label}|null`, `withAlternatives {subtotal, grandTotal, savings, count}|null`, `substitutedCount`, `savings` (חיסכון ממבצעים בסכום הרגיל).

### 4. הגדרת הלקוח: תחליפים
- בפרופיל המשתמש (Upstash/DB): `substitutes: { policy: 'none'|'privateLabel'|'cheapest', apply: 'ask'|'auto' }`. ברירת מחדל `{ policy: 'privateLabel', apply: 'ask' }` (החלטה 19.9: "לפי הגדרת הלקוח - אוטומטי לזול ביותר או רק באישור").
- `POST /api/compare` מקבל `substitutes` אופציונלי בגוף (גובר על הפרופיל); ערכים לא חוקיים → 400. אנדפוינט לעדכון ההגדרה בפרופיל: `PATCH /api/me` (או המקביל שקיים).
- Handoff: `usedProductId` של שורה שהוחלפה (`status: 'substituted'`) הוא מה שעובר לאתר; `alternative` (גם של פריט חסר) לא עובר עד שהלקוח מאשר וה-UI שולח `substituteProductId` על השורה (מכניזם קיים).
- **תיקון באג 20.9**: `line.substituteProductId` שהלקוח קבע גובר תמיד כשהוא resolve-י ו-inStock ברשת - גם אם המוצר המקורי עצמו זמין שם במחירו (`substituteReason: 'customer'`); אם הוא לא resolve-י נופלים למקורי כשהוא זמין (עם `substituteTried`), אחרת ההתנהגות הקיימת (`missing`/`out_of_stock`).

### 5. חיפוש מוצרים
- לאפשר חיפוש לפי מושג: `synonyms` של המושג + `name`. תוצאות מאותו `conceptId` לקבץ ("חלב 3% - 6 מוצרים ב-9 רשתות"), מותג פרטי מסומן (`privateLabelOf`).
- מוצר מותג פרטי מופיע בתוצאות עם הרשת שלו; בהשוואה הוא יוחלף אוטומטית בשאר הרשתות (סעיף 4).

## Frontend (cartFrontend)

### 1. שורה בסל / במסך ההשוואה
- `promo` (טקסט המבצע) ו-`savings` כמו היום.
- **מחיר מועדון בשורה נפרדת** (החלטה 19.9): אם `line.club` קיים - שורה קטנה מתחת: "למועדון {label}: ₪{club.lineTotal} ({club.promo})". לא להחליף את המחיר הראשי.
- **"קח עוד {hint.addQty} וחסוך"**: אם `line.hint` קיים - כפתור/שורה: "קח {qty+addQty} ב-₪{hint.lineTotal} ({hint.promo})". לחיצה מעדכנת את הכמות.
- **מגוון**: אם `line.pooled` - תג "מבצע משותף עם {pooled.with}".
- **תחליף שהוחל** (`status: 'substituted'`, רק במצב `apply: 'auto'` או אחרי שהלקוח לחץ "החלף"): להציג את `storeItemName` עם "במקום {substituteFor}" ותג: `substituteReason === 'missing'` → "לא נמכר ברשת זו, הוחלף"; `'cheaper'` → "הוחלף בזול יותר".
- **הצעת תחליף** (`line.alternative`, מצב "לשאול אותי" - ברירת המחדל): `alternative.reason === 'missing'` → השורה חסרה (`status: 'missing'`, `lineTotal: 0`) ומתחתיה "לא נמכר ברשת זו. דומה: {alternative.name} ₪{alternative.lineTotal} [החלף]"; `reason === 'cheaper'` → "יש זול יותר: {alternative.name} ₪{alternative.lineTotal}, חיסכון ₪{alternative.savings}" + תג "מותג פרטי" אם `alternative.privateLabel` + **[החלף]**. לחיצה על "החלף" מציבה `substituteProductId = alternative.productId` על השורה ומרעננת השוואה; "בטל" = `substituteProductId: null`.

### 2. כרטיס רשת במסך ההשוואה
- `subtotal`/`grandTotal` כמו היום; `savings` → "מבצעים חסכו ₪X".
- `club` → שורה נפרדת: "עם מועדון {club.label}: ₪{club.grandTotal} (חיסכון ₪{club.savings})". הדירוג לפי הסכום הרגיל בלבד.
- `withAlternatives` → "עם תחליפים: ₪{withAlternatives.grandTotal} (חיסכון ₪{savings}, {count} פריטים)" + כפתור "החל הכל" (מציב `substituteProductId` על כל השורות עם `alternative`).
- `substitutedCount` → "{n} פריטים הוחלפו" ליד כיסוי הסל.

### 3. הגדרות
- מסך הגדרות: "תחליפים ומותג פרטי": (א) מה להציע: "רק מותג פרטי של הרשת" (ברירת מחדל) / "כל מוצר זול יותר" / "לא להציע"; (ב) איך: "לשאול אותי" (ברירת מחדל) / "להחליף אוטומטית". נשמר בפרופיל (Backend §4) ונשלח ב-`substitutes` ל-compare.

### 4. חיפוש ותצוגת מוצר
- תג "מותג פרטי של {chain}" על מוצר עם `privateLabelOf`; `size` להצגה אחידה ("1 ליטר", "6 × 330 מ"ל"; `describeSize` ב-`src/catalog/size.js`).
- קיבוץ תוצאות לפי `conceptId` עם שם המושג; מוצר מותג פרטי שנבחר לסל יקבל בהשוואה תחליף אוטומטי ברשתות האחרות (להסביר בטקסט קטן: "ברשתות אחרות יושווה מוצר דומה").

### 5. מקור ותאריך
ללא שינוי: ליד כל מחיר "לפי מחירון {chain} מ-{generatedAt}" (`priceList`).

## תקלת ייצור 20-21.9 והלקח לחוזה

מחיקת `deliveryCities` מ-`data/chains.json` (בעקבות החלטת 20.9) הפילה את מסך ההשוואה בייצור: כל צרכן שחישב כיסוי מהשדה קרא את היעדרו כ"אף רשת לא מספקת", ובלי סניף מספק גם העמלה יצאה 0. השדה הוחזר (`["*"]`, כניסוח ההחלטה ולא כניחוש), ונקבע כלל: **שדה שפורסם לא נמחק ולא משנה משמעות; שינויים בחוזה הם תוספתיים בלבד, ומחיקה דורשת גרסה ואישור שכל הקוראים הסתגלו.** גם CDN: raw.githubusercontent ענה 304 לבקאנד מול עותק ישן במשך ~30 שעות; הבקאנד שולח עכשיו `Cache-Control: no-cache`.

**cartBackend `df4c5bf` (21.9)**: ממיישם את 20.9 בעצמו (כתובת לעולם לא מסירה רשת; עיר לא מוכרת → סניף ברירת המחדל), ו-`/chains` מחזיר לכל רשת `pickupOnly`, `inStoreOnly`, `deliveryKnown`, `minOrderKnown`. ה-Frontend יכול להציג תג איסוף עצמי ולהבחין בין "תנאים לא ידועים" ל-₪0. `notDelivering` יכיל מעתה רק רשתות `inStoreOnly`.

## דירוג עם או בלי דמי משלוח (הוחלט 20.9)

`POST /api/compare` מקבל `ranking: 'total'|'goods'`; ברירת המחדל `total` שומרת על ההתנהגות הקיימת. התשובה מחזירה `ranking`. **Frontend**: מתג "לכלול דמי משלוח בהשוואה", ולידו הסבר קצר - רשת איסוף עצמי אינה גובה משלוח, ולכן בדירוג לפי סכום כולל היא תנצח גם כשהקנייה עצמה יקרה יותר. סמנו בבירור מנצח שהוא `pickupOnly`. **Backend**: להעביר את הבחירה מהפרופיל או מהבקשה.

## תוספות 20.9: קטגוריות ומוצרי מושג
- **קטגוריות**: המחירונים לא מכילים קטגוריה; היא מחושבת אצלנו (`category` על המוצר). ה-UI מציג לפי `category` בלבד. "כללי" גדול בכוונה (מוצר לא ברור לא נכנס לקטגוריה שגויה). ה-Backend לא צריך לחשב קטגוריות; אם צריך סיווג עדין יותר בחיפוש - לפי `conceptId` ושם המושג.
- **מוצרי מושג** (`kind: 'concept'`, `gtin: null`, `isWeighted: true`, `unit: 'ק"ג'`): מלפפון, עגבניות, בננה, סלמון, פסטרמה... בהשוואה הם מתומחרים לק"ג לפי הפריט השקיל הזול של כל רשת (`matchMethod: 'concept'`, `storeItemName` = שם הפריט של הרשת). כמות = ק"ג (עשרוני). **Frontend**: להציג אותם בקטגוריה עם יחידה "ק"ג", בורר כמות עשרוני (0.5, 1, 1.5), ובמסך ההעברה לעגלה לסמן "לא ניתן להעברה לעגלה עדיין" (כמו כל שקיל). **Backend**: לא לדרוש `gtin` על מוצר; `id` יכול להתחיל ב-`c-`; פריטי קטלוג שקילים נושאים `conceptId`; handoff מדלג על שקילים ומדווח אותם ב-`skipped` עם סיבה `weighted`.

## מהפך המחלקות 20.9: כל מוצר נסקר אחד-אחד

הדיווחים ("מיץ פטל בפירות", "אסם פודינג אינסטנט בחלב וביצים", "155 מתוך 190 בירקות ופירות מעובדים")
לא היו באגים נקודתיים אלא תסמין: הקטגוריה חושבה ממילות מפתח בלבד. **כל 7,231 המוצרים עברו סקירה פרטנית**
מול טקסונומיה כתובה - `docs/CATEGORIES.md` - והתוצאה נשמרת כתווית מפורשת לכל מוצר
(`config/categories/labels.json`, גובר על המושג ועל מילות המפתח).

**מה משתנה בנתונים**: רק שדה `category` (ו-`icon` שנגזר ממנו). אין שינוי במבנה, במזהים או במחירים.
מספרים לפני/אחרי: כללי 1,051 → 187, ניקיון וטואלטיקה 1,221 → 1,671, מעדנייה 250 → 544,
חלב וביצים 691 → 828, ירקות ופירות 187 → 225, בשר ועוף 215 → 128 (נקניקים ומעושנים עברו למעדנייה).

**Frontend - מה כדאי לעשות**
1. שום שינוי קוד לא נדרש; רענון `products.json` מספיק.
2. **תוויות תצוגה**: מפתחות ה-`category` נשארים כמו שהם לנצח, אבל שתיים מהתוויות מטעות את הלקוח.
   מומלץ להציג: `שימורים` → "מזווה ושימורים", `מעדנייה` → "מעדנייה וקפואים", `בשר ועוף` → "בשר, עוף ודגים",
   `כללי` → "שונות". המיפוי המלא בראש `docs/CATEGORIES.md`.
3. קפה, תה וקפסולות עברו ל"משקאות"; חד"פ, נייר וסוללות ל"ניקיון וטואלטיקה"; ירקות קפואים, נקניקיות,
   סלטים מוכנים וטופו ל"מעדנייה"; עוגיות, וופלים וגלידה ל"חטיפים וממתקים"; אבקות (פודינג, ג'לי, מרק)
   ותבלינים ל"שימורים". אם יש אצלכם מיפוי קשיח כלשהו לפי שם מוצר - למחוק אותו, הוא כבר לא נחוץ.

**Backend - מה כדאי לעשות**
1. אם ה-API מחשב קטגוריה בעצמו לפריט כלשהו - להפסיק ולקחת את `category` מהמוצר.
2. מי שטוען את `config/` (כמו המושגים) יכול לטעון גם את `config/categories/labels.json`, אבל אין צורך:
   הקטגוריה כבר מוטמעת בכל מוצר ב-`products.json`.
3. מוצר חדש שיופיע במחירונים לפני שנסקר יקבל קטגוריה ממילות המפתח, ובמקרה גבולי "כללי" - זה תקין
   וזמני עד סבב הסקירה הבא.

## שאלות פתוחות לנאור
1. מותגי בית של טיב טעם, קשת טעמים, מחסני השוק, שוק העיר (הקבצים לא מסמנים; צריך שם מותג).
2. ~~החלפה אוטומטית של פריט חסר~~ הוחלט 20.9: גם פריט חסר שואל (`alternative.reason: 'missing'`); רק `apply: 'auto'` מחליף לבד.

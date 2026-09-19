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
- Handoff: `usedProductId` של שורה שהוחלפה (`status: 'substituted'`) הוא מה שעובר לאתר; `alternative` לא עובר עד שהלקוח מאשר וה-UI שולח `substituteProductId` על השורה (מכניזם קיים).

### 5. חיפוש מוצרים
- לאפשר חיפוש לפי מושג: `synonyms` של המושג + `name`. תוצאות מאותו `conceptId` לקבץ ("חלב 3% - 6 מוצרים ב-9 רשתות"), מותג פרטי מסומן (`privateLabelOf`).
- מוצר מותג פרטי מופיע בתוצאות עם הרשת שלו; בהשוואה הוא יוחלף אוטומטית בשאר הרשתות (סעיף 4).

## Frontend (cartFrontend)

### 1. שורה בסל / במסך ההשוואה
- `promo` (טקסט המבצע) ו-`savings` כמו היום.
- **מחיר מועדון בשורה נפרדת** (החלטה 19.9): אם `line.club` קיים - שורה קטנה מתחת: "למועדון {label}: ₪{club.lineTotal} ({club.promo})". לא להחליף את המחיר הראשי.
- **"קח עוד {hint.addQty} וחסוך"**: אם `line.hint` קיים - כפתור/שורה: "קח {qty+addQty} ב-₪{hint.lineTotal} ({hint.promo})". לחיצה מעדכנת את הכמות.
- **מגוון**: אם `line.pooled` - תג "מבצע משותף עם {pooled.with}".
- **תחליף שהוחל** (`status: 'substituted'`): להציג את `storeItemName` עם "במקום {substituteFor}" ותג: `substituteReason === 'missing'` → "לא נמכר ברשת זו, הוחלף"; `'cheaper'` → "הוחלף בזול יותר". כפתור "בטל החלפה" = לשלוח `substituteProductId: null`... (החלפה אוטומטית של חסר אינה ניתנת לביטול; לרשת אין את המוצר).
- **הצעת תחליף** (`line.alternative`): שורה קטנה "יש זול יותר: {alternative.name} ₪{alternative.lineTotal}, חיסכון ₪{alternative.savings}" + תג "מותג פרטי" אם `alternative.privateLabel` + כפתור **[החלף]** שמציב `substituteProductId = alternative.productId` על השורה ומרענן השוואה.

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

## שאלות פתוחות לנאור
1. מותגי בית של טיב טעם, קשת טעמים, מחסני השוק, שוק העיר (הקבצים לא מסמנים; צריך שם מותג).
2. האם החלפה אוטומטית של פריט חסר (ברשת שלא מוכרת אותו) מקובלת כברירת מחדל, או שגם היא צריכה לכבד "לשאול אותי"? היום: תמיד אוטומטית ומסומנת.

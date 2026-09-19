# שכבת המושגים, מותג פרטי בקטלוג ותחליפים - עיצוב (19.9.2026)

מסמך עיצוב מחייב לעבודה המקבילה (PRODUCT.md §2.2-2.3, PROMOS-AND-PRIVATE-LABEL.md §3 שלבים ב'-ג'). מי שמשנה סכמה כאן - מעדכן את המסמך.

## 1. מושג (concept)
"מה שהלקוח מתכוון": `חלב 3%`, `קוטג' 5%`, `נייר טואלט`, `שמן זית`. מוצר שייך למושג אחד לכל היותר. המושג הוא הבסיס להשוואת "אותו דבר" בין רשתות ולתחליפים.

קובץ: `config/concepts/<group>.json` (כמה קבצים, נטענים ומתמזגים; `id` ייחודי בכולם). סכמה של מושג:
```json
{ "id": "milk-3", "name": "חלב 3%", "category": "חלב וביצים",
  "sizeUnit": "ml", "defaultSize": 1000,
  "synonyms": ["חלב", "חלב שלוש אחוז"],
  "match": { "all": ["חלב"], "any": ["3%", "3 %"], "none": ["סויה", "שקד", "שיבולת", "עמיד", "משקה", "אבקת", "מרוכז", "שוקו", "בטעם"] } }
```
- `sizeUnit`: `g` | `ml` | `unit` | `null` (null = אין גודל רלוונטי, למשל ירקות שקילים).
- `match`: תבניות regex (JS, ללא דגלים; מופעלות עם `iu`) על השם המנורמל (`normalizeText` מ-`src/catalog/matching.js`: בלי ניקוד/גרשיים, אותיות סופיות → רגילות, רווח יחיד). **חובה `all`**, `any` אופציונלי (לפחות אחת), `none` אופציונלי (אף אחת). מוצר שמתאים לכמה מושגים = **קונפליקט** שהדוח מציג; פותרים עם `none` או תבנית מדויקת יותר. אין ניקוד/משקלות.
- `synonyms`: לחיפוש טקסט חופשי בהמשך (לא בשימוש עדיין).

מודול: `src/catalog/concepts.js` - `loadConcepts()`, `assignConcept(name) → conceptId|null`, `conceptById`. דוח: `node scripts/concepts-report.mjs` (כיסוי לפי קטגוריה, לא-משויכים לפי מילים שכיחות, קונפליקטים). יעד: ≥85% מ-4,000 המוצרים ו-≥70% ממוצרי המותג הפרטי משויכים, 0 קונפליקטים.

## 2. גודל (size)
`src/catalog/size.js` - `parseSize(name) → { value, unit, count } | null`. `unit` ∈ `g` | `ml` | `unit`; ק"ג → g×1000, ליטר → ml×1000; מארזים `6*330 מ"ל` → `{ value: 330, unit: 'ml', count: 6 }` (value = ליחידה). אחוזי שומן אינם גודל. אם אין גודל בשם → null.

## 3. הרחבת `products.json` (שלב ב')
`scripts/build-products.mjs` מוסיף לכל מוצר: `conceptId` (או null), `size` (או null), `privateLabelOf` (chainId או null). **מוצרי מותג פרטי נכנסים לקטלוג גם כשהם נמכרים ברשת אחת** (זיהוי: `src/catalog/privateLabel.js`), עם `privateLabelOf`. הסף `--min-chains 3` נשאר לכל השאר. תקרת `--max` חלה על המשותפים; מותג פרטי נוסף מעליה. גודל היעד: ≤ ~2.5MB.

## 4. תחליפים (שלב ג') - `src/pricing/substitutes.js` + `compareCart`
מועמד לתחליף לשורה ברשת X: מוצר עם אותו `conceptId` שהרשת מוכרת (mapping.resolve לא-null, inStock), גודל בטווח ±25% (לפי `size` המנורמל; אם לאחד אין גודל והמושג עם `sizeUnit` - לא מועמד; אם `sizeUnit: null` - מועמד), הזול ביותר לכמות המבוקשת (עם מבצעים, לא מועדון).

אפשרויות ל-`compareCart({ ..., substitutes })`:
```js
{ policy: 'none' | 'privateLabel' | 'cheapest',   // מה מציעים כשיש זול יותר מאותו מושג. ברירת מחדל 'privateLabel'
  apply:  'ask' | 'auto' }                          // 'auto' = מחליפים בסכום; 'ask' = מדווחים בלבד. ברירת מחדל 'ask'
```
- **שורה חסרה ברשת** (המוצר לא נמכר שם, למשל חלב שופרסל ברמי לוי): תמיד מחליפים אוטומטית אם יש מועמד: `status: 'substituted'`, `substituteReason: 'missing'`, השם והמחיר של התחליף בשורה, המקור ב-`substituteFor`. אין מועמד → `missing` כרגיל.
- **שורה קיימת עם תחליף זול יותר**: לפי `policy` (`privateLabel` = רק מותג פרטי של הרשת זול יותר; `cheapest` = כל מוצר זול יותר). `apply: 'ask'` → השורה נשארת, מקבלת `alternative: { productId, name, storeItemName, unitPrice, lineTotal, savings, privateLabel, reason: 'cheaper' }`; הרשת מקבלת `withAlternatives: { subtotal, grandTotal, savings, count } | null`. `apply: 'auto'` → מחליפים (`status: 'substituted'`, `substituteReason: 'cheaper'`).
- `line.substituteProductId` שהלקוח קבע (קיים היום) גובר על הכל.
- handoff (`handoffService.create`): משתמש ב-`usedProductId` של השורה מתוך `comparisonRow` (קיים) - תחליף שהוחל עובר לאתר במקומו; תחליף ב-`alternative` לא.

## 5. הגדרת הלקוח
נשמרת בפרופיל (backend): `substitutes: { policy, apply }`. ברירת מחדל: `privateLabel` + `ask`. ה-UI: "יש זול יותר: X ₪Y [החלף]" מתחת לשורה, ו"עם תחליפים: ₪412 (חיסכון ₪38)" ברשת.

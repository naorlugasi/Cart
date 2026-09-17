# חוזה הנתונים של הצינור, לצד השרת (Backend) - 18.9.2026

מה הצינור מייצר, איפה, באיזה פורמט, מה מובטח ומה לא. זה מה שהשרת צורך; שינוי בפורמט = שינוי במסמך הזה קודם.

## 0. כללים שאי אפשר לשנות

1. **כל מחיר ומוצר מגיעים אך ורק מקובצי המחירים שהרשתות מפרסמות לפי תקנות שקיפות המחירים.** הצינור לא פונה לאתרי הרשתות. אין מלאי אונליין, אין תמונות, אין קודים מהאתר. אם השרת צריך משהו שאין בקבצים, זה דיון על מקור חוקי אחר, לא קריאה לאתר.
2. **הזיהוי הבין-רשתי הוא ברקוד (GTIN).** `gtin` הוא המפתח לקטלוג המאוחד ולהשוואה. קודים פנימיים של רשת (`code`, `storeItemId`) נשארים בתוך הרשת.
3. **תת-רשת = מחירון מפורסם.** יוחננוף מופיעה כשתי שורות (`yochananof`, `yochananof_b`) כי לאתר שלה שני מחירונים מפורסמים לפי נקודת איסוף. `parent` בקובץ הרשתות מקשר ביניהן. אין להציג מחירון שלא פורסם (יוחננוף C).
4. **הצינור רץ במרלוג (המק של נאור) ודוחף ל-git.** השרת (Vercel) קורא קבצים מה-repo. אין DB בענן בשלב זה.

## 1. מה קיים היום, ואיך השרת מקבל את זה

| תוצר | מיקום | עדכון | מי קורא |
|---|---|---|---|
| קטלוג מאוחד | `data/products.json` | יומי 06:00 (commit "data: daily price refresh") | `server/app.js` בעלייה |
| קטלוג לרשת | `data/catalogs/<chainId>.json` (14 קבצים + `demo.json`) | יומי | `server/app.js` בעלייה |
| רישום רשתות | `data/chains.json` | ידני, ב-git | `server/app.js` בעלייה |
| כל הסניפים | `data/pipeline/prices.duckdb` **במרלוג בלבד** (לא ב-git) | יומי אחרי הפרסום | עדיין אף אחד. ראו §4 |
| מניפסטים | `data/pipeline/runs/<date>/<chain>.json` במרלוג | יומי | ניטור |

הפריסה: push לענף `claude/cart-transfer-redirect-mvp-wyxm2l` → Vercel בונה מחדש ואורז את `data/` בפונקציה. השרת טוען הכל לזיכרון בעלייה. אין קריאת דיסק בזמן בקשה.

## 2. פורמטים

### 2.1 `data/products.json` - מערך של 4,000 מוצרים

```json
{ "id": "g7290000066318", "name": "במבה קלאסי 80 גרם", "category": "חטיפים וממתקים", "brand": "אסם",
  "unit": "יח'", "isWeighted": false, "gtin": "7290000066318", "basePrice": 4.9, "aliases": [], "icon": "🍫", "chains": 13 }
```

- `id` = `"g" + gtin`. יציב בין ימים כל עוד המוצר נמכר ב-3 רשתות לפחות (`chains >= 3`). מוצר שירד מתחת לסף נעלם מהקובץ למחרת: השרת חייב לסבול `productId` שאינו קיים (הסל של הלקוח ב-localStorage).
- `basePrice` = חציון המחירים בין הרשתות. **להצגה בלבד**, לא להשוואה.
- `name` = השם הנפוץ ביותר בין הרשתות; שמות בקבצים קצוצים (~20 תווים) לפעמים. `brand` יכול להיות `","` או ריק (איכות נתונים ידועה). `category` מ-10 קטגוריות לפי מילות מפתח, ~600 ב"כללי". `icon` הוא שריד להצגה; לא לבנות עליו.
- `isWeighted`: מוצר שקיל. **ההעברה לעגלה לא תומכת עדיין בשקילים** (כמות ביחידות בלבד).

### 2.2 `data/catalogs/<chainId>.json`

```json
{ "chainId": "ramilevy", "storeId": "039", "generatedAt": "2026-09-18T01:10:00.000Z", "priceSource": "file",
  "source": { "portal": "publishedprices", "store": "039", "storeName": "מרלוג אינטרנט", "onlineStore": true,
              "price": "https://url.publishedprices.co.il/file/d/pricefull7290058140886-039-202609170523.gz", "promo": "…", "siteCodes": null, "online": null },
  "items": [ { "storeItemId": "7290000066318", "code": "7290000066318", "gtin": "7290000066318", "name": "במבה חטיף בוטנים 80 גרם",
               "brand": "אסם", "price": 4, "isWeighted": false, "unit": "יח'", "inStock": true,
               "promotions": [ { "type": "unit", "minQty": 1, "unitPrice": 3.5, "description": "…", "promotionId": "…" } ] } ] }
```

- מכיל רק מוצרים שנמצאים ב-`products.json` (הצטלבות לפי `gtin`). מוצר של הקטלוג שאינו בקובץ של רשת = הרשת לא מוכרת אותו (או לא פרסמה).
- `price` = המחיר הרגיל מהמחירון של החנות המקוונת (`source.store`). `promotions` = חוקי מבצע מפוענחים מ-PromoFull (`type`: `unit` מחיר ליחידה מכמות, `bundle` X ב-Y, `percent`). המחיר האפקטיבי לכמות נתונה מחושב ב-`src/catalog/pricing.js`; **השרת לא צריך לחשב מבצעים בעצמו**.
- `storeItemId` = המזהה שההעברה לעגלה שולחת לאתר הרשת. ברוב הרשתות = ברקוד; בשופרסל `P_<ברקוד>` (ולברקודי 729000 `P_<המספר אחרי הקידומת>`), נגזר בנוסחה.
- `inStock` הוא **תמיד `true`** היום (אין מקור חוקי למלאי אונליין). לא לבנות עליו.
- `priceSource` הוא **תמיד `"file"`**. `source.online` ו-`source.siteCodes` תמיד `null` בבנייה היומית (כלי ביקורת ידניים בלבד).
- `source.onlineStore: false` (אושר עד): הקובץ הוא של סניף פיזי כי אין אתר; הרשת מסומנת `inStoreOnly` ב-`chains.json`.
- `generatedAt`, `source.store`, `source.price`: להציג "לפי מחירון <רשת>, חנות <store>, מ-<תאריך>" ליד כל מחיר.

### 2.3 `data/chains.json`

```json
{ "id": "yochananof", "name": "יוחננוף פיקאפ", "color": "#8cc63f", "website": "https://yochananof.co.il/",
  "pickupOnly": true, "note": "…", "branches": [ { "id": "yochananof-s116", "name": "יוחננוף פיקאפ נתניה הדרים", "city": "נתניה",
  "pickup": true, "deliveryCities": ["*"], "deliveryFee": 0, "freeDeliveryAbove": 0, "minOrder": 0, "eta": "איסוף עצמי מהסניף" } ] }
```

- דגלים: `inStoreOnly` (אין אתר, אין העברה), `pickupOnly` (הזמנה באתר לאיסוף בלבד), `parent` (תת-רשת של רשת אחרת, למשל `yochananof_b.parent = "yochananof"`).
- `branches`, דמי משלוח, מינימום ו-ערים: **ברירות מחדל שלא נבדקו** מלבד לרשתות המסומנות. לא להציג ללקוח כעובדה בלי סימון.
- רשת מופיעה בהשוואה רק אם יש לה קטלוג ב-`data/catalogs/`. `demo` היא חנות הדגמה מקומית.

## 3. מה מובטח ומה לא

- **קצב**: פעם ביום, 06:00 (ריצה חוזרת 12:00 לכשלים). אם מרלוג כבוי, הנתונים של אתמול נשארים; `generatedAt` אומר כמה הם ישנים. אין SLA תוך-יומי.
- **אטומיות**: כל 14 הקטלוגים ו-`products.json` נדחפים ב-commit אחד. פריסה אחת = מצב עקבי. רשת שנכשלה בהורדה מפילה את הריצה כולה (בלי commit), כדי שלא תיעלם מההשוואה.
- **יציבות מזהים**: `chainId` ו-`gtin` יציבים. `productId` תלוי בסף 3 רשתות. `storeItemId` נגזר בנוסחה, אין הבטחה שהאתר יקבל אותו (99.96% בביקורת האחרונה בשופרסל).
- **גודל**: `products.json` ~1MB, קטלוגים 0.5-1MB כל אחד. הכל בזיכרון של פונקציה אחת.
- **טסטים**: `npm test` מכסה את הפרסר, המיפוי, הבנייה והחוזה של הקטלוג (`test/buildProducts.test.js`, `test/fetchPrices.test.js`, `test/pipeline.test.js`). קבועי הבדיקה ב-`test/fixtures/data`, לא בנתונים החיים.

## 4. מה בדרך, ומה זה דורש מהשרת

### 4.1 DuckDB "כל הסניפים" (קיים במרלוג מ-18.9)

```sql
stores(chain_id, store_id, sub_chain, name, address, city, store_type, content_group, updated_at)      -- store_type: 1 פיזי, 2 מקוון, 3 משולב
prices_current(chain_id, store_id, code, gtin, price, unit_price, is_weighted, name, manufacturer, file_ts, run_date)   -- PK (chain_id, store_id, code)
prices_history(chain_id, store_id, code, price, valid_from, valid_to)                                    -- שינויים בלבד
files(chain_id, name, kind, store_id, ts, sha1, bytes, rows, run_date, status)
runs(run_date, chain_id, stage, status, files, rows, changed, started_at, finished_at, error)
```

היום: 7 רשתות, ~2.6 מיליון שורות, ~900 סניפים כשכל 11 הקמעונאים נטענים. **השרת לא ניגש ל-DuckDB** (הוא במרלוג). מה שיגיע לשרת הוא ייצוא:

### 4.2 הייצוא המתוכנן ל-R2 (שלב הבא בטראק)

- `public/catalogs/*.json` ו-`public/products.json`: אותם פורמטים כמו §2, בלי commit. השרת יטען אותם בעלייה וכל שעה לפי ETag, עם fallback לקבצים שב-repo. משתנה סביבה מוצע: `CATALOGS_URL`.
- `public/gtin/<gtin>.json` = `{ "<chain_id>:<store_id>": price, ... }` (~10KB לברקוד): לתמחור סל × סניפים בלי DB. 50 מוצרים = 50 בקשות קטנות מה-CDN, הסכימה בפונקציה.
- `public/stores.json` = טבלת `stores` + lat/lng (גיאוקידינג בהמשך).
- `public/pipeline-status.json` = מתי כל רשת עודכנה לאחרונה, כמה סניפים, כמה קבצים נכשלו. לדשבורד ניהול ול"עודכן ב-".

### 4.3 מה השרת צריך לספק בשלב הזה

1. **מקור נתונים ניתן להחלפה**: שכבה אחת שטוענת `products` ו-`catalogs` (היום מהדיסק; מחר מ-URL עם ETag). לא לפזר `readFileSync` בקוד.
2. **תאריך המחירון בתשובות ה-API**: `generatedAt` ו-`source.store` של כל רשת בתוך `/api/compare` ו-`/api/chains`, כדי שה-UI יציג מקור ותאריך.
3. **סובלנות למוצרים שנעלמו** (`productId` לא קיים) ולרשתות שנוספו/הוסרו בין פריסות.
4. **תת-רשת** מוצגת עם הדגלים (`pickupOnly`, `parent`), ובחירת נקודת איסוף מחליפה בין `yochananof` ל-`yochananof_b` בהמשך.
5. **`POST /api/basket/price`** (סל, מיקום, רדיוס) על גבי `public/gtin/*.json` כשהייצוא יהיה, ולא לפני. חתימת הקלט/פלט תוגדר יחד.

## 5. הרצה מקומית

```bash
npm run prices:fetch && npm run products:build   # קטלוגי האונליין (2-3 דקות; פורטלים בלבד)
node pipeline/run.mjs --chains hazihinam          # כל הסניפים של רשת אחת ל-DuckDB (דורש brew install duckdb)
duckdb data/pipeline/prices.duckdb -c "select chain_id, count(distinct store_id), count(*) from prices_current group by 1"
npm test
```

## 6. שאלות פתוחות לצד השרת

- איפה נשמרות תוצאות ההעברה (handoff) והסטטוס: היום בזיכרון של instance, מתוכנן Redis/KV. לא חלק מהצינור.
- האם ה-API של ההשוואה יעבור להיות מונע-קובץ מ-R2 (שעה של עיכוב אפשרי) או יישאר מפריסה (אפס עיכוב אחרי push)? ההמלצה: R2 כשהצינור רץ 14 יום נקי.

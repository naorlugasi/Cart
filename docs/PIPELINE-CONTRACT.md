# חוזה הנתונים של הצינור, לצד השרת (Backend) - 18.9.2026

מה הצינור מייצר, איפה, באיזה פורמט, מה מובטח ומה לא. זה מה שהשרת צורך; שינוי בפורמט = שינוי במסמך הזה קודם.

## 0. כללים שאי אפשר לשנות

1. **כל מחיר ומוצר מגיעים אך ורק מקובצי המחירים שהרשתות מפרסמות לפי תקנות שקיפות המחירים.** הצינור לא פונה לאתרי הרשתות. אין מלאי אונליין, אין תמונות, אין קודים מהאתר. אם השרת צריך משהו שאין בקבצים, זה דיון על מקור חוקי אחר, לא קריאה לאתר.
2. **הזיהוי הבין-רשתי הוא ברקוד (GTIN).** `gtin` הוא המפתח לקטלוג המאוחד ולהשוואה. קודים פנימיים של רשת (`code`, `storeItemId`) נשארים בתוך הרשת. מ-22.9 `gtin` יכול להיות גם **11 ספרות**: ברקוד UPC-A אמריקאי שכל הרשתות מפרסמות בלי האפס המוביל (בן אנד ג'ריס, טבסקו, סניידרס, פריסקיז); הוא מתקבל רק כשספרת הביקורת מאמתת, ונשמר **כפי שפורסם** (בלי ריפוד) כי כך כל הרשתות מסכימות עליו. צרכן שמנרמל ברקודים ל-13 ספרות צריך להשוות לפי המחרוזת שבקובץ.
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

### 2.1 `data/products.json` - מערך של ~9,000 מוצרים (עד 6,000 משותפים מ-22.9, קודם 4,000 + מותג פרטי + מוצרי הסל)

```json
{ "id": "g7290000066318", "name": "במבה קלאסי 80 גרם", "category": "חטיפים וממתקים", "brand": "אסם",
  "unit": "יח'", "isWeighted": false, "gtin": "7290000066318", "basePrice": 4.9, "aliases": [], "icon": "🍫", "chains": 13,
  "conceptId": "bamba", "size": { "value": 80, "unit": "g", "count": 1 }, "privateLabelOf": null }
```

שדות מ-19.9 (docs/CONCEPTS.md):
- `conceptId` (string|null): המושג של המוצר ("מה הלקוח מתכוון": `milk-3`, `toilet-paper`...). ~73% מהמוצרים. הגדרות ב-`config/concepts/*.json` (326 מושגים; `name`, `synonyms`, `sizeUnit`, `defaultSize`).
- `size` ({value, unit: g|ml|unit, count}|null): גודל מנורמל ליחידה (ק"ג→g, ליטר→ml) וכמות במארז. ~78%.
- `kind: 'concept'` (20.9, docs/CONCEPTS.md §6): **מוצר מושג לשקילים** - `id: 'c-<conceptId>'`, `gtin: null`, `isWeighted: true`, `unit: 'ק"ג'`, `conceptId`, `size: null`. ~45 מוצרים (ירקות ופירות, מעדנייה במשקל) שכל רשת מוכרת תחת קוד פנימי משלה; בקטלוג הדק של הרשת הפריטים השקילים נושאים `conceptId`, והמיפוי בוחר את הזול במלאי (`method: 'concept'`). **ההעברה לעגלה תומכת בשקילים מ-22.9** (docs/HANDOFF.md, "מוצרים שקילים"): פריטי ה-handoff נושאים `isWeighted` ו-`unit`, `qty` בק"ג, וה-injector שולח אותם בפורמט השקיל של כל רשת; אין יותר צורך לסמן "לא ניתן להעברה".
  - `chains` על מוצר מושג אינו ספירה של מי מוכר אותו אלא **מספר משפחות הרשתות שהפריט השקיל שלהן קבע את המחיר**: המחיר הוא החציון של הפריט השקיל הזול בכל משפחה, ומוצר נוצר רק מ-3 משפחות ומעלה. לכן `chains: 3` הוא רצפה, לא ביטחון - השוואה על בסיס שלוש רשתות בלבד. הפיזור בין המחירים האלה אינו מתפרסם; מי שצריך אותו יכול לחשב מהקטלוגים הדקים, שבהם הפריטים השקילים נושאים `conceptId`.
- `privateLabelOf` (chainId|null): מותג פרטי של הרשת. **מוצרי מותג פרטי נכנסים לקובץ גם כשהם נמכרים ברשת אחת** (~3,200 מוצרים: שופרסל 1,764, רמי לוי 776, קרפור/קוויק/ביתן 856, יוחננוף 99...). ה-`id` שלהם יציב כל עוד הרשת מוכרת אותם. תת-רשתות מקבלות את ראש המשפחה (`carrefour`, `yochananof`).

- `id` = `"g" + gtin`. יציב בין ימים כל עוד המוצר נמכר ב-3 רשתות לפחות (`chains >= 3`), או שהוא מותג פרטי (`privateLabelOf`). מוצר שירד מתחת לסף נעלם מהקובץ למחרת: השרת חייב לסבול `productId` שאינו קיים (הסל של הלקוח ב-localStorage).
- `basePrice` = חציון המחירים בין הרשתות. **להצגה בלבד**, לא להשוואה.
- `name` = השם הנפוץ ביותר בין הרשתות, ובעדיפות לשם לא-קצוץ (כמחצית הרשתות קוצצות שמות ל-~20 תווים; `size` ו-`conceptId` נגזרים מכל השמות של הברקוד, לא רק מהמוצג). מ-22.9 שם תצוגה ידני מ-`config/categories/names.json` גובר כשקיים (מוצרים בודדים שהשם הנפוץ שלהם סתום), והשם הנפוץ עובר אז ל-`aliases` - לכן `aliases` כבר אינו תמיד ריק, וחיפוש צריך לכלול אותו. `brand` יכול להיות `","` או ריק (איכות נתונים ידועה). `category` מ-10 קטגוריות - **הקבצים לא מכילים קטגוריה**; היא נקבעת אצלנו. מ-20.9 כל מוצר בקטלוג עבר סקירה פרטנית מול טקסונומיה כתובה (`docs/CATEGORIES.md`) והתוצאה שמורה ב-`config/categories/labels.json`; מילות המפתח ב-`src/catalog/categorize.js` הן רק נפילה אחורה למוצר חדש שטרם נסקר. "כללי" ירד מ-1,051 ל-187 מוצרים. `icon` הוא שריד להצגה; לא לבנות עליו.
- `isWeighted`: מוצר שקיל. **ההעברה לעגלה לא תומכת עדיין בשקילים** (כמות ביחידות בלבד).

### 2.2 `data/catalogs/<chainId>.json`

```json
{ "chainId": "ramilevy", "storeId": "039", "generatedAt": "2026-09-18T01:10:00.000Z", "sourceDate": "2026-09-17T05:23:00+03:00", "priceSource": "file",
  "source": { "portal": "publishedprices", "store": "039", "storeName": "מרלוג אינטרנט", "onlineStore": true,
              "price": "https://url.publishedprices.co.il/file/d/pricefull7290058140886-039-202609170523.gz", "promo": "…", "siteCodes": null, "online": null },
  "items": [ { "storeItemId": "7290000066318", "code": "7290000066318", "gtin": "7290000066318", "name": "במבה חטיף בוטנים 80 גרם",
               "brand": "אסם", "price": 4, "isWeighted": false, "unit": "יח'", "inStock": true, "updatedAt": "2026-09-17",
               "promotions": [ { "type": "multi", "minQty": 3, "totalPrice": 10, "club": false, "validTo": "2026-10-03",
                                 "promotionId": "…", "description": "3 ב-10 ₪" } ] } ] }
```

- מכיל רק מוצרים שנמצאים ב-`products.json` (הצטלבות לפי `gtin`). מוצר של הקטלוג שאינו בקובץ של רשת = הרשת לא מוכרת אותו (או לא פרסמה).
- `price` = המחיר הרגיל מהמחירון של החנות המקוונת (`source.store`). `promotions` = חוקי מבצע מפוענחים מ-PromoFull (מ-19.9 בכל 14 הרשתות, `src/catalog/promoRules.js`). סוגי חוק:
  `multi` {minQty, totalPrice} "3 ב-10" · `unit` {minQty, unitPrice} מחיר ליחידה (מכמות minQty; לשקילים = לק"ג) · `percent` {minQty, percent} · `bundleFree` {minQty, freeQty} "2+1" · `second` {minQty:2, percent} השני ב-X% · `discount` {amount}.
  שדות משותפים: `maxQty` (אופציונלי, מעבר לו מחיר מדף), **`club`** (true = למועדון בלבד; `clubLabel` שם המועדון), `validTo` (YYYY-MM-DD), `promotionId`, `description`.
  קופונים, שוברים, מתנות, משלוחים, מבצעי "קנה מעל X ₪" ומבצעים שפג תוקפם **לא נכנסים** לקובץ.
- **`updatedAt`** (מ-22.9, אופציונלי, `YYYY-MM-DD`): תאריך העדכון של **הפריט הבודד**, מתוך `PriceUpdateDate`/`PriceUpdateTime` בקובץ ה-XML של הרשת (12 מ-14 הרשתות מפרסמות את השם השני; `src/catalog/priceXml.js#normalizeUpdatedAt`). `null` כשהשדה חסר בקובץ או לא בפורמט תאריך תקין. זה תאריך **לפריט**, בנוסף ל-`sourceDate`/`asOf` **של הרשת כולה** (מטה) - פריט שלא עודכן בקובץ האחרון יכול לשאת תאריך ישן יותר מהמחירון.
- `privateLabel: true` (מ-19.9, אופציונלי) = הפריט הוא המותג הפרטי של הרשת, לפי `config/private-label.json` (קידומת GS1 של הרשת: שופרסל 7296073, קרפור 3560070/1; או שם המותג בשם המוצר: "רמי לוי", "חסכון", "יוחננוף"...). `src/catalog/privateLabel.js`. היום כמעט אף מוצר מותג פרטי לא נמצא ב-`products.json` (הוא נמכר ברשת אחת, והקטלוג דורש 3) - זה שלב ב' בתוכנית המותג הפרטי. המחיר האפקטיבי לכמות נתונה מחושב ב-`src/pricing/promotions.js` (`priceLine`): המבצע הטוב ביותר לשורה; **מבצעי מועדון לעולם לא נכנסים לסכום הרגיל** ומוחזרים בנפרד (`club`). **השרת לא צריך לחשב מבצעים בעצמו** - להשתמש במודול.
- `storeItemId` = המזהה שההעברה לעגלה שולחת לאתר הרשת. ברוב הרשתות = ברקוד; בשופרסל `P_<ברקוד>` (ולברקודי 729000 `P_<המספר אחרי הקידומת>`), נגזר בנוסחה.
- `inStock` הוא **תמיד `true`** היום (אין מקור חוקי למלאי אונליין). לא לבנות עליו.
- `priceSource` הוא **תמיד `"file"`**. `source.online` ו-`source.siteCodes` תמיד `null` בבנייה היומית (כלי ביקורת ידניים בלבד).
- `source.onlineStore: false` (אושר עד): הקובץ הוא של סניף פיזי כי אין אתר; הרשת מסומנת `inStoreOnly` ב-`chains.json`.
- `generatedAt`, `source.store`, `source.price`: להציג "לפי מחירון <רשת>, חנות <store>, מ-<תאריך>" ליד כל מחיר.
- **`sourceDate`** (מ-22.9, ISO עם היסט ישראל, או `null` כשאין חותמת בשם הקובץ): הרגע שבו **הרשת** ייצרה את קובץ המחירים, מתוך שם הקובץ בפורטל. `generatedAt` הוא רק זמן ההורדה. ההבדל מהותי בשבת ובחג: אין פרסום מחירונים, ההורדה לוקחת את הקובץ האחרון (של שישי), ו-`generatedAt` אומר "היום" על מחירים של אתמול. **"מחירים נכונים ל-…" ו-`stale` נמדדים מול `sourceDate`**, עם `generatedAt` כגיבוי כשהוא `null`. `src/catalog/priceList.js` מחזיר `asOf` שכבר עושה את הבחירה הזאת.
- **`fetchStatus`, `failedSince`, `fetchedAt`** (מ-22.9, תוספתיים - החלטת נאור 22.9, ראו §2.4): מועתקים אל תוך הקטלוג הדק מ-`data/pipeline-status.json` כך שצרכן שקורא רק את הקטלוג של רשת אחת (בלי לטעון את קובץ הסטטוס בנפרד) עדיין יודע אם המחירים שהוא מציג ישנים. `fetchStatus` הוא `"ok"` או `"failed"` (ברירת מחדל `"ok"` כשאין רשומה לרשת בקובץ הסטטוס, או שאין קובץ סטטוס בכלל - מצב שקול ל"אין תקלה ידועה"). `failedSince` ו-`fetchedAt` הם ISO או `null`; הם מועתקים כלשונם מרשומת הרשת בקובץ הסטטוס, גם כש-`fetchStatus` הוא `"ok"`. רשת עם `fetchStatus: "failed"` **ממשיכה להיבנות מה-`catalog.full.json` הקיים** - `items` ו-`sourceDate` הם של הקובץ הישן, בלי גבול ימים; רק רשת בלי שום קובץ מוסרת (§2.4).

### 2.3 `data/chains.json`

```json
{ "id": "yochananof", "name": "יוחננוף פיקאפ", "color": "#8cc63f", "website": "https://yochananof.co.il/",
  "pickupOnly": true, "note": "…", "branches": [ { "id": "yochananof-s116", "name": "יוחננוף פיקאפ נתניה הדרים", "city": "נתניה",
  "pickup": true, "fulfilment": "pickup", "deliveryCities": ["*"], "deliveryFee": null, "deliveryKnown": false,
  "pickupFee": 15, "pickupFeeKnown": true, "minOrder": null, "minOrderKnown": false, "eta": "איסוף עצמי מהסניף",
  "deliveryTerms": { "verifiedAt": "2026-09-22", "source": "https://yochananof.co.il/assets/website-policy.pdf", "note": "…" } } ] }
```

- **דמי הערוץ (22.9).** `fulfilment` על הסניף: `"delivery"` | `"pickup"` | `"inStore"`. לסניף שמספק, הדמים הם `deliveryFee`; לנקודת איסוף הם **`pickupFee`** (+`pickupFeeKnown`), ו-`deliveryFee` שלה הוא `null` כי אין משלוח. צרכן שמסכם "מוצרים + deliveryFee" מקבל לנקודת איסוף "לא ידוע" ולא 0, ומי שרוצה את הסכום הנכון מוסיף את דמי הערוץ לפי `fulfilment`. יוחננוף פיקאפ: ₪15 דמי שירות לכל הזמנה (תקנון 1.9). `pickupAvailable: true` + `pickupFee` על סניף שמספק = אפשר גם לאסוף (שוק העיר, ₪15 לפחות).

- דגלים: `inStoreOnly` (אין אתר, אין העברה), `pickupOnly` (הזמנה באתר לאיסוף בלבד), `parent` (תת-רשת של רשת אחרת, למשל `yochananof_b.parent = "yochananof"`).
- `branches`, דמי משלוח, מינימום ו-ערים: **ברירות מחדל שלא נבדקו** מלבד לרשתות המסומנות. לא להציג ללקוח כעובדה בלי סימון.
- רשת מופיעה בהשוואה רק אם יש לה קטלוג ב-`data/catalogs/`. `demo` היא חנות הדגמה מקומית.

### 2.4 `data/pipeline-status.json`

חוזה עם חבילת A1 (docs/PLAN-PER-CHAIN-AND-PRICE-HISTORY.md §A2), תוספת בלבד:

```json
{ "runAt": "2026-09-23T05:58:12+03:00",
  "chains": {
    "shufersal": { "status": "ok",     "sourceDate": "2026-09-23T03:40:00+03:00", "fetchedAt": "2026-09-23T05:56:10+03:00", "failedSince": null, "attempts": 1, "error": null },
    "victory":   { "status": "failed", "sourceDate": "2026-09-21T05:18:49+03:00", "fetchedAt": "2026-09-21T05:57:02+03:00",
                   "failedSince": "2026-09-22T05:55:00+03:00", "attempts": 4, "error": "laib: list returned 0 files" } } }
```

- `status` (לכל רשת): `"ok"` (ההורדה האחרונה הצליחה) | `"failed"` (ההורדה נכשלה, אבל יש `catalog.full.json` ישן על הדיסק - מוצג הקובץ האחרון) | `"missing"` (אין שום `catalog.full.json` בכלל - הרשת לא בהשוואה).
- `sourceDate`, `fetchedAt`: כמו ב-§2.2, של הקובץ האחרון שקיים (גם אם הוא ישן).
- `failedSince`: מאיזה רגע הרשת ב-`"failed"` ברציפות; `null` כשהיא `"ok"`. `attempts`, `error`: לניטור ולספר הרשתות (`docs/RUNNER-MAC.md`), לא לצרכן.
- **הכלל**: רשת עם `status: "failed"` **ממשיכה להיבנות מהקובץ הישן, בלי גבול ימים**, ו**חייבת** להיות מוצגת עם כוכבית אדומה: "אין לנו מחירים עדכניים לרשת זו בגלל תקלה. המחירים מ-`<sourceDate>`". הדירוג בהשוואה לא משתנה - הרשת נשארת במקומה, רק מסומנת. רק רשת `"missing"` יורדת מההשוואה (כמו היום).
- **הבנייה (`scripts/build-products.mjs`) קוראת את הקובץ**, אם הוא קיים (`readPipelineStatus`, סובלנית לקובץ חסר או פגום - אז כל רשת נחשבת `"ok"`), ומעתיקה `fetchStatus`/`failedSince`/`fetchedAt` לכל קטלוג דק (§2.2). כשהיא מסירה קטלוג של רשת בלי `catalog.full.json` היא גם מסמנת אותה `"missing"` בקובץ הסטטוס (`markChainsMissing`, `writePipelineStatus` - כתיבה אטומית, temp file + rename) ומדפיסה שורה בקול: `<chain> MISSING: no price data on disk - not in the comparison`. **הבנייה לא יוצרת את הקובץ אם הוא לא קיים** - זה תפקיד A1/`daily-refresh.sh`; היא רק מעדכנת קובץ שכבר קיים.
- מי שכותב את הקובץ (A1, `scripts/fetch-prices.mjs`/`daily-refresh.sh`) יכול להחליף את הפונקציות המקומיות ב-`scripts/build-products.mjs` (`readPipelineStatus`/`writePipelineStatus`) בייבוא מ-`scripts/lib/pipelineStatus.mjs` המשותף כשהוא ימוזג - החתימה זהה בכוונה.

### 2.5 `data/sal-israel.json` ו-`data/sal-israel-history.jsonl`

"הסל של ישראל" (`docs/SAL-ISRAEL.md`, `config/sal-israel.json`, `src/basket/salIsrael.js`,
`scripts/sal-israel.mjs`) - 110 שורות-בסיס ("קווים") שמשרד הכלכלה וקרפור התחייבו עליהן, מתומחרות בכל קטלוג
אונליין (§2.2) בדיוק כמו סל השוואה רגיל (`priceLine`, `src/pricing/promotions.js`, מבצעי מועדון לא
נכללים לעולם). חוזה תוספתי, נכתב אטומית (tmp+rename) כחלק מ-`publish_catalog()` ב-
`scripts/daily-refresh.sh` מיד אחרי `products:build` - **שלב לא חוסם**: כישלון שלו הוא אזהרה בלוג
(`warn: sal-israel: ...`), לא עצירת הריצה; האתר ממשיך להציג את הקובץ האחרון שפורסם.

**שורה (line) מול ברקוד (מ-23.9):** כמה מהקווים בחוברת מודפסים עם כמה ברקודים לאותו קו (גדלים/שלבים
שונים באותו מחיר, למשל חיתולי האגיס או מטרנה חלבי) - `config/sal-israel.json` מייצג כל קו כאובייקט אחד
עם `gtin` (הברקוד הראשי, המודפס ראשון) ו-`gtins` (מערך כל הברקודים המודפסים לאותו קו, כולל הראשי). קו
נחשב "יש לרשת" אם יש לה **ולו ברקוד אחד מתוכם**; התא של הרשת לקו מתומחר לפי **הזול מבין הווריאנטים הזמינים**
אצלה, ו-`cells[chainId].gtin` מתעד איזה ברקוד ספציפי ניצח (`null` כשהתא מושלם/imputed - לא נבחר פריט
אמיתי). ראו `docs/SAL-ISRAEL.md` למתודולוגיה המלאה ולמה 112 השורות המקוריות הפכו ל-110 קווים.

```json
{ "version": 1, "date": "2026-09-22", "generatedAt": "2026-09-22T06:03:11.000Z",
  "basket": { "name": "הסל של ישראל", "source": "…", "publishedOn": "2026-04" },
  "ministry": { "reference": 1472, "marketAverage": 1700, "carrefourCommitment": 1098, "stores": 54 },
  "rules": { "minCoverage": 0.85, "historyDays": 90 },
  "chains": { "carrefour": { "name": "קרפור", "color": "#004e9f" }, "shufersal": { "name": "שופרסל", "color": "…" } },
  "ranking": [ { "chainId": "carrefour", "name": "קרפור", "color": "#004e9f", "total": 1202.6,
                 "found": 103, "imputed": 0, "coverage": 0.92, "vsReference": -269.4, "vsMarket": -497.4,
                 "vsCommitment": 104.6,
                 "priceStatus": { "status": "ok", "sourceDate": "2026-09-22T05:10:15+03:00", "failedSince": null } } ],
  "excluded": [ { "chainId": "shufersal", "name": "שופרסל", "color": "…", "coverage": 0.82, "reason": "low-coverage" } ],
  "products": [ { "gtin": "7290018540329", "gtins": ["7290018540329"], "name": "אנג'ל פיתה פיתה",
                  "category": "מאפים ולחם", "qty": 1, "unit": "יח'", "referencePrice": null, "carrefourPrice": 7.9,
                  "cells": { "carrefour": { "price": 7.9, "promo": null, "imputed": false, "gtin": "7290018540329" }, "…": {} },
                  "cheapest": "carrefour" } ],
  "history": { "carrefour": [ { "date": "2026-09-22", "total": 1202.6 } ] } }
```

- **`chains`** (תוספת, מ-22.9): מפה שטוחה `{ [chainId]: { name, color } }` לכל רשת שהשתתפה בחישוב (כלומר
  יש לה קטלוג) - כדי שצרכן שרוצה רק שם/צבע לא יצטרך לחפש בתוך `ranking`/`excluded`. תוספתי בלבד: `name`
  ו-`color` נשארים גם על כל שורת `ranking`/`excluded`, כמו קודם.
- **`demo` לעולם לא מופיעה** - לא ב-`chains`, לא ב-`ranking`, לא ב-`excluded`, לא במפתחות `cells` של אף
  מוצר. זו חנות הדגמה המקומית (`data/catalogs/demo.json`), לא רשת אמיתית.
- **דירוג (`ranking`):** רק רשתות עם כיסוי בפועל (`found`, לא כולל `imputed`) `>= rules.minCoverage`
  (85%) - כיסוי נספר **לפי קווים**, לא לפי ברקודים: רשת שמוכרת ולו ברקוד אחד מתוך `gtins` של קו נחשבת
  ל-`found` על אותו קו כולו. האחרות ב-`excluded[]` עם `reason`: `"no-catalog"` (0 קווים נמצאו) או
  `"low-coverage"`.
- **השלמה (`imputed: true` על תא בודד):** קו שרשת לא מוכרת אף אחד מהברקודים שלו מקבל את חציון הרשתות
  שכן מוכרות אותו (לפי הווריאנט הזול שכל רשת בחרה), כדי שרשת לא תיפסל על קו בודד חסר; לא נספר כ-`found`,
  ולא יכול להיות `cheapest`. תא מושלם נושא תמיד `promo: null` ו-`gtin: null` (אין פריט אמיתי שנבחר).
- **`cells[chainId].gtin`** (תוספת, מ-23.9): הברקוד הספציפי מתוך `gtins` של הקו שהרשת מוכרת אותו זול
  ביותר (ולכן תומחר בתא) - `null` כשהתא `imputed`. שימושי לקישור/הצגת הפריט המדויק.
- **`cells[chainId].promo`** הוא **טקסט המבצע** (`priceLine().promoText`, כמו ב-`compare.js`, למשל
  `"3 ב-24 ₪"`) או `null` כשאין מבצע - **לא `boolean`**.
- **`priceStatus`** באותה צורה בדיוק כמו `ChainPriceStatus` של הבקאנד
  (`docs/FRONTEND-BACKEND-UPDATES.md`): `{ status: "ok"|"failed", sourceDate, failedSince }`.
  `status` נגזר מ-`fetchStatus` של קטלוג הרשת (§2.2/§2.4, לא שדה חדש בצינור: `"failed"` → `"failed"`,
  כל דבר אחר (כולל קטלוג בלי רשומת סטטוס בכלל) → `"ok"`) - אותה כוכבית אדומה צריכה לחול כאן כמו
  בהשוואה הרגילה.
- **`data/sal-israel-history.jsonl`**: שורה אחת (`{chainId, date, total}`) לכל רשת לכל יום, לא ב-JSON
  יחיד (כדי שריצה חוזרת של אותו יום תוכל להחליף רק את שורות היום, לא לשכתב קובץ ענק). `data/sal-israel.json.history`
  מכיל רק את `rules.historyDays` הימים האחרונים (חיתוך); ה-jsonl הוא המקור המלא.
- **`config/sal-israel.json`** (הקונפיג הסטטי, נטען דרך `src/basket/salIsraelConfig.js`) מתעדכן ידנית,
  לא על ידי הריצה היומית; רשימה ריקה שם היא מצב חוקי (הריצה מדלגת עם `exit 2` "warn", לא נכשלת). מ-22.9
  `scripts/build-products.mjs` תמיד כולל בקטלוג המאוחד כל ברקוד שמופיע בקונפיג הזה (מ-23.9: **כל** הברקודים
  ב-`gtins` של כל קו, לא רק `gtin` הראשי), גם כשהוא נמכר בפחות מ-`--min-chains` רשתות (כמו החריג הקיים
  למותג פרטי) - אחרת המוצר נעדר מהקטלוגים הדקים של כל הרשתות ומטה את כל הדירוג כלפי מטה.

## 3. מה מובטח ומה לא

**כלל חוזה (21.9, אחרי תקלת ייצור):** שדה שפורסם אינו נמחק ואינו משנה משמעות. שינויים הם תוספתיים; הסרה של שדה דורשת גרסה מפורשת ווידוא שכל הצרכנים הסתגלו. `null` בשדה מספרי פירושו "לא ידוע" ולא 0, ולצידו מתפרסם דגל `…Known` מפורש כדי שקורא שממיר null ל-0 לא יאבד את ההבחנה.

- **קצב**: פעם ביום, 06:00 (ריצה חוזרת 12:00 לכשלים). אם מרלוג כבוי, הנתונים של אתמול נשארים; `generatedAt` אומר כמה הם ישנים. אין SLA תוך-יומי.
- **אטומיות**: כל 14 הקטלוגים ו-`products.json` נדחפים ב-commit אחד. פריסה אחת = מצב עקבי. רשת שנכשלה בהורדה מפילה את הריצה כולה (בלי commit), כדי שלא תיעלם מההשוואה.
- **יציבות מזהים**: `chainId` ו-`gtin` יציבים. `productId` תלוי בסף 3 רשתות. `storeItemId` נגזר בנוסחה, אין הבטחה שהאתר יקבל אותו (99.96% בביקורת האחרונה בשופרסל).
- **גודל**: `products.json` ~1MB, קטלוגים 0.5-1MB כל אחד (מ-22.9: **כ-8%+** מ-`updatedAt` לכל פריט - שופרסל 1.51MB→1.63MB). הכל בזיכרון של פונקציה אחת.
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

מבצעים (הוחלט 19.9): לכל שורה `lineTotal` (עם המבצע הטוב לכל הלקוחות), `promo` (טקסט), `savings`, ובנפרד `club: {lineTotal, promo, savings, label}|null` (מחיר מועדון, רק כשהוא זול יותר) ו-`hint: {addQty, lineTotal, promo}|null` ("קח עוד 1 וחסוך"). מבצעי "מגוון" (אותו `promotionId` על כמה ברקודים) מאוגדים בין שורות הסל (`src/pricing/pooling.js`): שורה שאוגדה מקבלת `pooled: {promotionId, with:[שמות]}` וחלקה היחסי בסכום. לכל רשת `subtotal`/`grandTotal` רגילים ו-`club: {subtotal, grandTotal, savings, label}|null`. **דירוג (הוחלט 20.9): הלקוח בוחר אם דמי המשלוח נספרים.** `compareCart({ ranking: 'total'|'goods' })`, ברירת מחדל `total`, ומגיע גם מגוף הבקשה ל-`POST /api/compare` (ערך לא חוקי → 400). התשובה מחזירה `ranking` כדי שה-UI ידע מה הוא מציג. זה לא ניואנס: במדידה על 19 סלים העמלה שינתה מי מנצח ב-10 מהם, ובכל פעם לטובת רשת פיקאפ שעמלתה 0 כי הלקוח נוסע לסניף בעצמו. שתי הקריאות לגיטימיות, ולכן הבחירה היא של הלקוח. הזול-ביותר נקבע לפי אותה בחירה. כך זה מיושם ב-`src/pricing/compare.js`.

**תאריך לשורה (22.9):** לכל שורה `priceDate` (`YYYY-MM-DD`, מ-`updatedAt` של הפריט בקטלוג, §2.2; `null` כששורה לא זמינה או כשלפריט אין את השדה). זה **לא** אותו דבר כמו `priceList.sourceDate`/`asOf` ברמת הרשת (מתי פורסם המחירון עצמו, קיים כבר) - פריט יכול להיות מתויג בתאריך ישן יותר מהמחירון אם לא עודכן בקובץ האחרון.

**פירוט מבצע לשורה (22.9, 1א):** לכל שורה `promoDetail: {type, minQty, maxQty, unitPriceEffective, validTo, club:false, label, promotionId}|null` - אותו חוק שכבר קובע את `lineTotal`/`promo` למעלה, בגבול ה-API בלבד; `unitPriceEffective = lineTotal/qty` **אחרי איגום** מגוון (₪ ליחידה; לשקילים ₪ לק"ג). שורה בלי מבצע → `null`. `club.detail` באותה צורה, מחושב מ-`club.promo`, עם `club:true` ו-`label` = **שם המועדון** (`club.label` הקיים, לא טקסט המבצע). `promo`/`club.promo` (הטקסט) נשארים כפי שהם, ללא שינוי.

תחליפים (19.9, docs/CONCEPTS.md §4-5): `compareCart({ substitutes: { policy: 'none'|'privateLabel'|'cheapest', apply: 'ask'|'auto' } })`, ברירת מחדל `privateLabel`+`ask`, מגיע מהגדרת הלקוח (פרופיל) או מגוף הבקשה ל-`POST /api/compare`. התנהגות: (א) שורה שהרשת לא מוכרת → מועמד מאותו מושג, גודל ±25%, הזול ביותר (כל מותג). ב-`apply: 'ask'` (ברירת מחדל) השורה נשארת `missing` ומקבלת `alternative: { ..., reason: 'missing' }`; ב-`apply: 'auto'` מוחלפת: `status: 'substituted'`, `substituteReason: 'missing'`, `substituteFor` (השם המקורי), `storeItemName`/`unitPrice`/`lineTotal` של התחליף, `usedProductId`. (ב) שורה קיימת עם תחליף זול יותר לפי `policy`: ב-`ask` השורה נשארת ומקבלת `alternative: { productId, name, storeItemName, unitPrice, lineTotal, savings, privateLabel, reason: 'cheaper' }`; ב-`auto` מוחלפת (`substituteReason: 'cheaper'`). לרשת: `withAlternatives: { subtotal, grandTotal, savings, count }|null` ו-`substitutedCount`. `line.substituteProductId` שהלקוח קבע גובר תמיד כשהוא resolve-י ו-inStock ברשת - גם אם המוצר המקורי עצמו זמין שם (תיקון באג 20.9, `substituteReason: 'customer'`); לא resolve-י → נופל למקורי אם זמין (עם `substituteTried`), אחרת ההתנהגות הקיימת. ה-handoff מעביר את `usedProductId` (תחליף שהוחל עובר לאתר; `alternative` לא, עד שהלקוח לוחץ "החלף" וה-UI שולח `substituteProductId`).

מ-22.9 (docs/CONCEPTS.md §4): מועמד לתחליף עובר גם כללי צורת מכירה/קטגוריה/גודל/צורה פיזית/תזונה/נדרש/אחוז/וריאנט/טווח מחיר, לא רק "אותו מושג + גודל"; הכללים והמשפחות טעונים מ-`config/substitutes/rules.json`. כל `alternative` נושא גם `tier: 'concept'|'family'` ו-`family: {id,name}|null` (הצעה זולה יותר על שורה קיימת היא תמיד `tier: 'concept'`, `family: null`); שורה שהוחלפה אוטומטית לשורה חסרה נושאת גם `substituteTier` ו-`substituteFamily` באותה צורה.

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
- **הייצוא ל-R2 (§4.2), מצד השרת (18.9):** `server/dataSource.js` כבר יודע לקרוא `products.json` ו-`catalogs/<chainId>.json` מ-`CATALOGS_URL` לפי ETag, עם fallback לקבצי ה-repo לכל קובץ בנפרד. רשימת הרשתות לפנייה היא `data/chains.json` שב-repo (14 כתובות). שאלות לצינור: (א) האם R2 יגיש ETag יציב לתוכן זהה ו-`Cache-Control` קצר (דקות), כדי שבדיקה שעתית תהיה 304 ולא הורדה של 7MB? (ב) האם `public/pipeline-status.json` יכלול את רשימת הקטלוגים שקיימים בייצוא, כדי שהשרת לא ינחש לפי `chains.json`? (ג) קטלוג של רשת שהוסרה מהייצוא אבל עדיין ב-repo - השרת ימשיך להציג את עותק ה-repo (מחירון שפורסם); אם הכוונה היא להסיר אותה מההשוואה, זה צריך להיות מסומן ב-`chains.json` או בסטטוס.
- **הגדרות המושגים ל-cartBackend (20.9):** ה-API החדש טוען את `config/concepts/*.json` יחד עם `data/` (שמות נרדפים לחיפוש, `sizeUnit` לבדיקת גודל בתחליפים, שם המושג לקיבוץ תוצאות). מדיסק זה readdir; מ-HTTP (GitHub raw / R2) אי אפשר לקבל רשימת קבצים, ולכן השרת מנסה `config/concepts/index.json` ואם אין - רשימת שמות מוטמעת (9 המחלקות של היום). **נסגר 20.9: `config/concepts/index.json` מתפרסם** - `{ "files": [...] }` עם שמות קבצי המושגים, נכתב בכל `products:build` ונבדק בטסט (`test/categorize.test.js`). השרת יכול לטעון אותו ולהפסיק להסתמך על רשימה מוטמעת; קובץ מושגים חדש ייטען מעכשיו מעצמו. שימו לב שהאינדקס עצמו אינו קובץ מושגים - `loadConcepts` מדלג עליו.
- **`config/substitutes/rules.json` (22.9, docs/CONCEPTS.md §4):** קובץ תצורה מתפרסם לכללי התחליפים - משפחות, `conceptPolicy`, אוצרות המילים של הכללים (צורה/תזונה/נדרש/וריאנט) ו-`priceBand`/`sizeTolerance`. קובץ יחיד, בלי אינדקס נפרד כמו `config/concepts/index.json`.
- **ה-API של האפליקציה החדשה (cartBackend, 18.9):** דפי המוצר (`/p/<gtin>/<slug>`) מציגים היסטוריה של 8 שבועות ("מחיר נמוך שבועי"). היום ה-API מחזיר את המחיר הנוכחי 8 פעמים. שאלה: האם הייצוא ל-R2 יכלול `public/history/<gtin>.json` (או שדה ב-`gtin/<gtin>.json`) עם המינימום השבועי לכל רשת מתוך `prices_history` (§4.1)? וכן: תמונות מוצר ולוגואים של הרשתות אינם בקבצי המחירים (§0.1); צריך מקור חוקי אחר או placeholder.

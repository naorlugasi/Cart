# תוכנית: שלושת השיפורים מסריקת המתחרים (22.9.2026)

## Context

נאור הביא הצעה בשלושה חלקים: (1) להשלים את מודל המבצעים ולהוציא אותו ללקוח כמו zoozola, (2) תאריך עדכון לכל שורת מחיר, (3) עמוד ציבורי "הסל של ישראל". הסריקה של הקוד (22.9) אישרה את רוב ההנחות, עם ארבעה תיקונים עובדתיים:

- **תאריך לפריט:** הפרסר קורא רק `PriceUpdateDate`, אבל 12 מ-14 הרשתות מפרסמות `PriceUpdateTime`. היום השדה `null` כמעט לכולן.
- **מבצעים:** החוק כבר נושא `validTo`, `maxQty`, `minQty`, `promotionId`, אבל `compare.js` מוחק אותם בגבול ה-API ומשאיר טקסט. הבקאנד לא משתמש ב-`compare.js` של Cart אלא בפורט (`src/pricing/basket.ts`) על `promotions.js` המוונדר. כל שדה חדש בשורה = Cart + פורט בבקאנד + טיפוס בפרונט.
- **מבצעים בסניפים:** ב-DuckDB של 990 הסניפים יש רק מחירי מדף (PromoFull לא מורד). **במחירוני האונליין** של 14 הרשתות יש את כל המבצעים: X ב-Y, אחוזים, 2+1, ומחירי מועדון (מוצגים בנפרד, לא בסכום, לפי החלטת 19.9). קופונים/"פרומו קוד" בחוץ לפי החלטת נאור. תשובה לשאלת נאור: כן, באונליין יש לנו הכל חוץ מקופונים.
- **הסל של ישראל:** אין בריפו כלום על הסל. נבדק מה נגיש: gov.il נפתח בדפדפן ומפנה לאתר ייעודי (govextra) עם **רשימת 54 הסניפים הרשמית** (כתובות) ול**חוברת דיגיטלית** של המוצרים (8 עמודי תמונה, בלי טקסט ובלי ברקודים). zoozola מציג את כל 100 השמות + ייחוס + מחיר התחייבות, בלי ברקודים.

**החלטות נאור (22.9):** סדר 2 → 1א+1ג → 3 → 1ב, 1ד אחרי מדידה. הסל מחושב **ממחירוני האונליין בלבד** (כמו שאר האתר), לא מחציון סניפים. סעיף הפיקוח על קרפור **נדחה לשלב שני**. רשימת המוצרים **רק ממקורות gov.il**; אם צריך, נאור מביא את הקובץ.

---

## חלק 2: תאריך עדכון לכל שורת מחיר (יום)

**Cart:**
1. `src/catalog/priceXml.js:97` — `updatedAt: pick(fields, ['PriceUpdateDate', 'PriceUpdateTime'])`, מנורמל ל-`YYYY-MM-DD` (הערך מגיע `2026-09-22 03:40:00` או `2026-09-22`; חיתוך ל-10 תווים אחרי בדיקת תבנית, אחרת `null`).
2. `src/catalog/priceXml.js:148-159` `buildCatalogFromFiles` — להוסיף `updatedAt` לפריט (היום נמחק).
3. `scripts/build-products.mjs` `slimCatalog` מפזר `{...item}` — אין שינוי. עלות +25 בתים לפריט, +8% על הקטלוגים (שופרסל 1.51→1.63MB). לעדכן את הערכת הגודל ב-`docs/PIPELINE-CONTRACT.md:114`.
4. `src/pricing/compare.js:17-48` `buildPricedLine` — `priceDate: item.updatedAt ?? null`; שורות לא זמינות `null`. ברמת הרשת כבר יש `priceList.sourceDate`/`asOf` (`src/catalog/priceList.js`) — זה ה-"dataDate", בלי שם חדש.
5. `docs/PIPELINE-CONTRACT.md` §2.2 שדה פריט אופציונלי `updatedAt`; §4.3 `priceDate` בשורה. תוספת בלבד.
6. בדיקות: `test/priceXml.test.js` (שני שמות, נרמול, חסר→null), `test/compare.test.js`.

**cartBackend:** `src/catalog/types.ts:59-72` `CatalogItem.updatedAt?`; `src/pricing/basket.ts:45-70` `priced()` + `missingLine()` → `priceDate`; `src/frontend/types.ts:122-170` `PricedLine.priceDate`; טסט.

**cartFrontend:** `src/lib/types.ts` (PricedLine); `src/app/compare/CompareClient.tsx:788-796` שורת המטא: "עודכן 22.9" (`heDateShort`, `src/lib/format.ts:53`) רק כשקיים. "מחירון 22.9" לרשת כבר קיים (`ChainCaveats` :497-514). בלי אזהרה על פריט ישן ביחס למחירון.

**אימות:** בנייה מקומית → `updatedAt` בפריטים ב-14/14 רשתות (למדוד null לרשת, צפוי ~0) → `git checkout -- data/`; `/api/compare` מקומי מחזיר `priceDate`; vitest בבקאנד; באתר מוצג התאריך אחרי הפרסום הבא של מרלוג.

---

## חלק 1: מודל המבצע ללקוח

### 1א. `promoDetail` בשורה (יום)

`priceLine()` (`src/pricing/promotions.js:89-105`) כבר מחזיר את החוק ב-`promo` וב-`club.promo`. השינוי בגבול ה-API בלבד:

- `src/pricing/compare.js` `buildPricedLine`: `promoDetail: { type, minQty, maxQty, unitPriceEffective, validTo, club: false, label: promoText, promotionId } | null`, ו-`club.detail` באותו מבנה עם `club: true`, `label: clubLabel`. `unitPriceEffective = round2(lineTotal / qty)` (שקילים: לק"ג). לחשב **אחרי** `poolBundles` (הלולאה ב-compare.js:245-248 שמוחקת `_promos`), כי האיגום משנה `lineTotal`.
- `hint` קיים; אין שינוי. `docs/PIPELINE-CONTRACT.md` §4.3: שדה חדש, `promo` הטקסט נשאר.
- בדיקה ב-`test/compare.test.js`: ביסלי ברביקיו ברמי לוי (fixture) `minQty 9`, `unitPriceEffective 3.33`, `validTo` מהחוק.

**cartBackend:** `src/pricing/basket.ts:45-70` אותו חישוב מ-`priceLine().promo`; `src/frontend/types.ts` `PromoDetail` + `PricedLine.promoDetail` + `club.detail`; טסט.

### 1ג. UI בפרונט (יומיים כולל 1א)

`CompareClient.tsx` שורת "מה נכנס לעגלה" (:767-805): מתחת למחיר "9 ב-30 ₪ = 3.33 ליח', עד 3.10"; `maxQty` → "מוגבל ל-3 יח'"; מחיר מועדון בשורה נפרדת מ-`club` (בנתונים מ-19.9, טרם הוצג); "קח עוד 1" מ-`hint`; סכום מבצעים לרשת מ-`savings`.

### 1ב. מינימום קנייה — למדוד קודם

`node scripts/promo-coverage.mjs` מדפיס `skipped['min-purchase']` לרשת. אם על 14 הרשתות < 1% מהמבצעים הנחשבים — לדחות. אחרת: `promoRules.js:214-227` שומר חוק עם `minPurchase`; `priceLine` מקבל `basketSubtotal`; מתחת לסף → `hint` "בקנייה מעל 150 ₪ המוצר ב-3.90". שינוי חתימה → `npm run sync:pricing` בבקאנד.

### 1ד. מועדון בפרופיל — חוזה בלבד

cartBackend: `Settings` (`src/frontend/types.ts:299-310`) + `settingsPatch` (`src/routes/account.ts:19-28`) + ברירת מחדל: `clubs: string[]`. בלי שינוי חישוב. תיעוד ב-§4.3: בעתיד `compare` מחליף `subtotal` ב-`club.subtotal` לרשת שהלקוח חבר בה.

**לא בסקופ:** קופונים; מבצעים בצינור הסניפים.

---

## חלק 3: "הסל של ישראל" — אונליין בלבד, בלי פיקוח (שלושה ימים אחרי שיש רשימה)

**מה זה:** 100 מוצרי יסוד של משרד הכלכלה (אפריל 2026), קרפור התחייבה ל-₪1,098 ב-54 סניפים ובאונליין; ייחוס ₪1,472; ממוצע שוק ₪1,700. אנחנו מחשבים כמה אותם 100 עולים **בחנות המקוונת של כל רשת** לפי אותו מנוע שמשווה סלים, ומדרגים.

### 3.0 רשימת המוצרים (חוסם; מקורות gov.il בלבד)

- **מקור רשמי:** החוברת הדיגיטלית שמשרד הכלכלה מפנה אליה (`online.fliphtml5.com/flzkw/hoveret_digital`, 8 עמודי תמונה). קוראים את 8 העמודים (תמונות העמודים בגודל מלא), מתמללים לרשימה `{name, brand, size, carrefourPrice}`, ומצליבים כל שם מול `data/prices/carrefour/catalog.full.json` (אותה רשת, אותם שמות) כדי לקבל ברקוד. סקירה ידנית של אי-ודאויות. אם החוברת לא קריאה מספיק — נאור מביא את הקובץ (הציע).
- `config/sal-israel.json`: `{ "_doc", "version": 1, "basket": {name, source, publishedOn}, "ministry": { "reference": 1472, "marketAverage": 1700, "carrefourCommitment": 1098, "stores": 54 }, "rules": { "minCoverage": 0.85, "historyDays": 90 }, "products": [ { "gtin", "name", "category", "qty": 1, "unit": "יח'", "isWeighted": false, "referencePrice", "carrefourPrice" } ] }`. `referencePrice` מהחוברת אם מופיע, אחרת `null` (לא מ-zoozola, לפי החלטת נאור).
- `config/sal-israel-stores.json` — **נדחה** (שלב הפיקוח). לשמור את 54 הכתובות מ-govextra כקובץ הערה (`docs/SAL-ISRAEL.md`) כדי לא לחפש שוב.
- לוֹדר `src/basket/salIsraelConfig.js` (בדוגמת `src/catalog/privateLabel.js`): מאמת ברקודים ייחודיים, `qty > 0`, קטגוריה מ-10 המחלקות, `isWeighted` תואם ל-`products.json`; רשימה ריקה מותרת (עד שהיא מגיעה) כדי שהריצה היומית לא תיפול.
- `node scripts/sal-israel.mjs --check`: לכל ברקוד — קיים ב-`products.json`? באיזה קטלוגי אונליין? יוצא 1 על ברקוד שאינו ב-`products.json`.

### 3.1 חישוב (יום)

מודול טהור `src/basket/salIsrael.js` `computeSalIsrael({ config, products, catalogs, chains, today, history })`:
- לכל רשת עם קטלוג, לכל מוצר: `priceLine({ unitPrice: item.price, qty, promotions: item.promotions.filter(p => !p.validTo || p.validTo >= today), isWeighted }).total` — מבצעים פעילים, **בלי מועדון** (כמו ההשוואה). מוצר חסר ברשת: משוערך לפי חציון הרשתות שיש להן, `imputed: true`. רשת נכנסת לדירוג רק עם כיסוי ≥ `rules.minCoverage` (85%); אחרות ב-`excluded[]` עם סיבה.
- לכל רשת: `total`, `found`, `imputed`, `coverage`, `vsReference`, `vsMarket`, `vsCommitment`, `priceStatus` (מהקטלוג: `fetchStatus`, `sourceDate`).
- קרפור: שורה אחת (החנות המקוונת שלה היא חלק מהתוכנית לפי govextra), עם `carrefourCommitment` להשוואה.
- פלט `data/sal-israel.json` (v1): `{ version, date, generatedAt, basket, ministry, rules, ranking[], excluded[], products[{ gtin, name, category, qty, unit, referencePrice, carrefourPrice, cells: { [chainId]: { price, promo, imputed } }, cheapest }], history: { [chainId]: [{ date, total }] } }`; היסטוריה מלאה ב-`data/sal-israel-history.jsonl` (שורה לרשת ליום, ~1KB/יום; מתחבר לחלק ב' של תוכנית ההיסטוריה).
- הסקריפט `scripts/sal-israel.mjs` עושה I/O (קורא `config`, `data/products.json`, `data/chains.json`, `data/catalogs/*.json`; כותב אטומית tmp+rename כמו `scripts/lib/pipelineStatus.mjs`).

### 3.2 חיבור לריצה היומית (רבע יום)

בגלל שהחישוב הוא מהקטלוגים בלבד, הוא **חלק מהפרסום היומי**: ב-`scripts/daily-refresh.sh` אחרי `products:build` ולפני `npm test`: `run "sal-israel" node scripts/sal-israel.mjs` — אבל **כישלון שלו הוא אזהרה**, לא עצירה (`|| log "warn: ..."`), בהתאם לכלל "מוצר/שלב לא חוסם פרסום". להוסיף `data/sal-israel.json data/sal-israel-history.jsonl` ל-`DATA_PATHS` וגם ל-`DISCARD_PATHS` (:45, :49). אין תלות ב-DuckDB, ולכן זה עובד גם ב-`--only-failed`. תיעוד: `docs/PIPELINE-CONTRACT.md` §2.5, `docs/RUNNER-MAC.md`.

### 3.3 בקאנד (חצי יום)

`src/catalog/types.ts` `Snapshot.salIsrael: SalIsraelFile | null`; `src/catalog/source.ts` `loadFromDisk` + `loadFromUrl` עם `fetchJson("sal-israel.json", previous?.salIsrael)` (ETag, 404 → null, תקלה → עותק קודם); `fingerprint()` כולל `generatedAt` שלו; `src/routes/salIsrael.ts` `GET /sal-israel` → 404 בעברית כשאין, אחרת הקובץ + `products[].imageUrl = rt.images.get(gtin)`, `slug = rt.index.get(gtin)?.slug`; `Cache-Control: public, max-age=600`; mount ב-`src/app.ts`. טסטים: route 200/404, source absent/present/unchanged/outage. הערה: רשתות שאינן בין שש הרשתות של האתר מגיעות עם שם וצבע מתוך הקובץ (`data/chains.json`), לא מ-`CHAINS` של הפרונט.

### 3.4 פרונט (יום וחצי)

`src/app/sal-israel/page.tsx` (server component, `revalidate = 600`, `generateMetadata` עם שלושת המספרים והזולה ביותר, JSON-LD כמו בעמוד המוצר); `model.ts` טהור (`rankBars`, `groupByCategory`, `asOfLine`); `SalIsraelView.tsx`: כותרת + שלוש משבצות (1,098 / 1,472 / 1,700), כרטיסי רשתות מדורגים עם פס אופקי (div, סמנים מקווקווים לשלושת המספרים, בלי ספרייה), רשתות שלא נכנסו בשורה עמומה, 100 המוצרים לפי קטגוריה ב-`<details open>` עם `ProductImage` לפי gtin והזולה מודגשת (בלי טבלת עמודה-לרשת, בלי אימוג'י), פסקת מתודולוגיה מ-`rules` ("מחירי החנויות המקוונות, מבצעים פעילים ללא מועדון, מוצר חסר משוערך"), והכוכביות של `priceStatus` כמו בהשוואה. `contract.ts`/`http.ts`/`mock.ts` (fixture מקוצר: 12 מוצרים, 5 רשתות). `sitemap.ts` + קישור מהעמוד הראשי. טסטים: `model.test.ts`, render של ה-View על ה-mock (מספרי כותרת, כרטיס לכל רשת, אין `<table>`).

### 3.5 בדיקת קבלה

`scripts/sal-israel-check.mjs`: מדפיס רשת/סכום/יחוס; מאשר שקרפור אונליין קרובה ל-₪1,098 (התחייבות חלה גם על האתר לפי govextra) ושהאחרות בטווח 1,400–1,700 כמו zoozola בסדר גודל; פער > 5% לרשת מסוימת דורש הסבר ב-`config.acceptance.explanations`.

### שלב שני (לא עכשיו)
- **פיקוח על קרפור ב-54 הסניפים:** דורש PromoFull בצינור הסניפים (מחיר הסל מפורסם כמבצע קבוע לפי zoozola: 27 מ-47 סניפים) + מיפוי 54 הכתובות ל-`store_id`. הערכה: יומיים לצינור (`pipeline/fetch.mjs` kind PromoFull, `pipeline/load.mjs` טבלת `promos_current` דרך `promoRules.js`) + יום לסעיף.
- **חציון סניפים** כמדד נוסף, מאותה תשתית.

---

## סדר ואומדן

| # | מה | זמן | תלות |
|---|---|---|---|
| 2 | תאריך לפריט: Cart + בקאנד + פרונט | 1 יום | — |
| 1א+1ג | promoDetail + UI מבצעים | 2 ימים | — |
| 3.0 | רשימת המוצרים מהחוברת + config + `--check` | חצי יום | החוברת קריאה / קובץ מנאור |
| 3.1–3.2 | חישוב + חיבור לריצה | 1.25 ימים | 3.0 |
| 3.3–3.4 | בקאנד + פרונט | 2 ימים | סכימת הקובץ (3.1); במקביל ל-3.1 |
| 3.5 | קבלה | חצי יום | פרסום ראשון ממרלוג |
| 1ב | מינימום קנייה | רק אם המדידה > 1% | — |
| 1ד | `clubs` בפרופיל, חוזה | שעה | — |

חלוקה לסאב-אייג'נטים (Sonnet): 2 ו-1א בריפו Cart במקביל ב-worktrees נפרדים; 3.0 בסשן הזה (קריאת החוברת + הצלבה ידנית); 3.1+3.2 סוכן אחד; 3.3 ו-3.4 בסשני הבקאנד והפרונט לפי החוזה. כללי הבית: קונפיג וקוד בלבד, `data/` רק ממרלוג; חוזה תוספתי; `fail 0` לפני דחיפה.

## אימות מקצה לקצה
- Cart: `npm test` ירוק (רשימה ריקה ומלאה); בנייה מקומית מראה `updatedAt` בפריטים, `promoDetail` בשורה, ו-`data/sal-israel.json` תקין; `git checkout -- data/` אחרי.
- מרלוג: ריצה אחת ידנית → הלוג מראה `sal-israel`, הקומיט היומי כולל את הקובץ, `ops/runs` מדווח.
- בקאנד: `/health` מונה את `sal-israel.json`; `/sal-israel` 200 עם תמונות; `/compare` מחזיר `priceDate` ו-`promoDetail`.
- פרונט: `/sal-israel` בדסקטופ וב-375px, `sitemap.xml` כולל אותו, OG מכיל את המספרים; בהשוואה מוצגים "עודכן", מחיר ליחידה, תוקף, מועדון בשורה נפרדת.
- קבלה: `node scripts/sal-israel-check.mjs` עובר או שכל פער > 5% מוסבר.

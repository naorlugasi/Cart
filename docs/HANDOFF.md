# מנגנון ההעברה (Handoff) - מדריך

## למה לא Deep Link?

רשתות השיווק בישראל לא מציעות קישור שמקבל רשימת ברקודים. לכן ההעברה מתבצעת ע"י קוד שרץ *בתוך*
אתר הרשת ומשחזר את בקשות "הוסף לעגלה" של האתר עצמו, עם העוגיות של המשתמש. יש שלוש דרכים להריץ
את הקוד הזה - כולן משתמשות באותו קובץ, `src/handoff/injector.cjs`:

| ערוץ | איך הקוד מגיע לדף | מתאים ל |
|---|---|---|
| **Bookmarklet עצמאי** (`/bookmarklet`, `GET /api/bookmarklet`) | סימנייה `javascript:` שמכילה את ה-injector כולו; הנתונים (פריטים + adapter) מגיעים בכתובת (`#cart_id=..&p=..`) והתוצאה חוזרת לטאב הפלטפורמה ב-`postMessage` | **Web - ערוץ הלקוח.** אין התקנה, לא תלוי ב-CSP של אתר הרשת (אומת בכל 4 הרשתות, כולל רמי לוי שחוסמת סקריפטים וחיבורים חיצוניים) |
| In-App WebView (`mobile/`) | `evaluateJavascript(GET /api/handoffs/:id/script)` - הסקריפט כולל את ה-payload, בלי קריאה לפלטפורמה מתוך הדף | מובייל |
| תוסף Chrome (`extension/`) | content script על דומייני הרשתות | כלי פיתוח / QA בלבד (מצב הקלטה, `scripts/e2e-handoff.mjs --channel extension`). לא מיועד ללקוחות |

## הזרימה

1. המשתמש לוחץ "הזמן ברשת X" → `POST /api/handoffs { lines | cartId, chainId }`.
2. השרת מתרגם את הסל ל-`storeItemId` של הרשת, שומר handoff ומחזיר `url = <chain baseUrl>#cart_id=<id>&p=<payload>`.
   ה-`p` הוא ה-payload המלא (פריטים, adapter, reportUrl) ב-base64url, כך שהדף של הרשת לא צריך לפנות לפלטפורמה.
3. האפליקציה פותחת את ה-URL בטאב חדש (עם opener) ומציגה בדיאלוג את סימניית "טען עגלה" (פעם אחת גוררים אותה לשורת הסימניות).
4. המשתמש לוחץ על הסימנייה בטאב של הרשת. ה-injector קורא את ה-payload מהכתובת (או, בלעדיו, מושך `GET /api/handoffs/<id>`), מוודא
   שהדף הנוכחי הוא אכן הדומיין של הרשת, ומריץ:
   * `session` - בקשת חימום אופציונלית (יוצרת עגלת אורח / עוגיות).
   * `add` לכל פריט, ברצף, עם השהיה `delayMs`. פריט שנכשל מסומן וממשיכים לפריט הבא.
   * דיווח `POST reportUrl`; אם ה-CSP של האתר חוסם את ה-fetch (רמי לוי) הדיווח יוצא כפיקסל תמונה
     (`GET reportUrl?s=<base64url>`, `img-src` פתוח כמעט בכל אתר), **וגם** `postMessage` לטאב הפלטפורמה שפתח את הדף.
   * חיווי למשתמש (banner) והפניה ל-`checkoutPath`.
5. האפליקציה מקבלת את התוצאה ב-`postMessage` (וגם עוקבת אחרי `GET /api/handoffs/<id>/status`) ומציגה "העגלה נטענה בהצלחה, כעת בחר מועד משלוח ובצע תשלום".

## מבנה adapter

ה-adapter הוא נתונים בלבד (JSON), ונשלח לתוסף בזמן ריצה. הדוגמה המלאה ביותר היא `src/handoff/adapters/carrefour.js`:

```js
{
  chainId: 'carrefour', name: 'קרפור', baseUrl: 'https://www.carrefour.co.il/',
  hashParam: 'cart_id', verified: true, verifiedAt: '2026-09-08', guestCart: true,
  domains: ['www.carrefour.co.il', 'carrefour.co.il'],
  itemIdKind: 'barcode',                              // מה מכיל storeItemId: 'barcode' | 'site-code'
  vars: {                                              // ערכים שנקראים מהדף לפני הריצה
    branchId: { source: 'localStorage', name: 'frontend', path: 'branchId', default: 3003 },
    cartId:   { source: 'localStorage', name: 'frontend', path: 'serverCartId' },   // waitMs: 10000 = להמתין שהאתר ייצר אותו
  },
  session: {                                           // חימום: יצירת עגלת אורח - רק אם אין cartId
    skipIfVar: 'cartId', method: 'POST', path: '/v2/retailers/1540/branches/{{branchId}}/carts', query: { appId: 4 },
    format: 'json', body: { lines: [], source: 'Category' },
    capture: [{ jsonPath: 'cart.id', var: 'cartId', localStorage: { key: 'frontend', path: 'serverCartId' } }],
  },
  lookup: {                                            // תרגום ברקוד -> מזהה פנימי של האתר (לפריט או bulk)
    method: 'GET', path: '/v2/retailers/1540/branches/{{branchId}}/products',
    query: { appId: 4, filters: '{"must":{"term":{"barcode":"{{barcode}}"}}}', from: 0, size: 1 },
    bulk: false, itemsPath: 'products', idField: 'id',  // ב-bulk: matchField מזהה איזו שורה שייכת לאיזה ברקוד
  },
  add: {                                               // הוספה לעגלה - בקשה לפריט, או bulk: true לבקשה אחת לכל הסל
    method: 'POST', path: '/v2/retailers/1540/branches/{{branchId}}/carts/{{cartId}}', query: { appId: 4 },
    format: 'json', bulk: true,
    items: { as: 'list', template: { quantity: '{{qty}}', soldBy: null, retailerProductId: '{{resolvedId}}', type: 1 } },
    body: { lines: '{{items}}', source: 'Category' },
    headers: { 'X-HTTP-Method-Override': 'PATCH', Accept: 'application/json, text/plain, */*' },
    csrf: null,                                        // או { source: 'meta', name: '_csrf', header: 'CSRFToken', required: true }
    success: { statusOk: true, itemsPath: 'cart.lines', itemIdField: 'retailerProductId' },
  },
  delayMs: 150, checkoutPath: '/', redirectDelayMs: 2500,
}
```

* **משתני תבנית** בכל בקשה: `storeItemId`, `barcode` (= storeItemId), `resolvedId` (תוצאת ה-lookup, ברירת מחדל storeItemId),
  `qty`, `qtyFixed2`, `productId`, `handoffId`, `storeId`, `nowIso`, כל `vars`, וב-bulk גם `items` / `count` / `barcodes`.
  `'{{x}}'` כערך שלם שומר על הטיפוס (מספר / מערך / אובייקט) בגוף JSON.
* **מקורות** ל-`vars` ול-`csrf`: `meta` / `cookie` / `input` / `global` / `localStorage` / `sessionStorage` (עם `path` לשדה בתוך JSON), `default`, `required`, `waitMs`.
* **`success`**: `statusOk`, `jsonPath` + `equals` (למשל `user_errors.length` = 0), `textIncludes` (עם תבניות, למשל
  `data-product-code="{{storeItemId}}"`), או `itemsPath` + `itemIdField` לבקשות bulk (הפריט הצליח אם הוא מופיע ברשימה שחזרה).
  `errorPath` / `errorText` מחלצים הודעת שגיאה לדיווח.
* **`credentials`**: ברירת מחדל `include`; `omit` ל-API בדומיין אחר (יוחננוף).
* **`strategy: 'localStorageCart'`** (רמי לוי): לרשתות שבהן עגלת האורח חיה ב-localStorage. ה-injector מריץ `lookup`, מתמחר
  את הסל דרך `add` (bulk), ממזג את אובייקטי המוצר לתוך ה-store המתמיד (`localStorageCart: { key, itemsPath, idField, qtyField }`)
  ומנווט ל-`checkoutPath` כדי שהאתר יטען את הסל.

## מצב הרשתות (אומת מול האתרים החיים ב-8.9.2026)

ההקלטות המלאות (בקשות, כותרות, גופי בקשה ותגובות) נמצאות ב-`recon/<chain>*.json`; ההוכחה מקצה לקצה ב-`recon/e2e-<chain>.json`.

| רשת | פלטפורמה | עגלת אורח | בקשת ההוספה | זיהוי פריט (`storeItemId`) | אומת |
|---|---|---|---|---|---|
| שופרסל | SAP Hybris | כן (JSESSIONID; דף העגלה מפנה ל-login, הפריטים נשמרים בסשן ומתמזגים אחרי התחברות) | `POST /online/he/cart/add?cartContext[openFrom]=CATALOG&cartContext[recommendationType]=REGULAR`, JSON `{productCodePost, productCode, sellingMethod:"BY_UNIT", qty, frontQuantity, comment, affiliateCode}`, כותרת `CSRFToken` מ-`<meta name="_csrf">`; התשובה היא HTML של המיני-עגלה | קוד המוצר באתר `P_<code>`; ברוב המוצרים הארוזים code = ברקוד (`P_7290107932080`), במותג פרטי/טריים קוד פנימי קצר (`P_522319`) שאי אפשר לגזור מהברקוד (אין EAN ב-API החיפוש) - נדרש id-map בייבוא | ✅ תוסף, `e2e-shufersal.json` |
| רמי לוי | Nuxt SPA | אין עגלת שרת לאורח: הסל ב-localStorage (`ramilevy` → `cart.items`) ומתומחר ב-`POST /api/v2/cart {"store":331,"isClub":0,"supplyAt":..,"items":{"<id>":"1.00"}}` עם Bearer אנונימי סטטי מה-bundle של האתר | ראו `strategy: 'localStorageCart'`; פריטים מתורגמים ב-`POST /api/catalog {"items":"<ברקודים>","itemsBy":"barcode","store":331}` | ברקוד (מתורגם ל-id מספרי בזמן ריצה). משתמש מחובר = עגלת שרת, לא מכוסה | ✅ תוסף, `e2e-ramilevy.json` |
| קרפור | Self Point ("ZuZ", retailer 1540) | עגלת שרת לפי id בלבד, נשמר ב-localStorage `frontend.serverCartId` | `POST .../carts` (יצירה) ו-`POST .../carts/<id>` + `X-HTTP-Method-Override: PATCH` עם `lines:[{quantity, soldBy:null, retailerProductId, type:1}]`; אותו retailerProductId שוב = עדכון כמות | ברקוד → `retailerProductId` דרך `GET .../products?filters={"must":{"term":{"barcode":".."}}}` (פריט-פריט, התשובה לא מחזירה ברקוד) | ✅ ה-injector בדפדפן אמיתי, `e2e-carrefour.json` (Cloudflare חוסם דפדפנים אוטומטיים, ראו למטה) |
| ויקטורי, טיב טעם, יינות ביתן, מחסני השוק, קשת טעמים, קוויק, שוק העיר, אקספרס מהדרין | Self Point - אותה פלטפורמה כמו קרפור (`src/handoff/adapters/selfPoint.js`, מזהי retailer/branch לכל רשת) | כמו קרפור | כמו קרפור | ברקוד → `retailerProductId` | ✅ מול ה-API החי של כל אתר מדפדפן אמיתי (`recon/selfpoint-live.json`); Cloudflare חוסם דפדפנים אוטומטיים ברובם |
| יוחננוף | Magento 2 GraphQL (`api.yochananof.co.il`) | `createEmptyCart` → `localStorage.cartId` (האתר יוצר אותו אחרי הטעינה; ה-adapter ממתין לו עד 10 שניות) | `POST /graphql` mutation `AddProductsToCart(cartId, cartItems:[{sku, quantity}])`; הצלחה = `user_errors` ריק, כשל = `PRODUCT_NOT_FOUND`; ללא cookies (`credentials: omit`) | SKU = ברקוד | ✅ תוסף, `e2e-yochananof.json` |

**מגבלות ידועות:** מוצרים שקילים (BY_WEIGHT / by_kilo) עדיין לא מטופלים; שופרסל דורשת קוד אתר לפריטים שאינם ברקוד;
הסניף/אזור המשלוח הוא ברירת המחדל של האתר (קרפור 3003, רמי לוי 331) עד שהמשתמש בוחר אחר.

## הוכחה מקצה לקצה

```bash
npm install --no-save playwright@1.47.2 && npx playwright install chromium
node scripts/e2e-handoff.mjs shufersal                 # ערוץ ה-bookmarklet (ברירת מחדל); גם ramilevy / yochananof
node scripts/e2e-handoff.mjs shufersal --channel extension
node scripts/e2e-handoff.mjs carrefour --manual        # מדפיס URL; פותחים אותו בדפדפן אמיתי ולוחצים על הסימנייה
```

הסקריפט מרים את הפלטפורמה על 127.0.0.1 (לא `localhost` - ב-macOS שרתי פיתוח אחרים עשויים לענות על `::1`), מחליף בקטלוג
שני מוצרים במזהים אמיתיים של הרשת, יוצר handoff, פותח טאב פלטפורמה ב-Chromium שפותח ממנו את אתר הרשת (`window.open`, כמו
ה-UI), מריץ בטאב של הרשת את קוד הסימנייה, ממתין לדיווח (ברמי לוי הוא מגיע רק דרך טאב הפלטפורמה), ואז קורא את עגלת הרשת
בעצמאות (ה-API/האחסון של האתר) ומשווה. התוצאה נכתבת ל-`recon/e2e-<chain>.json`.

**קרפור** מוגנת ב-Cloudflare: Chromium אוטומטי (גם `channel: 'chrome'`) מקבל דף אימות, ולכן שם האימות נעשה עם אותו injector
מתוך דפדפן אמיתי (לא אוטומטי) ו-`--manual`.

## נוהל אימות adapter מול אתר חי

**הדרך המהירה: מצב ההקלטה של התוסף.** אתרי הרשתות חוסמים דפדפנים מכתובות IP של ענן
(Cloudflare / 403), ולכן ההקלטה נעשית מהדפדפן של משתמש אמיתי: מפעילים "מצב הקלטה" בפופאפ
של התוסף, מוסיפים מוצר אחד לעגלה באתר הרשת, ולוחצים "העתק דוח". הדוח (JSON) מכיל את כל
המידע שהנוהל הידני למטה אוסף.

**ממכונת פיתוח:** `node scripts/recon-chain.mjs <chain> --out recon --headed` פותח את האתר ב-Chromium ומקליט את
קריאות הרשת; `recon/*.json` בריפו נוצרו כך (בתוספת סקריפטים ממוקדים לכל אתר).

**הנוהל הידני:**

1. פתח את אתר הרשת, פתח DevTools → Network, סנן ל-XHR/Fetch.
2. הוסף מוצר לעגלה ידנית. רשום: URL, method, content-type, גוף הבקשה, כותרות מיוחדות (CSRF, `X-Requested-With`), ותגובת הצלחה.
3. הוסף מוצר שאזל / לא קיים ורשום איך נראית תגובת כשל (זה מה שנכנס ל-`success`).
4. בדוק במצב אורח (חלון פרטי): האם הבקשה עובדת ללא התחברות? אם נדרשת בקשת חימום - הגדר `session`.
5. עדכן את הקובץ ב-`src/handoff/adapters/<chain>.js`.
6. הרץ `node scripts/e2e-handoff.mjs <chain>`; רק כשהעגלה באתר באמת מתמלאת מסמנים `verified: true`.
7. אם יש הגבלת קצב, הגדל `delayMs`.

## סוגי שגיאות שה-injector מסווג

| `errorType` | משמעות | טיפול |
|---|---|---|
| `rejected` | האתר ענה אבל סירב (למשל אזל מהמלאי) | הפריט מסומן למשתמש, שאר הסל נטען |
| `not_in_catalog` | ה-`lookup` לא מצא את הברקוד בקטלוג האתר | הפריט מסומן למשתמש, שאר הסל נטען |
| `endpoint_missing` | 404/405/410 | התראה קריטית - כנראה שינוי API |
| `unexpected_response` | תגובה שאינה במבנה הצפוי (למשל HTML במקום JSON) | התראה קריטית |
| `csrf_missing` | לא נמצא טוקן CSRF בדף | התראה קריטית; לא נשלחות בקשות |
| `auth` | 401/403 | המשתמש יתבקש להתחבר; אפשר לנסות שוב אחרי התחברות |
| `server_error` | 5xx | מנוסה שוב בהעברה הבאה |
| `network` | הבקשה לא יצאה / CORS | בדוק שהקוד רץ בדומיין הנכון |

## חנות ההדגמה

`/demo-store/` היא רשת מדומה שנבנתה לפי אותו חוזה: עגלת אורח בעוגייה, `<meta name="demo-csrf">`,
`POST /demo-store/api/cart/add` שמחזיר `{ ok: true }` או `{ ok: false, error }`, ודף `/demo-store/cart`.
בדף הדמו נטען `/handoff.js` ישירות (במקום תוסף) כדי שהזרימה תעבוד ללא התקנות. הבדיקה
`test/api.test.js` מריצה את ה-injector האמיתי מול החנות הזו ומוודאת שהעגלה שם מתמלאת.

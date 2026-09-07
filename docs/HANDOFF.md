# מנגנון ההעברה (Handoff) - מדריך

## למה לא Deep Link?

רשתות השיווק בישראל לא מציעות קישור שמקבל רשימת ברקודים. לכן ההעברה מתבצעת ע"י קוד שרץ *בתוך*
אתר הרשת ומשחזר את בקשות "הוסף לעגלה" של האתר עצמו, עם העוגיות של המשתמש. יש שלוש דרכים להריץ
את הקוד הזה - כולן משתמשות באותו קובץ, `src/handoff/injector.cjs`:

| ערוץ | איך הקוד מגיע לדף | מתאים ל |
|---|---|---|
| תוסף Chrome (`extension/`) | content script על דומייני הרשתות | Web - האמין ביותר (לא כפוף ל-CSP של הדף) |
| Bookmarklet (`/bookmarklet`) | `<script src="/handoff.js">` | Web ללא התקנת תוסף (עלול להיחסם ע"י CSP) |
| In-App WebView (`mobile/`) | `evaluateJavascript(GET /api/handoffs/:id/script)` | מובייל |

## הזרימה

1. המשתמש לוחץ "הזמן ברשת X" → `POST /api/handoffs { cartId, chainId }`.
2. השרת מתרגם את הסל ל-`storeItemId` של הרשת, שומר handoff ומחזיר `url = <chain baseUrl>#cart_id=<id>`.
3. האפליקציה פותחת את ה-URL בטאב חדש.
4. ה-injector קורא את `cart_id`, מושך `GET /api/handoffs/<id>` (פריטים + adapter + reportUrl), מוודא
   שהדף הנוכחי הוא אכן הדומיין של הרשת, ומריץ:
   * `session` - בקשת חימום אופציונלית (יוצרת עגלת אורח / עוגיות).
   * `add` לכל פריט, ברצף, עם השהיה `delayMs`. פריט שנכשל מסומן וממשיכים לפריט הבא.
   * דיווח `POST reportUrl` עם התוצאות.
   * חיווי למשתמש (banner) והפניה ל-`checkoutPath`.
5. האפליקציה עוקבת אחרי `GET /api/handoffs/<id>/status` ומציגה "העגלה נטענה בהצלחה, כעת בחר מועד משלוח ובצע תשלום".

## מבנה adapter

```js
{
  chainId: 'shufersal', name: 'שופרסל', baseUrl: 'https://www.shufersal.co.il/online/he/',
  hashParam: 'cart_id', verified: false, guestCart: true,
  session: { method: 'GET', path: '/online/he/cart' },
  add: {
    method: 'POST', path: '/online/he/cart/add',
    format: 'form',                                   // 'json' | 'form' | 'query'
    body: { productCodePost: '{{storeItemId}}', qty: '{{qty}}' },
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    csrf: { source: 'meta', name: 'CSRFToken', header: 'CSRFToken', required: false },
    success: { statusOk: true }                       // או { jsonPath: 'ok', equals: true } / { textIncludes: '...' }
  },
  delayMs: 150, checkoutPath: '/online/he/cart'
}
```

משתני תבנית זמינים: `storeItemId`, `qty`, `productId`, `handoffId`, `storeId`.
`csrf.source` יכול להיות `meta` / `cookie` / `input` / `global` (למשל `window.__CSRF`).

## נוהל אימות adapter מול אתר חי (POC - שלב 1)

**הדרך המהירה: מצב ההקלטה של התוסף.** אתרי הרשתות חוסמים דפדפנים מכתובות IP של ענן
(Cloudflare / 403), ולכן ההקלטה נעשית מהדפדפן של משתמש אמיתי: מפעילים "מצב הקלטה" בפופאפ
של התוסף, מוסיפים מוצר אחד לעגלה באתר הרשת, ולוחצים "העתק דוח". הדוח (JSON) מכיל את כל
המידע שהנוהל הידני למטה אוסף.

**הנוהל הידני:**

1. פתח את אתר הרשת, פתח DevTools → Network, סנן ל-XHR/Fetch.
2. הוסף מוצר לעגלה ידנית. רשום: URL, method, content-type, גוף הבקשה, כותרות מיוחדות (CSRF, `X-Requested-With`), ותגובת הצלחה.
3. הוסף מוצר שאזל / לא קיים ורשום איך נראית תגובת כשל (זה מה שנכנס ל-`success`).
4. בדוק במצב אורח (חלון פרטי): האם הבקשה עובדת ללא התחברות? אם נדרשת בקשת חימום - הגדר `session`.
5. עדכן את הקובץ ב-`src/handoff/adapters/<chain>.js`, סמן `verified: true`.
6. הרץ `npm run build:extension`, טען את התוסף, בצע handoff אמיתי וודא שהעגלה באתר מלאה.
7. אם יש הגבלת קצב, הגדל `delayMs`.

**הערה:** ה-endpoints הרשומים כרגע לשופרסל, רמי לוי, קרפור ויוחננוף הם הערכה בלבד ומסומנים
`verified: false`. הם חייבים לעבור את הנוהל שלמעלה לפני שימוש אמיתי.

## סוגי שגיאות שה-injector מסווג

| `errorType` | משמעות | טיפול |
|---|---|---|
| `rejected` | האתר ענה אבל סירב (למשל אזל מהמלאי) | הפריט מסומן למשתמש, שאר הסל נטען |
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

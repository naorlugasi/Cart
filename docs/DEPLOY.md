# פריסה

## Vercel (serverless)

הפרויקט מותאם ל-Vercel: כל בקשה מנותבת ל-`api/index.js` (ראה `vercel.json`) שמריץ את אותו
request listener של השרת העצמאי. מאחר שפונקציות Vercel הן stateless:

* מזהי ה-handoff הם טוקנים חתומים (HMAC) שמכילים את הסל - כל instance יכול לשחזר אותם.
  קבע `HANDOFF_SECRET` במשתני הסביבה של הפרויקט (אחרת נעשה שימוש בסוד ברירת מחדל של פיתוח).
* הסל והרשימות הקבועות נשמרים בדפדפן (localStorage); ההשוואה וה-handoff נשלחים עם השורות בגוף הבקשה.
* תוצאת ההזרקה מגיעה לטאב הפלטפורמה ב-`postMessage` מהטאב של הרשת, בנוסף לדיווח ל-API.
* עגלת חנות ההדגמה נשמרת בעוגייה.
* התראות העמידות (`/api/alerts`) נשמרות בזיכרון של ה-instance בלבד ומופיעות בלוגים של Vercel;
  לסביבת ייצור יש לחבר אחסון משותף (Redis/Postgres) דרך `AlertMonitor.onAlert`.

### דרך הריפו (מחובר, 8.9.2026)

הפרויקט `cart-transfer-redirect` ב-Vercel מחובר לריפו `naorlugasi/Cart` (אפליקציית GitHub של Vercel מותקנת על
החשבון). ענף הפרודקשן הוא `claude/cart-transfer-redirect-mvp-wyxm2l` (ענף ברירת המחדל של הריפו): כל push אליו
נפרס אוטומטית ל-https://cart-transfer-redirect.vercel.app, ו-push לענף אחר יוצר Preview בכתובת נפרדת. אין שלב build.
פריסה מ-git רואה רק קבצים שמוגשים ב-git, ולכן `data/products.json` ו-`data/catalogs/` חייבים להיות מוגשים
(הם כן; `data/prices/` לא נדרש בפרודקשן). `vercel deploy` מהמחשב עדיין אפשרי לבדיקה חד-פעמית אבל לא נחוץ.

### פריסת קבצים ללא git

אפשר לפרוס עם שלושה קבצים בלבד (`package.json`, `api/index.js`, `vercel.json`) כאשר `vercel.json`
מושך את קוד הענף הציבורי מ-GitHub בשלב ההתקנה:

```json
"installCommand": "curl -sSL https://codeload.github.com/naorlugasi/Cart/tar.gz/refs/heads/claude/cart-transfer-redirect-mvp-wyxm2l | tar xz --strip-components=1 --exclude='*/vercel.json' --exclude='*/package.json'"
```

### הרשאות

פריסה דרך ה-connector של Vercel ב-Claude דורשת שההרשאה תכלול את ה-scope של הצוות
(`naors-projects`). אם מתקבלת שגיאת `Not authorized: Trying to access resource under scope`, יש
לחבר מחדש את Vercel ב-claude.ai (Settings → Connectors) ולבחור את הצוות הזה.

### נתונים

הפונקציה מכילה את `data/products.json` (~1MB) ואת הקטלוגים הרזים (`data/catalogs`, ~6MB). קובצי המקור
(`data/prices/`) לא נפרסים ולא נשמרים ב-git. לעדכון מחירים מריצים את שלושת סקריפטי ה-`prices:*`/`products:build` ופורסים מחדש.

## שרת עצמאי (Railway / VM / Docker)

```bash
PORT=3000 npm start
```

בשרת קבוע המצב נשמר גם ל-`data/runtime/state.json` (סלים, handoffs, התראות). ב-Railway:
צור שירות מה-repo, פקודת start היא `npm start`, ו-`PORT` מסופק אוטומטית. מומלץ להגדיר `HANDOFF_SECRET`.

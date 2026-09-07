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

`vercel.json` מושך את קוד הענף הציבורי מ-GitHub בשלב ההתקנה, כך שאפשר לפרוס עם שני קבצים בלבד
(`package.json`, `vercel.json`). לפריסה מלאה מה-repo: חבר את הפרויקט ב-Vercel לריפו והגדר את הענף
כ-production branch, ואז הסר את `installCommand`.

## שרת עצמאי (Railway / VM / Docker)

```bash
PORT=3000 npm start
```

בשרת קבוע המצב נשמר גם ל-`data/runtime/state.json` (סלים, handoffs, התראות). ב-Railway:
צור שירות מה-repo, פקודת start היא `npm start`, ו-`PORT` מסופק אוטומטית. מומלץ להגדיר `HANDOFF_SECRET`.

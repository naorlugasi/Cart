# תוסף דפדפן (Chrome, Manifest V3) - כלי פיתוח

> ללקוחות הערוץ הוא סימניית "טען עגלה" (`/bookmarklet`), בלי התקנה. התוסף משמש לפיתוח ול-QA: מצב הקלטה של בקשות
> האתר, והרצה אוטומטית של ה-handoff ב-`scripts/e2e-handoff.mjs --channel extension`.

התוסף הוא הצד השני של ה-Handoff: הוא רץ בתוך אתר הרשת, מזהה `#cart_id=<id>` בכתובת,
מושך את רשימת המק"טים מ-`/api/handoffs/<id>` בשרת הפלטפורמה ומריץ את ה-injector
(`src/handoff/injector.cjs`) שמבצע את קריאות `cart/add` של הרשת עם העוגיות של המשתמש.

## התקנה לפיתוח

```bash
npm run build:extension      # מעתיק את injector.cjs ל-extension/injector.js
```

1. `chrome://extensions` → הפעל "מצב מפתח" → "טען תוסף לא ארוז" → בחר את תיקיית `extension/`.
2. בהגדרות התוסף הזן את כתובת השרת (ברירת מחדל `http://localhost:3000`).
3. באתר הפלטפורמה לחץ "הזמן ברשת X" - נפתח טאב באתר הרשת והעגלה נטענת.

לפיתוח אפשר לציין פלטפורמה מקומית ישירות בכתובת ה-handoff: `#cart_id=<id>&api=http://127.0.0.1:3177`
(מתקבל רק עבור localhost / 127.0.0.1). `recorder-bridge.js` שומר את מזהה ה-handoff ב-sessionStorage כבר ב-`document_start`,
כי ה-router של אתרי SPA עלול למחוק את ה-hash לפני שה-injector רץ.

## בדיקה מקצה לקצה

`node scripts/e2e-handoff.mjs <chain>` מרים פלטפורמה מקומית, פותח Chromium עם התוסף על handoff אמיתי, ממתין לדיווח
ובודק שהעגלה באתר הרשת באמת מכילה את הפריטים (פירוט ב-`docs/HANDOFF.md`).

## הרחבה לרשת חדשה

הוסף את הדומיין ל-`host_permissions` ול-`content_scripts.matches` ב-`manifest.json`,
והוסף adapter ב-`src/handoff/adapters/`. ה-adapter נשלח לתוסף בזמן ריצה, כך שתיקון
endpoint שהשתנה לא דורש עדכון של התוסף.

## מצב הקלטה (אימות adapter של רשת)

אתרי הרשתות חוסמים גישה מכתובות IP של שרתים בענן, ולכן את האימות מבצעים מהדפדפן שלך:

1. לחצו על אייקון התוסף באתר הרשת והפעילו **מצב הקלטה**.
2. הוסיפו מוצר אחד לעגלה דרך האתר (כאורח).
3. פתחו שוב את התוסף, לחצו **העתק דוח** והדביקו את הטקסט בצ'אט.

הדוח מכיל את בקשות ה-fetch/XHR של האתר עצמו שקשורות לעגלה (URL, method, כותרות, גוף הבקשה
וקטע מהתשובה), מטא-תגיות עם טוקנים, שמות העוגיות ומפתחות ה-storage. עוגיות ו-Authorization
לא נשמרים. מהדוח נגזר ה-adapter ב-`src/handoff/adapters/<chain>.js`.

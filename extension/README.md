# תוסף דפדפן (Chrome, Manifest V3)

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

## הרחבה לרשת חדשה

הוסף את הדומיין ל-`host_permissions` ול-`content_scripts.matches` ב-`manifest.json`,
והוסף adapter ב-`src/handoff/adapters/`. ה-adapter נשלח לתוסף בזמן ריצה, כך שתיקון
endpoint שהשתנה לא דורש עדכון של התוסף.

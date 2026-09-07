# Bookmarklet

חלופה לתוסף למי שלא רוצה להתקין תוסף. השרת מגיש דף מוכן בכתובת `/bookmarklet`
עם כפתור שניתן לגרור לשורת הסימניות. קוד הסימנייה:

```js
javascript:(function(){var s=document.createElement('script');s.src='https://YOUR-HOST/handoff.js?t='+Date.now();document.body.appendChild(s);})();
```

`/handoff.js` מכיל את ה-injector ואת קוד ה-bootstrap: הוא קורא את `#cart_id` מהכתובת,
מושך את ה-payload מהשרת ומבצע את ההזרקה.

מגבלה: אתרים עם `Content-Security-Policy` שחוסמת סקריפטים חיצוניים לא יטענו את הסקריפט.
במקרה כזה יש להשתמש בתוסף (Content Script אינו כפוף ל-CSP של הדף).

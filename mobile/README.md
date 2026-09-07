# מובייל - In-App WebView

זרימת ההעברה במובייל זהה לזו של התוסף, רק שההזרקה נעשית ע"י האפליקציה:

1. האפליקציה יוצרת handoff: `POST /api/handoffs { cartId, chainId }` ומקבלת `url` ו-`scriptUrl`.
2. פותחת WebView על `url` (אתר הרשת עם `#cart_id=...`).
3. אחרי `onPageFinished` / `didFinish` מורידה את `GET /api/handoffs/{id}/script` ומריצה אותו עם
   `evaluateJavascript` (Android) או `evaluateJavaScript` (iOS).
4. הסקריפט מוסיף את הפריטים בבקשות `fetch` ברקע של הדף, מדווח תוצאות ל-`/api/handoffs/{id}/results`
   ומעביר את הדף ל-`/cart` או `/checkout` של הרשת.
5. האפליקציה יכולה לעקוב אחרי `GET /api/handoffs/{id}/status` כדי להציג "העגלה נטענה בהצלחה".

קטעי קוד ל-Android/iOS נמצאים ב-`webview-inject.js` (`NATIVE_SNIPPETS`).

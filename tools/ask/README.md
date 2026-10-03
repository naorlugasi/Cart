# tools/ask - חיפוש בהחלטות הכתובות (retrieval בלבד, בלי LLM)

כלי חיפוש מקומי מעל הידע הכתוב של "סל חכם": `docs/**/*.md`, `ops/**/*.md`, `.claude/**/*.md`,
ובלוקי תיעוד (`/** ... */` ורצף של 3+ שורות `//`) בתוך `src/**/*.js`, `scripts/**/*.mjs`,
`pipeline/**/*.mjs`. שואלים שאלה בטקסט חופשי ומקבלים את 8 הקטעים הכי קרובים, עם `path:line` ו-heading,
כדי שסשן לא יצטרך לשחזר החלטה שכבר כתובה. **אין כאן יצירת תשובה** - הסשן שקורא את הפלט הוא ה"מוח";
הכלי רק מאתר.

הכול מקומי: embeddings עם `@xenova/transformers` (מודל `Xenova/multilingual-e5-small`, רץ ב-WASM, בלי
מפתח API ובלי רשת בזמן שאילתה - הרשת נדרשת פעם אחת, להורדת המודל ל-cache). אין קריאה לאתרי רשתות -
האינדקס קורא רק קבצים שכבר נמצאים בריפו.

## שימוש

```bash
cd tools/ask && npm install     # פעם אחת - מתקין @xenova/transformers (יש package.json נפרד, לא נוגע בשורש)
node tools/ask/build.mjs        # בונה את האינדקס ל-data/local/ask-index.json (מתעלם מגיט)
node tools/ask/ask.mjs "איפה חטיפי דגנים יושבים"
node tools/ask/ask.mjs "what is a frozen twin" --k 5
node tools/ask/ask.mjs "..." --files "docs/**"     # לצמצם לתת-עץ קבצים (glob פשוט)
node tools/ask/ask.mjs "..." --json                # פלט JSON במקום טקסט
node tools/ask/ask.mjs "..." --method bm25|embed|hybrid   # ברירת מחדל: hybrid
node tools/ask/measure.mjs                          # מריץ את 15 שאלות הבדיקה ומדפיס hits@1/@3
```

יש להריץ מחדש את `build.mjs` אחרי כל שינוי בקבצים הנסרקים - האינדקס לא מתעדכן לבד.

## איך זה בנוי

1. **חיתוך (`lib/chunk.mjs`):** markdown נחתך לפי כותרות (`#`..`######`), עם "heading path" מלא
   (כותרת-על > כותרת-משנה) כדי שקטע יהיה מובן גם מחוץ להקשר. קובץ קוד נחתך לפי בלוקי תיעוד בלבד - הקוד
   עצמו לא נכנס לאינדקס, רק הפרוזה שמסבירה אותו. קטע ארוך מ-120 שורות מתפצל לתתי-קטעים (אותו heading).
2. **BM25 (`lib/bm25.mjs`):** בלי המרת גזע (stemming) - עברית צריכה התאמת מילה מדויקת. הטוקנייזר שומר
   תאריכים מנוקדים ("28.9") ומזהי-מקף ("icecream-tub") כטוקן שלם, ומוסיף גם את החלקים שלהם בנפרד כדי
   שחיפוש על "icecream" לבד עדיין ימצא "icecream-tub".
3. **Embeddings (`build.mjs`):** `Xenova/multilingual-e5-small`, עם קידומת `passage: ` לקטע (heading
   בתוכו) ו-`query: ` לשאלה, כמוסכמות e5. נשמר וקטור מנורמל ל-384 מימדים לכל קטע.
4. **מיזוג (`ask.mjs`):** Reciprocal Rank Fusion (k=60) בין שני הדירוגים - embedding ו-BM25 - בלי
   תלות בסקאלה של אף אחד מהם.

## מדידה (3.10.2026)

בניית האינדקס: **1,925 קטעים** (1,511 מ-markdown, 414 מבלוקי קוד) מתוך 125 קבצי md ו-84 קבצי קוד,
ב-**283.9 שניות** (כ-4:44 דקות, כולל טעינת המודל; ה-embedding עצמו רץ בבאצ'ים של 16). קובץ האינדקס:
כ-11MB (לא ב-git).

15 השאלות שבתיאור המשימה, עם "התשובה הנכונה" מוגדרת כקובץ שבו באמת נכתבה ההחלטה (מצאתי אותן ידנית
בגריפ לפני הרצת הכלי, כדי שהמדידה לא תהיה מעגלית):

| # | שאלה | embed | bm25 | hybrid | נמצא (hybrid, top-1) |
|---|---|---|---|---|---|
| 1 | where do cereal bars go | miss | miss | miss | ops/taxonomy/bakery.md (לא רלוונטי - התשובה האמיתית ב-docs/CATEGORIES.md:262) |
| 2 | fresh/frozen same concept | hit@3 | **hit@1** | **hit@1** | scripts/frozen-twins.mjs |
| 3 | vote across chain names | **hit@1** | hit@3 | **hit@1** | scripts/build-products.mjs |
| 4 | 3x band weighed concept cards | miss | miss | miss | scripts/build-products.mjs (האמיתי: docs/CONCEPTS.md) |
| 5 | pipeline request chain website | miss | miss | miss | (האמיתי: docs/PIPELINE-CONTRACT.md:7) |
| 6 | basePrice one chain | miss | miss | miss | (האמיתי: docs/PIPELINE-CONTRACT.md) |
| 7 | Shuk City out of stock | **hit@1** | **hit@1** | **hit@1** | src/catalog/priceXml.js |
| 8 | departments since when | miss | miss | miss | (האמיתי: docs/CATEGORIES.md) |
| 9 | npm test red on runner | miss | miss | miss | (האמיתי: docs/RUNNER-MAC.md) |
| 10 | --only-failed retry | miss | miss | miss | (האמיתי: docs/RUNNER-MAC.md, אבל ops/runs/2026-09-25.md גם רלוונטי בפועל) |
| 11 | מארז not processed mushrooms | **hit@1** | **hit@1** | **hit@1** | src/catalog/categorize.js |
| 12 | Sal Israel coverage gate | miss | miss | miss | (האמיתי: docs/SAL-ISRAEL.md) |
| 13 | substitute caveats | **hit@1** | **hit@1** | hit@3 | src/pricing/substitutes.js |
| 14 | who decides department | miss | miss | miss | (האמיתי: docs/CATEGORIES.md / .claude/skills/taxonomy/SKILL.md) |
| 15 | what is a frozen twin | **hit@1** | **hit@1** | **hit@1** | scripts/frozen-twins.mjs |

**hits@1 / hits@3 מתוך 15:**

| שיטה | hits@1 | hits@3 |
|---|---|---|
| embedding בלבד | 5/15 | 6/15 |
| BM25 בלבד | 5/15 | 6/15 |
| hybrid (RRF) | 5/15 | 6/15 |

## מה למדתי מהמדידה - וזו לא תקלה בקוד

**השפה של השאלה קובעת כמעט הכול.** כל 6 הפגיעות (שתי השיטות ו-hybrid) הן שאלות שהתשובה להן יושבת
בבלוק תיעוד של קוד (`scripts/*.mjs`, `src/**/*.js`) - שבו המהנדסים כותבים פרוזה **באנגלית**, גם כשהם
מצטטים מילה בעברית. כל הפספוסים הם שאלות שהתשובה האמיתית יושבת ב-markdown עברי טהור
(`docs/CATEGORIES.md`, `docs/SAL-ISRAEL.md`, `docs/PIPELINE-CONTRACT.md`, `docs/RUNNER-MAC.md`) -
כלומר שאלה באנגלית מול קטע בעברית.

בדקתי את זה ישירות: לקחתי שתיים מהשאלות שנכשלו וניסחתי אותן מחדש בעברית
("מה כלל הכיסוי של הסל של ישראל", "אילו מחלקות יש ומתי נפתחו") - שתיהן קפצו מ-miss לדירוג גלובלי
1-2 מתוך 1,925 קטעים, בלי לגעת בקוד. גם ניסיתי להחליף את המודל ל-`Xenova/multilingual-e5-base`
(גדול פי כמה) על שלוש דוגמאות - לא עזר: ה"מסיח" (קטע מאותו קובץ, נושא דומה, תוכן אחר) עדיין ניצח את
הקטע הנכון בשתי השיטות. זו לא תקלה בצ'אנקינג או בקידוד - זו מגבלה אמיתית של מודל embedding רב-לשוני
*קטן* כש-query ו-passage בשתי שפות שונות, ו-BM25 כמובן לא יכול לגשר על שפה (אין חפיפת מילים בין
"coverage gate" ל"כלל כיסוי 85%").

**מסקנה לשימוש:** כשאפשר, לנסח את השאלה עם לפחות מילת מפתח אחת בעברית/מזהה מדויק מהמקור (שם מחלקה,
`conceptId`, תאריך "23.9", או ציטוט קצר) - זה גם עוזר ל-BM25 (שמצטיין בדיוק בזה) וגם מצמצם את הפער
הבין-לשוני ב-embedding. שאלה שכולה אנגלית מול תיעוד שכולו עברית היא המקרה הכי קשה לכלי הזה.

## לא נבדק / פתוח

- לא נוסה מודל embedding גדול יותר (`e5-large`) על כל 15 השאלות - רק בדיקת-מדגם על e5-base, שלא עזרה.
- לא נוסתה הרחבת שאילתה (query expansion) בין עברית/אנגלית - תיקון כזה עלול "לשנן" את 15 השאלות
  במקום לפתור את הבעיה הכללית, ולכן לא נוסה כאן.
- `docs/INDEX.md` ו-`docs/README.md` לא קיימים בענף הזה - אין איפה לשים הצבעה חד-שורתית אליהם, so הוא
  דולג (כפי שהמשימה התירה).

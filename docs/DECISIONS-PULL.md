# משיכת החלטות מהאתר (decisions-pull)

`scripts/decisions-pull.mjs` מושך את תשובות נאור מתור ההחלטות של אתר הניהול (חוזה: `admin/docs/DECISIONS-API.md` §2-§4) ומחיל אותן על קבצי ה-config דרך היבואנים הקיימים (`same-product-review-import`, `brands-import`, `sizes-import`). ברירת המחדל היא dry-run: שום קובץ ב-`config/` לא משתנה בלי `--apply`.

## סביבה

- `ADMIN_API_BASE` - כתובת הבקאנד (או `--base URL`). חובה, אלא עם `--file`.
- `HEALTH_TOKEN` - נשלח בכותרת `X-Health-Token`. לא מודפס לעולם.

## דגלים

| דגל | משמעות |
|---|---|
| (בלי דגלים) | GET `/admin/decisions/export`, שמירת הייצוא ב-`data/local/decisions-<תאריך>T<שעה>.json`, הדפסת תכנית: לכל תשובה קובץ + מפתח + לפני → אחרי |
| `--apply` | מחיל. כותב גם `data/local/decisions-<stamp>.applied.json` (ה-answerIds שהוחלו) |
| `--mark` | אחרי commit: POST `/admin/decisions/imported {answerIds, commit: HEAD}`; ה-answerIds מה-sidecar של הייצוא האחרון (או של `--file`) |
| `--published YYYY-MM-DD` | אחרי פרסום של מרלוג: POST `/admin/decisions/published {commits, run}` עם הקומיטים שסומנו ב-`--mark` ועוד לא דווחו; `--commits a,b` מעביר ידנית |
| `--kinds a,b` | רק סוגים אלה |
| `--file path` | קורא ייצוא שמור במקום GET (בדיקות, עבודה בלי רשת) |

## סדר ריצה

1. `node scripts/decisions-pull.mjs` - לקרוא את התכנית.
2. `node scripts/decisions-pull.mjs --apply`
3. `npm test` - ממשיכים רק על השורה `fail 0`.
4. commit של הקבצים שהשתנו, לפי נתיב מפורש (לא `git add -A`).
5. `node scripts/decisions-pull.mjs --mark`
6. אחרי שמרלוג פרסם: `--published <תאריך הריצה>`.

`data/chains.json` הוא config בהחלטת הבעלים (PLAN §7.5), לכן סניף שעודכן שם נכנס ל-commit הזה. כל השאר תחת `data/` לא נכתב (חוץ מ-`data/local/`).

## מה נוחת איפה

| סוג / אופציה | יעד |
|---|---|
| `review` / `fix`, `product-truth` / `fix` | `config/products/verified.json` `records["g<gtin>"]`: רק השדות המוכרים (name, brand, category, conceptId כולל null מפורש, size עם value>0, unit g/ml/unit, count) + `verifiedBy: naor`, `verifiedAt`, `evidence: ['admin: <key>']`. רשומה קיימת ממוזגת שדה-שדה, ה-evidence מתווסף |
| `review` / `ok` | רשומה ב-`verified.json` שמצמידה את הערכים הנוכחיים מה-subject לפי `subject.rules` (או `evidence`): size-disagreement → size; name-disagreement / truncated-name / type-word → name; concept-category / department-contradiction / label-vs-rules → category + conceptId; attrs-conflict → הדפסה בלבד |
| `review` / `later`, `remove` | רק ברשימה, אין קובץ |
| `same-product` / `same` | `aliases.json` דרך `importDecisions` (כולל בדיקת מותג שונה וולידציה) |
| `same-product` / `different` | `not-aliases.json` דרך `importDecisions` |
| `same-product` / `unsure` | אין קובץ |
| `brand` | `brands.json` דרך `mergeBrand` עם `replace`, מקור `naor`, `since` = תאריך התשובה. "בלי מותג" מוחק רשומה קיימת (אין ייצוג אחר ב-brands.json) |
| `size` | `sizes.json` דרך `importSizes`, מקור `naor`. גודל שכבר קיים לא נדרס (דילוג עם סיבה); `none` = אין קובץ |
| `chain-terms` | הסניף ב-`data/chains.json` (לפי chainId + branchId): מיזוג `fields`, `deliveryTerms`, ו-`deliveryKnown` / `minOrderKnown` = true לשדות שנמסרו. `confirm` מעדכן רק `deliveryTerms` |
| `taxonomy`, `free-text`, `price-report` | מודפס תחת "לטיפול ידני" (מפתח, כותרת, תשובה). לא נכתב לשום מקום |

תשובה פגומה (גודל לא תקין, אופציה לא מוכרת, שדה חסר) מדולגת ומודפסת עם הסיבה; הריצה ממשיכה. בסוף: applied / skipped / no-file / by-hand לכל סוג, ורשימת הקבצים ששונו. ל-`--mark` נכנסות רק תשובות שהוחלו (`applied`); תשובות בלי קובץ (`later`, `unsure`...) נשארות בתור.

# ה-runner של סל חכם: המק של נאור (הוקם 17.9.2026)

מימוש של [DATA-SERVICE-PLAN.md §11](DATA-SERVICE-PLAN.md) (החלטות 16.9): המק בבית מריץ את הצינור הקיים פעמיים ביום ומגיש (commit + push) את `data/products.json` ו-`data/catalogs/*.json` לענף הפרודקשן `claude/cart-transfer-redirect-mvp-wyxm2l`; Vercel פורס אוטומטית. המק מייצר קבצים בלבד ולא משרת לקוחות.

## מה מותקן

| רכיב | איפה | הערות |
|---|---|---|
| MacBook Air M2, 8GB, macOS 26.4 | | מחשב נייד: המכסה חייב להישאר פתוח (או מסך חיצוני + חשמל) כדי שהריצות יקרו. ראו "שינה". |
| Homebrew 5.1 | `/opt/homebrew` | |
| Node 22 (`node@22`, keg-only) | `/opt/homebrew/opt/node@22/bin` | לא ב-PATH הכללי בכוונה; הסקריפט וה-plist מוסיפים אותו. במק יש גם Node 24 ב-`/usr/local/bin` (התקנה ישנה) - הצינור לא משתמש בו. |
| git 2.50 (Apple), gh 2.90 | | `gh auth login` כ-`naorlugasi`; ל-push של git משמש osxkeychain (הטוקן כבר במחזיק המפתחות). |
| הריפו | `~/Projects/Cart` | ענף `claude/cart-transfer-redirect-mvp-wyxm2l`. אין תלויות ב-`package.json`, לכן אין `npm ci`. |
| Playwright 1.59 + Chromium | `~/Projects/Cart/node_modules` (בכוונה לא ב-package.json: Vercel מתקין devDependencies בכל פריסה), דפדפנים ב-`~/Library/Caches/ms-playwright` | הסקריפט מתקין לבד אם חסר (`npm install --no-save --no-package-lock playwright@1.59` ו-`npx playwright install chromium`), למשל אחרי `npm install` ידני שמחק אותו. `prices:online` פותח Chromium **עם חלון** (לא headless, בגלל הגנת הבוטים של האתרים), לכן הריצה צריכה סשן משתמש מחובר (launchd agent, לא daemon). |
| `scripts/daily-refresh.sh` | בריפו | הסקריפט של הריצה (פירוט למטה). |
| LaunchAgent | `~/Library/LaunchAgents/com.salhacham.prices.plist` (עותק ב-`ops/launchd/`) | 06:00 ו-12:00 כל יום, `RunAtLoad=false`. |
| הגדרות/סודות | `~/.config/salhacham/pipeline.env` (600, לא בריפו) | `HEALTHCHECK_URL` (נדרש; ה-ping URL של ה-check ב-healthchecks.io, הוגדר 17.9), `FETCH_RETRIES`, `FETCH_RETRY_WAIT`. |
| לוגים | `~/Library/Logs/salhacham/` | `<YYYY-MM-DD>.log` (שתי הריצות של אותו יום באותו קובץ), `launchd.out.log` / `launchd.err.log`. |

## מה הריצה עושה (`scripts/daily-refresh.sh`)

1. מריצה את עצמה מחדש תחת `caffeinate -i` (המק לא נרדם מחוסר פעילות כל עוד היא רצה) ונועלת `~/Library/Logs/salhacham/.run.lock` (ריצה חופפת יוצאת מיד בקוד 75).
2. בודקת: node, שהריפו על ענף הפרודקשן; מתקינה playwright אם חסר. שאריות לא מחויבות של `data/products.json` / `data/catalogs` מריצה קודמת נזרקות (`git checkout`); שינויים אחרים בעץ העבודה רק מתועדים כאזהרה ולא מחויבים.
3. `git pull --ff-only`.
4. `npm run prices:fetch`. הפורטלים נופלים לפעמים באופן חולף, לכן יש שתי שכבות: בתוך `scripts/fetch-prices.mjs` כל בקשת רשימה או הורדה מנוסה שוב עד 3 פעמים (המתנה 5/15/30 שניות) על שגיאות רשת ו-5xx/429, ורשת שבכל זאת נכשלה מנוסה שוב ברמת הסקריפט עד `FETCH_RETRIES` פעמים (ברירת מחדל 3) עם המתנה של `FETCH_RETRY_WAIT` שניות (ברירת מחדל 60). רשת שעדיין נכשלת = הריצה נכשלת (ולא רשת שנעלמת בשקט מההשוואה: קטלוג רשת בלי נתונים נמחק ב-`products:build`, וכך היא הייתה יורדת מהאתר).
   מה נראה ב-17.9 מהמק: כל 13 הרשתות עונות מה-IP הביתי, אבל בכל ריצה נפלו 1-3 רשתות שונות בניסיון הראשון (רמי לוי, ויקטורי, מחסני השוק, חצי חינם, שופרסל) ועברו בניסיון חוזר. שופרסל היא הבעייתית: `prices.shufersal.co.il` עונה לרשימת הקבצים תוך 8-27 שניות, ו-fetch של Node נופל ב-`UND_ERR_CONNECT_TIMEOUT` (10 שניות) בחלק מהפעמים. זה בצד שלהם; הפתרון כאן הוא הניסיונות החוזרים.
5. `npm run prices:online` (רמי לוי, יוחננוף, חצי חינם דרך Chromium, ~4 דקות) ואז `npm run products:build`.
6. `npm test`.
7. אם `data/products.json` או `data/catalogs` השתנו: `git commit -m "data: daily price refresh <תאריך>"`. אחר כך `git push` של כל מה שמקדים את origin (גם commit מריצה קודמת שה-push שלה נכשל), עד 3 ניסיונות בהפרש 30 שניות.
8. ping ל-`HEALTHCHECK_URL` (`/start` בתחילה, בלי סיומת בהצלחה, `/fail` בכישלון).

כל שלב שנכשל: השגיאה בלוג, **אין commit**, קוד יציאה שונה מאפס. ריצה מלאה לוקחת כ-5 דקות (fetch ~40 שניות, online ~4 דקות, build+test שניות), ועד כ-10 דקות עם ניסיונות חוזרים.

## איך מריצים ידנית

```bash
~/Projects/Cart/scripts/daily-refresh.sh
```

(מכל מקום; הפלט גם למסך וגם ללוג של היום.) אותו דבר דרך launchd, כמו שהתזמון יריץ:

```bash
launchctl start com.salhacham.prices
```

רק שלב אחד, בלי commit (למשל לבדיקת פורטל):

```bash
cd ~/Projects/Cart && PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/fetch-prices.mjs victory mck
```

## איך רואים לוגים ומצב

```bash
tail -f ~/Library/Logs/salhacham/$(date +%Y-%m-%d).log
```

```bash
grep -h "===" ~/Library/Logs/salhacham/*.log | tail -20
```

מצב ה-agent (האם טעון, PID אם רץ, קוד יציאה אחרון):

```bash
launchctl print gui/$(id -u)/com.salhacham.prices | grep -E "state|last exit|pid"
```

מה נדחף: `git log --oneline -5 origin/claude/cart-transfer-redirect-mvp-wyxm2l` ב-`~/Projects/Cart` (אחרי `git fetch`), והפריסה ב-Vercel.

## איך מכבים

השהיה (עד הפעלה מחדש):

```bash
launchctl bootout gui/$(id -u)/com.salhacham.prices
```

הפעלה מחדש:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.salhacham.prices.plist
```

עצירת ריצה שכבר רצה: `launchctl kill TERM gui/$(id -u)/com.salhacham.prices` (הנעילה משתחררת ב-trap; אם לא, `rmdir ~/Library/Logs/salhacham/.run.lock`). הסרה מלאה: bootout ואז מחיקת ה-plist מ-`~/Library/LaunchAgents`.

שינוי בשעות: לערוך את ה-plist (ב-`ops/launchd/` ובעותק המותקן), ואז bootout + bootstrap.

## שינה (pmset)

המצב ב-17.9: על חשמל `sleep 0` (המק לא נרדם מעצמו), על סוללה `sleep 1`. `caffeinate -i` בסקריפט מונע שינה מחוסר פעילות רק במהלך הריצה. כי זה מקבוק: סגירת המכסה מרדימה תמיד (אלא אם יש מסך חיצוני + חשמל), ואין דרך תוכנתית לעקוף את זה - להשאיר פתוח ומחובר לחשמל. הפקודות (דורשות sudo, מורצות פעם אחת):

```bash
sudo pmset -c sleep 0 disksleep 0
```

```bash
sudo pmset repeat wakeorpoweron MTWRFSU 05:55:00
```

השנייה מעירה/מדליקה את המק ב-05:55 אם הוא ישן או כבוי (למשל אחרי הפסקת חשמל); pmset תומך ב-`repeat` אחד בלבד, ולכן 12:00 מסתמך על זה שעל חשמל המק לא נרדם. ריצה שפוספסה בגלל שינה רצה כשהמק מתעורר (התנהגות launchd עם `StartCalendarInterval`), ריצה שפוספסה בגלל כיבוי לא.

## כשריצה נכשלת

1. `grep -n "ERROR\|FAILED\|=== FAILED" ~/Library/Logs/salhacham/<תאריך>.log` - השורה הראשונה עם ERROR אומרת איזה שלב.
2. לפי השלב:
   - **prices:fetch: chains still failing** - הפורטל של הרשת לא ענה 4 פעמים (ניסיון + 3 חוזרים). לנסות ידנית (`node scripts/fetch-prices.mjs <chain>`); אם הפורטל באמת למטה ורוצים בכל זאת לפרסם את שאר הרשתות, להריץ ידנית את שלושת השלבים ואז `git commit`/`push` (הרשת תישאר עם הקטלוג האחרון שלה ב-`data/prices/<chain>/` כל עוד התיקייה קיימת; בלי קטלוג בכלל היא מוסרת מההשוואה).
   - **prices:online** - Chromium לא נפתח (אין סשן משתמש? המסך נעול זה בסדר, יציאה מהמשתמש לא) או אתר רשת שינה API. להריץ `npm run prices:online <chain>` ידנית ולראות.
   - **npm test** - הבדיקות לא תלויות בנתונים (fixtures קפואים), אז זה אומר שהקוד בענף נשבר; לא לפרסם עד שמתקנים.
   - **git push failed 3 times** - בדרך כלל רשת/DNS (ב-17.9: "Could not resolve host: github.com" למשך 30 שניות). ה-commit נשאר מקומי (`git status -sb` מראה `ahead`), והריצה הבאה דוחפת אותו. אפשר גם `git push` ידני. הטוקן: `gh auth status`.
   - **git pull** - `git status` בריפו; קונפליקט או שינויים מקומיים בקבצים שהענף שינה.
   - **warn: healthcheck ping ... failed** - הריצה עצמה בסדר, רק ה-ping לא יצא. כמעט תמיד DNS: הראוטר (192.168.0.1, שרת ה-DNS היחיד של המק) נתקע לפעמים ל-5-40 שניות (נצפה 17.9 גם ב-`git push` וגם ב-ping). ה-curl מנסה 6 פעמים; אם זה חוזר, לשקול DNS חיצוני (1.1.1.1 / 8.8.8.8) בהגדרות הרשת. שגיאות curl מלאות ב-`launchd.err.log`.
   - **another run holds .run.lock** - ריצה קודמת עדיין רצה או נתקעה; `pgrep -fl daily-refresh`, ואם אין - `rmdir ~/Library/Logs/salhacham/.run.lock`.
3. אחרי תיקון: `launchctl start com.salhacham.prices` (או הסקריפט ישירות) ולוודא `=== done OK` בלוג ו-commit חדש בענף.
4. healthchecks.io: ה-check מקבל `/start` בתחילת ריצה, ping רגיל בסיום מוצלח ו-`/fail` בכישלון; מייל כשלא הגיע ping בזמן. ה-URL נמצא רק ב-`pipeline.env`; אם הוא חסר הריצה עובדת בלי pings ובלי אזהרה.

## מה עוד לא כאן

- R2 / DuckDB (שלבים 1+ בתוכנית): כשיוקמו, אותו סקריפט יכתוב ל-R2 במקום ל-git.

## שלב "כל הסניפים" (18.9.2026)

אחרי הפרסום היומי הסקריפט מריץ `node pipeline/run.mjs`: מוריד את PriceFull של **כל** הסניפים של 11 הקמעונאים (~900 קבצים, ~1.5-2GB ביום) ל-`data/pipeline/raw/<chain>/<date>/` וטוען ל-DuckDB `data/pipeline/prices.duckdb`. כשלון שם לא משפיע על פרסום הקטלוג.

דרישות במק: `brew install duckdb` (בלי זה השלב מדלג ורושם בלוג). דיסק: ~2GB ליום גולמי, נשמרים 7 ימים (`--keep-days`), ו-DuckDB ~2-4GB. לוג באותו קובץ יומי.

בדיקה ידנית: `duckdb data/pipeline/prices.duckdb -c "select chain_id, count(distinct store_id) stores, count(*) rows from prices_current group by 1 order by 1"`.


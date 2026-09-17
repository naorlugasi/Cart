# תוכנית מימוש: שירות המחירונים היומי (15.9.2026, עודכן 16.9)

> **עדכון 16.9.2026:** ה-runner הוא המק של נאור, DuckDB במקום Postgres, קבצים ב-R2 במקום API מול DB. ראו §11; §1, §3 ו-§8 מתארים את הגרסה הקודמת ונשארים כרפרנס.

[DATA-PIPELINE.md](DATA-PIPELINE.md) אומר *מה* בונים וכמה זה עולה. [CHAINS.md](CHAINS.md) אומר *ממי* מורידים. המסמך הזה אומר *איך ובאיזה סדר*: מבנה קוד, סכימה, שני המסלולים (אונליין וסניפים), שלבים עם הגדרת "גמור", והחלטות שצריך לקבל עכשיו.

## 0. עקרונות

1. **צינור אחד, שתי תצוגות.** אונליין וסניפים פיזיים הם אותם קבצים, אותו פרסר, אותו DB. "אונליין" = סניפים שמסומנים `type = online` (סניף אחד לכל מותג אונליין), בתוספת שכבת מחירים מה-API של אתר הרשת כשהסניף הזה לא מפרסם קובץ. "סניפים" = כל השאר. אין שני צינורות.
2. **רשת = שורת הגדרות, לא קוד.** דרייבר לכל *סוג פורטל* (6 סוגים מכסים 27 מ-29 הרשתות). קובץ `retailers.json` אומר לכל רשת איזה דרייבר, פרטי כניסה, מזהי סניפי אונליין ועדיפות.
3. **אידמפוטנטי ומתועד.** כל קובץ מזוהה ב-(רשת, סניף, סוג, חותמת זמן, hash תוכן). הרצה חוזרת לא מכפילה. לכל ריצה מניפסט ב-`pipeline_runs`.
4. **קודם שוויון למה שיש, אחר כך הרחבה.** השלב הראשון מייצר בדיוק את `data/products.json` והקטלוגים הרזים של היום, רק אוטומטית ומ-DB. האפליקציה לא משתנה עד שהצינור יציב.
5. **קוד קיים עובר, לא נכתב מחדש**: הדרייברים ב-`scripts/fetch-prices.mjs` (Cerberus, שופרסל, אלקטרה, חצי חינם, Laib), הפרסר `src/catalog/priceXml.js`, שכבות האונליין ב-`scripts/online-prices.mjs` (רמי לוי, יוחננוף, חצי חינם), ובניית המוצרים `scripts/build-products.mjs`.

## 1. ארכיטקטורה

```
   ┌──────────────────────── Runner (VPS ישראלי / מיני-PC, cron) ────────────────────────┐
   │                                                                                     │
   │  retailers.json ──► drivers/*  list(date) ──► fetch (8 במקביל, retry) ──► R2 raw/    │
   │                                                    │                                │
   │                                              parse + hash ──► diff ──► Postgres     │
   │                                                                     prices_current  │
   │  storefront APIs (רמי לוי, יוחננוף, חצי חינם) ──► online overlay ──► prices_history │
   │                                                                     stores, promos  │
   │                                                                     pipeline_runs   │
   │                                                                          │          │
   │                                          checks + alerts ◄───────────────┤          │
   │                                                                          ▼          │
   │                                      build ──► products.json + catalogs/*.json ──► R2 public/
   └─────────────────────────────────────────────────────────────────────────────────────┘
                                                                                  │
        Vercel (אתר + API הדק) ◄── בעלייה/כל שעה מושך את הקטלוגים מ-R2 ◄──────────┘
        שלב ב': API סל-מול-סניפים קורא ישירות מ-Postgres
```

- **Runner**: מכונה עם IP ישראלי (החלטה A/B/C ב-DATA-PIPELINE §4). Node 22, systemd timer, Tailscale לגישה. בלי Docker בשלב ראשון.
- **ארכיון**: Cloudflare R2. `raw/<chain>/<yyyy-mm-dd>/<fileName>` (30 יום), `public/catalogs/*.json` (הפלט שהאתר מושך).
- **DB**: Postgres (Neon בהתחלה, קל להעביר). האתר ב-Vercel לא נוגע ב-DB בשלב א'.
- **פריסה של נתונים בלי git**: היום רענון = commit של קטלוגים + פריסה. במקום זה השרת מושך `public/catalogs/*.json` מ-R2 בעלייה וכל שעה (ETag). הקוד ב-git, הנתונים ב-R2.

## 2. מבנה הקוד

```
src/pipeline/
  config/retailers.json     29 רשתות: { id, name, driver, edi, login, onlineStores:[{brand, storeId}], priority, schedule }
  drivers/
    cerberus.js             url.publishedprices.co.il (קיים; להפוך ל-list(date) לכל הסניפים, לא רק אונליין)
    shufersal.js            prices.shufersal.co.il (קיים; לעבור על כל storeId)
    electra.js              prices.carrefour.co.il (קיים; JSON בתוך HTML כבר מכיל את כל הסניפים)
    hazihinam.js            shop.hazi-hinam.co.il/prices (קיים)
    laib.js                 laibcatalog.co.il JSON API (קיים)
    bina.js                 <chain>.binaprojects.com/Main.aspx (חדש; 10 רשתות)
    static.js               רשימת קבצים סטטית / HTML פשוט (סופר-פארם, נתיב החסד, וולט)
  fetch.js                  הורדה מקבילית, פענוח gzip/UTF-16, sha1, כתיבה ל-R2, מניפסט
  parse.js                  עוטף src/catalog/priceXml.js: PriceFull → rows, PromoFull → rules, Stores → stores
  load.js                   diff מול prices_current, upsert, append ל-prices_history, promos
  stores.js                 קובצי Stores פעם בשבוע, סימון type online/store, גיאוקידינג לסניף חדש
  online.js                 שכבות ה-API של אתרי הרשתות (מ-scripts/online-prices.mjs)
  build.js                  scripts/build-products.mjs קורא מ-DB במקום מקבצים; כותב ל-R2 public/
  checks.js                 בדיקות שפיות והתראות
  run.js                    CLI: node src/pipeline/run.js --date 2026-09-15 --chains ramilevy,shufersal --stages fetch,parse,load
db/migrations/001_init.sql
```

חוזה הדרייבר (הדבר היחיד שמשתנה בין פורטלים):

```js
// מחזיר את כל הקבצים הזמינים לתאריך, לכל הסניפים
async function list({ retailer, date }) → [{ storeId, type: 'PriceFull'|'PromoFull'|'Stores'|'Price'|'Promo', name, ts, url, headers? , size? }]
```

הכל אחרי זה (הורדה, פענוח, diff, load) זהה לכל הרשתות.

## 3. סכימת DB

```sql
create table chains (id text primary key, name text, edi text, driver text, priority char(1));
create table stores (
  id serial primary key, chain_id text references chains, external_id text, sub_chain text,
  name text, address text, city text, lat double precision, lng double precision,
  type text check (type in ('store','online')), brand text, is_active bool default true,
  content_group text,               -- סניפים עם מחירון זהה (hash) מקבלים אותה קבוצה
  updated_at timestamptz, unique (chain_id, external_id)
);
create table products (gtin text primary key, name text, brand text, manufacturer text, unit text, qty numeric,
  is_weighted bool, category text, concept_id int, image_url text, first_seen date, last_seen date);
create table prices_current (
  store_id int references stores, gtin text, price numeric(10,2), unit_price numeric(10,2),
  in_stock bool default true, promo_ref text, updated_at timestamptz,
  primary key (store_id, gtin)
);
create index on prices_current (gtin);                 -- סל × הרבה סניפים
create table prices_history (store_id int, gtin text, price numeric(10,2), valid_from date, valid_to date)
  partition by range (valid_from);
create table promos (store_id int, promo_id text, gtins text[], rule jsonb, valid_from timestamptz, valid_to timestamptz, club bool,
  primary key (store_id, promo_id));
create table files (id serial primary key, chain_id text, store_id int, type text, name text, ts timestamptz,
  sha1 text, bytes int, rows int, status text, run_date date, unique (chain_id, name));
create table pipeline_runs (id serial primary key, run_date date, chain_id text, stage text, status text,
  files int, rows int, changed int, started_at timestamptz, finished_at timestamptz, error text);
create table online_overlay (store_id int, gtin text, price numeric(10,2), in_stock bool, storefront_id text,
  image_url text, fetched_at timestamptz, primary key (store_id, gtin));
```

- `prices_current` לפריוריטי A: ~915 סניפים × ~15k ≈ 14M שורות (~1.5GB עם אינדקס). כל 29 הרשתות: ~40M.
- `content_group`: רמי לוי מפרסם מחירון זהה לכל הסניפים; מזהים לפי sha1 ומעבדים קובץ אחד לקבוצה. חוסך 60-80% מהעבודה.

## 4. שני המסלולים

### 4.1 אונליין (מה שהאתר משתמש בו היום)

סניף האונליין של כל מותג, כפי שנמצא עד היום (`SOURCES` ב-`scripts/fetch-prices.mjs`), עובר ל-`retailers.json` כ-`onlineStores`:

| מותג | פורטל | סניף אונליין בקבצים | שכבת API |
|---|---|---|---|
| שופרסל | shufersal | 413 "שופרסל ONLINE" | לא צריך |
| רמי לוי | Cerberus | 039 "מרלוג אינטרנט" (`pricefull…-039-…`, ZIP) | `POST /api/catalog`: **אימות בלבד** (98% זהה), מלאי, תמונה |
| יוחננוף | Cerberus | פיקאפ בלבד: קובץ סניף האיסוף (בקטלוג 050 נתניה הדרים) | GraphQL עם `Store: s116`: **אימות בלבד** (100%). ברירת המחדל של האתר (s82 צומת חולון) לא תואמת לאף קובץ |
| טיב טעם | Cerberus | 502 ליקוט נתניה | לא צריך |
| קשת טעמים | Cerberus | 120 ממ"ר (`PriceFull…-120-…` בלי תת-רשת) | לבדוק Self Point `/products` לזמינות |
| קרפור / ביתן / קוויק | electra | 471 / 472 / 473 | Self Point `/products` לזמינות (`branch.isActive`) |
| ויקטורי / מחסני השוק | laib | 097 "אינטרנט" | לא צריך |
| חצי חינם | hazihinam | 219 online warehouse | `getItemsBySubCategory` (10k פריטים): מחיר, מלאי, תמונה |
| אושר עד | Cerberus | אין אונליין: הסניף הגדול, מסומן "בסניף בלבד" | - |

כללים:
- **כלל המקור (17.9.2026):** המחיר המוצג הוא תמיד מהמחירון שהרשת מפרסמת לחנות המקוונת. ה-API של אתר הרשת רק **מאמת** (אחוז אי-התאמה נשמר ב-`source.online.verify` ומוצג בסיכום הבנייה), מסמן מה לא נמכר אונליין (`in_stock`) ומוסיף תמונות. רק כשהרשת לא מפרסמת קובץ לחנות המקוונת (היום: אף רשת; המנגנון נשאר) ה-API הוא מקור המחיר, והקטלוג מסומן `priceSource: 'api'` כדי שה-UI יגיד זאת. ממומש ב-`scripts/build-products.mjs`.
- ה-overlay רץ אחרי הקבצים, פעם ביום, ומגדיל את `image_url` ב-`products` (זה מקור התמונות לאתר).
- הפלט לשלב א' זהה לפלט של היום: `products.json` (≥3 רשתות, 4,000 מוצרים) + `catalogs/<chain>.json`. השוני היחיד: נכתב ל-R2 ולא ל-git.
- שלב ב': הסף "≥3 רשתות" יורד ל-2 והקטלוג גדל לעשרות אלפים; האתר עובר לחיפוש דרך API.

### 4.1.1 יוחננוף: רשת פיקאפ = כמה קטלוגים (17.9.2026)

האתר של יוחננוף מוכר לאיסוף עצמי בלבד. הלקוח בוחר נקודת איסוף (23), והמחיר הוא מחיר הסניף המשרת אותה,
נשלח ל-API עם header `Store: s<code>`. מיפוי כל נקודת איסוף לקובץ המפורסם (400 מוצרים מדגמיים לכל נקודה):

| מחירון | נקודות איסוף (view) | קובץ מפורסם | תאימות |
|---|---|---|---|
| **A** | 18: אור יהודה s72, אשדוד s63, באר שבע s97, גדרה s148, חדרה s75, חיפה s67, טבריה s76, ירושלים s73, כפר סבא s77, מודיעין s70, מישור אדומים s138, נתיבות s65, נתניה הדרים s116, נתניה צורן s81, עפולה s94, קריית שמונה s95, ראשל"צ רמת אליהו s80, רחובות s59 | קבוצת 29 הסניפים של 001 (כולל 050) | 100% |
| **B** | 2: בת ים s84, נס ציונה s83 | קבוצת 9 הסניפים של 015 | 100% |
| **C** | 3: צומת חולון בן צבי s82 (**ברירת המחדל של האתר**), רמלה s66, תל אביב יד אליהו s79 | **אין** (הקרוב ביותר 76%) | - |

47 קובצי הסניפים מתחלקים ל-7 מחירונים שונים (29 / 9 / 4 / 2 / 1 / 1 / 1 סניפים). המסקנה: **יוחננוף מתנהגת כשלוש רשתות** בהשוואה
(A, B, C), והלקוח בוחר נקודת איסוף. A ו-B נבנים מקובץ + אימות API; ל-C אין קובץ, ולכן API בלבד מסומן `priceSource: api`,
או שלא מציגים אותה עד שהרשת תפרסם. ה-handoff חייב לקבוע את נקודת האיסוף שנבחרה (view) בעגלה, אחרת המחיר בקופה הוא של C.
בקטלוג היחיד של היום: A (קובץ 050, view s116).

### 4.2 סניפים פיזיים (שירות הקנייה בסניף)

- `Stores` פעם בשבוע לכל רשת → `stores` עם כתובת; סניף חדש → גיאוקידינג (Google, ~3,000 פעמים חד-פעמי) → סניף בלי כתובת תקינה → תור תיקון.
- `PriceFull` + `PromoFull` לכל סניף כל יום. סדר: פריוריטי A (~915 סניפים) → B (~250 עם Bina/Cerberus, בלי קוד חדש) → C → D.
- `content_group` לפי hash: קובץ זהה לאתמול = דילוג מלא; קובץ זהה לסניף אחר באותה רשת = שיוך לקבוצה בלי פענוח נוסף.
- API ליבה (שלב 3): `POST /api/basket/price { gtins:[{gtin, qty}], lat, lng, radiusKm }` → לכל סניף ברדיוס: סה"כ, פריטים חסרים, מבצעים, מחיר מועדון בנפרד, מרחק. שאילתה אחת על האינדקס: `where gtin = any($1) and store_id = any($2)`, יעד < 100ms ל-50 פריטים × 40 סניפים.
- מה שונה מאונליין: אין overlay (אין API לסניף), המלאי לא ידוע (מציגים "במחירון" ולא "במלאי"), ומבצעי מועדון נפוצים יותר. לכן בתצוגה: "מחיר לפי מחירון הרשת מ-<תאריך>".

## 5. שלבים והגדרת "גמור"

| שלב | ימים | מה נעשה | גמור כשֶ… |
|---|---|---|---|
| **0. תשתית וסקר** | 1 | VPS (או מיני-PC) + Tailscale, Neon, R2 bucket, healthchecks.io. מהמכונה: בקשה אחת לכל 12 הפורטלים, רישום מי חוסם. סקלטון `src/pipeline` + מיגרציה 001. | טבלה של 12 פורטלים × (מגיב / חוסם / דורש דפדפן) מהמכונה שתריץ בפועל. |
| **1. דרייברים והורדה** | 3 | 5 הדרייברים הקיימים עוברים לחוזה `list(date)` על כל הסניפים; דרייבר Bina חדש; `fetch.js` מקבילי עם retry, sha1, R2, מניפסט. הרצה על סניפי האונליין של פריוריטי A. | `run.js --stages fetch` מוריד את קבצי היום של 8 רשתות A ל-R2 עם מניפסט; הרצה שנייה באותו יום לא מורידה כלום. |
| **2. אונליין מ-DB** | 3 | `parse/load` לסניפי אונליין, `online.js` (3 השכבות הקיימות), `build.js` קורא מ-DB וכותב ל-R2; השרת מושך קטלוגים מ-R2; טיימר יומי 06:00 + 12:00 לכשלים; התראות. | `products.json` מהצינור זהה (±מוצרים שנוספו/נגמרו) לזה שנבנה ידנית היום; האתר מתעדכן יום אחרי יום בלי commit ובלי אדם. |
| **3. כל הסניפים של A** | 3 | `stores.js` + גיאוקידינג, `content_group`, load ל-~915 סניפים, `prices_history`, `checks.js` לכל רשת. API `basket/price`. | 14M שורות ב-`prices_current`, ריצת בוקר מלאה < 60 דקות, שאילתת סל × 40 סניפים < 100ms, כל 8 הרשתות עם התראת "לא פרסמה" שעובדת. |
| **4. B/C והפעלה** | 3 | הוספת 17 הרשתות של B/C ל-`retailers.json` (Cerberus/Bina/Laib בלבד), backfill מהארכיון, דשבורד `pipeline_runs` באתר הניהול, תיעוד הפעלה ותקלות. | 25+ רשתות רצות יומית; ריצה שנכשלת מייצרת מייל עם הסיבה; יש נוהל "פורטל שינה מבנה" של 10 דקות. |
| | **13** | | |

לא בגרסה הראשונה: קובצי delta תוך-יומיים, D (נוחות/פארם), העשרת מוצרים ב-LLM (מסמך נפרד), מעבר האתר לחיפוש דרך API.

## 6. תזמון יומי

```
06:00  fetch      A+B+C: list → download → R2         (~5GB, 8 במקביל, ~25 דק')
06:30  parse+load קבוצות תוכן חדשות בלבד → diff → upsert (~20 דק')
06:55  online     3 שכבות API של אתרי הרשתות             (~5 דק', דפדפן אמיתי לרמי לוי)
07:00  build      products.json + catalogs → R2 public/  (~3 דק')
07:05  checks     שפיות לכל רשת → מייל/Slack אם משהו חורג
07:10  Vercel מושך קטלוגים חדשים (ETag) בבקשה הבאה
12:00  retry      רק רשתות שנכשלו / לא פרסמו בבוקר
יום א' 05:00  stores  קובצי Stores + גיאוקידינג לסניפים חדשים
```

הפורטלים מפרסמים בין 03:00 ל-06:00; רשת שמאחרת נתפסת ב-12:00. יום בלי קובץ = המחירון של אתמול נשאר, מסומן בתאריך.

## 7. ניטור

לכל רשת, כל ריצה: מספר סניפים שפורסמו, מספר מוצרים בסניף האונליין, מחיר חציוני של 50 מוצרי עוגן (חלב, לחם, ביצים…), אחוז שורות שהשתנו.

התראה כש: רשת לא פרסמה עד 12:00 · מספר מוצרים ירד > 30% · מחיר חציוני של העוגנים זז > 15% · דרייבר זרק שגיאה · ריצה ארוכה מ-90 דקות · healthchecks.io לא קיבל ping עד 08:00 (המכונה עצמה נפלה).

הצגה: `pipeline_runs` בדף `/admin/data` (רשת × תאריך, ירוק/צהוב/אדום, קישור לשגיאה), וליד כל מחיר באתר "עודכן <תאריך>".

## 8. הקמה, צעד אחר צעד

1. **מכונה**: Kamatera Ubuntu 24.04, 4 vCPU / 8GB / 100GB (~$30). `apt install nodejs npm` (Node 22), משתמש `pipeline`, Tailscale.
2. **Neon**: פרויקט `cart-prices`, DB `prices`, הרצת `db/migrations/001_init.sql`. שמירת `DATABASE_URL`.
3. **R2**: bucket `cart-prices` עם תיקיות `raw/` (lifecycle 30 יום) ו-`public/` (public read דרך custom domain `data.<domain>`). API token לקריאה/כתיבה.
4. **סודות** ב-`/etc/cart-pipeline.env`: `DATABASE_URL`, `R2_*`, `GOOGLE_GEOCODING_KEY`, `ALERT_EMAIL`/`SLACK_WEBHOOK`, `HEALTHCHECK_URL`. ההתחברויות לפורטלים (Cerberus) הן ציבוריות ונשארות ב-`retailers.json`.
5. **systemd**: `cart-pipeline.service` (oneshot, `node src/pipeline/run.js --stages all`) + `cart-pipeline.timer` (06:00, 12:00) + `cart-stores.timer` (יום א' 05:00). לוגים ב-journald, 14 יום.
6. **Vercel**: משתנה `CATALOGS_URL=https://data.<domain>/public/`; השרת טוען קטלוגים משם בעלייה ומרענן כל שעה לפי ETag; אם אין גישה, נופל לקבצים שב-repo (המצב של היום).
7. **בדיקה מקצה לקצה**: הרצה ידנית, השוואת `products.json` לזה שב-git, פתיחת האתר, בדיקת handoff אחד.

## 9. סיכונים ומה עושים איתם

| סיכון | תשובה |
|---|---|
| פורטל חוסם את ה-IP של המכונה | מתגלה ביום 0. אותו פורטל בלבד רץ ממיני-PC בבית / proxy ישראלי (כמה GB בחודש). |
| פורטל משנה מבנה (קרה עם Laib) | דרייבר נפרד לכל פורטל; ההתראה עולה, המחירון של אתמול נשאר מוצג עם תאריך. |
| נפח: 40M שורות upsert ביום | `content_group` מוריד ל-~10M; upsert במנות של 5k עם `on conflict … where price is distinct from`; היסטוריה רק לשינויים. |
| קידודים ווריאציות בקבצים (UTF-16, zip, תגיות שונות) | הפרסר הקיים כבר מטפל ב-UTF-16/gzip; כל קובץ שנכשל נשמר ב-R2 ומסומן, לא עוצר את הריצה. |
| ברקודים פנימיים (שקילים, מותג פרטי) | נשמרים כ-`gtin` פנימי עם קידומת הרשת; לא מתאחדים בין רשתות; שכבת המושגים (PRODUCT §2.2) מטפלת בהם. |
| Neon נרדם / איטי בבוקר | ריצת ה-load מקבלת חיבור אחד ארוך; אם Neon יקר או איטי, Postgres על ה-VPS (אותה סכימה). |

## 10. החלטות לקבל עכשיו (הוכרעו ב-§11)

1. **איפה רץ**: VPS ישראלי (~$30) או מיני-PC בבית. ההמלצה: VPS, ומיני-PC רק אם פורטל חוסם.
2. **Neon או Postgres על ה-VPS**: Neon לשלבים 0-3 (אפס תחזוקה), הערכה מחדש בשלב 4 לפי עלות.
3. **מתי האתר עובר מקבצים ל-API**: לא לפני שהצינור רץ 14 יום ברצף בלי התערבות.

עם שלוש ההחלטות האלה אפשר להתחיל בשלב 0 מיד.

## 11. החלטות 16.9.2026: המק בבית, קבצים במקום מסד נתונים

אחרי סקירה מחדש של העלות והפשטות, התוכנית משתנה בארבע נקודות. כל השאר (דרייברים, שני המסלולים, שלבים, ניטור) נשאר.

| נושא | היה (§1-§8) | הוחלט |
|---|---|---|
| Runner | VPS ישראלי / מיני-PC | **המק של נאור בבית.** $0, IP ביתי. launchd במקום systemd, `pmset` שלא יישן, ריצה שפוספסה רצה בהתעוררות. המק מייצר קבצים בלבד ולא משרת לקוחות. |
| מצב נוכחי והיסטוריה | Postgres (Neon) | **DuckDB** בקובץ אחד במק (`data/pipeline/prices.duckdb`, ~3GB), גיבוי יומי ל-R2. שאילתות diff/aggregate על 40M שורות תוך שניות. מעבר עתידי ל-Postgres = `COPY`. |
| הגשה לאתר | קטלוגים ב-R2 + API מול Postgres | **קבצים בלבד ב-R2 `public/`**: קטלוגי האונליין (כמו היום), ולשירות הסניפים קובץ לכל ברקוד `gtin/<gtin>.json` = מחיר בכל סניף (~10KB). סל של 50 פריטים = 50 קבצים מה-CDN, הסכימה בפונקציה. חיפוש: אינדקס סטטי (MiniSearch). בלי DB בענן. |
| עלות | $50-100 לחודש | **~$1-5 לחודש** (R2 + Vercel חינמי). |

**ביניים, עד שיש R2:** הצינור הקיים (`prices:fetch` → `prices:online` → `products:build`) רץ יומית במק ומגיש (commit + push) את `data/products.json` ו-`data/catalogs/*.json` לענף; Vercel פורס אוטומטית. זה נותן רענון יומי אוטומטי כבר בשלב 0, בלי שום תשתית חדשה. כשה-R2 מוקם, אותו job כותב ל-R2 במקום ל-git.

**הקמה על macOS (מחליף את §8):**
1. Homebrew, Node 22, git, `gh auth login`. clone של הריפו לענף `claude/cart-transfer-redirect-mvp-wyxm2l`, `npm ci`, `npm test`.
2. הרצה ידנית של הצינור הקיים מהמק: `npm run prices:fetch && npm run prices:online && npm run products:build`. זה גם הסקר של §5 שלב 0: אילו פורטלים עונים מה-IP הביתי (כולם, בהערכה).
3. launchd: `~/Library/LaunchAgents/com.salhacham.prices.plist` עם `StartCalendarInterval` 06:00 ו-12:00, `RunAtLoad` false, לוגים ל-`~/Library/Logs/salhacham/`. הסקריפט: fetch → online → build → `npm test` → commit + push רק אם הקטלוגים השתנו → ping ל-healthchecks.io.
4. `sudo pmset -c sleep 0 disksleep 0` (בחיבור לחשמל), ו-`caffeinate -i` בתוך הסקריפט למשך הריצה. אם זה מקבוק: המכסה יכול להיות סגור רק עם חשמל ומסך חיצוני, אחרת להשאיר פתוח.
5. healthchecks.io: check "prices-daily" עם grace של 3 שעות; מייל כשלא הגיע ping עד 09:00.
6. סודות: `~/.config/salhacham/pipeline.env` (600). היום אין סודות נדרשים (הכניסות לפורטלים ציבוריות); R2 ו-healthchecks יתווספו.

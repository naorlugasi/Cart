# Department misroutes found while working חטיפים וממתקים (24.9)

Found while writing the concept round for `config/concepts/snacks.json` (חטיף/חטיפי, גרעיני, צ'יפס,
שוקולד, ביסקוויט). `src/catalog/categorize.js` is shared with other agents' rounds, so these are filed
here rather than fixed — each one was verified directly against `categorize()`, not guessed.

| Product name | Current department | Correct department | Keyword that routed it |
|---|---|---|---|
| ציפס תפ"א בטעם סטייק דיזל 120 גר | בשר ועוף | חטיפים וממתקים | `סטייק` |
| סטייק ציפס בלגי 2.5 ק"ג | בשר ועוף | חטיפים וממתקים | `סטייק` |
| ציפס גלאט עוף 1.5 ק | בשר ועוף | חטיפים וממתקים | `עוף` |
| לייס-ציפס עוף בגריל 150 גרם KFC | בשר ועוף | חטיפים וממתקים | `עוף` / `גריל` |
| ציפס בטעם כנפיים ברביקיו 70 גר פלינט | בשר ועוף | חטיפים וממתקים | `כנפיים` |
| גרעיני חמניה קלויים 400 גר' ששון הקולה | משקאות | חטיפים וממתקים | `קולה` (inside the brand name **ששון הקולה**, not the product) |
| ששון הקולה גרעיני חמניה קלופים | משקאות | חטיפים וממתקים | `קולה` (same brand-name collision) |
| גרעין אבטיח 170 גרם ששון הקולה | משקאות | חטיפים וממתקים | `קולה` (same brand-name collision) |
| גרעיני *אבטיח קלויי במלח 200ג בשקית | ניקיון וטואלטיקה | חטיפים וממתקים | `שקית` (the ניקיון rule's disposable-bag word fires on any "...בשקית" packaging description, not just trash/freezer bags) |
| גרעיני חמניה במליחות עדינה 300 גר בשקית | ניקיון וטואלטיקה | חטיפים וממתקים | `שקית` (same) |
| חטיף גבינה לבנה אפרסק 45 גר | חטיפים וממתקים | חלב וביצים (judgment call) | `חטיף` — this is a sweetened cottage/white-cheese snack (like Danonino/Milky), not a candy; flagged for Naor's call per "departments follow chain shelves", not fixed here |

## סטטוס (25.9, סבב המחלקות - src/catalog/categorize.js)

- [x] **ציפס/סטייק/עוף/כנפיים (~54)** - כבר נכון live דרך המושג `potato-chip-seasoned` עבור המוצרים שנבדקו. תוקן גם ברמת מילת המפתח: `(?<!שוקו)צ'?יפס` נוסף ל-SNACK_SELF_DECLARE (משותף לכמה רולים) - עם שומר `(?<!שוקו)` כדי לא לתפוס "שוקוציפס"/"שוקוצ'יפס" (צ'יפס שוקולד) בתוך עוגה/בצק עוגיות, שכמעט נשבר בגרסה הראשונה של התיקון (ר' דוח).
- [x] **ששון הקולה (73 מוצרים בכל הקו, לא רק הגרעינים)** - תוקן: `ששון הקולה` נוסף כחריג מפורש לרול משקאות.
- [x] **שקית (6 מוצרים שנמדדו, יותר בפועל)** - תוקן: חריג ברול ניקיון ל-`\d\s*(?:גר|גרם|ג)\s*בשקית` (משקל+"בשקית" כתיאור אריזה).
- [ ] **חטיף גבינה לבنה** - לא תוקן, כפי שביקש הסבב המקורי ("judgment call... flagged for Naor's call"): נשאר `חטיפים וממתקים`.

## Notes for whoever picks these up

- **`סטייק`/`עוף`/`כנפיים`/`גריל` in the meat wordRule catch flavour descriptors on potato-chip bags**
  (~54 products, verified via `potato-chip-seasoned`'s cross-department health count). The rule needs a
  guard analogous to the existing "ice cream is a sweet" exception at categorize.js:199/234 — something
  like "a `צ'יפס`/`חטיף` product stays a snack even when its flavour text names a cut of meat."
- **`שקית` is too broad** in the ניקיון וטואלטיקה wordRule (categorize.js:161 area) — it exists for
  actual disposable bags (trash bags, freezer bags) but also fires on "300 גר **בשקית**", the ordinary
  way chains describe a snack's own packaging. Only 6 products confirmed here (the ones this round's new
  seed concepts surfaced), but the same word will misroute anything else packaged "בשקית" the same way.
- **The `ששון הקולה` brand name contains "קולה"** (cola) as a literal substring, tripping the משקאות
  rule the same way `docs/CONCEPTS.md`/`concepts.js` already warns about for "קולה" inside "גוטוקולה".
  Every product from this brand — not just the seeds this round touched — is at risk; worth a dedicated
  `NOT_HEB_AHEAD`-style guard or a brand-name exclusion in the drinks rule.
- **`חטיף גבינה` (sweet white-cheese snack, e.g. Danonino/Milky-style)** matches the generic `חטיף`
  keyword and lands in חטיפים וממתקים. No concept was written for this family this round — it looked
  like a dairy-aisle product, not a candy, so it was left alone rather than guessed at. `concept-why.mjs`
  on a barcode from this family will show the raw names if someone wants to make the call.
- **Checked and NOT a misroute:** `נובילוס` (fillet/duck/lamb/salmon snack line) and `בייבי ביס`/"...
  לתינוקות" rice snacks both looked suspicious in an unscoped grep across `data/prices/*/catalog.full.json`,
  but `categorize()` already sends "חטיף לכלב..." correctly to בעלי חיים and "בייבי ביס..."/"...
  לתינוקות" correctly to תינוקות. Don't re-flag these without testing `categorize()` directly first — a
  raw catalog grep isn't department-scoped and will show you products that never touch snacks.json's
  cluster scan at all.

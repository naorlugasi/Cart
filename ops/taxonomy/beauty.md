# טיפוח ויופי - department misroutes found while writing config/concepts/beauty.json (24.9)

Concept assignment (config/concepts/*.json) runs on every raw name regardless of the product's current
department, so these products already carry a correct concept from beauty.json even though categorize.js
(src/catalog/categorize.js, shared file - not edited here) still puts them somewhere else. Each row: product
name, current department, correct department, best-guess keyword that routed it there.

| product name | current department | correct department | likely keyword |
|---|---|---|---|
| עפרון שפתיים חידוד 168 (and ~50 more `עפרון שפתיים ...` lip-liner names) | ניקיון וטואלטיקה | טיפוח ויופי | bare `שפתיים` is a standalone keyword in the ניקיון וטואלטיקה wordRule; the טיפוח ויופי wordRule only has `לשפתיים` (with the ל attached), which "עפרון שפתיים" never carries, so the household rule wins the race |
| קרם ידיים 150 מ"ל (and ~44 more `קרם ידיים ...` hand-cream names) | ניקיון וטואלטיקה | טיפוח ויופי | `קרם ידיים` is listed explicitly in the ניקיון וטואלטיקה wordRule; the טיפוח ויופי wordRule lists `קרם פנים/גוף/יום/לילה/עיניים/אנטי/לחות/הגנה` but never `קרם ידיים` |
| שמן 100% ארגן טהור30מל (pure argan oil, a hair/skin treatment oil) | שימורים | טיפוח ויופי | generic `שמן` (oil) keyword, no exclusion for a cosmetic oil - unlike `סבון נסטי שמן זית ושמן ארגן` (a soap, correctly household) and `פוליויקס פרקט בתוספת שמן ארגן` (floor polish, correctly household), which are legitimately non-beauty and not part of this finding |
| כפפות אלוורה להקלה על עור יבש - S/M/L/XL (aloe gloves for dry skin) | ניקיון וטואלטיקה | טיפוח ויופי | `כפפות` (gloves) is a bare keyword in the ניקיון וטואלטיקה wordRule (meant for disposable/cleaning gloves); these are a skincare treatment product, not cleaning equipment |
| רויטליפט טונר לפנים 180מ, טונר אורז 150מ"ל (face toner) | שימורים | טיפוח ויופי | neither wordRule lists a `טונר` keyword at all (confirmed via `node scripts/dead-keywords.mjs`, which flags 5 dead טיפוח ויופי keywords but doesn't even list טונר as attempted) - the name falls through to whatever food keyword it also carries (here `אורז`, rice) |

## Cross-file concept conflicts this round surfaces (not fixable from beauty.json)

`node scripts/concept-round.mjs --diff` reports a name as a conflict when two concepts both match it (the
build drops it from both). Most of what beauty.json's new rules newly conflict with is a hair-dye shade or a
cosmetic product literally named after a food (honey, walnut, cinnamon, mango, eggplant, aloe, rice,
pistachio) - **this class is already handled** by the food/non-food department guard added 24.9
(`conceptForCategory` in scripts/build-products.mjs, exercised by test/conceptCategory.test.js): once
categorize() puts the product in טיפוח ויופי, a food concept is dropped and the beauty concept survives, so
there is nothing to fix there.

Two conflicts are **not** covered by that guard, because both sides are already non-food concepts in
different departments - they need a `none` added on the household.json side (out of scope for this round):

- **makeup-remover vs baby-wipes** (household.json): `מגבוני הסרת איפור` (makeup-remover wipes, 5 names) also
  matches baby-wipes' generic `מגבוני?` pattern. Suggest household.json add `"none": ["הסרת איפור"]` to
  baby-wipes.
- **skin-face-cream vs liquid-hand-soap-general** (household.json): three "מועשר בקרם לחות ..." liquid-soap
  names (soap enriched with moisturizing cream) also match my `קרם` + `לחות` trigger. Suggest household.json
  add `"none": ["סבון"]` to liquid-hand-soap-general (or I could add `"none": ["סבון"]` to skin-face-cream
  instead, ceding these three to the soap concept - deferred to whoever reviews first, since it is a genuine
  either-side fix).

One conflict is a real bundle SKU, not a rule bug: `פלטת צלליות+עפרון עיניים` names a palette+pencil duo pack
in one product name - it legitimately can't belong to either eye-shadow or eye-pencil alone, left unassigned.

## סטטוס (25.9, סבב המחלקות - src/catalog/categorize.js)

- [x] **עפרון שפתיים** - נוסף `עפרון שפתיים` לרשימת טיפוח ויופי (רול 1); כבר עבד גם דרך המושג `lip-pencil` בפועל, אבל נוסף כגיבוי ברמת מילת המפתח.
- [x] **קרם ידיים** - נוסף `קרם ידיים` לרשימת טיפוח ויופי (רול 1). בנוסף, `conceptRejected()` היה דוחה את המושג `skin-hand-cream` עצמו כי `NON_FOOD_SIGNAL` כולל "קרם ידיים" - תוקן ע"י הוספת פטור לקטגוריה "טיפוח ויופי" (סימטרי לפטור הקיים ל"ניקיון וטואלטיקה").
- [x] **שמן 100% ארגן** - נוסף `ארגן` (בלי הגבלת "שמן" צמוד, כדי לתפוס גם "מועשר בארגן") לרשימת טיפוח ויופי, עם שומר חדש (שמפו/מרכך/תחליב רחצה/פוליויקס/פרקט/מנקה) כדי לא לגנוב מוצרי שמפו/צחצוח רצפות אמיתיים שגם מזכירים ארגן.
- [x] **כפפות אלוורה** - נוספה הפראזה `כפפות אלוורה` לרשימת טיפוח ויופי.
- [x] **טונר** - התברר שגוי: `טونר` כבר קיים בפועל בשתי הרשימות (טיפוח ויופי וניקיון), ורול 1 (טיפוח) נבדק ראשון - "רויטליפט טونר לפنيم" ו"טونר אورز" כבר חוזרים נכון live. לא נדרש תיקון.
- [ ] **makeup-remover vs baby-wipes / skin-face-cream vs liquid-hand-soap-general** - קונפליקטים ברמת המושג (household.json), לא בקובץ הזה - מחוץ לתחום (categorize.js בלבד).

## Concept-health note (informational, not a fix)

`hair-mask` (household.json, category ניקיון וטואלטיקה) requires `שיער`/`מתולתל` to appear; several hair
masks in this department slip past it because they carry only a brand/ingredient word instead (`מסכה פנטן
להזנה עמוק`, `מסכת קרטין אינטנס למניעת קשקשים`, `מסכה קרטין וביוטין`). I did not widen household.json's rule
(out of scope) and kept my own `skin-face-mask` from swallowing them by excluding `פנטנ`/`קרטינ`/`קשקש`/
`החלקה`, so they stay unassigned rather than being mis-tagged as a face mask.

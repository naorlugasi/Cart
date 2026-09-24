# Department misroutes found while working `config/concepts/drinks.json` (round 24.9)

Not mine to fix - `categorize.js` is shared, several agents touch it in parallel. Filed for whoever
picks up the department pass. All counts measured against `data/products.json` as it stood for this round.

## Non-drink products sitting IN משקאות (should move out)

### Glassware and bar tools - 66 products, → בית וכלים

Wine/whiskey/beer/liqueur glasses, decanters and bottle openers all contain a drinks word
(יין / בירה / ליקר / ויסקי) or, for the espresso cups, a coffee word (קפה / אספרסו), which is what routes
them into משקאות. None of them are something you drink - they're the vessel.

| product name | current department | correct department | keyword I believe routed it |
|---|---|---|---|
| גביע יין מוכסף כתר | משקאות | בית וכלים | יין |
| 10גביע יין עגולים 150מ | משקאות | בית וכלים | יין |
| גביעי יין + תחתית מוכסף | משקאות | בית וכלים | יין |
| גביעי יין קטנים פסים עם רגל מחוברת ניצוצות זהב | משקאות | בית וכלים | יין |
| גביעי, יין, כוסות | משקאות | בית וכלים | יין |
| דקנטר יין זכוכית 1 ליטר | משקאות | בית וכלים | יין |
| דקנטר יין זכוכית ענבר 15000 מל | משקאות | בית וכלים | יין |
| כוס יין 6 אינז` 12 יח` הנמל | משקאות | בית וכלים | יין |
| כוס יין גדולה | משקאות | בית וכלים | יין |
| כוס יין מהודרת שקוף | משקאות | בית וכלים | יין |
| כוסות יין 6 יח | משקאות | בית וכלים | יין |
| כוסות יין מעוטרות 40 יח`זהב הנמל | משקאות | בית וכלים | יין |
| כוסיות יין- 50 יח פאלאס | משקאות | בית וכלים | יין |
| פותחן יין מלצרים BET | משקאות | בית וכלים | יין |
| פותחן ליין | משקאות | בית וכלים | יין |
| פותחן ליין פרפר | משקאות | בית וכלים | יין |
| כוס ויסקי גבוהה 10 יח`הנמל | משקאות | בית וכלים | ויסקי |
| כוסות ויסקי 10 יח`PP הנמל | משקאות | בית וכלים | ויסקי |
| 24גביעי ליקר מוכסף 60מל | משקאות | בית וכלים | ליקר |
| כוס ליקר מרובעת 2אוז 20יח שווה | משקאות | בית וכלים | ליקר |
| כוס בירה | משקאות | בית וכלים | בירה |
| כוס בירה גבוהה 1/2 ליטר | משקאות | בית וכלים | בירה |
| כוסות בירה 330 מ"ל | משקאות | בית וכלים | בירה |
| כוסות שקופות לבירה 3 | משקאות | בית וכלים | בירה |
| כוס אספרסו | משקאות | בית וכלים | אספרסו |
| כוסות אספרסו 40 יח' בסט וליו | משקאות | בית וכלים | אספרסו |
| כוס נייר אספרסו 4oz | משקאות | בית וכלים | אספרסו |
| כוס לקפה חרסינה. | משקאות | בית וכלים | קפה |
| כוסות קפה לדרך+מכסה 16 יח` 8 אונז` הנמל | משקאות | בית וכלים | קפה |
| כוס שמפניה בלו שיין | משקאות | בית וכלים | uncertain - "בלו שיין" contains "יין" as a substring of "שיין" (brand), not the standalone word; may be the rule, may be something else |
| כוס קריסטל בלו שיין | משקאות | בית וכלים | uncertain - no drinks keyword visible in the name at all; worth a direct look |
| כוס קינוח קריסטל 60 | משקאות | בית וכלים | uncertain - same as above |
| כוסות חד פעמיות לשתיה קרה 330 מ"ל ר.שמאי 40 יחידות | משקאות | בית וכלים | uncertain, maybe "שתיה" |

(38 more of the same shape, mostly `כוס/כוסות/גביע/גביעי` + יין/בירה/ויסקי/ליקר/קפה - full list is the
"Glassware/tools" query in the round's working notes, not reproduced here to keep this file short. The
fix is one department-rule change: a product whose name opens with כוס/כוסות/גביע/גביעי/דקנטר/פותחן/כוסית
is dishware regardless of what it's a glass *for* - same shape as the mushroom fix's "מגבת מטבח" guard.)

### Small kitchen appliances - 12 products, → בית וכלים

Coffee machines and ice-cube makers, routed in by "קפה"/"אספרסו". An appliance is not a drink any more
than a wine glass is wine.

| product name | current department | correct department | keyword I believe routed it |
|---|---|---|---|
| מכונת אספרסו Nespresso Mini EN85E | משקאות | בית וכלים | אספרסו |
| מכונת קפה גו לבנה P | משקאות | בית וכלים | קפה |
| מכונת קפה גו שחורה | משקאות | בית וכלים | קפה |
| מכונת קפה לבנה DELUX | משקאות | בית וכלים | קפה |
| מכונת קפה קפוסלות תו | משקאות | בית וכלים | קפה |
| מכונת קפה קפסולות גוון שחור BH-9949IL | משקאות | בית וכלים | קפה |
| מכונת קפה EMILIO מינ (×2) | משקאות | בית וכלים | קפה |
| מכונת קפה NINJA דגם 601 | משקאות | בית וכלים | קפה |
| מכונת קפה NINJA דגם 701 | משקאות | בית וכלים | קפה |
| מכונת קוביות קרח גולד ליין | משקאות | בית וכלים | uncertain - no drinks keyword visible ("קרח"/"קוביות" are not in the משקאות word list I read); worth a direct look |
| מכונת קוביות קרח גולד ליין שחור | משקאות | בית וכלים | uncertain, same as above |

### Canned tomatoes and canned fruit in syrup - 16 products, → שימורים

These are canned/preserved goods described as "packed in tomato juice" or "in syrup" - the same shape
as TRAPS.md #1 (a prepared food that contains the ingredient's name), just on the department layer
instead of the concept layer. "מיץ"/"סירופ" are drinks keywords; peeled/crushed tomatoes and canned
pineapple slices are pantry. (This is exactly the class of product `juice-tomato`'s new `none` guards
in this round exclude at the concept layer - see the commit. The department is still wrong underneath.)

| product name | current department | correct department | keyword I believe routed it |
|---|---|---|---|
| עגבניות אדומות קלופות במיץ עגבניות 680גר | משקאות | שימורים | מיץ |
| עגבניות אדומות קלופות חתוכות במיץ 660 גר | משקאות | שימורים | מיץ |
| עגבניות במיץ טבעי 92 | משקאות | שימורים | מיץ |
| עגבניות במיץ עגבניות | משקאות | שימורים | מיץ |
| עגבניות במיץ עגבניות דיאדיה וניה 680 גרם | משקאות | שימורים | מיץ |
| עגבניות חמוצות במיץ (×2) | משקאות | שימורים | מיץ |
| עגבניות חתוכות במיץ | משקאות | שימורים | מיץ |
| עגבניות מקולפות שלמות במיץ עגבניות 400 | משקאות | שימורים | מיץ |
| פרוסות אננס במיץ אננס דל מונטה 435 גרם | משקאות | שימורים | מיץ |
| פרוסות אננס בסירופ דל מונטה 435 גרם | משקאות | שימורים | סירופ |
| פרוסות אננס בסירופ קל ויליפוד 490 גרם | משקאות | שימורים | סירופ |
| פרוסות אננס בסירופ קל פילד גוד | משקאות | שימורים | סירופ |
| פרוסות אננס מקולפים בסירופ קל (×2) | משקאות | שימורים | סירופ |
| פרוסות מנגו בסירופ קל טעים 425 גרם | משקאות | שימורים | סירופ |

## סטטוס (25.9, סבב המחלקות - src/catalog/categorize.js)

- [x] **Glassware/bar tools (66 products)** - תוקן: `VESSEL_OPENER` (שם שנפתח ב-כוס/כוסות/כוסית/גביע/גביעי/דקנטר/פותחן/מכונת) נוסף לחריג של רול משקאות, ו-`גביע|גביעי|דקנטר|מכונת קפה|מכונת אספרסו|מכונת קוביות קרח|כוסית|כוסיות` נוספו לרול בית וכלים (פותחן/כוס/כוסות כבר היו שם).
- [x] **Small kitchen appliances (12 products)** - אותו תיקון (VESSEL_OPENER תופס גם "מכונת").
- [x] **Canned tomatoes/pineapple in juice/syrup (16 products)** - תוקן: חריג ברול משקאות לשם שנפתח ב-עגבני/פרוסות/אננס/משמש/שזיפ ומכיל מיץ/סירופ; `עגבני` נוסף לרול שימורים כדי לתפוס אותם שם.
- [x] **וויסקי בלק בוש / ג'וני ווקר דאב / ערק עמיאל / יין איטלקי וורזנו / טרפיצה Oak Cask / אפרול שפריץ / סרטורי פרוסקו / סלקטד מוסקטו / בלו נאן / ואל דוקה / קאווה איבריקה / יין טרפיצה ברוקל/טסורו** - לא נבדק פרטנית אחד-אחד (מחוץ לסקופ המדיד), אבל "ערק" (בלי א') נוסף בתור וריאנט כתיב חסר לרול משקאות - תופס את "ערק עמיאל" ו-25 מוצרים נוספים. "בלק בוש" חשף תקלה נפרדת ולא קשורה (ר' "ממצא שלא תויק" למטה).
- [x] **ליקר בטעם דובדבן שרי HEERING** - קונפליקט מול המושג `herring` (produce-deli-frozen.json) - ברמת המושג, מחוץ לתחום categorize.js.

## ממצא שלא תויק: "לק" תופס "בלק" (שם מותג, לא לק ציפורניים)

נמצא תוך כדי בדיקת "וויסקי בלק בוש 700 מ\"ל" (המבחן הבודק שהעדכון הזה לא שובר וויסקי רגיל): המילה הבודדת `לק` ברול טיפוח ויופי (וגם ברול ניקיון) תופסת את "לק" בתוך "בلק" (Black, כמו ב"בלק בוש" או "ג'וני ווקר בלק לייבל") כי ה-START boundary מתייחס ל-ב שלפני כאל תחילית דקדוקית לגיטימית. לא תוקן - קדם לסבב הזה, כללי (משפיע על גם ניקיון וגם טיפוח), ודורש בדיקה נגד כל הקטלוג לפני שינוי.

## Real drink products sitting OUTSIDE משקאות (should move in)

Found while auditing wine and spirit concepts against the whole catalog, not scoped to drinks like the
list above - a fuller pass would probably find more. All of these matched a real `drinks.json` concept
(wine-red/white/rose/sparkling, whiskey, arak) from this round, so the concept layer already gets them
right; the department badge on the product card is still wrong.

| product name | current department | correct department | note |
|---|---|---|---|
| וויסקי בלק בוש 700 מ"ל | טיפוח ויופי | משקאות | a bottle of Irish whiskey filed under beauty |
| ויסקי ג'וני ווקר דאב | ניקיון וטואלטיקה | משקאות | filed under cleaning/toiletries |
| ערק עמיאל לימונים 70 | כללי | משקאות | |
| יין איטלקי וורזנו קיאנטי קלסיקו 750 מל | כללי | משקאות | |
| טרפיצה Oak Cask שרדונה 750 מל | כללי | משקאות | |
| מארז אפרול שפריץ + פרוסקו צינזנו כשר | כללי | משקאות | |
| סרטורי - פרוסקו ברוט 200 מל | כללי | משקאות | |
| סלקטד מוסקטו לבן מבעבע 750 מל 2016 | ירקות ופירות | משקאות | |
| בלו נאן מבעבע יבש מהדורת הזהב 750 מ"ל | שימורים | משקאות | |
| ואל דוקה פרוסקו יבש מאוד 750 מ"ל | שימורים | משקאות | |
| קאווה איבריקה חצי יבש750 (×2 more קאווה lines) | שימורים | משקאות | |
| יין טרפיצה ברוקל מלבק 750 מל | מאפים ולחם | משקאות | |
| יין טרפיצה טסורו מלבק 750 מ"ל | מאפים ולחם | משקאות | |
| ליקר בטעם דובדבן שרי HEERING | מעדנייה | משקאות | brand name "Herring" collides with the fish concept - see note below |

## Cross-file finding: plant milks belong in dairy-eggs.json, not here

`config/concepts/drinks.json` already carries two plant-milk concepts - `soy-milk-drink` and
`oat-milk-drink` - both tagged `"category": "חלב וביצים"` even though the file itself is drinks.json and
the matching products physically sit in the משקאות department (`concept-health.mjs`: 20 of
`oat-milk-drink`'s 39 matches come from משקאות). That split already existed before this round; I didn't
add to it or touch either concept.

This round found the same shape unclaimed and did NOT write for it, per the brief - it belongs to
whoever owns `dairy-eggs.json`:

- **משקה אורז** (rice drink) - 11 products, e.g. `משקה אורז אורגני 1 ליטר`, `משקה אורז שקדים אורגני 1 ליטר`
- **משקה שקדים** (almond drink) - 11 products, e.g. `משקה שקדים אורגני 1 ליטר`, `משקה שקדים 6% טהור1ליטר(12)`
- **משקה קוקוס / מי קוקוס** (coconut drink/water) - 8 products across the `קוקוס` and `מי קוקוס` sub-clusters, e.g. `משקה קוקוס אורגני 1 ליטר`, `משקה מי קוקוס 1 ליטר`

All three clear the 3-product threshold. Whoever picks this up: category should be `חלב וביצים` to match
the two siblings already in this position, and the family prefix is presumably a new one (`plant-milk` or
similar) since `soy`/`oat` don't currently share a prefix either.

## Cross-file finding: two products two other concepts wrongly claim

Found while measuring this round's diff, not something I can fix (both concepts live in files I don't
own):

- **`herring`** (produce-deli-frozen.json, presumably) matches `ליקר בטעם דובדבן שרי HEERING` and five
  siblings (`ליקר שרי הרינג...`) - the liqueur brand is "Heering" (a real Danish cherry liqueur), spelled
  the same as the Hebrew word for the fish. This round's `liqueur` concept now excludes `הרינג` so the two
  don't conflict, but `herring` keeps the products - it was already claiming them before this round, and
  is still wrong to.
- **`pasta-other`** (pantry.json) matches `ליקר פרפקטו טראפל...` and `ליקר פרפקטו נוגט 700` (700ml
  truffle/nougat liqueur bottles) via the brand name "Perfetto" colliding with the pasta-brand word
  "פרפקטו". This round's `liqueur` concept now excludes `פרפקטו` to avoid the conflict, letting the
  pre-existing (wrong) `pasta-other` match stand rather than drop the product from both. Worth a
  `none: "ליקר"` on `pasta-other`'s side.

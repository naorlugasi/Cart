# Department misroutes and cross-file notes found while working שימורים round 2 (27.9)

Found while running the synonyms/coverage/head-word-scan round on `config/concepts/pantry.json`
(תבשיל, פקאן, כורכום, סחוג, אורגנו/רוזמרין, לבבות דקל, שיבולת שועל, קרוטונים, קמח תירס/קוקוס/שקדים,
עגבניות חתוכות/מקולפות/כבושות/מיובשות, ראס אל חנות, גריסי פנינה/תירס, and the coordinator's
pickled-mushrooms addition). Not fixed here — `src/catalog/categorize.js` is shared and out of scope
for a concept round. Format: product name, current department, correct department, likely cause.

## 1. תבשיל (instant/prepared dish) misroutes (7 products, no concept claims them)

These never got a concept this round (see round report) and fall through to `CATEGORY_RULES`
keyword routing, which sends them to the wrong department:

| product | current dept | correct dept | likely keyword |
|---|---|---|---|
| תבשיל להכנה מהירה טעם עוף וגבינה 140 גרם | בשר ועוף | שימורים | עוף |
| תבשיל הודי דאל תרד 300 גרם | ירקות ופירות | שימורים | תרד |
| תבשיל הודי תפוח אדמה ואפונה טייסטל 300 | ירקות ופירות | שימורים | תפוח אדמה / אפונה |
| תבשיל פתיתים ופטריות | ירקות ופירות | שימורים | פטריות |
| תבשיל בשקית בטעם בקר | ניקיון וטואלטיקה | שימורים | unclear - "בשקית" alone shouldn't route to cleaning; worth a keyword audit |
| תבשיל בשקית בטעם ירק | ניקיון וטואלטיקה | שימורים | same pattern |
| תבשיל בשקית בטעם עוף | ניקיון וטואלטיקה | שימורים | same pattern |

The three "בשקית" ones are the odd case — nothing in the name obviously reads as cleaning/toiletries.
Worth a `categorize(name)` trace by whoever next opens `categorize.js` for שימורים.

## 2. NON_FOOD_SIGNAL "טלק"-inside-"איטלקי" pre-existing bug hits the new instant-rice concept

Already documented file-wide in `categorize.js` (see the comment above `nonFoodSignalRejects`,
and `ops/taxonomy/pantry.md`'s mushroom-duet note) as a bare-substring match with no word-boundary
protection, scoped as "out of scope for this review" and given a narrow exemption for mushroom
concept ids only. It also hits the new `instant-rice` concept: `תבשיל אורז בסגנון איטלקי` has a
concept (`instant-rice`, category שימורים) but `categorize()` rejects the concept category because
`NON_FOOD_SIGNAL` fires on "טלק" inside "איטלקי", and the product falls through to `כללי` instead
of `שימורים`. Not fixed here (same reasoning as the existing mushroom exemption: a general
word-boundary fix is a bigger, file-wide categorize.js change). Flagging in case whoever extends the
`MUSHROOM_CONCEPT_IDS`-style exemption wants to fold `instant-rice`/`instant-noodles` in too — several
of the "בסגנון איטלקי" instant-rice products will have the same problem.

## 3. nuts-pecan: "גביע" (cup/tub) keyword collides with housewares

`פקאן קלוף גביע אקסטרה 130 גר` (raw shelled pecans sold in a plastic tub) lands in `בית וכלים`
(housewares) — `גביע` also means "goblet/trophy cup" and is presumably a housewares keyword.
Concept (`nuts-pecan`) is correct; department is not. A few other `nuts-pecan` matches also show a
stale `כללי` department in `data/products.json` (TRAPS #15 — check with `categorize()` live, not the
field) rather than a real bug: `אקסטרים פקאן 6 יח`, `פקאן * טבעי 150גר בשקית/280 גר בקופסא`, `פקאן
אמריקאים מקולף`, `פקאן טבעי 150 גרם ששון הקולה`. Same for several `flour-almond` matches showing
`חטיפים וממתקים` (pure almond flour bags, e.g. `קמח שקדים כרם - 250 גר`, `קמח שקדים ללא גלוטן 400
גרם`) — stale field, not a matching bug; confirmed by reading the names (no cookie/candy word
present).

## 4. Cross-file: fresh "tomato" concept (produce-deli-frozen.json, not mine) has no pickled/vinegar guard

`tomato-pickled` (new this round, pantry.json) legitimately matches `עגבניות בחומץ 2.55 ק` and
`עגבניות אדומות בחומץ`, but so does the existing bare `tomato` concept in another agent's file,
which has no `none` exclusion for `בחומץ`/`כבוש`/`מוחמצ` the way most other fresh-produce concepts
exclude `קפוא`/`מוקפא`. Measured: 2 products go from a clean `tomato` assignment to a
`tomato+tomato-pickled` conflict (both concepts drop it). Not fixed here — it's another agent's file.
Suggested fix for whoever owns it: add `בחומצ`/`כבוש`/`מוחמצ` to the fresh `tomato` concept's `none`
list, the same way it (presumably) already excludes frozen/canned forms.

## 5. סחוג (skhug) without a color word — left unassigned on purpose

`סחוג תימני` (5 products, no color), `סחוג מסורתי` (1), `סחוג אקסטרה חריף` (1) don't specify red or
green, and Yemeni skhug is sold in both colors commercially — guessing would risk exactly the kind of
wrong-flavor assignment TRAPS warns about. Left without a concept this round rather than guessed.

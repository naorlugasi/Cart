# בעלי חיים - species+form round (config/concepts/pets.json, 25.9)

298 products, 225 without a concept (76%) before this round. `general.json`'s `pet-food-dog`/`pet-food-cat`
(another round owns that file, not touched here) already catch anything that literally says "מזון"/"אוכל"
next to כלב/חתול - almost none of the branded names in this department do that (פרמיו, פריסקיז, פנסי, דוגלי,
בונזו, סימבה, לה קט...), which is why the department sat at 76% empty. Every concept in `pets.json` rejects
"מזונ"/"אוכל" in its own `none` so it can never claim a name pet-food-dog/pet-food-cat already claims - two
concepts matching one name is a conflict that drops both (taxonomy TRAPS.md #14).

## Department misroutes found while writing this round

`categorize()` runs on the raw name and, independently, on `(name, conceptId)` where a concept's own
`category` field wins outright (docs/CONCEPTS.md, exercised by `test/concepts-pharmacy.test.js`'s
"re-categorizes" pattern). 25 products in this catalog have "לכלב"/"לחתול"/"חתלתול" in their name but sit
in `products.json` under a different department (בשר ועוף, חלב וביצים, שימורים, חטיפים וממתקים, כללי) -
found via `data/products.json`'s `category` field.

**24 of the 25 are stale cache, not a live bug** - `categorize.js` already has a `בעלי חיים` wordRule
(line ~160, `לחתול|לחתולים|חתולים|לכלב|לכלבים|כלבים|פריסקיז|פנסי פיסט|פרמיו(?!ם)|דוגלי|בונזו|...`) that
correctly routes every one of them **today**, live (verified by calling `categorize(name, null)` directly
for all 24 names - every one returns `בעלי חיים`). `products.json`'s `category` field just predates that
rule or predates a rebuild (taxonomy TRAPS.md #15) and will self-correct on the next daily refresh (מרלוג).
No action needed.

**1 genuine, still-live gap**: `לה קט חתלתולים 2.85 ק"ג` (La-Cat kitten food) routes to `כללי`, live, right
now:
- "לה קט" (La-Cat) is not one of the brand names the `בעלי חיים` wordRule knows (it lists דוגלי/בונזו/פדיגרי/
  וויסקס/רויאל קנין/פרו פלאן/פריסקיז/פנסי פיסט, not לה קט or סימבה or מיגל).
- "חתלתולים" (kittens) shares no substring with the wordRule's "חתולים"/"לחתול" - it is a different word
  (kitten), not an inflection of חתול the wordRule already covers - the exact same gap independently found
  three more times below.

**This one is already fixed by this round, without touching categorize.js**: `cat-food-kitten` claims
this name (`חתלתול` is in its `all`), and `cat-food-kitten`'s own `category` is `"בעלי חיים"`, so
`categorize(name, 'cat-food-kitten')` returns `בעלי חיים` even though the wordRule alone still misses it.
Proven in `test/concepts-pets.test.js` ("a concept written here also re-categorizes a product..."). Left
open only as a suggestion: `categorize.js`'s wordRule could add `חתלתול|קיטנ` and `לה קט` directly, so a
`לה קט`/`חתלתול` product with **no** concept at all (conflicted out, or a variety this round didn't reach)
does not fall back to `כללי` the way this one almost did.

## The recurring gap: "חתלתול"/"קיטן" (kitten) is a different string from "חתול" (cat)

Found four times independently, in four different files, none of them editable from this round:

| File | Concept | Guard it has | Guard it's missing | Real product this let through |
|---|---|---|---|---|
| `categorize.js` | (בעלי חיים wordRule) | `חתולים`, `לחתול` | `חתלתול`, `קיטנ` | `לה קט חתלתולים 2.85 ק"ג` → כללי (fixed here via concept category, see above) |
| `pantry.json` | `tuna-canned` | `לחתול`, `חתול` | `חתלתול` | 6 קיטן/חתלתול wet-food names with "טונה" - see LOST below |
| `produce-deli-frozen.json` | `salmon` | `לחתול`, `חתול` | `חתלתול` | `פרמיו דליקט לחתלתול עם סלמון 375 גרם` - see LOST below |
| `dairy-eggs.json` | `feta-cheese` | `לחתול`, `חתול` | `חתלתול` | `מעדן בקר וכבד במרקם פטה לחתלתול` - see LOST below |
| `dairy-eggs.json` | `feta-cheese` | `לכלב` | bare `כלב` (construct state "שימורי כלב", no ל) | 4 `וונפי שימורי כלב פטה...` names - see LOST below |

None of these five files are in scope for this round (only `pets.json`/`index.json`/`families.json` are).
`cat-food-kitten`/`dog-food-wet` claiming the same name creates a conflict instead, which drops the wrong
tag rather than leaving it standing - see the LOST list in the commit message for the full accounting. The
fix on the other side, when someone next opens those files, is one word each: add `חתלתול|קיטנ` to the
`none` lists that already have `חתול`/`לחתול`, and add bare `כלב` next to feta-cheese's `לכלב`.

## Brand clusters checked and rejected as concepts (taxonomy TRAPS.md trap 2)

`concept-clusters.mjs --department "בעלי חיים" --expand <word>` was run on every large cluster. All of
these are brand names, not products, and none of them appear anywhere in `pets.json`'s `match` rules:
פרמיו (65), פריסקיז (27), פנסי (16), דוגלי (6), דנטלייף (5, но see below), סימבה (4), בונזו (3), לה קט (3),
ברונו, א.ש., מיגל/מיגליאור, נוטרילאב, נייטיב, וונפי, קלבר קט, אברקלין. `דנטלייף` and `דנטל` are the one
brand-shaped word this round DOES key off (`dog-dental`/`cat-dental` `any: ["דנטל"]`) - kept because, unlike
the others, "dental" is a generic format description (dental chews/sticks) that multiple lines use, not a
manufacturer name, and the `all: ["כלב"]`/`["חתול"]` gate means it can never leak outside this department's
species-tagged names.

## Concepts written (11)

| id | family | what it catches | products (raw-name diff) |
|---|---|---|---|
| `dog-treats` | dog | חטיפ/מקל/סטיק/עצמ/רצוע/ביסקוו/נגיס/לעיס + כלב, not דנטל | 53 |
| `cat-food-wet` | cat | פאוצ/שימור/פטה/מחית/דליקט/גרייבי/טייסטי + חתול, not קיטן/דנטל | 41 |
| `cat-treats` | cat | חטיפ/שלוק/מקל/סטיק/עצמ/רצוע/ביסקוו/נגיס/לעיס/רול + חתול, not קיטן/דנטל/מגרדת | 31 |
| `cat-food-kitten` | cat | חתלתול/קיטן (either species-word form) | 23 |
| `dog-dental` | dog | דנטל + כלב | 12 |
| `cat-dental` | cat | דנטל + חתול, not קיטן | 9 |
| `dog-food-wet` | dog | פאוצ/שימור + כלב, not דנטל | 8 |
| `cat-toys` | cat | מגרדת/כדור/צעצוע + חתול, not חטיפ | 7 |
| `cat-litter` | cat | חול + חתול | 6 |
| `cat-food-dry` | cat | כריות/יבש + חתול, not קיטן/דנטל | 6 |
| `dog-muzzle` | dog | מחסום + כלב | 3 |

Two family entries added to `families.json`: `dog` → "לכלבים", `cat` → "לחתולים" (siblings would otherwise
fall back to the shortest sibling's own name, which reads worse here than for most families since the
siblings span very different product types - food, treats, litter, toys).

## Measured (concept-round.mjs, `--raw`, product-level `--verdict` against the pre-round checkout)

- **+100 products gained** a concept, **+17 products newly conflicted** (dropped from the concept layer,
  not into a wrong tag - see LOST accounting in the commit message), **+11 concepts**.
- Department coverage (`concepts-report.mjs --category "בעלי חיים"`, uses `data/products.json`'s current -
  possibly stale, see above - category field): 298 products, 165 assigned (55%, up from 0% of this round's
  own concepts), 13 conflicts shown at the department level, 3 of which pre-date this round entirely
  (`פרמיו מעדן סלמון ופורל במרקם פטה`→feta-cheese+trout, `פרמיו סלמון ואורז 1.`→rice-white+salmon, `פרמיו
  סלמון ופורל 15`→salmon+trout - pre-existing salmon/trout/rice-white/feta-cheese collisions with each
  other, not with anything in `pets.json`, out of scope here).
- `concept-clusters.mjs --department "בעלי חיים"`: 76% → 40% of products without a concept (298 total).

## Left open

- **No `dog-food-dry` concept.** No dog dry-kibble bag in this catalog says "יבש" or any other textual dry
  cue - "דוגלی בוגר בקר 3 ק"ג", "בונזו בשר 10.2 ק"ג" and similar are identifiable as dry kibble only by
  brand recognition, which is exactly the brand-concept trap this round was told to avoid. Left
  unconceptualized by design; `test/concepts-pets.test.js` asserts this explicitly (`דוגלי בוגר בקר` → null).
- **No `dog-food-puppy`/adult life-stage concepts.** "גור"/"גורים" (puppy) co-occurs with "כלב" in only one
  product after excluding the already-tagged "מזון לגורי כלבים..." ones - below the ≥3-products/≥2-chains
  bar. "בוגר" (adult) is the default state for most of the food already captured by form (wet/dry/kitten);
  a separate adult concept would only self-conflict with those.
- **No leash/collar concept.** No product in this catalog says רצועת הליכה/קולר as leash/collar hardware
  (the "רצועה" that does exist here is jerky treat strips, already in dog-treats/cat-treats).
- **`כדור זוהר לכלב`** (a glow ball, single product, one chain) and a handful of other singleton
  clusters are left alone per the ≥3-products/≥2-chains rule (SKILL.md) - not a backlog.
- **Substitute policy** (`config/substitutes/rules.json`): `pet-food-dog`/`pet-food-cat` are `"none"`
  (never substituted). This round's concepts default to unset → `"full"`, which is arguably right (same
  species+form treats/food genuinely are comparable, unlike the broad umbrella) but is a call for Naor, not
  made here - out of this round's file scope.

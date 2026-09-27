# Department check for round 2 (27.9) - synonyms, coverage, מקלוני/רצועות/לקקן

Round 2 on `config/concepts/snacks.json`: synonym findability, the nut/nut-butter/stick/gift-box
coverage clusters, and the three peer-flagged product types (לקקן, מקלוני, רצועות).

## Checked directly against `categorize()` - no misroute found

Every product newly picked up by this round's concepts (`cashews`, `hazelnuts`, `pecans`, `chestnuts`,
`nut-butter`, `chocolate-gift-box`, `snack-sticks-savory`, `candy-stick`, `biscuit-stick`,
`fruit-strip-snack`) was run through `categorize(name, assignConcept(name, list))` live, not read off
the stale `category` field on `data/products.json` (TRAPS #15). All 274 land where their concept's own
`category` says they should: 188 in חטיפים וממתקים, 67 in שימורים (the nut-butter jars, same shelf as
the existing `chocolate-spread`), 19 in מאפים ולחם (the savoury sticks, same shelf as the existing
`crackers-*` family). Nothing to file here.

## Not a department issue - cross-file concept conflicts (left as conflicts, not fixed)

These are `config/concepts/*.json` match-rule collisions with files this round does not own, so they were
left as silent conflicts (no concept, not a wrong one) rather than resolved by widening or narrowing
someone else's rule. Verified with `matchingConcepts` (via `scripts/concept-round.mjs --diff`'s
`CONFLICTS introduced` list), not guessed. All of these are the same shape: this round's new
`snack-sticks-savory` (or `fruit-strip-snack`) correctly claims a flavoured/shaped snack, and a raw-
ingredient concept in another file has no exclusion for the snack form:

- **`pantry.json` `rice-white`** (34 products, `מקלוני אורז ...`) - the largest one, worth a `none:
  "(מקלונ|מקלות)"` on `rice-white` whenever pantry.json's round picks this up.
- **`pantry.json` `olives`** (4 products, `מקלות כוסמין זיתים ...`).
- **`pantry.json` `hummus-prepared`** (1 product, `מקלוני חומוס דאבייל`).
- **`pantry.json` `za-atar`** (2 products, `מקלוני כוסמין וזעתר ...`).
- **`pantry.json` `beans-green`** (1 product, `מקלוני שעועית ירוקה`).
- **`dairy-eggs.json`/`pantry.json` `chia-seeds`** (1 product, `מקלות תפוא ציה 80 גר`).
- **`pantry.json` `honey`** (1 product, `צ'וקטה ביגלה טעם דבש מלח 160ג`) - here it's `pretzels` (this
  file) on the other side, not a new concept: `honey`'s bare `דבש` has no exclusion for a flavoured
  bageleh.
- **`produce-deli-frozen.json` `mango-fresh`** (2 products, `רצועות מנגו ...`/`מנגו רצועות טבעי`) has no
  exclusion for `רצוע`/`יבש`. One of the two mango-strip products (the chocolate-coated one) already
  resolves cleanly to `fruit-strip-snack` alone, because `מצופה` trips `mango-fresh`'s own fresh-kind
  guard - only the plain "natural" one still conflicts.
- **`drinks.json` `water-soda`** (3 products, `לקקני סודה ...`) - pre-existing, not introduced by this
  round (`candy-hard` already had `לקקנ` in its `all` before this round started).
- **`dairy-eggs.json` `mozzarella`** was ALSO going to conflict with the new `cashews` on
  "מוצרלה קשיו"/"כמוצרלה קשיו" (vegan cashew-based mozzarella) - fixed on this side instead
  (`none: "מוצרלה"` on `cashews`), since a cashew-cheese isn't loose cashews and excluding it costs
  nothing real.

None of the ones above are fixed here because fixing them means editing a file another agent's round
owns. Flagging so whoever next opens pantry.json/produce-deli-frozen.json/drinks.json for a round sees it.

## Pre-existing, out of scope for this round (found while auditing, not fixed)

- **`potato-chip-seasoned`** (declared category חטיפים וממתקים) also matches several frozen French-fry
  brands that `categorize()` correctly routes to מעדנייה (`אמריקאן ציפס`, `גולד צ'יפס קלאסי`,
  `מאמא צ'יפס`, `גולד סטייק צ'יפס`) - the concept, not the department, is wrong for these. Pre-existing
  (this round only added a synonym to this concept, never touched its `match`), ~20 products per
  `concept-health.mjs`. Left alone; flagging in case a future snacks round wants to add
  `none: "(תפוגנ|מוקפא|קפוא)"`.
- **`cookies` none: `jerry`** is a dead keyword (`concept-dead-rules.mjs`) - the raw catalogs never spell
  Ben & Jerry's in Latin script the way the rule expects. Pre-existing, not touched this round.

## Follow-up from the drinks round: שקד תבור brand collision (TRAPS #18)

The coordinator flagged that the new `syrup-maple` (drinks round) conflicts with `almonds-snack` on two
maple-syrup products from the food company **שקד תבור** ("Shaked Tavor") - the same shape as `oil-olive`
claiming a competitor's oil because the maker is called עץ הזית. Checked every `שקד תבור` raw name before
fixing: the brand also sells ground almonds and almond spread (already excluded via `קמח`/`ממרח`), so
`none: "שקד תבור"` on `almonds-snack` costs nothing real. Added `none: "סירופ"` too (an almond snack is
never a syrup) - this incidentally also resolved three PRE-EXISTING conflicts this round did not cause
(`almonds-snack+flavored-syrup`, `almonds-snack+oil-coconut`, `almonds-snack+silan` all had `שקד תבור`
products from the same brand sitting in limbo before this fix).

## A systemic finding worth its own round: the fresh/processed kind guard blocks bulk-sold snacks

`passesKindGuard` (src/catalog/concepts.js) blocks a `processed`-kind concept whenever the name's only
type-word evidence is a `fresh` one - and `config/concepts/type-words.json` lists `(^| )במשקל( |$)`
("sold by weight") as a `fresh` word. Every concept in this file defaults to `kind: "processed"`
(nothing here declares `kind` explicitly, so `deriveKind` always falls through to it), which means ANY
bulk-bin snack silently loses its concept: `קשיו טבעי במשקל`, `שקד טבעי במשקל`, `אגוז מלך במשקל`,
`פיסטוק במשקל`, `לקריץ במשקל`, `סוכריות במשקל` all matched no concept at all before this was noticed
(verified directly, not guessed - `grep -c "במשקל" catalogs` = 534 raw occurrences catalogue-wide, so
this is not a rare shape). It is not a `none` problem - none of these names carry an exclusion word,
they simply never survive the guard.

Fixed here for every concept this round touched (`cashews`, `hazelnuts`, `pecans`, `chestnuts`,
`nut-butter`, `snack-sticks-savory`, `candy-stick`, `biscuit-stick`, `fruit-strip-snack`,
`chocolate-gift-box`, plus the pre-existing `walnuts`, `pistachios`, `almonds-snack` since they sit right
next to the new nut concepts and share the identical failure) by adding `"kind": "any"` - a packaged/bulk
snack is the same product to the shopper either way, which is exactly what `kind: "any"` is for.

**Not fixed for the rest of the file or for any other file.** `popcorn`, `bamba`, `bissli`,
`peanuts-roasted`, `seeds-sunflower`, `seeds-pumpkin`, `granola`, `candy-hard` and almost certainly dozens
of concepts across every other `config/concepts/*.json` file have the identical latent gap (bulk bins are
common for candy, nuts, seeds and dried fruit everywhere, not just here) - `null` result confirmed for
`בוטנים קלויים במשקל`, `גרעיני חמניה קלויים במשקל`, `פופקורן במשקל`, `במבה במשקל`, `סוכריות במשקל`,
`גרנולה במשקל` on the current tree. Widening this properly means walking every concept file and deciding
`kind` per concept (a `fresh`-appropriate one, e.g. an actual raw-produce concept misfiled in a snacks-like
category, should probably stay `processed`/guarded), which is a full round of its own, not a one-line
`type-words.json` fix (that file is shared and off-limits here anyway). Flagging it here because the size
of the miss (534 raw name hits) is bigger than anything else found this round.

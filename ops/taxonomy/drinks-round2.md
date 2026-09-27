# Department misroutes found while working `config/concepts/drinks.json` (round 2, 27.9)

Not mine to fix - `categorize.js` is shared. Filed for whoever picks up the department pass next.
Round 1's misroutes (`ops/taxonomy/drinks.md`) were already fixed per its status section; these are new,
found while measuring this round's coffee/tea/syrup/water/smoothie/rice-milk additions against the full
raw-name corpus.

## Canned fish "in juice" sitting in משקאות - 5+ products, → שימורים or מעדנייה

Same shape as round 1's canned-tomatoes-in-juice finding, just missed there because it's fish not
produce. "פילה סלמון (סיומגה) במיץ טבעי" (salmon fillet in natural juice/brine) and "פילה סלומון מיץ
טבעי" route into משקאות on the "מיץ" keyword the same way the tomato cans did.

| product name | current department | keyword I believe routed it |
|---|---|---|
| פילה סלמון (סיומגה) במיץ טבעי 170 גר | משקאות | מיץ |
| פילה סלמון במיץ טבעי | משקאות | מיץ |
| פילה סלמון במיץ טבעי 170 גרם | משקאות | מיץ |
| פילה סלומון מיץ טבעי 200 גר | משקאות | מיץ |
| סאיירה במיץ טבעי 425 | משקאות | מיץ |

Round 1's fix ("חריג ברול משקאות לשם שנפתח ב-עגבני/פרוסות/אננס/משמש/שזיפ ומכיל מיץ/סירופ") only opened
the exception for produce head-words - a name opening with `פילה`/a fish name needs the same exception.

## A coffee grinder, not covered by round 1's appliance fix

Round 1 fixed `מכונת קפה` / `מכונת אספרסו` / `מכונת קוביות קרח` (VESSEL_OPENER). This round's coffee
sweep over the full raw-name corpus found the same shape on a grinder, which the fix doesn't cover
because the name doesn't open with "מכונת":

| product name | current department |
|---|---|
| מטחנת קפה ותבלינים נירוסטה - זקש EF-530 | משקאות |

## A car air freshener caught by the beer/cider vessel word "פחית" cluster

Not a drinks keyword at all on the surface - found while expanding the `פחית` (can) cluster for the
coverage pass. Worth a direct look; I didn't trace which rule actually routes it.

| product name | current department |
|---|---|
| פחית ריח לרכב | משקאות |

## A foldable baby product named for its colour "קפה" (coffee-brown)

`לול מתקפל לתינוק צבע קפה` (a foldable playpen, colour "coffee") - the concept layer already excludes it
from `coffee-roasted-other` (`none: "מתקפל"`, `none: "לתינוק"`), but the department badge is presumably
still wrong underneath since the departments pass runs on keywords independent of the concept layer.

## Still unclaimed: coconut milk/water cluster (משקה קוקוס / מי קוקוס)

Round 1 already flagged this for dairy-eggs.json's owner (8 products then). Naor's 27.9 note settled
that plant-milk concepts can live in either drinks.json or dairy-eggs.json, so this round could have
picked it up but didn't - it's a real cluster (`משקה קוקוס אורגני 1 ליטר`, `משקה מי קוקוס 1 ליטר`,
`מי קוקוס אורגני גרין קוקו קרטונית`) sitting across the `קוקוס`/`מי`/`משקה` sub-clusters, unlike rice
and almond milk (both now covered - rice by this round's `rice-milk-drink` in drinks.json, almond
already existing in dairy-eggs.json). Left open for the next drinks or dairy-eggs round.

## Landmine found and abandoned: "גין" (gin) collides with "גינה"/"גינגר" at the Hebrew root

Attempted a `gin` concept for the ~35 real gin bottles in the משקאות cluster this round measured
(`ג'ין`/`גין`, meets the 3-product threshold easily). `all: ["(ג'ינ|גינ)"]` looked clean against a
narrow python pre-filter, but the real matching engine normalizes final letters first, and once that's
accounted for the same three letters open "גינה"/"גינת" (garden), "גינגר"/"ג'ינג'ר" (ginger, fresh AND
candied AND pickled-for-sushi AND typo'd "גיננגר"), "אפונת גינה" (garden peas - a very common frozen/
canned vegetable name), "גינקו" (Ginkgo), "גינסנג"/"גינסינג" (ginseng, two spellings), "מגיני"/"מגן"
(protectors - sanitary panty liners, pillow protectors, finger guards), "לגיניה" (leggings), "ג'ינס"
(jeans/Levi's), and "גינוסר" (a winery's own name). Each guard added revealed a new, unrelated
collision category on the next full-corpus pass rather than converging - the exact "widened `all` is
the most dangerous change" shape TRAPS.md warns about, just not caught by the narrower pre-filter I
started with. Reverted rather than ship a rule likely to have more undiscovered false positives than
the ~35 real bottles are worth. If someone picks this up: the only way it likely holds is anchoring on
"ג'ין" (with the geresh) alone plus an explicit brand list (בומביי/גורדון/הנדריקס/ביפאיטר/טנקרי/...),
accepting that non-geresh spellings of real gin ("גין גורדון") are then missed too.

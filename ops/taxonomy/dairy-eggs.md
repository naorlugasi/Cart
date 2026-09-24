# חלב וביצים - department misroutes found during the concept round (24.9)

Found while writing `config/concepts/dairy-eggs.json` (גבינת/גבינה, מעדן, משקה, יוגורט, חלב families).
`categorize.js` is untouched - this is a list for whoever owns that file next. Column 4 is my best
guess at the routing keyword, not a claim about the code.

## Trap 1 & 2 (the department itself): non-dairy "milk" cosmetics sitting in חלב וביצים

| Product | Current department | Correct department | Likely keyword |
|---|---|---|---|
| חלב גוף משזף 240 מ"ל | חלב וביצים | טיפוח ויופי | "חלב" (self-tanning **body milk**, not dairy) |
| חלב ומי פנים בתכשיר 200מ | חלב וביצים | טיפוח ויופי | "חלב" (facial "milk" cleanser) |

These are the exact "חלב גוף משזף" case flagged in the brief: a name that starts with the same word
as the department's core product but is cosmetics. Refused in every new milk rule via the existing
`(^| )חלב( |$)` word-boundary anchor plus each rule's own `none` list - neither of these two matches any
concept in this round.

## Non-dairy products sitting in חלב וביצים (name says otherwise)

| Product | Current department | Correct department | Likely keyword |
|---|---|---|---|
| מונג נתחי ברווז 100 גרם | חלב וביצים | בשר ועוף | brand "מונג" (duck cut) |
| מונג נתחי הודו 100 גרם | חלב וביצים | בשר ועוף | brand "מונג" (turkey cut) |
| מונג נתחי כבש 100 גרם | חלב וביצים | בשר ועוף | brand "מונג" (lamb cut) |
| מונג נתחי סלמון 100 גרם | חלב וביצים | בשר ועוף / דגים | brand "מונג" (salmon cut) |
| מונג נתחי עוף 100 גרם | חלב וביצים | בשר ועוף | brand "מונג" (chicken cut) |
| שוק דובאי חלב במילוי בואינו כנאפה 190 ג | חלב וביצים | חטיפים וממתקים | "חלב" (Dubai **milk** chocolate bar) |
| שוק דובאי חלב במילוי ספיקולוס כנאפה 190 | חלב וביצים | חטיפים וממתקים | "חלב" (same brand line) |
| שוק דובאי חלב במילוי פיסטוק כנאפה 190 ג | חלב וביצים | חטיפים וממתקים | "חלב" (same brand line) |
| מעדן מטיאס הולנדי במשקל | חלב וביצים | מעדנייה / דגים | "מעדן" read as dairy dessert - Matjes is pickled herring |

## Dairy products sitting outside חלב וביצים (name says cheese/tvorog, department disagrees)

| Product | Current department | Correct department | Likely keyword |
|---|---|---|---|
| גבינת קממבר בקר בטעם טבעי | בשר ועוף | חלב וביצים | "בקר" read as a beef cut - here it names the cow-milk cheese, not cattle |
| גבינת קממברט בקר בייבי | בשר ועוף | חלב וביצים | same "בקר" collision |
| משולש קממבר צאן בקר 25% מחלבות גד | בשר ועוף | חלב וביצים | same "בקר"/"צאן" collision |
| קממבר בקר בייבי פחם 125 גר | בשר ועוף | חלב וביצים | same "בקר" collision |
| קממבר בקר גלגל גד מעדנייה | בשר ועוף | חלב וביצים | same "בקר" collision |
| גבינת פילדלפיה 27% 175 גרם עם סלמון | בשר ועוף | חלב וביצים | "סלמון" (cream cheese with a salmon mix-in, not a fish cut) |
| קשקבל כבשים | בשר ועוף | חלב וביצים | "כבשים" read as a lamb cut, not sheep-milk cheese |
| מנצגו כבשים | בשר ועוף | חלב וביצים | same "כבשים" collision |
| גבינת בורסאן פלפל שחור 150 גרם | שימורים | חלב וביצים | "פלפל שחור" (black pepper) read as a spice-jar product |
| גבינת סנט מור פחם במשקל | ניקיון וטואלטיקה | חלב וביצים | "פחם" (charcoal-ash rind cheese, not a charcoal cleaning product) |
| פחית גרנה פדנו מגורר | משקאות | חלב וביצים | "פחית" (can) read as a beverage can |
| טבורוג טעמים שונים 5% א.חלב נוכרי | חטיפים וממתקים | חלב וביצים | "טעמים שונים" (assorted flavours) read as a snack-variety-pack marker |
| טבורוג צימוקים 5% 500 גר | חטיפים וממתקים | חלב וביצים | same טבורוג/צימוקים line |
| טבורוג צימוקים 9% | חטיפים וממתקים | חלב וביצים | same טבורוג/צימוקים line |

## Cross-file concept conflicts this round exposed (not mine to fix - I own dairy-eggs.json only)

Writing this round's rules made these products match **two** concepts at once, so the build correctly
drops the assignment for both rather than guessing - but the root cause sits in another department's
file, so it needs that file's owner:

- **`beef-cuts`** (`config/concepts/meat-fish.json`) matches on a bare `(^| )בקר( |$)` and already
  excludes `גבינ`, `בולגרי`, `חלומי`, `גאוד` etc. - but not `קממבר`. The 5 rows above (and any future
  camembert-בקר listing) will keep conflicting with `camembert-cheese` until it does.
- **`salmon`** (meat-fish.json, presumably) has no exclusion for a cream-cheese product that lists
  salmon as a flavour mix-in ("...עם סלמון"). Conflicts with `philadelphia-cheese`.
- **`soy-milk-drink`** (`config/concepts/drinks.json`, `all: ["סויה"], any: ["משקה", "אלפרו"]`) treats
  the brand word "אלפרו" alone as enough evidence of a drink. It wrongly claims Alpro's dessert line
  ("אלפרו מעדן בטעם וניל על בסיס סויה", "אלפרו מעדן סויה שוק.", 9 products) - these say `מעדן`
  (dessert), never `משקה` (drink). Needs a `none: ["מעדנ"]` the same way this round's own
  `pudding-soy` already excludes protein/soy overlap.
- **`chocolate-filled-snack`** (`config/concepts/snacks.json`, exact rule not confirmed) claims
  "טבורוג טעמים שונים 5% א.חלב נוכרי" - a plain Tvorog cheese product, not a snack. Also listed above
  as a department misroute; the concept rule likely needs a `none` for `טבורוג` or a marker that keeps
  it from reading "טעמים שונים" as a candy-variety-pack signal.

One further note: `data/products.json` occasionally publishes the SAME barcode under two different
chain-supplied names, one full ("ג'ונסונס ADULT תרחיץ גוף המכיל יוגורט, דבש ושיבולת שועל") and one
truncated by a different chain's feed ("גונסון ADULT יוגורט דבש ושיבולת שועל."). The truncated form is
missing the "תרחיץ גוף" (body wash) marker that `yogurt-plain`'s own `none` relies on, so which name the
build happens to pick determines whether that single product shows a conflict or not - it is a name-
selection artifact, not a rule bug (config/concepts/dairy-eggs.json's `yogurt-plain`/`honey` both agree
once the full name is used). Flagging in case the same instability affects another department's round.

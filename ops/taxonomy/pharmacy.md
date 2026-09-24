# פארם ותוספים - department findings (concept round, 25.9)

Filed instead of edited into `src/catalog/categorize.js` - another agent owns that file right now,
and concept-file placement already fixed everything a concept's own `category` field could fix
(see `config/concepts/pharmacy.json`). These are the misroutings a concept can't reach because the
product's real identity is a *different* department (cosmetics), not this one.

## Already sitting inside פארם ותוספים but not actually supplements

`config/concepts/pharmacy.json`'s vitamin-c/d/e concepts deliberately exclude these (`none: קרמ/תרחיצ/שמנ`)
so the round does not make the problem worse, but the products themselves are already miscategorized
into this department by the keyword rules and should probably move to טיפוח ויופי:

- `ויטמין Cתרחיץ פנים משאבה` (facial wash pump)
- `קרם בסיס ויטמין סי50מל`, `קרם ויטמין Cאינביזיבל50מ` (vitamin-C face creams)
- `קרם ויטמין E להחייאת העור גייסון 113 מ"ל` (topical vitamin-E cream, Jason brand)
- `שמן ויטמין E גייסון 30 מ"ל`, `LOVLIS שמן ויטמין טהור 30 מ"ל E`, `שמן צמחי E+Dויטמין 1ל` - topical
  oils, same "vitamin name in a cosmetic product" pattern; lower confidence these are wrong (a topical
  vitamin-E oil is plausibly still a pharmacy-aisle item), flagging for a human call either way.

## Pre-existing conflict inside this department (not from this round)

`concepts-report.mjs --category "פארם ותוספים"` shows 2 conflicts, both unchanged by this round
(verdict conflict delta is +0 against the pre-round baseline):

- `פלסטר אלוורה 25יח` and `פלסטר בתוספת אלוורה 20יח` match both `band-aids` (general.json) and
  `aloe-drink` (drinks.json) - a plaster/band-aid brand called "Aloe" reads as an aloe drink to the
  aloe-drink rule. Neither file is pharmacy.json; whoever owns general.json/drinks.json should give
  aloe-drink a `none` for `פלסטר`.

## sanitary-pads (household.json) over-matches into bandage territory

`bandage-elastic` in pharmacy.json only matches the word `אגד`, on purpose: the same elastic/compression
bandage is also sold under the name `תחבושת אלסטית` (8 products, currently sitting in ניקיון וטואלטיקה),
but the existing `sanitary-pads` concept matches bare `תחבושת` with no exclusion for `אלסטית`, so it
already claims those 8 products as feminine hygiene pads. Adding `תחבושת אלסטית` to bandage-elastic's
`any` list produces a same-name conflict with sanitary-pads and drops all 8 products from the concept
layer entirely (worse than the status quo), so it was left out here.

**Ask**: whoever owns household.json should add `none: ["אלסטית", "אלסטי"]` to `sanitary-pads`. Once
that lands, pharmacy.json's bandage-elastic can be widened back to `(אגד|תחבושת אלסטית)` (already
written and tested once during this round, see git history / ask if useful) to also pull those 8
products out of ניקיון וטואלטיקה and into פארם ותוספים.

## Left open (singleton clusters, below the 3-product/2-chain threshold)

Real supplement families with only 1-2 products currently in the catalog - not worth a concept yet
per the round threshold, but worth knowing about for the next pass:

- Calcium: every סידן/calcium-named product found is itself a calcium+D or calcium+magnesium combo
  (`סידן ציטראט +ויטמין D`, `סידן ציטראט בתוספת ויטמין D3`, `סידן ומגנזיום ט.תות 473מ`) - no product
  is calcium alone, so a bare `calcium` concept would either conflict with vitamin-d/magnesium on every
  member or match nothing. Left unwritten; revisit if a plain calcium product shows up.
- Vitamin water / flavoured vitamin drinks: `אקווה ויטמין לימון 400 מ"ל`, `אקווה ויטמין פירות אדומים
  400 מ"ל` - 2 products, no named vitamin in the text, so none of the C/D/E/B12 concepts reach them.
- Iron (ברזל): `ברזל 9 חודשים סופהרב 60 כמוסות`, `ברזל COMFORT אלטמן30יחי` - 2 products, 1 chain each.
- Collagen (קולגן): `קולגן אלטמן 60 כמוסות`, `קולגן סרמידים 60 כמוסות` - 2 products.
- Turmeric/curcumin (כורכום), lycopene (ליקופן), spirulina (ספירולינה), valerian (ולריאן),
  vitamin B1/B2/B6 alone - each a single product.
- Garlic-oil capsules (`שמן שום כמוסות 90 יח`) - a real supplement, but the only member of its cluster.

## What this round pulled in from other departments

Documented in the commit message and the agent report, repeated here for anyone grepping this file:
protein powder (28 products, mostly שימורים + 1 משקאות), sweeteners (98 products across שימורים,
ניקיון וטואלטיקה and כללי), creatine (10 products, all from כללי/שימורים), and the 2-product sports
energy gel (`גל אנרגיה`) that was sitting in ניקיון וטואלטיקה behind a bare `ג'ל`.

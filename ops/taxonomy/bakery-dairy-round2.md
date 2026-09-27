# Department misroutes found while working round 2 of מאפים ולחם / חלב וביצים (27.9)

Found via `node scripts/concept-clusters.mjs --department "<dept>" --expand <head>` while mapping
families for the synonym + coverage round on `config/concepts/bakery.json` and
`config/concepts/dairy-eggs.json`. Per the taxonomy skill's DEPARTMENTS rule, `src/catalog/categorize.js`
was not touched (shared file, other agents run in parallel) - logging here for whoever applies
department fixes serially. The bakery round's own `ops/taxonomy/bakery.md` and the dairy round's own
`ops/taxonomy/dairy-eggs.md` (both 24.9/25.9) already cover the toaster-oven and play-dough misroutes
found in round 1 - not repeated here.

## Milk frothers routed into חלב וביצים by "חלב" (6 products, cluster מקציפ)

"מקציף חלב" is a milk-frother kitchen appliance, not a dairy product - the word "חלב" here is what the
frother is *for*, not what it *is*. Every new milk/cream rule this round used the `(^| )חלב( |$)`
word-boundary anchor plus its own `none` list, so none of them accidentally caught these; they simply
have no concept, which is correct - an appliance has nothing among milk/cream/cheese to compare it to.

| product | current dept | correct dept |
|---|---|---|
| מקציף חלב | חלב וביצים | מוצרי חשמל קטנים |
| מקציף חלב 9791 BH | חלב וביצים | מוצרי חשמל קטנים |
| מקציף חלב מהודר Alessandro לבן | חלב וביצים | מוצרי חשמל קטנים |
| מקציף חלב מהודר Alessandro שחור | חלב וביצים | מוצרי חשמל קטנים |
| מקציף חלב נירוסטה 300/150ml 500W - ENSO אנסו | חלב וביצים | מוצרי חשמל קטנים |
| מקציף אלפרו | חלב וביצים | מוצרי חשמל קטנים |

## A television routed into חלב וביצים by the "מולר" brand (1 product)

"מולר טלוויזיה QLED" - "מולר" (Müller) is a yogurt brand this file's own yogurt rules key off
(`(יוגורט|דנונה|מולר|גמד)`), but this specific listing is a TV, not a dairy product carrying that
brand name. No concept was written or widened for it; it is called out only so the department fix is
not lost.

| product | current dept | correct dept |
|---|---|---|
| מולר טלוויזיה QLED | חלב וביצים | מוצרי חשמל / אלקטרוניקה |

## Note: a genuine bakery/dairy item sitting in the wrong department did not need this file

As in round 1, several real bakery items this round found sitting outside "מאפים ולחם" (e.g. a
"חלה ארוזה" batch that a stale `products.json` category field showed under "כללי", jachnun and
malawach batches showing under "חלב וביצים"/"כללי" in the same stale field) were left alone here: they
already carry `"category": "מאפים ולחם"` on their own concept, which is what fixes the department on
the next build. Checked with `categorize(name, conceptId)` live rather than trusting the field
(docs/CONCEPTS.md - the field is from the previous build).

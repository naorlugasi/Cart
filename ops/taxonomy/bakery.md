# Department misroutes found while working "מאפים ולחם" (25.9, bakery concept round)

Found via `node scripts/concept-clusters.mjs --department "מאפים ולחם" --expand <head>`: these are
products that currently sit in "מאפים ולחם" because their name contains a bakery-shaped word (a
head word the department's keyword rules key off), but they are not food at all. Per the taxonomy
skill's DEPARTMENTS rule, I did not touch `src/catalog/categorize.js` (shared file, other agents run
in parallel) - logging here for whoever applies department fixes serially.

## Toaster ovens / sandwich presses routed here by "טוסטר" (20 products, cluster טוסטר)

"טוסטר" names the appliance in Hebrew, not a slice of toast - these are electric toaster ovens and
panini/sandwich presses, sold in the same catalog. They do not belong in a food department at all
(small appliances / electronics).

| product | current dept | correct dept |
|---|---|---|
| טוסטר אובן 18ליטר | מאפים ולחם | מוצרי חשמל קטנים |
| טוסטר אובן 25 ליטר SL25L | מאפים ולחם | מוצרי חשמל קטנים |
| טוסטר אובן 30 ליטר Benaton 1500W שחור | מאפים ולחם | מוצרי חשמל קטנים |
| טוסטר אובן 45 ליטר SL-45 | מאפים ולחם | מוצרי חשמל קטנים |
| טוסטר אובן 48 ליטר (x2 listings) | מאפים ולחם | מוצרי חשמל קטנים |
| טוסטר אובן ענק 40 ליטר שחור ATL-6640 | מאפים ולחם | מוצרי חשמל קטנים |
| טוסטר גריל נירוסטה ענק מהודר | מאפים ולחם | מוצרי חשמל קטנים |
| טוסטר לחיצה (+ 10 more "טוסטר לחיצה ..." listings, sizes/colours) | מאפים ולחם | מוצרי חשמל קטנים |
| טוסטר גריל זוגי מהדרין גולד ליין | משקאות (also wrong) | מוצרי חשמל קטנים |

No concept was written for this cluster - an appliance has nothing to compare it to among bread
products, and giving it a food concept would just be the mushroom bug in a new department.

## Children's play-dough routed here by "בצק" (3 products, cluster בצק / משחק)

"בצק משחק" is Play-Doh, not a food dough - these are toy play-dough tubs shaped like animals, sold
in the same catalog as real cooking dough (בצק פריך, בצק שמרים, etc., which did get concepts this
round).

| product | current dept | correct dept |
|---|---|---|
| בצק משחק -ארנב | מאפים ולחם | צעצועים |
| בצק משחק -ביצה | מאפים ולחם | צעצועים |
| בצק משחק כלב | מאפים ולחם | צעצועים |

## Note: a real bakery item sitting in the wrong department usually did not need this file

Several genuine bakery products this round found (a baguette in מעדנייה, a whipped-cream cake in
חלב וביצים, yeast cakes and cheesecakes in שימורים, rusks scattered across seven departments) were
left alone here on purpose: giving them the right concept in `config/concepts/bakery.json` carries
its own `"category": "מאפים ולחם"`, which corrects the department on the next build without touching
`categorize.js` at all. This file is only for products that are not food/bakery items to begin with,
where a concept is the wrong tool.

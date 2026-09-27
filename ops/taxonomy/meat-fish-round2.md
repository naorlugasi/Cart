# Department misroutes found while working "בשר ועוף" (27.9, meat-fish round 2 - salmon/synonyms/coverage)

New findings on top of `ops/taxonomy/meat-fish.md` (24.9 round). Found via
`node scripts/concept-clusters.mjs --department "בשר ועוף" --expand <head>`. Per the taxonomy
skill's DEPARTMENTS rule, I did not touch `src/catalog/categorize.js` (shared file, other agents
run in parallel) - logging here for whoever applies department fixes serially.

## Liver-pate spreads routed here by "כבד <bird>" (9 products, cluster ממרח)

Cold spreads (foie-gras-style pâté in a tub, brands GURMANOFF/PASHTETOF), not a raw cut. Contain
"כבד עוף/הודו/אווז/ברווז" the same way the real livers do, and are correctly left without a meat
concept (they are already guarded off `chicken-liver`/`turkey-liver` by those concepts' own
`ממרח`/`בטעמ` none entries), but they still sit in "בשר ועוף" instead of a deli/pâté department.

| product | current dept | correct dept | keyword |
|---|---|---|---|
| ממרח בטעם כבד עוף עדין 130 גר GURMANOFF | בשר ועוף | מעדנייה | "ממרח" + "כבד" |
| ממרח בטעם כבד אווז 130 גר GURMANOFF | בשר ועוף | מעדנייה | "ממרח" + "כבד אווז" |
| ממרח בטעם כבד ברווז "צרפתי" 300 גרם PASH | בשר ועוף | מעדנייה | "ממרח" + "כבד ברווז" |
| ממרח פטה עם כבד עוף | בשר ועוף | מעדנייה | "ממרח פטה" |
| ממרח פטה עם כבד הודו | בשר ועוף | מעדנייה | "ממרח פטה" |
| (+4 more, same "ממרח (בטעם/פטה) כבד ..." pattern) | | | |

## Filled dough / pastry with a meat filling (22 products, clusters כיסונימ/סיגרימ/בלינצס/קובה)

Frozen or fresh prepared dough goods whose filling is meat - the filling word pulls them into this
department the same way blintzes did in the 24.9 round (`meat-fish.md`, mushroom-round precedent:
a prepared dish that *contains* the raw material is not the raw material). None of these should get
a meat concept (they are dumplings/pastries, not cuts), and none currently do - this is a department
placement issue only.

| product | current dept | correct dept | keyword |
|---|---|---|---|
| כיסונים במילוי בשר בקר 1.5 ק"ג | בשר ועוף | קפואים / מאפייה | "כיסונים במילוי" |
| כיסונים עוף 800 גרם | בשר ועוף | קפואים / מאפייה | "כיסונים" |
| סיגרים במילוי בשר | בשר ועוף | קפואים / מאפייה | "סיגרים במילוי" |
| בלינצ'ס במילוי בשר | בשר ועוף | קפואים / מאפייה | "בלינצס במילוי" |
| בלינצס בשר 600 גר | בשר ועוף | קפואים / מאפייה | "בלינצס" |
| קובה ביתי במילוי בשר | בשר ועוף | קפואים / מאפייה | "קובה במילוי" |
| קובה בורגול במילוי בשר | בשר ועוף | קפואים / מאפייה | "קובה" |
| (+15 more, same "<dough shape> במילוי/עם בשר/עוף" pattern) | | | |

## Vegetarian meat-substitute pieces routed here by flavour name (3 products, cluster נתחונימ)

Soy-protein "chunks" flavoured to taste like beef/chicken/shawarma, already correctly kept out of
every meat concept (`chicken-*`/`beef-*` none entries already reject "סויה"/"חלבונ"/"צמחונ"/"צמחי"
where present), but they are not meat and do not belong in this department.

| product | current dept | correct dept | keyword |
|---|---|---|---|
| נתחונים צמחוניים על בסיס חלבון סויה בטעם בקר | בשר ועוף | מזון צמחוני/טבעוני | "צמחוניים" + "חלבון סויה" |
| נתחונים צמחוניים על בסיס חלבון סויה בטעם עוף | בשר ועוף | מזון צמחוני/טבעוני | same |
| נתחונים צמחוניים על בסיס חלבון סויה בטעם שווארמה | בשר ועוף | מזון צמחוני/טבעוני | same |

## Stir-fry vegetable+meat mixes routed here by "לקט ל<meat>" (3 products, cluster לקט)

A frozen vegetable medley with a small amount of meat/chicken added for stir-fry, not a cut of
meat. Already correctly uncaptured by every meat concept.

| product | current dept | correct dept | keyword |
|---|---|---|---|
| לקט לעוף 800 גרם סנפרוסט | בשר ועוף | קפואים (ירקות) | "לקט ל" |
| לקט עוף וירקות אסייא | בשר ועוף | קפואים (ירקות) | "לקט...וירקות" |
| לקט עוף וירקות ירוק גלילי להקפצה 550 גרם | בשר ועוף | קפואים (ירקות) | "לקט...וירקות...להקפצה" |

## Not fixed this round (left for manual judgment / next round)

- **`fish-dried-salted` is a new concept, not a department fix** - the 15 dried/salted small-fish
  snacks (species צנינון/ברקודה/מינטאי/עפיפנית/ליבקית/שפמנון) it now covers were already correctly
  in "בשר ועוף"; only their concept was missing. No department action needed there.
- Cluster **עופ** (5 products, e.g. "עוף סיני בלימון חמוץ", "עוף קרוש") looks like ready-to-eat
  meal items (frozen Chinese-style chicken, aspic) rather than raw cuts - plausibly a
  prepared-food/frozen-meals misroute, but I could not tell from the name alone whether "עוף קרוש"
  (jellied chicken) is sold as a deli item or a raw joint, so left unlogged pending a name check
  against the chain's own catalogue page.
- Cluster **מיני** (3 products: mini burger, merguez, fish balls) is a size qualifier, not a
  species - not a department problem, just too small/mixed to cluster into one concept.

# Department misroutes found while working "בשר ועוף" (24.9, meat-fish concept round)

Found via `node scripts/concept-clusters.mjs --department "בשר ועוף" --expand <head>`: these are
products that currently sit in "בשר ועוף" because their name contains a meat/fish word, but they
are not meat or fish themselves. Per the taxonomy skill's DEPARTMENTS rule, I did not touch
`src/catalog/categorize.js` (shared file, other agents run in parallel) - logging here for whoever
applies department fixes serially.

## Spice / seasoning mixes routed here by "ל<meat-word>" (24 products, cluster תבלינ)

Small jars/sachets of dry seasoning, not the meat itself. Should live in a spices/pantry
department, not בשר ועוף.

| product | current dept | correct dept | keyword |
|---|---|---|---|
| תבלין לבשר 30 גר | בשר ועוף | תבלינים / מזווה | "לבשר" |
| תבלין לבשר טחון 30 ג | בשר ועוף | תבלינים / מזווה | "לבשר" |
| תבלין לסטייק 30 גר | בשר ועוף | תבלינים / מזווה | "לסטייק" |
| תבלין לעוף 100 גר | בשר ועוף | תבלינים / מזווה | "לעוף" |
| תבלין לגריל עוף | בשר ועוף | תבלינים / מזווה | "לעוף" |
| תבלין להודו 30 גר | בשר ועוף | תבלינים / מזווה | "להודו" |
| תבלין להמלחת סלמון 3 | בשר ועוף | תבלינים / מזווה | "סלמון" |
| תבלין לכרעיים 30 גר | בשר ועוף | תבלינים / מזווה | "לכרעיים" |
| תבלין לשווארמה טורקית מימון 100 גרם | בשר ועוף | תבלינים / מזווה | "לשווארמה" |
| תבלין לדג 100 גר | בשר ועוף | תבלינים / מזווה | "לדג" |
| תבלין לדגים | בשר ועוף | תבלינים / מזווה | "לדגים" |
| (+13 more products, same "תבלין ל..." pattern) | | | |

Small "spice jar" products under other heads with the same problem (cluster גריל, 6 products):

| product | current dept | correct dept | keyword |
|---|---|---|---|
| גריל בשר 80 גרם צנצנת | בשר ועוף | תבלינים / מזווה | "בשר" + "צנצנת" (80g jar) |
| גריל עוף | בשר ועוף | תבלינים / מזווה (needs manual check - name too short to be certain) | "עוף" |
| גריל עוף צנצנת מיה 8 | בשר ועוף | תבלינים / מזווה | "עוף" + "צנצנת" |

## Pet food routed here by species-flavour words (20 products, clusters פיינ/פרמיו/גורמה)

Dog/cat food and treats (Pfine/Purina, Premio, Gourmet Gold) whose flavour line names the meat
("עוף", "בקר", "סלמון") the same way the real cuts do.

| product | current dept | correct dept | keyword |
|---|---|---|---|
| פיין קט טעם עוף 1 קג | בשר ועוף | מזון לחיות מחמד | "עוף" (cat food) |
| פיין דוג פאוץ עוף גור | בשר ועוף | מזון לחיות מחמד | "עוף" (dog food) |
| פרמיו דלי-קט עם סלמון בג'לי לחתול בוגר | בשר ועוף | מזון לחיות מחמד | "סלמון" (cat food) |
| פרמיו מקלות סלמון לכלב 100ג | בשר ועוף | מזון לחיות מחמד | "סלמון" (dog food) |
| פרמיו בקר וכבד 100 ג | בשר ועוף | מזון לחיות מחמד | "בקר" |
| גורמה פאוצ נתחי עוף | בשר ועוף | מזון לחיות מחמד | "עוף" (cat food pouch) |
| גורמה גולד Savoury Cake עוף | בשר ועוף | מזון לחיות מחמד | "עוף" |
| דוגלי בוגר בקר 3 ק"ג | בשר ועוף | מזון לחיות מחמד | "בקר" (dog food) |

These already carry `לכלב`/`לחתול`/brand words the meat-fish concepts exclude, so they no longer
get a false meat concept - they are just homeless in the wrong department.

## Instant noodles / ramen routed here by flavour name (12 products, clusters ראמנ/אטריות)

| product | current dept | correct dept | keyword |
|---|---|---|---|
| ראמן עוף 700 גרם | בשר ועוף | פסטה ואורז / מזווה | "עוף" (instant ramen) |
| ראמן גלדס בטעם בקר 105 גר | בשר ועוף | פסטה ואורז / מזווה | "בקר" |
| אטריות בטעם עוף חריף | בשר ועוף | פסטה ואורז / מזווה | "עוף" |
| אטריות בטעם בשר בקר 60גר KAZAN | בשר ועוף | פסטה ואורז / מזווה | "בשר בקר" |
| אטריות ראמן בטעם עוף | בשר ועוף | פסטה ואורז / מזווה | "עוף" |

## Breading/coating mix routed here via "לשניצל" (5 products, cluster ציפוי)

| product | current dept | correct dept | keyword |
|---|---|---|---|
| ציפוי לשניצל בטעם פיקנטי | בשר ועוף | תבלינים / מזווה | "לשניצל" |
| ציפוי לשניצל עם שום זיפר מיה 400 גרם | בשר ועוף | תבלינים / מזווה | "לשניצל" |
| ציפוי לשניצל שום מיה | בשר ועוף | תבלינים / מזווה | "לשניצל" |

## Not logged (mixed / ambiguous, left for manual judgment)

- Cluster **ציפס** (5 products): mixes real flavoured potato chips ("ציפס תפ"א בטעם סטייק/סלמון
  בגריל") with what may be actual frozen chicken strips ("ציפס גלאט עוף 1.5 ק") - the word ציפס is
  ambiguous between "chips" and "strips" in this dataset and I could not tell them apart from the
  name alone.

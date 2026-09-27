# produce-deli-frozen round 2 (27.9.2026) - the "טבעות" (rings) investigation

`backlog.md` listed the head word טבעות: 46 products, "frozen onion and chicken rings". Mapped every
raw name carrying the word (via `matchingConcepts` against `data/products.json` name+aliases, so this
is the actual no-concept gap, not a raw grep) before writing anything, per the round-4 instruction.
Result: "onion and chicken" undersold it - it is at least eight different product families sharing one
head word. Wrote the one that is mine (frozen onion rings). Everything else below belongs to another
agent's file; logging here rather than touching meat-fish.json/pantry.json/snacks.json/pets.md directly
in a shared working tree.

## Written this round (mine): frozen onion rings

`onion-rings-frozen` (config/concepts/produce-deli-frozen.json), category חטיפים וממתקים (same shelf
logic as nachos-frozen: a frozen snack/appetizer, not a fresh vegetable). `all: ["(^| )טבעות"]`,
`any: ["בצל"]`, `none: ["עלית", "אפרופו", "טיובס"]` - the none list keeps out a *different* product
also named "טבעות בצל": a small (45-50g) corn/wheat puff snack merely flavoured "onion" (Apropo Tubs,
Elite), not real onion. Confirmed onion-yellow/onion-red already exclude "טבעות" in their own none
list, so no overlap with fresh onion. 7 raw names, e.g. "טבעות בצל 600 גר", "טבעות בצל- טוגני טבעות
בצל מצופים" (tempura-battered). Left the two onion-flavoured snack chips unclaimed (see below).

## For the meat/fish agent (config/concepts/meat-fish.json)

Real (human, not pet) protein rings sitting in "בשר ועוף" / "כללי" with no concept:

| product | note |
|---|---|
| טבעות עוף טופ שף 700 | frozen chicken rings, category already בשר ועוף |
| טבעות עוף 700 שף העוף | same product, chain-specific name variant |
| טבעות עוף700 גר טופ שף קפואזן | same product, chain-specific name variant |
| טבעות עגל | veal rings, category כללי (misrouted, should be בשר ועוף) |
| טבעות עגל ארוז חלק ואקום | same product family |
| טבעות בקר קפוא ארוז | beef rings, category כללי (misrouted) |
| טבעות קלמרי 500 גר | calamari (squid) rings - seafood, category כללי (misrouted) |

All of these are below the round's own 3-distinct-products threshold by themselves (1-2 barcodes each,
name variants inflate the count) - your call whether they clear the bar once counted against the rest
of meat-fish.json's coverage.

## For whichever agent owns pet food (config/concepts/pets.json or similar + pets.md)

Not real chicken - dog treats, already sitting outside the food categories but worth a department fix:

| product | current category | note |
|---|---|---|
| חטיף בונזו טבעות עוף 80 גר | בעלי חיים | dog treat, category already correct |
| בונזו טבעות עוף לכלב80ג | בעלי חיים | same product, "לכלב" (for dogs) in the name |
| מארז תן צ'אפ טבעות בטעם טבעי 8*15 גרם | כללי | dog treat brand "תן צ'אפ" ("Ten Chap") - misrouted, should be בעלי חיים |
| תן צ'אפ טבעות בטעם טבעי 50 גרם | כללי | same brand/family |
| תן צ'אפ טבעות בטעם שמנת בצל 50 גרם | חלב וביצים | same brand/family, badly misrouted (dairy?!) |
| מארז תן צ'אפ טבעות בטעם שמנת בצל 15 גרם | חלב וביצים | same |

None of these should ever get a human-food concept - flagging only the department misroute.

## For the pantry/pasta agent (config/concepts/pantry.json)

"פתיתים" (ptitim/pearl couscous) sold in a ring shape, not a separate product from plain ptitim -
whoever owns the ptitim concept should check its `any`/synonyms cover this shape word:

| product | category |
|---|---|
| פתיתים אפויים טבעות | שימורים |
| פתיתים אפויים טבעות 500 גר אסם | שימורים |
| פתיתים אפויים טבעות אסם 500 גרם | שימורים |
| פתיתים אפויים טבעות סוגת 500 גרם | שימורים |
| קרפור קלאסיק - טבעות | שימורים (Carrefour house brand, same pasta shape, ambiguous alone but co-clusters with the above) |

Breakfast cereal, ring-shaped (Froot-Loops style, "טרולים" = Trolls-brand cereal) - also sitting in
שימורים with no concept:

| product |
|---|
| דגני בוקר - טבעות |
| דגני בוקר טבעות בטעם עוגיות סנדוויץ 320 |
| דגני בוקר טבעות בתוספת דבש 500 גר wb |
| דגני טבעות דבש לל"ג375ג |
| דגני טבעות תירס ואורז מלא 325 גר WHOLE |
| טבעות דגנים ואורז מלא אורגני לל"ג 284 ג |
| טבעות דגנים עם דבש ל |
| טבעות דגנים ש.שועל קרמל אורגני 375 גרם |
| טרולים דגני בוקר טבעות צבעוניות 375 גר |
| טבעונים חטיף טבעות דגנים מלאים | (vegan "whole grain rings" snack, ambiguous cereal/snack - your call) |

## For whichever agent owns dried fruit / candy (pantry.json or snacks.json)

| product | note |
|---|---|
| תפוח עץ מיובש | dried apple, no shape word - already may have a concept elsewhere, check before adding |
| תפוח עץ מיובש 160/200 גרם | same product, size variants |
| תפוח עץ מיובש זארובי | same product, brand variant |
| תפוח עץ טבעות | dried apple **rings** specifically |
| טבעות תפו"ע טבעי 88 גרם | same, different chain's spelling of תפו"ע (=תפוח עץ) |
| טבעות תפו"ע קינמון88ג | same, cinnamon flavour |
| טבעות תפוחים קראנצי אורגני השדה 20 גרם | same family, "crunchy" organic apple crisps |
| ג'לי טבעות בציפוי סוכר 350 גר | sugar-coated jelly candy rings (gummy candy, not fruit) |
| טבעות מצופות-בט.שוקולד | chocolate-coated candy rings |
| טבעות דבש 375ג MONRO | "honey rings" - size (375g) matches the cereal cluster above, not candy; check before filing |
| אננס טבעות מסוכר / טבעות אננס מסוכר | candied pineapple rings - 1 barcode only, below the concept threshold alone |
| גזר חתונה טבעות פיקנטיות 250 גרם רמי לוי | branded pickled-carrot deli item ("wedding carrots"), 1 barcode, below threshold |

## For whichever agent owns protein/health snacks

| product |
|---|
| טבעות חלבון בטעם דבש 250 גרם |
| טבעות חלבון בטעם חמאת בוטנים 250 גרם |
| טבעות חלבון בטעם קלאסי 250 גרם |
| טבעות חלבון בטעם קרם עוגיות 250 גרם |
| טבעות חלבון בטעם שוקולד 250 גרם |
| טבעות חלבון טעם שוקולד 250 גר |

Sitting split across חלב וביצים and חטיפים וממתקים depending on chain - a department fix is needed
regardless of who ends up owning the concept.

## Left unclaimed on purpose

The two onion-*flavoured* (not real onion) ring snacks excluded from `onion-rings-frozen` above:
"אפרופו טיובס טבעות בצל 50 גרם" and "טבעות בצל עלית 45 גר" (Apropo/Elite corn-puff snacks). Real
snack-food territory, not "frozen appetizers/veg/fruit" - not mine to claim, and I did not find an
existing snacks concept covering them. Also "פוף טבעות קלאסי 40 גרם" (Pof brand, plain/no flavour
named) - likely the same snack family as the two above but with no flavour word to anchor a match rule
on; left for whoever takes the onion-flavoured snack pair to look at together.

## For whoever owns config/concepts/general.json (storage-container)

One conflict I could not resolve without touching a file that is not mine: `storage-container`
(general.json) matches "עלי חסה בקופסא עם מכסה טעם הטבע" - real fresh lettuce sold in a box with a
lid, not tupperware - and my `lettuce` concept also matches it correctly. Both concepts are right about
what the words mean; `storage-container`'s own rule is the one that is too broad (it fires on any
product whose name happens to describe its own packaging as "a box with a lid"). I did not narrow
`lettuce` to dodge this, since that would drop a real lettuce product to avoid touching someone else's
file - narrowing `storage-container`'s own `none`/`any` there is the fix. Left as a measured conflict
(1 product, see the round's LOST list) rather than guessed at.

## Garlic sitting in the wrong department (not a concept problem)

`concept-health.mjs` flags 13/48 of `garlic`'s own matches as sitting outside ירקות ופירות - all
genuinely garlic ("דורות שום כתוש טרי" fresh crushed garlic, "שום כתוש בריאבוע" a crushed-garlic
cube, "שום תפזורת" bulk garlic) but categorized `מעדנייה`/`שימורים` instead. Per the DEPARTMENTS rule
I did not touch `categorize.js`; noting it here since it is real garlic, correctly conceptualized, just
in the wrong department.

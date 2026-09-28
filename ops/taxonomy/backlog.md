# Taxonomy backlog

**Status 27.9, end of the second wave.** Done today and no longer open: the synonyms round (every thin concept
carrying products has a second phrasing, and no phrase names two concepts - now a gate test); the salmon round
(kept as one product, premium and prepared lines pushed out); the shared pet vocabulary (one list in
type-words.json instead of 3,683 copies); the sold-by-weight kind-guard bug (only טרי is freshness evidence now);
pickled mushrooms (one concept, settled against the chains); plant milks (חלב וביצים, settled against the chains).
Concept coverage over the built catalog: 45.6% on 24.9, 57.4% on 25.9, **66.8% on 27.9**.

What remains is below. The two decisions that are Naor's and cannot be done from a session: **serving more chains**
(a Railway environment change, see "Adding chains") and **deploying cartBackend** (the concepts resolver and the
ranking fix are on main, undeployed).


What is known to be missing and has no round assigned. Written so the next session starts from a
measured list instead of from whatever somebody noticed, which is the failure the skill exists to stop.

## Product types with no concept anywhere

Found by the products session's head-word scan: every product name reduced to its first content token,
kept where at least 20 products carry it, a product of that type is sold by 6+ chains, no concept name or
synonym contains the word, and `categorize()` on the bare word returns כללי. That restriction is the
reusable part - a plain all-token scan returns 555 hits and is useless, because a modifier like בניחוח or
בתוספת appears everywhere while a head word names the thing.

| word | products | what it is |
|---|---|---|
| מברשות | 45 | toothbrushes |
| טבעות | 46 | frozen onion and chicken rings |
| תבשיל | 44 | instant cooked dishes |
| רצועות | 41 | strips, savoury and confectionery both |
| פקאן | 39 | a nut, no concept |
| מקלוני | 37 | sticks, savoury and candy both |
| לקקן | 31 | lollipop |
| מפה | 31 | tablecloth - department fixed 25.9, concept still missing |

Handed to rounds already running on 25.9 and not repeated here: גלידת (construct form, 61 products) to the
everyday-words round, צנימים (rusks, 40) to the bakery round.

## The brand tail

Head words that are manufacturers, not products: שיק, קולגייט, ניוואה, פלמוליב, גרנייה, קרליין, פאלטה,
אולטרסול, קמיל, אפקטיב in toiletries and cosmetics; אסם, האופה, פיטנס, יוגטה, צ'וקטה, כיף in food.

**Do not write concepts for these** - a brand concept cannot group the same product across chains, which
is the only reason concepts exist (TRAPS.md #2, #18). The payoff is department routing only: a brand as the
head word is a reliable department signal even when the type word is missing. Lower priority than the type
words above, and it belongs in `categorize.js`, not in a concept file.

## Inflection misses - assume systemic, not incidental

Three rounds independently found rules that knew only one form: רצפה/רצפות and יוגרט (department pass),
מפה/מפות, כפית/כפיות and כפית האכלה (25.9), גלידה versus the construct גלידת. `scripts/dead-keywords.mjs`
finds the dead half of a pair; the live-but-incomplete half needs the head-word scan. Every new rule should
be checked in singular, plural and construct form before it is written, not after.

## Named rounds, ready to run, waiting only on a file

**Synonyms across all 674 concepts.** Every concept has at least one synonym, but **225 of them carry a
list that adds nothing beyond the display name** - `mascara` is `[מסקרה]`, `skin-hand-cream` is
`[קרם ידיים]`, `bread-rye` is `[לחם שיפון]` - and a further 262 carry a single form in the singular with no
plural. That is the "מלפפון חמוץ" failure in miniature, one concept in three: the rule matched the product
perfectly and the phrase a person typed never reached it. It decides how well the shopping-list importer
works, because cartBackend's `GET /catalog/concepts` resolves a phrase against the name and every synonym
and has nothing else to go on. Different work from writing match rules - it needs someone thinking about
how people say things, not about what the chains print - so it is its own round, not a rider on others.
The number to drive to zero is the 225.

**salmon: a fillet pair and the premium leakage.** Measured by the weighed-prices session: 52 of its 60
weighed rows are fillet, so it is one product with many labels and not a family, which is the opposite of
what a raw name count suggested. But the fillet rows span 39.9 to 189 because prepared and premium items
leak in - sashimi 199, "סלמון הילטון" 225-240, רולדת סלמון 149, סלמון בייבי 196 - and only
cheapest-per-chain keeps the published card honest. Salmon already has smoked, frozen, portions and cuts;
the generic concept is the one left with `sizeUnit: null` and no `-fillet` pair, the shape the meat round
used for amnon, mullet, denis, lavrak and bass. Needs `meat-fish.json`, held on 25.9. Re-measure the
weighed band afterwards - that session asked to be told.

**A shared pet-guard vocabulary instead of 356 copies of it.** Every food concept carries the same
hand-copied list of pet words in its `none` - "לחתול", "לכלב", "פנסי", "פריסקיז", "בונזו", "ויסקס" and the
rest - because a tin of cat tuna must not read as human tuna. It is on 95 of 95 concepts in
produce-deli-frozen.json alone. On 25.9 the pets round found the list was missing the kitten forms, so a
kitten tuna pate was tagged as human tuna, and the fix was to append two patterns to 356 concepts. That
worked and is committed, but it is the accumulation pathology the guard audit exists to find: the next
missing pet word will cost another 356 edits, and every one of those lists gets longer and less readable.
The real fix is one vocabulary in `config/concepts/`, the way `type-words.json` already holds the
fresh/processed words, referenced rather than copied. Not urgent, and it changes matching semantics, so it
wants its own round with its own before/after rather than riding along with a taxonomy round.

## Adding chains to the site - measured 27.9, waiting on a human browser

Measured by barcode over the published catalogs (ops/research/chains-and-pickles-2709.md): new comparable
barcodes if added - tivtaam 1,651, mck 1,356, yochananof_b 1,034, keshet 729, quik 708, ybitan 309, shukcity
291. **osherad has no online store** (in-store self-checkout only, no adapter) - never add it. Serving a chain is
the `CHAIN_IDS` environment variable on Railway; no code changes.

End-to-end handoff, 27.9 (`scripts/e2e-handoff.mjs`, recon/e2e-<chain>.json):
- **tivtaam** - an automated run put a real item into a real cart on tivtaam.co.il (cart 86862510, visible in
  the site's cart panel). Two of the three test items came back "not available" at the default branch 924, which
  is the normal case the injector already reports to the shopper, not an adapter fault. By the standard victory
  was admitted on - a single-product live API check on 8.9, never a full run - tivtaam now has stronger evidence
  than a chain the site already serves.
- **mck, keshet, quik, shukcity** - automated Chromium stopped at a Cloudflare challenge on all four, though a
  manual visit the same day was not challenged, so the automation is being fingerprinted. Each needs one run of
  `node scripts/e2e-handoff.mjs <chain> --manual` in a person's own browser. Nobody should try to get the
  automated run past the challenge.
- **ybitan** - challenged even for a manual visit.

Tool gap, not fixed: `verifyChainCart()` has no branch for the Self Point chains (all eight candidates and
carrefour, victory, expressmehadrin share `src/handoff/adapters/selfPoint.js`). Carrefour's branch returns a UI
count and a cart id but no item ids, so the tool cannot print PASS for any Self Point chain and every one of them
has been judged by reading the network capture and the injector's own report. A real reader would GET
`/v2/retailers/<retailer>/branches/<branch>/carts/<id>?appId=4` in the page and match lines by the
`retailerProductId` the lookup returned - but the capture does not keep response bodies, so the cart line shape
has never been seen and writing the reader now would be a guess. Capture one first.

## The aisle is read from one chain's name, and two fixes were measured and rejected (28.9)

A product's department comes from `categorize()` over ONE name, so one chain's odd name decides the aisle for every
chain. The Yoplait 8-pack is the clean example: its display name is now right ("יופלה בד"צ 1.5% מעודן 8*150מל")
but it still sits in בית וכלים, because the aisle is read from "מאגדת 8*150גרם גביעי" and the glassware rule knows
"גביעי".

Measured and not shipped, both against every product in a full build:
- **reading the aisle from the family-voted display name** moves 57 products, about half the wrong way: a truncated
  old name sometimes carried the keyword the full one lacks ("פרוטי בר- חטיף פרי" said snack; "פרוטיבר בטעם תות"
  does not).
- **voting the aisle across every chain's name** moves 278, most of them wrong: with "כללי" not counting as a vote,
  one keyword in one chain's name beats everyone - a hair conditioner "בחומץ תפוחים" went to בשר ועוף.
- **a guard keeping food cups out of the glassware rule** moves 16 names out of בית וכלים, but into כללי or wrongly
  into ירקות ופירות (a soy yoghurt "אפרסק", an avocado dip), and takes two real lidded containers with it.

What would actually fix it is a source that is not a keyword: the chains' own shelf placement, which is how Naor
decides departments (scripts/audit-chain-placement.mjs). That is its own design, not a rule tweak.

## Flavour words: 131 -> 15 (28.9)

`scripts/category-labels.mjs --concept-health` flagged 131 products, and 144 once today's display-name fix was
built. The round, measured each step with `concept-round.mjs --raw --diff` and a HEAD build in a worktree:
- **A matcher bug, not a rule:** 105 concepts excluded a bare "קרמ", and `none` is a substring test, so the "קרמ"
  inside "צוקרמן" blocked every Zuckerman honey (the build then filed 11 of them under בית וכלים). It is now
  word-start ("(?<![א-ת])[בוהלמש]?קרמ"): cream, caramel, Crema and Cremeria still start a word and are still
  excluded. A whole-word version was measured first and rejected, because it let those four back in.
- **~40 guards** where the concept really was wrong: lip cream as butter, liquid soap as green tea, blintzes as
  chocolate spread, stuffed vegetables as pasta sauce, diaper cream as diapers, halva as pistachios. Three first
  versions overreached and were narrowed: "טבעות" matched "מטבעות" (chocolate coins), "קורנפלקס" took a real milk
  bar with cornflakes, and "(^| )ממרח" took spreadable Lurpak. test/concepts-flavour-words.test.js holds both sides.
- **83 reviewed and cleared** in config/categories/concept-reviewed.json with a reason each: the marker was the
  product's own form ("נוזל לניקוי אסלה", "קרם גלייז") or a brand ("קרמה", "צוקרמן"), not a flavour.
- **Rejected:** stripping a bare "טעם" the way "בטעם" is stripped. It fixed 48 names but broke 15 (honey cake,
  protein pudding, chocolate spread, chocolate milk, and the brands טוב טעם / טעם הטבע), so it was reverted.
- **The 15 still open** are real: vegan cheddar, mozzarella and butter held by one chain's short name (a question in
  docs/QUESTIONS-FOR-NAOR.md), Crystal drinks under flavored-syrup, PAM spray under olive oil, chewy Mentos under
  hard candy, a laundry sanitizer under disinfectant spray.

## Open questions for Naor, evidence recorded, no action taken

- **Plant milks** (oat, soy, almond): three concepts declare חלב וביצים, the reviewed labels say משקאות,
  roughly 106 products. A genuine shelf question, filed in docs/QUESTIONS-FOR-NAOR.md.
- **Pickled Russian mushrooms** (אופיאטה, גרוזדי, מסליאטה, ברוביצקי, אסורטי): deliberately left without a
  concept as different wild species rather than one comparable product, but scattered across three
  departments. Filed in docs/QUESTIONS-FOR-NAOR.md.
- **salmon**: should the generic concept stay weighed once a `-fillet` pair exists? See the named round
  above. The earlier reading of this - that its 41 distinct names made it a bucket - was withdrawn by the
  session that measured it: a name count cannot tell one product with many labels from a real family, and
  the cut breakdown can.

## What is not a gap

Cosmetics look single-chain in the audits and are: shufersal publishes 1,144 names carrying a cosmetics
word and every other chain fewer than 15. That is the price files, not our rules, and no round can fix it.

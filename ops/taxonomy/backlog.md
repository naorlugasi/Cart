# Taxonomy backlog (25.9.2026)

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

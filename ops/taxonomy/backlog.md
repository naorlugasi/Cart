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

## Open questions for Naor, evidence recorded, no action taken

- **Plant milks** (oat, soy, almond): three concepts declare חלב וביצים, the reviewed labels say משקאות,
  roughly 106 products. A genuine shelf question, filed in docs/QUESTIONS-FOR-NAOR.md.
- **Pickled Russian mushrooms** (אופיאטה, גרוזדי, מסליאטה, ברוביצקי, אסורטי): deliberately left without a
  concept as different wild species rather than one comparable product, but scattered across three
  departments. Filed in docs/QUESTIONS-FOR-NAOR.md.
- **salmon as a weighed concept**: carries 41 distinct weighed names and still publishes a per-kilo card at
  99.9 across 9 chains, where concepts that publish cards carry 7-9 names and bucketed ones carry 15-78. It
  sits with the buckets on the discriminator and behaves like a card. Measured by the weighed-prices
  session, recorded in docs/CONCEPTS.md, not acted on.

## What is not a gap

Cosmetics look single-chain in the audits and are: shufersal publishes 1,144 names carrying a cosmetics
word and every other chain fewer than 15. That is the price files, not our rules, and no round can fix it.

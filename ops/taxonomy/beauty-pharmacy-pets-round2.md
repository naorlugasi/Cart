# טיפוח ויופי / פארם ותוספים / בעלי חיים - round 2 (27.9)

Round 2 on the same three files round 1 owned (`config/concepts/beauty.json`, `pharmacy.json`, `pets.json`):
synonym coverage first (`scripts/concept-synonyms.mjs`), then the three items round 1's own reports left
open (perfume, calcium, dry dog food). Full measurement, LOST accounting and verdict numbers are in the
commit message; this file is department misroutes only, per the taxonomy SKILL.md boundary (categorize.js
is shared, not edited here).

## perfume (new concept, beauty.json) - department misroutes it fixes automatically

`categorize(name, conceptId)` consults a concept's own `category` before the department keyword rules, so
writing `perfume` with `"category": "טיפוח ויופי"` pulls these out of the departments they were stranded in,
with no `categorize.js` edit needed:

| product name (sample) | stranded in | why |
|---|---|---|
| בוס בוטלד פרפיום, גוצי בלום פרפיום, דולצה קיו פרפיום, לה אונו מיליון לה פרפיום, ... (10 names) | כללי | no department keyword recognized these at all |
| אליזבת וויט תה אדפ/אדט 100מל | משקאות | "תה" (tea) triggered the drinks department before the concept category could win - see the guard note below, this one is a genuine conflict with `tea-black` and is deliberately NOT captured (see LOST) |
| שרי בייבי אדפ לאשה 75מל | תינוקות | "בייבי" (baby) triggered the baby department |
| וולווט קריסטל אדפ, ברייט קריסטל אדט (×2), נרסיסו קריסטל אדפ | משקאות | "קריסטל" collided with a syrup-flavour concept (`flavored-syrup`) in a file this round doesn't own - deliberately excluded, see LOST below |
| לה פרפיום לגבר, סובאג פרפיום לגבר, SAUVAGE פרפיום לגבר, Y לה פרפיום לגבר (×2) | ניקיון וטואלטיקה | no department keyword recognized these; likely fell through to a default |
| בולגרי פור הום אדט100מ"ל | חלב וביצים(?) | "בולגרי" (Bvlgari) collides with `bulgarian-cheese` (dairy-eggs.json) - deliberately excluded, see LOST below |

## perfume - conflicts that would have appeared without a guard (not this round's file to fix on the other side)

Three collisions are with concepts this round doesn't own (`tea-black`, `flavored-syrup`, `bulgarian-cheese`,
all outside beauty/pharmacy/pets.json). Per taxonomy TRAPS.md #14 (a conflict is worse than no concept),
`perfume`'s own `none` list was widened to cede these specific names rather than create a conflict:
`none` now includes `קריסטל`, `בולגרי` and a word-bounded `תה` (tea). Net effect: these 8 names keep
whatever concept they already had (flavored-syrup ×5, tea-black ×2, bulgarian-cheese ×1) instead of losing
it to a conflict, but they also don't become `perfume` - a human real perfume, misfiled as a cheese/tea/syrup
concept, stays that way until whoever owns dairy-eggs.json/pantry.json/drinks.json adds the mirror-image
guard (exclude `אדפ`/`אדט`/פרפיום from their own rule). Ask, not a fix made here.

## calcium (new concept, pharmacy.json) - one misroute it fixes, one it does not

- `סידן ציטראט חיסכון`, `קלציום 600 סופהרב` were sitting in `כללי` - both now move to `פארם ותוספים` via
  the concept's own category, no categorize.js change needed.
- `פורינה וואן כלב אקטיב מידימקסי עוף 7 קג` (unrelated to calcium, found via the new `dog-food-dry`
  concept) was sitting in `בשר ועוף` - same automatic fix, listed here since it's the same mechanism.

## dry dog food: brand-only names left open, still

`concept-clusters.mjs --department "בעלי חיים" --expand` on the two brand families that already had a dry
concept candidate (`דוגלי בוגר בקר 3 ק"ג`, `בונזו בשר נטול חמץ 10.2 קג`) confirms round 1's finding again:
these say a brand and a protein, never "כלב" itself and never a dry-specific word - so `dog-food-dry`'s
`all: ["כלב", "קג"]` correctly leaves them unassigned (no textual, non-brand cue exists for them). The 5
names the new concept **does** catch (`דוגלי בקר/עוף לכלבים ...`, `סימבה בקר/עוף לכלב ...`, the misfiled
Purina One above) all explicitly say "לכלב"/"לכלבים" - the species word was the missing half of the cue, not
a new brand rule.

**Also noticed, not fixed (out of this round's three items):** `לה קט גריל/עוף/מיקס 2.85 ק"ג` are La-Cat dry
cat food in the same קג-pack shape, but they never say "חתול" either - the same gap exists for cats and
`cat-food-dry` doesn't reach them for the same reason `dog-food-dry` correctly refuses the Dogli/Bonzo names.
Left for whoever next opens the cat side of pets.json; flagging here since it was found while checking the
dog-food symmetry.

## dog-food-wet gained a `פטה` cue it was missing relative to cat-food-wet

Not one of the three headline items, but found while re-reading the family for the calcium/perfume sweep:
`cat-food-wet`'s `any` already included `פטה` (pate texture); `dog-food-wet`'s did not, so `פרמיו פטה סלמון
לכלב 150ג` and three `וונפי שימורי כלב פטה עוף...` names (also documented as a known gap in round 1's own
pets.md, "bare כלב construct, no ל") sat unassigned or conflicted. Added `פטה` to `dog-food-wet`'s `any` -
symmetric with the sibling concept, no new conflicts introduced (measured).

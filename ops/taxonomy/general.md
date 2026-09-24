# כללי - department round (25.9): what's still open

Written while running the concept round on `config/concepts/general.json` (plus targeted extensions
to `beauty.json` and `household.json` for the four cosmetic clusters named in the brief: מרכך, עפרון,
ספריי, מבשם). Verified live with `categorize(name, conceptId)`/`assignConcept`, not with
`data/products.json`'s `category` field (that field is from the previous build - TRAPS.md #15).

I do not own `src/catalog/categorize.js` this round (another agent owns it in parallel) - no
CATEGORY_RULES-level bug was found this round worth filing; everything below is a concept-layer gap.

## 1. Deliberately left unclassified inside the four priority clusters

Each of these was checked against real raw names and left alone on purpose, not missed.

- **מרכך, 10 products** (the whole `מרוכז` variety inside the target 46): `מרכך מרוכז 1ליטר OH`,
  `מרכך מרוכז ורוד/בייב/כחול/סגול/צהוב 1 ליטר טאצ'`, `מרכך מרוכז לבנדר(/גרין קר) 1 ליטר`. Every one of
  these is shaped exactly like a private-label **fabric softener** (1-liter bottle, color/scent-coded
  brand name, "טאצ'" is a laundry line elsewhere in the same catalog: `מרכך כביסה טאצ' ורוד`) but none
  of the 10 names say "כביסה" - a rule broad enough to catch them as `conditioner-hair` also catches
  ~30 more real fabric-softener SKUs across the wider catalog (לנור, בדין, מקסימה, סנו, סוד all sell
  "מרכך [color] [size]" without the word כביסה). Better unclassified than wrong - `conditioner-hair`'s
  `any` list is a curated hair-care vocabulary specifically so it does **not** reach these.
- **מרכך, 1 product**: `מרכך בתוספת שמן זית`. Architecturally unreachable by any `any`-word rule:
  `withoutFlavourPhrases()` strips `בתוספת <word> <word>` before the positive check runs
  (`src/catalog/concepts.js` FLAVOUR_PHRASE), so "בתוספת שמן זית" disappears from the text a concept's
  `any` is tested against, leaving only "מרכך" - no vocabulary word survives to match on. A genuine
  fabric-softener product could look identical after the same strip.
- **עפרון, 4 products**: `עפרון אינפליבל 36 שעות` (L'Oreal Infallible - a real line across lip, eye
  *and* brow pencils, no body-part word in the name to disambiguate).
- **עפרון, 2 products**: `עפרון לתיחום` (generic "definition pencil", no body part), `עפרון Badgal
  Bang יחידה` (Badgal Bang is a Benefit **mascara** line; a pencil under that name is not identifiably
  lip/eye/brow).
- **ספריי, ~30 products** beyond DAVE (6, → `deodorant`): the cluster's other varieties are
  singletons/pairs below the 3-product-or-2-chain bar (`הגנה` 2, `סילואט` 2, `מבהיר` 2 - hair-lightening
  spray, worth a look if a second chain shows up - and ~24 true singletons: פרפיום bottles, hair spray,
  self-tanner, silver polish, anti-hair-loss spray, etc.). None reach a real family on their own.

## 2. שלישיית and the two non-storage clusters inside it (LED bulbs, ankle socks)

The brief lists `שלישיית` as off-limits, owned by the home.json agent, with no description attached
(unlike `סט`/`בקבוק`/etc., which are described as specific object types). In the live data the
`שלישיית` headword is not purely storage - `node scripts/concept-clusters.mjs --department כללי --expand
שלישיית` shows `שלישיית קרסוליות בנות/בנים/נשים` (7, ankle socks) and `שלישיית נורות לד` (6, LED bulbs)
inside it alongside the storage/kitchen items (קרשי חיתוך, מסננות, פותחנים, פקקי אמבטיה...).

I read the off-limits list as ownership of the **headword cluster**, not only of the object types it
happens to mostly hold, so I did not write concepts for either group even though LED bulbs and socks
are not literally plate/cup/bowl/spoon/pot/pan/tray/knife/storage-box. Concretely this means:

- I wrote `air-conditioner-split`/`air-conditioner-portable`/`slushie-machine`/`ice-maker` etc.
  (headword `מזגן`/`מכונת`, not shared with שלישיית) but **not** an LED-bulb concept, even though the
  sibling `זוג נורות לד` (4 products, different headword) would have been safe to combine with it for a
  properly-mapped family. Flagging so the LED-bulb family isn't half-mapped by two different agents
  working from two different headwords.
- Socks (`קרסוליות`, `גרבי`/`גרביי`) have **no** unassigned products in כללי outside the שלישיית
  headword (`--expand גרבי` / `--expand גרביי` both return "no unassigned products") - the sock family
  in this department lives entirely inside שלישיית, so it is entirely the other agent's to take.

## 3. Large food-word clusters in כללי that are not mine to fix

Several of the biggest remaining clusters are genuine food items whose concept file belongs to another
round: `קוקוס` (20, coconut - pantry.json), `קוואקר` (19, Quaker oats - pantry.json), `עלי` (19, bay/mint
leaves - produce-deli-frozen.json), `פלפל` (16, ground pepper - pantry.json), `קינוחיות`/`צנימים`/`מיני`
(bakery/snacks.json), `אסאדו`/`צלי` (meat-fish.json), `פקאן`/`צנובר` (pantry.json/snacks.json). These sit
in כללי because the concept that should claim them lives in a file I don't own - not something a
`"category": "כללי"` concept in general.json can honestly fix without duplicating (and likely
conflicting with) whatever that file's own round already does or will do with the same words.

## 4. Left open, below priority given depth-over-breadth

- **אל תוש** (2 products: `אל תוש 70 מ"ל X-TUSH`, `אל תוש ילדים50מ X-TUSH`) - a roll-on
  antiperspirant line, same shape as the DAVE fix (`deodorant` in household.json). Below the 3-product
  bar to justify touching `deodorant`'s `all` again this round; flagging as a one-line follow-up
  (`"(דאודורנט|DAVE|תוש)"`) rather than doing it speculatively for 2 SKUs.
- **משטח** (19, mixed: `משטח הגנה` protective shelf/drawer liner vs. `משטח לחיתוך/הגשה` kitchen
  boards) and **קרש** (16, mixed: `קרש גיהוץ` ironing board vs. `קרש חיתוך` cutting board, explicitly
  off-limits) both need a split before either half gets a concept, and the non-kitchen half in each
  (drawer liners, ironing boards) is thin enough on its own that I left both clusters for a dedicated
  pass rather than a rushed partial split.
- **שטיח** (17, bath/door mats) and **מפה** (18, tablecloths) are household textiles, not explicitly
  on the off-limits list and not reaching a plate/cup/bowl/spoon/pot/pan/tray/knife/storage-box, but
  close enough to home.json's "physical household object" remit that I left them for that agent to
  claim or explicitly release, rather than risk a duplicate concept.

## Notes, not misroutes

- `concept-dead-rules.mjs`'s "one chain only" check flags `skin-tint` (15, all Shufersal),
  `body-mist-brazilian` (15, all Shufersal) and `mens-underwear` (5, all Rami Levy) - consistent with
  every pre-existing cosmetics concept in beauty.json (Shufersal is the only chain that carries this
  catalog's makeup lines at all) and with BLACK BULL being a Rami Levy exclusive private label. Not
  something a `none`/`any` change can fix - there is no second chain's name to compare against yet.
- `אקסלנס` (L'Oreal Excellence hair dye, 33 products after the fix) collides hard with two unrelated
  products also branded "Excellence": Lindt chocolate and a Carmel Winery wine line. `hair-color-excellence`
  guards against both explicitly (`none: יינ, לינדט, לינד, שוקולד, שוק, יקבי, כרמל, קקאו, רוזה, שיראז,
  ריזלינג, שרדונ`) - flagging in case a new Lindt or Carmel SKU later slips a guard word.
- Two products merely *taste* or *scent* like something they are not, and both were real regressions in
  this round's own measurement before the fix: `מרכך קרמה מן קרטין ושמן ארגן` (a cream-form hair
  conditioner, not a "קרם" skin cream that happens to contain the word) and `מבשם בדים/נטול
  גז/לבית` fabric/room fresheners scented "בניחוח כביסה" (laundry scent), not the `כביסכל` laundry
  scent-booster product they were briefly guarded against as if they were the same thing.

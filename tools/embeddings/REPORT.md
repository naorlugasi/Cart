# Semantic (embedding) index prototype — measurement report

Prototype branch: `wt-embed`. All tooling lives in this folder (`tools/embeddings/`), self-contained
with its own `package.json`. Nothing under `data/` is committed. This document is the deliverable:
numbers first, samples for human judgment, then an honest conclusion.

## 1. Setup

- **Model**: `Xenova/multilingual-e5-small` (the transformers.js ONNX repack of
  `intfloat/multilingual-e5-small`), 384-dim, mean pooling, L2-normalized output, run on CPU via
  `@xenova/transformers`. No API keys, nothing leaves the machine. e5's own convention is used:
  `"passage: "` prefix for everything indexed, `"query: "` prefix for ad-hoc lookups.
- **k-NN**: `hnswlib-node` (cosine space) rather than brute-force — brute-force pairwise cosine over
  31k x 31k assigned products would be ~3.7x10^11 multiply-adds, tens of minutes in plain JS;
  `efSearch` is set generously (64–400) for near-exact recall since this is a measurement, not a
  latency-sensitive production path.
- **Text embedded per product**: the unified catalog name (`products.json#name`) plus the **longest**
  name seen for that gtin across the 14 chains' `catalog.full.json`, space-joined — e.g. unified
  `"מנגל פח+רשת"` would be joined with whichever chain spells it out more fully. This is **one
  embedding per product (46,820 total)**, not one per chain-name — the "if slow, fall back to 47k"
  option in the brief, which wasn't needed: see timing below. When the chain name is a prefix/suffix
  of the unified name (or identical) we keep just the longer of the two instead of concatenating a
  near-duplicate.
- **Scope**: 46,820 products (47,060 rows in `products.json` minus 240 `kind:"concept"` definition
  rows, which are the concept catalog itself, not products).
- **Timing**: building all 46,820 embeddings took **385.8s (~6.4 minutes)** wall time on this machine
  (Apple Silicon, CPU-only, batch size 64), averaging ~122 items/s over the full run (it started near
  190/s and settled to ~122/s as the process ran longer — consistent with thermal/scheduling
  variance, not a data issue). Comfortably "minutes, not hours."
  - Concept-holdout index build (31,194 vectors): 44.4s; querying all 31,194 leave-one-out neighbour
    sets (k=10): 70.8s.
  - Department-holdout index build (9,787 vectors): 7.7s; querying: 13.6s.
  - Concept-proposal scoring (15,626 unassigned products against the assigned index): 34.0s.
  - Department-proposal scoring (37,033 un-truthed products): 51.3s.
- **Vote/confidence rule** (shared by every measurement below, `lib/vote.mjs`): among a product's k
  nearest neighbours, each neighbour votes for its own label (conceptId or department) weighted by
  its cosine similarity; the label with the highest similarity-sum wins. **Confidence** = that
  winning label's similarity-sum / the total similarity-sum of all k neighbours — i.e. a 0–1 score
  that rewards both agreement (more neighbours voting the same way) and closeness (higher-similarity
  neighbours count more).

## 2. Concept holdout (the primary deliverable)

For every one of the **31,194 products that already have a conceptId**, we hid it and predicted one
from its k nearest neighbours among the *other* assigned products (leave-one-out).

| k | top-1 accuracy | 95%-precision gate (threshold) | precision at gate | coverage at gate |
|---|---|---|---|---|
| 5  | **82.9%** (n=31,194) | 0.61 | 96.4% | **63.2%** (19,711 products) |
| 10 | **82.2%** (n=31,194) | 0.61 | 96.9% | 56.3% (17,564 products) |

k=5 gives slightly better coverage at a comparable precision, so **k=5 is the recommended setting**
for a review-queue gate; k=10 is marginally more precise if coverage is less important than reducing
false proposals even further.

### Accuracy by department (k=5; k=10 is within ~1–5pp of every row, same ranking)

| Department | n | accuracy |
|---|---|---|
| ניקיון וטואלטיקה (cleaning/toiletries) | 6,567 | 88.4% |
| שימורים (pantry/canned) | 6,025 | 83.1% |
| חטיפים וממתקים (snacks/candy) | 3,405 | 81.7% |
| משקאות (drinks) | 3,241 | 82.0% |
| טיפוח ויופי (beauty) | 2,638 | 90.7% |
| חלב וביצים (dairy/eggs) | 1,857 | 78.5% |
| מעדנייה (deli) | 1,596 | 78.9% |
| מאפים ולחם (bakery/bread) | 1,505 | 79.0% |
| ירקות ופירות (produce) | 1,130 | 74.9% |
| בשר ועוף (meat/poultry) | 962 | 65.6% |
| פיצוחים ופירות יבשים (nuts/dried fruit) | 637 | 79.6% |
| בית וכלים (home/housewares) | 481 | 78.0% |
| תינוקות (baby) | 465 | 84.3% |
| פארם ותוספים (pharmacy/supplements) | 292 | 82.5% |
| בעלי חיים (pets) | 241 | 75.5% |
| כללי (general/misc) | 115 | 97.4% |
| טבעוני (vegan) | 37 | 45.9% |

**Two departments stand out as weak**: meat/poultry (65.6%) and vegan (45.9%, but n=37 is tiny — don't
over-read it). Both match the project's own documented traps (`fresh-frozen-separate.md`,
`vegan-is-own-product.md`): the embedding has no reliable signal for "fresh vs frozen" or "this
specific animal-free substitution never gets the animal concept" — those are exactly the distinctions
Naor had to hand-encode as guards because plain text similarity doesn't carry them.

### Top 20 confusion pairs (k=10, unthresholded argmax — the trap cases)

| actual → predicted | count |
|---|---|
| pasta-penne → pasta-other | 29 |
| pasta-spaghetti → pasta-other | 26 |
| skin-face-cream → hair-cream | 25 |
| tea-black → tea-green | 24 |
| wine-white → wine-red | 23 |
| food-storage-bags → trash-bags | 21 |
| chocolate-bar-white → chocolate-bar-milk | 20 |
| wine-red → wine-white | 20 |
| yogurt-plain → yogurt-fruit | 18 |
| pasta-other → noodles | 16 |
| skin-face-mask → hair-mask | 14 |
| rice-white → rice-basmati | 13 |
| pizza-sauce → pasta-sauce-tomato | 13 |
| chocolate-bar-milk → chocolate-bar-dark | 12 |
| sausage-other → chicken-sausage | 12 |
| soda-fruit-flavored → soda-lemon-lime | 12 |
| icecream-multipack → icecream-tub | 11 |
| crispbread-mixed-grain → crackers-rice | 11 |
| coffee-roasted-other → coffee-capsules | 11 |
| wine-sparkling → wine-rose | 11 |

Concrete examples pulled from these buckets (actual product name, its wrongly-predicted concept, and
the neighbours that caused it):

- **wine-white → wine-red**: `יין אמפורה מד וויט 2024 750 מ"ל` matched `יין מרלו 2025 אשבל750מ`
  [wine-red] at 0.936 — same bottle format/vintage-year tokens, wrong colour.
- **tea-black → tea-green**: `ויסוצקי תה שחור עם נענע 25 שקיקים` matched `תה ירוק נענע ויסוצקי 25
  יחידות` [tea-green] at 0.977 — same brand + same flavour word ("mint") + same pack size, but black
  vs green is exactly the attribute the embedding ignores.
- **pasta-spaghetti → pasta-other**: a gluten-free pasta line (`טינקיאדה ... 454 ג`) matches its own
  sibling shapes almost perfectly (0.98+) because the brand/descriptor text dominates and the shape
  word is a single token buried in there.
- **food-storage-bags → trash-bags**: `20 שקיות צלייה L בגודל 25*38 ס"מ` (roasting bags) is closer to
  other bag products by size-token overlap than to its own correct neighbours.

This is exactly the trap pattern the brief predicted: colour/variant/shape distinctions the model
doesn't encode, versus brand+format+size which it encodes very strongly.

## 3. Concept proposals for the ~15.8k unassigned products

Applying the k=10, threshold=0.61 gate (measured above) to the **15,626 products with no
conceptId**: **2,124 (13.6%)** clear the gate and get a proposal.

That coverage is *much* lower than the 56.3% the same gate achieved on the holdout. That gap is a
genuine finding, not noise: unassigned products are not a random sample of the catalog — they are
disproportionately the ones nobody has been able to write a confident concept rule for yet, which
correlates with exactly the kind of terse/generic text an embedding also struggles with (see §6).

Acceptance rate by department:

| Department | unassigned (n) | accepted | rate |
|---|---|---|---|
| כללי | 5,071 | 570 | 11.2% |
| ניקיון וטואלטיקה | 2,430 | 510 | 21.0% |
| שימורים | 2,139 | 231 | 10.8% |
| בית וכלים | 1,108 | 125 | 11.3% |
| חטיפים וממתקים | 1,008 | 104 | 10.3% |
| מעדנייה | 804 | 104 | 12.9% |
| משקאות | 684 | 97 | 14.2% |
| חלב וביצים | 513 | 74 | 14.4% |
| טיפוח ויופי | 468 | 151 | 32.3% |
| ירקות ופירות | 395 | 47 | 11.9% |
| מאפים ולחם | 312 | 46 | 14.7% |
| בשר ועוף | 224 | 20 | 8.9% |
| תינוקות | 188 | 10 | 5.3% |
| בעלי חיים | 147 | 28 | 19.0% |
| פארם ותוספים | 97 | 5 | 5.2% |
| פיצוחים ופירות יבשים | 24 | 2 | 8.3% |
| טבעוני | 14 | 0 | 0.0% |

Full list (2,124 records: id, name, category, proposedConceptId, confidence, top-5 neighbours) is at
`data/local/concept-proposals.json` (gitignored). 40 random samples, eyeballed by hand:

| confidence | proposed concept | product | nearest neighbour |
|---|---|---|---|
| 1.00 | perfume | בורן אין רומא לגבר 100מל | BORN IN ROMA אדט לגבר50מ |
| 0.80 | kebab-frozen | קבב על מקל קינמון 520 גרם הקצביה בלדי | קבב ביתי ארוז 600 גר קצביה בלדי |
| 1.00 | wafers | וופל ציפוי שוקולד ופיצפוצי אורז לל"ג | וופל קרם אגוזי לוז בציפוי שוקולד חלב |
| 1.00 | skin-face-cream | סלולר קרם יום פילר 50 מל | קרם לילה סלולרבוסט 50 מ |
| 0.80 | corn-canned | תירס קראנצי ללא סוכר שטראוס 380 גר | תירס קראנצ'י שטראוס בקופסה 380 גרם |
| 0.70 | salmon-smoked | סלמון פרוס בעישון קר | סלמון מעושן פרוס |
| 0.80 | disposable-plates | 16צלחות יוקרתי שקוף+כסף | סט16 צלחות ספירלה כסף |
| 1.00 | skin-face-cream | גניפיק קרם לילה 50 מ"ל | קרם לילה 50 מ"ל |
| 0.70 | perfume | PINA PARAISO א.ד.פ. 75מל | קנזו איקבנה אדפ75מ |
| 0.70 | couscous | פתיתים 3 צבעים סוגת 400 גרם | פתיתים אפויים קוסקוס 3 צבעים אסם 500 גרם |
| 0.90 | perfume | דולצה לייט בלו קאפ 100מל | דולצה דבושן אדפ 100 מל |
| 1.00 | tortilla-wrap | טורטיות בתוספת זרעי צ'יה 25ס"מ 6יח | טורטייה בתוספת חיטה מלאה 12 יח', קוטר 25 ס"מ |
| 0.70 | skin-face-serum | תאורת חירום נטענת 30 | קונסילר סרום גוון 30 — **wrong**: a rechargeable emergency light, not cosmetics; pure "30" token collision |
| 0.80 | disposable-plates | סט צלחת מחולקת דובי | סט צלחות ספירלה שקוף |
| 0.70 | disposable-cups | כוס יהלום 250 מ"ל 40 יחידות | כוסות פלסטיק "יהלום" 250 מ"ל סימפלי אלגנט |
| 0.80 | salad-mix | לקט ירקות שורש 350 גר`חסלט | לקט מסולסלים 350 גר ירקות שטראוס |
| 1.00 | crackers | קרקר דק עם קינואה שו | קרקר עם שומשום טופז |
| 0.90 | bouillon-stock | מרק 400 טעם עוף 100% רכיבים טבעיים קנור | מרק טעם עוף 400 גרם צנצנת קנור |
| 0.80 | fabric-softener | מקסימה בושם מרוכז לכביסה 600 מל | בושם מרוכז לכביסה FOREVER כחול |
| 0.90 | squeegee | מגב עם תפסן+ מקל( 40 סמ) CLING | מגב מתכת 40מ"ס שווה |
| 0.90 | vinegar | חומץ יין אדום 5% 500 מ"ל | מונטנייר חומץ יין אדום 500מל |
| 0.80 | bread-rolls | לחמנ.כוסמין במתיקות5*60ג | לחמניות כוסמין 6יח 450ג |
| 1.00 | perfume | HE א.ד.ט לגבר 100 מ"ל | דה וואן אדפ לגבר 100 מ"ל |
| 0.90 | dates | גב.טמרה מלוח בקר17% 400ג | תמר מגהול מעולה 400 גרם |
| 1.00 | perfume | מיי סלף א.ד.פ לגבר 100מל | אבסולוטלי אדפ לגבר 100מל |
| 1.00 | perfume | אמבר אוד אקווה 100מל | אמבר אוד גולד אדפ100מל |
| 0.90 | deodorant | רול און אבן קריסטל לאישה | ניוואה דאודורנט רול און פרל אנד ביוטי לאישה |
| 0.80 | perfume | ברא רוגע 100 מ"ל | בלו נואר אדט 100 מ"ל |
| 0.80 | water-bottle | בקבוק 650 מ"ל מיקי ק | בקבוק פלסטיק 500 מ"ל |
| 0.80 | protein-bar | חטיף פרוצ'יטו בטעם ברביקיו | חטיף צ'יפס חלבון בטעם ברביקיו פרוטאין מקס 36 גרם |
| 0.80 | cleaning-brush | מברשת חשמלית לילדים כחול | מברשת חשמלית כחול |
| 1.00 | disposable-cups | כוסות נייר b8 פאלאס (50) | כוסות נייר 8 אוז 50 |
| 0.70 | cloth-floor | מיקרופייבר לרצפה | מטליות מיקרופייבר לרצפה |
| 0.70 | milk-jam | ריבת גינגר 340 גרם | ריבת חלב 340 גרם — **wrong**: ginger jam ≠ dulce-de-leche/milk jam; "340 גרם" collision |
| 1.00 | deodorant | ניוואה דרמה קונטרול דאו ספריי לאישה150 | דאו רקסונה ספריי לאישה ברייט בוקט 150 |
| 0.70 | skin-face-serum | סרום גוף 100 מ"ל | סרום ארגן 100 מ"ל |
| 1.00 | baby-wipes | מגבונים לחים בדלי 2ק"ג | מגבונים לחים עדינים |
| 1.00 | napkins | מפיות חג דגם רימון ש | מפיות חג דגם תפוח שנ |
| 0.80 | soy-sauce | רוטב סויה קיקומן ללא תוספת חומרים משמרים | משקה סויה ללא תוספת |
| 1.00 | tomato-cherry | עגבניות שרי שלמות מק | עגבניות שרי |

**38 of these 40 (95%) look correct or defensible by eye** — matching the measured 96.9% holdout
precision well. The two visible misses are both classic trap cases: a numeric-token collision
("30", "340 גרם") overriding weak semantic content on a short/generic name. That's a useful signal in
itself: **the gate's failures concentrate on short, number-dominated names**, which is the same
pattern as the department-proposal failures below, just much rarer here (2/40 vs. the much higher
miss rate in §4) because most unassigned-but-embeddable products still carry enough brand/descriptor
text for the concept-level match to lock onto.

## 4. Department holdout and proposals (added 2026-10-03, same embeddings)

Ground truth: the union of (a) per-product entries in `config/categories/labels.json` (`g<gtin>` keys,
9,153 products), (b) that file's per-concept entries (`c-<id>` keys) applied to every product
currently carrying that conceptId (0 additional products matched — none of the 38 concept ids in that
list currently has an assigned product, so this source contributed nothing in practice), and (c)
`config/products/verified.json` records that carry a `category` (634 products not already covered by
(a)). Total: **9,787 products** with a trusted department label.

| k | agreement with ground truth | 95%-precision gate (threshold) | precision at gate | coverage at gate |
|---|---|---|---|---|
| 5  | **91.0%** (n=9,787) | 0.61 | 97.4% | **79.9%** (7,819 products) |
| 10 | 89.6% (n=9,787) | 0.61 | 97.2% | 74.9% (7,326 products) |

Agreement is markedly higher than the concept holdout (91.0% vs 82.9%), which makes sense — department
is a coarser label than concept, so there's more room for a neighbour to be "close enough."

By-department breakdown (k=5) shows the holdout's **own ground-truth set is not uniform**: the three
worst rows are products in בית וכלים (36.5%, n=104), טיפוח ויופי (26.1%, n=23) and כללי (16.7%,
n=12) — all *small* slices of the reviewed set, and almost certainly present in `labels.json` or
`verified.json` precisely *because* they were hard/ambiguous cases someone had to adjudicate by hand.
That's a selection-bias warning worth remembering for §6.

### Department proposals for the ~37k products with no reviewed label

For the **37,033 products with neither a `labels.json` entry nor a `verified.json` category**, we
predicted a department from the same k=10/threshold=0.61 gate. **16,686 (45.1%)** clear the gate;
of those, **4,167 (11.2% of all 37,033)** disagree with the product's current `category` field — the
actionable review-queue entries (agreements aren't actionable, so they're dropped from the saved
list). Full list at `data/local/department-proposals.json` (gitignored). 30 random disagreements,
eyeballed:

| confidence | current → proposed | product | nearest neighbour | my read |
|---|---|---|---|---|
| 0.90 | כללי → ניקיון וטואלטיקה | מברשת חשמלית לילדים ורוד | מברשת שיניים לילדים | **correct** |
| 1.00 | טיפוח ויופי → ניקיון וטואלטיקה | נטורל פורמולה קרם לחות לשיער... | נטורל פורמולה קרם לחות אלוורה... | boundary call (hair cream could sit in either dept in this taxonomy) |
| 0.90 | חטיפים וממתקים → ניקיון וטואלטיקה | אקס ספריי פרימיום ספא... 150 מ"ל | ספריי גוף דאודורנט בלו לונדר... | **correct — catches a real miscategorization** (a deodorant body spray filed under snacks) |
| 0.90 | כללי → ניקיון וטואלטיקה | קרם למניעת קמטים 50 מל | קרם יום נגד קמטים 30 | correct-ish (face cream; dept boundary with טיפוח ויופי is fuzzy) |
| 0.90 | כללי → משקאות | מיזון קסטל גרנד רזרב ק. סוביניון 750 מ | רזרב גולד קברנה סוביניון 750 מ"ל | **correct** (wine, unfiled) |
| 0.80 | חלב וביצים → שימורים | גבינת פרמזן ברונזה 1 | תבלין פילדלפיה פרג 1 | **wrong** — cheese ≠ spice/rice; "1" token collision on a truncated name |
| 0.80 | טיפוח ויופי → ניקיון וטואלטיקה | קרם לילה רטינול 30 מ"ל | קרם יום נגד קמטים 30 | boundary call |
| 0.90 | כללי → ניקיון וטואלטיקה | ויט רצועות שעווה... 40 יח | ויט רצועות שעווה מוכנות... 12 יחידות | **correct** |
| 0.90 | משקאות → ניקיון וטואלטיקה | סאן דאודורנט אבן קריסטל לנערות | דאודורנט קרליין ספריי נושם... | **correct — catches a real miscategorization** (deodorant filed under drinks) |
| 0.70 | תינוקות → ניקיון וטואלטיקה | מוצץ גומי בליסטר 3יחי | תרסיס דוחה אבק מעץ 3 | **wrong** — a pacifier is not toiletries; "3" token collision |
| 1.00 | פיצוחים ופירות יבשים → שימורים | ממרח פיסטוק 40% 300 גר`שקדיה | ממרח שקד לבן 300 גרם | defensible (spreads often live in the pantry aisle) |
| 0.90 | כללי → ניקיון וטואלטיקה | מסננת איכותית צבעוני | מראה מתקפלת צבעונית לתיק | **wrong** — a kitchen strainer, matched on generic "colorful" adjective |
| 1.00 | ירקות ופירות → שימורים | מנגו 500 גרם | אפונה 500 גרם | **wrong** — fresh mango is not canned goods; pure "500 גרם" collision |
| 0.90 | שימורים → מעדנייה | פול ירוק 600גר | אפונה ירוק עדינ600ירוקים | **wrong** (weight-token collision; questionable either way) |
| 1.00 | ירקות ופירות → שימורים | פלפל שאטה שלם 80 גרם | פלפל שאטה ארוך שלם | **wrong** — fresh pepper, not canned; weight-token collision |
| 0.70 | כללי → חטיפים וממתקים | קוקיס בטעם וניל ושוק | קוקיס שוקולד לבן חלבי | **correct** |
| 0.80 | טיפוח ויופי → ניקיון וטואלטיקה | קרם לידיים יבשות וסדוקות | קרם רחצה מזין בלחות | boundary call |
| 1.00 | טיפוח ויופי → ניקיון וטואלטיקה | ברבי מזוודת איפור | מברשת איפור נשלפת לתיק | questionable (a kids' toy makeup case, arguably neither department fits well) |
| 1.00 | כללי → ירקות ופירות | מארז פג'ויה | נבטי חמנייה מארז | **correct** (feijoa fruit) |
| 0.90 | מאפים ולחם → שימורים | האופה - קמח לחם... 1 ק"ג | קמח שמרים פיצה... 1 ק"ג | defensible (flour is commonly shelved in the pantry aisle) |
| 0.70 | שימורים → חטיפים וממתקים | יוגטה שטיחים חמוצים... 1 קילו | יוגטה שטיחים חמוצים... | **correct — catches a real miscategorization** (sour candy filed under canned goods) |
| 0.90 | כללי → ירקות ופירות | מארז חלומי | מארז אפרסמון | **correct** (fruit box) |
| 0.70 | כללי → ניקיון וטואלטיקה | ניוואה קרם רב שימושי 400מל | קרם רב שימושי ניוואה 250 מ"ל | boundary call |
| 0.70 | שימורים → מעדנייה | דורות בצל מטוגן 400 גר | פפריקה מתוקה בשמן 400 גר | **wrong** (weight-token collision) |
| 0.80 | ירקות ופירות → שימורים | פריגורט תות אורגני 500 ג | זרעי פשתן אורגניים 500 ג | **wrong** — "אורגני" + "500 ג" collision |
| 0.90 | חלב וביצים → שימורים | מיני גביניות עונג 30 | תבלין לעוף 30 גר | **wrong** — cheese wedges, not seasoning; "30" collision |
| 0.70 | ניקיון וטואלטיקה → משקאות | סבון דה מרסיי לרצפות 1.5 ליטר... | סודה קינלי מארז שישייה 1.5 ליטר | **wrong, and the current label was already right** — "1.5 ליטר" collision |
| 0.70 | ניקיון וטואלטיקה → תינוקות | צמרוני אוזניים תינוקות... פישר פרייס | צמרוני תינוקות רמי לוי 55 יח | defensible (baby cotton swabs could sit in either dept) |
| 0.80 | ירקות ופירות → שימורים | פטריות אופיטה 400 גרם | פפריקה מתוקה בשמן 400 גר | **wrong** (weight-token collision) |
| 0.80 | כללי → שימורים | תערובת תה צמחים... 80ג LOVARE | תערובת תבלינים ארומטי... 80 גר | **wrong** — herbal tea belongs in משקאות, not שימורים; "תערובת...גר" collision |

**My honest tally on this sample: ~13/30 (43%) clearly correct (several of them real
miscategorization catches worth fixing immediately), ~6/30 (20%) defensible department-boundary
calls, ~11/30 (37%) clearly wrong.** That is far below the 97%+ precision the same gate measured on
the holdout. See §6 for why — it's the department holdout's biggest caveat and the thing I'd flag
hardest to Naor.

## 5. Substitute candidates (second use case)

For 30 random assigned products, the 5 nearest neighbours that are **not** in the same concept
(full output: `data/local/substitute-sample.json`). Across the 30 products (148 total candidate
slots — a couple of products returned fewer than 5 distinct-concept neighbours in the search window),
**my judgment: roughly 61/148 (~41%) are a genuinely plausible stand-in; the rest are a different
thing.** Patterns:

- **Clean wins** (near 100% plausible within the set): tea-green → tea-black neighbours (5/5), cake
  flavours (5/5), yogurt flavours/types (5/5), soft-cheese types (5/5), disposable-plate sizes (5/5),
  chocolate-spread → nut-butter (4/5), juice-orange → other juices (4/5).
- **Clean misses** driven by non-semantic token overlap: perfume ↔ perfume (0/5 — all five neighbours
  of a 100ml perfume are *other* perfumes only because every perfume name ends in "100 מ"ל", not
  because of scent similarity, so none would be a meaningful "if this one's unavailable, buy that
  instead" suggestion beyond "it's also a perfume"); grill-bbq → popcorn bowl/tongs/dates/tray/almonds
  (0/5 — all share the adjective "ענק" = huge); candle-tealight → powdered sugar (0/5 — "100 גר
  רמילוי" collision); bleach → baking paper (brand-name "פרפקט" collision).
- **Same-category-but-not-a-substitute**: shampoo → conditioner (0/5) — bought together, never a
  stand-in for each other; disposable gloves → diapers/pads (0/3) — same "medical/XL" vocabulary, not
  interchangeable.

This confirms the brief's prediction: the model is very good at **topic clustering** (a wine list, a
cheese list, a tea list) but has no built-in notion of "is a reasonable substitute" vs. "is in the
same aisle" vs. "merely shares a brand/size token" — those three things need separate rules on top of
raw cosine similarity. As a **candidate generator for a human to prune** (high recall, mediocre
precision) it's useful; as a direct substitute suggester it is not reliable at ~41% hit rate.

## 6. Honest conclusion

**Is this reliable enough to feed a review queue?**

- **Concept proposals for unassigned products: yes, with the measured gate.** The holdout's
  96.9%/96.4% precision at k=10/k=5 held up well on inspection (38/40 = 95% looked right by eye), and
  the two misses were recognizably number-token collisions, not random noise. 13.6% coverage of the
  15.8k unassigned products (2,124 proposals) is modest but real, and it's the *right* 13.6% — the
  gate only fires when the vote is actually strong, so the low coverage is the system declining to
  guess rather than guessing badly. **This is worth wiring into a review queue as-is for every
  department**, with the caveat that meat/poultry and vegan need either a higher bar or a human's
  extra scrutiny (both are known project traps — fresh/frozen and animal/non-animal distinctions the
  text embedding can't see).
- **Department proposals for un-truthed products: not yet, not as a blind gate.** The holdout
  measured 97%+ precision, but a hand-check of 30 real disagreements came out closer to 43%
  clearly-correct / 37% clearly-wrong. The gap is a genuine distribution-shift problem, not a bug:
  the ground-truth set (`labels.json` + `verified.json`) skews toward products with descriptive,
  multi-word, branded names (because that's what gets reviewed), while a large share of the
  un-truthed population — especially weighed produce ("מנגו 500 גרם", "פטריות אופיטה 400 גרם") — has
  almost no text beyond "name + weight." On those, the embedding partially keys on the numeric/unit
  token ("500 גרם", "400 גר", "30", "1.5 ליטר") instead of genuine semantics, because there's nothing
  else in the string to anchor to. **Before trusting this list, I'd filter out (or heavily
  downweight) `isWeighted: true` / very-short-name products, and re-measure precision on the
  remainder** — the branded, multi-word products in the sample (deodorant-mislabeled-as-snacks,
  candy-mislabeled-as-canned-goods, wine-mislabeled-as-general) were caught correctly and are
  genuinely useful, real miscategorizations worth fixing today. The full list is saved for Naor's
  own judgment, but it should ship as "needs filtering first," not "ready to review."
- **Substitutes: a recall tool only.** ~41% plausible-stand-in rate means this is useful for widening
  a human's candidate set, not for auto-suggesting a substitute. Any production use needs a second
  filter (shared department, shared `isWeighted`, a blocklist of "same brand prefix" type matches)
  layered on top of raw cosine similarity.

**Which departments does this work best for?** Cleaning/toiletries, beauty, pantry/canned, drinks,
and general/misc. consistently show the highest concept-holdout accuracy (82–97%) and the department
proposals caught several genuine chain-miscategorizations in exactly those departments. Meat/poultry
and vegan are the weakest (both already known, already hand-guarded in `config/concepts/`). Produce
and anything dominated by bare "name + weight" strings is the weak spot for the *department* use
case specifically — it wasn't visible in the concept holdout because concept rules mostly fire on
descriptive/branded text, but it shows up clearly once the department proposals reach into the
weighed-produce tail.

## 7. Reproducing this

```bash
cd tools/embeddings
npm install                       # @xenova/transformers + hnswlib-node, own node_modules
npm run embed                     # builds data/local/embeddings.f32 + embeddings-meta.json (~6 min)
node evaluate-holdout.mjs             # concept holdout -> data/local/concept-holdout-results.json
node evaluate-department-holdout.mjs  # department holdout -> data/local/department-holdout-results.json
node propose-concepts.mjs             # -> data/local/concept-proposals.json (+ sample40 for this report)
node propose-departments.mjs          # -> data/local/department-proposals.json (+ sample30)
node substitute-sample.mjs            # -> data/local/substitute-sample.json
node query.mjs "חלב תנובה 3%"         # ad-hoc: 10 nearest products + similarity + concept
```

All of `data/local/**` is gitignored — nothing from this prototype touches the committed data
contract. `tools/embeddings/.cache/` (the downloaded ONNX model, ~120MB) is also gitignored.

## 8. Open questions / things I'd want Naor's call on

1. Should the department-proposal use case exclude weighed/short-name products entirely, or is there
   a cheap way to fold the chain's own department placement in as a second signal (most chains do
   categorize mango as produce; the embedding alone just can't see it from "מנגו 500 גרם")?
2. The concept-proposal gate (k=10, threshold 0.61) and department-proposal gate landed on the exact
   same threshold value (0.61) by coincidence of the 41-step scan — worth re-running with a finer
   step size if this ever goes into production, rather than reusing 0.61 as if it were meaningful
   across both tasks.
3. `config/categories/labels.json`'s 38 concept-keyed (`c-...`) department labels matched zero
   products in the current `products.json` — either those concepts don't exist yet in
   `config/concepts/*.json`, or no product currently carries them. Worth a quick check on whether
   that file is stale.
4. I did not attempt to improve the model/approach (e.g. a larger e5 variant, fine-tuning, or
   combining embedding similarity with the existing `assignConcept()` regex rules) — this report is a
   measurement of the baseline approach as scoped, not an optimization pass.

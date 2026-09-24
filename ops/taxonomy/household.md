# ניקיון וטואלטיקה - department misroutes found while writing concepts (24.9)

Found while running the concept round on `config/concepts/household.json` (צלחות, כפפות, נרות, ג'ל, מטליות, סבון).
Verified live with `categorize(name, conceptId)`, not with `data/products.json`'s `category` field (that field is
from the previous build - TRAPS.md #15).

I do not own `src/catalog/categorize.js` this round (shared file, several agents editing concepts in parallel) -
filing these instead of fixing them.

## 1. Disposable plates in singular form land in בית וכלים instead of ניקיון וטואלטיקה

`categorize.js`'s ניקיון וטואלטיקה word-rule lists the disposable-tableware word as plural **צלחות** only. A
decorated single-plate SKU is named with the singular **צלחת** ("טוסקנה **צלחת** 10' 10יח", not "טוסקנה
**צלחות** ..."), so it never matches that rule and falls through to `בית וכלים`'s own `צלחת` keyword instead -
housewares, not disposables.

| product | current dept (live) | correct dept | keyword |
|---|---|---|---|
| טוסקנה צלחת 10' 10יח | בית וכלים | ניקיון וטואלטיקה | singular `צלחת` not in the household word-list (only plural `צלחות` is) |
| אקולוגית צלחת 10' (25 יח') בסט וליו | בית וכלים | ניקיון וטואלטיקה | same |
| זהב צלחת 10' (20 יח') בסט וליו | בית וכלים | ניקיון וטואלטיקה | same |
| 16סט צלחת נוגה גרז8+10 | בית וכלים | ניקיון וטואלטיקה | same |

~150-170 products across the "בלה", "גלורי", "דניאלה", "הדר", "ספיר", "ונציה", "טוסקנה", "וליו", "נוגה", "כסף"
decorative party-plate lines fit this pattern (checked with `grep` against `data/products.json` category `בית
וכלים` for name containing `צלחת`/`צלחות` and no reusable-material word - the great majority are disposable
multi-packs, not reusable tableware). A parallel `כוס` (singular cup) gap likely exists too, same cause.

## 2. Real glass/porcelain plate sets pulled into ניקיון וטואלטיקה by an over-broad CONCEPT, not a categorize.js keyword

`config/concepts/general.json`'s existing `disposable-plates` concept (`all: ["צלחות"]`, `any: ["חד פעמי",
"קרטונ", "מהודרות", "סט", "פלסטיק"]`) matches on bare `סט` ("set") with no material guard. A `סט` word appears
on boxed reusable dishware too, so a real glass/porcelain plate set gets the `ניקיון וטואלטיקה` category via the
concept-override path (`categorize.js`'s `categorize()`: a matched concept's own `category` wins over the
word-rule outright).

| product | current dept (live) | correct dept | cause |
|---|---|---|---|
| סט צלחות אופאל איכותיות -זכוכית לבן טקסטורה פסים | ניקיון וטואלטיקה | בית וכלים | concept `disposable-plates` (general.json) matches via bare `סט`, no material (`זכוכית`) guard |
| סט צלחות פורצלן ענקיות+בינוניות שווה | ניקיון וטואלטיקה | בית וכלים | same |

I did **not** touch `general.json` (another agent owns it this round). My own new `plate-disposable-*` concepts
in `household.json` all carry a `none` guard against `זכוכית|מלמינ|פורצלנ|קרמיקה|חרסינה` for exactly this reason,
and additionally exclude `general.json`'s own trigger words (`חד פעמי`, `קרטונ`, `מהודרות`, `פלסטיק`, `סט `,
`סטאר`) so mine never doubles up with it (verified with `concept-round.mjs --diff`: zero new conflicts). The `סט`
guard on `disposable-plates` itself still needs narrowing by whoever owns `general.json`.

## 3. Sports energy gel lands in ניקיון וטואלטיקה

Household's word-rule includes bare `ג'?ל` (any product whose name contains "gel"). A running/sports energy gel
(the GU-style kind, sold in small flavoured sachets) is not a cleaning product.

| product | current dept (live) | correct dept | keyword |
|---|---|---|---|
| גל אנרגיה אספרסו 35 גרם | ניקיון וטואלטיקה | פארם ותוספים (or חטיפים וממתקים) | bare `ג'?ל` |
| גל אנרגיה פירות יער35גר | ניקיון וטואלטיקה | פארם ותוספים (or חטיפים וממתקים) | bare `ג'?ל` |

(A third listing, "ג\`ל אנרגיה אספרסו 32 גרם", already sits in `משקאות` - inconsistent with these two, another
sign this SKU family needs an explicit rule rather than falling through the generic `ג'ל` keyword.)

## 4. Eyebrow gel (makeup) lands in ניקיון וטואלטיקה instead of טיפוח ויופי

טיפוח ויופי's word-rule lists specific cosmetic words (`עפרון גבות`, `מעצב גבות`, ...) but not bare `ג'ל`/`גל`, so
"eyebrow gel" (a brow-styling cosmetic, same shelf as brow pencil) never reaches that rule and is caught by
household's bare `ג'?ל` first.

| product | current dept (live) | correct dept | keyword |
|---|---|---|---|
| גל גבות ואפקט סבון יח | ניקיון וטואלטיקה | טיפוח ויופי | bare `ג'?ל` (household) fires before beauty's cosmetic word-list, which has no bare `ג'ל`/`גבות גל` entry |
| גל גבות סופר עמיד | ניקיון וטואלטיקה | טיפוח ויופי | same |
| גל גבות שקוף01 | ניקיון וטואלטיקה | טיפוח ויופי | same |

7 products total in this cluster (`גל גבות ...`). I refused a household concept for all of them (no
`eyebrow-gel` concept written) - they need a `beauty.json` concept, not mine.

## 5. Facial cleansing gel (cosmetic) lands in ניקיון וטואלטיקה instead of טיפוח ויופי

Same bare-`ג'?ל` cause. These are face washes ("ניקוי פנים", "ניקוי בוקר", "לעור מעורב/שמן"), not toilet/surface
cleaners, even though they share the `ג'ל ניקוי` phrase with real toilet-bowl gel cleaners.

| product | current dept (live) | correct dept | keyword |
|---|---|---|---|
| ג'ל ניקוי פנים לעור יבש | ניקיון וטואלטיקה | טיפוח ויופי | bare `ג'?ל` |
| ג\`ל ניקוי פנים 150 מ\`ל | ניקיון וטואלטיקה | טיפוח ויופי | bare `ג'?ל` |
| גל ניקוי בוקר 150 מ"ל | ניקיון וטואלטיקה | טיפוח ויופי | bare `ג'?ל` |
| גל ניקוי לעור מעורב/שמן | ניקיון וטואלטיקה | טיפוח ויופי | bare `ג'?ל` |

I refused a household concept for these (no `facial-cleansing-gel` concept written) - the ~4-5 genuine
**toilet**-gel items in the same raw cluster ("ג'ל ניקוי לשירותים...") are the ones I did keep, by extending the
existing `toilet-cleaner` concept with a `שירותימ` alternative (see report).

## 6. Facial soap (cosmetic) lands in ניקיון וטואלטיקה instead of טיפוח ויופי

Bare `סבונ` in household's word-rule.

| product | current dept (live) | correct dept | keyword |
|---|---|---|---|
| סבון פנים 150 מל | ניקיון וטואלטיקה | טיפוח ויופי | bare `סבונ` |
| סבון פנים אובליפיחה 150 | ניקיון וטואלטיקה | טיפוח ויופי | bare `סבונ` |
| סבון פנים לעור יבש 200מל | ניקיון וטואלטיקה | טיפוח ויופי | bare `סבונ` |

8 products total (`סבון פנים ...`). Refused a household concept for all of them.

## 7. כפפות אלוורה להקלה על עור יבש (task callout)

`כפפות אלוורה להקלה על עור יבש` (aloe moisturising treatment gloves, cosmetic) sits in `ניקיון וטואלטיקה`. It is
not obviously mis-departmented the way 3-6 are (this department already legitimately carries some skincare -
`body-lotion`, `sunscreen`) - filing it as a **concept** finding rather than a department one: it needs no
household concept (refused, per instruction) and is a candidate for a `beauty.json` concept if the aloe-gloves
line has enough SKUs (checked: 4 size variants, 1 chain only, below the "3 products or 2 chains" bar on its own).

## Notes, not misroutes

- `אל סבון קמומיל`, `אל סבון`, shampoo, conditioner, mouthwash, toothbrush, baby-wipes items branded **בוב ספוג**
  (SpongeBob) were being pulled into the `sponge` concept by its bare `ספוג`/`ספוגי` match (no guard against the
  character name). Fixed in this round by adding `בוב`/`נרות` to `sponge`'s `none` - not a department issue, a
  concept-collision one, and it was cutting across 6 *other* concepts' territory (17 conflicts + 4 outright
  wrong single-matches resolved). Mentioned here because it surfaced while auditing the same `מטליות`/`ספוג`
  neighbourhood as this round's `מטליות` work.
- Checked for the mirror case (a ceramic/glass **כוס** wrongly pulled into `ניקיון וטואלטיקה`): none found. The
  reusable-cup department mis-space instead holds electric urns ("מיחם ... כוסות נירוסטה") - these already
  resolve correctly to `בית וכלים` live (`categorize()` tested directly), the `category` field in
  `data/products.json` is just stale for them (TRAPS.md #15) - not filed as a misroute.

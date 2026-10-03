/**
 * STEP 2 of "one product, many barcodes" (docs/ATTRS.md was step 1; this is step 2, docs/IDENTITY-MERGE.md):
 * an identity key built from the attrs step 1 publishes, an automatic merge for the clear cases, and a
 * review queue for the rest. Decided with Naor and the products session, 3.10/4.10.2026.
 *
 * This module is pure: every function takes plain data (raw per-gtin groups, a lexicon, a screen) and
 * returns plain data. scripts/build-products.mjs is the only caller that touches the filesystem or the
 * real config files; it builds the raw groups (groupItemsByGtin + projectProduct, BEFORE any gtin alias is
 * applied) and passes them here.
 *
 * ----------------------------------------------------------------------------------------------------------
 * THE RULE, in one page (full reasoning in docs/IDENTITY-MERGE.md):
 *
 * A CANDIDATE is two barcoded, non-weighed products with the same FINAL conceptId (after verified records
 * and config/products/concept-assignments.json - a null conceptId, decided or not, never clusters), the
 * same size (value/unit/count) and the same CONSUMER BRAND - a brand TOKEN read from the product's own
 * names via a lexicon (buildConsumerBrandLexicon below), never the chain `brand` FIELD (that field is the
 * distributor, docs/ATTRS.md §4 - Huggies wipes carry "על בד"/"קימברלי קלארק"/"עלבד משואות יצחק").
 *
 * "Same consumer brand" has three states per gtin (consumerBrandFor): a single TOKEN present in every one
 * of its full (non-truncated) chain names; NONE, when no lexicon word appears in any of them (the
 * product's name never names a brand at all - chocolate eggs, generic housewares); or AMBIGUOUS, when a
 * lexicon word appears in SOME of its full names but not all (a chain's name omits the brand the others
 * give it - this is exactly the Materna/MAM shape below). TOKEN only matches an equal TOKEN; NONE matches
 * NONE (both sides equally brandless is not evidence of a conflict); AMBIGUOUS matches nothing, not even
 * another AMBIGUOUS of the same apparent word - an uncertain brand reading is not a brand to compare.
 *
 * AUTO-MERGE a candidate pair only when ALL FOUR hold:
 *   1. attrs (src/catalog/attrs.js extractAttrs) read on both sides are the SAME KEYS with EQUAL values,
 *      and at least one key was actually read on both sides. An attr read on one side and absent on the
 *      other is a mismatch, not a pass - and so is reading NOTHING on either side (two identical, empty
 *      attrs objects are not evidence the products are the same, only that neither name says anything;
 *      5 chocolate-egg codes with identical blank names and identical prices do not auto-merge on "no
 *      evidence of difference" - they queue, per Naor/products session 4.10: "only an attr or a price
 *      difference can stop them; if neither does, they go to the queue, never auto").
 *   2. no chain lists both codes at a different price.
 *   3. the products session's sameProductScreen (scripts/alias-candidates.mjs, reused not copied) passes:
 *      each code sold by >=2 chains and the pair by >=3 total, and no chain name of one code carries a
 *      content word - digits included, prefix-tolerant - that no name of the other carries.
 *   4. each code sold by >=2 chains (this build's choice for the "or" the brief allows - a single-chain
 *      code paired with one sold by >=3 chains was considered and rejected: a single chain is also the one
 *      chain that could be publishing a stale/duplicate code for a reason the other three conditions can't
 *      see, e.g. two still-distinct SKUs that happen to look identical to only one retailer's feed).
 *
 * Everything that reaches candidacy (same conceptId+size+consumerBrand) and fails condition 1-4 for ANY
 * pair inside its cluster goes to the review queue as ONE "same-product" item for the whole cluster -
 * never a partial merge of "the pairs that happened to agree": docs/IDENTITY-MERGE.md §3 has the clique
 * reasoning. A cluster where every pair passes every condition merges as a whole (canonical = the member
 * sold by the most chains).
 */
import { normalizeText } from './matching.js';
import { normalizeBrandField, extractAttrs } from './attrs.js';
import { sameProductScreen } from '../../scripts/alias-candidates.mjs';
import { concepts as defaultConcepts } from './concepts.js';

// ---------------------------------------------------------------------------------------------------------
// Consumer-brand lexicon
// ---------------------------------------------------------------------------------------------------------

/** A name that is a true string PREFIX of a longer name for the SAME gtin is a chain's truncation, not a
 *  second opinion (docs/ATTRS.md rule 2, the same test attrs.js and pickConcept both apply) - it never
 *  votes for a lexicon token or a consumer-brand reading. Falls back to every name if that would leave
 *  none (a gtin whose every chain happens to truncate it to the same length is not thereby nameless). */
export function fullNames(names) {
  const clean = [...new Set((names ?? []).filter((n) => n && n.length > 2))];
  const full = clean.filter((n) => !clean.some((other) => other.length > n.length && other.startsWith(n)));
  return full.length ? full : clean;
}

/** Every normalized, non-filler, WHOLE brand-field value in the catalog (attrs.js normalizeBrandField,
 *  reused so "בע"מ"/"ישראל"/dangling punctuation never create a false distinction between a lexicon word
 *  and a brand-field value that is really the same word). Checking against the WHOLE field - not a word
 *  split out of it - is deliberate and measured on the real catalog (4.10): splitting "עוף טוב" (a real
 *  two-word brand, Of Tov) into words leaks "עוף" (bare "chicken", 0 gtins-as-a-brand-field on its own but
 *  13 chains' worth of a product's category word riding along inside someone else's brand field) and
 *  "טוב" ("good") into the seed set, which would then let every chicken product in the catalog vote
 *  "עוף" into the lexicon. Requiring the token to equal a field's full normalized value keeps the real
 *  single-word brands (האגיס, מטרנה, מילקה, מאם, פפסי, קולגייט, אסם, סנו - all measured present, §below)
 *  and drops the generic nouns that only ever show up as HALF of someone else's two-word field. */
export function wholeBrandFieldValues(rawBrandValues) {
  const out = new Set();
  for (const raw of rawBrandValues ?? []) {
    const norm = normalizeBrandField(raw);
    if (norm) out.add(norm);
  }
  return out;
}

/** Hard stop-list for the lexicon: pack/unit words (reusing scripts/alias-candidates.mjs's CONTENT_STOP
 *  ideas, docs/ALIASES.md) plus the handful of generic connector words that land in position 1-2 of a name
 *  constantly ("עם", "של", "ללא", "בטעם"...) and would otherwise need a brand-field match to be excluded
 *  too (they never get one, but excluding them up front keeps the candidate count down before that gate
 *  even runs). */
const GENERIC_WORDS = new Set([
  'עם', 'של', 'מן', 'ללא', 'בלי', 'נטול', 'נטולת', 'בטעם', 'טעם', 'ב', 'ו', 'ל', 'ה', 'מ', 'כ', 'ש',
  'מבצע', 'חדש', 'חדשה', 'מיוחד', 'מיוחדת', 'רגיל', 'רגילה', 'משפחתי', 'משפחתית', 'קלאסי', 'קלאסית',
  'מארז', 'חבילה', 'חבילת', 'אריזה', 'יחידה', 'יחידות', 'יח', 'זוג', 'סט',
]);

/** Tokens that only look brand-like by the position+frequency+concept-diversity test because they ARE the
 *  concept's own vocabulary, concentrated by definition in a narrow handful of concepts: "מגבונ"/"מגבוני"
 *  ("wipes") scores exactly like a brand on concept-diversity (it only ever means baby-wipes, so it
 *  "concentrates"), but it is the product category, not a manufacturer. Built once from every concept's
 *  `name` and `synonyms` (config/concepts/*.json via src/catalog/concepts.js) - the catalog's own authored
 *  vocabulary for "what this product TYPE is called", which is exactly the list a category-noun filter
 *  should be checked against rather than guessed at. `match.all/any` keywords are deliberately NOT pulled
 *  in here (a concept's match rules sometimes include a brand-specific keyword for disambiguation, e.g. a
 *  concept that excludes a private-label line by name, and pulling every one of those in risked excluding a
 *  real brand word over a single concept's internal exclusion). */
function conceptVocabulary(list) {
  const vocab = new Set();
  for (const c of list) {
    for (const phrase of [c.name, ...(c.synonyms ?? [])]) {
      for (const w of normalizeText(phrase ?? '').split(' ')) if (w.length >= 2) vocab.add(w);
    }
  }
  return vocab;
}

/** Prefix-tolerant membership (same idea as scripts/alias-candidates.mjs `covered`): a chain's truncation
 *  or a construct-state suffix ("מגבוני" vs a concept's own "מגבונים") must not dodge conceptVocabulary by
 *  a letter or two. Hebrew inflection is exactly why a bare Set.has() under-excludes here. */
function coveredByVocab(token, vocab) {
  for (const w of vocab) {
    if (w === token) return true;
    if (token.length >= 3 && w.length >= 3 && (w.startsWith(token) || token.startsWith(w))) return true;
  }
  return false;
}

/**
 * The lexicon (THE RULE above, docs/IDENTITY-MERGE.md §2): a token qualifies when (a) it occurs as the
 * first or second word of >= minProducts DISTINCT gtins spanning >= minChains distinct chains (one vote
 * per gtin regardless of how many of its own names repeat the word - a product with twelve chain names all
 * starting "האגיס" casts one vote, not twelve), (b) it is not in GENERIC_WORDS, and (c) it is not spread
 * across more than maxConcepts distinct conceptIds.
 *
 * (c) is the generic-noun filter, and measuring it mattered: the first version of this function gated on
 * "equals some product's whole normalized brand field" instead (closer to a literal reading of "the
 * products' own brand fields help seed it"), and it was wrong in both directions on the real catalog -
 * קוקה/קולה/מירינדה/סבן never appear as a chain's OWN brand-field value at all (Coca-Cola/Mirinda/7up
 * bottlers apparently leave that field blank or fill it with a legal entity name - the exact distributor-
 * not-brand problem docs/ATTRS.md §4 already documents for that field), so that gate silently dropped four
 * of the eight required aliases into the brandless "none" bucket, where they then pooled - WRONGLY - with
 * every OTHER unbranded same-size, same-concept product and failed as an oversized, non-matching cluster
 * (measured: 0 merges catalog-wide, including the one pair, Diet Coke, that otherwise passes clean). Concept
 * diversity does not have this blind spot, because it asks a name question instead of a field question: a
 * brand concentrates in a handful of concepts (קוקה: 4, קולה: 6, פפסי: 3, מירינדה: 3, מילקה: 9, האגיס: 4,
 * מטרנה: 6, קולגייט: 4 - all measured on the real catalog), while a category noun spans dozens regardless of
 * how the brand field happens to be filled (עופ/"chicken": 59, אסמ/Osem the umbrella manufacturer: 38, סנו:
 * 47, מארז/"pack": 203, חלב/"milk": 39, בשר/"meat": 38, שוקולד/"chocolate": 39). maxConcepts=10 keeps every
 * measured real brand (מילקה's 9 is the widest) and lets through one measured false positive (טוב, "good",
 * at 9 - half of "עוף טוב"/Of-Tov, a real two-word brand whose second word alone is also just an adjective)
 * out of the words checked - an acceptable, documented imprecision given the alternative was losing four of
 * the eight target aliases outright. A brand-field cross-check is still computed and reported (not gated
 * on) at the end of this function, in the spirit of "the products' own brand fields help seed it".
 *
 * `entries`: one per raw gtin, `{ gtin, names, conceptId }` where `names` is every chain's raw name for
 * that gtin (duplicates fine - deduped internally, and run through fullNames() first so a truncated chain
 * name never casts its own vote alongside the fuller name it was cut from).
 */
export function buildConsumerBrandLexicon(entries, { brandFieldWholeValues, minProducts = 10, minChains = 3, maxConcepts = 10 } = {}) {
  const gtinsOf = new Map(); // token -> Set(gtin)
  const chainsOf = new Map(); // token -> Set(chain) - chain carried on entries[i].named when available
  const conceptsOf = new Map(); // token -> Set(conceptId | '∅')
  for (const { gtin, names, named, conceptId } of entries) {
    const seenHere = new Set();
    for (const name of fullNames(names)) {
      const words = normalizeText(name).split(' ').filter((w) => w.length >= 2);
      for (const w of words.slice(0, 2)) seenHere.add(w);
    }
    for (const w of seenHere) {
      if (!gtinsOf.has(w)) gtinsOf.set(w, new Set());
      gtinsOf.get(w).add(gtin);
      if (!conceptsOf.has(w)) conceptsOf.set(w, new Set());
      conceptsOf.get(w).add(conceptId ?? '∅');
    }
    if (named?.length) {
      const full = fullNames(names);
      for (const { chain, name } of named) {
        if (!full.includes(name)) continue;
        const words = normalizeText(name).split(' ').filter((wd) => wd.length >= 2).slice(0, 2);
        for (const w of words) {
          if (!chainsOf.has(w)) chainsOf.set(w, new Set());
          chainsOf.get(w).add(chain);
        }
      }
    }
  }
  const vocab = conceptVocabulary(defaultConcepts());
  // A bare number ("15", "24%") or a number glued to a short unit letter ("500ג", "330גר") is a size, not a
  // brand - normalizeText glues the unit onto the digits with no space ("500 גר" -> tokens "500" "גר" are
  // already two words, but a chain that omits the space, "500ג", survives as one token here).
  const NUMERIC_RE = /^[\d.]+%?[א-ת]{0,3}$/;
  const lexicon = new Set();
  let brandFieldOverlap = 0;
  for (const [token, gtins] of gtinsOf) {
    if (token.length < 3) continue; // "בי", "ל", "קר" - too short to be a confident brand reading
    if (NUMERIC_RE.test(token)) continue; // a size/percentage, never a brand
    if (GENERIC_WORDS.has(token) || coveredByVocab(token, vocab)) continue;
    if (gtins.size < minProducts) continue;
    if ((chainsOf.get(token)?.size ?? 0) < minChains) continue;
    if ((conceptsOf.get(token)?.size ?? Infinity) > maxConcepts) continue;
    lexicon.add(token);
    if (brandFieldWholeValues?.has(token)) brandFieldOverlap++;
  }
  lexicon.brandFieldOverlap = brandFieldOverlap; // reporting only, see the module doc above
  return lexicon;
}

/**
 * Three-state consumer-brand reading for one gtin (docs/IDENTITY-MERGE.md §2): TOKEN when exactly one
 * lexicon word is present in EVERY full name (several equally-qualifying words present everywhere are
 * joined, sorted, with "+" into one deterministic value); NONE when no lexicon word appears in ANY full
 * name (genuinely brandless, like a product category with no named manufacturer); AMBIGUOUS when a
 * lexicon word appears in SOME full names and not others (one chain's name omits the brand the rest give
 * it - never guessed, never silently resolved to majority, because that is indistinguishable from the gap
 * actually mattering).
 */
export function consumerBrandFor(names, lexicon) {
  const full = fullNames(names);
  if (!full.length || !lexicon.size) return { state: 'none', value: null };
  const perName = full.map((n) => new Set(normalizeText(n).split(' ').filter((w) => lexicon.has(w))));
  const union = new Set();
  for (const s of perName) for (const w of s) union.add(w);
  if (!union.size) return { state: 'none', value: null };
  let intersection = null;
  for (const s of perName) {
    intersection = intersection === null ? new Set(s) : new Set([...intersection].filter((w) => s.has(w)));
  }
  if (intersection.size) return { state: 'token', value: [...intersection].sort().join('+') };
  return { state: 'ambiguous', value: [...union].sort().join('+') };
}

// ---------------------------------------------------------------------------------------------------------
// identityKey
// ---------------------------------------------------------------------------------------------------------

/**
 * Pure identity key (also exported for scripts/index-query.mjs and tests, per the brief). `product` needs
 * `conceptId`, `size` ({value,unit,count}) and `gtin`/`kind`/`isWeighted` so a weighed or concept "product"
 * (never barcoded, never mergeable this way) is correctly excluded. `consumerBrand` is the SAME-SHAPED
 * result consumerBrandFor() returns - `null` or an AMBIGUOUS reading is "no key" (the caller must not
 * cluster an ambiguous-brand gtin with anything, not even another ambiguous one).
 *
 * `conceptId: null` (THE RULE's "final conceptId, after records and assignments... a record or assignment
 * with conceptId: null means 'no concept, decided': that product must not merge on a heuristic concept")
 * is two different things scripts/build-products.mjs projectProduct's final conceptId cannot by itself
 * tell apart, which is why it also carries `conceptIdDecided`:
 *   - DECIDED null (`conceptIdDecided: true`, a verified record explicitly said `"conceptId": null`) -
 *     a person looked and said this product has no concept; never cluster it on one. Returns null.
 *   - UNRESOLVED null (`conceptIdDecided: false`, the common case - no concept rule matched, no verified
 *     record and no config/products/concept-assignments.json entry exist for this gtin at all) is not a
 *     decision, only a gap in the concept taxonomy - two gtins that are both unresolved, the same size and
 *     the same (or equally absent) consumer brand are not thereby forbidden from being candidates (this is
 *     exactly the chocolate-eggs case: "שלישיית ביצי שוקולד" matches no concept and never will without one
 *     being authored, but that silence says nothing about whether the five barcodes are one product or
 *     five). Keyed under a fixed sentinel instead of the (absent) conceptId.
 */
const NO_CONCEPT_SENTINEL = '∅concept';
export function identityKey(product, consumerBrand) {
  if (!product || product.kind === 'concept' || !product.gtin || product.isWeighted) return null;
  if (!product.size) return null;
  if (!product.conceptId && product.conceptIdDecided) return null; // decided null - never a heuristic key
  if (!consumerBrand || consumerBrand.state === 'ambiguous') return null;
  const { value, unit, count } = product.size;
  const brandPart = consumerBrand.state === 'token' ? consumerBrand.value : '∅brand'; // NONE sentinel
  const conceptPart = product.conceptId ?? NO_CONCEPT_SENTINEL;
  return `${conceptPart}::${value}|${unit}|${count ?? 1}::${brandPart}`;
}

// ---------------------------------------------------------------------------------------------------------
// The four auto-merge conditions
// ---------------------------------------------------------------------------------------------------------

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Condition 1: same attrs keys read on both sides (extractAttrs output, src/catalog/attrs.js), every
 *  value equal, and at least one key actually read - an attr read on one side and absent on the other is
 *  a mismatch (never a pass), and so is "neither side read anything" (absence of evidence is not evidence
 *  of sameness - the chocolate-egg case, docs/IDENTITY-MERGE.md). */
/** Keys whose agreement counts as the "at least one key" positive evidence the brief's egg clarification
 *  requires (see checkAttrsCondition). `flavour`/`diet` are SET/union readings (docs/ATTRS.md rule 3): a
 *  word belonging to the product's own invariant base name routinely lands in them - "שלישיית ביצי שוקולד"
 *  (chocolate eggs) reads flavour: ["שוקולד"] on every one of its five barcodes identically, which is not
 *  evidence any TWO of those barcodes are the same physical item, only that the shared vocabulary found
 *  the word "chocolate" in a name that says "chocolate eggs" on all of them - exactly the kind of harmless
 *  but non-discriminating token docs/ATTRS.md §7 already documents for this same mechanism (the "ניחוח גן
 *  עדן" stray tokens). The scalar keys (state/form/container/scent/code) do not have this failure mode -
 *  each is read from a specific marker word that is genuinely optional in a name, not restating the
 *  product category - so they are the ones allowed to supply the "something was actually checked and
 *  agreed" evidence a merge needs. `flavour`/`diet` still have to be EQUAL when either side read them
 *  (a real conflict there still blocks a merge, via the loop below) - they just cannot be the ONLY reason
 *  two codes merge. */
const SCALAR_EVIDENCE_KEYS = new Set(['state', 'form', 'container', 'scent', 'code']);

export function checkAttrsCondition(attrsA, attrsB) {
  const keysA = Object.keys(attrsA ?? {}).sort();
  const keysB = Object.keys(attrsB ?? {}).sort();
  if (keysA.length !== keysB.length || !keysA.every((k, i) => k === keysB[i])) {
    return { ok: false, detail: `attrs keys differ: {${keysA.join(',')}} vs {${keysB.join(',')}}` };
  }
  if (!keysA.some((k) => SCALAR_EVIDENCE_KEYS.has(k))) {
    return { ok: false, detail: keysA.length ? `only soft evidence read (${keysA.join(',')}), no scalar attr - not enough to merge on` : 'no attrs read on both sides (no positive evidence)' };
  }
  for (const k of keysA) {
    if (!deepEqual(attrsA[k], attrsB[k])) return { ok: false, detail: `attrs.${k} differs: ${JSON.stringify(attrsA[k])} vs ${JSON.stringify(attrsB[k])}` };
  }
  return { ok: true, detail: `attrs equal: ${JSON.stringify(attrsA)}` };
}

/** Condition 2: no chain sells both codes at a different price (a small float epsilon for rounding). */
export function checkPriceCondition(pricesA, pricesB) {
  for (const [chain, priceA] of pricesA) {
    if (!pricesB.has(chain)) continue;
    const priceB = pricesB.get(chain);
    if (Math.abs(priceA - priceB) > 0.01) return { ok: false, detail: `${chain}: ${priceA} vs ${priceB}` };
  }
  return { ok: true, detail: null };
}

/** Condition 3: the products session's screen (scripts/alias-candidates.mjs sameProductScreen), reused
 *  verbatim - chain-count floor plus the prefix-tolerant content-word check, digits included. */
export function checkScreenCondition(groupA, groupB) {
  const why = sameProductScreen(
    { gtin: groupA.gtin, name: groupA.names[0] ?? '' },
    { gtin: groupB.gtin, name: groupB.names[0] ?? '' },
    groupA.chainPrices, groupB.chainPrices,
    new Map([[groupA.gtin, groupA.names], [groupB.gtin, groupB.names]]),
  );
  return why ? { ok: false, detail: why } : { ok: true, detail: null };
}

/** Condition 4 (the brief's "or", resolved this build's way - see the module doc for why): each code sold
 *  by >= 2 chains. */
export function checkChainCountCondition(groupA, groupB) {
  const a = groupA.chainPrices.size;
  const b = groupB.chainPrices.size;
  if (a >= 2 && b >= 2) return { ok: true, detail: `${a} + ${b} chains` };
  return { ok: false, detail: `single-chain code (${a} vs ${b} chains)` };
}

/** attrs.brand (src/catalog/attrs.js) is read from the chain `brand` FIELD by majority - the distributor,
 *  not the consumer brand (docs/ATTRS.md §4; the brief: "identity must NOT rely on that field"). Measured
 *  directly on Coca-Cola Zero (7290110115227/7290110115869, the required-to-find case): one code's
 *  majority brand field is "קוקה קולה", the other's is "החברה המרכזית לייצור משק" (a legal company name a
 *  different chain happens to fill in) - same product, two unrelated-looking field values. Condition 1
 *  compares attrs EXCLUDING `brand` for exactly this reason; the brand question for identity is answered
 *  entirely by the name-lexicon consumerBrand used for candidacy, never by this key. */
const withoutBrandKey = (attrs) => { const { brand, ...rest } = attrs ?? {}; return rest; };

/** attrs, without `brand` (see withoutBrandKey), for one raw group - computed once per gtin by the caller
 *  (identityMergeCandidates) and reused across every pair that gtin appears in, instead of recomputing
 *  extractAttrs() (regex-heavy) once per PAIR. A cluster of N members has N*(N-1)/2 pairs but only N attrs
 *  reads - for a 14-member cluster that is 14 reads instead of 182, measured as the dominant cost of this
 *  step before the fix (4.10). */
export function attrsFor(group) {
  return withoutBrandKey(extractAttrs(group.names, { brandField: group.brandField, conceptId: group.conceptId }).attrs);
}

/** All four conditions for one pair, in order, stopping at the first failure (so the caller can report
 *  exactly which one blocked a given pair - the measurement the brief asks for). `attrsA`/`attrsB` may be
 *  passed in (precomputed, see attrsFor) - computed on demand otherwise, for callers (and tests) checking
 *  a single pair in isolation. */
export function evaluateAutoMergePair(groupA, groupB, { attrsA = attrsFor(groupA), attrsB = attrsFor(groupB) } = {}) {
  const steps = [
    ['attrs', checkAttrsCondition(attrsA, attrsB)],
    ['price', checkPriceCondition(groupA.chainPrices, groupB.chainPrices)],
    ['screen', checkScreenCondition(groupA, groupB)],
    ['chains', checkChainCountCondition(groupA, groupB)],
  ];
  for (const [name, result] of steps) if (!result.ok) return { ok: false, failedCondition: name, detail: result.detail, attrsA, attrsB };
  return { ok: true, failedCondition: null, detail: null, attrsA, attrsB };
}

// ---------------------------------------------------------------------------------------------------------
// Clustering and the merge/queue decision
// ---------------------------------------------------------------------------------------------------------

/** How many SERVED chains (shufersal/ramilevy/carrefour/yochananof/hazihinam/victory/osherad, the brief's
 *  own list) would gain a price if this cluster merged - the union of every member's chains, minus
 *  whichever single member already has the most (that member's shopper already sees a price; everyone
 *  else's chain is the gain). Used to rank review-queue priority by impact. */
const SERVED_CHAINS = ['shufersal', 'ramilevy', 'carrefour', 'yochananof', 'hazihinam', 'victory', 'osherad'];
function chainsGained(members) {
  const byChains = [...members].sort((a, b) => b.chainPrices.size - a.chainPrices.size);
  const already = new Set(byChains[0]?.chainPrices.keys() ?? []);
  const union = new Set();
  for (const m of members) for (const c of m.chainPrices.keys()) union.add(c);
  let gained = 0;
  for (const c of SERVED_CHAINS) if (union.has(c) && !already.has(c)) gained++;
  return gained;
}

/**
 * Clusters `rawGroups` (one entry per raw, pre-alias gtin - see scripts/build-products.mjs groupItemsByGtin
 * + projectProduct) by identityKey, then resolves each cluster of >= 2 members: AUTO-MERGE the whole
 * cluster when every pair inside it passes all four conditions (a clique, not a spanning tree - a partial
 * agreement is not "this cluster is one product", docs/IDENTITY-MERGE.md §3); otherwise queue the whole
 * cluster as one "same-product" review item, priority by `chainsGained`.
 *
 * `rawGroups[i]` shape: `{ gtin, conceptId, size, category, names, named, brandField, chainPrices }` -
 * `chainPrices` a `Map(chain -> cheapest price)`, `named` `[{chain, name}]`, `names`/`brandField` parallel
 * flat arrays (every chain's raw name / raw brand field for the gtin, duplicates fine).
 *
 * Returns `{ lexicon, clusters, merges, queueItems, stats }`. `merges`: one entry per auto-merged cluster,
 * `{ canonical, aliases: [...], why, members, pairResults }`. `queueItems`: review-queue entries, kind
 * `"same-product"`, one per non-merged cluster of >= 2.
 */
export function identityMergeCandidates(rawGroups, { lexicon: givenLexicon, verifiedConflicts = () => null } = {}) {
  const brandFieldWholeValues = wholeBrandFieldValues(rawGroups.flatMap((g) => g.brandField ?? []));
  const lexicon = givenLexicon ?? buildConsumerBrandLexicon(rawGroups.map((g) => ({ gtin: g.gtin, names: g.names, named: g.named, conceptId: g.conceptId })), { brandFieldWholeValues });

  const byKey = new Map(); // identityKey -> [group]
  const consumerBrandByGtin = new Map();
  let noneCount = 0, tokenCount = 0, ambiguousCount = 0;
  for (const g of rawGroups) {
    const cb = consumerBrandFor(g.names, lexicon);
    consumerBrandByGtin.set(g.gtin, cb);
    if (cb.state === 'none') noneCount++; else if (cb.state === 'token') tokenCount++; else ambiguousCount++;
    const key = identityKey(g, cb);
    if (!key) continue;
    (byKey.get(key) ?? byKey.set(key, []).get(key)).push(g);
  }

  const merges = [];
  const queueItems = [];
  let pairsChecked = 0;
  const failedConditionCounts = { attrs: 0, price: 0, screen: 0, chains: 0 };
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    const pairResults = [];
    let allOk = true;
    const attrsByMember = members.map((m) => attrsFor(m)); // once per gtin, not once per pair - see attrsFor
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        pairsChecked++;
        const r = evaluateAutoMergePair(members[i], members[j], { attrsA: attrsByMember[i], attrsB: attrsByMember[j] });
        pairResults.push({ a: members[i].gtin, b: members[j].gtin, ...r });
        if (!r.ok) { allOk = false; failedConditionCounts[r.failedCondition]++; }
      }
    }
    if (allOk) {
      const sorted = [...members].sort((a, b) => b.chainPrices.size - a.chainPrices.size || a.gtin.localeCompare(b.gtin));
      const canonical = sorted[0];
      const aliases = sorted.slice(1);
      merges.push({
        canonical: canonical.gtin,
        aliases: aliases.map((a) => a.gtin),
        why: `identity merge: same conceptId (${canonical.conceptId}), size and consumer brand; ${aliases.length + 1} codes, ${pairResults.length} pair(s) all passed attrs/price/screen/chains`,
        members: members.map((m) => ({ gtin: m.gtin, chains: [...m.chainPrices.keys()], category: m.category })),
        pairResults,
      });
    } else {
      queueItems.push({
        id: members[0].gtin, // placeholder id; the caller (build-products.mjs) rewrites to the canonical-to-be once products.json ids exist
        name: members.map((m) => m.names[0]).join(' / '),
        category: members[0].category ?? null,
        conceptId: members[0].conceptId ?? null,
        chains: [...new Set(members.flatMap((m) => [...m.chainPrices.keys()]))].length,
        names: members.flatMap((m) => (m.named ?? []).map((n) => `${n.chain}: ${n.name}`)),
        checks: [{
          rule: 'same-product',
          priority: chainsGained(members) > 0 ? 'high' : 'low',
          detail: `gtins ${members.map((m) => `${m.gtin} (${[...m.chainPrices.entries()].map(([c, p]) => `${c}:${p}`).join(', ')})`).join(' | ')}; ${pairResults.filter((p) => !p.ok).map((p) => `${p.a}/${p.b}: ${p.failedCondition} - ${p.detail}`).join('; ')}`,
          suggestion: null, // never decided automatically - a human reads `detail` and writes "merge" or "keep apart" with the reason
        }],
      });
    }
  }

  return {
    lexicon,
    clusters: byKey,
    merges,
    queueItems,
    consumerBrandByGtin,
    stats: { lexiconSize: lexicon.size, candidates: rawGroups.length, clustersFound: [...byKey.values()].filter((m) => m.length >= 2).length, pairsChecked, mergedClusters: merges.length, queuedClusters: queueItems.length, noneCount, tokenCount, ambiguousCount, failedConditionCounts },
  };
}

// ---------------------------------------------------------------------------------------------------------
// Per-id config files follow the alias map (coordinator note, 4.10)
// ---------------------------------------------------------------------------------------------------------

/**
 * "EVERY per-id file follows the alias map, not only verified.json": config/products/verified.json,
 * config/categories/labels.json (category), config/categories/names.json (display name) and
 * config/products/concept-assignments.json (conceptId) are all keyed by product id (`g<gtin>`), and a
 * canonical's alias id(s) - whether from config/products/aliases.json or this module's own identity
 * aliases - are gtins that NEVER get their own product in the final build (applyGtinAliases folds their
 * rows into the canonical before buildProducts ever groups by gtin), so an entry pinned to an alias id was
 * previously just dead: nothing ever looked it up. This function makes it apply through the alias.
 *
 * Per field (category/conceptId/name/size): collect the canonical's own decided value (if any) and every
 * alias's decided value (if any) from the SAME source kind (verified over label/name/assignment, matching
 * each field's normal precedence). Complementary fields - one side states a field the other is silent on -
 * are merged with no fuss (THE RULE: "~4,700 records are category-only"). Two DECIDED values for the SAME
 * field that disagree are never silently resolved - not even by "the canonical wins", because the
 * canonical's own value might just be whatever a heuristic picked, not a decision - so a disagreement is
 * reported as a conflict and the field is left exactly as the normal pipeline already computed it.
 *
 * `decided(id)` must return `{ category?, conceptId?, name?, size? }` with ONLY the keys that id has an
 * actual decision for (a verified record's field, a labels.json entry's category, a names.json entry's
 * name, or a concept-assignments.json entry's conceptId) - never a guessed/heuristic value.
 */
export function inheritPerIdRecords(canonicalId, aliasIds, decided) {
  const FIELDS = ['category', 'conceptId', 'name', 'size'];
  const canonicalDecided = decided(canonicalId) ?? {};
  const patch = {};
  const conflicts = [];
  for (const field of FIELDS) {
    const fromAliases = []; // { id, value }
    for (const aliasId of aliasIds) {
      const rec = decided(aliasId) ?? {};
      if (Object.prototype.hasOwnProperty.call(rec, field)) fromAliases.push({ id: aliasId, value: rec[field] });
    }
    const canonicalHas = Object.prototype.hasOwnProperty.call(canonicalDecided, field);
    const canonicalValue = canonicalDecided[field];
    // Do every decided value (canonical included, when it has one) agree?
    const all = canonicalHas ? [{ id: canonicalId, value: canonicalValue }, ...fromAliases] : fromAliases;
    if (all.length < 2) {
      // At most one opinion exists; nothing to reconcile. If the canonical itself is silent and exactly
      // one alias decided the field, the canonical inherits it (THE RULE: "the canonical inherits a
      // record held by either side").
      if (!canonicalHas && fromAliases.length === 1) patch[field] = fromAliases[0].value;
      continue;
    }
    const distinctValues = [...new Set(all.map((a) => JSON.stringify(a.value)))];
    if (distinctValues.length === 1) {
      if (!canonicalHas) patch[field] = all[0].value; // everyone agrees; fill the canonical's gap
      continue; // already agrees or now patched - nothing to queue
    }
    // Real disagreement: no silent winner. Leave the field as the normal pipeline already computed it.
    conflicts.push({ field, canonicalId, canonicalValue: canonicalHas ? canonicalValue : null, values: all });
  }
  return { patch, conflicts };
}

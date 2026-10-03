#!/usr/bin/env node
/**
 * Build the unified product catalog and the slim per-chain catalogs from the downloaded price files.
 *
 *   node scripts/fetch-prices.mjs            # data/prices/<chain>/catalog.full.json (git-ignored)
 *   node scripts/online-prices.mjs           # data/prices/<chain>/online.json (optional overlays)
 *   node scripts/build-products.mjs [--min-chains 3] [--max 6000]
 *
 * Writes:
 *   data/products.json          products sold by at least --min-chains chains (matched by GTIN), with a
 *                               category derived from keyword rules, the most common name and the median price
 *   data/catalogs/<chain>.json  each chain's items for those products only, so the app ships a few MB
 *                               instead of the full 15k-item files. Prices come ONLY from the published
 *                               online-store file; an online.json overlay (storefront API) verifies
 *                               them, marks stock and adds images. It is never a price source.
 *   data/catalogs/demo.json     demo store catalog regenerated for the new product set
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, statSync, mkdirSync } from 'node:fs';
import { readPipelineStatus as readStatusFile, writePipelineStatus as writeStatusFile } from './lib/pipelineStatus.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCatalog } from '../src/catalog/seedCatalogs.js';
import { isPrivateLabel } from '../src/catalog/privateLabel.js';
import { categorize, CATEGORIES, ICONS, DEPARTMENT_SLUGS, OTHER_DEPARTMENT_SLUG, OTHER_DEPARTMENT_NAME, departmentSlug, FOOD_CATEGORIES } from '../src/catalog/categorize.js';
import { categoryLabel, displayName } from '../src/catalog/categoryLabels.js';
export { categorize, CATEGORY_RULES, DEPARTMENT_SLUGS, OTHER_DEPARTMENT_SLUG, OTHER_DEPARTMENT_NAME, departmentSlug } from '../src/catalog/categorize.js';
import { normalizeText } from '../src/catalog/matching.js';
import { isGtin } from '../src/catalog/priceXml.js';
import { concepts as defaultConcepts, assignConcept, conceptById, conceptFiles, hasFlavourMarker, resolveFamily, CONCEPTS_DIR, INDEX_FILE, TYPE_WORDS_FILE } from '../src/catalog/concepts.js';
import { verifiedRecord, applyVerified } from '../src/catalog/verified.js';
import { conceptAssignment } from '../src/catalog/conceptAssignments.js';
import { parseSize } from '../src/catalog/size.js';
import { loadSalIsraelConfig } from '../src/basket/salIsraelConfig.js';

/** "הסל של ישראל" (config/sal-israel.json) gtins that must always make it into products.json, even
 *  sold by fewer than --min-chains chains (docs/SAL-ISRAEL.md) - tolerant of a missing/empty config,
 *  since the daily build must not fail before the basket list exists or if it is ever deleted. Includes
 *  every barcode of every line (`gtins`, not just the primary `gtin`): a chain that only sells a
 *  secondary size/stage variant must still get that line into its catalog. */
function loadSalIsraelGtins() {
  try {
    const cfg = loadSalIsraelConfig();
    return new Set((cfg.products ?? []).flatMap((p) => p.gtins ?? [p.gtin]));
  } catch {
    return new Set();
  }
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRICES = path.join(ROOT, 'data', 'prices');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i === -1 ? def : argv[i + 1]; };
// No product is excluded (Naor, 23.9): a chain that gives a product its own barcode and its own name
// does it so the price cannot be compared, and making it comparable is the job. So one chain is enough
// (--min-chains 1) and there is no cap (--max Infinity); both flags still work for a smaller local build.
// The size this creates is answered by the department shards (§2.1.1), not by hiding products: ~48,000
// products, products.json ~21 MB, the largest shard ~4.4 MB and 346 KB on the wire.
const MIN_CHAINS = Number(opt('min-chains', 1));
const MAX = Number(opt('max', Infinity));
// products.json is no longer the file a consumer downloads (the shards are), so this only flags a build
// that grew unexpectedly; the per-shard warning below is the one that tracks what is actually fetched.
const MAX_PRODUCTS_JSON_BYTES = 24 * 1024 * 1024;
const PIPELINE_STATUS_PATH = path.join(ROOT, 'data', 'pipeline-status.json');
// Department shards (docs/PIPELINE-CONTRACT.md §2.1.1, decision 23.9): products.json is about to grow past
// what a cold consumer should have to download whole, so build-products additionally writes one file per
// department under data/products/ plus data/products-index.json describing them. products.json itself is
// unchanged and stays the contract's authoritative surface until a versioned change removes it.
const PRODUCTS_DIR = path.join(ROOT, 'data', 'products');
const PRODUCTS_INDEX_PATH = path.join(ROOT, 'data', 'products-index.json');
const MAX_SHARD_BYTES = 4 * 1024 * 1024; // per-shard warning: the size a consumer actually downloads

/** Reader/writer for `data/pipeline-status.json`, on top of the shared module the fetcher writes with
 * (scripts/lib/pipelineStatus.mjs, docs/PIPELINE-CONTRACT.md §2.4). Two differences kept on purpose:
 * a missing or unparsable file reads as `null` here (the build then treats every chain as "ok",
 * exactly as before the file existed, and never creates the file itself - only the fetcher does), and
 * the argument order matches the build's tests. */
export function readPipelineStatus(filePath = PIPELINE_STATUS_PATH) {
  if (!existsSync(filePath)) return null;
  const status = readStatusFile(filePath); // an unparsable file reads as empty there; here it is "no status", like a missing one
  return status.runAt == null && !Object.keys(status.chains).length ? null : status;
}
export function writePipelineStatus(status, filePath = PIPELINE_STATUS_PATH) {
  writeStatusFile(filePath, status);
}

/** A chain whose catalog.full.json disappeared entirely (not merely stale - see `fetchStatus` on
 * slimCatalog for that case) is "missing" (decision 22.9, docs/PLAN-PER-CHAIN-AND-PRICE-HISTORY.md §A2).
 * Marks each of `missingChainIds` as status "missing" in the pipeline-status object, preserving
 * whatever else was recorded for it (sourceDate of the last good file, attempts, error...). Returns
 * `status` unchanged (including `null`, when no status file exists yet) if there is nothing to mark -
 * build-products never creates the status file itself, only updates one A1 already wrote. */
export function markChainsMissing(status, missingChainIds) {
  if (!status || !missingChainIds.length) return status;
  const chains = { ...(status.chains ?? {}) };
  for (const id of missingChainIds) chains[id] = { ...(chains[id] ?? {}), status: 'missing' };
  return { ...status, chains };
}

/** Private-label family heads (docs/CONCEPTS.md §3): sibling chains sharing one storefront/brand
 *  report under the family's lead chain id so `privateLabelOf` never fragments across them. */
const FAMILY_HEAD = { ybitan: 'carrefour', quik: 'carrefour', yochananof_b: 'yochananof' };
const familyHead = (chainId) => FAMILY_HEAD[chainId] ?? chainId;

/** Chains decorate a name on promotion ("*מבצע* נוזל אגוזי קו") and the decoration is counted against the
 * ~20-character limit, so it eats the tail: "קוקוס" survives as "קו", and a coconut drink reads as a nut.
 * 523 names carry it today. Stripping it leaves the plain truncation, which pickConcept already knows to
 * distrust when a fuller name exists. */
const PROMO_PREFIX = /^[\s*]*מבצע[\s*]*/;
const cleanName = (s) => String(s ?? '').replace(PROMO_PREFIX, '').replace(/^[\s*#!.-]+/, '').replace(/\s+/g, ' ').replace(/["']+$/g, '').trim();
/** Best display name: the most common one, preferring reasonably long names over truncated ones.
 * Data quirk: about half the chains truncate names to ~20 characters, so a short name that is an
 * exact prefix of a longer one is usually the same product with its tail cut off, not a different
 * item. When the two occur with similar frequency (neither swamps the other), the untruncated,
 * longer name wins even if it is not the single most frequent string. */
const bestName = (names) => {
  const c = new Map();
  for (const n of names) if (n && n.length > 2) c.set(n, (c.get(n) ?? 0) + 1);
  const entries = [...c.entries()].map(([n, count]) => ({ n, count, score: count * 10 + Math.min(n.length, 40) }));
  const similarFrequency = (a, b) => Math.abs(a.count - b.count) <= Math.max(a.count, b.count) * 0.5;
  entries.sort((a, b) => {
    if (similarFrequency(a, b)) {
      if (b.n.length > a.n.length && b.n.startsWith(a.n)) return 1;
      if (a.n.length > b.n.length && a.n.startsWith(b.n)) return -1;
    }
    return b.score - a.score;
  });
  return entries[0]?.n ?? null;
};
/** One vote per chain FAMILY for each name, not one per chain. Sibling chains share a storefront and publish the
 * same names - carrefour, ybitan and quik; yochananof and its pickup sub-chain - so counting them separately let a
 * family outvote every other chain with its own worst name. On 28.9 a Yoplait 8-pack that Rami Levy and Victory
 * name "יופלה ... מעודן" was shown as "מאגדת 8*150גרם גביעי", the generic truncated name both Yochananof chains
 * give it, and because of "גביעי" it sat in בית וכלים with no concept. A family counts each distinct name once. */
const familyVotes = (named) => {
  const seenPair = new Set();
  const out = [];
  for (const { chain, name } of named) {
    const key = `${familyHead(String(chain).split(':')[0])}|${name}`;
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    out.push(name);
  }
  return out;
};
const median = (nums) => { const a = nums.filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const mode = (values) => { const c = new Map(); for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] ?? null; };

/** Size (docs/CONCEPTS.md §3) is computed from every name the barcode has across chains, not only
 * the chosen display name - a truncated chain's name often lost the size/unit entirely.
 *
 * The vote is on the TOTAL a package holds, not on how a name spells it: "10*30 גר", "300 גרם" and "300 גר"
 * are one box of Choketa cakes, and voting on {value, count} split them three ways and let the one chain that
 * wrote "300 גרם מארז עשירייה" (read as ten times 300) win - a 3 kg box (28.9). Names vote once per chain family,
 * like the display name. A tie goes to the size in the name the shopper reads (one chain's "15 קג" typo tied
 * with "1.5 ק"ג" and won on being the longer name), then to the longest name. Inside the winning total, the
 * spelling most names use. */
const pickSize = (names, shownName = null) => {
  const totalKey = (s) => `${s.value * (s.count || 1)}|${s.unit}`;
  const byTotal = new Map();
  for (const n of names) {
    const size = parseSize(n);
    if (!size) continue;
    const entry = byTotal.get(totalKey(size)) ?? { votes: 0, longest: 0, spellings: new Map() };
    entry.votes++;
    entry.longest = Math.max(entry.longest, n.length);
    const spelling = `${size.value}|${size.count}`;
    const s = entry.spellings.get(spelling) ?? { size, count: 0, longest: 0 };
    s.count++; s.longest = Math.max(s.longest, n.length);
    entry.spellings.set(spelling, s);
    byTotal.set(totalKey(size), entry);
  }
  if (!byTotal.size) return null;
  // A bare count ("שישיית קוקה קולה" -> 6 units) says how many, not how much: when some name gives a weight or a
  // volume, the count stops competing with it and backs the measured reading with the same pack count instead -
  // otherwise three chains writing "שישייה" outvote two writing "6 * 1.5 ליטר", and a 9 L pack prices as 6 units.
  const measured = [...byTotal.entries()].filter(([k]) => !k.endsWith('|unit'));
  if (measured.length) {
    for (const [k, e] of [...byTotal.entries()].filter(([key]) => key.endsWith('|unit'))) {
      const count = [...e.spellings.values()][0].size.count;
      for (const [, m] of measured) if ([...m.spellings.values()].some((s) => s.size.count === count)) m.votes += e.votes;
      byTotal.delete(k);
    }
  }
  const shown = shownName ? parseSize(shownName) : null;
  const shownKey = shown ? totalKey(shown) : null;
  const [, win] = [...byTotal.entries()].sort(([ka, a], [kb, b]) => b.votes - a.votes || (kb === shownKey) - (ka === shownKey) || b.longest - a.longest)[0];
  return [...win.spellings.values()].sort((a, b) => b.count - a.count || b.longest - a.longest)[0].size;
};

/** conceptId (docs/CONCEPTS.md §3), also from every name across chains: the concept the majority of
 * the (non-null) per-name assignConcept results agree on; all-null -> null.
 *
 * Truncated names do not get a vote when a fuller one exists. Half the chains cut the name to ~20 characters,
 * and what the cut removes is exactly the part that says what the product is: "גלילי וופל במילוי קרם בטעם
 * אגוז" is a wafer, but five chains publish it as "רולים אגוז עלמה 100" - the filling is gone, the nut looks
 * like the product, and a plain majority hands the barcode to the walnut concept, which then offers it as a
 * substitute for walnuts. A name that is a prefix of a longer name for the same barcode is the same name with
 * its tail cut off, so it is dropped before the vote (and all of them are kept if that would leave none).
 *
 * The remaining names are not equally informative either. A name that spells out a filling, a flavour or a
 * scent states a fact about the product; a name that omits it is merely silent, not disagreeing. So a name
 * carrying such a marker (hasFlavourMarker, from the same list the matcher strips by) votes with the weight
 * of five plain ones - enough that one full name beats the truncations of a whole aisle, while a single
 * mis-worded name still cannot outvote a large, consistent majority. Five is where the outcome stops moving:
 * every higher weight gives the same catalog. */
const FLAVOUR_NAME_WEIGHT = 5;
const pickConcept = (names, conceptList) => {
  const clean = [...new Set(names.filter((n) => n && n.length > 2))];
  const full = clean.filter((n) => !clean.some((other) => other.length > n.length && other.startsWith(n)));
  const counts = new Map();
  for (const n of (full.length ? full : clean)) {
    const id = assignConcept(n, conceptList);
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + (hasFlavourMarker(n) ? FLAVOUR_NAME_WEIGHT : 1));
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
};

/** config/products/aliases.json (docs/ALIASES.md): reviewed GTIN aliases - barcodes a human confirmed are
 *  the same product sold under two codes (typically a packaging change), so the build should merge their
 *  prices into one product instead of showing them as two separate "missing at this chain" lines. Never
 *  derived automatically; candidates for review come from scripts/alias-candidates.mjs. A missing or empty
 *  file reads as no aliases, same tolerance as loadSalIsraelGtins above. */
const ALIASES_PATH = path.join(ROOT, 'config', 'products', 'aliases.json');

/** A barcode-looking value: the same shape build-products treats as a gtin everywhere else
 *  (src/catalog/priceXml.js isGtin - 8/12-14 digits, or an 11-digit UPC-A whose check digit validates
 *  once zero-padded). Reused here so an alias config can never point at something that was never a gtin
 *  to begin with. */
const looksLikeBarcode = (s) => isGtin(s);

/** Throws on a malformed alias list; never auto-corrects (a bad entry must stop the build loudly rather
 *  than silently merge, or fail to merge, the wrong products). Checks, in order: both sides look like a
 *  barcode, alias != canonical, no alias repeated, and no chain of aliases - an alias's canonical is never
 *  itself used as an alias elsewhere, which would mean a chain of two merges instead of one. Returns
 *  `aliases` unchanged so it can be used inline. */
export function validateGtinAliases(aliases) {
  const seenAlias = new Set();
  const aliasCodes = new Set(aliases.map((a) => a.alias));
  for (const { alias, canonical } of aliases) {
    if (!looksLikeBarcode(alias) || !looksLikeBarcode(canonical)) {
      throw new Error(`gtin alias ${alias} -> ${canonical}: both alias and canonical must look like a barcode`);
    }
    if (alias === canonical) throw new Error(`gtin alias ${alias}: alias cannot equal its own canonical`);
    if (seenAlias.has(alias)) throw new Error(`gtin alias ${alias}: used twice`);
    seenAlias.add(alias);
    if (aliasCodes.has(canonical)) {
      throw new Error(`gtin alias ${alias} -> ${canonical}: ${canonical} is itself an alias elsewhere - aliases may not chain`);
    }
  }
  return aliases;
}

export function loadGtinAliases(filePath = ALIASES_PATH) {
  if (!existsSync(filePath)) return [];
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  return validateGtinAliases(raw.aliases ?? []);
}

/** Pure per-chain rewrite (docs/ALIASES.md): an item whose gtin is a reviewed alias is rewritten to its
 *  canonical gtin, keeping every other field untouched - in particular `storeItemId` and `code`, the
 *  chain's OWN identifiers, which is what the cart handoff sends (src/catalog/priceXml.js
 *  buildCatalogFromFiles; the backend's handoff uses storeItemId, never gtin). So after the rewrite the
 *  chain still adds the shopper's exact item to the exact cart row the chain expects - only the gtin used
 *  to GROUP it with the rest of the catalog changes.
 *
 *  When the same chain ALSO publishes the canonical gtin as its own row, the alias row is dropped instead
 *  of rewritten: the canonical's own row already prices that chain, and keeping both would either double
 *  it in a chain-level listing or let the alias row's (possibly different) price silently win depending on
 *  iteration order. One row per chain per canonical gtin, exactly like every other gtin. */
export function applyGtinAliases(items, aliases) {
  if (!aliases?.length) return items;
  const byAlias = new Map(aliases.map((a) => [a.alias, a.canonical]));
  const present = new Set(items.map((i) => i.gtin).filter(Boolean));
  const out = [];
  for (const item of items) {
    const canonical = item.gtin ? byAlias.get(item.gtin) : undefined;
    if (canonical === undefined) { out.push(item); continue; }
    if (present.has(canonical)) continue; // the canonical's own row in this chain wins; the alias row is dropped
    out.push({ ...item, gtin: canonical });
  }
  return out;
}

function loadChains() {
  const chains = {};
  if (!existsSync(PRICES)) return chains;
  const aliases = loadGtinAliases();
  for (const chainId of readdirSync(PRICES)) {
    const full = path.join(PRICES, chainId, 'catalog.full.json');
    const online = path.join(PRICES, chainId, 'online.json');
    if (!existsSync(full)) continue;
    // Rule (18.9.2026): the catalog is built only from what the chain publishes under the price
    // transparency regulations. Anything gathered from a chain's website - the storefront snapshots
    // (scripts/online-prices.mjs -> online.json) and Shufersal's site codes (codes.json) - is an audit
    // tool: applied only with SITE_CHECK=1 for a manual comparison, never in the daily build.
    const audit = process.env.SITE_CHECK === '1';
    const codes = path.join(PRICES, chainId, 'codes.json');
    const catalog = existsSync(full) ? JSON.parse(readFileSync(full, 'utf8')) : { chainId, items: [], source: null };
    catalog.items = catalog.items.filter((item) => !(Number.isFinite(item.price) && item.price > 0 && item.price < MIN_REAL_PRICE));
    catalog.items = applyGtinAliases(catalog.items, aliases);
    chains[chainId] = { catalog, online: audit && existsSync(online) ? JSON.parse(readFileSync(online, 'utf8')) : null, codes: audit && existsSync(codes) ? JSON.parse(readFileSync(codes, 'utf8')) : null };
  }
  return chains;
}

/** Which family head, if any, marks this gtin as its private label: the head with the most raw
 * (catalog.full.json) items flagging the signal wins; ties broken alphabetically for determinism. */
const resolvePrivateLabelOf = (g) => {
  if (!g.plFamilies.size) return null;
  return [...g.plFamilies.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
};

/** Voucher/delivery/deposit lines that show up as weighted-looking "items" in some price files but are not
 * products at all - never a concept-product candidate (docs/CONCEPTS.md follow-up, 19.9.2026). */
// A row that is not a product but a line on a receipt. Most of these only became visible when the 3-chain
// threshold was lifted (23.9), because a chain's own bookkeeping is by definition sold by one chain:
// "קופון ציפר" (232 barcodes, one name, 1 agora, last updated 2021), "מיחזור אריזה" in seven package sizes,
// and checkout donations ("תרומה 20 ש"ח", "תרומה סל מלא"). Anchored or spelled narrowly on purpose - a scan
// of the full catalog showed that bare דמי matches Pall Mall Demi cigarettes and a makeup base, bare הרכבה
// matches assembly toys, and בוטל matches Boss Bottled. "לא לאתר!" is a chain telling its own site not to list the
// row ("לא לאתר! עוף טחון", 28.9) - a product we must not list either.
// 30.9 (Naor: "שקיות גופיה תוריד את זה לא אמור להופיע"): the checkout carrier bag every chain rings up at 0.10 is
// not a product either - "שקית גופיה", "שקיות קופה", "שקית שרות קופה", Osher Ad's "שקית ענק" - nor a deposit spelled
// "פקדון", a customer-service credit, an online gift voucher or a promotion line priced at 0.10 ("נקניקיות ב 19.90 ש"ח").
// Garbage, freezer and sandwich bags are real products and do not match.
const SERVICE_ITEM_RE = /משלוח|איסוף|זיכוי|פיקדון|פקדון|קופון|מיחזור אריזה|^תרומה|עמלת|לא לאתר|שקית גופיה|שקיות גופיה|שקי(?:ת|ות) (?:שרות )?קופה|שקית ענק|פיצוי לקוח|מתנה אונליין|ב ?\d+(?:\.\d+)? ש"ח$/;
/* A price under 20 agorot is never a product's price: every row below it in the files is a coupon, a bag, a deposit
 * or a placeholder, and the one real product among them - Carrefour's "גבינה לבנה 5% 750 גר" at 0.01 - is the
 * chain's own error (30.9, Naor: "לא הגיוני"). Such a row is dropped at load, so it can neither make a product nor
 * price one; the product keeps the other chains' prices. */
const MIN_REAL_PRICE = 0.2;

/** Organic is a different product at a different price, not a cheaper-or-dearer version of the same one:
 * Shufersal's only matching carrot is "מארז גזר אורגני" at 11.90 where every other chain sells plain
 * carrot for 2.90-6.90. Letting it speak for `carrot` made Shufersal look 2.4x dearer than it is, so an
 * organic item never represents a plain concept. (Giving organic produce concepts of its own would price
 * it properly instead of hiding it - config/concepts/, so a follow-up for the pipeline author.) */
const ORGANIC_RE = /אורגנ/;

/** Concepts that are a shelf, not a product: their breadth is the definition, so no match rule can narrow
 * them and no price band can catch them. "סלט מוכן" is the case - Hazi Hinam alone assigns 14 different
 * salads to it (tahini 35, potato 42, matbucha 49, egg 67, avocado 77) while Shufersal assigns exactly one
 * item, "תערובת סלט חמוציות וקשיו" at 119, a nut-and-dried-fruit mix that is not a deli salad at all.
 * Taking each chain's cheapest then compares two different dishes, and the chains can agree closely enough
 * to look fine while still being incomparable. Such a concept stays useful for substitutes and mapping; it
 * just never becomes a weighed product with a price per kilo.
 *
 * The list has to be named rather than derived, and a price check cannot derive it: `pastrami-other`'s chains
 * cluster tightly at 87-106 and still quote six different cures, while `beef-cuts-other` is just as broad by
 * its id and is one product in every chain - so neither "the id ends in -other" nor "the prices disagree" is
 * the rule. What separates them is whether ONE form dominates the concept's weighed rows: a dominant
 * form means one product wearing many labels, a scatter across forms means a family. Name count alone
 * cannot tell those apart - `salmon` carries 31 distinct names like a bucket, yet 52 of its 60 weighed
 * rows are fillet, so it is a product to narrow rather than a family to drop (docs/CONCEPTS.md §6 has
 * the test and the measurement). A `weighedProduct: false` flag in config/concepts/ would put this next
 * to the concept it describes, which is where it belongs (docs/CONCEPTS.md §6 follow-up). */
const BUCKET_CONCEPTS = new Set([
  'deli-salad-other',
  // 23.9 (Naor: "איזה פטרייה? איזה תפוח? זה הבדל עצום"). The deli counter and the fish counter sell a family,
  // not a product, and the names prove it: across the chains' weighed rows `pastrami-other` carries 69 distinct
  // descriptions (בדבש טהור, מקסיקנית, על גחלים, של פעם...), `pastrami-turkey` 40, `salami` 50 (איטלקי מפולפל,
  // פפרוני, תה מעושן), `herring` 16 (פילה כבוש, בשמן, עם בצל), `trout` 14 (שלם, פילה, מעושן קר), `pastrami-chicken`
  // 6 over a single-digit chain count. Each chain's cheapest is then a different cut at a different cure, and the
  // median reads as one price for "פסטרמה" that no shopper can act on. They stay concepts for substitutes and
  // mapping; they just publish no per-kilo card.
  'pastrami-other', 'pastrami-turkey', 'pastrami-chicken', 'salami', 'herring', 'trout',
  // 28.9, the meat and fish counter (WEIGHED_CARD_CATEGORIES). These were split the same day into one concept
  // per cut (tongue, brisket, shoulder, entrecote, sinta... and beef ribs apart from lamb ribs), and what is
  // left in them is the remainder no single cut claims - "סטייק" with no cut named, a numbered cut with no
  // name, mackerel that is neither smoked nor canned. A card would still read as one price for several.
  'beef-cuts', 'beef-cuts-frozen', 'beef-steak', 'beef-steak-frozen',
  'beef-cut-numbered', 'beef-cut-numbered-frozen', 'turkey-cuts', 'turkey-cuts-frozen', 'mackerel',
  // 28.9, the deli counter by weight: `sausage-other` was mortadella, tea sausage, veal frankfurters and
  // "שאריות נקניק" at once. Split the same day (wiener, merguez, chorizo, bratwurst, cocktail, mortadella,
  // tea, servelat, Russian, snack); what is left is still the remainder no kind claims.
  'sausage-other',
]);

/** A weighed concept product is a price per kilo, so it may only ever be built from rows the chain
 * publishes as sold by weight. Chains say so in the price file - `bIsWeighted`, mirrored onto
 * `item.isWeighted` - and they are consistent about it: Rami Levy's "כוסברה (בתפזורת)" at 3.20 and
 * M.C.K's "כוסברה" at 3.90 are bunches (bIsWeighted=0, UnitQty=יח'), while Tiv Taam's "כוסברה במשקל" at
 * 39 and Yochananof's "כוסברה עלים" at 100 are kilos (bIsWeighted=1, UnitOfMeasure=קילוגרם). The build
 * demanded `isWeighted` only of barcoded rows and waved every internal-code row through, so a 3.20 bunch
 * and a 100 kilo landed in the same median - and because each chain contributes its *cheapest* match, the
 * bunch won. Carrefour shows the same fault inside one chain: "פטריות שמפניון" (code 374, bIsWeighted=0,
 * UnitQty=יחידות) at 9.90 is a tray, "פטריות שמפניון תפזור" (bIsWeighted=1, קילוגרם) at 39.90 is the kilo.
 *
 * Only `isWeighted` is trustworthy here. `UnitQty`/`UnitOfMeasure` disagree with themselves across chains
 * - 548 weighted rows at Osher Ad say יחידות, 70 at Yeinot Bitan say ליטר, and M.C.K labels 33 weighted
 * rows "גרם 100" while their ItemPrice is still per kilo - which is why src/catalog/priceXml.js keeps
 * `isWeighted` and drops the rest rather than shipping a field nothing may depend on. */
const conceptItemCandidate = (item) =>
  Boolean(item.isWeighted)
  && Boolean(item.name) && !SERVICE_ITEM_RE.test(item.name) && !ORGANIC_RE.test(item.name)
  && Number.isFinite(item.price) && item.price > 0;
/* A dried-fruit and nut packer's kilo is never the fresh one, even when its name forgets to say so: Osher
 * Ad's "משמש במשקל" at 64 is דין שיווק's dried apricot, priced into the fresh apricot card against a 28
 * median (28.9). Every weighed row these packers publish is nuts or dried fruit, so they are kept out of the
 * produce cards only - the same packer IS the bulk nut and dried-fruit counter those cards are made of. */
const DRIED_PACKER_RE = /דין שיווק/;
const packerOutOfPlace = (item, conceptId, list) =>
  DRIED_PACKER_RE.test(item.brand ?? '') && conceptById(conceptId, list)?.category === 'ירקות ופירות';

/** How far a single chain's price may sit from the concept's median before it stops being evidence about
 * the same product. Genuine loose produce agrees closely: over the 40 emitted weighed concepts the widest
 * chain sits 2.4x from its median (tomato) and the typical one 1.7x, so 3x is clear of real variation
 * while still catching a bunch quoted against kilos (31x), a tray against loose mushrooms (4x) or a
 * nut-and-dried-fruit mix standing in for a deli salad (3.4x).
 *
 * The ratio is measured against the median rather than as a min/max spread on purpose: min/max grows with
 * the number of chains, so it would punish exactly the products enough chains sell to be worth comparing.
 * `tomato` is the example - 11 chains, 2.90 to 11.90 (4.1x end to end), yet no chain further than 2.4x
 * from the 6.90 median and no single item identifiably wrong. */
const CONCEPT_PRICE_RATIO = 3;
const withinConceptBand = (price, base) =>
  Number.isFinite(price) && price > 0 && Number.isFinite(base) && base > 0
  && price <= base * CONCEPT_PRICE_RATIO && price * CONCEPT_PRICE_RATIO >= base;

/** Concept products for weight-sold goods (fresh produce, deli/fish by weight): these never carry a GTIN,
 * so they are invisible to the GTIN-keyed loop above even though every chain sells them under its own
 * internal code. For every concept with sizeUnit: null (the fresh-food author's marker for "genuinely
 * weighed, no fixed package size" - see config/concepts/produce-deli-frozen.json), collect the weighted
 * items of every chain that assign to it; a concept sold by >= 3 chains (family heads counted once, same
 * as FAMILY_HEAD elsewhere) becomes one product priced at the median of each chain's cheapest match.
 *
 * Each chain contributes its *cheapest* match, which is what makes a single bad row a bad product price
 * rather than a rounding error, so the cheapest has to be the chain's price for the concept and nothing
 * else. Two passes enforce that: `conceptItemCandidate` drops rows that are not a kilo of the thing (a
 * bunch, a tray, an organic variant), and then the chains are made to agree - a chain further than
 * CONCEPT_PRICE_RATIO from the provisional median is not quoting the same product, so it loses its vote
 * and the median is retaken without it. A concept left with fewer than 3 agreeing chains publishes no
 * product at all: a missing card beats a wrong price, the same rule the catalog applies to categories.
 *
 * The chain is dropped rather than the whole product wherever the rest still agree - `carrot` and
 * `mushroom` are sold by 11 and 9 families and are worth comparing. What neither pass can see is a concept
 * that is a shelf rather than a product, where every chain's row is honest and they are still not the same
 * dish; those are named in BUCKET_CONCEPTS and skipped outright. */
/* Aisles whose concepts get a weighed card whenever enough chains sell them by the kilo, whatever their
 * sizeUnit says: a chicken breast is packed in trays and sold loose at the counter, so its concept keeps a
 * gram size for the trays while the counter rows still deserve one card instead of one product per chain
 * (Naor, 28.9: 30 separate "חזה עוף" cards). Fresh and frozen are separate concepts there
 * (scripts/frozen-twins.mjs), so each card is one form. */
const WEIGHED_CARD_CATEGORIES = new Set(['בשר ועוף', 'חלב וביצים', 'שימורים', 'חטיפים וממתקים', 'מעדנייה']);
function buildConceptProducts(chains, list) {
  const weightConcepts = new Set(list.filter((c) => c.sizeUnit === null || WEIGHED_CARD_CATEGORIES.has(c.category)).map((c) => c.id));
  if (!weightConcepts.size) return { products: [], disagreed: [], band: [] };
  const perConcept = new Map(); // conceptId -> Map(familyHead -> {price, name, chain} of the cheapest row)
  const perChain = new Map(); // conceptId -> Map(chainId -> the chain's OWN cheapest row), for `sources`
  for (const [chainId, { catalog }] of Object.entries(chains)) {
    const head = familyHead(chainId);
    for (const item of catalog.items) {
      if (!conceptItemCandidate(item)) continue;
      const conceptId = assignConcept(item.name, list);
      if (!conceptId || !weightConcepts.has(conceptId) || BUCKET_CONCEPTS.has(conceptId) || packerOutOfPlace(item, conceptId, list)) continue;
      const byHead = perConcept.get(conceptId) ?? new Map();
      const best = byHead.get(head);
      if (!best || item.price < best.price) byHead.set(head, { price: item.price, name: cleanName(item.name), chain: chainId });
      perConcept.set(conceptId, byHead);
      const byChain = perChain.get(conceptId) ?? new Map();
      const own = byChain.get(chainId);
      if (!own || item.price < own.price) byChain.set(chainId, { price: item.price, name: cleanName(item.name), chain: chainId });
      perChain.set(conceptId, byChain);
    }
  }
  const products = [];
  const disagreed = [];
  const band = [];
  for (const [conceptId, byHead] of perConcept) {
    if (byHead.size < 3) continue;
    const provisional = median([...byHead.values()].map((b) => b.price));
    const agreeing = [...byHead.entries()].filter(([, b]) => withinConceptBand(b.price, provisional));
    for (const [head, b] of byHead) {
      if (!agreeing.some(([h]) => h === head)) disagreed.push({ conceptId, head, price: b.price, provisional });
    }
    if (agreeing.length < 3) continue;
    const concept = conceptById(conceptId, list);
    if (!concept) continue;
    const id = `c-${conceptId}`;
    // A concept product IS its concept, so the department the concept's author declared wins over guessing
    // from its name. Going through categorize() alone put two of them in the wrong aisle: it consults the
    // concept's category but only past `conceptRejected`, a guard built to catch a PRODUCT whose name
    // contradicts its concept ("יוגורט קיווי" is not produce). Handed the concept's own name that guard has
    // nothing to compare - a concept cannot contradict itself - and it rejected two concepts from their own
    // department, because "יבש" reads as dried: `onion-yellow` ("בצל יבש") and `garlic` ("שום יבש") are the
    // cured storage bulbs, the ordinary kind a list means, and both were filed under שימורים. A reviewed
    // label still wins over both, which is why categorize() is still asked first for one. */
    const reviewedCategory = categoryLabel(id);
    const category = reviewedCategory && CATEGORIES.includes(reviewedCategory) ? reviewedCategory
      : CATEGORIES.includes(concept.category) ? concept.category
      : categorize(concept.name, conceptId, id);
    // A weighed card is a median over a different row in every chain, so it has to say which row: the shopper
    // can then see that "פטריות" is שמפיניון in one chain and פורטובלו in another, instead of a bare median
    // (Naor, 23.9). Additive field `sources`, cheapest first (docs/PIPELINE-CONTRACT.md §2.1).
    // One row per CHAIN, not per family: the median counts a family once (ybitan and quik are carrefour's price
    // list, yochananof_b is yochananof's pickup list), but a consumer prices each chain it serves from that
    // chain's own row, and a row per family showed the sister chain's product instead - carrefour's melon card
    // explained by ybitan's "מלון פונטו", yochananof's hot pepper by yochananof_b's (cartBackend, 28.9).
    const agreeingHeads = new Set(agreeing.map(([head]) => head));
    const sources = [...(perChain.get(conceptId)?.values() ?? [])].filter((b) => agreeingHeads.has(familyHead(b.chain)))
      .map((b) => ({ chain: b.chain, name: b.name, price: b.price })).sort((a, b) => a.price - b.price || a.chain.localeCompare(b.chain));
    // How close this concept sits to CONCEPT_PRICE_RATIO, measured the way the band is enforced: the
    // furthest surviving chain from the median. Reported so the margin shrinking is visible as concepts
    // multiply - each new one is a fresh chance for a prepared or frozen form to leak in and widen the
    // spread, and the day one crosses the ratio a real chain is dropped with only a log line to say so.
    const basePrice = median(agreeing.map(([, b]) => b.price));
    band.push({ conceptId, chains: agreeing.length, basePrice, worst: Math.max(...agreeing.map(([, b]) => Math.max(b.price / basePrice, basePrice / b.price))) });
    const v = applyVerified(verifiedRecord(id), { name: concept.name, category });
    products.push({
      id, name: v.name, category: v.category, brand: null,
      unit: 'ק"ג', isWeighted: true, gtin: null, basePrice, aliases: [...(concept.synonyms ?? []), ...(v.name !== concept.name ? [concept.name] : [])],
      icon: ICONS[v.category] ?? ICONS['כללי'], chains: agreeing.length, conceptId, conceptFamily: resolveFamily(concept, list), size: null, privateLabelOf: null, kind: 'concept', verified: v.verified, sources,
    });
  }
  return { products, disagreed, band };
}

export function buildProducts(chains, { minChains = MIN_CHAINS, max = MAX, concepts: conceptList, salIsraelGtins, report, aliases: gtinAliasConfig = [] } = {}) {
  const list = conceptList ?? defaultConcepts();
  const salBasketGtins = salIsraelGtins ?? loadSalIsraelGtins();
  // gtin -> alias codes folded into it (config/products/aliases.json, docs/ALIASES.md). The rewrite that
  // actually merges the rows happens earlier, per chain, in loadChains() (applyGtinAliases); by the time
  // buildProducts sees the items every alias gtin is already gone, replaced by its canonical - so this map
  // is read from the config itself (what applyGtinAliases was told to fold), not re-derived from the items.
  const aliasesByCanonical = new Map();
  for (const { alias, canonical } of gtinAliasConfig) {
    const codes = aliasesByCanonical.get(canonical) ?? [];
    codes.push(alias);
    aliasesByCanonical.set(canonical, codes);
  }
  const byGtin = new Map();
  const seen = (gtin) => byGtin.get(gtin) ?? byGtin.set(gtin, { chains: new Set(), names: [], named: [], brands: [], prices: [], weighted: 0, plFamilies: new Map() }).get(gtin);
  for (const [chainId, { catalog, online }] of Object.entries(chains)) {
    for (const item of catalog.items) {
      if (!item.gtin) continue;
      // Chains publish till rows that are not products at all ("זיכוי/חיוב שיקלי", "משלוח ענק אונליין");
      // they carry a barcode and a price, so only the name gives them away.
      if (!item.name || SERVICE_ITEM_RE.test(item.name)) continue;
      const g = seen(item.gtin);
      g.chains.add(chainId); g.names.push(cleanName(item.name)); g.named.push({ chain: chainId, name: cleanName(item.name) }); g.brands.push(cleanName(item.brand)); g.prices.push(item.price); if (item.isWeighted) g.weighted++;
      // Private-label detection (src/catalog/privateLabel.js) only looks at what the chain itself
      // publishes (catalog.full.json), never the storefront overlay - see the loop below.
      if (isPrivateLabel(item, chainId)) {
        const head = familyHead(chainId);
        g.plFamilies.set(head, (g.plFamilies.get(head) ?? 0) + 1);
      }
    }
    for (const [gtin, p] of Object.entries(online?.items ?? {})) {
      const g = seen(gtin);
      g.chains.add(chainId); g.names.push(cleanName(p.name)); g.named.push({ chain: `${chainId}:online`, name: cleanName(p.name) }); g.prices.push(p.price); if (p.isWeighted) g.weighted++;
    }
  }
  const named = (g) => g.names.some((n) => n.length > 2);
  const entries = [...byGtin.entries()];
  // The shared bucket: sold by enough chains, capped at --max (docs/CONCEPTS.md §3).
  const shared = entries.filter(([, g]) => g.chains.size >= minChains && named(g));
  shared.sort((a, b) => b[1].chains.size - a[1].chains.size || (median(a[1].prices) ?? 0) - (median(b[1].prices) ?? 0));
  const sharedSlice = shared.slice(0, max);
  const sharedGtins = new Set(sharedSlice.map(([gtin]) => gtin));
  // Private-label products are added on top of the cap: they belong in the catalog even sold by one
  // chain only, and --max never trims them (docs/CONCEPTS.md §3).
  const privateLabelExtras = entries.filter(([gtin, g]) => !sharedGtins.has(gtin) && named(g) && resolvePrivateLabelOf(g) != null);
  const privateLabelGtins = new Set(privateLabelExtras.map(([gtin]) => gtin));
  // "הסל של ישראל" products are added on top too, same reasoning: the basket must always be priceable,
  // even for a product only 1-2 chains happen to publish (docs/SAL-ISRAEL.md, coordinator follow-up 22.9).
  const salIsraelExtras = entries.filter(([gtin, g]) => !sharedGtins.has(gtin) && !privateLabelGtins.has(gtin) && named(g) && salBasketGtins.has(gtin));
  const candidates = [...sharedSlice, ...privateLabelExtras, ...salIsraelExtras];
  const products = candidates.map(([gtin, g]) => {
    // A manual display name (config/categories/names.json, decision 22.9) beats the common name when the
    // common name is the supplier's series and says nothing; the common name stays searchable as an alias.
    // The name a shopper reads counts each chain FAMILY once (familyVotes); the aisle is still read from the name the
    // per-chain vote picks, as before. They are split on purpose. Measured 28.9: family-voted names are fuller for
    // 2,310 of the 2,521 products they change, but reading the aisle from them moves 57 products and about half the
    // wrong way - a truncated old name sometimes carried the keyword ("פרוטי בר- חטיף פרי") that the full name does
    // not ("פרוטיבר בטעם תות"). Voting the aisle across every chain's name was tried and was worse, 278 moves. So
    // the aisle stays exactly where it was, and making it robust to one chain's bad name is its own problem.
    const commonName = bestName(familyVotes(g.named));
    const categoryName = bestName(g.names);
    const manualName = displayName(`g${gtin}`);
    const picked = pickConcept(g.names, list);
    const heuristicCategory = categorize(manualName ?? categoryName, picked, `g${gtin}`); // reviewed label > concept category > keyword rules
    // A verified record (config/products/verified.json, docs/PLAN-PRODUCT-TRUTH.md §2) beats every heuristic,
    // field by field; `verified` on the product says whether one exists. The common name stays searchable.
    const v = applyVerified(verifiedRecord(`g${gtin}`), {
      name: manualName ?? commonName, brand: mode(g.brands.filter((b) => b && !/^(לא ידוע|unknown|כללי)$/i.test(b))) ?? null,
      category: heuristicCategory, conceptId: conceptForCategory(picked, heuristicCategory, list), size: pickSize(familyVotes(g.named), manualName ?? commonName),
    });
    const { name, category } = v;
    // A reviewed concept assignment (config/products/concept-assignments.json) fills only a gap: no concept from
    // the rules and none decided by a verified record. It never overrides either.
    const rec = verifiedRecord(`g${gtin}`);
    const conceptId = v.conceptId ?? ((!rec || !('conceptId' in rec)) ? conceptAssignment(`g${gtin}`) : null);
    const isWeighted = g.weighted > g.chains.size / 2;
    const gtinAliases = aliasesByCanonical.get(gtin);
    return {
      id: `g${gtin}`, name, category, brand: v.brand,
      unit: isWeighted ? 'ק"ג' : "יח'", isWeighted, gtin, basePrice: median(g.prices), aliases: commonName && commonName !== name ? [commonName] : [], icon: ICONS[category], chains: g.chains.size,
      conceptId, conceptFamily: conceptFamilyFor(conceptId, list), size: v.size, privateLabelOf: resolvePrivateLabelOf(g), verified: v.verified,
      // Additive (docs/ALIASES.md, docs/PIPELINE-CONTRACT.md §2.1): the alias gtin(s) folded into this
      // product, only present when non-empty - a product with no reviewed alias carries no such field.
      ...(gtinAliases?.length ? { gtinAliases } : {}),
    };
  });
  // Concept products (weighted goods with no GTIN) are added on top, like private-label extras: they
  // never compete for the --max cap since they aren't in `entries`/`shared` at all.
  const concept = buildConceptProducts(chains, list);
  products.push(...concept.products);
  // Chains dropped for disagreeing are the signal that a concept's match rules or a chain's price file
  // moved; `report` lets the CLI print them without buildProducts having to know about the console.
  if (report) {
    report.conceptDisagreements = concept.disagreed;
    report.conceptBand = concept.band;
    // Every chain's raw name per published barcode, for the cross-checks (src/catalog/productChecks.js).
    report.namesByGtin = new Map(candidates.map(([gtin, g]) => [gtin, g.named]));
  }
  products.sort((a, b) => a.category.localeCompare(b.category, 'he') || a.name.localeCompare(b.name, 'he'));
  return products;
}

/** Hebrew department name for a shard slug - the reverse of DEPARTMENT_SLUGS, plus the `other` shard. */
const DEPARTMENT_NAME_BY_SLUG = { ...Object.fromEntries(Object.entries(DEPARTMENT_SLUGS).map(([name, slug]) => [slug, name])), [OTHER_DEPARTMENT_SLUG]: OTHER_DEPARTMENT_NAME };

/** Groups `products` into department shards (docs/PIPELINE-CONTRACT.md §2.1.1): one array per department
 * slug, containing exactly the products whose `category` is that department, in the same order they appear
 * in `products` (already sorted category-then-name by buildProducts, so a shard needs no re-sort). A product
 * whose category is missing or not one of the 13 known ones - a data bug, since categorize() itself always
 * returns one of them - lands in the `other` shard instead of being dropped, so every product ends up in
 * exactly one shard and none are silently lost. */
export function shardProductsByDepartment(products) {
  const bySlug = new Map();
  for (const p of products) {
    const slug = departmentSlug(p.category);
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(p);
  }
  return bySlug;
}

/**
 * Writes data/products/<slug>.json (one per non-empty department shard) and data/products-index.json
 * describing them (docs/PIPELINE-CONTRACT.md §2.1.1) - the index is how a consumer discovers the shards
 * over HTTP without a `readdir`, the same reasoning as config/concepts/index.json
 * (src/catalog/concepts.js INDEX_FILE): a 14th department must become visible with no code change beyond
 * adding it to DEPARTMENT_SLUGS.
 *
 * A department that shipped a shard on a previous build and lost every product since must not leave a
 * stale file the new index no longer lists (docs/PIPELINE-CONTRACT.md §3: what is published must match
 * what is announced) - the same rule the CLI already applies to a chain with no catalog left below
 * (missingChainIds). Returns the department rows (id, name, file, count, bytes) so the caller can print a
 * size table and warn on an oversized shard without re-reading the files.
 */
export function writeProductShards(products, { productsDir = PRODUCTS_DIR, indexPath = PRODUCTS_INDEX_PATH, buildId = new Date().toISOString() } = {}) {
  mkdirSync(productsDir, { recursive: true });
  const bySlug = shardProductsByDepartment(products);
  const rows = [];
  for (const [slug, items] of bySlug) {
    const file = path.join(productsDir, `${slug}.json`);
    writeFileSync(file, JSON.stringify(items, null, 1) + '\n');
    rows.push({ id: slug, name: DEPARTMENT_NAME_BY_SLUG[slug] ?? slug, file: `products/${slug}.json`, count: items.length, bytes: statSync(file).size });
  }
  const keep = new Set(rows.map((r) => `${r.id}.json`));
  for (const file of readdirSync(productsDir)) {
    if (file.endsWith('.json') && !keep.has(file)) unlinkSync(path.join(productsDir, file));
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(indexPath, JSON.stringify({ version: 1, buildId, generatedAt: buildId, departments: rows, total: products.length }, null, 1) + '\n');
  return rows;
}

/**
 * A fresh-produce concept (category ירקות ופירות, docs/CONCEPTS.md §7) belongs only to a product whose reviewed
 * department is produce. When the label says otherwise - dried parsley in a shaker, canned mushrooms, diced
 * tomatoes, a mango drink - the concept's name would headline the card ("פטרוזיליה" over "מימון פטרוזיליה
 * במיכל") and the product would be offered as a substitute for the fresh thing. The concept is dropped and the
 * product keeps its department (23.9, Naor's report on the parsley spice). Every other category pairing is left
 * alone: a concept may legitimately sit in a neighbouring department (hummus in שימורים or מעדנייה).
 */
const FRESH_CONCEPT_CATEGORIES = new Set(['ירקות ופירות', 'בשר ועוף']);
/**
 * The general food/non-food guard (24.9, docs/CONCEPTS.md §12): a hair-dye shade named "דבש" (honey), "אגוז"
 * (walnut) or "קינמון" (cinnamon), or a hand cream named "שמן זית" (olive oil), really does carry the word -
 * this is not a word-boundary bug, the product genuinely says that word as its own word. What's wrong is that
 * the concept it names (category שימורים / חטיפים וממתקים, both food) is landing on a product the label put
 * in טיפוח ויופי, which is not food. The fix does not special-case cosmetics: a concept whose own category is
 * food is dropped from a product whose department is not food (FOOD_CATEGORIES, src/catalog/categorize.js),
 * and the mirror case - a concept from a non-food category surviving on a product the label put in a food
 * department - is dropped too. FRESH_CONCEPT_CATEGORIES above stays exactly as it was: its exact-department
 * match is strictly stronger than this rule (it also rejects a fresh-produce/meat concept sitting in a
 * DIFFERENT food department - e.g. a mushroom "steak" concept on a בשר ועוף product - which the food/non-food
 * boundary alone would let through, since both sides are food); this guard only adds the food/non-food
 * boundary on top, for the concepts FRESH_CONCEPT_CATEGORIES does not already decide.
 */
export function conceptForCategory(conceptId, category, list = defaultConcepts()) {
  if (!conceptId) return conceptId;
  const concept = conceptById(conceptId, list);
  if (!concept) return conceptId;
  // Extended to raw meat on 23.9 (evening): שניצל עוף / נתחי בקר are fresh cuts, and a product the label puts in
  // מעדנייה (nuggets, pastrami) or ירקות ופירות (portobello "steak" mushrooms) is not that cut.
  if (FRESH_CONCEPT_CATEGORIES.has(concept.category) && category !== concept.category) return null;
  if (FOOD_CATEGORIES.has(concept.category) !== FOOD_CATEGORIES.has(category)) return null;
  return conceptId;
}

/** `conceptFamily` on a product (docs/CONCEPTS.md §10, docs/PIPELINE-CONTRACT.md §2.1): the sub-category
 * inside a department ("פטריות" → שמפיניון/פורטובלו) so the storefront can filter without re-deriving
 * anything (src/catalog/concepts.js familiesForCategory). `null` only when the product has no conceptId.
 * Computed from the FINAL conceptId (after conceptForCategory's guard), never the pre-guard one, so a
 * product whose concept was dropped there loses its family too instead of keeping a stale one. */
export function conceptFamilyFor(conceptId, list = defaultConcepts()) {
  if (!conceptId) return null;
  const concept = conceptById(conceptId, list);
  return concept ? resolveFamily(concept, list) : null;
}

/** Shufersal: the site's own product code replaces the formula-derived one; a barcode the site does not
 *  know is not sold online (scripts/resolve-shufersal-codes.mjs). Unchecked barcodes keep the formula. */
export function applySiteCodes(item, codes) {
  const entry = codes?.items?.[item.gtin];
  if (!entry || entry.error) return item;
  if (entry.code === null) return { ...item, inStock: false, siteCode: null };
  return { ...item, storeItemId: entry.code, siteCode: entry.code };
}

export function slimCatalog(chainId, { catalog, online, codes }, gtins, { conceptPrices = new Map(), conceptList, status } = {}) {
  const byGtin = new Map();
  // Price rule (17.9.2026): prices come ONLY from the price file the chain publishes under the
  // transparency regulations. The storefront API overlay never sets a price: it verifies the file
  // (mismatch statistics kept in source.online.verify), marks what the online store does not sell
  // (inStock) and contributes product images. Products the overlay knows but the file does not are
  // not added - no published price, no price shown.
  for (const item of catalog.items) if (item.gtin && gtins.has(item.gtin)) byGtin.set(item.gtin, applySiteCodes({ ...(online ? { ...item, inStock: false, onlinePrice: false } : item), ...(isPrivateLabel(item, chainId) ? { privateLabel: true } : {}) }, codes));
  // Concept products (weighted goods, docs/CONCEPTS.md follow-up 19.9.2026): every item that assigns to an
  // emitted concept rides along, tagged with conceptId so MappingEngine can resolve it.
  //
  // A weighed row that also carries a barcode is tagged in place rather than skipped (24.9). Until the
  // 3-chain threshold was lifted, those rows were almost never in `gtins` - a chain's loose produce is sold
  // by one chain under its own barcode - so they fell to the concept path and got their tag. Publishing
  // every product sent them down the GTIN path instead, where they were included untagged, and the concept
  // card lost the chains that actually sell it: "פטריות פורטובלו" shipped with a price at one chain out of
  // three in its own `sources`, and "ענבים שחורים" with none out of five, which the customer read as "no
  // chain sells this". The earlier note here said a barcoded item never gets a conceptId to save bytes;
  // correctness wins, and it costs only the few hundred weighed produce rows per chain.
  //
  // MappingEngine prices a concept line from the chain's *cheapest* item carrying the conceptId, so this
  // is where a customer's basket actually gets its number and it has to admit exactly what
  // buildConceptProducts would have priced from: the same `conceptItemCandidate` gate, plus the published
  // basePrice as the band. Without the band a chain dropped for disagreeing would still price carts off
  // the row it was dropped for - Osher Ad's 1.90 "קישוא קרעה" against a 9.90 median - and the product card
  // and the cart line would disagree about what a kilo costs.
  const conceptExtras = [];
  if (conceptPrices.size) {
    const list = conceptList ?? defaultConcepts();
    for (const item of catalog.items) {
      if (!conceptItemCandidate(item)) continue;
      const conceptId = assignConcept(item.name, list);
      if (conceptId == null || packerOutOfPlace(item, conceptId, list)) continue;
      if (!withinConceptBand(item.price, conceptPrices.get(conceptId))) continue;
      if (item.gtin && byGtin.has(item.gtin)) { byGtin.set(item.gtin, { ...byGtin.get(item.gtin), conceptId }); continue; }
      conceptExtras.push({ ...item, conceptId, unit: 'ק"ג' });
    }
  }
  const verify = { compared: 0, identical: 0, examples: [] };
  for (const [gtin, p] of Object.entries(online?.items ?? {})) {
    const base = byGtin.get(gtin);
    if (!base) continue;
    if (base.price != null && p.price != null) {
      verify.compared++;
      if (Math.abs(base.price - p.price) < 0.005) verify.identical++;
      else if (verify.examples.length < 20) verify.examples.push({ gtin, file: base.price, site: p.price });
    }
    byGtin.set(gtin, { ...base, sitePrice: p.price ?? null, inStock: p.inStock !== false, isWeighted: p.isWeighted ?? base.isWeighted, image: p.image ?? base.image ?? null, onlinePrice: true });
  }
  const mismatchPct = verify.compared ? Math.round((1000 * (verify.compared - verify.identical)) / verify.compared) / 10 : null;
  return {
    chainId, storeId: catalog.storeId ?? null, generatedAt: new Date().toISOString(), sourceDate: catalog.sourceDate ?? null,
    // Fields from `status` (this chain's entry in data/pipeline-status.json, docs/PIPELINE-CONTRACT.md
    // §2.4) - additive, 22.9. A chain with no entry (no status file at all, or the chain simply isn't
    // listed in one yet) is "ok": that is what every build looked like before this file existed.
    // `failedSince`/`fetchedAt` ride along even when `status` is "ok" so a consumer always has them.
    // The file on disk outranks the status entry: a catalog.full.json downloaded after failedSince
    // means the chain recovered (a later fetch that could not publish), so it is "ok" whatever a stale
    // entry says (22.9: two recovered chains wore the red asterisk on today's prices).
    ...(() => {
      const failed = status?.status === 'failed';
      const recovered = failed && status?.failedSince && catalog.generatedAt && Date.parse(catalog.generatedAt) > Date.parse(status.failedSince);
      return {
        fetchStatus: failed && !recovered ? 'failed' : 'ok',
        failedSince: failed && !recovered ? (status?.failedSince ?? null) : null,
        fetchedAt: recovered ? catalog.generatedAt : (status?.fetchedAt ?? null),
      };
    })(),
    priceSource: 'file',
    source: { ...(catalog.source ?? {}), siteCodes: codes ? { fetchedAt: codes.fetchedAt, known: Object.values(codes.items).filter((c) => c.code).length, notOnSite: Object.values(codes.items).filter((c) => c.code === null).length } : null, online: online ? { fetchedAt: online.fetchedAt, items: Object.keys(online.items).length, verify: { compared: verify.compared, identical: verify.identical, mismatchPct, examples: verify.examples } } : null },
    items: [...byGtin.values(), ...conceptExtras],
  };
}

/** Loose produce is published under a shared code scheme, 7290000000 plus three digits: lettuce is 978 and
 * parsley 985 at six chains, mushrooms 374 and garlic 411 at five, so these codes do key across chains. But
 * a chain may reuse a number from that range for something of its own - 176 is cauliflower at Shufersal, a
 * challah at Hatzi Hinam and a delivery fee at Carrefour; 695 is cucumber at Yochananof and asparagus at
 * Osher Ad. Merged as one barcode, the product took its name from one chain and its concept from another,
 * and the site showed a card called "מלפפון" labelled "אספרגוס" (Naor, 28.9).
 *
 * So for a code in that range whose chain families name different concepts, the families that agree with
 * a strict majority keep the code, and every other family's row loses it (gtin null) - the same standing as
 * the chain's own short internal codes. A weighed row still reaches its concept card through the concept
 * path; it only stops being merged with, or standing beside, someone else's product. With no strict majority
 * (one family against one) no family keeps it. Only concepts count: a family whose name assigns none never
 * disagrees. */
const SHARED_PRODUCE_CODE = /^7290000000\d{3}$/;
export function demoteClashingSharedCodes(chains, list = defaultConcepts()) {
  const byCode = new Map(); // code -> Map(familyHead -> conceptId)
  for (const [chainId, { catalog }] of Object.entries(chains)) {
    for (const item of catalog.items) {
      if (!item.gtin || !SHARED_PRODUCE_CODE.test(item.gtin) || !item.name) continue;
      const conceptId = assignConcept(item.name, list);
      if (!conceptId) continue;
      const fams = byCode.get(item.gtin) ?? new Map();
      if (!fams.has(familyHead(chainId))) fams.set(familyHead(chainId), conceptId);
      byCode.set(item.gtin, fams);
    }
  }
  const demote = new Map(); // code -> Set(familyHead) that loses it
  for (const [code, fams] of byCode) {
    if (new Set(fams.values()).size < 2) continue;
    const votes = new Map();
    for (const c of fams.values()) votes.set(c, (votes.get(c) ?? 0) + 1);
    const [top, n] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    const majority = n * 2 > fams.size ? top : null;
    demote.set(code, new Set([...fams].filter(([, c]) => c !== majority).map(([head]) => head)));
  }
  const demoted = [];
  for (const [chainId, data] of Object.entries(chains)) {
    const head = familyHead(chainId);
    for (const item of data.catalog.items) {
      if (item.gtin && demote.get(item.gtin)?.has(head)) { demoted.push({ chain: chainId, code: item.gtin, name: item.name }); item.gtin = null; }
    }
    for (const code of Object.keys(data.online?.items ?? {})) if (demote.get(code)?.has(head)) delete data.online.items[code];
  }
  return demoted;
}

/** A weighed card already carries every chain's loose kilo of its concept, yet a chain that published that
 * kilo under a 13-digit code also got a product of its own beside the card: searching "מלפפון" showed the
 * card and then "מלפפון" again, "רק בשופרסל", "רק בחצי חינם" (Naor, 28.9 - 138 such cards across the produce
 * aisle). Before 23.9 the 3-chain floor hid them; publishing every product brought them back as duplicates.
 *
 * Such a product folds into the card: it leaves products.json and its rows lose the code, so they ride along
 * as the card's concept rows exactly like a chain's internal produce codes - the card, its sources and the
 * basket price are unchanged. Only a product that IS the card folds: every row sold by weight and admitted
 * by conceptItemCandidate (so never organic), priced inside the card's band, and a name that is the
 * concept's own name, a synonym, or a name some chain already prices the card by, once the packaging words
 * are gone ("מלפפון ארוז", "עגבניה (ק)", "תפוח עץ סמיט"). Several chains sharing one produce code fold the
 * same way - "גזר ארוז" at four chains is the carrot card again.
 * A variety keeps its card - "תפוח עץ גאלה", "מלון גולדן סוויט" are what a shopper searches for by name.
 * Nobody stores these product ids yet (Naor, 28.9), which is what makes removing them safe today. */
const PACKAGING_WORDS = /(^| )(ארוז(ה|ימ|ות)?|מובחר(ת|ימ|ות)?|ישראל(י|ית)?|טרי(ה|ימ|ות)?|במשקל|משקל|בתפזורת|תפזורת|ברשת|יח|יחידה|יחידות|לק"?ג|ק"?ג|קג|ק|גדול(ה|ימ)?|רגיל(ה|ימ)?|אוצר הארצ|שטופ(ה|ימ)?|נקי(ה|ימ)?|שקיל|מחיר|לפי|דג|\d+)(?= |$)/g;
const produceCore = (s) => {
  // The same product in each chain's spelling: "תפו\"א"/"תפוא" is "תפוח אדמה", and "תפוח עץ X" is "תפוח X".
  let t = normalizeText(s).replace(/[()*.,\-]/g, ' ').replace(/(^| )תפו"?א(?= |$)/g, '$1תפוח אדמה').replace(/(^| )תפוח עצ(?= |$)/g, '$1תפוח');
  for (let prev = null; prev !== t;) { prev = t; t = t.replace(PACKAGING_WORDS, ' '); }
  return t.replace(/\s+/g, ' ').trim();
};
export function foldIntoConceptCards(products, chains, list = defaultConcepts()) {
  const cards = new Map(products.filter((p) => p.kind === 'concept').map((p) => [p.conceptId, p]));
  if (!cards.size) return { products, folded: [] };
  const rows = new Map(); // gtin -> [{ chainId, item }]
  for (const [chainId, { catalog }] of Object.entries(chains)) {
    for (const item of catalog.items) if (item.gtin) rows.set(item.gtin, [...(rows.get(item.gtin) ?? []), { chainId, item }]);
  }
  const fold = new Set();
  for (const p of products) {
    const card = p.kind !== 'concept' && p.isWeighted && p.gtin ? cards.get(p.conceptId) : null;
    if (!card) continue;
    const own = rows.get(p.gtin) ?? [];
    if (!own.length) continue;
    if (!own.every((r) => conceptItemCandidate(r.item) && !packerOutOfPlace(r.item, p.conceptId, list) && withinConceptBand(r.item.price, card.basePrice))) continue;
    // The card's own name, its synonyms, and every name a chain already prices the card by.
    const concept = conceptById(p.conceptId, list);
    const names = new Set([concept?.name, ...(concept?.synonyms ?? []), ...(card.sources ?? []).map((src) => src.name)].filter(Boolean).map(produceCore));
    if (!names.has(produceCore(p.name))) continue;
    fold.add(p.gtin);
  }
  for (const { catalog } of Object.values(chains)) for (const item of catalog.items) if (item.gtin && fold.has(item.gtin)) item.gtin = null;
  return { products: products.filter((p) => !fold.has(p.gtin)), folded: products.filter((p) => fold.has(p.gtin)) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const chains = loadChains();
  if (!Object.keys(chains).length) { console.error('no downloaded price data in data/prices - run scripts/fetch-prices.mjs first'); process.exit(1); }
  const demotedCodes = demoteClashingSharedCodes(chains);
  if (demotedCodes.length) console.log(`shared produce codes a chain reuses for something else, kept internal there: ${demotedCodes.length} row(s) - ${demotedCodes.slice(0, 8).map((d) => `${d.chain} ${d.code.slice(-3)} "${d.name}"`).join(', ')}`);
  const report = {};
  const gtinAliases = loadGtinAliases();
  const { products, folded } = foldIntoConceptCards(buildProducts(chains, { report, aliases: gtinAliases }), chains);
  if (folded.length) console.log(`weighed products folded into their concept card (the card already carries that chain's kilo): ${folded.length} - ${folded.slice(0, 8).map((p) => `"${p.name}"`).join(', ')}`);
  const gtins = new Set(products.map((p) => p.gtin));
  const conceptProducts = products.filter((p) => p.kind === 'concept');
  const conceptPrices = new Map(conceptProducts.map((p) => [p.conceptId, p.basePrice]));
  const productsPath = path.join(ROOT, 'data', 'products.json');
  writeFileSync(productsPath, JSON.stringify(products, null, 1) + '\n');
  // The consumers read config/ over HTTP, where there is no readdir: without this index a concept file
  // added here would simply not exist in production, and the concepts in it would look like substitutes
  // that vanished (docs/PIPELINE-CONTRACT.md §6).
  writeFileSync(path.join(CONCEPTS_DIR, INDEX_FILE), JSON.stringify({ files: conceptFiles(), typeWords: TYPE_WORDS_FILE }, null, 1) + '\n');
  const productsJsonBytes = statSync(productsPath).size;
  const productsJsonMb = Math.round((productsJsonBytes / (1024 * 1024)) * 100) / 100;
  // Department shards (docs/PIPELINE-CONTRACT.md §2.1.1): data/products/<slug>.json + data/products-index.json,
  // additive alongside products.json - a consumer downloads one department instead of the whole catalog.
  const shardRows = writeProductShards(products);
  const shardTable = [...shardRows].sort((a, b) => b.bytes - a.bytes)
    .map((r) => `  ${r.name.padEnd(18)} ${String(r.count).padStart(6)} products  ${(Math.round((r.bytes / (1024 * 1024)) * 100) / 100).toFixed(2).padStart(6)} MB  ${r.file}`)
    .join('\n');
  const oversizedShards = shardRows.filter((r) => r.bytes > MAX_SHARD_BYTES);
  const catalogDir = path.join(ROOT, 'data', 'catalogs');
  // A chain with no catalog.full.json at all is "missing" (below); a chain that has one but whose fetch
  // was flagged failed is still built from it and only shown as stale (docs/PIPELINE-CONTRACT.md §2.4).
  const pipelineStatus = readPipelineStatus();
  const summary = [];
  for (const [chainId, data] of Object.entries(chains)) {
    const status = pipelineStatus?.chains?.[chainId];
    const slim = slimCatalog(chainId, data, gtins, { conceptPrices, status });
    writeFileSync(path.join(catalogDir, `${chainId}.json`), JSON.stringify(slim) + '\n');
    const v = slim.source.online?.verify;
    const privateLabelCount = slim.items.filter((i) => i.privateLabel).length;
    const conceptItemCount = slim.items.filter((i) => i.conceptId).length;
    const sharedCount = slim.items.length - privateLabelCount - conceptItemCount;
    summary.push(`${chainId.padEnd(12)} ${String(slim.items.length).padStart(5)} of ${products.length} products (${sharedCount} shared, ${privateLabelCount} private-label, ${conceptItemCount} concept)  store ${data.catalog.source?.store ?? '-'}${v?.compared ? `  site check: ${v.identical}/${v.compared} identical, ${v.mismatchPct}% differ` : ''}${slim.fetchStatus === 'failed' ? `  stale since ${slim.failedSince}` : ''}`);
  }
  // chains without real data must not show fake prices: drop their seed catalogs, loudly - this is the
  // one case that still removes a chain from the comparison (decision 22.9), so both the log and the
  // published status (when one exists) must say so unambiguously.
  const missingChainIds = [];
  for (const file of readdirSync(catalogDir)) {
    const id = file.replace(/\.json$/, '');
    if (id !== 'demo' && !chains[id]) {
      unlinkSync(path.join(catalogDir, file));
      summary.push(`${id.padEnd(12)} removed (no price data)`);
      console.error(`${id} MISSING: no price data on disk - not in the comparison`);
      missingChainIds.push(id);
    }
  }
  if (missingChainIds.length) {
    const updatedStatus = markChainsMissing(pipelineStatus, missingChainIds);
    if (updatedStatus) writePipelineStatus(updatedStatus);
  }
  const demo = generateCatalog('demo', products.slice(0, 150));
  writeFileSync(path.join(catalogDir, 'demo.json'), JSON.stringify(demo, null, 1) + '\n');
  const cats = new Map(); for (const p of products) cats.set(p.category, (cats.get(p.category) ?? 0) + 1);
  const totalPrivateLabel = products.filter((p) => p.privateLabelOf).length;
  const conceptCoverage = Math.round((1000 * products.filter((p) => p.conceptId).length) / products.length) / 10;
  const sizeCoverage = Math.round((1000 * products.filter((p) => p.size).length) / products.length) / 10;
  const conceptCats = new Map(); for (const p of conceptProducts) conceptCats.set(p.category, (conceptCats.get(p.category) ?? 0) + 1);
  const avgConceptChains = conceptProducts.length ? Math.round((10 * conceptProducts.reduce((s, p) => s + p.chains, 0)) / conceptProducts.length) / 10 : 0;
  console.log(`products: ${products.length} (${products.length - totalPrivateLabel - conceptProducts.length} shared, ${totalPrivateLabel} private-label, ${conceptProducts.length} concept)\ncategories: ${[...cats.entries()].map(([c, n]) => `${c} ${n}`).join(', ')}\nconcept products by category: ${[...conceptCats.entries()].map(([c, n]) => `${c} ${n}`).join(', ') || '(none)'}  avg chains/concept: ${avgConceptChains}\nconcept coverage: ${conceptCoverage}%  size coverage: ${sizeCoverage}%\nproducts.json: ${productsJsonMb} MB\ndepartment shards (sorted by size):\n${shardTable}\n${summary.join('\n')}`);
  // Concept health, as a warning in the run report rather than a test: a product whose name says its concept's
  // word is only a flavour, filling or scent ("חטיפי קרח בטעמי פירות" under a fruit concept) means a rule
  // matched too widely. It used to be a ratchet in npm test, and on 22.9 one new olive product turned it red and
  // cancelled four publishes; a quality metric must not block the day's prices. Review with
  // `node scripts/category-labels.mjs --concept-health`, then fix the rule or clear the product in
  // config/categories/concept-reviewed.json.
  const { flavourPollution } = await import('./category-labels.mjs');
  const polluted = flavourPollution(products);
  const pollutedTotal = polluted.reduce((n, r) => n + r.hit.length, 0);
  if (pollutedTotal) {
    const examples = polluted.slice(0, 5).map((r) => `${r.id} ${r.hit.length}/${r.items.length}${r.hit[0]?.name ? ` (e.g. "${r.hit[0].name}")` : ''}`).join('; ');
    console.error(`warn: ${pollutedTotal} product(s) carry their concept's word as a flavour, filling or scent - a concept rule matches too widely; review with scripts/category-labels.mjs --concept-health: ${examples}`);
  }
  // Cross-checks between name, department, concept and size (docs/PLAN-PRODUCT-TRUTH.md stage א): the
  // products that need a human look, with the evidence, in data/review-queue.json. A warn line, never fatal.
  {
    const { productChecks, summarizeChecks, compileDepartmentGuards } = await import('../src/catalog/productChecks.js');
    const guardsFile = path.join(ROOT, 'config', 'categories', 'department-guards.json');
    const departmentGuards = existsSync(guardsFile) ? compileDepartmentGuards(JSON.parse(readFileSync(guardsFile, 'utf8'))) : null;
    const { parseSize } = await import('../src/catalog/size.js');
    const { categoryLabel, displayName } = await import('../src/catalog/categoryLabels.js');
    const checks = productChecks(products, report.namesByGtin ?? new Map(), {
      conceptById: (id) => conceptById(id, defaultConcepts()), parseSize,
      keywordCategory: (name) => categorize(name), labelOf: (id) => categoryLabel(id), manualName: (id) => displayName(id), verifiedOf: (id) => verifiedRecord(id), departmentGuards,
    });
    writeFileSync(path.join(ROOT, 'data', 'review-queue.json'), JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), count: checks.items.length, byRule: checks.byRule, items: checks.items }, null, 1) + '\n');
    if (checks.items.length) console.error(`warn: ${summarizeChecks(checks)} - data/review-queue.json`);
  }
  // How much room the weighed band still has. A warn line, never an abort: one bad product must not cancel
  // a day's publish (docs/RUNNER-MAC.md). It is here because the margin is shrinking as concepts multiply -
  // the widest concept sat 2.38x from its median when 3x was chosen, 2.50x after the 24.9 split and 2.76x
  // after the 27.9 produce round - and the day one crosses 3x a real chain is dropped with only a log line.
  // A concept near the ratio is usually a prepared or frozen form leaking in rather than real variation:
  // "פריזר מיני שום" at 55 against fresh garlic at 9.90, cut pineapple at 40-49 against a whole one at 12.90.
  const bandRows = (report.conceptBand ?? []).slice().sort((a, b) => b.worst - a.worst);
  if (bandRows.length) {
    const near = bandRows.filter((r) => r.worst >= CONCEPT_PRICE_RATIO * 0.8);
    console.log(`weighed band: ${bandRows.length} concepts, widest ${bandRows[0].worst.toFixed(2)}x of its median (${bandRows[0].conceptId}), threshold ${CONCEPT_PRICE_RATIO}x`);
    if (near.length) console.error(`warn: ${near.length} weighed concept(s) within 20% of the ${CONCEPT_PRICE_RATIO}x band - check for a prepared or frozen form in the concept: ${near.map((r) => `${r.conceptId} ${r.worst.toFixed(2)}x`).join(', ')}`);
  }
  // Chains that lost their vote on a weighed concept: normally a handful, and each one is a chain
  // publishing something that is not a kilo of the concept. A concept that loses so many chains that it
  // stops being published at all is listed too - that is a product card disappearing from the app.
  const disagreements = report.conceptDisagreements ?? [];
  if (disagreements.length) {
    const emitted = new Set(conceptProducts.map((p) => p.conceptId));
    console.log(`\nweighed concepts: ${disagreements.length} chain(s) dropped for disagreeing by more than ${CONCEPT_PRICE_RATIO}x with the concept median`);
    for (const d of disagreements) console.log(`  ${d.conceptId.padEnd(20)} ${d.head.padEnd(12)} ${String(d.price).padStart(8)} vs median ${d.provisional}${emitted.has(d.conceptId) ? '' : '   (concept no longer published)'}`);
  }
  // The invariant the two-pass build exists to hold, checked against the raw price files rather than
  // against the filtered output - re-reading the written catalogs would only re-apply the band they were
  // already filtered by and could never fail. Every chain whose price file offers a weighed row for a
  // published concept must either be priced within CONCEPT_PRICE_RATIO of that concept's basePrice, or be
  // one of the chains buildConceptProducts explicitly dropped. Anything else means the product card and
  // the cart line no longer agree about what a kilo costs - a bunch priced as a kilo again, or the two
  // paths having drifted apart in a refactor. It is reported loudly, not fatal: the row is already outside
  // the band slimCatalog admits, so no cart line is priced from it, and a red build would cancel the day's
  // publish for all 14 chains over one chain's row - the per-chain rule of 22.9 (docs/PLAN-PER-CHAIN-AND-
  // PRICE-HISTORY.md part A) says one chain's problem never blocks the others. The refactor-drift case is
  // covered by test/buildProducts.test.js (docs/CONCEPTS.md §6).
  const dropped = new Set(disagreements.map((d) => `${d.conceptId}|${d.head}`));
  const conceptList = defaultConcepts();
  const unpriceable = [];
  for (const [chainId, data] of Object.entries(chains)) {
    const head = familyHead(chainId);
    const cheapest = new Map(); // conceptId -> cheapest candidate row this chain publishes
    for (const item of data.catalog.items) {
      if (!conceptItemCandidate(item)) continue;
      const conceptId = assignConcept(item.name, conceptList);
      if (conceptId == null || !conceptPrices.has(conceptId) || packerOutOfPlace(item, conceptId, conceptList)) continue;
      const cur = cheapest.get(conceptId);
      if (!cur || item.price < cur.price) cheapest.set(conceptId, item);
    }
    for (const [conceptId, item] of cheapest) {
      if (withinConceptBand(item.price, conceptPrices.get(conceptId))) continue;
      if (dropped.has(`${conceptId}|${head}`)) continue;
      unpriceable.push(`${chainId} ${conceptId} ${item.price} (basePrice ${conceptPrices.get(conceptId)}) ${item.name}`);
    }
  }
  if (unpriceable.length) {
    console.error(`warn: ${unpriceable.length} weighed concept row(s) more than ${CONCEPT_PRICE_RATIO}x from their basePrice and not recorded as dropped (excluded from the chain catalogs by the band; the build continues):\n  ${unpriceable.join('\n  ')}`);
  }
  // Size is a warning, not a gate (Naor, 22.9: nothing about the data may cancel the day's publish). At 2.84 MB
  // the file is 6% under the 3 MB figure the UI was sized for; when it crosses, the consumers need to know,
  // and the answer is the R2/derived-files plan (DATA-SERVICE-PLAN §11-12), not a day without prices.
  if (productsJsonBytes > MAX_PRODUCTS_JSON_BYTES) {
    console.error(`warn: products.json is ${productsJsonMb} MB, over the ${MAX_PRODUCTS_JSON_BYTES / (1024 * 1024)} MB size the UI was designed for - published anyway; time to split or move the file (docs/DATA-SERVICE-PLAN.md §11-12)`);
  }
  // Per-shard warning (docs/PIPELINE-CONTRACT.md §2.1.1): the number that matters is what a single
  // department download costs a consumer, not the sum of them - so this checks each shard on its own
  // against MAX_SHARD_BYTES rather than the total across data/products/.
  if (oversizedShards.length) {
    console.error(`warn: ${oversizedShards.length} department shard(s) over the ${MAX_SHARD_BYTES / (1024 * 1024)} MB size a consumer actually downloads: ${oversizedShards.map((r) => `${r.name} (${(Math.round((r.bytes / (1024 * 1024)) * 100) / 100).toFixed(2)} MB)`).join(', ')} - published anyway (docs/PIPELINE-CONTRACT.md §2.1.1)`);
  }
}

#!/usr/bin/env node
/**
 * Build the unified product catalog and the slim per-chain catalogs from the downloaded price files.
 *
 *   node scripts/fetch-prices.mjs            # data/prices/<chain>/catalog.full.json (git-ignored)
 *   node scripts/online-prices.mjs           # data/prices/<chain>/online.json (optional overlays)
 *   node scripts/build-products.mjs [--min-chains 3] [--max 4000]
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
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { readPipelineStatus as readStatusFile, writePipelineStatus as writeStatusFile } from './lib/pipelineStatus.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCatalog } from '../src/catalog/seedCatalogs.js';
import { isPrivateLabel } from '../src/catalog/privateLabel.js';
import { categorize, ICONS } from '../src/catalog/categorize.js';
export { categorize, CATEGORY_RULES } from '../src/catalog/categorize.js';
import { concepts as defaultConcepts, assignConcept, conceptById, conceptFiles, hasFlavourMarker, CONCEPTS_DIR, INDEX_FILE } from '../src/catalog/concepts.js';
import { parseSize } from '../src/catalog/size.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRICES = path.join(ROOT, 'data', 'prices');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i === -1 ? def : argv[i + 1]; };
const MIN_CHAINS = Number(opt('min-chains', 3));
const MAX = Number(opt('max', 4000));
const MAX_PRODUCTS_JSON_BYTES = 3 * 1024 * 1024;
const PIPELINE_STATUS_PATH = path.join(ROOT, 'data', 'pipeline-status.json');

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
const median = (nums) => { const a = nums.filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const mode = (values) => { const c = new Map(); for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] ?? null; };

/** Size (docs/CONCEPTS.md §3) is computed from every name the barcode has across chains, not only
 * the chosen display name - a truncated chain's name often lost the size/unit entirely. Pick the
 * most common non-null parseSize result; ties go to the one seen on the longest contributing name. */
const pickSize = (names) => {
  const byKey = new Map();
  for (const n of names) {
    const size = parseSize(n);
    if (!size) continue;
    const key = `${size.value}|${size.unit}|${size.count}`;
    const entry = byKey.get(key);
    if (!entry) byKey.set(key, { size, count: 1, longest: n.length });
    else { entry.count++; entry.longest = Math.max(entry.longest, n.length); }
  }
  if (!byKey.size) return null;
  return [...byKey.values()].sort((a, b) => b.count - a.count || b.longest - a.longest)[0].size;
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

function loadChains() {
  const chains = {};
  if (!existsSync(PRICES)) return chains;
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
    chains[chainId] = { catalog: existsSync(full) ? JSON.parse(readFileSync(full, 'utf8')) : { chainId, items: [], source: null }, online: audit && existsSync(online) ? JSON.parse(readFileSync(online, 'utf8')) : null, codes: audit && existsSync(codes) ? JSON.parse(readFileSync(codes, 'utf8')) : null };
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
const SERVICE_ITEM_RE = /משלוח|איסוף|זיכוי|פיקדון/;

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
 * The list has to be named rather than derived: `pastrami-other` is just as broad by its id, and just as
 * much a catch-all by its rules, yet its chains cluster at 87-106 and it is a real per-kilo product - so
 * "the id ends in -other" is not the rule. A `weighedProduct: false` flag in config/concepts/ would put
 * this next to the concept it describes, which is where it belongs (docs/CONCEPTS.md §6 follow-up). */
const BUCKET_CONCEPTS = new Set(['deli-salad-other']);

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
function buildConceptProducts(chains, list) {
  const weightConcepts = new Set(list.filter((c) => c.sizeUnit === null).map((c) => c.id));
  if (!weightConcepts.size) return { products: [], disagreed: [] };
  const perConcept = new Map(); // conceptId -> Map(familyHead -> cheapest price)
  for (const [chainId, { catalog }] of Object.entries(chains)) {
    const head = familyHead(chainId);
    for (const item of catalog.items) {
      if (!conceptItemCandidate(item)) continue;
      const conceptId = assignConcept(item.name, list);
      if (!conceptId || !weightConcepts.has(conceptId) || BUCKET_CONCEPTS.has(conceptId)) continue;
      const byHead = perConcept.get(conceptId) ?? new Map();
      byHead.set(head, Math.min(byHead.get(head) ?? Infinity, item.price));
      perConcept.set(conceptId, byHead);
    }
  }
  const products = [];
  const disagreed = [];
  for (const [conceptId, byHead] of perConcept) {
    if (byHead.size < 3) continue;
    const provisional = median([...byHead.values()]);
    const agreeing = [...byHead.entries()].filter(([, price]) => withinConceptBand(price, provisional));
    for (const [head, price] of byHead) {
      if (!agreeing.some(([h]) => h === head)) disagreed.push({ conceptId, head, price, provisional });
    }
    if (agreeing.length < 3) continue;
    const concept = conceptById(conceptId, list);
    if (!concept) continue;
    const category = categorize(concept.name, conceptId, `c-${conceptId}`); // a reviewed label wins here too
    products.push({
      id: `c-${conceptId}`, name: concept.name, category, brand: null,
      unit: 'ק"ג', isWeighted: true, gtin: null, basePrice: median(agreeing.map(([, price]) => price)), aliases: concept.synonyms ?? [],
      icon: ICONS[category] ?? ICONS['כללי'], chains: agreeing.length, conceptId, size: null, privateLabelOf: null, kind: 'concept',
    });
  }
  return { products, disagreed };
}

export function buildProducts(chains, { minChains = MIN_CHAINS, max = MAX, concepts: conceptList, report } = {}) {
  const list = conceptList ?? defaultConcepts();
  const byGtin = new Map();
  const seen = (gtin) => byGtin.get(gtin) ?? byGtin.set(gtin, { chains: new Set(), names: [], brands: [], prices: [], weighted: 0, plFamilies: new Map() }).get(gtin);
  for (const [chainId, { catalog, online }] of Object.entries(chains)) {
    for (const item of catalog.items) {
      if (!item.gtin) continue;
      // Chains publish till rows that are not products at all ("זיכוי/חיוב שיקלי", "משלוח ענק אונליין");
      // they carry a barcode and a price, so only the name gives them away.
      if (!item.name || SERVICE_ITEM_RE.test(item.name)) continue;
      const g = seen(item.gtin);
      g.chains.add(chainId); g.names.push(cleanName(item.name)); g.brands.push(cleanName(item.brand)); g.prices.push(item.price); if (item.isWeighted) g.weighted++;
      // Private-label detection (src/catalog/privateLabel.js) only looks at what the chain itself
      // publishes (catalog.full.json), never the storefront overlay - see the loop below.
      if (isPrivateLabel(item, chainId)) {
        const head = familyHead(chainId);
        g.plFamilies.set(head, (g.plFamilies.get(head) ?? 0) + 1);
      }
    }
    for (const [gtin, p] of Object.entries(online?.items ?? {})) {
      const g = seen(gtin);
      g.chains.add(chainId); g.names.push(cleanName(p.name)); g.prices.push(p.price); if (p.isWeighted) g.weighted++;
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
  const candidates = [...sharedSlice, ...privateLabelExtras];
  const products = candidates.map(([gtin, g]) => {
    const name = bestName(g.names);
    const conceptId = pickConcept(g.names, list);
    const category = categorize(name, conceptId, `g${gtin}`); // reviewed label > concept category > keyword rules
    const isWeighted = g.weighted > g.chains.size / 2;
    return {
      id: `g${gtin}`, name, category, brand: mode(g.brands.filter((b) => b && !/^(לא ידוע|unknown|כללי)$/i.test(b))) ?? null,
      unit: isWeighted ? 'ק"ג' : "יח'", isWeighted, gtin, basePrice: median(g.prices), aliases: [], icon: ICONS[category], chains: g.chains.size,
      conceptId, size: pickSize(g.names), privateLabelOf: resolvePrivateLabelOf(g),
    };
  });
  // Concept products (weighted goods with no GTIN) are added on top, like private-label extras: they
  // never compete for the --max cap since they aren't in `entries`/`shared` at all.
  const concept = buildConceptProducts(chains, list);
  products.push(...concept.products);
  // Chains dropped for disagreeing are the signal that a concept's match rules or a chain's price file
  // moved; `report` lets the CLI print them without buildProducts having to know about the console.
  if (report) report.conceptDisagreements = concept.disagreed;
  products.sort((a, b) => a.category.localeCompare(b.category, 'he') || a.name.localeCompare(b.name, 'he'));
  return products;
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
  // Concept products (weighted goods, no GTIN, docs/CONCEPTS.md follow-up 19.9.2026): every item that
  // assigns to an emitted concept rides along, tagged with conceptId so MappingEngine can resolve it.
  // Barcoded items never get a conceptId here - that stays a products.json-only field (size budget).
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
      if (item.gtin && byGtin.has(item.gtin)) continue; // already included via the GTIN path
      if (!conceptItemCandidate(item)) continue;
      const conceptId = assignConcept(item.name, list);
      if (conceptId == null) continue;
      if (!withinConceptBand(item.price, conceptPrices.get(conceptId))) continue;
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
    fetchStatus: status?.status === 'failed' ? 'failed' : 'ok',
    failedSince: status?.failedSince ?? null,
    fetchedAt: status?.fetchedAt ?? null,
    priceSource: 'file',
    source: { ...(catalog.source ?? {}), siteCodes: codes ? { fetchedAt: codes.fetchedAt, known: Object.values(codes.items).filter((c) => c.code).length, notOnSite: Object.values(codes.items).filter((c) => c.code === null).length } : null, online: online ? { fetchedAt: online.fetchedAt, items: Object.keys(online.items).length, verify: { compared: verify.compared, identical: verify.identical, mismatchPct, examples: verify.examples } } : null },
    items: [...byGtin.values(), ...conceptExtras],
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const chains = loadChains();
  if (!Object.keys(chains).length) { console.error('no downloaded price data in data/prices - run scripts/fetch-prices.mjs first'); process.exit(1); }
  const report = {};
  const products = buildProducts(chains, { report });
  const gtins = new Set(products.map((p) => p.gtin));
  const conceptProducts = products.filter((p) => p.kind === 'concept');
  const conceptPrices = new Map(conceptProducts.map((p) => [p.conceptId, p.basePrice]));
  const productsPath = path.join(ROOT, 'data', 'products.json');
  writeFileSync(productsPath, JSON.stringify(products, null, 1) + '\n');
  // The consumers read config/ over HTTP, where there is no readdir: without this index a concept file
  // added here would simply not exist in production, and the concepts in it would look like substitutes
  // that vanished (docs/PIPELINE-CONTRACT.md §6).
  writeFileSync(path.join(CONCEPTS_DIR, INDEX_FILE), JSON.stringify({ files: conceptFiles() }, null, 1) + '\n');
  const productsJsonBytes = statSync(productsPath).size;
  const productsJsonMb = Math.round((productsJsonBytes / (1024 * 1024)) * 100) / 100;
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
  console.log(`products: ${products.length} (${products.length - totalPrivateLabel - conceptProducts.length} shared, ${totalPrivateLabel} private-label, ${conceptProducts.length} concept)\ncategories: ${[...cats.entries()].map(([c, n]) => `${c} ${n}`).join(', ')}\nconcept products by category: ${[...conceptCats.entries()].map(([c, n]) => `${c} ${n}`).join(', ') || '(none)'}  avg chains/concept: ${avgConceptChains}\nconcept coverage: ${conceptCoverage}%  size coverage: ${sizeCoverage}%\nproducts.json: ${productsJsonMb} MB\n${summary.join('\n')}`);
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
      if (conceptId == null || !conceptPrices.has(conceptId)) continue;
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
  if (productsJsonBytes > MAX_PRODUCTS_JSON_BYTES) {
    console.error(`products.json is ${productsJsonMb} MB, over the ${MAX_PRODUCTS_JSON_BYTES / (1024 * 1024)} MB cap - aborting`);
    process.exit(1);
  }
}

#!/usr/bin/env node
/**
 * PROPOSAL generator (never applies anything) for config/substitutes/rules.json `variant.groups[conceptId]`
 * - the exclusive-kind split src/pricing/substituteRules.js already understands (docs/CONCEPTS.md §4), today
 * only hand-written for oil-olive and baby-wipes. The owner wants it for every concept where a name can carry
 * an unnamed, mutually-exclusive grade (milk 1%/3%, rice white/basmati, shampoo kids/anti-dandruff, tuna in
 * oil/in water...) - this script finds CANDIDATE kind tokens for a human (and a reviewing agent) to turn into
 * `variant.groups` entries by hand, the same division of labour as scripts/alias-candidates.mjs.
 *
 *   node scripts/concept-kinds-propose.mjs
 *   DATA_ROOT=/path/to/data node scripts/concept-kinds-propose.mjs   # read a different data/ (read-only)
 *
 * For every concept with >= 8 non-weighed products (data/products.json, kind !== 'concept', isWeighted
 * false), this collects every name a product is known by - its own data/products.json name plus every
 * chain's name for its gtin (data/prices/<chain>/catalog.full.json, 14 chains) - normalizes with
 * `normalizeText` (src/catalog/matching.js: lowercase, niqqud stripped, final letters folded), tokenizes on
 * spaces, and counts PRODUCTS (not names) per surviving token. A token survives when its product count is
 * >= 3 and <= 60% of the concept's products, length >= 2, and it is not:
 *   - a number, or a token containing a digit;
 *   - a size/unit/packaging word (scripts/alias-candidates.mjs CONTENT_STOP, src/catalog/matching.js
 *     STOP_WORDS, and a short explicit top-up);
 *   - a kashrut/filler word (כשר, בדצ, מהדרינ, למהדרינ, פרווה, בהשגחת, העדה, החרדית, בעמ, מבצע, חדש, ארוז...);
 *   - a chain name (data/chains.json);
 *   - a brand word - the SAME noun-screened lexicon scripts/build-products.mjs builds
 *     (src/catalog/attrs.js buildBrandLexicon, over every product's brand field, which already carries
 *     config/products/brands.json's reviewed brands - build-products.mjs's reviewedBrand() wins outright
 *     over the chain-majority brand before the lexicon is built) UNION every literal word of every
 *     config/products/brands.json brand value (those are human-reviewed, so no noun screen needed there);
 *   - this concept's own identity: match.all/match.any/synonyms tokens (concept definitions, loaded via
 *     src/catalog/concepts.js so this script never re-parses the JSON schema itself) and
 *     config/substitutes/rules.json variant.words (every concept) plus variant.concepts[conceptId] (this
 *     concept only) - the flavour vocabulary the substitute engine already strips before comparing variants.
 * A FORM/state word (טרי, קפוא, מגורד, פרוס...) is deliberately NOT excluded - fresh vs frozen, whole vs
 * sliced, are exactly the kind of exclusive split this tool exists to surface (docs: Naor 28.9, fresh and
 * frozen are two concepts/two cards once a concept splits that way; the same shape applies one level down,
 * inside a single concept, for a grade word like טרי that only SOME products' names carry).
 *
 * The survivors are ranked by product count, capped at 15 per concept, and reported with 3 example product
 * names (the shortest full names in our own catalog that carry the token - not a chain's truncated name),
 * and co-occurrence against the concept's other candidates: two tokens that never co-occur are candidate
 * EXCLUSIVE kinds (a name picks one or the other); two that co-occur heavily are more likely attributes
 * (size, flavour the vocabulary missed, a qualifier) than a kind split. `uncovered` counts products whose
 * names carry none of the kept candidates.
 *
 * Writes data/local/concept-kinds-proposals.json (gitignored - working output, never published):
 *   { generatedAt, concepts: [{ id, name, category, products, candidates, uncovered, existingGroups }] }
 * sorted by category then products desc. `existingGroups` is the concept's current
 * config/substitutes/rules.json variant.groups[id], when one exists, so a reviewer sees what is already
 * decided before proposing more. Confirming a split is always a human decision; turn an entry into a real
 * `variant.groups[conceptId]` in config/substitutes/rules.json yourself, in priority order, the same way
 * oil-olive's spray/extra-virgin/refined split was written by hand (Naor, 10.10).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText, STOP_WORDS } from '../src/catalog/matching.js';
import { loadConcepts } from '../src/catalog/concepts.js';
import { buildBrandLexicon } from '../src/catalog/attrs.js';
import { CONTENT_STOP } from './alias-candidates.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = process.env.DATA_ROOT ? path.resolve(process.env.DATA_ROOT) : path.join(ROOT, 'data');

// Unit/size words the instructions call out by name - almost all already in CONTENT_STOP; kept explicit and
// unioned (rather than assumed) so a future edit to CONTENT_STOP can't silently drop one of these.
const EXTRA_CONTENT_STOP = ['מל', 'ליטר', 'גרמ', 'קג', 'יח', 'מארז', 'שקית', 'בקבוק', 'פחית', 'קופסה', 'צנצנת', 'יחידות'];
// Kashrut/filler words; כשר/בדצ/מהדרינ/חלק/בעמ/מבצע/חדש/ארוז are already in CONTENT_STOP - these five are not.
const KASHRUT_FILLER = ['כשר', 'בדצ', 'מהדרינ', 'חלק', 'למהדרינ', 'פרווה', 'בהשגחת', 'העדה', 'החרדית', 'בעמ', 'מבצע', 'חדש', 'ארוז'];

const norm = (s) => normalizeText(String(s ?? ''));
const wordsOf = (s) => norm(s).split(' ').filter(Boolean);
const addWords = (set, s) => { for (const t of wordsOf(s)) set.add(t); };

/** Hebrew glues a single one-letter prefix (ב/ה/ו/כ/ל/מ/ש - "in/the/and/like/to/from/that") onto the word
 *  it governs with no space, the same construct src/catalog/concepts.js's CONCEPT_PREFIX_LETTERS exists
 *  for. Without this, an excluded word only ever blocks its bare form: "מימ" (water) is a per-concept
 *  flavour word for tuna-canned, but "במימ" ("in water") is a different token and slipped through as a
 *  spurious candidate (10.10 run: ~10% of all raw candidates were exactly this - a prefixed form of a word
 *  already excluded some other way). Checked after the bare token, single prefix letter only. */
const PREFIX_LETTERS = new Set(['ב', 'ה', 'ו', 'כ', 'ל', 'מ', 'ש']);
const isExcluded = (token, exclusions) =>
  exclusions.has(token) || (token.length >= 3 && PREFIX_LETTERS.has(token[0]) && exclusions.has(token.slice(1)));

function loadProducts(dataRoot = DATA_ROOT) {
  return JSON.parse(readFileSync(path.join(dataRoot, 'products.json'), 'utf8'));
}

function loadChains(dataRoot = DATA_ROOT) {
  const file = path.join(dataRoot, 'chains.json');
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf8'));
}

function loadRules(root = ROOT) {
  return JSON.parse(readFileSync(path.join(root, 'config', 'substitutes', 'rules.json'), 'utf8'));
}

function loadBrandsJson(root = ROOT) {
  return JSON.parse(readFileSync(path.join(root, 'config', 'products', 'brands.json'), 'utf8'));
}

/** gtin -> every name a chain publishes for it (data/prices/<chain>/catalog.full.json, 14 chains). Mirrors
 *  scripts/alias-candidates.mjs loadNamesByGtin, over the same files, for every gtin (not just sized ones). */
function loadNamesByGtin(dataRoot = DATA_ROOT) {
  const dir = path.join(dataRoot, 'prices');
  const byGtin = new Map();
  if (!existsSync(dir)) return byGtin;
  for (const chain of readdirSync(dir)) {
    const file = path.join(dir, chain, 'catalog.full.json');
    if (!existsSync(file)) continue;
    let catalog;
    try { catalog = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    for (const item of catalog.items ?? []) {
      if (!item.gtin || !item.name) continue;
      if (!byGtin.has(item.gtin)) byGtin.set(item.gtin, []);
      byGtin.get(item.gtin).push(item.name);
    }
  }
  return byGtin;
}

/** Tokens from a concept's own identity: match.all/match.any (regex source strings) and synonyms.
 *  normalizeText already strips virtually every regex-syntax character down to a space (it keeps only
 *  letters, digits, `%`, `.` and whitespace, and a separate pass drops a lone `.`) so running a raw pattern
 *  source through it recovers its Hebrew content words; what is left over from regex syntax (a stray `d`
 *  from `\d`, a lone character-class letter) is at most 1 char and never survives the length >= 2 filter a
 *  real candidate needs - it is harmless if it ends up excluded too. */
function conceptOwnWords(concept) {
  const set = new Set();
  for (const s of concept.match?.all ?? []) addWords(set, s);
  for (const s of concept.match?.any ?? []) addWords(set, s);
  for (const s of concept.synonyms ?? []) addWords(set, s);
  return set;
}

/** Exclusions shared by every concept: unit/packaging/grade words, kashrut/filler words, chain names, the
 *  global flavour vocabulary, and brand words (a noun-screened lexicon built the same way
 *  scripts/build-products.mjs builds the one extractAttrs() uses, union every literal word of every
 *  reviewed config/products/brands.json brand). */
function buildGlobalExclusions({ products, rules, brandsJson, chains }) {
  const ex = new Set();
  for (const w of STOP_WORDS) addWords(ex, w);
  for (const w of CONTENT_STOP) addWords(ex, w);
  for (const w of EXTRA_CONTENT_STOP) addWords(ex, w);
  for (const w of KASHRUT_FILLER) addWords(ex, w);
  for (const c of chains) addWords(ex, c.name);
  for (const w of rules.variant?.words ?? []) addWords(ex, w);

  const brandLex = buildBrandLexicon(products.map((p) => p.brand), 5, products.map((p) => p.name));
  for (const t of brandLex) ex.add(t);
  for (const entry of Object.values(brandsJson.brands ?? {})) {
    if (entry && typeof entry === 'object') addWords(ex, entry.brand);
  }
  return ex;
}

/**
 * Pure core: given a concept's own products, a gtin -> chain-names map, and the full exclusion set for this
 * concept (globals + this concept's own match/synonym words + its variant.concepts flavour words), finds
 * candidate kind tokens.
 *
 * A product's token set is the union of tokens from every name it is known by (its own name + every
 * chain's name for its gtin); a token's count is the number of PRODUCTS whose token set contains it, not
 * the number of names. Returns { totalProducts, candidates, uncovered } where candidates is ranked by count
 * desc and capped at `topN`, each carrying { token, count, share, examples, cooccur }.
 */
export function proposeKinds(conceptProducts, namesByGtin, exclusions, { topN = 15 } = {}) {
  const totalProducts = conceptProducts.length;
  const tokenSets = []; // [{ product, tokens: Set<string> }]
  const tokenCount = new Map();

  for (const product of conceptProducts) {
    const names = [product.name, ...(namesByGtin.get(product.gtin) ?? [])].filter(Boolean);
    const tokens = new Set();
    for (const name of names) {
      for (const t of wordsOf(name)) {
        if (t.length < 2) continue;
        if (/\d/.test(t)) continue; // numbers and tokens containing digits
        if (isExcluded(t, exclusions)) continue;
        tokens.add(t);
      }
    }
    tokenSets.push({ product, tokens });
    for (const t of tokens) tokenCount.set(t, (tokenCount.get(t) ?? 0) + 1);
  }

  const maxShare = 0.6;
  let candidates = [...tokenCount.entries()]
    .filter(([, count]) => count >= 3 && count <= totalProducts * maxShare)
    .map(([token, count]) => ({ token, count, share: Math.round((count / totalProducts) * 1000) / 1000 }));
  candidates.sort((a, b) => b.count - a.count || a.token.localeCompare(b.token, 'he'));
  candidates = candidates.slice(0, topN);

  const byToken = new Map(candidates.map((c) => [c.token, c]));
  for (const c of candidates) { c.examples = []; c.cooccur = {}; }

  let uncovered = 0;
  for (const { product, tokens } of tokenSets) {
    const present = [...tokens].filter((t) => byToken.has(t));
    if (!present.length) uncovered++;
    for (const t of present) {
      const c = byToken.get(t);
      if (product.name) c.examples.push(product.name);
    }
    for (let i = 0; i < present.length; i++) {
      for (let j = 0; j < present.length; j++) {
        if (i === j) continue;
        const a = byToken.get(present[i]);
        const b = present[j];
        a.cooccur[b] = (a.cooccur[b] ?? 0) + 1;
      }
    }
  }
  for (const c of candidates) {
    c.examples = [...new Set(c.examples)].sort((a, b) => a.length - b.length).slice(0, 3);
  }

  return { totalProducts, candidates, uncovered };
}

function groupProductsByConcept(products) {
  const byConcept = new Map();
  for (const p of products) {
    if (p.kind === 'concept') continue;
    if (p.isWeighted) continue;
    if (!p.conceptId) continue;
    if (!byConcept.has(p.conceptId)) byConcept.set(p.conceptId, []);
    byConcept.get(p.conceptId).push(p);
  }
  return byConcept;
}

function run() {
  const t0 = Date.now();
  const products = loadProducts();
  const rules = loadRules();
  const brandsJson = loadBrandsJson();
  const chains = loadChains();
  const namesByGtin = loadNamesByGtin();
  const concepts = loadConcepts();

  const globalExclusions = buildGlobalExclusions({ products, rules, brandsJson, chains });
  const variantByConcept = new Map();
  for (const [id, words] of Object.entries(rules.variant?.concepts ?? {})) {
    if (id.startsWith('_')) continue;
    const set = new Set();
    for (const w of words) addWords(set, w);
    variantByConcept.set(id, set);
  }
  const groupsByConcept = rules.variant?.groups ?? {};

  const byConcept = groupProductsByConcept(products);
  const conceptById = new Map(concepts.map((c) => [c.id, c]));

  const out = [];
  for (const [conceptId, conceptProducts] of byConcept) {
    if (conceptProducts.length < 8) continue;
    const concept = conceptById.get(conceptId);
    if (!concept) continue; // a conceptId on a product with no matching concept definition - not this tool's job

    const exclusions = new Set(globalExclusions);
    for (const t of conceptOwnWords(concept)) exclusions.add(t);
    for (const t of variantByConcept.get(conceptId) ?? []) exclusions.add(t);

    const { totalProducts, candidates, uncovered } = proposeKinds(conceptProducts, namesByGtin, exclusions);
    const existingGroups = Object.prototype.hasOwnProperty.call(groupsByConcept, conceptId) ? groupsByConcept[conceptId] : null;

    out.push({
      id: concept.id,
      name: concept.name,
      category: concept.category,
      products: totalProducts,
      candidates,
      uncovered,
      existingGroups,
    });
  }

  out.sort((a, b) => a.category.localeCompare(b.category, 'he') || b.products - a.products);

  const outDir = path.join(ROOT, 'data', 'local');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'concept-kinds-proposals.json');
  const generatedAt = new Date().toISOString();
  writeFileSync(outPath, JSON.stringify({ generatedAt, concepts: out }, null, 1) + '\n');

  const ms = Date.now() - t0;
  console.log(`concept-kinds-propose: ${out.length} concepts with >= 8 non-weighed products got proposals (of ${byConcept.size} concepts with any such products) in ${ms}ms - full list in data/local/concept-kinds-proposals.json`);

  const clearSplits = out
    .map((c) => {
      let best = null;
      for (const a of c.candidates) {
        for (const b of c.candidates) {
          if (a.token >= b.token) continue;
          const cooc = a.cooccur[b.token] ?? 0;
          if (cooc > 0) continue;
          const score = Math.min(a.count, b.count);
          if (!best || score > best.score) best = { a: a.token, b: b.token, countA: a.count, countB: b.count, score };
        }
      }
      return best ? { id: c.id, name: c.name, ...best } : null;
    })
    .filter(Boolean)
    .sort((x, y) => y.score - x.score)
    .slice(0, 10);

  console.log(`\ntop ${clearSplits.length} clearest exclusive-looking splits (two candidates, zero co-occurrence, ranked by the smaller side's count):`);
  for (const s of clearSplits) console.log(`  ${s.id} (${s.name}): "${s.a}" (${s.countA}) vs "${s.b}" (${s.countB})`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) run();

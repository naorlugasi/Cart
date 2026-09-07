/**
 * Hebrew-aware fuzzy matching used to map weighted / unpackaged products
 * (vegetables, fruit, meat, deli) between our catalog and each chain's catalog.
 *
 * Packaged goods are matched exactly by GTIN elsewhere; this module only has to be
 * good at "מלפפון בלאדי" -> "מלפפון שקיל מובחר" style comparisons.
 */

const NIQQUD = /[\u0591-\u05C7]/g;
const FINAL_LETTERS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** Words that carry little identity in product names (packaging, grade, unit words). */
export const STOP_WORDS = new Set([
  'שקיל', 'שקילה', 'שקילים', 'שקילות', 'במשקל', 'משקל',
  'מובחר', 'מובחרת', 'מובחרים', 'מעולה', 'איכותי', 'איכות', 'פרימיום',
  'טרי', 'טריה', 'טרייה', 'טריים', 'טריות',
  'ארוז', 'ארוזה', 'ארוזים', 'מארז', 'יחידה', 'יחידות', 'יח',
  'קג', 'גרם', 'גר', 'ליטר', 'מל', 'לקג', 'ליח', 'לקילו', 'קילו',
  'בלאדי', 'ערבי', 'סוג', 'א', 'ב', 'של', 'עם', 'ללא', 'בערך', 'כ', 'לערך',
  'חדש', 'מבצע', 'מהדורה',
]);

export function normalizeText(input) {
  let text = String(input ?? '').toLowerCase().replace(NIQQUD, '');
  text = text.replace(/[״"'`׳]/g, '');
  text = text.replace(/[^\p{L}\p{N}%.\s]/gu, ' ');
  text = text.replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
  text = text.replace(/[ךםןףץ]/g, (c) => FINAL_LETTERS[c]);
  return text.replace(/\s+/g, ' ').trim();
}

/** Very small Hebrew stemmer: strips common plural / feminine suffixes. */
export function stem(token) {
  if (/^[\d.%]+$/.test(token)) return token;
  // tokens are already normalized (final letters mapped), so the masculine plural ends with 'ימ'
  if (token.length > 3 && (token.endsWith('ימ') || token.endsWith('ים') || token.endsWith('ות'))) return token.slice(0, -2);
  if (token.length > 3 && (token.endsWith('ה') || token.endsWith('ת'))) return token.slice(0, -1);
  return token;
}

export function tokenize(input, { keepStopWords = false } = {}) {
  return normalizeText(input)
    .split(' ')
    .filter((t) => t && (keepStopWords || !STOP_WORDS.has(t)))
    .map(stem)
    .filter((t) => keepStopWords || !STOP_WORDS.has(t));
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function charScore(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  const max = Math.max(na.length, nb.length);
  if (!max) return 0;
  return 1 - levenshtein(na, nb) / max;
}

/** Similarity in [0, 1] between two product names. */
export function similarity(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return charScore(a, b) * 0.5;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  const jaccard = inter / union;
  const containment = inter / Math.min(ta.size, tb.size);
  let score = 0.5 * jaccard + 0.25 * containment + 0.25 * charScore(a, b);

  // Conflicting percentages (3% vs 1% milk) are a strong signal of a different product.
  const pa = [...ta].filter((t) => t.endsWith('%'));
  const pb = [...tb].filter((t) => t.endsWith('%'));
  if (pa.length && pb.length && !pa.some((p) => pb.includes(p))) score *= 0.6;
  return Math.max(0, Math.min(1, score));
}

/**
 * Rank `candidates` by similarity to `query`.
 * Returns [{ candidate, score }] sorted best-first, only entries >= threshold.
 */
export function rankMatches(query, candidates, { key = 'name', threshold = 0.55, limit = 5, aliasesKey = 'aliases' } = {}) {
  const scored = [];
  for (const candidate of candidates) {
    const names = [typeof key === 'function' ? key(candidate) : candidate[key]];
    const aliases = candidate[aliasesKey];
    if (Array.isArray(aliases)) names.push(...aliases);
    let best = 0;
    for (const name of names) {
      if (!name) continue;
      best = Math.max(best, similarity(query, name));
      if (best >= 0.999) break;
    }
    if (best >= threshold) scored.push({ candidate, score: Math.round(best * 1000) / 1000 });
  }
  scored.sort((x, y) => y.score - x.score);
  return limit ? scored.slice(0, limit) : scored;
}

export function findBestMatch(query, candidates, options = {}) {
  const [best] = rankMatches(query, candidates, { ...options, limit: 1 });
  return best ?? null;
}

/**
 * Catalog search used by the UI: substring hits first, then fuzzy hits.
 */
export function searchProducts(query, products, { limit = 30 } = {}) {
  const q = normalizeText(query);
  if (!q) return products.slice(0, limit);
  const qTokens = tokenize(query);
  const results = [];
  for (const product of products) {
    const haystack = [product.name, product.brand, product.category, ...(product.aliases ?? [])]
      .filter(Boolean)
      .map(normalizeText)
      .join(' | ');
    let score = 0;
    if (haystack.includes(q)) score = 1;
    else {
      const hTokens = new Set(tokenize(haystack, { keepStopWords: true }));
      const hits = qTokens.filter((t) => hTokens.has(t) || [...hTokens].some((h) => h.startsWith(t) && t.length >= 2)).length;
      if (qTokens.length && hits === qTokens.length) score = 0.8;
      else score = similarity(query, product.name) * 0.7;
    }
    if (score >= 0.4) results.push({ product, score });
  }
  results.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, 'he'));
  return results.slice(0, limit).map((r) => r.product);
}

/**
 * Cross-checks between the four facts every product carries - name, department, concept, size - and the
 * raw names the chains publish for the same barcode (docs/PLAN-PRODUCT-TRUTH.md, stage א, 23.9.2026).
 *
 * Each fact comes from a different source (chain names, the reviewed label, the concept regexes, the size
 * parser) and until now none of them checked the other: a product could be "שימורים" and carry the concept
 * of fresh parsley at the same time. These checks do not decide anything - they queue the product for review
 * with the evidence, and the build prints the counts as warn lines. Nothing here ever blocks a publish.
 *
 * Pure: the caller passes the products, the per-barcode chain names and the helpers, so the rules are unit
 * tested without price files. Rule ids are stable (the review page and the docs refer to them).
 */

const HEB_TOKEN = /[א-ת]{3,}/g;
const HEB_LETTER = /[א-ת]/;

/** Words a product uses to say what it is when it is NOT the fresh thing a produce/meat concept names. */
export const PROCESSED_TYPE_RE = /תבלין|תבליני|רוטב|ממרח|משקה|מיץ|סלט|גלידה|שימורי|אבקת|תערובת|חטיף|וופל|קרקר|ביסקוויט|פריכי|ריבה|סירופ|קונפיטור|מחית|קציצ|שניצל|נקניק|פסטרמה|מעושן|כבוש|בחומץ|מוחמצ|מיובש|יבש(?![א-ת])|קפוא|בציפוי|מצופה|נאגטס|פנקו|בפירורי|קריספי/;
/** For a RAW MEAT concept, freezing and cutting are forms of the same cut, not a different product: an
 * "אנטריקוט קפוא" or "אוסובוקו בקר קפוא" is still the steak, and docs/CATEGORIES.md keeps raw meat in
 * בשר ועוף however cold it is. Without this the check fired on 94 single-chain butcher lines alone - the
 * same exemption the concept layer makes in config/concepts/type-words.json (23.9). */
const MEAT_FORM_RE = /קפוא|מוקפא|פרוס|פרוסה|נתח|נתחי|קוביות|טחון|שלם/g;
const FRESH_CONCEPT_CATEGORIES = new Set(['ירקות ופירות', 'בשר ועוף']);

/** Units, pack words and function words say nothing about WHAT the product is, so they never count as agreement. */
const STOPWORDS = new Set(['גרם', 'גר', 'קילו', 'ליטר', 'יחידות', 'יחי', 'מארז', 'חבילה', 'חבילת', 'שקית', 'בקבוק', 'קופסה', 'קופסא', 'צנצנת', 'פחית', 'קרטון', 'זוג', 'שלישיה', 'שלישייה', 'רביעיה', 'רביעייה', 'שישיה', 'שישייה', 'מבצע', 'ללא', 'בטעם', 'טעם', 'עם', 'של', 'מן', 'בד"צ', 'מהדרין', 'כשר', 'לפסח', 'חדש', 'מהודר', 'מהודרת', 'סופר', 'אקסטרה', 'פרימיום', 'ארוז', 'ארוזה', 'טרי', 'טרייה', 'מעולה', 'איכותי']);
const tokensOf = (name) => new Set((String(name ?? '').match(HEB_TOKEN) ?? []).filter((t) => !STOPWORDS.has(t)));
/** Two Hebrew tokens "agree" when one is a prefix of the other (chains truncate, Hebrew inflects). */
const tokenMatch = (a, b) => a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
const shareToken = (setA, setB) => { for (const a of setA) for (const b of setB) if (tokenMatch(a, b)) return true; return false; };
const lastToken = (name) => { const t = String(name ?? '').trim().split(/\s+/).pop() ?? ''; return HEB_LETTER.test(t) ? t.replace(/[^א-ת]/g, '') : ''; };

const sizeKey = (s) => (s && Number.isFinite(s.value) ? `${s.value * (s.count || 1)}${s.unit}` : null);

/**
 * @param {Array} products - the built catalog (barcoded products; concept products are skipped)
 * @param {Map<string, Array<{chain:string,name:string}>>} namesByGtin - every chain's raw name per barcode
 * @param {object} deps - { conceptById(id), parseSize(name), keywordCategory(name), labelOf(id), manualName(id) }
 * @returns {{ items: Array, byRule: Record<string, number> }}
 */
export function productChecks(products, namesByGtin, deps) {
  const { conceptById, parseSize, keywordCategory, labelOf = () => null, manualName = () => null } = deps;
  const items = [];
  const byRule = {};
  const flag = (bucket, rule, priority, detail, suggestion = null) => { bucket.push({ rule, priority, detail, suggestion }); byRule[rule] = (byRule[rule] ?? 0) + 1; };

  for (const p of products) {
    if (p.kind === 'concept' || !p.gtin) continue;
    const found = [];
    const concept = p.conceptId ? conceptById(p.conceptId) : null;
    const chainNames = (namesByGtin.get(p.gtin) ?? []).filter((n) => n.name && n.name.length > 2);
    const distinct = [...new Map(chainNames.map((n) => [n.name, n])).values()];

    // 1. The concept says one department, the reviewed label another.
    if (concept?.category && p.category && concept.category !== p.category) {
      flag(found, 'concept-category', FRESH_CONCEPT_CATEGORIES.has(concept.category) ? 'high' : 'low',
        `המושג "${concept.name}" שייך ל${concept.category}, המוצר ב${p.category}`, 'לבדוק אם המושג נכון; אם לא - conceptId: null ברשומה');
    }
    // 2. A fresh concept on a product whose own name says it is processed.
    if (concept && FRESH_CONCEPT_CATEGORIES.has(concept.category)) {
      // a word the concept itself carries ("שניצל" in "שניצל עוף") is not evidence against it
      const own = new Set(tokensOf(concept.name));
      const meat = concept.category === 'בשר ועוף';
      const strip = (n) => { const kept = String(n).split(/\s+/).filter((t) => !own.has(t.replace(/[^א-ת]/g, ''))).join(' '); return meat ? kept.replace(MEAT_FORM_RE, ' ') : kept; };
      const said = [p.name, ...distinct.map((n) => n.name)].find((n) => PROCESSED_TYPE_RE.test(strip(n)));
      if (said) flag(found, 'type-word', 'high', `מושג טרי "${concept.name}" על שם שאומר מוצר מעובד: "${said}"`, 'conceptId: null או מושג מעובד');
    }
    // 3. The chains do not agree what this barcode is.
    if (distinct.length >= 2) {
      const sets = distinct.map((n) => ({ ...n, tokens: tokensOf(n.name) }));
      const outliers = sets.filter((a) => a.tokens.size && !sets.some((b) => b !== a && shareToken(a.tokens, b.tokens)));
      if (outliers.length && (distinct.length === 2 || outliers.length < distinct.length)) {
        const o = outliers[0];
        flag(found, 'name-disagreement', 'high', `${o.chain} קוראת לברקוד "${o.name}", השאר: "${sets.find((s) => s !== o)?.name}"`, 'ברקוד ממוחזר או טעות בקובץ של הרשת החריגה - לבדוק באתר שלה');
      }
    }
    // 4. Different chain names parse to different sizes.
    if (distinct.length >= 2) {
      const sizes = new Map();
      for (const n of distinct) { const k = sizeKey(parseSize(n.name)); if (k) sizes.set(k, n.name); }
      if (sizes.size > 1) {
        flag(found, 'size-disagreement', 'low', `גדלים שונים מהשמות: ${[...sizes.entries()].map(([k, n]) => `${k} ("${n}")`).join(' / ')}; נבחר ${sizeKey(p.size) ?? 'ללא'}`, 'לאשר את הגודל ברשומה');
      }
    }
    // 5. The chosen name is a chain's truncation while a fuller name exists.
    if (!manualName(p.id) && distinct.length >= 2) {
      const last = lastToken(p.name);
      const fuller = distinct.map((n) => n.name).filter((n) => n !== p.name && n.length > p.name.length)
        .find((n) => last.length >= 3 && [...tokensOf(n)].some((t) => t.length > last.length && t.startsWith(last)));
      if (fuller) flag(found, 'truncated-name', 'medium', `השם שנבחר נגמר במילה קטועה "${last}"`, `שם מלא יותר ברשת אחרת: "${fuller}"`);
    }
    // 6. The reviewed label disagrees with both the keyword rules and the concept - a reviewer may have slipped.
    const label = labelOf(p.id);
    if (label) {
      const kw = keywordCategory(p.name);
      if (kw && kw !== 'כללי' && kw !== label && (!concept || concept.category !== label)) {
        flag(found, 'label-vs-rules', 'low', `התווית ${label}, מילות המפתח אומרות ${kw}${concept ? `, המושג ${concept.category}` : ''}`, 'לאשר או לתקן את התווית');
      }
    }

    if (found.length) items.push({ id: p.id, name: p.name, category: p.category, conceptId: p.conceptId ?? null, chains: p.chains ?? null, names: distinct.map((n) => `${n.chain}: ${n.name}`), checks: found });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => rank[a.checks[0].priority] - rank[b.checks[0].priority] || b.checks.length - a.checks.length);
  for (const it of items) it.checks.sort((a, b) => rank[a.priority] - rank[b.priority]);
  return { items, byRule };
}

/** One-line summary for the build log. */
export function summarizeChecks({ items, byRule }) {
  const parts = Object.entries(byRule).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  const high = items.filter((i) => i.checks[0].priority === 'high').length;
  return `${items.length} product(s) queued for review (${high} high): ${parts || 'none'}`;
}

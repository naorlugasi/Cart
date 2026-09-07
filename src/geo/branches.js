import { normalizeText } from '../catalog/matching.js';

/** Known cities and their common spellings. Extend freely; matching is on normalized text. */
export const CITIES = {
  'תל אביב': ['תל-אביב', 'תל אביב יפו', 'תל אביב-יפו', 'ת"א', 'תא', 'יפו'],
  'ירושלים': ['ירושלם'],
  'חיפה': [],
  'באר שבע': ['באר-שבע', 'ב"ש'],
  'ראשון לציון': ['ראשון-לציון', 'ראשלצ', 'ראשל"צ'],
  'פתח תקווה': ['פתח-תקווה', 'פתח תקוה', 'פ"ת'],
  'נתניה': [],
  'חולון': [],
  'רמת גן': ['רמת-גן', 'ר"ג'],
  'גבעתיים': [],
  'בת ים': ['בת-ים'],
  'אשדוד': [],
  'אשקלון': [],
  'הרצליה': ['הרצלייה'],
  'רעננה': [],
  'כפר סבא': ['כפר-סבא', 'כפ"ס'],
  'הוד השרון': ['הוד-השרון'],
  'מודיעין': ['מודיעין מכבים רעות', 'מודיעין-מכבים-רעות'],
  'רחובות': [],
  'נס ציונה': ['נס-ציונה'],
  'קרית אונו': ['קריית אונו'],
  'בני ברק': ['בני-ברק'],
  'אילת': [],
  'טבריה': [],
  'נהריה': [],
  'עפולה': [],
};

const CITY_INDEX = Object.entries(CITIES)
  .flatMap(([city, aliases]) => [city, ...aliases].map((alias) => ({ city, alias: normalizeText(alias) })))
  .sort((a, b) => b.alias.length - a.alias.length);

export function normalizeCity(name) {
  const n = normalizeText(name);
  if (!n) return null;
  const hit = CITY_INDEX.find((e) => e.alias === n);
  return hit ? hit.city : null;
}

/**
 * Parse a free-text address ("הרצל 12, תל אביב") into { raw, street, city }.
 * The city is detected against the known list; the street is whatever comes before it.
 */
export function parseAddress(input) {
  if (input && typeof input === 'object') {
    const city = normalizeCity(input.city) ?? parseAddress(input.raw ?? '').city ?? null;
    return { raw: input.raw ?? [input.street, input.city].filter(Boolean).join(', '), street: input.street ?? null, city };
  }
  const raw = String(input ?? '').trim();
  const normalized = normalizeText(raw);
  const parts = raw.split(/[,\n]/).map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const city = normalizeCity(parts[i]);
    if (city) return { raw, city, street: parts.slice(0, i).join(', ') || null };
  }
  const hit = CITY_INDEX.find((e) => normalized === e.alias || normalized.endsWith(' ' + e.alias) || normalized.includes(' ' + e.alias + ' ') || normalized.startsWith(e.alias + ' '));
  return { raw, city: hit ? hit.city : null, street: hit ? raw.replace(new RegExp(hit.alias + '.*$'), '').replace(/[,\s]+$/, '') || null : null };
}

/**
 * Choose the chain branch that delivers to the given address.
 * Branches list `deliveryCities`; "*" means nationwide.
 */
export function selectBranch(chain, address) {
  const city = address?.city ?? null;
  const branches = chain.branches ?? [];
  if (!branches.length) return null;
  if (!city) return branches.find((b) => b.default) ?? branches[0];
  const serving = branches.filter((b) => (b.deliveryCities ?? []).some((c) => c === '*' || normalizeCity(c) === city));
  if (!serving.length) return null;
  serving.sort((a, b) => (a.deliveryFee ?? 0) - (b.deliveryFee ?? 0));
  return serving[0];
}

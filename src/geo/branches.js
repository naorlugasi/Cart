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
/**
 * Which branch serves this order.
 *
 * Decision 20.9: the service is online-only and we do not ask where the customer lives. The chains
 * deliver nationwide or close to it, and a hand-kept city list produced false refusals - Rami Levy was
 * told not to deliver to Ra'anana, which it certainly does. So a chain is never withheld for its
 * address: with a city we prefer a branch that names it (a nearer depot, a cheaper fee), and otherwise
 * we fall back to the chain's default branch rather than refusing.
 *
 * Pickup chains are different: the customer chooses the collection point, so `pickupBranches` returns
 * all of them and the caller lets the customer pick.
 */
export function selectBranch(chain, address) {
  const city = address?.city ?? null;
  const branches = chain.branches ?? [];
  if (!branches.length) return null;
  const preferred = branches.find((b) => b.default) ?? branches[0];
  if (!city) return preferred;
  const serving = branches.filter((b) => (b.deliveryCities ?? []).some((c) => c !== '*' && normalizeCity(c) === city));
  if (!serving.length) return preferred;
  serving.sort((a, b) => (a.deliveryFee ?? 0) - (b.deliveryFee ?? 0));
  return serving[0];
}

/** Every collection point of a pickup chain, for the customer to choose from. */
export function pickupBranches(chain) {
  return chain.pickupOnly ? (chain.branches ?? []).map((b) => ({ id: b.id, name: b.name, city: b.city ?? null })) : [];
}

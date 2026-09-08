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
 *   data/catalogs/<chain>.json  each chain's items for those products only (online prices where an
 *                               online.json overlay exists), so the app ships a few MB instead of the
 *                               full 15k-item files
 *   data/catalogs/demo.json     demo store catalog regenerated for the new product set
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCatalog } from '../src/catalog/seedCatalogs.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRICES = path.join(ROOT, 'data', 'prices');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i === -1 ? def : argv[i + 1]; };
const MIN_CHAINS = Number(opt('min-chains', 3));
const MAX = Number(opt('max', 4000));

/** Category rules: first matching keyword wins (order matters). */
export const CATEGORY_RULES = [
  ['ירקות ופירות', /עגבני|מלפפון|תפוח|בננ|אבוקדו|לימון|בצל|גזר|פלפל|תפו"?א|תפוח אדמה|חסה|כרוב|אבטיח|מלון|ענב|תות|אגס|אפרסק|שזיף|נקטרינ|קלמנטינ|תפוז|אשכולית|קישוא|חציל|בטטה|פטרוזיליה|כוסבר|שמיר|נענע|פטרי|תירס טרי|רימון|מנגו|קיווי|אננס|דלעת|סלרי|שום|ג'ינג'ר|צנון|סלק|שעועית ירוקה|במיה|ארטישוק/],
  ['בשר ועוף', /עוף|הודו|בקר|בשר|כבש|שניצל|קבב|המבורגר|נקניק|סטייק|אנטריקוט|צלעות|כרעיים|שוקיים|כנפיים|פרגית|טחון|נתחי|כבד|דג|סלמון|טונה טרי|אמנון|בורי|דניס|לברק|נסיכה|פילה/],
  ['חלב וביצים', /חלב|גבינ|קוטג|יוגורט|שמנת|חמאה|ביצים|לבן |אשל|גיל|מעדן חלב|פודינג|מילקי|דנונה|יופלה|אקטימל|משקה חלב|קפיר|מוצרלה|צהובה|עמק|גלבוע|טל העמק|פטה|בולגרית|צפתית|לאבנה|מסקרפונה|ריקוטה|חלב סויה|שקדים משקה|שיבולת שועל משקה/],
  ['מאפים ולחם', /לחם|פיתה|פיתות|חלה|לחמני|בגט|טורטי|קרואסון|עוגה|עוגת|עוגיות|מאפה|בורקס|ג'חנון|מלאווח|פיצה|בצק|טוסט|קרקר|פריכיות|לחמית|ביסקוויט|וופל/],
  ['חטיפים וממתקים', /במבה|ביסלי|אפרופו|תפוצ'יפס|צ'יפס|חטיף|שוקולד|ממתק|סוכרי|מסטיק|ופל|טופי|קליק|פסק זמן|כיף כף|מקופלת|פרה|עלית|שטראוס חטיף|תפוציפס|דוריטוס|צ'יטוס|פופקורן|בוטנים|פיצוח|אגוז|שקד|קשיו|פיסטוק|גרעינ|תמר|צימוק|פירות יבשים|חלבה|גלידה|שלגון|ארטיק|קרמבו|נוגט|מרשמלו|ג'לי|לקריץ/],
  ['משקאות', /קולה|קוקה|פפסי|ספרייט|פאנטה|מים |מים מינרל|סודה|מיץ|משקה|בירה|יין |יינות|וודקה|ויסקי|עראק|ליקר|שנדי|תה |קפה|נס קפה|אספרסו|קפסול|שוקו|לימונדה|פריגת|טמפו|יפאורה|נביעות|עין גדי|מי עדן|נסטי|פיוז|אנרגיה|XL|בלו |מונסטר|רד בול|פרימור|תפוזינה|סיידר|נקטר|קרליטו|מאלט|פחית|בקבוק/],
  ['שימורים', /שימור|טונה|סרדינ|רסק|טחינה|חומוס|פול |אפונה|תירס|זיתים|מלפפון חמוץ|חמוצים|רוטב|קטשופ|מיונז|חרדל|ריבה|דבש|ממרח|חמאת בוטנים|נוטלה|קונפיטור|שקשוקה|לפתן|קופסת|קופסה|תמצית|אורז|פסטה|ספגטי|אטריות|פתיתים|קוסקוס|בורגול|קמח|סוכר|מלח|שמן|חומץ|תבלין|פלפל שחור|כמון|פפריקה|כורכום|אבקת|פירורי|קורנפלור|שמרים|סולת|עדשים|שעועית|חומוס יבש|גריסים|קינואה|צ'יה|שיבולת שועל|דגני|קורנפלקס|גרנולה|מוזלי|שקדי מרק|מרק |אבקת מרק|קרוטונ/],
  ['ניקיון וטואלטיקה', /נייר טואלט|טואלט|מגבת|מגבונ|נייר סופג|טישו|סבון|שמפו|מרכך|ג'ל רחצה|דאודורנט|משחת שיניים|מברשת|חוט דנטלי|מי פה|תחבושת|טמפון|פד |חיתול|מטלית|אקונומיקה|כלור|ניקוי|אבקת כביסה|ג'ל כביסה|מרכך כביסה|מדיח|כלים|ספוג|סקוטש|שקיות אשפה|שקית|נייר אפייה|נייר כסף|ניילון|קיסמים|מפית|כוסות חד|צלחות חד|סכו"ם|גפרור|מצית|נר |סוללה|מטהר אוויר|קוטל|חרקים|קרם|תחליב|לק|מסיר|תמרוק|בושם|אפטר|סכין גילוח|תער|קצף/],
  ['מעדנייה', /סלט |סלטים|מטבל|חומוס אחלה|צנוברים|טחינה מוכנה|ממולא|פסטרמה|נקניקיות|קבנוס|סלמי|מעושן|הרינג|מלוח|דגים מלוחים|קוויאר|זיתים מעורב|טאפנד|פלאפל|לאפה|בשר מעובד|מוכן|ארוחה|מנה|טורטיה מוכנה|פיצה קפואה|קפוא|קפואים|פירורי|קציצ|שווארמה/],
];

export function categorize(name) {
  for (const [category, re] of CATEGORY_RULES) if (re.test(name)) return category;
  return 'כללי';
}
const ICONS = { 'ירקות ופירות': '🥬', 'בשר ועוף': '🍗', 'חלב וביצים': '🥛', 'מאפים ולחם': '🍞', 'חטיפים וממתקים': '🍫', 'משקאות': '🥤', 'שימורים': '🥫', 'ניקיון וטואלטיקה': '🧴', 'מעדנייה': '🧀', 'כללי': '🛒' };

const cleanName = (s) => String(s ?? '').replace(/^[\s*#!.-]+/, '').replace(/\s+/g, ' ').replace(/["']+$/g, '').trim();
/** Best display name: the most common one, preferring reasonably long names over truncated ones. */
const bestName = (names) => {
  const c = new Map();
  for (const n of names) if (n && n.length > 2) c.set(n, (c.get(n) ?? 0) + 1);
  return [...c.entries()].map(([n, count]) => ({ n, score: count * 10 + Math.min(n.length, 40) })).sort((a, b) => b.score - a.score)[0]?.n ?? null;
};
const median = (nums) => { const a = nums.filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const mode = (values) => { const c = new Map(); for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] ?? null; };

function loadChains() {
  const chains = {};
  if (!existsSync(PRICES)) return chains;
  for (const chainId of readdirSync(PRICES)) {
    const full = path.join(PRICES, chainId, 'catalog.full.json');
    const online = path.join(PRICES, chainId, 'online.json');
    if (!existsSync(full) && !existsSync(online)) continue;
    chains[chainId] = { catalog: existsSync(full) ? JSON.parse(readFileSync(full, 'utf8')) : { chainId, items: [], source: null }, online: existsSync(online) ? JSON.parse(readFileSync(online, 'utf8')) : null };
  }
  return chains;
}

export function buildProducts(chains, { minChains = MIN_CHAINS, max = MAX } = {}) {
  const byGtin = new Map();
  const seen = (gtin) => byGtin.get(gtin) ?? byGtin.set(gtin, { chains: new Set(), names: [], brands: [], prices: [], weighted: 0 }).get(gtin);
  for (const [chainId, { catalog, online }] of Object.entries(chains)) {
    for (const item of catalog.items) {
      if (!item.gtin) continue;
      const g = seen(item.gtin);
      g.chains.add(chainId); g.names.push(cleanName(item.name)); g.brands.push(cleanName(item.brand)); g.prices.push(item.price); if (item.isWeighted) g.weighted++;
    }
    for (const [gtin, p] of Object.entries(online?.items ?? {})) {
      const g = seen(gtin);
      g.chains.add(chainId); g.names.push(cleanName(p.name)); g.prices.push(p.price); if (p.isWeighted) g.weighted++;
    }
  }
  const candidates = [...byGtin.entries()].filter(([, g]) => g.chains.size >= minChains && g.names.some((n) => n.length > 2));
  candidates.sort((a, b) => b[1].chains.size - a[1].chains.size || (median(a[1].prices) ?? 0) - (median(b[1].prices) ?? 0));
  const products = candidates.slice(0, max).map(([gtin, g]) => {
    const name = bestName(g.names);
    const category = categorize(name);
    const isWeighted = g.weighted > g.chains.size / 2;
    return { id: `g${gtin}`, name, category, brand: mode(g.brands.filter((b) => b && !/^(לא ידוע|unknown|כללי)$/i.test(b))) ?? null, unit: isWeighted ? 'ק"ג' : "יח'", isWeighted, gtin, basePrice: median(g.prices), aliases: [], icon: ICONS[category], chains: g.chains.size };
  });
  products.sort((a, b) => a.category.localeCompare(b.category, 'he') || a.name.localeCompare(b.name, 'he'));
  return products;
}

export function slimCatalog(chainId, { catalog, online }, gtins) {
  const byGtin = new Map();
  // With an online overlay the storefront is the source of truth: a product the online store does
  // not return is not sold online, whatever the (physical) price file says.
  for (const item of catalog.items) if (item.gtin && gtins.has(item.gtin)) byGtin.set(item.gtin, online ? { ...item, inStock: false, onlinePrice: false } : { ...item });
  for (const [gtin, p] of Object.entries(online?.items ?? {})) {
    if (!gtins.has(gtin)) continue;
    const base = byGtin.get(gtin) ?? { storeItemId: gtin, code: gtin, gtin, name: cleanName(p.name), brand: null, promotions: [], unit: p.isWeighted ? 'ק"ג' : "יח'" };
    byGtin.set(gtin, { ...base, price: p.price ?? base.price, inStock: p.inStock !== false, isWeighted: p.isWeighted ?? base.isWeighted, onlinePrice: true });
  }
  return { chainId, storeId: catalog.storeId ?? null, generatedAt: new Date().toISOString(), source: { ...(catalog.source ?? {}), online: online ? { fetchedAt: online.fetchedAt, items: Object.keys(online.items).length } : null }, items: [...byGtin.values()] };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const chains = loadChains();
  if (!Object.keys(chains).length) { console.error('no downloaded price data in data/prices - run scripts/fetch-prices.mjs first'); process.exit(1); }
  const products = buildProducts(chains);
  const gtins = new Set(products.map((p) => p.gtin));
  writeFileSync(path.join(ROOT, 'data', 'products.json'), JSON.stringify(products, null, 1) + '\n');
  const catalogDir = path.join(ROOT, 'data', 'catalogs');
  const summary = [];
  for (const [chainId, data] of Object.entries(chains)) {
    const slim = slimCatalog(chainId, data, gtins);
    writeFileSync(path.join(catalogDir, `${chainId}.json`), JSON.stringify(slim) + '\n');
    summary.push(`${chainId.padEnd(12)} ${String(slim.items.length).padStart(5)} of ${products.length} products${data.online ? ' (online prices)' : ''}  store ${data.catalog.source?.store ?? '-'}${data.catalog.source?.onlineStore === false ? ' (not the online store)' : ''}`);
  }
  // chains without real data must not show fake prices: drop their seed catalogs
  for (const file of readdirSync(catalogDir)) {
    const id = file.replace(/\.json$/, '');
    if (id !== 'demo' && !chains[id]) { unlinkSync(path.join(catalogDir, file)); summary.push(`${id.padEnd(12)} removed (no price data)`); }
  }
  const demo = generateCatalog('demo', products.slice(0, 150));
  writeFileSync(path.join(catalogDir, 'demo.json'), JSON.stringify(demo, null, 1) + '\n');
  const cats = new Map(); for (const p of products) cats.set(p.category, (cats.get(p.category) ?? 0) + 1);
  console.log(`products: ${products.length} (GTINs sold by >= ${MIN_CHAINS} chains)\ncategories: ${[...cats.entries()].map(([c, n]) => `${c} ${n}`).join(', ')}\n${summary.join('\n')}`);
}

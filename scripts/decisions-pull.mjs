#!/usr/bin/env node
/**
 * Pulls Naor's answers from the admin decision queue (admin/docs/DECISIONS-API.md §2-§4) and turns them into
 * config changes through the EXISTING importers (docs/DECISIONS-PULL.md).
 *
 *   node scripts/decisions-pull.mjs                  # dry run: GET export, save it, print the plan, change nothing
 *   node scripts/decisions-pull.mjs --apply          # apply the plan to config/products/*.json + data/chains.json
 *   node scripts/decisions-pull.mjs --mark           # after the commit: POST imported {answerIds, commit: HEAD}
 *   node scripts/decisions-pull.mjs --published 2026-11-04 [--commits a,b]   # after a publish: POST published {commits, run}
 *   flags: --kinds a,b   --base URL   --file saved-export.json (offline: no GET)
 *   env:   ADMIN_API_BASE, HEALTH_TOKEN (sent as X-Health-Token, never printed)
 *
 * Nothing under data/ is written except data/local/ (the saved export + the .applied.json sidecar). The one
 * exception to "config only" is data/chains.json, which is config by owner decision (PLAN §7.5).
 * The one git call is `git rev-parse HEAD`, inside --mark only.
 *
 * Pure core: planAnswers(export, state) -> plan (simulates every answer on a copy of the files, so a later
 * answer sees an earlier one), applyPlan(plan, paths) -> writes the files the plan changed.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importDecisions } from './same-product-review-import.mjs';
import { mergeBrand } from './brands-import.mjs';
import { importSizes, normalizeSize } from './sizes-import.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_PATHS = {
  verified: path.join(ROOT, 'config', 'products', 'verified.json'),
  brands: path.join(ROOT, 'config', 'products', 'brands.json'),
  sizes: path.join(ROOT, 'config', 'products', 'sizes.json'),
  aliases: path.join(ROOT, 'config', 'products', 'aliases.json'),
  notAliases: path.join(ROOT, 'config', 'products', 'not-aliases.json'),
  chains: path.join(ROOT, 'data', 'chains.json'),
  localDir: path.join(ROOT, 'data', 'local'),
};

/** Indent each file already uses (checked 3.11: every file round-trips byte for byte with these). */
const INDENT = { verified: 1, brands: 1, sizes: 1, aliases: 2, notAliases: 2, chains: 1 };
const REL = { verified: 'config/products/verified.json', brands: 'config/products/brands.json', sizes: 'config/products/sizes.json', aliases: 'config/products/aliases.json', notAliases: 'config/products/not-aliases.json', chains: 'data/chains.json' };

export const KINDS = ['review', 'same-product', 'brand', 'size', 'taxonomy', 'product-truth', 'chain-terms', 'price-report', 'free-text'];
const BY_HAND = new Set(['taxonomy', 'free-text', 'price-report']);
const CHAIN_FIELDS = ['deliveryFee', 'freeDeliveryAbove', 'minOrder', 'eta', 'deliveryCities', 'pickupFee'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GTIN_RE = /^\d{8,14}$/;

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const nonEmptyStr = (v) => typeof v === 'string' && v.trim() !== '';
/** Accepts a bare or g-prefixed gtin; returns the bare digits (or '' when not a barcode). */
const bareGtin = (v) => { const g = String(v ?? '').replace(/^g/, ''); return GTIN_RE.test(g) ? g : ''; };
const dateOf = (iso, fallback) => (typeof iso === 'string' && DATE_RE.test(iso.slice(0, 10)) ? iso.slice(0, 10) : fallback);

/* ---------- state ---------- */

function readJson(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
}

/** Reads every target file into one object (tests pass temp copies through `paths`). */
export function loadState(paths = DEFAULT_PATHS) {
  const verified = readJson(paths.verified, { version: 1, records: {} });
  verified.records ??= {};
  const brands = readJson(paths.brands, { brands: {} });
  brands.brands ??= {};
  const sizes = readJson(paths.sizes, { sizes: {} });
  sizes.sizes ??= {};
  const aliases = readJson(paths.aliases, { aliases: [] });
  aliases.aliases = Array.isArray(aliases.aliases) ? aliases.aliases : [];
  const notAliases = readJson(paths.notAliases, []);
  return { verified, brands, sizes, aliases, notAliases: Array.isArray(notAliases) ? notAliases : [], chains: readJson(paths.chains, []) };
}

/* ---------- per-kind validation + planners ---------- */

const optionOf = (row) => row.answer?.option ?? null;
const payloadOf = (row) => (isObj(row.answer?.payload) ? row.answer.payload : null);
const skip = (reason) => ({ status: 'skip', reason, changes: [] });
const noop = (reason) => ({ status: 'noop', reason, changes: [] });
const done = (changes, reason) => (changes.length ? { status: 'apply', changes } : noop(reason ?? 'אין שינוי - הערך כבר בקובץ'));

/** Strict size for a verified record: {value>0, unit g|ml|unit, count integer>=1 (missing = 1)}. */
function strictSize(s) {
  if (!isObj(s)) return null;
  const value = Number(s.value);
  const count = s.count == null ? 1 : s.count;
  if (!(Number.isFinite(value) && value > 0)) return null;
  if (!['g', 'ml', 'unit'].includes(s.unit)) return null;
  if (!(Number.isInteger(count) && count >= 1)) return null;
  return { value, unit: s.unit, count };
}

/** Known fields of a fix payload -> { fields } or { error }. Writes only what was given (conceptId may be null). */
function fixFields(payload) {
  if (!payload) return { error: 'fix בלי payload' };
  const fields = {};
  if ('name' in payload) { if (!nonEmptyStr(payload.name)) return { error: 'name לא תקין' }; fields.name = payload.name.trim(); }
  if ('brand' in payload) { if (!nonEmptyStr(payload.brand)) return { error: 'brand לא תקין' }; fields.brand = payload.brand.trim(); }
  if ('category' in payload) { if (!nonEmptyStr(payload.category)) return { error: 'category לא תקין' }; fields.category = payload.category.trim(); }
  if ('conceptId' in payload) {
    if (payload.conceptId !== null && !nonEmptyStr(payload.conceptId)) return { error: 'conceptId לא תקין' };
    fields.conceptId = payload.conceptId === null ? null : payload.conceptId.trim();
  }
  if ('size' in payload) {
    const size = strictSize(payload.size);
    if (!size) return { error: `size לא תקין (${JSON.stringify(payload.size)})` };
    fields.size = size;
  }
  if (!Object.keys(fields).length) return { error: 'ל-payload אין שדות מוכרים (name/brand/category/conceptId/size)' };
  return { fields };
}

/** Upserts config/products/verified.json records["g<gtin>"]; an existing record is merged field by field. */
function upsertVerified(state, gtin, fields, row, date) {
  const id = `g${gtin}`;
  const before = state.verified.records[id];
  const next = before ? clone(before) : {};
  Object.assign(next, fields);
  const note = `admin: ${row.key}`;
  const evidence = Array.isArray(next.evidence) ? next.evidence : [];
  if (!evidence.includes(note)) evidence.push(note);
  next.verifiedBy = 'naor';
  next.verifiedAt = date;
  next.evidence = evidence;
  // new records get the documented key order (verified.js doc comment); existing ones keep theirs
  const ordered = before ? next : Object.fromEntries(['name', 'brand', 'category', 'conceptId', 'size', 'verifiedBy', 'verifiedAt', 'evidence'].filter((k) => k in next).map((k) => [k, next[k]]));
  if (before && same(before, ordered)) return [];
  state.verified.records[id] = ordered;
  const changes = [];
  for (const k of Object.keys(ordered)) {
    if (k === 'evidence' || k === 'verifiedAt' || k === 'verifiedBy') continue;
    if (!before || !same(before[k], ordered[k])) changes.push({ file: REL.verified, key: `${id}.${k}`, before: before?.[k] ?? null, after: ordered[k] });
  }
  if (!changes.length) changes.push({ file: REL.verified, key: `${id}.evidence`, before: before?.evidence ?? null, after: ordered.evidence });
  return changes;
}

const RULE_FIELDS = {
  'size-disagreement': ['size'],
  'name-disagreement': ['name'],
  'truncated-name': ['name'],
  'type-word': ['name'],
  'attrs-conflict': [],
  'label-vs-rules': ['category', 'conceptId'],
  'concept-category': ['category', 'conceptId'],
  'department-contradiction': ['category', 'conceptId'],
};

/** Rule names the decision disputed: the export row's evidence/checks when present, else subject.checks / subject.rules. */
function rulesOf(row) {
  const lists = [row.subject?.rules, row.evidence, row.subject?.checks].filter(Array.isArray).flat();
  return [...new Set(lists.map((c) => (typeof c === 'string' ? c : c?.rule)).filter(Boolean))];
}

function planReview(row, state, date) {
  const opt = optionOf(row);
  const gtin = bareGtin(row.subject?.gtin);
  if (!['ok', 'fix', 'later', 'remove'].includes(opt)) return skip(`אופציה לא מוכרת "${opt}"`);
  if (opt === 'later') return noop('later - רק ברשימה, אין קובץ (הדחייה ל-30 יום היא בצד האתר)');
  if (opt === 'remove') return noop('remove - רק ברשימה, אין קובץ (מוצר לא תקין: טיפול ידני)');
  if (!gtin) return skip('subject.gtin חסר או לא ברקוד');
  if (opt === 'fix') {
    const { fields, error } = fixFields(payloadOf(row));
    if (error) return skip(error);
    return done(upsertVerified(state, gtin, fields, row, date));
  }
  // ok: pin the CURRENT values of the fields the checks disputed
  const rules = rulesOf(row);
  const want = new Set(rules.flatMap((r) => RULE_FIELDS[r] ?? []));
  if (!want.size && rules.includes('attrs-conflict')) return noop('ok על attrs-conflict - אין שדה ב-verified.json, רק הדפסה');
  if (!want.size) return skip(`ok בלי כלל מוכר להצמדה (כללים: ${rules.join(', ') || 'אין'})`);
  const fields = {};
  const subject = row.subject ?? {};
  if (want.has('name') && nonEmptyStr(subject.name)) fields.name = subject.name;
  if (want.has('category') && nonEmptyStr(subject.category)) fields.category = subject.category;
  if (want.has('conceptId') && 'conceptId' in subject && (subject.conceptId === null || nonEmptyStr(subject.conceptId))) fields.conceptId = subject.conceptId;
  if (want.has('size') && subject.size != null) { const s = strictSize(subject.size); if (s) fields.size = s; }
  if (!Object.keys(fields).length) return skip(`ok: ב-subject אין את הערכים להצמדה (${[...want].join('/')})`);
  return done(upsertVerified(state, gtin, fields, row, date));
}

function planSame(row, state, date) {
  const opt = optionOf(row);
  const verdict = { same: 'same', different: 'different', unsure: 'unsure' }[opt];
  if (!verdict) return skip(`אופציה לא מוכרת "${opt}"`);
  const products = Array.isArray(row.subject?.products) ? row.subject.products : [];
  const gtins = products.map((p) => String(p?.gtin ?? '')).filter(Boolean);
  if (gtins.length < 2) return skip('subject.products: פחות משני ברקודים');
  if (verdict === 'unsure') return noop('unsure - אין קובץ (נספר בלבד)');
  const canonical = payloadOf(row)?.canonical;
  if (verdict === 'same' && !(canonical && gtins.includes(String(canonical)))) return skip('same בלי canonical תקין בין הברקודים');
  const names = new Map(products.map((p) => [String(p.gtin), p.name]));
  const brands = new Map(Object.entries(state.brands.brands).map(([g, v]) => [g, v.brand]));
  const id = row.subject?.clusterId ?? row.key;
  const res = importDecisions([{ id, gtins, verdict, canonical: canonical == null ? undefined : String(canonical) }], {
    existingAliases: state.aliases.aliases, existingNotAliases: state.notAliases, names, brands, dateStr: date,
  });
  const changes = [];
  const newAliases = res.aliases.slice(state.aliases.aliases.length);
  const newNot = res.notAliases.slice(state.notAliases.length);
  for (const a of newAliases) changes.push({ file: REL.aliases, key: a.alias, before: null, after: `→ ${a.canonical}` });
  for (const n of newNot) changes.push({ file: REL.notAliases, key: n.gtins.join('+'), before: null, after: 'לא כינוי' });
  if (!changes.length) {
    return res.summary.invalid ? skip(res.summary.skipDetails.join('; ')) : skip(res.summary.skipDetails.join('; ') || 'לא נוסף דבר');
  }
  state.aliases.aliases = res.aliases;
  state.notAliases = res.notAliases;
  return { status: 'apply', changes, reason: res.summary.skipDetails.join('; ') || undefined };
}

function candidateIndex(opt) {
  const m = /^cand:(\d+)$/.exec(String(opt));
  return m ? Number(m[1]) : null;
}

function planBrand(row, state, date) {
  const opt = optionOf(row);
  const gtin = bareGtin(row.subject?.gtin);
  if (!gtin) return skip('subject.gtin חסר או לא ברקוד');
  const payload = payloadOf(row);
  let brand;
  if (opt === 'none') brand = '';
  else if (candidateIndex(opt) !== null) {
    const cand = (row.subject?.candidates ?? [])[candidateIndex(opt)];
    brand = payload && 'brand' in payload ? payload.brand : cand?.brand;
    if (brand === undefined) return skip(`אין מועמד ${opt}`);
  } else if (opt === 'other') {
    if (!payload || !('brand' in payload)) return skip('other בלי payload.brand');
    brand = payload.brand;
  } else return skip(`אופציה לא מוכרת "${opt}"`);
  if (typeof brand !== 'string') return skip('brand חייב להיות מחרוזת');
  const existing = state.brands.brands[gtin];
  if (brand.trim() === '') {
    // brands.json has no "no brand" entry: the only way to say it is to drop a reviewed brand, so the chains' field decides again
    if (!existing) return noop('בלי מותג - אין ערך ב-brands.json להסיר');
    delete state.brands.brands[gtin];
    return { status: 'apply', changes: [{ file: REL.brands, key: gtin, before: existing.brand, after: '(הוסר)' }] };
  }
  const r = mergeBrand(state.brands.brands, gtin, brand, 'naor', date, { replace: true });
  if (r.status === 'invalid') return skip('brand/ברקוד לא תקין');
  if (r.status === 'not-a-brand') return skip(`"${brand}" לא נראה כמותג (NOT_A_BRAND / ארוך מדי)`);
  if (existing && existing.brand === brand.trim()) { state.brands.brands[gtin] = existing; return noop('אותו מותג כבר בקובץ'); }
  return { status: 'apply', changes: [{ file: REL.brands, key: gtin, before: existing?.brand ?? null, after: brand.trim() }] };
}

function planSize(row, state, date) {
  const opt = optionOf(row);
  const gtin = bareGtin(row.subject?.gtin);
  if (!gtin) return skip('subject.gtin חסר או לא ברקוד');
  if (opt === 'none') return noop('none - אין גודל לכתוב');
  const payload = payloadOf(row);
  let size;
  if (candidateIndex(opt) !== null) size = payload?.size ?? (row.subject?.candidates ?? [])[candidateIndex(opt)]?.size;
  else if (opt === 'other') size = payload?.size;
  else return skip(`אופציה לא מוכרת "${opt}"`);
  if (!normalizeSize(size)) return skip(`size לא תקין (${JSON.stringify(size)})`);
  const existing = state.sizes.sizes[gtin];
  const res = importSizes([{ gtin, found: true, size, url: 'naor' }], state.sizes.sizes, {}, { today: date });
  if (res.summary.sizesKept) return skip(`כבר יש גודל ב-sizes.json (${JSON.stringify(existing.size)}) - importSizes לא דורס בלי override`);
  if (!res.summary.sizesAdded) return skip(res.summary.skipDetails.join('; ') || 'לא נוסף');
  state.sizes.sizes = res.sizes;
  return { status: 'apply', changes: [{ file: REL.sizes, key: gtin, before: existing?.size ?? null, after: res.sizes[gtin].size }] };
}

function planChain(row, state, date) {
  const opt = optionOf(row);
  const s = row.subject ?? {};
  if (!['confirm', 'change'].includes(opt)) return skip(`אופציה לא מוכרת "${opt}"`);
  const chain = state.chains.find((c) => c.id === s.chainId);
  if (!chain) return skip(`רשת "${s.chainId}" לא נמצאה ב-chains.json`);
  const branch = (chain.branches ?? []).find((b) => b.id === s.branchId);
  if (!branch) return skip(`סניף "${s.branchId}" לא נמצא ברשת ${s.chainId}`);
  const payload = payloadOf(row);
  const terms = payload?.deliveryTerms;
  if (!isObj(terms) || !DATE_RE.test(String(terms.verifiedAt ?? '')) || !nonEmptyStr(terms.source)) return skip('deliveryTerms חייב {verifiedAt: YYYY-MM-DD, source[, note]}');
  const fields = {};
  if (opt === 'change') {
    const given = isObj(payload.fields) ? payload.fields : null;
    if (!given || !Object.keys(given).length) return skip('change בלי payload.fields');
    for (const [k, v] of Object.entries(given)) {
      if (!CHAIN_FIELDS.includes(k)) return skip(`שדה לא מוכר "${k}"`);
      if (['deliveryFee', 'freeDeliveryAbove', 'minOrder', 'pickupFee'].includes(k) && !(v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0))) return skip(`${k} חייב מספר ≥0 או null`);
      if (k === 'eta' && !(v === null || typeof v === 'string')) return skip('eta חייב מחרוזת');
      if (k === 'deliveryCities' && !(Array.isArray(v) && v.every((c) => typeof c === 'string'))) return skip('deliveryCities חייב מערך מחרוזות');
      fields[k] = v;
    }
  }
  const changes = [];
  const set = (k, v) => { if (!same(branch[k], v)) { changes.push({ file: REL.chains, key: `${s.branchId}.${k}`, before: branch[k] ?? null, after: v }); branch[k] = v; } };
  for (const [k, v] of Object.entries(fields)) set(k, v);
  if ('minOrder' in fields) set('minOrderKnown', true);
  if (['deliveryFee', 'freeDeliveryAbove', 'deliveryCities', 'pickupFee'].some((k) => k in fields)) set('deliveryKnown', true);
  set('deliveryTerms', { verifiedAt: terms.verifiedAt, source: terms.source, ...(nonEmptyStr(terms.note) ? { note: terms.note } : {}) });
  return done(changes);
}

function planByHand(row) {
  const s = row.subject ?? {};
  const title = String(row.title ?? s.question ?? s.title ?? row.key).replace(/\s+/g, ' ').slice(0, 120);
  const note = row.answer?.note ? ` | הערה: ${String(row.answer.note).replace(/\s+/g, ' ').slice(0, 200)}` : '';
  return { status: 'byhand', reason: `${title} | תשובה: ${optionOf(row) ?? '(טקסט חופשי)'}${note}`, changes: [] };
}

/**
 * export -> plan. `state` comes from loadState(); it is deep-copied, never mutated.
 * plan = { entries: [{answerId, key, kind, status: apply|skip|noop|byhand, reason?, changes}], next: state-after, dirty: [stateKey],
 *          summary: {kind: {applied, skipped, noop, byhand}}, appliedIds: [] }
 */
export function planAnswers(exportJson, state, { kinds = null, today = new Date().toISOString().slice(0, 10) } = {}) {
  const work = clone(state);
  const before = clone(state);
  const entries = [];
  const rows = Array.isArray(exportJson?.answers) ? exportJson.answers : [];
  for (const row of rows) {
    const kind = row?.kind;
    if (kinds && !kinds.includes(kind)) continue;
    const base = { answerId: row?.answerId, key: row?.key, kind };
    const date = dateOf(row?.answeredAt, today);
    let r;
    try {
      if (!row || !isObj(row.answer)) r = skip('answer חסר');
      else if (kind === 'review' || kind === 'product-truth') {
        r = kind === 'product-truth'
          ? (optionOf(row) === 'fix' ? planReview(row, work, date) : skip(`product-truth מקבל רק fix, קיבל "${optionOf(row)}"`))
          : planReview(row, work, date);
      } else if (kind === 'same-product') r = planSame(row, work, date);
      else if (kind === 'brand') r = planBrand(row, work, date);
      else if (kind === 'size') r = planSize(row, work, date);
      else if (kind === 'chain-terms') r = planChain(row, work, date);
      else if (BY_HAND.has(kind)) r = planByHand(row);
      else r = skip(`סוג לא מוכר "${kind}"`);
    } catch (err) {
      r = skip(`שגיאה בעיבוד: ${err.message}`);
    }
    entries.push({ ...base, ...r });
  }
  const dirty = Object.keys(work).filter((k) => !same(work[k], before[k]));
  const summary = {};
  for (const e of entries) {
    const s = (summary[e.kind] ??= { applied: 0, skipped: 0, noop: 0, byhand: 0 });
    if (e.status === 'apply') s.applied++; else if (e.status === 'skip') s.skipped++; else if (e.status === 'noop') s.noop++; else s.byhand++;
  }
  return { entries, next: work, dirty, summary, appliedIds: entries.filter((e) => e.status === 'apply').map((e) => e.answerId) };
}

/** Writes the files the plan changed (same indent as each file already uses). Returns the repo-relative names. */
export function applyPlan(plan, paths = DEFAULT_PATHS) {
  const written = [];
  for (const k of plan.dirty) {
    writeFileSync(paths[k], JSON.stringify(plan.next[k], null, INDENT[k]) + '\n');
    written.push(REL[k]);
  }
  return written;
}

/* ---------- output ---------- */

const short = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 110 ? `${s.slice(0, 107)}...` : s; };

export function formatPlan(plan, { applied = false } = {}) {
  const out = [];
  const byKind = new Map();
  for (const e of plan.entries) (byKind.get(e.kind) ?? byKind.set(e.kind, []).get(e.kind)).push(e);
  out.push(applied ? 'ביצוע (--apply):' : 'תכנית (dry-run, שום דבר לא נכתב):');
  for (const [kind, list] of byKind) {
    out.push(`\n[${kind}] ${list.length} תשובות`);
    for (const e of list) {
      const tag = { apply: applied ? 'בוצע' : 'ישונה', skip: 'דולג', noop: 'ללא קובץ', byhand: 'ידנית' }[e.status];
      out.push(`  - ${tag}: ${e.key}${e.status !== 'apply' && e.reason ? ` - ${e.reason}` : ''}`);
      for (const c of e.changes) out.push(`      ${c.file} :: ${c.key}: ${short(c.before)} → ${short(c.after)}`);
      if (e.status === 'apply' && e.reason) out.push(`      (הערה: ${e.reason})`);
    }
  }
  const hand = plan.entries.filter((e) => e.status === 'byhand');
  if (hand.length) {
    out.push('\nלטיפול ידני (לא נכתב לשום קובץ):');
    for (const e of hand) out.push(`  * [${e.kind}] ${e.key}: ${e.reason}`);
  }
  out.push('\nסיכום:');
  for (const [kind, s] of Object.entries(plan.summary)) out.push(`  ${kind}: applied ${s.applied} / skipped ${s.skipped} / no-file ${s.noop} / by-hand ${s.byhand}`);
  if (!plan.entries.length) out.push('  (אין תשובות ממתינות)');
  out.push(plan.dirty.length ? `קבצים ${applied ? 'ששונו' : 'שישתנו עם --apply'}: ${plan.dirty.map((k) => REL[k]).join(', ')}` : 'קבצים שישתנו: אין');
  return out.join('\n');
}

/* ---------- CLI ---------- */

export function parseArgs(argv) {
  const o = { apply: false, mark: false, kinds: null, base: null, file: null, published: null, commits: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--mark') o.mark = true;
    else if (a === '--kinds') o.kinds = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--base') o.base = argv[++i];
    else if (a === '--file') o.file = argv[++i];
    else if (a === '--published') o.published = argv[++i];
    else if (a === '--commits') o.commits = String(argv[++i] ?? '').split(',').map((c) => c.trim()).filter(Boolean);
    else throw new Error(`דגל לא מוכר: ${a}`);
  }
  if (o.kinds) {
    const bad = o.kinds.filter((k) => !KINDS.includes(k));
    if (bad.length) throw new Error(`kinds לא מוכר: ${bad.join(',')}`);
  }
  if (o.published !== null && !DATE_RE.test(String(o.published))) throw new Error('--published דורש תאריך ריצה YYYY-MM-DD');
  if (o.commits && o.published === null) throw new Error('--commits רק יחד עם --published');
  if (o.published !== null && (o.apply || o.mark)) throw new Error('--published לא יחד עם --apply/--mark');
  if (o.apply && o.mark) throw new Error('--apply ו---mark לא יחד: קודם apply, npm test, commit, ואז --mark');
  return o;
}

const stampOf = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}`;
};

const apiHeaders = (token) => ({ 'X-Health-Token': token, Accept: 'application/json' });

async function apiFail(res, what) {
  let body = '';
  try { body = (await res.text()).slice(0, 200); } catch { /* ignore */ }
  return new Error(`${what}: HTTP ${res.status}${body ? ` ${body}` : ''}`);
}

const sidecarPath = (paths, exportFile) => path.join(paths.localDir, `${path.basename(exportFile).replace(/\.json$/, '')}.applied.json`);

function newestExport(paths) {
  if (!existsSync(paths.localDir)) return null;
  const names = readdirSync(paths.localDir).filter((n) => /^decisions-.*\.json$/.test(n) && !n.endsWith('.applied.json')).sort();
  return names.length ? path.join(paths.localDir, names[names.length - 1]) : null;
}

/**
 * The whole CLI as a function (tests call it with a stubbed fetch / commit / paths and capture `log`).
 * Returns { code, plan?, written? }.
 */
export async function main(argv, { env = process.env, log = console.log, paths = DEFAULT_PATHS, fetchFn, getCommit, now = new Date() } = {}) {
  let o;
  try { o = parseArgs(argv); } catch (err) { log(err.message); return { code: 1 }; }
  const doFetch = fetchFn ?? globalThis.fetch;
  const token = env.HEALTH_TOKEN;
  const base = (o.base ?? env.ADMIN_API_BASE ?? '').replace(/\/+$/, '');
  const needApi = o.mark || o.published !== null || !o.file;
  if (needApi && !base) { log('חסר ADMIN_API_BASE (או --base URL). דוגמה: ADMIN_API_BASE=https://... node scripts/decisions-pull.mjs'); return { code: 1 }; }
  if (needApi && !token) { log('חסר HEALTH_TOKEN בסביבה (נשלח ככותרת X-Health-Token; לא מודפס).'); return { code: 1 }; }

  if (o.published !== null) {
    // commits recorded by --mark in the sidecars that no earlier --published covered (or passed with --commits)
    const sidecars = existsSync(paths.localDir) ? readdirSync(paths.localDir).filter((n) => /^decisions-.*\.applied\.json$/.test(n)).sort() : [];
    const pending = [];
    for (const n of sidecars) {
      const f = path.join(paths.localDir, n);
      const info = JSON.parse(readFileSync(f, 'utf8'));
      if (info.markedCommit && !info.publishedRun) pending.push({ f, info });
    }
    const commits = o.commits ?? [...new Set(pending.map((x) => x.info.markedCommit))];
    if (!commits.length) { log('אין קומיטים לדווח (הריצו --mark אחרי commit, או העבירו --commits a,b)'); return { code: 1 }; }
    const res = await doFetch(`${base}/admin/decisions/published`, { method: 'POST', headers: { ...apiHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ commits, run: o.published }) });
    if (!res.ok) { log((await apiFail(res, 'POST published')).message); return { code: 1 }; }
    if (!o.commits) for (const x of pending) writeFileSync(x.f, JSON.stringify({ ...x.info, publishedRun: o.published }, null, 2) + '\n');
    log(`דווחו ${commits.length} קומיטים כ-published לריצה ${o.published}`);
    return { code: 0, commits };
  }

  if (o.mark) {
    const exportFile = o.file ? path.resolve(o.file) : newestExport(paths);
    if (!exportFile) { log('לא נמצא data/local/decisions-*.json - הריצו קודם --apply'); return { code: 1 }; }
    const side = sidecarPath(paths, exportFile);
    if (!existsSync(side)) { log(`אין קובץ צד ${path.basename(side)} - --apply לא רץ על הייצוא הזה`); return { code: 1 }; }
    const info = JSON.parse(readFileSync(side, 'utf8'));
    const ids = Array.isArray(info.answerIds) ? info.answerIds : [];
    if (!ids.length) { log('אין answerIds ב-sidecar - אין מה לסמן'); return { code: 0 }; }
    if (info.markedCommit) log(`שימו לב: כבר סומן ב-${info.markedCommit}; שולח שוב.`);
    const commit = (getCommit ?? (() => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()))();
    const res = await doFetch(`${base}/admin/decisions/imported`, { method: 'POST', headers: { ...apiHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ answerIds: ids, commit }) });
    if (!res.ok) { log((await apiFail(res, 'POST imported')).message); return { code: 1 }; }
    writeFileSync(side, JSON.stringify({ ...info, markedCommit: commit, markedAt: now.toISOString() }, null, 2) + '\n');
    log(`סומנו ${ids.length} תשובות כ-imported בקומיט ${commit.slice(0, 12)}`);
    return { code: 0, marked: ids.length, commit };
  }

  let exportJson;
  let exportFile;
  if (o.file) {
    exportFile = path.resolve(o.file);
    if (!existsSync(exportFile)) { log(`הקובץ לא קיים: ${exportFile}`); return { code: 1 }; }
    exportJson = JSON.parse(readFileSync(exportFile, 'utf8'));
  } else {
    const q = o.kinds ? `?kinds=${encodeURIComponent(o.kinds.join(','))}` : '';
    const res = await doFetch(`${base}/admin/decisions/export${q}`, { headers: apiHeaders(token) });
    if (!res.ok) { log((await apiFail(res, 'GET export')).message); return { code: 1 }; }
    exportJson = await res.json();
    mkdirSync(paths.localDir, { recursive: true });
    exportFile = path.join(paths.localDir, `decisions-${stampOf(now)}.json`);
    writeFileSync(exportFile, JSON.stringify(exportJson, null, 2) + '\n');
    log(`הייצוא נשמר: ${path.relative(ROOT, exportFile)}`);
  }

  const plan = planAnswers(exportJson, loadState(paths), { kinds: o.kinds, today: now.toISOString().slice(0, 10) });
  if (!o.apply) {
    log(formatPlan(plan));
    log('\nשום קובץ ב-config/ לא שונה. להחלה: --apply');
    return { code: 0, plan };
  }
  const written = applyPlan(plan, paths);
  mkdirSync(paths.localDir, { recursive: true });
  writeFileSync(sidecarPath(paths, exportFile), JSON.stringify({
    exportFile: path.basename(exportFile), appliedAt: now.toISOString(), answerIds: plan.appliedIds,
    applied: plan.entries.filter((e) => e.status === 'apply').map((e) => ({ answerId: e.answerId, key: e.key, kind: e.kind })),
    noFile: plan.entries.filter((e) => e.status === 'noop').map((e) => ({ answerId: e.answerId, key: e.key, kind: e.kind })),
    files: written,
  }, null, 2) + '\n');
  log(formatPlan(plan, { applied: true }));
  log('\nהבא: npm test (רק על fail 0) → commit של הקבצים לפי נתיב → node scripts/decisions-pull.mjs --mark');
  return { code: 0, plan, written };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).then((r) => { process.exitCode = r.code; }).catch((err) => { console.error(`decisions-pull: ${err.message}`); process.exitCode = 1; });
}

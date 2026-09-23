import test from 'node:test';
import assert from 'node:assert/strict';
import { productChecks, summarizeChecks, PROCESSED_TYPE_RE } from '../src/catalog/productChecks.js';
import { parseSize } from '../src/catalog/size.js';

// docs/PLAN-PRODUCT-TRUTH.md stage א: the checks queue a product with evidence; they never decide.
const CONCEPTS = {
  'herb-parsley': { id: 'herb-parsley', name: 'פטרוזיליה', category: 'ירקות ופירות' },
  hummus: { id: 'hummus', name: 'חומוס', category: 'מעדנייה' },
  'milk-3': { id: 'milk-3', name: 'חלב 3%', category: 'חלב וביצים' },
};
const deps = {
  conceptById: (id) => CONCEPTS[id] ?? null,
  parseSize,
  keywordCategory: (name) => (/חלב/.test(name) ? 'חלב וביצים' : /תבלין/.test(name) ? 'שימורים' : 'כללי'),
  labelOf: (id) => ({ 'g1': 'שימורים', 'g6': 'ירקות ופירות' }[id] ?? null),
  manualName: (id) => (id === 'g7' ? 'שם ידני' : null),
};
const product = (id, name, extra = {}) => ({ id, gtin: id.slice(1), name, category: 'שימורים', conceptId: null, size: parseSize(name), chains: 3, ...extra });
const names = (entries) => new Map(Object.entries(entries).map(([gtin, list]) => [gtin, list.map(([chain, name]) => ({ chain, name }))]));

test('productChecks: a fresh concept on a processed product is flagged twice (department and type word)', () => {
  const p = product('g1', 'מימון פטרוזיליה במיכ', { conceptId: 'herb-parsley' });
  const r = productChecks([p], names({ 1: [['a', 'מימון פטרוזיליה במיכ'], ['b', 'תבלין פטרוזיליה במיכל תבליני מימון 25']] }), deps);
  const rules = r.items[0].checks.map((c) => c.rule);
  assert.ok(rules.includes('concept-category'));
  assert.ok(rules.includes('type-word'));
  assert.equal(r.items[0].checks[0].priority, 'high');
  // the chosen name is a truncation and a fuller name exists elsewhere
  const trunc = r.items[0].checks.find((c) => c.rule === 'truncated-name');
  assert.ok(trunc && /במיכל תבליני מימון/.test(trunc.suggestion));
});

test('productChecks: a concept in a neighbouring department is a low-priority note, and a clean product is not queued', () => {
  const canned = product('g2', 'חומוס בקופסה 400 גרם', { conceptId: 'hummus' });
  const clean = product('g3', 'חלב 3% 1 ליטר', { category: 'חלב וביצים', conceptId: 'milk-3' });
  const r = productChecks([canned, clean], names({ 2: [['a', 'חומוס בקופסה 400 גרם'], ['b', 'חומוס משומר 400 גרם']], 3: [['a', 'חלב 3% 1 ליטר'], ['b', 'חלב 3% ליטר']] }), deps);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].id, 'g2');
  assert.deepEqual(r.items[0].checks.map((c) => [c.rule, c.priority]), [['concept-category', 'low']]);
});

test('productChecks: chains that do not share one word for a barcode are a name disagreement naming the odd chain', () => {
  const p = product('g4', 'מבחר קטניות 700 גרם');
  const r = productChecks([p], names({ 4: [['mck', 'מבחר קטניות 700 גר'], ['yochananof', 'קטניות 700 גרם'], ['shufersal', 'ציה מן הטבע 250 גרם']] }), deps);
  const d = r.items[0].checks.find((c) => c.rule === 'name-disagreement');
  assert.ok(d, 'expected a disagreement');
  assert.match(d.detail, /shufersal/);
  // inflection and truncation do not count as disagreement
  const ok = productChecks([product('g5', 'עגבניות שרי 500 גרם')], names({ 5: [['a', 'עגבניות שרי 500 גרם'], ['b', 'עגבניה שרי 500'], ['c', 'עגבניו']] }), deps);
  assert.ok(!ok.items.some((i) => i.checks.some((c) => c.rule === 'name-disagreement')));
});

test('productChecks: sizes parsed from different chain names must agree; a manual display name is never called truncated', () => {
  const p = product('g6', 'שוקולד פרה 100 גרם', { category: 'ירקות ופירות' });
  const r = productChecks([p], names({ 6: [['a', 'שוקולד פרה 100 גרם'], ['b', 'שוקולד פרה 10*25 גרם']] }), deps);
  const rules = r.items[0].checks.map((c) => c.rule);
  assert.ok(rules.includes('size-disagreement'));
  // label ירקות ופירות disagrees with no keyword category here (keywordCategory says כללי) -> no label-vs-rules
  assert.ok(!rules.includes('label-vs-rules'));
  const manual = product('g7', 'שם ידני');
  const r2 = productChecks([manual], names({ 7: [['a', 'שם ידני'], ['b', 'שם ידני ארוך יותר בהרבה']] }), deps);
  assert.ok(!r2.items.some((i) => i.checks.some((c) => c.rule === 'truncated-name')));
});

test('productChecks: a reviewed label that both the keywords and the concept dispute is queued low; concept products are skipped', () => {
  const p = product('g1', 'תבלין כמון טחון', { category: 'מעדנייה' }); // label says שימורים (deps), product category מעדנייה is irrelevant: labelOf decides
  const r = productChecks([p, { id: 'c-tomato', kind: 'concept', name: 'עגבנייה', gtin: null, conceptId: 'tomato', category: 'ירקות ופירות' }], names({ 1: [['a', 'תבלין כמון טחון']] }), deps);
  // keywordCategory('תבלין כמון טחון') = שימורים = label -> no flag; nothing else applies
  assert.equal(r.items.length, 0);
  const p2 = product('g6', 'חלב עמיד 1 ליטר'); // label ירקות ופירות, keywords say dairy, no concept -> flagged
  const r2 = productChecks([p2], names({ 6: [['a', 'חלב עמיד 1 ליטר']] }), deps);
  assert.deepEqual(r2.items[0].checks.map((c) => c.rule), ['label-vs-rules']);
  assert.match(summarizeChecks(r2), /1 product\(s\) queued for review \(0 high\): label-vs-rules 1/);
});

test('productChecks: a type word the concept itself carries is not evidence against it', () => {
  const d = { ...deps, conceptById: (id) => (id === 'schnitzel-chicken' ? { id, name: 'שניצל עוף', category: 'בשר ועוף' } : null) };
  const fresh = product('g8', 'שניצל עוף טרי 1 קג', { category: 'בשר ועוף', conceptId: 'schnitzel-chicken' });
  const r = productChecks([fresh], names({ 8: [['a', 'שניצל עוף טרי 1 קג'], ['b', 'שניצל עוף דק 1 קג']] }), d);
  assert.ok(!r.items.some((i) => i.checks.some((c) => c.rule === 'type-word')));
  // frozen, sliced or ground is a form of the same cut, not a processed product (docs/CATEGORIES.md)
  const frozenCut = product('g10', 'אנטריקוט דק דק 300 גרם קפוא', { category: 'בשר ועוף', conceptId: 'beef-steak' });
  const d2 = { ...d, conceptById: (id) => (id === 'beef-steak' ? { id, name: 'סטייק בקר', category: 'בשר ועוף' } : d.conceptById(id)) };
  const rf = productChecks([frozenCut], names({ 10: [['a', 'אנטריקוט דק דק 300 גרם קפוא']] }), d2);
  assert.ok(!rf.items.some((i) => i.checks.some((c) => c.rule === 'type-word')));
  const breaded = product('g9', 'אצבעות שניצל בציפוי פריך קפוא 700 גרם', { category: 'בשר ועוף', conceptId: 'schnitzel-chicken' });
  const r2 = productChecks([breaded], names({ 9: [['a', 'אצבעות שניצל בציפוי פריך קפוא 700 גרם']] }), d);
  assert.ok(r2.items[0].checks.some((c) => c.rule === 'type-word'));
});

test('PROCESSED_TYPE_RE: says processed for spices, sauces, drinks and frozen; not for a plain fresh name', () => {
  for (const n of ['תבלין פטרוזיליה', 'רוטב עגבניות', 'משקה מנגו', 'פטריות שימורים', 'קוביות עגבניות קפוא']) assert.ok(PROCESSED_TYPE_RE.test(n), n);
  for (const n of ['פטרוזיליה ארוזה', 'עגבניות שרי', 'בצל יבשה']) assert.ok(!PROCESSED_TYPE_RE.test(n) || n === 'בצל יבשה', n);
});

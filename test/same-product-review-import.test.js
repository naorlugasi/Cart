import test from 'node:test';
import assert from 'node:assert/strict';
import { importDecisions } from '../scripts/same-product-review-import.mjs';

const A = '7290000000001';
const B = '7290000000002';
const C = '7290000000003';
const D = '7290000000004';
const names = new Map([[A, 'מוצר א ישן'], [B, 'מוצר א חדש'], [C, 'מוצר ג'], [D, 'מוצר ד']]);
const FIXED_DATE = '2026-10-03'; // importDecisions defaults to "today"; fixed here so the `why`/`since` assertions are deterministic

test('verdict "same" adds one alias (non-canonical -> canonical) with a why that names both products', () => {
  const { aliases, summary } = importDecisions(
    [{ id: 'c1', gtins: [A, B], verdict: 'same', canonical: B, at: 'x' }],
    { names, dateStr: FIXED_DATE },
  );
  assert.equal(aliases.length, 1);
  assert.deepEqual(aliases[0], {
    alias: A,
    canonical: B,
    why: 'נאור, 2026-10-03: אותו מוצר - מוצר א ישן / מוצר א חדש',
    since: '2026-10-03',
  });
  assert.equal(summary.aliasesAdded, 1);
});

test('verdict "same" on a 3-member cluster adds one alias per non-canonical gtin', () => {
  const { aliases, summary } = importDecisions(
    [{ id: 'c1', gtins: [A, B, C], verdict: 'same', canonical: B, at: 'x' }],
    { names, dateStr: FIXED_DATE },
  );
  assert.equal(aliases.length, 2);
  assert.deepEqual(aliases.map((a) => a.alias).sort(), [A, C].sort());
  assert.ok(aliases.every((a) => a.canonical === B));
  assert.equal(summary.aliasesAdded, 2);
});

test('verdict "same" skips a gtin already aliased (existing or earlier in the same batch), without touching the rest', () => {
  const existingAliases = [{ alias: A, canonical: C, why: 'כבר קיים', since: '2026-01-01' }];
  const { aliases, summary } = importDecisions(
    [{ id: 'c1', gtins: [A, B], verdict: 'same', canonical: B, at: 'x' }],
    { existingAliases, names, dateStr: FIXED_DATE },
  );
  assert.equal(aliases.length, 1); // unchanged - the new A->B was skipped
  assert.equal(summary.aliasesAdded, 0);
  assert.equal(summary.aliasesSkipped, 1);
});

test('verdict "same" is rejected by validateGtinAliases (not a barcode-looking gtin) and skipped with a reason, not thrown', () => {
  const { aliases, summary } = importDecisions(
    [{ id: 'c1', gtins: ['not-a-barcode', B], verdict: 'same', canonical: B, at: 'x' }],
    { names, dateStr: FIXED_DATE },
  );
  assert.equal(aliases.length, 0);
  assert.equal(summary.aliasesSkipped, 1);
  assert.match(summary.skipDetails[0], /ולידציה/);
});

test('verdict "same" with a canonical that is not one of the cluster\'s own gtins is skipped entirely', () => {
  const { aliases, summary } = importDecisions(
    [{ id: 'c1', gtins: [A, B], verdict: 'same', canonical: D, at: 'x' }],
    { names, dateStr: FIXED_DATE },
  );
  assert.equal(aliases.length, 0);
  assert.equal(summary.aliasesSkipped, 1);
});

test('verdict "different" adds one not-aliases entry with sorted gtins and a why naming the products', () => {
  const { notAliases, summary } = importDecisions(
    [{ id: 'c1', gtins: [B, A], verdict: 'different', at: 'x' }],
    { names, dateStr: FIXED_DATE },
  );
  assert.equal(notAliases.length, 1);
  assert.deepEqual(notAliases[0].gtins, [A, B].sort());
  assert.match(notAliases[0].why, /שונה/);
  assert.equal(summary.notAliasesAdded, 1);
});

test('verdict "different" skips a cluster whose exact gtin set is already recorded (order-independent)', () => {
  const existingNotAliases = [{ gtins: [A, B], why: 'כבר נרשם', since: '2026-01-01' }];
  const { notAliases, summary } = importDecisions(
    [{ id: 'c1', gtins: [B, A], verdict: 'different', at: 'x' }],
    { existingNotAliases, names, dateStr: FIXED_DATE },
  );
  assert.equal(notAliases.length, 1); // unchanged
  assert.equal(summary.notAliasesAdded, 0);
  assert.equal(summary.notAliasesSkipped, 1);
});

test('verdict "unsure" changes nothing but is counted', () => {
  const { aliases, notAliases, summary } = importDecisions(
    [{ id: 'c1', gtins: [A, B], verdict: 'unsure', canonical: B, at: 'x' }],
    { names, dateStr: FIXED_DATE },
  );
  assert.equal(aliases.length, 0);
  assert.equal(notAliases.length, 0);
  assert.equal(summary.unsure, 1);
});

test('a malformed decision (missing gtins/verdict) is counted invalid and does not throw', () => {
  const { summary } = importDecisions([{ id: 'bad' }], { names, dateStr: FIXED_DATE });
  assert.equal(summary.invalid, 1);
});

test('mixed batch: same + different + unsure, each handled independently in one pass', () => {
  const decisions = [
    { id: 'c1', gtins: [A, B], verdict: 'same', canonical: B, at: 'x' },
    { id: 'c2', gtins: [C, D], verdict: 'different', at: 'x' },
    { id: 'c3', gtins: [A, C], verdict: 'unsure', at: 'x' },
  ];
  const { aliases, notAliases, summary } = importDecisions(decisions, { names, dateStr: FIXED_DATE });
  assert.equal(aliases.length, 1);
  assert.equal(notAliases.length, 1);
  assert.equal(summary.total, 3);
  assert.equal(summary.same, 1);
  assert.equal(summary.different, 1);
  assert.equal(summary.unsure, 1);
});

// Naor, 4.10: a "same" given when no brand was known is refused once two reviewed brands disagree.
test('verdict "same" is refused when the reviewed brands of alias and canonical differ', () => {
  const decisions = [{ id: 'x', gtins: ['7290001468715', '7290002007234'], verdict: 'same', canonical: '7290002007234' }];
  const brands = new Map([['7290001468715', 'נאמן'], ['7290002007234', 'הנמל']]);
  const { aliases, summary } = importDecisions(decisions, { brands });
  assert.equal(aliases.length, 0);
  assert.equal(summary.aliasesSkipped, 1);
  assert.match(summary.skipDetails[0], /מותג שונה/);
  const ok = importDecisions(decisions, { brands: new Map([['7290001468715', 'שוופס'], ['7290002007234', 'שוופס']]) });
  assert.equal(ok.aliases.length, 1);
});

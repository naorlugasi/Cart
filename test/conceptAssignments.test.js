import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConceptAssignments } from '../src/catalog/conceptAssignments.js';
import { concepts } from '../src/catalog/concepts.js';

test('every reviewed concept assignment names a concept that exists', () => {
  const ids = new Set(concepts().map((c) => c.id));
  const missing = [...loadConceptAssignments()].filter(([, c]) => !ids.has(c)).map(([id, c]) => `${id} -> ${c}`);
  assert.deepEqual(missing, [], 'a concept was renamed or removed; re-point or drop these assignments');
});

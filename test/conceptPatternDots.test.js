// normalizeText turns a dot that is not between two digits into a space ("א.ד.פ" -> "א ד פ", "טב." -> "טב"),
// so a concept pattern that escapes a dot next to a letter ("א\.?ד\.?פ", "טב\.") can never match and sits
// inert - four such none words hid a perfume in flavored-syrup until 3.11.2026. loadConcepts refuses them
// at load time, the same way it refuses final-form letters. A dot between digits ("3\.6") survives
// normalization and stays allowed, as does a dot inside an alternation that also offers a space.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConcepts } from '../src/catalog/concepts.js';

function loadWith(patternField, patterns) {
  const dir = mkdtempSync(path.join(tmpdir(), 'concept-dots-'));
  try {
    const match = { all: ['בושמ'], any: [], none: [] };
    match[patternField] = patterns;
    writeFileSync(path.join(dir, 'test.json'), JSON.stringify({ concepts: [{ id: 'perfume-test', name: 'בושם', category: 'טיפוח ויופי', match }] }));
    return loadConcepts(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a none pattern with an escaped dot next to a letter is refused at load (it can never match a normalized name)', () => {
  assert.throws(() => loadWith('none', ['א\\.?ד\\.?פ']), /can never match/);
  assert.throws(() => loadWith('none', ['טב\\.']), /can never match/);
  assert.throws(() => loadWith('any', ['ד\\.ר']), /can never match/);
});

test('a dot between digits, or offered next to a space in an alternation, still loads', () => {
  assert.equal(loadWith('any', ['4 ?%.{0,3}3\\.6 ?%']).length, 1);
  assert.equal(loadWith('any', ['(^| )\\d*טב( |\\.)']).length, 1);
  assert.equal(loadWith('none', ['(^| )א ?ד ?פ(?![א-ת])']).length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, tokenize, similarity, rankMatches, findBestMatch, searchProducts, levenshtein } from '../src/catalog/matching.js';
import { loadSeed } from './helpers.js';

test('normalizeText strips punctuation, quotes and final letters', () => {
  assert.equal(normalizeText('מלפפון "בלאדי" (ק"ג)'), 'מלפפונ בלאדי קג');
  assert.equal(normalizeText('חלב 3% - 1.5 ליטר'), 'חלב 3% 1.5 ליטר');
});

test('tokenize drops stop words and stems plurals', () => {
  assert.deepEqual(tokenize('עגבניות שקילות מובחרות'), ['עגבני']);
  assert.deepEqual(tokenize('עגבניה'), ['עגבני']);
  assert.deepEqual(tokenize('מלפפונים'), ['מלפפונ']);
});

test('similarity matches weighted produce names across chain naming styles', () => {
  assert.ok(similarity('מלפפון בלאדי', 'מלפפון שקיל מובחר') > 0.7);
  assert.ok(similarity('מלפפון בלאדי', 'מלפפון במשקל') > 0.7);
  assert.ok(similarity('עגבניה', 'עגבניות שקילות') > 0.7);
  assert.ok(similarity('מלפפון בלאדי', 'עגבניה שקילה') < 0.3);
});

test('similarity penalises conflicting percentages', () => {
  const same = similarity('חלב 3% תנובה 1 ליטר', 'חלב 3% תנובה 1 ליטר');
  const other = similarity('חלב 3% תנובה 1 ליטר', 'חלב 1% תנובה 1 ליטר');
  assert.equal(same, 1);
  assert.ok(other < 0.6);
});

test('rankMatches / findBestMatch pick the best candidate above threshold', () => {
  const candidates = [{ name: 'עגבניה שקילה' }, { name: 'מלפפון שקיל מובחר' }, { name: 'מלפפון בלאדי שקיל' }, { name: 'פלפל אדום' }];
  const ranked = rankMatches('מלפפון בלאדי', candidates);
  assert.equal(ranked[0].candidate.name, 'מלפפון בלאדי שקיל');
  assert.equal(ranked[1].candidate.name, 'מלפפון שקיל מובחר');
  assert.ok(ranked.every((r) => r.candidate.name !== 'פלפל אדום'));
  assert.equal(findBestMatch('אננס', candidates), null);
});

test('searchProducts finds by substring, alias and fuzzy tokens', () => {
  const { products } = loadSeed();
  assert.equal(searchProducts('במבה', products)[0].id, 'bamba');
  assert.equal(searchProducts('קוטג', products)[0].id, 'cottage');
  assert.equal(searchProducts('תפוחי אדמה', products)[0].id, 'potato');
  assert.ok(searchProducts('חלב', products).map((p) => p.id).includes('milk-3'));
  assert.equal(searchProducts('', products, { limit: 100 }).length, products.length);
});

test('levenshtein', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
});

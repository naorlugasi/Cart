#!/usr/bin/env node
// node tools/embeddings/query.mjs "<hebrew text>" -> the 10 nearest products with similarity and concept.
// Embeds the query text live (with the e5 "query: " prefix) and searches the full product index
// (all 46,820 embedded products, not just assigned ones) so other sessions can poke at the model.
import { loadStore, buildIndex } from './lib/store.mjs';
import { embedBatch } from './lib/embedder.mjs';

const text = process.argv.slice(2).join(' ').trim();
if (!text) {
  console.error('Usage: node tools/embeddings/query.mjs "<hebrew text>"');
  process.exit(1);
}

const { items, vectors, dim } = loadStore();
console.log(`[query] indexing ${items.length} products (first run only is slow; this prototype rebuilds the index each call)...`);
const allRows = Array.from({ length: items.length }, (_, i) => i);
const { index, labelToRow } = buildIndex(vectors, dim, allRows);

const [qvec] = [await embedBatch([text], { prefix: 'query: ' })];
const result = index.searchKnn(Array.from(qvec), 10);

console.log(`\nNearest products to "${text}":`);
for (let i = 0; i < result.neighbors.length; i++) {
  const row = labelToRow[result.neighbors[i]];
  const sim = 1 - result.distances[i];
  const it = items[row];
  console.log(`  ${sim.toFixed(3)}  ${it.name}  [concept: ${it.conceptId || '-'}]  (${it.category})`);
}

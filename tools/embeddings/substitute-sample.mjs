// Second use case: substitute candidates. For 30 random assigned products, list the 5 nearest
// neighbours that are NOT in the same concept. This is printed for a human (Naor/an agent) to judge
// plausibility by eye - there is no automatic correctness label for "is this a plausible stand-in",
// so this script does not score itself; evaluate-holdout.mjs is the rigorous measurement.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStore, buildIndex, knnSearch } from './lib/store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = path.join(HERE, '..', '..', 'data', 'local');

const { items, vectors, dim } = loadStore();
const assignedRows = [];
for (let i = 0; i < items.length; i++) if (items[i].conceptId) assignedRows.push(i);

console.log(`[substitutes] building HNSW index over ${assignedRows.length} assigned products...`);
const idx = buildIndex(vectors, dim, assignedRows);

function sample(arr, n, seed = 123) {
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

const sampledRows = sample(assignedRows, 30);
const WANT = 5;
const SEARCH_K = 40; // pull extra neighbours since we filter out same-concept ones
const out = [];
for (const row of sampledRows) {
  const neighbors = knnSearch(idx, vectors, dim, row, SEARCH_K, { excludeRow: row });
  const diffConcept = neighbors.filter((n) => items[n.row].conceptId !== items[row].conceptId).slice(0, WANT);
  out.push({
    product: items[row].name,
    conceptId: items[row].conceptId,
    candidates: diffConcept.map((n) => ({ name: items[n.row].name, conceptId: items[n.row].conceptId, similarity: Number(n.similarity.toFixed(3)) })),
  });
}

writeFileSync(path.join(LOCAL_DIR, 'substitute-sample.json'), JSON.stringify(out, null, 2));
console.log(`[substitutes] wrote substitute-sample.json (${out.length} products x up to ${WANT} candidates)`);
for (const o of out) {
  console.log(`\n${o.product}  [${o.conceptId}]`);
  for (const c of o.candidates) console.log(`    ${c.similarity.toFixed(3)}  ${c.name}  [${c.conceptId}]`);
}

// Department proposals (2026-10-03 addition): for the ~37k products with NEITHER a reviewed label
// NOR a verified.json record (i.e. not in the department holdout's ground-truth set), predict a
// department from the ground-truthed products' k=10 neighbours using the same 95%-precision gate
// measured in evaluate-department-holdout.mjs, and keep only the cases where the embedding's
// predicted department DISAGREES with the product's current `category` field - those are the
// genuinely interesting review candidates (agreements aren't actionable). Full list goes to
// data/local/department-proposals.json (gitignored, review queue input, never auto-assigned); 30
// random disagreements are sampled for REPORT.md.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStore, buildIndex, knnSearch } from './lib/store.mjs';
import { predictLabel } from './lib/vote.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = path.join(HERE, '..', '..', 'data', 'local');

const holdout = JSON.parse(readFileSync(path.join(LOCAL_DIR, 'department-holdout-results.json'), 'utf8'));
const gate = holdout['10'].chosenGate;
if (!gate) throw new Error('No 95%-precision gate found in department-holdout-results.json for k=10; run evaluate-department-holdout.mjs first.');
const THRESHOLD = gate.threshold;
console.log(`[dept-propose] using k=10 gate from department holdout: threshold=${THRESHOLD.toFixed(2)} (measured precision=${(gate.precision * 100).toFixed(1)}%, coverage on holdout=${(gate.coverage * 100).toFixed(1)}%)`);

const { items, vectors, dim } = loadStore();
const truthedRows = [];
const untruthedRows = [];
for (let i = 0; i < items.length; i++) {
  if (items[i].deptTruth) truthedRows.push(i);
  else untruthedRows.push(i);
}
console.log(`[dept-propose] ${truthedRows.length} ground-truthed / ${untruthedRows.length} un-truthed products`);

console.log('[dept-propose] building HNSW index over ground-truthed products...');
const idx = buildIndex(vectors, dim, truthedRows);
const deptOf = (row) => items[row].deptTruth;

const K = 10;
const disagreements = [];
let scored = 0;
let accepted = 0;
const t0 = Date.now();
for (const row of untruthedRows) {
  const neighbors = knnSearch(idx, vectors, dim, row, K);
  const pred = predictLabel(neighbors, deptOf);
  if (!pred) continue;
  scored++;
  if (pred.confidence < THRESHOLD) continue;
  accepted++;
  const currentCategory = items[row].category;
  if (pred.label === currentCategory) continue; // agreement - not actionable, skip
  disagreements.push({
    id: items[row].id,
    name: items[row].name,
    currentCategory,
    proposedDepartment: pred.label,
    confidence: pred.confidence,
    neighbors: pred.neighbors.slice(0, 5).map((n) => ({ name: items[n.row].name, dept: items[n.row].deptTruth, similarity: n.similarity })),
  });
}
console.log(`[dept-propose] scored ${scored}/${untruthedRows.length} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`[dept-propose] ${accepted} (${(100 * accepted / untruthedRows.length).toFixed(1)}%) clear the >=${THRESHOLD.toFixed(2)} gate; of those, ${disagreements.length} disagree with the product's current category field`);

writeFileSync(path.join(LOCAL_DIR, 'department-proposals.json'), JSON.stringify({
  threshold: THRESHOLD,
  generatedAt: new Date().toISOString(),
  totalUntruthed: untruthedRows.length,
  acceptedCount: accepted,
  disagreementCount: disagreements.length,
  disagreements,
}, null, 2));
console.log(`[dept-propose] wrote department-proposals.json (${disagreements.length} disagreements)`);

function sample(arr, n, seed = 7) {
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
const sampleOut = sample(disagreements, 30).map((d) => ({
  name: d.name,
  currentCategory: d.currentCategory,
  proposedDepartment: d.proposedDepartment,
  confidence: Number(d.confidence.toFixed(3)),
  neighbors: d.neighbors.slice(0, 3).map((n) => n.name),
}));
writeFileSync(path.join(LOCAL_DIR, 'department-proposals-sample30.json'), JSON.stringify(sampleOut, null, 2));
console.log('[dept-propose] wrote department-proposals-sample30.json (for REPORT.md)');

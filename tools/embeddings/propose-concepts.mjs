// Applies the concept-holdout's 95%-precision gate (k=10) to the ~15.8k products with no conceptId:
// for each, search the index of assigned products, vote, and keep the proposal if confidence clears
// the gate. Writes the full list to data/local/concept-proposals.json (gitignored - review queue input,
// never auto-assigned) and prints 40 random samples for REPORT.md.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStore, buildIndex, knnSearch } from './lib/store.mjs';
import { predictLabel } from './lib/vote.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = path.join(HERE, '..', '..', 'data', 'local');

const holdout = JSON.parse(readFileSync(path.join(LOCAL_DIR, 'concept-holdout-results.json'), 'utf8'));
const gate = holdout['10'].chosenGate;
if (!gate) throw new Error('No 95%-precision gate found in concept-holdout-results.json for k=10; run evaluate-holdout.mjs first.');
const THRESHOLD = gate.threshold;
console.log(`[propose] using k=10 gate from holdout: threshold=${THRESHOLD.toFixed(2)} (measured precision=${(gate.precision * 100).toFixed(1)}%, coverage on holdout=${(gate.coverage * 100).toFixed(1)}%)`);

const { items, vectors, dim } = loadStore();
const assignedRows = [];
const unassignedRows = [];
for (let i = 0; i < items.length; i++) {
  if (items[i].conceptId) assignedRows.push(i);
  else unassignedRows.push(i);
}
console.log(`[propose] ${assignedRows.length} assigned / ${unassignedRows.length} unassigned products`);

console.log('[propose] building HNSW index over assigned products...');
const idx = buildIndex(vectors, dim, assignedRows);
const conceptOf = (row) => items[row].conceptId;

const K = 10;
const proposals = [];
let withProposal = 0;
const t0 = Date.now();
for (const row of unassignedRows) {
  const neighbors = knnSearch(idx, vectors, dim, row, K);
  const pred = predictLabel(neighbors, conceptOf);
  if (!pred) continue;
  const accepted = pred.confidence >= THRESHOLD;
  if (accepted) withProposal++;
  proposals.push({
    id: items[row].id,
    name: items[row].name,
    category: items[row].category,
    brand: items[row].brand,
    proposedConceptId: pred.label,
    confidence: pred.confidence,
    accepted,
    neighbors: pred.neighbors.slice(0, 5).map((n) => ({ name: items[n.row].name, conceptId: items[n.row].conceptId, similarity: n.similarity })),
  });
}
console.log(`[propose] scored ${proposals.length} unassigned products in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`[propose] ${withProposal} (${(100 * withProposal / unassignedRows.length).toFixed(1)}%) clear the >=${THRESHOLD.toFixed(2)} confidence gate`);

const accepted = proposals.filter((p) => p.accepted);

// by-department coverage of accepted proposals
const byDept = new Map();
for (const row of unassignedRows) {
  const d = byDept.get(items[row].category) || { total: 0 };
  d.total++;
  byDept.set(items[row].category, d);
}
for (const p of accepted) {
  const d = byDept.get(p.category);
  d.accepted = (d.accepted || 0) + 1;
}
console.log('[propose] accepted-proposal coverage by department:');
for (const [dept, d] of [...byDept.entries()].sort((a, b) => b[1].total - a[1].total)) {
  console.log(`    ${dept.padEnd(20)} total=${String(d.total).padEnd(6)} accepted=${String(d.accepted || 0).padEnd(6)} (${(100 * (d.accepted || 0) / d.total).toFixed(1)}%)`);
}

writeFileSync(path.join(LOCAL_DIR, 'concept-proposals.json'), JSON.stringify({ threshold: THRESHOLD, generatedAt: new Date().toISOString(), totalUnassigned: unassignedRows.length, acceptedCount: accepted.length, proposals: accepted }, null, 2));
console.log(`[propose] wrote concept-proposals.json (${accepted.length} accepted proposals)`);

// 40 random samples for the human-readable report
function sample(arr, n, seed = 42) {
  // deterministic shuffle (mulberry32) so REPORT.md stays reproducible across runs
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
const sampleOut = sample(accepted, 40).map((p) => ({
  name: p.name,
  proposedConceptId: p.proposedConceptId,
  confidence: Number(p.confidence.toFixed(3)),
  neighbors: p.neighbors.slice(0, 3).map((n) => n.name),
}));
writeFileSync(path.join(LOCAL_DIR, 'concept-proposals-sample40.json'), JSON.stringify(sampleOut, null, 2));
console.log('[propose] wrote concept-proposals-sample40.json (for REPORT.md)');

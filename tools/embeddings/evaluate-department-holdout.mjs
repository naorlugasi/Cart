// Department holdout (added per 2026-10-03 request from the coordinator): ground truth = products
// with a reviewed per-product or per-concept label in config/categories/labels.json, plus products
// with a category in config/products/verified.json records (union; built once into deptTruth by
// build-embeddings.mjs so this script and propose-departments.mjs share the exact same ground-truth
// set). Same leave-one-out k-NN + majority-vote machinery as the concept holdout, just voting on
// `deptTruth` instead of `conceptId`.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStore, buildIndex, knnSearch } from './lib/store.mjs';
import { predictLabel, precisionCoverageCurve } from './lib/vote.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const { items, vectors, dim } = loadStore();
const truthedRows = [];
for (let i = 0; i < items.length; i++) if (items[i].deptTruth) truthedRows.push(i);
console.log(`[dept-eval] ${truthedRows.length} products with a reviewed department (label or verified record), of ${items.length} total`);

const sourceCounts = new Map();
for (const row of truthedRows) sourceCounts.set(items[row].deptTruthSource, (sourceCounts.get(items[row].deptTruthSource) || 0) + 1);
console.log('[dept-eval] ground-truth source breakdown:', Object.fromEntries(sourceCounts));

console.log('[dept-eval] building HNSW index over ground-truthed products...');
const t0 = Date.now();
const idx = buildIndex(vectors, dim, truthedRows);
console.log(`[dept-eval] index built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const K_MAX = 10;
const deptOf = (row) => items[row].deptTruth;

console.log(`[dept-eval] querying ${truthedRows.length} leave-one-out neighbour sets (k=${K_MAX})...`);
const t1 = Date.now();
const rawNeighbors = new Array(items.length);
let done = 0;
for (const row of truthedRows) {
  rawNeighbors[row] = knnSearch(idx, vectors, dim, row, K_MAX, { excludeRow: row });
  done++;
  if (done % 2000 === 0) console.log(`[dept-eval] ${done}/${truthedRows.length} (${((Date.now() - t1) / 1000).toFixed(0)}s)`);
}
console.log(`[dept-eval] knn search done in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

function evalForK(k) {
  const preds = [];
  for (const row of truthedRows) {
    const neighbors = rawNeighbors[row].slice(0, k);
    const pred = predictLabel(neighbors, deptOf);
    const actual = items[row].deptTruth;
    preds.push({ row, actual, predicted: pred ? pred.label : null, confidence: pred ? pred.confidence : 0, correct: pred ? pred.label === actual : false });
  }
  return preds;
}

const results = {};
for (const k of [5, 10]) {
  const preds = evalForK(k);
  const accuracy = preds.filter((p) => p.correct).length / preds.length;

  const byDept = new Map();
  for (const p of preds) {
    const d = byDept.get(p.actual) || { n: 0, correct: 0 };
    d.n++;
    if (p.correct) d.correct++;
    byDept.set(p.actual, d);
  }
  const deptTable = [...byDept.entries()].map(([dept, d]) => ({ dept, n: d.n, accuracy: d.correct / d.n })).sort((a, b) => b.n - a.n);

  const pc = precisionCoverageCurve(preds.map((p) => ({ confidence: p.confidence, correct: p.correct })), { targetPrecision: 0.95 });

  results[k] = { accuracy, n: preds.length, deptTable, precisionCoverage: pc };
  console.log(`\n[dept-eval] === k=${k} ===`);
  console.log(`[dept-eval] agreement (vs ground-truth department): ${(accuracy * 100).toFixed(1)}% (n=${preds.length})`);
  console.log('[dept-eval] by department:');
  for (const d of deptTable) console.log(`    ${d.dept.padEnd(20)} n=${String(d.n).padEnd(6)} acc=${(d.accuracy * 100).toFixed(1)}%`);
  if (pc.chosen) {
    console.log(`[dept-eval] 95%-precision gate: threshold=${pc.chosen.threshold.toFixed(2)} precision=${(pc.chosen.precision * 100).toFixed(1)}% coverage=${(pc.chosen.coverage * 100).toFixed(1)}% (n=${pc.chosen.n})`);
  } else {
    console.log('[dept-eval] no threshold reaches 95% precision');
  }
}

const out = {};
for (const k of [5, 10]) {
  const r = results[k];
  out[k] = { accuracy: r.accuracy, n: r.n, deptTable: r.deptTable, precisionCoverageCurve: r.precisionCoverage.curve, chosenGate: r.precisionCoverage.chosen };
}
out.sourceCounts = Object.fromEntries(sourceCounts);
const outPath = path.join(HERE, '..', '..', 'data', 'local', 'department-holdout-results.json');
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\n[dept-eval] wrote ${outPath}`);

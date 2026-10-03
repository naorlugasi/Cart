// Concept holdout: for every product that HAS a conceptId, hide it and predict one from its k
// nearest neighbours among the OTHER assigned products (leave-one-out). Reports top-1 accuracy
// overall and by department, the precision/coverage curve, and the top confusion pairs.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStore, buildIndex, knnSearch } from './lib/store.mjs';
import { predictLabel, precisionCoverageCurve } from './lib/vote.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const { items, vectors, dim } = loadStore();
const assignedRows = [];
for (let i = 0; i < items.length; i++) if (items[i].conceptId) assignedRows.push(i);
console.log(`[eval] ${assignedRows.length} products with a conceptId (of ${items.length} total)`);

console.log('[eval] building HNSW index over assigned products...');
const t0 = Date.now();
const idx = buildIndex(vectors, dim, assignedRows);
console.log(`[eval] index built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const K_MAX = 10;
const conceptOf = (row) => items[row].conceptId;

console.log(`[eval] querying ${assignedRows.length} leave-one-out neighbour sets (k=${K_MAX})...`);
const t1 = Date.now();
const rawNeighbors = new Array(assignedRows.length);
let done = 0;
for (const row of assignedRows) {
  const neighbors = knnSearch(idx, vectors, dim, row, K_MAX, { excludeRow: row });
  rawNeighbors[row] = neighbors;
  done++;
  if (done % 5000 === 0) console.log(`[eval] ${done}/${assignedRows.length} (${((Date.now() - t1) / 1000).toFixed(0)}s)`);
}
console.log(`[eval] knn search done in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

function evalForK(k) {
  const preds = [];
  for (const row of assignedRows) {
    const neighbors = rawNeighbors[row].slice(0, k);
    const pred = predictLabel(neighbors, conceptOf);
    const actual = items[row].conceptId;
    preds.push({
      row,
      actual,
      predicted: pred ? pred.label : null,
      confidence: pred ? pred.confidence : 0,
      correct: pred ? pred.label === actual : false,
    });
  }
  return preds;
}

const results = {};
for (const k of [5, 10]) {
  const preds = evalForK(k);
  const accuracy = preds.filter((p) => p.correct).length / preds.length;

  // by department (category)
  const byDept = new Map();
  for (const p of preds) {
    const dept = items[p.row].category;
    const d = byDept.get(dept) || { n: 0, correct: 0 };
    d.n++;
    if (p.correct) d.correct++;
    byDept.set(dept, d);
  }
  const deptTable = [...byDept.entries()]
    .map(([dept, d]) => ({ dept, n: d.n, accuracy: d.correct / d.n }))
    .sort((a, b) => b.n - a.n);

  // precision/coverage curve
  const pc = precisionCoverageCurve(preds.map((p) => ({ confidence: p.confidence, correct: p.correct })), { targetPrecision: 0.95 });

  // confusion pairs (unthresholded argmax predictions, errors only)
  const confusion = new Map();
  for (const p of preds) {
    if (!p.predicted || p.correct) continue;
    const key = `${p.actual} -> ${p.predicted}`;
    confusion.set(key, (confusion.get(key) || 0) + 1);
  }
  const topConfusion = [...confusion.entries()].map(([pair, n]) => ({ pair, n })).sort((a, b) => b.n - a.n).slice(0, 20);

  results[k] = { accuracy, n: preds.length, deptTable, precisionCoverage: pc, topConfusion, preds };
  console.log(`\n[eval] === k=${k} ===`);
  console.log(`[eval] top-1 accuracy: ${(accuracy * 100).toFixed(1)}% (n=${preds.length})`);
  console.log('[eval] by department:');
  for (const d of deptTable) console.log(`    ${d.dept.padEnd(20)} n=${String(d.n).padEnd(6)} acc=${(d.accuracy * 100).toFixed(1)}%`);
  if (pc.chosen) {
    console.log(`[eval] 95%-precision gate: threshold=${pc.chosen.threshold.toFixed(2)} precision=${(pc.chosen.precision * 100).toFixed(1)}% coverage=${(pc.chosen.coverage * 100).toFixed(1)}% (n=${pc.chosen.n})`);
  } else {
    console.log('[eval] no threshold reaches 95% precision');
  }
  console.log('[eval] top confusion pairs (actual -> predicted):');
  for (const c of topConfusion.slice(0, 20)) console.log(`    ${c.pair}: ${c.n}`);
}

// Save full machine-readable results (minus the bulky per-prediction neighbour lists) for REPORT.md generation.
const out = {};
for (const k of [5, 10]) {
  const r = results[k];
  out[k] = {
    accuracy: r.accuracy,
    n: r.n,
    deptTable: r.deptTable,
    precisionCoverageCurve: r.precisionCoverage.curve,
    chosenGate: r.precisionCoverage.chosen,
    topConfusion: r.topConfusion,
  };
}
const outPath = path.join(HERE, '..', '..', 'data', 'local', 'concept-holdout-results.json');
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\n[eval] wrote ${outPath}`);

// Also dump a few confusion examples (actual product name, predicted concept, top neighbour names) for k=10.
const k10 = results[10];
const confusionExamples = [];
for (const c of k10.topConfusion.slice(0, 20)) {
  const [actual, predicted] = c.pair.split(' -> ');
  const example = k10.preds.find((p) => p.actual === actual && p.predicted === predicted && !p.correct);
  if (example) {
    confusionExamples.push({
      pair: c.pair,
      count: c.n,
      exampleProduct: items[example.row].name,
      neighbors: rawNeighbors[example.row].slice(0, 3).map((n) => ({ name: items[n.row].name, conceptId: items[n.row].conceptId, similarity: n.similarity })),
    });
  }
}
writeFileSync(path.join(HERE, '..', '..', 'data', 'local', 'concept-confusion-examples.json'), JSON.stringify(confusionExamples, null, 2));
console.log('[eval] wrote concept-confusion-examples.json');

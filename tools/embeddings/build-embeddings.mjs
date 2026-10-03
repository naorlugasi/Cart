// Builds one embedding per product (skip kind==='concept') from DATA_ROOT/products.json, and saves
// them to data/local/ (gitignored, never committed). Text per product = unified name + longest chain
// name for its gtin (see lib/data.mjs buildEmbeddingText) - one embedding per product, NOT per chain
// name, so this is 47k embeddings, not 14x47k.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProducts, loadLongestChainNames, buildEmbeddingText, buildDepartmentGroundTruth } from './lib/data.mjs';
import { embedAll, DIM, MODEL_ID } from './lib/embedder.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', '..', 'data', 'local');
mkdirSync(OUT_DIR, { recursive: true });

const t0 = Date.now();
console.log('[build] loading products...');
const products = loadProducts();
console.log(`[build] ${products.length} products (excluding kind=concept)`);

console.log('[build] scanning chain catalogs for longest per-gtin name...');
const longestChainNames = loadLongestChainNames();
console.log(`[build] longest-name map covers ${longestChainNames.size} gtins`);

const texts = products.map((p) => buildEmbeddingText(p, longestChainNames));
const sampleJoins = products
  .map((p, i) => ({ unified: p.name, chosen: texts[i] }))
  .filter((x) => x.chosen !== x.unified)
  .slice(0, 5);
console.log('[build] sample texts where chain name extended the unified name:', JSON.stringify(sampleJoins, null, 2));

console.log(`[build] embedding ${texts.length} texts with ${MODEL_ID} (CPU, batches of 64)...`);
const tEmbedStart = Date.now();
let lastLog = 0;
const vectors = await embedAll(texts, {
  prefix: 'passage: ',
  batchSize: 64,
  onProgress: (done, total) => {
    const now = Date.now();
    if (now - lastLog > 5000 || done === total) {
      lastLog = now;
      const secs = (now - tEmbedStart) / 1000;
      const rate = done / secs;
      console.log(`[build] ${done}/${total} (${(100 * done / total).toFixed(1)}%) - ${rate.toFixed(0)} items/s - elapsed ${secs.toFixed(0)}s`);
    }
  },
});
const embedSecs = (Date.now() - tEmbedStart) / 1000;
console.log(`[build] embedding done in ${embedSecs.toFixed(1)}s (${(texts.length / embedSecs).toFixed(0)} items/s)`);

console.log('[build] building department ground-truth map (labels.json + verified.json)...');
const deptTruth = buildDepartmentGroundTruth(products);
console.log(`[build] department ground truth covers ${deptTruth.size} products`);

const meta = {
  model: MODEL_ID,
  dim: DIM,
  prefix: 'passage: ',
  generatedAt: new Date().toISOString(),
  count: products.length,
  embedSeconds: embedSecs,
  items: products.map((p, i) => ({
    id: p.id,
    gtin: p.gtin,
    name: p.name,
    text: texts[i],
    category: p.category,
    conceptId: p.conceptId || null,
    brand: p.brand || null,
    isWeighted: !!p.isWeighted,
    deptTruth: deptTruth.get(p.id)?.dept || null,
    deptTruthSource: deptTruth.get(p.id)?.source || null,
  })),
};

writeFileSync(path.join(OUT_DIR, 'embeddings.f32'), Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength));
writeFileSync(path.join(OUT_DIR, 'embeddings-meta.json'), JSON.stringify(meta));

const totalSecs = (Date.now() - t0) / 1000;
console.log(`[build] wrote data/local/embeddings.f32 (${vectors.byteLength} bytes) + embeddings-meta.json`);
console.log(`[build] total wall time ${totalSecs.toFixed(1)}s`);

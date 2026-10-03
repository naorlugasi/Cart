// Loads the embeddings written by build-embeddings.mjs into memory: a Float32Array matrix plus the
// parallel metadata array, and helpers to build an exact-cosine HNSW index (hnswlib-node) over any
// subset of rows (e.g. "only the assigned products" for the holdout, or "everything" for proposals).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import hnswlibPkg from 'hnswlib-node';
const { HierarchicalNSW } = hnswlibPkg;

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_DIR = path.join(HERE, '..', '..', '..', 'data', 'local');

export function loadStore() {
  const metaPath = path.join(LOCAL_DIR, 'embeddings-meta.json');
  const vecPath = path.join(LOCAL_DIR, 'embeddings.f32');
  if (!existsSync(metaPath) || !existsSync(vecPath)) {
    throw new Error(`Embeddings not found under ${LOCAL_DIR}. Run "npm run embed" first.`);
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const buf = readFileSync(vecPath);
  const vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  if (vectors.length !== meta.items.length * meta.dim) {
    throw new Error(`Vector count mismatch: ${vectors.length} floats vs ${meta.items.length} items * ${meta.dim} dim`);
  }
  return { meta, vectors, dim: meta.dim, items: meta.items };
}

export function rowView(vectors, dim, i) {
  return vectors.subarray(i * dim, (i + 1) * dim);
}

/** Builds an HNSW index (cosine space; vectors are already L2-normalized so this equals dot-product
 * ranking) over the given row indices (indices into the full `items`/`vectors` arrays). Returns the
 * index plus a map from HNSW internal label -> original row index. efConstruction/M tuned for a
 * dataset in the tens of thousands on a laptop CPU; efSearch is set generously at query time for
 * near-exact recall (this is a prototype measurement, not a production latency budget). */
export function buildIndex(vectors, dim, rowIndices, { M = 32, efConstruction = 200 } = {}) {
  const index = new HierarchicalNSW('cosine', dim);
  index.initIndex(rowIndices.length, M, efConstruction);
  const labelToRow = new Int32Array(rowIndices.length);
  for (let label = 0; label < rowIndices.length; label++) {
    const row = rowIndices[label];
    index.addPoint(Array.from(rowView(vectors, dim, row)), label);
    labelToRow[label] = row;
  }
  index.setEf(Math.max(64, Math.min(400, rowIndices.length)));
  return { index, labelToRow };
}

/** k nearest neighbours of row `queryRow` using `vectors` directly as the query point, searching
 * `index`/`labelToRow`, requesting extra neighbours so we can drop the query itself if it is a member
 * of the indexed set (leave-one-out) and still return k results. Returns [{ row, similarity }]. */
export function knnSearch({ index, labelToRow }, vectors, dim, queryRow, k, { excludeRow = null } = {}) {
  const query = Array.from(rowView(vectors, dim, queryRow));
  const want = k + (excludeRow != null ? 1 : 0) + 2; // small cushion
  const result = index.searchKnn(query, want);
  const out = [];
  for (let i = 0; i < result.neighbors.length; i++) {
    const row = labelToRow[result.neighbors[i]];
    if (excludeRow != null && row === excludeRow) continue;
    // hnswlib-node cosine space returns distance = 1 - cosine_similarity
    out.push({ row, similarity: 1 - result.distances[i] });
    if (out.length === k) break;
  }
  return out;
}

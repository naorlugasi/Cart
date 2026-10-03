// Thin wrapper around transformers.js for intfloat/multilingual-e5-small (Xenova ONNX repack).
// e5 models are trained with "query: " / "passage: " instruction prefixes; we use "passage: " for
// everything we index (products are documents to be retrieved) and "query: " for ad-hoc lookups in
// query.mjs, matching the model's own convention.
import { pipeline, env } from '@xenova/transformers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
env.cacheDir = path.join(HERE, '..', '.cache');
env.allowRemoteModels = true;

export const MODEL_ID = 'Xenova/multilingual-e5-small';
export const DIM = 384;

let extractorPromise;
function getExtractor() {
  if (!extractorPromise) extractorPromise = pipeline('feature-extraction', MODEL_ID);
  return extractorPromise;
}

/** Embeds an array of raw (unprefixed) texts, returns a Float32Array of length texts.length*DIM,
 * row-major, L2-normalized (so dot product == cosine similarity). */
export async function embedBatch(texts, { prefix = 'passage: ' } = {}) {
  const extractor = await getExtractor();
  const prefixed = texts.map((t) => prefix + (t || ''));
  const out = await extractor(prefixed, { pooling: 'mean', normalize: true });
  return Float32Array.from(out.data);
}

export async function embedAll(texts, { prefix = 'passage: ', batchSize = 64, onProgress } = {}) {
  const n = texts.length;
  const result = new Float32Array(n * DIM);
  for (let i = 0; i < n; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const vecs = await embedBatch(batch, { prefix });
    result.set(vecs, i * DIM);
    if (onProgress) onProgress(Math.min(i + batchSize, n), n);
  }
  return result;
}

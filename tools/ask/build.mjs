#!/usr/bin/env node
// Builds the hybrid (embedding + BM25) retrieval index over the repo's
// written decisions: docs/**/*.md, ops/**/*.md, .claude/**/*.md, and the
// comment blocks in src/**/*.js, scripts/**/*.mjs, pipeline/**/*.mjs.
//
// Output: data/local/ask-index.json (gitignored - rebuild with `node
// tools/ask/build.mjs` any time the source files change; nothing reads it
// but tools/ask/ask.mjs).
//
// Usage: node tools/ask/build.mjs [--quiet]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, pipeline } from '@xenova/transformers';
import { walkFiles } from './lib/walk.mjs';
import { chunkMarkdown, chunkCodeComments } from './lib/chunk.mjs';
import { buildBM25 } from './lib/bm25.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const OUT_FILE = path.join(REPO_ROOT, 'data', 'local', 'ask-index.json');
const MODEL = 'Xenova/multilingual-e5-small';
const EMBED_BATCH = 16;

const quiet = process.argv.includes('--quiet');
const log = (...args) => { if (!quiet) console.error(...args); };

function relative(p) {
  return path.relative(REPO_ROOT, p).split(path.sep).join('/');
}

function collectMarkdownChunks(dir) {
  const files = walkFiles(path.join(REPO_ROOT, dir), ['.md']);
  const chunks = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const c of chunkMarkdown(text)) {
      chunks.push({ file: relative(file), ...c });
    }
  }
  return chunks;
}

function collectCodeChunks(dir, extensions) {
  const files = walkFiles(path.join(REPO_ROOT, dir), extensions);
  const chunks = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const base = path.basename(file);
    for (const c of chunkCodeComments(text, base)) {
      chunks.push({ file: relative(file), ...c });
    }
  }
  return chunks;
}

async function main() {
  const t0 = Date.now();

  const chunks = [
    ...collectMarkdownChunks('docs'),
    ...collectMarkdownChunks('ops'),
    ...collectMarkdownChunks('.claude'),
    ...collectCodeChunks('src', ['.js']),
    ...collectCodeChunks('scripts', ['.mjs']),
    ...collectCodeChunks('pipeline', ['.mjs']),
  ];

  log(`collected ${chunks.length} chunks from the repo`);

  const bm25 = buildBM25(chunks.map((c) => c.text));

  log(`loading embedding model (${MODEL})...`);
  env.cacheDir = path.join(HERE, '.cache');
  env.allowRemoteModels = true;
  const extractor = await pipeline('feature-extraction', MODEL, { quantized: true });

  log(`embedding ${chunks.length} chunks in batches of ${EMBED_BATCH}...`);
  const embeddings = new Array(chunks.length);
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const inputs = batch.map((c) => `passage: ${c.heading ? c.heading + ' - ' : ''}${c.text}`.slice(0, 2000));
    const out = await extractor(inputs, { pooling: 'mean', normalize: true });
    const arr = out.tolist();
    for (let j = 0; j < batch.length; j++) {
      embeddings[i + j] = arr[j].map((x) => Math.round(x * 1e6) / 1e6);
    }
    if (!quiet && (i / EMBED_BATCH) % 10 === 0) log(`  ${Math.min(i + EMBED_BATCH, chunks.length)}/${chunks.length}`);
  }

  const index = {
    model: MODEL,
    builtAt: new Date().toISOString(),
    buildMs: Date.now() - t0,
    chunkCount: chunks.length,
    chunks: chunks.map((c, i) => ({
      id: i,
      file: c.file,
      startLine: c.startLine,
      endLine: c.endLine,
      heading: c.heading,
      text: c.text,
      embedding: embeddings[i],
    })),
    bm25: { tf: bm25.tf, len: bm25.len, df: bm25.df, N: bm25.N, avgdl: bm25.avgdl },
  };

  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(index));

  const ms = Date.now() - t0;
  log(`wrote ${relative(OUT_FILE)} (${chunks.length} chunks) in ${ms}ms`);
  console.log(JSON.stringify({ chunks: chunks.length, buildMs: ms, outFile: relative(OUT_FILE) }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

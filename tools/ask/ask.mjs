#!/usr/bin/env node
// Query the hybrid retrieval index built by build.mjs. Retrieval only - no
// LLM, no generation. The caller (a Claude session) reads the returned
// chunks and reasons over them itself.
//
// Usage:
//   node tools/ask/ask.mjs "question" [--k 8] [--files "docs/**"] [--json]

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, pipeline } from '@xenova/transformers';
import { scoreBM25 } from './lib/bm25.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const INDEX_FILE = path.join(REPO_ROOT, 'data', 'local', 'ask-index.json');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--k') args.k = Number(argv[++i]);
    else if (a === '--files') args.files = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--method') args.method = argv[++i]; // embed | bm25 | hybrid (default)
    else args._.push(a);
  }
  return args;
}

/** Turn a simple glob ("docs/**", "*.md", "scripts/*.mjs") into a RegExp. */
function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // embeddings are already L2-normalized at build time
}

/** Reciprocal Rank Fusion over any number of ranked id lists. */
function rrf(rankedLists, k = 60) {
  const scores = new Map();
  for (const list of rankedLists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return scores;
}

function rankedIdsByScore(ids, scores) {
  return [...ids].sort((a, b) => scores[b] - scores[a]);
}

async function embedQuery(query) {
  env.cacheDir = path.join(HERE, '.cache');
  env.allowRemoteModels = true;
  const extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { quantized: true });
  const out = await extractor([`query: ${query}`], { pooling: 'mean', normalize: true });
  return out.tolist()[0];
}

function trimToLines(text, n = 15) {
  const lines = text.split('\n');
  if (lines.length <= n) return text;
  return lines.slice(0, n).join('\n') + `\n... (${lines.length - n} more lines)`;
}

export async function search(query, { k = 8, filesGlob = null, method = 'hybrid' } = {}) {
  if (!existsSync(INDEX_FILE)) {
    throw new Error(`no index at ${path.relative(REPO_ROOT, INDEX_FILE)} - run: node tools/ask/build.mjs`);
  }
  const index = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
  let chunks = index.chunks;
  let allowedIds = null;
  if (filesGlob) {
    const re = globToRegExp(filesGlob);
    allowedIds = new Set(chunks.filter((c) => re.test(c.file)).map((c) => c.id));
  }

  const candidateIds = chunks.filter((c) => !allowedIds || allowedIds.has(c.id)).map((c) => c.id);

  let embedRanked = [];
  let bm25Ranked = [];

  if (method === 'embed' || method === 'hybrid') {
    const qEmb = await embedQuery(query);
    const simScores = {};
    for (const id of candidateIds) simScores[id] = cosine(qEmb, chunks[id].embedding);
    embedRanked = rankedIdsByScore(candidateIds, simScores);
  }

  if (method === 'bm25' || method === 'hybrid') {
    const bm25Scores = scoreBM25(index.bm25, query);
    const scoreById = {};
    for (const id of candidateIds) scoreById[id] = bm25Scores[id];
    bm25Ranked = rankedIdsByScore(candidateIds, scoreById);
  }

  let finalIds;
  if (method === 'embed') finalIds = embedRanked;
  else if (method === 'bm25') finalIds = bm25Ranked;
  else {
    const fused = rrf([embedRanked, bm25Ranked]);
    finalIds = rankedIdsByScore(candidateIds, Object.fromEntries(fused));
  }

  return finalIds.slice(0, k).map((id) => chunks[id]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const query = args._.join(' ').trim();
  if (!query) {
    console.error('usage: node tools/ask/ask.mjs "<question>" [--k 8] [--files glob] [--json] [--method embed|bm25|hybrid]');
    process.exit(1);
  }
  const results = await search(query, { k: args.k ?? 8, filesGlob: args.files ?? null, method: args.method ?? 'hybrid' });

  if (args.json) {
    console.log(JSON.stringify(results.map((r) => ({ file: r.file, startLine: r.startLine, endLine: r.endLine, heading: r.heading, text: r.text })), null, 2));
    return;
  }

  for (const r of results) {
    const headingPart = r.heading ? ` [${r.heading}]` : '';
    console.log(`${r.file}:${r.startLine}${headingPart}`);
    console.log(trimToLines(r.text));
    console.log('');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}

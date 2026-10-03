#!/usr/bin/env node
// Measures retrieval quality: for each of 15 real questions a session asked
// this week, checks whether the chunk holding the actual decision lands in
// the top 3 (and top 1), for embedding-only, BM25-only and hybrid (RRF).
// "Right passage" is identified by file path (a question can be answered by
// more than one file; `files` lists every acceptable one) - good enough to
// grade a retrieval tool, since the session reading the result judges the
// text itself.
//
// Usage: node tools/ask/measure.mjs [--json]

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search } from './ask.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const QUESTIONS = [
  { q: 'where do cereal bars go, which department', files: ['docs/CATEGORIES.md'] },
  { q: 'are fresh and frozen meat the same concept', files: ['scripts/frozen-twins.mjs'] },
  { q: 'why does the build vote across all chain names', files: ['scripts/build-products.mjs'] },
  { q: 'what is the 3x band for weighed concept cards', files: ['docs/CONCEPTS.md'] },
  { q: "can the pipeline request a chain's website", files: ['docs/PIPELINE-CONTRACT.md'] },
  { q: 'what does basePrice mean when only one chain sells the product', files: ['docs/PIPELINE-CONTRACT.md'] },
  { q: 'why did Shuk City show everything out of stock', files: ['src/catalog/priceXml.js'] },
  { q: 'which departments exist and since when', files: ['docs/CATEGORIES.md'] },
  { q: 'what happens when npm test is red on the runner', files: ['docs/RUNNER-MAC.md'] },
  { q: 'how does --only-failed retry work', files: ['docs/RUNNER-MAC.md'] },
  { q: 'why is מארז not processed for mushrooms', files: ['src/catalog/categorize.js'] },
  { q: 'what is the Sal Israel coverage gate', files: ['docs/SAL-ISRAEL.md'] },
  { q: 'what are substitute caveats', files: ['docs/CONCEPTS.md', 'docs/PIPELINE-CONTRACT.md', 'src/pricing/substituteRules.js', 'src/pricing/substitutes.js'] },
  { q: "who decides a product's department", files: ['docs/CATEGORIES.md', '.claude/skills/taxonomy/SKILL.md'] },
  { q: 'what is a frozen twin', files: ['scripts/frozen-twins.mjs'] },
];

async function run(method) {
  const rows = [];
  for (const { q, files } of QUESTIONS) {
    const results = await search(q, { k: 8, method });
    const rank = results.findIndex((r) => files.includes(r.file));
    rows.push({ q, hit1: rank === 0, hit3: rank >= 0 && rank < 3, rank: rank === -1 ? null : rank + 1, top: results[0] ? `${results[0].file}:${results[0].startLine}` : null });
  }
  const hits1 = rows.filter((r) => r.hit1).length;
  const hits3 = rows.filter((r) => r.hit3).length;
  return { method, rows, hits1, hits3, total: rows.length };
}

async function main() {
  const asJson = process.argv.includes('--json');
  const methods = ['embed', 'bm25', 'hybrid'];
  const results = [];
  for (const m of methods) results.push(await run(m));

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  for (const r of results) {
    console.log(`\n=== ${r.method} === hits@1: ${r.hits1}/${r.total}  hits@3: ${r.hits3}/${r.total}`);
    for (const row of r.rows) {
      const mark = row.hit1 ? 'hit@1' : row.hit3 ? 'hit@3' : row.rank ? `rank ${row.rank}` : 'miss';
      console.log(`  [${mark.padEnd(7)}] ${row.q}  -> ${row.top}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

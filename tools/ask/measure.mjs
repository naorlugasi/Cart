#!/usr/bin/env node
// Measures retrieval quality: for each of 15 real questions a session asked
// this week, checks whether the chunk holding the actual decision lands in
// the top 3 (and top 1), for embedding-only, BM25-only and hybrid (RRF) -
// and for two phrasings of each question: the English one from the task,
// and a Hebrew one phrased the way a session actually asks it day to day
// (with the department name, concept id or date when the session would
// naturally know it - not reverse-engineered from what the index needs).
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
  {
    en: 'where do cereal bars go, which department',
    he: 'לאיזו מחלקה הולכים חטיפי דגנים (ברים)?',
    files: ['docs/CATEGORIES.md'],
  },
  {
    en: 'are fresh and frozen meat the same concept',
    he: 'האם בשר, עוף ודגים טריים וקפואים הם אותו מושג? (נאור, 28.9)',
    files: ['scripts/frozen-twins.mjs'],
  },
  {
    en: 'why does the build vote across all chain names',
    he: 'למה הבנייה (build-products) מצביעה על כל שמות הרשתות של ברקוד?',
    files: ['scripts/build-products.mjs'],
  },
  {
    en: 'what is the 3x band for weighed concept cards',
    he: 'מה הרצועה של פי 3 מה-basePrice בכרטיס מושג שקיל?',
    files: ['docs/CONCEPTS.md'],
  },
  {
    en: "can the pipeline request a chain's website",
    he: 'האם הצינור (pipeline) יכול לפנות לאתר של רשת?',
    files: ['docs/PIPELINE-CONTRACT.md'],
  },
  {
    en: 'what does basePrice mean when only one chain sells the product',
    he: 'מה המשמעות של basePrice כשרק רשת אחת מוכרת את המוצר?',
    files: ['docs/PIPELINE-CONTRACT.md'],
  },
  {
    en: 'why did Shuk City show everything out of stock',
    he: 'למה שוק סיטי הראתה הכול אזל מהמלאי? (23.9)',
    files: ['src/catalog/priceXml.js'],
  },
  {
    en: 'which departments exist and since when',
    he: 'אילו מחלקות קיימות בקטלוג ומתי כל אחת נפתחה?',
    files: ['docs/CATEGORIES.md'],
  },
  {
    en: 'what happens when npm test is red on the runner',
    he: 'מה קורה כש-npm test אדום במרלוג?',
    files: ['docs/RUNNER-MAC.md'],
  },
  {
    en: 'how does --only-failed retry work',
    he: 'איך עובד הניסיון החוזר עם --only-failed?',
    files: ['docs/RUNNER-MAC.md'],
  },
  {
    en: 'why is מארז not processed for mushrooms',
    he: 'למה "מארז" לא נחשב מעובד (PROCESSED) אצל פטריות?',
    files: ['src/catalog/categorize.js'],
  },
  {
    en: 'what is the Sal Israel coverage gate',
    he: 'מה כלל הכיסוי (85%) בדף הסל של ישראל?',
    files: ['docs/SAL-ISRAEL.md'],
  },
  {
    en: 'what are substitute caveats',
    he: 'מהם ה-caveats האפשריים בתחליף (substitute)?',
    files: ['docs/CONCEPTS.md', 'docs/PIPELINE-CONTRACT.md', 'src/pricing/substituteRules.js', 'src/pricing/substitutes.js'],
  },
  {
    en: "who decides a product's department",
    he: 'מי קובע את המחלקה של מוצר?',
    files: ['docs/CATEGORIES.md', '.claude/skills/taxonomy/SKILL.md'],
  },
  {
    en: 'what is a frozen twin',
    he: 'מה זה תאום קפוא (frozen twin)?',
    files: ['scripts/frozen-twins.mjs'],
  },
];

async function run(method, lang) {
  const rows = [];
  for (const item of QUESTIONS) {
    const q = item[lang];
    const results = await search(q, { k: 8, method });
    const rank = results.findIndex((r) => item.files.includes(r.file));
    rows.push({ q, hit1: rank === 0, hit3: rank >= 0 && rank < 3, rank: rank === -1 ? null : rank + 1, top: results[0] ? `${results[0].file}:${results[0].startLine}` : null });
  }
  const hits1 = rows.filter((r) => r.hit1).length;
  const hits3 = rows.filter((r) => r.hit3).length;
  return { method, lang, rows, hits1, hits3, total: rows.length };
}

async function main() {
  const asJson = process.argv.includes('--json');
  const methods = ['embed', 'bm25', 'hybrid'];
  const langs = ['en', 'he'];
  const results = [];
  for (const lang of langs) {
    for (const m of methods) results.push(await run(m, lang));
  }

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log('\n=== summary: hits@1 / hits@3 out of 15, English vs Hebrew phrasing ===');
  console.log('method    | en hits@1 | en hits@3 | he hits@1 | he hits@3');
  for (const m of methods) {
    const en = results.find((r) => r.method === m && r.lang === 'en');
    const he = results.find((r) => r.method === m && r.lang === 'he');
    console.log(`${m.padEnd(9)} | ${String(en.hits1).padStart(9)} | ${String(en.hits3).padStart(9)} | ${String(he.hits1).padStart(9)} | ${String(he.hits3).padStart(9)}`);
  }

  for (const r of results) {
    console.log(`\n=== ${r.method} (${r.lang}) === hits@1: ${r.hits1}/${r.total}  hits@3: ${r.hits3}/${r.total}`);
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

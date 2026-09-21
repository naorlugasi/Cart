#!/usr/bin/env node
/**
 * Which keyword in src/catalog/categorize.js matches nothing in the published catalog.
 *
 *   node scripts/dead-keywords.mjs
 *
 * A keyword that never fires is not automatically wrong - the rules are the fallback for products that have
 * not arrived yet, and "מצות" is dead in September on purpose. What the list is for is the other kind: a
 * keyword written in a form the chains never use, which looks like it works and cannot. "תחבושת" never
 * matched, because every chain writes "תחבושות"; the same for "סוללה" against "סוללות" and "מקרון" against
 * "מקרונים" (a final letter that the plural does not have). Read the list with that question in mind, and
 * check a suspect against the catalog before changing it - a shorter stem of the same word matching is the
 * evidence, not the fact that the term is silent.
 *
 * Deliberately a tool and not a test: it reads only the committed catalog, so it runs anywhere, but a dead
 * keyword is a question and not a failure.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORY_RULES } from '../src/catalog/categorize.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8')).map((p) => p.name);
const HEB = '\\u05d0-\\u05ea';
const START = `(?:(?<![${HEB}])|(?<=(?<![${HEB}])[בהוכלמש]))`;
let total = 0;
for (const [category, re] of CATEGORY_RULES) {
  // split the alternation back into its terms (the source is `START(?:a|b|c)`)
  if (!re.source.startsWith(START)) { console.log('!! unexpected rule shape for ' + category); continue; }
  const body = re.source.slice(START.length).replace(/^\(\?:/, '').replace(/\)$/, '');
  const terms = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === '|' && depth === 0) { terms.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) terms.push(cur);
  const dead = terms.filter((t) => {
    try { const r = new RegExp(START + '(?:' + t + ')'); return !names.some((n) => r.test(n)); } catch { return false; }
  });
  if (dead.length) { total += dead.length; console.log(`${category}: ${dead.length} of ${terms.length} never match — ${dead.join(', ')}`); }
}
console.log(`\n${total} keyword terms match nothing in the published catalog`);

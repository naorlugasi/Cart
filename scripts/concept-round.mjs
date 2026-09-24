#!/usr/bin/env node
/**
 * The before/after of a concept round, measured instead of asserted.
 *
 *   node scripts/concept-round.mjs --snapshot /tmp/before.json     # before editing the rules
 *   ...edit config/concepts/*.json...
 *   node scripts/concept-round.mjs --snapshot /tmp/after.json
 *   node scripts/concept-round.mjs --diff /tmp/before.json /tmp/after.json
 *
 *   --raw            also read every name the chains publish (data/prices/<chain>/catalog.full.json),
 *                    not only the names that reached data/products.json. Slower, and only available on a
 *                    machine that downloaded the price files, but it is the honest measurement: a rule is
 *                    wrong about names, and a name can exist in the raw files without reaching the catalog.
 *   --samples N      how many example names to print per gained/lost line (default 6)
 *
 * Every round we have run wrote its own throw-away measurement script, and that is exactly where a mistake
 * hides: the round that broke fresh chicken schnitzel measured the concept it was fixing and not the
 * concept next door. This prints both directions for every concept at once - what each one gained and what
 * it lost - so a rule that quietly emptied a neighbour cannot pass review.
 *
 * Read the LOST column first. A rule that gains what you wanted and loses nothing is the normal outcome;
 * anything in LOST is either the point of the round or a regression, and it has to be named as one.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConcepts, matchingConcepts } from '../src/catalog/concepts.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const SAMPLES = Number(opt('samples', 6));
const NONE = '(none)';

function collectNames() {
  const names = new Set();
  const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
  for (const p of products) {
    if (p.name) names.add(p.name);
    for (const a of p.aliases ?? []) if (a && !/^\d{6,}$/.test(a)) names.add(a);
  }
  if (args.includes('--raw')) {
    const PRICES = path.join(ROOT, 'data', 'prices');
    if (!existsSync(PRICES)) { console.error('--raw needs data/prices/, which only exists on a machine that downloaded the price files'); process.exit(1); }
    for (const chain of readdirSync(PRICES)) {
      const f = path.join(PRICES, chain, 'catalog.full.json');
      if (!existsSync(f)) continue;
      for (const i of JSON.parse(readFileSync(f, 'utf8')).items ?? []) if (i.name) names.add(i.name);
    }
  }
  return [...names];
}

function snapshot(out) {
  const list = loadConcepts();
  const names = collectNames();
  const map = {};
  for (const n of names) {
    const hits = matchingConcepts(n, list).map((c) => c.id);
    map[n] = hits.length === 1 ? hits[0] : hits.length === 0 ? NONE : hits.sort().join('+');
  }
  writeFileSync(out, JSON.stringify({ takenAt: new Date().toISOString(), raw: args.includes('--raw'), concepts: list.length, names: map }, null, 0));
  const assigned = Object.values(map).filter((v) => v !== NONE && !v.includes('+')).length;
  const conflict = Object.values(map).filter((v) => v.includes('+')).length;
  console.log(`snapshot ${out}: ${names.length} names, ${assigned} assigned, ${conflict} conflicts, ${names.length - assigned - conflict} unassigned, ${list.length} concepts`);
}

function diff(aFile, bFile) {
  const a = JSON.parse(readFileSync(aFile, 'utf8'));
  const b = JSON.parse(readFileSync(bFile, 'utf8'));
  if (a.raw !== b.raw) console.log(`WARNING: one snapshot used --raw and the other did not; the comparison is not like for like\n`);
  const moved = new Map(); // "from→to" -> names
  for (const [name, to] of Object.entries(b.names)) {
    const from = a.names[name];
    if (from === undefined) continue; // a name that did not exist before says nothing about the rules
    if (from === to) continue;
    const k = `${from} → ${to}`;
    (moved.get(k) ?? moved.set(k, []).get(k)).push(name);
  }
  const gone = Object.keys(a.names).filter((n) => b.names[n] === undefined).length;
  const fresh = Object.keys(b.names).filter((n) => a.names[n] === undefined).length;

  const perConcept = new Map();
  const bump = (id, dir, name) => {
    if (id === NONE) return;
    const c = perConcept.get(id) ?? { gained: [], lost: [] };
    c[dir].push(name);
    perConcept.set(id, c);
  };
  for (const [k, names] of moved) {
    const [from, to] = k.split(' → ');
    for (const n of names) { bump(to, 'gained', n); bump(from, 'lost', n); }
  }

  const countOf = (snap, id) => Object.values(snap.names).filter((v) => v === id).length;
  console.log(`names compared: ${Object.keys(a.names).length} before, ${Object.keys(b.names).length} after (${fresh} new, ${gone} disappeared - those are catalog changes, not rule changes)`);
  console.log(`names whose concept changed: ${[...moved.values()].reduce((s, v) => s + v.length, 0)}\n`);
  if (!perConcept.size) { console.log('no rule changed any name.'); return; }

  const ids = [...perConcept.keys()].sort((x, y) => {
    const c = perConcept.get(y).gained.length + perConcept.get(y).lost.length;
    return c - (perConcept.get(x).gained.length + perConcept.get(x).lost.length);
  });
  for (const id of ids) {
    const { gained, lost } = perConcept.get(id);
    console.log(`${id}   ${countOf(a, id)} → ${countOf(b, id)}   +${gained.length} / -${lost.length}`);
    if (lost.length) console.log(`   LOST   ${lost.slice(0, SAMPLES).join(' | ')}${lost.length > SAMPLES ? `  (+${lost.length - SAMPLES} more)` : ''}`);
    if (gained.length) console.log(`   gained ${gained.slice(0, SAMPLES).join(' | ')}${gained.length > SAMPLES ? `  (+${gained.length - SAMPLES} more)` : ''}`);
  }

  const newConflicts = [...moved.entries()].filter(([k]) => k.split(' → ')[1].includes('+'));
  if (newConflicts.length) {
    console.log(`\nCONFLICTS introduced (a name two concepts both claim - the build drops it):`);
    for (const [k, names] of newConflicts) console.log(`   ${k}   ${names.slice(0, SAMPLES).join(' | ')}`);
  }
  console.log(`\nread the LOST lines: each one is either the point of the round or a regression, and the commit message has to say which.`);
}

if (opt('snapshot')) snapshot(opt('snapshot'));
else if (args.includes('--diff')) { const i = args.indexOf('--diff'); diff(args[i + 1], args[i + 2]); }
else { console.error('usage: --snapshot <file> [--raw] | --diff <before> <after>'); process.exit(1); }

#!/usr/bin/env node
/**
 * Does any portal hold a price file newer than the one our published catalog was built from?
 *
 *   node ops/newer-than-ours.mjs                      # every chain
 *   node ops/newer-than-ours.mjs carrefour victory    # only these (Shufersal's listing takes ~30
 *                                                     # minutes, so a poller should not include it)
 *
 * Used by ops/publish-when-ready.sh. The question is deliberately "newer than ours", not "today's
 * file": on a Shabbat or a holiday no chain publishes, the portals keep serving Friday's files, and
 * waiting for a file stamped today would wait for something that will never arrive.
 *
 * "Ours" is the source timestamp of each published catalog (sourceDate, else the stamp in the file
 * name it was built from), compared against the newest file the portal lists for that same store.
 * Exit 0  = something newer exists and every chain lists at least one file (a refresh can publish)
 *      10 = nothing newer anywhere - a Shabbat or a holiday, waiting longer will not help
 *      11 = something is newer, but a chain still lists no file at all (a late portal: keep waiting)
 *      1  = no portal could be read
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listRetailer } from '../pipeline/listing.mjs';
import { RETAILERS } from '../pipeline/retailers.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGS = path.join(ROOT, 'data', 'catalogs');
/** A comparable YYYYMMDDHHMMSS stamp. File names end in "-20260922-004004"; sourceDate is ISO or the
 *  same stamp. A 4-digit time (Keshet) means HHMM, so it is padded to HHMM00, never left shorter. */
const pad = (date, time) => date + String(time).padEnd(6, '0');
const stampFromName = (name) => { const m = String(name ?? '').match(/(20\d{6})-(\d{4,6})(?=\D|$)/); return m ? pad(m[1], m[2]) : null; };
const stampFromDate = (v) => {
  const iso = String(v ?? '').match(/(20\d{2})-(\d{2})-(\d{2})(?:[T ](\d{2}):?(\d{2})(?::?(\d{2}))?)?/);
  if (iso) return pad(`${iso[1]}${iso[2]}${iso[3]}`, `${iso[4] ?? '00'}${iso[5] ?? '00'}${iso[6] ?? '00'}`);
  return stampFromName(v);
};

/** What we already published: one row per catalog, with the chain number and store its prices came from. */
function ours() {
  const rows = [];
  for (const file of readdirSync(CATALOGS)) {
    if (!file.endsWith('.json') || file === 'demo.json') continue;
    const c = JSON.parse(readFileSync(path.join(CATALOGS, file), 'utf8'));
    const src = c.source ?? {};
    const name = String(src.price ?? '').split('/').pop() ?? '';
    const chain = (name.match(/(?:Price|Promo)Full(\d{13})/) ?? [])[1] ?? null;
    const ts = stampFromDate(c.sourceDate ?? c.priceListMeta?.sourceDate) ?? stampFromName(name);
    if (chain && ts) rows.push({ catalog: file.replace('.json', ''), chain, store: src.store ?? null, ts });
  }
  return rows;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const byChain = new Map(Object.entries(RETAILERS).map(([id, src]) => [src.chain, { id, src }]));
const wanted = ours().filter((r) => !only.length || only.includes(r.catalog) || only.includes(byChain.get(r.chain)?.id));
let newer = [], empty = [], read = 0;

for (const [chain, group] of new Map(wanted.map((r) => [r.chain, r]))) {
  const retailer = byChain.get(chain);
  if (!retailer) continue;
  let files;
  try { files = await listRetailer(retailer.src, { kinds: ['PriceFull'] }); read++; }
  catch (err) { empty.push(retailer.id); console.log(`${retailer.id.padEnd(12)} listing failed: ${err.message}`); continue; }
  const anyStamp = files.map((f) => stampFromName(f.ts)).filter(Boolean).sort();
  const newestAny = anyStamp[anyStamp.length - 1] ?? null;
  if (!newestAny) { empty.push(retailer.id); console.log(`${retailer.id.padEnd(12)} lists no price file yet`); continue; }
  for (const row of wanted.filter((r) => r.chain === chain)) {
    const mine = files.filter((f) => !row.store || String(f.storeId) === String(row.store)).map((f) => stampFromName(f.ts)).filter(Boolean).sort();
    // Our own store may not publish (Osher Ad, Keshet): the fetcher then falls back to the chain's
    // largest store, so the chain's newest file is what decides whether a run has anything to add.
    const portal = mine[mine.length - 1] ?? newestAny;
    const isNew = portal > row.ts;
    if (isNew) newer.push(row.catalog);
    console.log(`${row.catalog.padEnd(12)} store ${String(row.store ?? '-').padEnd(4)} ours ${row.ts} portal ${portal}${mine.length ? '' : ' (chain newest)'}${isNew ? '  NEW' : ''}`);
  }
}

if (!read) { console.log('no portal could be listed'); process.exit(1); }
if (!newer.length) { console.log('nothing newer than what we already published'); process.exit(10); }
console.log(`newer than ours: ${newer.join(' ')}`);
if (empty.length) { console.log(`still lists nothing: ${empty.join(' ')}`); process.exit(11); }
process.exit(0);

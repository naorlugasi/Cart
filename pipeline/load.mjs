/**
 * Load the downloaded files into DuckDB (data/pipeline/prices.duckdb) through the `duckdb` CLI
 * (brew install duckdb) - no native npm dependency, nothing the web app has to install.
 *
 * Tables (DATA-SERVICE-PLAN §3, DuckDB flavour):
 *   stores(chain_id, store_id, sub_chain, name, address, city, store_type, content_group, updated_at)
 *   prices_current(chain_id, store_id, code, gtin, price, unit_price, is_weighted, name, manufacturer, file_ts, run_date)
 *   prices_history(chain_id, store_id, code, price, valid_from, valid_to)
 *   files(chain_id, name, kind, store_id, ts, sha1, bytes, rows, run_date, status)
 *   runs(run_date, chain_id, stage, status, files, rows, changed, started_at, finished_at, error)
 *
 * Files with the same sha1 are parsed once and loaded for every store that published them
 * (content_group = sha1 prefix), which is 60-80% of the work saved for chains with uniform pricing.
 */
import { execFileSync } from 'node:child_process';
import { statfsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { decodeArchive } from './listing.mjs';
import { parsePriceFile, parseElements } from '../src/catalog/priceXml.js';
import { RAW, readManifest } from './fetch.mjs';

export const DB = (root) => path.join(root, 'data', 'pipeline', 'prices.duckdb');

export const SCHEMA = `
create table if not exists stores (chain_id varchar, store_id varchar, sub_chain varchar, name varchar, address varchar, city varchar, store_type varchar, content_group varchar, updated_at timestamp, primary key (chain_id, store_id));
create table if not exists prices_current (chain_id varchar, store_id varchar, code varchar, gtin varchar, price double, unit_price double, is_weighted boolean, name varchar, manufacturer varchar, file_ts varchar, run_date date, primary key (chain_id, store_id, code));
create table if not exists prices_history (chain_id varchar, store_id varchar, code varchar, price double, valid_from date, valid_to date);
create table if not exists files (chain_id varchar, name varchar, kind varchar, store_id varchar, ts varchar, sha1 varchar, bytes bigint, rows integer, run_date date, status varchar, primary key (chain_id, name));
create table if not exists runs (run_date date, chain_id varchar, stage varchar, status varchar, files integer, rows bigint, changed bigint, started_at timestamp, finished_at timestamp, error varchar);
create index if not exists prices_current_gtin on prices_current (gtin);
`;

export function duck(root, sql, { json = false } = {}) {
  mkdirSync(path.dirname(DB(root)), { recursive: true });
  const args = [DB(root)];
  if (json) args.unshift('-json');
  const out = execFileSync('duckdb', args, { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 });
  return json ? (out.trim() ? JSON.parse(out) : []) : out;
}

const csvEscape = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`);

/** Stores XML -> rows */
export function parseStoresFile(xml) {
  // parseElements already returns each element's fields as an object
  return parseElements(xml, ['Store', 'STORE', 'Branch']).map((f) => {
    const get = (...names) => { for (const n of names) { const k = Object.keys(f).find((x) => x.toLowerCase() === n.toLowerCase()); if (k && f[k] !== '') return f[k]; } return null; };
    return { storeId: String(get('StoreId', 'StoreID') ?? '').padStart(3, '0'), sub: get('SubChainId', 'SubChainID'), name: get('StoreName'), address: get('Address'), city: get('City'), type: get('StoreType') };
  }).filter((s) => s.storeId && s.storeId !== '000');
}

/**
 * Load one retailer's raw files of `date` (from its manifest) into DuckDB.
 * Returns { stores, files, rows, changed, groups }.
 */
export function freeGb(root) { const s = statfsSync(root); return (s.bavail * s.bsize) / 1e9; }

export function loadRetailer({ root, chainId, date, log = console.log }) {
  const free = freeGb(root);
  if (free < 5) throw new Error(`only ${free.toFixed(1)} GB free - refusing to load (the staging CSVs need a few GB)`);
  const tmpDir = path.join(root, 'data', 'pipeline', 'tmp', `${chainId}-${date}`);
  try { return loadRetailerInner({ root, chainId, date, log, tmp: tmpDir }); }
  finally { rmSync(tmpDir, { recursive: true, force: true }); } // never leave staging files behind (a crash once filled the disk)
}

function loadRetailerInner({ root, chainId, date, log, tmp }) {
  const started = new Date().toISOString();
  const manifest = readManifest(root, chainId, date);
  const dir = RAW(root, chainId, date);
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  duck(root, SCHEMA);
  const runDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  let sql = `begin;\n`;

  // --- stores
  const storesFile = Object.entries(manifest.files).find(([, m]) => m.kind === 'Stores' && m.sha1);
  let storeCount = 0;
  if (storesFile) {
    const rows = parseStoresFile(decodeArchive(readFileSync(path.join(dir, storesFile[0]))));
    const csv = ['chain_id,store_id,sub_chain,name,address,city,store_type', ...rows.map((s) => [chainId, s.storeId, s.sub, s.name, s.address, s.city, s.type].map(csvEscape).join(','))].join('\n');
    writeFileSync(path.join(tmp, 'stores.csv'), csv);
    sql += `insert or replace into stores select chain_id, store_id, sub_chain, name, address, city, store_type, null, now() from read_csv('${path.join(tmp, 'stores.csv')}', header = true, all_varchar = true);\n`;
    storeCount = rows.length;
  }

  // --- prices. Every file carries its own StoreId, so raw bytes never repeat; the content group is
  // the hash of the (code, price) rows, which tells identical price lists apart from distinct ones.
  // Files are processed one at a time and written to disk immediately (416 Shufersal stores x 15k
  // items would not fit in memory as strings).
  const priceFiles = Object.entries(manifest.files).filter(([, m]) => m.kind === 'PriceFull' && m.sha1);
  const groupOf = new Map();      // signature -> group id (12 hex chars)
  const storeGroup = [];          // [storeId, group]
  let rowCount = 0, fileIdx = 0;
  const filesCsv = ['chain_id,name,kind,store_id,ts,sha1,bytes,rows,run_date,status'];
  const header = 'chain_id,store_id,code,gtin,price,unit_price,is_weighted,name,manufacturer,file_ts';
  for (const [name, m] of priceFiles) {
    const parsed = parsePriceFile(decodeArchive(readFileSync(path.join(dir, name))));
    const sig = createHash('sha1').update(parsed.items.map((it) => `${it.code}|${it.price}`).sort().join('\n')).digest('hex').slice(0, 12);
    groupOf.set(sig, (groupOf.get(sig) ?? 0) + 1);
    storeGroup.push([m.storeId, sig]);
    const out = [header];
    for (const it of parsed.items) {
      if (!it.code || it.price == null) continue;
      out.push([chainId, m.storeId, it.code, it.gtin ?? '', it.price, it.unitPrice ?? '', it.isWeighted ? 'true' : 'false', it.name, it.manufacturer ?? '', m.ts].map(csvEscape).join(','));
    }
    writeFileSync(path.join(tmp, `prices-${String(fileIdx++).padStart(4, '0')}.csv`), out.join('\n'));
    filesCsv.push([chainId, name, 'PriceFull', m.storeId, m.ts, m.sha1, m.bytes, parsed.items.length, runDate, 'loaded'].map(csvEscape).join(','));
    rowCount += parsed.items.length;
  }
  if (fileIdx) sql += `insert into staging select * from read_csv('${path.join(tmp, 'prices-*.csv')}', header = true, union_by_name = false, columns = {chain_id: 'varchar', store_id: 'varchar', code: 'varchar', gtin: 'varchar', price: 'double', unit_price: 'double', is_weighted: 'boolean', name: 'varchar', manufacturer: 'varchar', file_ts: 'varchar'});\n`;
  for (const [storeId, sig] of storeGroup) sql += `update stores set content_group = '${sig}' where chain_id = '${chainId}' and store_id = '${storeId}';\n`;
  const byHash = groupOf;
  writeFileSync(path.join(tmp, 'files.csv'), filesCsv.join('\n'));

  const stagingSql = `create temp table staging (chain_id varchar, store_id varchar, code varchar, gtin varchar, price double, unit_price double, is_weighted boolean, name varchar, manufacturer varchar, file_ts varchar);\n`;
  const finish = `
    -- history: price changed since the current row
    insert into prices_history select c.chain_id, c.store_id, c.code, c.price, c.run_date, date '${runDate}'
      from prices_current c join staging s using (chain_id, store_id, code) where c.price <> s.price;
    create temp table changed_count as select count(*) as n from prices_current c join staging s using (chain_id, store_id, code) where c.price <> s.price;
    insert or replace into prices_current select chain_id, store_id, code, gtin, price, unit_price, is_weighted, name, manufacturer, file_ts, date '${runDate}' from staging;
    insert or replace into files select chain_id, name, kind, store_id, ts, sha1, bytes, rows, run_date, status from read_csv('${path.join(tmp, 'files.csv')}', header = true, all_varchar = true);
    insert into runs select date '${runDate}', '${chainId}', 'load', 'ok', ${priceFiles.length}, ${rowCount}, (select n from changed_count), timestamp '${started.replace('T', ' ').replace('Z', '')}', now(), null;
    commit;
    select (select n from changed_count) as changed;
  `;
  const result = duck(root, stagingSql + sql + finish, { json: true });
  const changed = Number(result?.[0]?.changed ?? 0);
  log(`${chainId.padEnd(12)} stores ${storeCount}, price files ${priceFiles.length} in ${byHash.size} content groups, rows ${rowCount}, price changes ${changed}`);
  return { stores: storeCount, files: priceFiles.length, groups: byHash.size, rows: rowCount, changed };
}

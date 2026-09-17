/**
 * Download the newest PriceFull (and PromoFull, Stores) of EVERY store of a retailer into the raw
 * archive, with content hashing so identical files (a chain publishing one price list under many
 * store ids) are stored and parsed once.
 *
 *   data/pipeline/raw/<chain>/<YYYY-MM-DD>/<name>         the bytes as downloaded (gz / zip / xml)
 *   data/pipeline/runs/<YYYY-MM-DD>/<chain>.json          manifest: every file listed, downloaded or skipped, sha1, bytes
 *
 * Idempotent: a file already present in today's manifest with a sha1 is not downloaded again.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fetchRetry, listRetailer } from './listing.mjs';

export const RAW = (root, chainId, date) => path.join(root, 'data', 'pipeline', 'raw', chainId, date);
export const MANIFEST = (root, chainId, date) => path.join(root, 'data', 'pipeline', 'runs', date, `${chainId}.json`);

export function readManifest(root, chainId, date) {
  const p = MANIFEST(root, chainId, date);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { chainId, date, files: {} };
}

async function pool(items, concurrency, worker) {
  const queue = [...items]; const results = [];
  await Promise.all(Array.from({ length: concurrency }, async () => { while (queue.length) { const item = queue.shift(); results.push(await worker(item)); } }));
  return results;
}

/** List + download. Returns the manifest. `kinds` limits what is downloaded (default PriceFull + Stores). */
export async function fetchRetailer({ root, chainId, src, date, kinds = ['PriceFull', 'Stores'], concurrency = 6, log = console.log }) {
  const started = Date.now();
  const listed = await listRetailer(src);
  const wanted = listed.filter((f) => kinds.includes(f.kind));
  const manifest = readManifest(root, chainId, date);
  manifest.listedAt = new Date().toISOString();
  manifest.listed = listed.length;
  const dir = RAW(root, chainId, date);
  mkdirSync(dir, { recursive: true });
  let downloaded = 0, skipped = 0, failed = 0, bytes = 0;
  await pool(wanted, concurrency, async (f) => {
    const prev = manifest.files[f.name];
    if (prev?.sha1 && existsSync(path.join(dir, f.name))) { skipped++; return; }
    try {
      const url = f.url ?? (f.resolve ? await f.resolve() : null);
      if (!url) throw new Error('no download url');
      const res = await fetchRetry(url, { headers: f.headers ?? {}, timeoutMs: 120000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const sha1 = createHash('sha1').update(buf).digest('hex');
      writeFileSync(path.join(dir, f.name), buf);
      manifest.files[f.name] = { kind: f.kind, storeId: f.storeId, sub: f.sub, ts: f.ts, sha1, bytes: buf.length, storeName: f.storeName ?? null, downloadedAt: new Date().toISOString() };
      downloaded++; bytes += buf.length;
    } catch (err) {
      failed++;
      manifest.files[f.name] = { kind: f.kind, storeId: f.storeId, sub: f.sub, ts: f.ts, error: err.message, at: new Date().toISOString() };
    }
  });
  manifest.summary = { listed: listed.length, wanted: wanted.length, downloaded, skipped, failed, bytes, durationMs: Date.now() - started, stores: new Set(wanted.filter((f) => f.kind === 'PriceFull').map((f) => f.storeId)).size };
  mkdirSync(path.dirname(MANIFEST(root, chainId, date)), { recursive: true });
  writeFileSync(MANIFEST(root, chainId, date), JSON.stringify(manifest, null, 1));
  log(`${chainId.padEnd(12)} listed ${listed.length}, PriceFull stores ${manifest.summary.stores}, downloaded ${downloaded} (${(bytes / 1e6).toFixed(1)} MB), skipped ${skipped}, failed ${failed}, ${Math.round((Date.now() - started) / 1000)}s`);
  return manifest;
}

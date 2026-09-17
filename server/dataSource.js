/**
 * The one place the server loads pipeline data from (docs/PIPELINE-CONTRACT.md §4.3.1).
 *
 *   disk  - `data/products.json`, `data/chains.json`, `data/catalogs/<chainId>.json` bundled with the
 *           deployment (today's mode: the pipeline commits, Vercel rebuilds).
 *   url   - the same files served from a CDN (planned R2 export, §4.2): fetched at startup and then
 *           at most once per `refreshIntervalMs`, conditionally by ETag. `chains.json` and the
 *           mapping overrides stay in the repo (they are edited by hand); every remote file falls
 *           back to the previous copy, and before that to the repo copy, so a CDN outage never
 *           removes a chain from the comparison.
 *
 * Nothing else in the server reads these files. `CatalogStore.onChange` is how the app learns
 * that a new snapshot is in and rebuilds its indexes.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { generateCatalog } from '../src/catalog/seedCatalogs.js';

const HOUR_MS = 60 * 60 * 1000;

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Cheap identity of a snapshot: changes whenever the product list or any catalog is rebuilt. */
export function snapshotFingerprint(snapshot) {
  const catalogs = Object.keys(snapshot.catalogs).sort()
    .map((id) => `${id}@${snapshot.catalogs[id].generatedAt ?? '?'}#${snapshot.catalogs[id].items?.length ?? 0}`);
  return `${snapshot.products.length}|${catalogs.join(',')}`;
}

export function createDiskSource({ dataDir, logger = console }) {
  return {
    kind: 'disk',
    dataDir,
    load() {
      const products = readJson(path.join(dataDir, 'products.json'));
      const chains = readJson(path.join(dataDir, 'chains.json'));
      const catalogsDir = path.join(dataDir, 'catalogs');
      const catalogs = {};
      for (const chain of chains) {
        const file = path.join(catalogsDir, `${chain.id}.json`);
        if (existsSync(file)) catalogs[chain.id] = readJson(file);
        else if (chain.id === 'demo') catalogs.demo = generateCatalog('demo', products.slice(0, 150));
        else logger.warn?.(`[data] no catalog for ${chain.id} - it is left out of the comparison until the pipeline publishes one`);
      }
      if (existsSync(catalogsDir)) {
        for (const file of readdirSync(catalogsDir)) {
          if (!file.endsWith('.json')) continue;
          const id = file.slice(0, -'.json'.length);
          if (!chains.some((c) => c.id === id)) logger.warn?.(`[data] catalogs/${file} has no entry in chains.json - ignored until the chain is registered`);
        }
      }
      const overridesFile = path.join(dataDir, 'mapping-overrides.json');
      const overrides = existsSync(overridesFile) ? readJson(overridesFile) : {};
      return { products, chains, catalogs, overrides, loadedAt: new Date().toISOString(), origin: { kind: 'disk', dataDir } };
    },
  };
}

/**
 * @param {object} options
 * @param {string} options.baseUrl  e.g. https://cdn.example/public - serves products.json and catalogs/<chainId>.json
 * @param {ReturnType<typeof createDiskSource>} options.fallback the repo copy (chains, overrides, and per-file fallback)
 */
export function createUrlSource({ baseUrl, fallback, fetch: fetchImpl = globalThis.fetch, logger = console, timeoutMs = 15_000 }) {
  const base = String(baseUrl).replace(/\/$/, '');
  let local = null;
  const repoCopy = () => (local ??= fallback.load());

  return {
    kind: 'url',
    baseUrl: base,
    /** @param {object|null} previous the snapshot currently in use (its ETags make the fetch conditional) */
    async load(previous = null) {
      const repo = repoCopy();
      const prev = previous?.origin?.kind === 'url' ? previous : null;
      const etags = prev?.origin?.etags ?? {};
      const nextEtags = {};
      const files = {};
      const errors = {};

      async function fetchJson(name, prevValue, repoValue) {
        const url = `${base}/${name}`;
        const headers = { Accept: 'application/json' };
        if (etags[name] && prevValue) headers['If-None-Match'] = etags[name];
        try {
          const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
          if (res.status === 304 && prevValue) {
            nextEtags[name] = etags[name];
            files[name] = 'unchanged';
            return prevValue;
          }
          if (res.status === 404) {
            files[name] = repoValue ? 'fallback' : 'absent';
            return repoValue ?? null;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const value = await res.json();
          const etag = res.headers.get('etag');
          if (etag) nextEtags[name] = etag;
          files[name] = 'fetched';
          return value;
        } catch (err) {
          errors[name] = err.message;
          files[name] = prevValue ? 'stale' : repoValue ? 'fallback' : 'absent';
          logger.warn?.(`[data] ${url}: ${err.message} - using the ${prevValue ? 'previous' : 'repo'} copy`);
          if (prevValue && etags[name]) nextEtags[name] = etags[name];
          return prevValue ?? repoValue ?? null;
        }
      }

      const products = await fetchJson('products.json', prev?.products, repo.products);
      const catalogs = {};
      await Promise.all(repo.chains.map(async (chain) => {
        if (chain.id === 'demo') { if (repo.catalogs.demo) catalogs.demo = repo.catalogs.demo; return; }
        const value = await fetchJson(`catalogs/${chain.id}.json`, prev?.catalogs?.[chain.id], repo.catalogs[chain.id]);
        if (value) catalogs[chain.id] = value;
      }));

      return {
        products,
        chains: repo.chains,
        catalogs,
        overrides: repo.overrides,
        loadedAt: new Date().toISOString(),
        origin: { kind: 'url', baseUrl: base, etags: nextEtags, files, errors },
      };
    },
  };
}

export class CatalogStore {
  /**
   * @param {object} options
   * @param {ReturnType<typeof createDiskSource>} options.disk loaded synchronously at construction
   * @param {ReturnType<typeof createUrlSource>|null} [options.remote] when set, refreshed in the background
   */
  constructor({ disk, remote = null, refreshIntervalMs = HOUR_MS, logger = console, now = () => Date.now() }) {
    this.disk = disk;
    this.remote = remote;
    this.refreshIntervalMs = refreshIntervalMs;
    this.logger = logger;
    this.now = now;
    this.snapshot = disk.load();
    this.fingerprint = snapshotFingerprint(this.snapshot);
    this.listeners = new Set();
    this.inFlight = null;
    this.lastAttemptAt = 0;
    this.lastRefreshAt = null;
    this.lastError = null;
    /** Resolves once the first remote load finished (or immediately in disk mode). Never rejects. */
    this.ready = remote ? this.refresh().then(() => undefined, () => undefined) : Promise.resolve();
  }

  get current() { return this.snapshot; }
  get kind() { return this.remote ? 'url' : 'disk'; }

  /** @param {(snapshot: object) => void} listener called after a refresh that changed the data */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  status() {
    return {
      source: this.kind,
      baseUrl: this.remote?.baseUrl ?? null,
      loadedAt: this.snapshot.loadedAt,
      loadedFrom: this.snapshot.origin.kind,
      files: this.snapshot.origin.files ?? null,
      errors: this.snapshot.origin.errors ?? null,
      lastRefreshAt: this.lastRefreshAt,
      lastError: this.lastError,
      refreshIntervalMs: this.refreshIntervalMs,
    };
  }

  /** Load a fresh snapshot now (remote when configured, otherwise re-read the disk). Deduplicates concurrent calls. */
  refresh() {
    if (this.inFlight) return this.inFlight;
    this.lastAttemptAt = this.now();
    this.inFlight = (async () => {
      try {
        const next = this.remote ? await this.remote.load(this.snapshot) : this.disk.load();
        const fingerprint = snapshotFingerprint(next);
        const changed = fingerprint !== this.fingerprint;
        this.snapshot = next;
        this.fingerprint = fingerprint;
        this.lastRefreshAt = new Date(this.now()).toISOString();
        this.lastError = null;
        if (changed) {
          this.logger.info?.(`[data] new snapshot from ${next.origin.kind}: ${next.products.length} products, ${Object.keys(next.catalogs).length} catalogs`);
          for (const listener of this.listeners) {
            try { listener(next); } catch (err) { this.logger.error?.(err); }
          }
        }
        return { changed, snapshot: next };
      } catch (err) {
        this.lastError = err.message;
        this.logger.warn?.(`[data] refresh failed: ${err.message}`);
        throw err;
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  /** Called per request: kicks off a background refresh when the last attempt is older than the interval. */
  maybeRefresh() {
    if (!this.remote || this.inFlight) return null;
    if (this.now() - this.lastAttemptAt < this.refreshIntervalMs) return null;
    return this.refresh().catch(() => null);
  }
}

export function createCatalogStore({ dataDir, catalogsUrl = null, fetch: fetchImpl, logger = console, refreshIntervalMs, now }) {
  const disk = createDiskSource({ dataDir, logger });
  const remote = catalogsUrl ? createUrlSource({ baseUrl: catalogsUrl, fallback: disk, fetch: fetchImpl, logger }) : null;
  return new CatalogStore({ disk, remote, refreshIntervalMs, logger, now });
}

#!/usr/bin/env node
/**
 * data/pipeline-status.json: per-chain status of the daily price fetch (scripts/fetch-prices.mjs),
 * so a chain whose portal is down does not silently vanish from the comparison (decision 22.9 -
 * docs/PLAN-PER-CHAIN-AND-PRICE-HISTORY.md, חלק א).
 *
 * Format (additive contract - see docs/PIPELINE-CONTRACT.md):
 *   { "runAt": "<ISO with Israel offset>",
 *     "chains": { "<chainId>": {
 *       "status": "ok" | "failed" | "missing",
 *       "sourceDate": "<ISO>|null",   // the chain's own catalog.sourceDate
 *       "fetchedAt": "<ISO>|null",    // when that catalog.full.json was produced
 *       "failedSince": "<ISO>|null",  // set on the first failure of a run, kept across retries
 *       "attempts": <int>,            // consecutive failed attempts (reset to 0 on "ok")
 *       "error": "<string>|null"
 *     } } }
 *
 * "failed": the portal did not answer, but data/prices/<chainId>/catalog.full.json from a previous
 *   run is still on disk - products:build keeps building that chain from it.
 * "missing": no catalog.full.json exists at all - the chain has never been built and is left out of
 *   the comparison.
 *
 * Consumers: scripts/fetch-prices.mjs (writer), scripts/build-products.mjs (reader, copies
 * fetchStatus/failedSince onto data/catalogs/<chain>.json - A2), scripts/daily-refresh.sh (reads the
 * summary via this file's CLI, see below).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The same Israel-offset math as scripts/fetch-prices.mjs's sourceDateFromName (which parses the
// offset out of a portal file name); here it is applied to a real UTC instant (the clock "now"),
// so DST handling is delegated to Intl instead of the file-name parsing trick.
export function jerusalemOffsetMinutes(utcMs) {
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'longOffset' })
    .formatToParts(new Date(utcMs)).find((p) => p.type === 'timeZoneName')?.value ?? '';
  const m = tz.match(/([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** ISO 8601 with the Asia/Jerusalem offset of the given instant (default: now). */
export function nowIsraelISO(date = new Date()) {
  const off = jerusalemOffsetMinutes(date.getTime());
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((o, p) => ((o[p.type] = p.value), o), {});
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

const EMPTY = () => ({ runAt: null, chains: {} });

/** Read data/pipeline-status.json; a missing or unparseable file reads as empty (never throws). */
export function readPipelineStatus(filePath) {
  if (!existsSync(filePath)) return EMPTY();
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return { runAt: parsed?.runAt ?? null, chains: { ...(parsed?.chains ?? {}) } };
  } catch {
    return EMPTY();
  }
}

/** Write atomically: temp file in the same directory, then rename (never leaves a half-written file). */
export function writePipelineStatus(filePath, status) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(status, null, 2)}\n`);
  renameSync(tmp, filePath);
}

/**
 * Merge one chain's fetch outcome into its previous status entry (pure function, unit-testable).
 *   outcome.status: 'ok' | 'failed' | 'missing'
 *   outcome.sourceDate: for 'ok', the new catalog's sourceDate
 *   outcome.error: for 'failed'/'missing', the error message
 *   outcome.catalogFallback: { sourceDate, fetchedAt } read from an on-disk catalog.full.json, used
 *     only when there is no previous status entry to fall back on (first time this chain is recorded).
 */
export function nextChainStatus({ previous = null, outcome, now = nowIsraelISO() }) {
  if (outcome.status === 'ok') {
    return { status: 'ok', sourceDate: outcome.sourceDate ?? null, fetchedAt: now, failedSince: null, attempts: 0, error: null };
  }
  const wasFailing = previous?.status === 'failed' || previous?.status === 'missing';
  const fallback = previous ?? outcome.catalogFallback ?? {};
  return {
    status: outcome.status, // 'failed' | 'missing'
    sourceDate: outcome.status === 'missing' ? null : (fallback.sourceDate ?? null),
    fetchedAt: outcome.status === 'missing' ? null : (fallback.fetchedAt ?? null),
    failedSince: wasFailing ? (previous.failedSince ?? now) : now,
    attempts: (previous?.attempts ?? 0) + 1,
    error: outcome.error ?? null,
  };
}

/**
 * Merge a batch of chain outcomes (only the chains this invocation processed) into
 * data/pipeline-status.json and write it back atomically. Returns the full merged status object.
 *   chainOutcomes: { [chainId]: outcome } - see nextChainStatus for the outcome shape.
 */
export function updatePipelineStatus(filePath, chainOutcomes, { now = nowIsraelISO() } = {}) {
  const current = readPipelineStatus(filePath);
  for (const [chainId, outcome] of Object.entries(chainOutcomes)) {
    current.chains[chainId] = nextChainStatus({ previous: current.chains[chainId] ?? null, outcome, now });
  }
  current.runAt = now;
  writePipelineStatus(filePath, current);
  return current;
}

// ---------------------------------------------------------------- CLI (used by scripts/daily-refresh.sh)
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, filePath, ...ids] = process.argv.slice(2);
  const usage = () => {
    console.error('usage: node scripts/lib/pipelineStatus.mjs <bad-chains|all-failed> <path> [chainId ...]');
    process.exit(2);
  };
  if (!cmd || !filePath) usage();
  const status = readPipelineStatus(filePath);
  const wanted = ids.length ? ids : Object.keys(status.chains);
  const entry = (id) => status.chains[id] ?? { status: 'missing', sourceDate: null, fetchedAt: null, failedSince: null, attempts: 0, error: 'not recorded in ' + filePath };
  const bad = wanted.filter((id) => entry(id).status !== 'ok');
  if (cmd === 'bad-chains') {
    // One line per non-ok chain: "<chainId> <status> <failedSince|-> <attempts>", for daily-refresh.sh
    // to log and to extract chain ids from (awk '{print $1}') when retrying.
    for (const id of bad) {
      const e = entry(id);
      console.log(`${id} ${e.status} ${e.failedSince ?? '-'} ${e.attempts ?? 0}`);
    }
    process.exit(0);
  } else if (cmd === 'all-failed') {
    // Exit 0 iff every requested chain (default: every chain on record) is failed/missing.
    process.exit(wanted.length > 0 && bad.length === wanted.length ? 0 : 1);
  } else {
    usage();
  }
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readPipelineStatus, writePipelineStatus, nextChainStatus, updatePipelineStatus, nowIsraelISO, jerusalemOffsetMinutes,
} from '../scripts/lib/pipelineStatus.mjs';

// All tests write to a fresh temp dir (never the repo's data/) and never touch the network.
function tmpStatusPath() {
  const dir = mkdtempSync(path.join(tmpdir(), 'pipeline-status-test-'));
  return path.join(dir, 'pipeline-status.json');
}

test('readPipelineStatus on a missing file returns an empty, well-shaped status', () => {
  const file = tmpStatusPath(); // created dir, but the file itself does not exist yet
  assert.deepEqual(readPipelineStatus(file), { runAt: null, chains: {} });
});

test('writePipelineStatus + readPipelineStatus round-trip, and never leaves a temp file behind', () => {
  const file = tmpStatusPath();
  const status = { runAt: '2026-09-23T05:58:12+03:00', chains: { shufersal: { status: 'ok', sourceDate: '2026-09-23T03:40:00+03:00', fetchedAt: '2026-09-23T05:56:10+03:00', failedSince: null, attempts: 0, error: null } } };
  writePipelineStatus(file, status);
  assert.deepEqual(readPipelineStatus(file), status);
  const leftovers = readdirSync(path.dirname(file)).filter((f) => f.includes('.tmp'));
  assert.deepEqual(leftovers, []);
});

test('readPipelineStatus on a corrupt file reads as empty instead of throwing', () => {
  const file = tmpStatusPath();
  writePipelineStatus(file, { runAt: null, chains: {} });
  // Overwrite with garbage the way a half-written file never would be (writePipelineStatus is atomic).
  writeFileSync(file, '{not json');
  assert.deepEqual(readPipelineStatus(file), { runAt: null, chains: {} });
});

test('nextChainStatus: ok resets failedSince and attempts', () => {
  const previous = { status: 'failed', sourceDate: '2026-09-21T05:18:49+03:00', fetchedAt: '2026-09-21T05:57:02+03:00', failedSince: '2026-09-22T05:55:00+03:00', attempts: 4, error: 'boom' };
  const next = nextChainStatus({ previous, outcome: { status: 'ok', sourceDate: '2026-09-23T05:20:00+03:00' }, now: '2026-09-23T05:58:00+03:00' });
  assert.deepEqual(next, { status: 'ok', sourceDate: '2026-09-23T05:20:00+03:00', fetchedAt: '2026-09-23T05:58:00+03:00', failedSince: null, attempts: 0, error: null });
});

test('nextChainStatus: failed after failed keeps the first failedSince and increments attempts', () => {
  const previous = { status: 'failed', sourceDate: '2026-09-21T05:18:49+03:00', fetchedAt: '2026-09-21T05:57:02+03:00', failedSince: '2026-09-22T05:55:00+03:00', attempts: 4, error: 'old error' };
  const next = nextChainStatus({ previous, outcome: { status: 'failed', error: 'laib: list returned 0 files' }, now: '2026-09-23T05:58:00+03:00' });
  assert.equal(next.status, 'failed');
  assert.equal(next.failedSince, '2026-09-22T05:55:00+03:00'); // unchanged - first failure, not this one
  assert.equal(next.attempts, 5);
  assert.equal(next.error, 'laib: list returned 0 files');
  assert.equal(next.sourceDate, '2026-09-21T05:18:49+03:00'); // last good catalog's date, kept
  assert.equal(next.fetchedAt, '2026-09-21T05:57:02+03:00');
});

test('nextChainStatus: first failure (previously ok) sets failedSince to now and attempts to 1', () => {
  const previous = { status: 'ok', sourceDate: '2026-09-22T05:20:00+03:00', fetchedAt: '2026-09-22T05:56:00+03:00', failedSince: null, attempts: 0, error: null };
  const next = nextChainStatus({ previous, outcome: { status: 'failed', error: 'HTTP 503' }, now: '2026-09-23T05:58:00+03:00' });
  assert.equal(next.failedSince, '2026-09-23T05:58:00+03:00');
  assert.equal(next.attempts, 1);
  assert.equal(next.sourceDate, '2026-09-22T05:20:00+03:00'); // kept from the previous ok entry
});

test('nextChainStatus: missing (no catalog on disk, never recorded before) has null dates', () => {
  const next = nextChainStatus({ previous: null, outcome: { status: 'missing', error: 'osherad: no PriceFull found for store null' }, now: '2026-09-23T05:58:00+03:00' });
  assert.deepEqual(next, { status: 'missing', sourceDate: null, fetchedAt: null, failedSince: '2026-09-23T05:58:00+03:00', attempts: 1, error: 'osherad: no PriceFull found for store null' });
});

test('nextChainStatus: failed with no previous entry falls back to the on-disk catalog dates', () => {
  const next = nextChainStatus({
    previous: null,
    outcome: { status: 'failed', error: 'timeout', catalogFallback: { sourceDate: '2026-09-20T04:00:00+03:00', fetchedAt: '2026-09-20T06:00:00+03:00' } },
    now: '2026-09-23T05:58:00+03:00',
  });
  assert.equal(next.sourceDate, '2026-09-20T04:00:00+03:00');
  assert.equal(next.fetchedAt, '2026-09-20T06:00:00+03:00');
  assert.equal(next.failedSince, '2026-09-23T05:58:00+03:00');
  assert.equal(next.attempts, 1);
});

test('updatePipelineStatus merges only the processed chains and leaves the others untouched', () => {
  const file = tmpStatusPath();
  writePipelineStatus(file, {
    runAt: '2026-09-22T05:58:00+03:00',
    chains: {
      shufersal: { status: 'ok', sourceDate: '2026-09-22T03:40:00+03:00', fetchedAt: '2026-09-22T05:56:00+03:00', failedSince: null, attempts: 0, error: null },
      victory: { status: 'failed', sourceDate: '2026-09-21T05:18:49+03:00', fetchedAt: '2026-09-21T05:57:02+03:00', failedSince: '2026-09-22T05:55:00+03:00', attempts: 4, error: 'laib: list returned 0 files' },
    },
  });

  // This run only re-processes victory (a targeted retry); shufersal must be left exactly as-is.
  const result = updatePipelineStatus(file, {
    victory: { status: 'ok', sourceDate: '2026-09-23T09:10:00+03:00' },
  }, { now: '2026-09-23T09:12:00+03:00' });

  assert.equal(result.runAt, '2026-09-23T09:12:00+03:00');
  assert.deepEqual(result.chains.shufersal, { status: 'ok', sourceDate: '2026-09-22T03:40:00+03:00', fetchedAt: '2026-09-22T05:56:00+03:00', failedSince: null, attempts: 0, error: null });
  assert.deepEqual(result.chains.victory, { status: 'ok', sourceDate: '2026-09-23T09:10:00+03:00', fetchedAt: '2026-09-23T09:12:00+03:00', failedSince: null, attempts: 0, error: null });

  // And it was actually persisted, not just returned in memory.
  assert.deepEqual(readPipelineStatus(file), result);
});

test('updatePipelineStatus: a fresh chain that fails on its very first run is "missing" if given no catalogFallback', () => {
  const file = tmpStatusPath();
  const result = updatePipelineStatus(file, {
    newchain: { status: 'missing', error: 'newchain: unknown chain' },
  }, { now: '2026-09-23T05:58:00+03:00' });
  assert.deepEqual(result.chains.newchain, { status: 'missing', sourceDate: null, fetchedAt: null, failedSince: '2026-09-23T05:58:00+03:00', attempts: 1, error: 'newchain: unknown chain' });
});

test('nowIsraelISO / jerusalemOffsetMinutes: summer +03:00, winter +02:00', () => {
  assert.equal(jerusalemOffsetMinutes(Date.UTC(2026, 8, 23, 3, 0, 0)), 180); // September - DST
  assert.equal(jerusalemOffsetMinutes(Date.UTC(2026, 11, 15, 3, 0, 0)), 120); // December - standard time
  const iso = nowIsraelISO(new Date(Date.UTC(2026, 8, 23, 2, 58, 12)));
  assert.equal(iso, '2026-09-23T05:58:12+03:00');
});

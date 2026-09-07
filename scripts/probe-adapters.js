#!/usr/bin/env node
/**
 * Resilience probe: checks that each chain's cart endpoints still answer.
 * Meant to run from a scheduler (cron / GitHub Action); exits non-zero when a chain looks broken.
 */
import { listAdapters, materializeAdapter } from '../src/handoff/adapters/index.js';
import { probeAdapter } from '../src/handoff/alerts.js';

const only = process.argv.slice(2);
const origin = process.env.ORIGIN ?? 'http://localhost:3000';
let failed = 0;
for (const adapter of listAdapters()) {
  if (only.length && !only.includes(adapter.chainId)) continue;
  const result = await probeAdapter(materializeAdapter(adapter, { origin }));
  const mark = result.ok ? 'OK ' : 'ERR';
  console.log(`${mark} ${adapter.chainId.padEnd(12)} ${result.checks.map((c) => `${c.name}=${c.status ?? c.error}`).join('  ')}`);
  if (!result.ok) failed++;
}
process.exit(failed ? 1 : 0);

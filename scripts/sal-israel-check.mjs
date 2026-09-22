#!/usr/bin/env node
/**
 * Acceptance check for "הסל של ישראל" (plan §3.5, docs/SAL-ISRAEL.md): does each chain's computed
 * total land where we expect - Carrefour near its ₪1,098 commitment, everyone else in the market band -
 * or is there an unexplained gap.
 *
 *   node scripts/sal-israel-check.mjs
 *
 * Reads data/sal-israel.json (the last computed run - scripts/sal-israel.mjs) and
 * config.acceptance (config/sal-israel.json): { tolerance, chains: { <chainId>: {min?, max?} },
 * explanations: { <chainId>: "why the gap is expected" } }.
 *
 * Prints chain / total / gap for every acceptance-configured chain, and exits 1 if any chain is outside
 * its band by more than `tolerance` (as a fraction of the band edge) AND has no matching entry in
 * config.acceptance.explanations. Not run automatically anywhere (plan §3.5: there is no production
 * data yet to check against) - a manual tool for whoever reviews a sal-israel.json.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSalIsraelConfig } from '../src/basket/salIsraelConfig.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'data', 'sal-israel.json');
const CONFIG_FILE = path.join(ROOT, 'config', 'sal-israel.json');

/**
 * Pure check: given the computed ranking and the acceptance config, returns
 * [{ chainId, total, band: {min,max}|null, gap, withinTolerance, explained }].
 * `gap` is how far outside the band the total is, as a fraction of the nearest edge (0 = inside).
 */
export function checkAcceptance({ ranking, excluded = [], acceptance }) {
  const { tolerance = 0.05, chains = {}, explanations = {} } = acceptance ?? {};
  const totals = new Map([...ranking, ...excluded.map((e) => ({ ...e, total: null }))].map((r) => [r.chainId, r.total]));
  const rows = [];
  for (const [chainId, band] of Object.entries(chains)) {
    const total = totals.has(chainId) ? totals.get(chainId) : null;
    if (total == null) {
      rows.push({ chainId, total: null, band, gap: null, withinTolerance: false, explained: !!explanations[chainId] });
      continue;
    }
    let gap = 0;
    if (band.max != null && total > band.max) gap = (total - band.max) / band.max;
    else if (band.min != null && total < band.min) gap = (band.min - total) / band.min;
    const withinTolerance = gap <= tolerance;
    rows.push({ chainId, total, band, gap, withinTolerance, explained: !!explanations[chainId] });
  }
  return rows;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let data, config;
  try {
    data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error(`sal-israel-check: could not read ${DATA_FILE} (${err.code ?? err.message}) - run scripts/sal-israel.mjs first`);
    process.exit(1);
  }
  config = loadSalIsraelConfig(CONFIG_FILE);
  if (!config.acceptance) {
    console.error('sal-israel-check: config/sal-israel.json has no "acceptance" block');
    process.exit(1);
  }

  const rows = checkAcceptance({ ranking: data.ranking ?? [], excluded: data.excluded ?? [], acceptance: config.acceptance });
  console.log('chain          total       band            gap');
  let unexplainedFail = false;
  for (const r of rows) {
    const band = r.band.min != null && r.band.max != null ? `${r.band.min}-${r.band.max}` : r.band.max != null ? `<=${r.band.max}` : `>=${r.band.min}`;
    const totalStr = r.total == null ? '(excluded)' : r.total.toFixed(2);
    const gapStr = r.total == null ? '-' : `${(r.gap * 100).toFixed(1)}%`;
    const status = r.total == null || !r.withinTolerance ? (r.explained ? 'explained' : 'FAIL') : 'ok';
    console.log(`${r.chainId.padEnd(14)} ${totalStr.padStart(10)}  ${band.padEnd(15)} ${gapStr.padStart(6)}  ${status}`);
    if ((r.total == null || !r.withinTolerance) && !r.explained) unexplainedFail = true;
  }
  if (unexplainedFail) {
    console.error('\nsal-israel-check: unexplained gap(s) above tolerance - add a note to config.acceptance.explanations or fix the data');
    process.exit(1);
  }
  console.log('\nsal-israel-check: all chains within tolerance or explained');
}
